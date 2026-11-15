import fs from "node:fs";
import { branches, conditions, config, digest, parseFile, projectPath, relays } from "./design.mjs";

function readDir(prefix, predicate) {
  return fs.readdirSync(projectPath(prefix)).filter(predicate).sort()
    .map(name => projectPath(prefix + "/" + name));
}
function summarize(records) {
  const usages = records.flatMap(row => row.response?.usage ? [row.response.usage] : []);
  const prompt = usages.reduce((total, usage) => total + usage.prompt_tokens, 0);
  const completion = usages.reduce((total, usage) => total + usage.completion_tokens, 0);
  return {
    records: records.length,
    valid: records.filter(row => row.parsed !== null && row.parsed !== undefined).length,
    providerResponsesWithUsage: usages.length,
    promptTokens: prompt,
    completionTokens: completion,
    maxRequestBytes: Math.max(0, ...records.map(row => row.request ? Buffer.byteLength(JSON.stringify(row.request)) : 0)),
    estimatedUsd: Number(((prompt * config.inputUsdPerMillion + completion * config.outputUsdPerMillion) / 1e6).toFixed(10)),
  };
}

const rawFiles = readDir("evidence/raw", name => name.endsWith(".json"));
const smokeFiles = readDir("evidence/smoke", name => /^S01-.*\.json$/.test(name));
const decode = files => files.map(name => JSON.parse(fs.readFileSync(name, "utf8")));
const primary = decode(rawFiles);
const smoke = decode(smokeFiles);
const endpoint = { response: parseFile("evidence/smoke/endpoint_check.json") };
const expectedIds = new Set();
for (const { id } of parseFile("data/cases.json")) {
  expectedIds.add(id + "-A-shared-initial");
  for (const variant of relays) expectedIds.add(id + "-" + variant + "-shared-relay");
  for (const variant of conditions) {
    for (const branch of branches) expectedIds.add(id + "-" + variant + "-" + branch + "-final");
  }
}

const recordId = row => [row.task, row.condition, row.branch, row.stage].join("-");
const extra = [];
for (const record of primary) {
  if (!expectedIds.delete(recordId(record))) extra.push(recordId(record));
}
const errors = primary.filter(row => row.error).map(row => ({ run: recordId(row), error: row.error }));
const readAttemptLog = prefix => fs.readFileSync(projectPath(prefix + "/attempts.jsonl"), "utf8")
  .trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const mainAttempts = readAttemptLog("evidence/raw");
const smokeAttempts = readAttemptLog("evidence/smoke");
const countAttempts = rows => rows.filter(row => row.event === "attempt").length;
const responseCounts = rows => Object.groupBy(rows.filter(row => row.event === "http"), row => row.status);
const statusCounts = rows => Object.fromEntries(Object.entries(responseCounts(rows)).map(([status, results]) => [status, results.length]));

const metrics = {
  model: config.model,
  allSpendEstimatedUsd: summarize([...primary, ...smoke, endpoint]).estimatedUsd,
  main: {
    ...summarize(primary),
    plannedCalls: 384,
    attempts: countAttempts(mainAttempts),
    httpStatuses: statusCounts(mainAttempts),
    errors,
    missing: [...expectedIds],
    unexpected: extra,
    byStage: Object.fromEntries(["initial", "relay", "final"].map(stage =>
      [stage, summarize(primary.filter(row => row.stage === stage))])),
    byFinalCondition: Object.fromEntries(conditions.map(condition =>
      [condition, summarize(primary.filter(row => row.stage === "final" && row.condition === condition))])),
    byRelayCondition: Object.fromEntries(relays.map(condition =>
      [condition, summarize(primary.filter(row => row.stage === "relay" && row.condition === condition))])),
  },
  smoke: { ...summarize(smoke), attempts: countAttempts(smokeAttempts), httpStatuses: statusCounts(smokeAttempts) },
  endpointProbe: { attempts: 1, httpStatuses: { 200: 1 }, usage: endpoint.response.usage },
};
const format = value => JSON.stringify(value, null, 2) + "\n";
const checksumTargets = ["evidence/freeze_manifest.json", "evidence/smoke/endpoint_check.json",
  "evidence/smoke/attempts.jsonl", "evidence/raw/attempts.jsonl",
  ...smokeFiles.map(name => "evidence/smoke/" + name.split(/[\\/]/).at(-1)),
  ...rawFiles.map(name => "evidence/raw/" + name.split(/[\\/]/).at(-1))];
const checksums = checksumTargets.map(name => digest(fs.readFileSync(projectPath(name))) + "  " + name).join("\n") + "\n";
if (process.argv.includes("--write")) {
  fs.writeFileSync(projectPath("evidence/run_summary.json"), format(metrics));
  fs.writeFileSync(projectPath("evidence/raw_sha256.txt"), checksums);
}
process.stdout.write(format(metrics));

