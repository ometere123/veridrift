import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(readFileSync(join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const formatEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const expected = read('prompts/config.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const freeze = read('evidence/freeze_manifest.json');
const cases = new Map(read('data/cases.json').map(item => [item.id, item]));
const rawDirectory = join(root, 'evidence', 'raw');
const rawFiles = existsSync(rawDirectory) ? readdirSync(rawDirectory).filter(name => name.endsWith('.json')).sort() : [];
const records = new Map(rawFiles.map(name => [name.slice(0, -5), read('evidence/raw/' + name)]));
const issues = [];
for (const [file, expectedHash] of Object.entries(freeze.files)) {
  if (hash(readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n')) !== expectedHash) {
    issues.push([file, 'file digest differs from freeze manifest']);
  }
}
const observedModels = new Set();
const completionIds = new Set();
const tokenGroups = new Map();
const emptyUsage = () => ({
  records: 0, deliveredResponses: 0, responsesWithUsage: 0, promptTokens: 0, cachedPromptTokens: 0,
  completionTokens: 0, systemCharacters: 0, userCharacters: 0, handoffCharacters: 0, finishReasons: {}
});

function check(condition, key, message) {
  if (!condition) issues.push([key, message]);
}

function tokenUsage(record, stats) {
  stats.records++;
  const output = record.response?.choices?.[0];
  if (output) {
    stats.deliveredResponses++;
    const finish = output.finish_reason ?? 'missing';
    stats.finishReasons[finish] = (stats.finishReasons[finish] ?? 0) + 1;
  }
  const usage = record.response?.usage;
  if (!usage) return;
  stats.responsesWithUsage++;
  stats.promptTokens += usage.prompt_tokens;
  stats.cachedPromptTokens += usage.prompt_tokens_details?.cached_tokens ?? 0;
  stats.completionTokens += usage.completion_tokens;
}

for (const [key, record] of records) {
  const { task, condition, branch, stage, request, response } = record;
  const item = cases.get(task);
  check(item, key, 'task unavailable in benchmark');
  if (!item) continue;
  const group = condition + '-' + stage;
  const stats = tokenGroups.get(group) ?? emptyUsage();
  tokenGroups.set(group, stats);
  tokenUsage(record, stats);
  if (response?.model) {
    observedModels.add(response.model);
    check(response.model === expected.model, key, 'provider model differs from pinned snapshot');
  }
  if (response?.id) {
    check(!completionIds.has(response.id), key, 'provider completion ID reused across records');
    completionIds.add(response.id);
  }
  if (record.responseText && response) {
    try {
      check(formatEqual(JSON.parse(record.responseText), response), key, 'response object differs from raw wire body');
    } catch {
      check(false, key, 'response object exists with invalid raw wire body');
    }
  }
  if (!request) {
    check(!record.content, key, 'saved model content lacks request');
    continue;
  }
  check(hash(JSON.stringify(request)) === record.requestSha256, key, 'request hash mismatch');
  for (const field of ['model', 'temperature', 'seed', 'max_completion_tokens']) {
    check(request[field] === expected[field], key, 'setting mismatch: ' + field);
  }
  check(request.store === false, key, 'request store flag is not false');
  const messages = request.messages ?? [];
  const systemMessage = messages.find(m => m.role === 'system');
  const userMessage = messages.find(m => m.role === 'user');
  check(messages.length === 2 && typeof systemMessage?.content === 'string' && typeof userMessage?.content === 'string',
    key, 'unexpected message envelope');
  if (typeof userMessage?.content !== 'string') continue;
  stats.systemCharacters += systemMessage?.content?.length ?? 0;
  stats.userCharacters += userMessage.content.length;
  let payload;
  try {
    payload = JSON.parse(userMessage.content);
  } catch {
    check(false, key, 'user message is not a structured evidence packet');
    continue;
  }
  for (const field of ['scenario', 'question', 'claims']) {
    check(formatEqual(payload[field], item[field]), key, 'payload differs from benchmark: ' + field);
  }
  const loadPrompt = name => readFileSync(join(root, 'prompts', name + '.txt'), 'utf8').trim();
  let expectedSystemMessage = stage === 'relay' ? loadPrompt('relay_' + condition) : loadPrompt('evaluate');
  if (stage === 'initial') expectedSystemMessage += '\n\nPrepare the first assessment of the original records for a possible handoff.';
  if (stage === 'final' && condition === 'D') expectedSystemMessage += '\n\n' + loadPrompt('recipient_D');
  check(systemMessage?.content === expectedSystemMessage, key, 'system message differs from frozen prompt');
  check(stage === 'relay' && condition === 'B' ? !request.response_format
    : request.response_format?.type === 'json_schema' && request.response_format.json_schema?.strict === true,
    key, 'unexpected structured output settings');
  const expectedFields = ['scenario', 'question', 'claims'];
  if (stage !== 'final' || condition === 'A') {
    expectedFields.push('sources');
    check(formatEqual(payload.sources, item.sources), key, 'original evidence differs from benchmark');
  }
  if (stage === 'relay') {
    expectedFields.push('prior_assessment');
    const prior = records.get(task + '-A-shared-initial');
    if (prior?.parsed) check(formatEqual(payload.prior_assessment, prior.parsed), key, 'relay prior differs from shared initial');
  }
  if (stage === 'final') {
    expectedFields.push('follow_up');
    check(formatEqual(payload.follow_up, item.updates[branch] ?? {}), key, 'unexpected follow-up');
    if (condition !== 'A') {
      expectedFields.push('handoff');
      const relay = records.get(task + '-' + condition + '-shared-relay');
      const expectedForms = [relay?.content, relay?.parsed].filter(value => value !== null && value !== undefined);
      check(expectedForms.some(form => formatEqual(payload.handoff, form)), key, 'final handoff differs from relay output');
      stats.handoffCharacters += (typeof payload.handoff === 'string'
        ? payload.handoff : JSON.stringify(payload.handoff) ?? '').length;
    }
  }
  check(formatEqual(Object.keys(payload).sort(), expectedFields.sort()), key, 'unexpected or missing payload fields');
}

const groups = Object.fromEntries([...tokenGroups.entries()].sort());
const totalUsage = emptyUsage();
for (const stats of Object.values(groups)) {
  for (const key of Object.keys(totalUsage).filter(k => k !== 'finishReasons')) totalUsage[key] += stats[key];
  for (const [reason, count] of Object.entries(stats.finishReasons)) {
    totalUsage.finishReasons[reason] = (totalUsage.finishReasons[reason] ?? 0) + count;
  }
}
const estimate = stats => (0.40 * (stats.promptTokens - stats.cachedPromptTokens)
  + 0.10 * stats.cachedPromptTokens + 1.60 * stats.completionTokens) / 1_000_000;
const smokeDirectory = join(root, 'evidence', 'smoke');
const smokeUsage = emptyUsage();
if (existsSync(smokeDirectory)) {
  for (const file of readdirSync(smokeDirectory).filter(name => name.endsWith('.json'))) {
    const record = read('evidence/smoke/' + file);
    tokenUsage(file === 'endpoint_check.json' ? { response: record } : record, smokeUsage);
  }
}
const attemptStats = {};
for (const mode of ['smoke', 'raw']) {
  const log = join(root, 'evidence', mode, 'attempts.jsonl');
  if (!existsSync(log)) continue;
  const lines = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  const events = lines.map(line => JSON.parse(line));
  const counts = {};
  const responses = {};
  for (const event of events) {
    counts[event.event] = (counts[event.event] ?? 0) + 1;
    if (event.event === 'http') responses[event.status] = (responses[event.status] ?? 0) + 1;
    if (mode === 'raw' && event.event === 'attempt') {
      check(Date.parse(event.at) >= Date.parse(freeze.frozenAt), event.run, 'main attempt timestamp precedes freeze');
    }
    if (mode === 'raw' && event.event === 'attempt' && records.has(event.run)) {
      check(event.requestSha256 === records.get(event.run).requestSha256, event.run, 'attempt hash differs from checkpoint');
    }
  }
  attemptStats[mode] = { events: counts, httpStates: responses, logSha256: hash(readFileSync(log)) };
}
const summary = {
  snapshotIds: [...observedModels].sort(), uniqueProviderCompletionIds: completionIds.size,
  main: { ...totalUsage, estimatedUsd: estimate(totalUsage),
    undiscountedUsd: (0.40 * totalUsage.promptTokens + 1.60 * totalUsage.completionTokens) / 1_000_000 },
  perConditionStage: groups,
  smokeAndEndpoint: { ...smokeUsage, estimatedUsd: estimate(smokeUsage) },
  allLoggedUsageEstimatedUsd: estimate(totalUsage) + estimate(smokeUsage),
  attemptStats,
  rateSource: 'https://developers.openai.com/api/docs/models/gpt-4.1-mini',
  issues
};
mkdirSync(join(root, 'evidence', 'verification'), { recursive: true });
writeFileSync(join(root, 'evidence', 'verification', 'request_audit.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ auditedRecords: records.size, totalUsage: summary.main, issueCount: issues.length,
  firstIssues: issues.slice(0, 12) }, null, 2));
if (issues.length) process.exitCode = 1;





