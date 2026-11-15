import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONDITIONS = ['A', 'B', 'C', 'D'];
export const BRANCHES = ['none', 'support', 'retract'];
const CLAIMS = ['A', 'B', 'C'];
const STATUSES = ['supported', 'unresolved', 'contradicted'];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDirectory = join(root, 'evidence', 'raw');
const verifyDirectory = join(root, 'evidence', 'verification');
const readJSON = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function assert(value, message) {
  if (!value) throw new Error(message);
}

function keysMatch(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

// JSON.parse checks grammar. A lexical pass enforces unique decoded keys within every object.
function decodeJSON(content) {
  const decoded = JSON.parse(content);
  const tokens = content.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^"{}\[\]:,\s]+/gs) ?? [];
  const scopes = [];
  for (const [index, token] of tokens.entries()) {
    if (token === '{') scopes.push(new Set());
    else if (token === '[') scopes.push(null);
    else if (token === '}' || token === ']') scopes.pop();
    else if (token.startsWith('"') && tokens[index + 1] === ':') {
      const scope = scopes.at(-1);
      const key = JSON.parse(token);
      assert(scope && !scope.has(key), 'duplicate JSON object key');
      scope.add(key);
    }
  }
  return decoded;
}

export function decodeClaims(content, withConfidence = true) {
  const value = decodeJSON(content.trim());
  assert(keysMatch(value, ['claims', 'note']) && typeof value.note === 'string', 'invalid response envelope');
  assert(keysMatch(value.claims, CLAIMS), 'invalid claim keys');
  for (const claim of Object.values(value.claims)) {
    const fields = withConfidence ? ['status', 'confidence', 'citations'] : ['status', 'citations'];
    assert(keysMatch(claim, fields), 'invalid claim envelope');
    assert(STATUSES.includes(claim.status), 'invalid claim status');
    if (withConfidence) {
      assert(Number.isInteger(claim.confidence) && claim.confidence >= 0 && claim.confidence <= 100, 'invalid confidence');
    }
    assert(Array.isArray(claim.citations) && claim.citations.every(id => typeof id === 'string' && id.trim() !== ''),
      'invalid citation list');
    assert(new Set(claim.citations).size === claim.citations.length, 'repeated citation identifier');
  }
  return value;
}

function sameData(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  return Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every(key => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}

function checkCases(cases) {
  assert(Array.isArray(cases) && cases.length > 0, 'empty benchmark');
  const seen = new Set();
  for (const item of cases) {
    assert(/^[A-Za-z0-9_-]+$/.test(item.id) && !seen.has(item.id), 'invalid or duplicate task identifier');
    seen.add(item.id);
    assert(keysMatch(item.claims, CLAIMS) && CLAIMS.every(key => typeof item.claims[key] === 'string'), 'invalid claim inventory');
    assert(CLAIMS.includes(item.target), 'unknown target');
    assert(keysMatch(item.rubric, BRANCHES), 'invalid branches');
    for (const branch of BRANCHES) {
      assert(keysMatch(item.rubric[branch], CLAIMS), 'invalid branch rubric');
      const sourceIds = new Set([...Object.keys(item.sources), ...Object.keys(item.updates[branch] ?? {})]);
      for (const { status, citations } of Object.values(item.rubric[branch])) {
        assert(STATUSES.includes(status) && Array.isArray(citations), 'invalid rubric entry');
        assert(citations.length === (status === 'unresolved' ? 0 : 1) && citations.every(id => sourceIds.has(id)),
          'noncanonical rubric citation');
      }
    }
    assert(item.rubric.none[item.target].status === 'unresolved', 'target already resolved at baseline');
    assert(item.rubric.support[item.target].status === 'supported', 'support branch polarity mismatch');
    assert(item.rubric.retract[item.target].status === 'contradicted', 'retract branch polarity mismatch');
    for (const branch of ['support', 'retract']) {
      const newIds = Object.keys(item.updates[branch]);
      assert(newIds.length === 1 && newIds.every(id => !Object.hasOwn(item.sources, id)), 'invalid update source IDs');
      assert(item.rubric[branch][item.target].citations[0] === newIds[0], 'target update lacks decisive new evidence');
      for (const key of CLAIMS.filter(key => key !== item.target)) {
        assert(sameData(item.rubric.none[key], item.rubric[branch][key]), 'update changes a non-target reference');
      }
    }
    assert(Object.values(item.rubric.none).map(x => x.status).sort().join(',') === STATUSES.slice().sort().join(','),
      'expected one baseline claim of each status');
  }
}

function filename(task, condition, branch, stage) {
  return [task, condition, branch, stage].join('-') + '.json';
}

function readRecord(task, condition, branch, stage, issues, artifactHashes) {
  const file = filename(task, condition, branch, stage);
  const path = join(rawDirectory, file);
  if (!existsSync(path)) return { state: 'missing' };
  artifactHashes[file] = sha256(readFileSync(path));
  let record;
  try {
    record = readJSON(path);
  } catch (error) {
    issues.push([file, 'invalid stored JSON', error.message]);
    return { state: 'invalid_record' };
  }
  if (record?.task !== task || record?.condition !== condition || record?.branch !== branch || record?.stage !== stage) {
    issues.push([file, 'identity mismatch']);
    return { state: 'invalid_record' };
  }
  const { response, content } = record;
  const providerContent = response?.choices?.[0]?.message?.content;
  if (typeof providerContent === 'string' && providerContent !== content) {
    issues.push([file, 'stored content differs from provider response']);
    return { state: 'invalid_record' };
  }
  if (typeof content !== 'string' || !content.trim()) {
    return { state: 'no_content', record };
  }
  if (response?.choices?.[0]?.finish_reason !== 'stop') return { state: 'incomplete_output', record };
  let parsed;
  try {
    if (stage === 'relay' && condition === 'B') {
      assert(!content.trim().startsWith('{') && !content.includes(String.fromCharCode(96).repeat(3)), 'invalid prose relay');
      parsed = content;
    } else {
      parsed = decodeClaims(content, stage !== 'relay' || condition === 'D');
    }
  } catch (error) {
    if (record.parsed) issues.push([file, 'runner passed schema but independent decoder failed', error.message]);
    return { state: 'invalid_schema', record, detail: error.message };
  }
  if (!sameData(record.parsed, parsed)) {
    issues.push([file, 'independent decode differs from runner parse']);
    return { state: 'invalid_record', record };
  }
  return { state: 'valid', record, claims: parsed.claims };
}

function fraction(numerator, denominator) {
  return { numerator, denominator, rate: denominator ? numerator / denominator : null };
}

function bucket(states) {
  return Object.fromEntries(['missing', 'no_content', 'invalid_schema', 'invalid_record', 'incomplete_output', 'valid']
    .map(state => [state, states.filter(item => item.state === state).length]));
}

export function unsupportedCertainty(answer, reference) {
  return reference.status !== 'supported' && answer.status === 'supported' && answer.confidence > 80;
}

function verdictAndSource(answer, reference) {
  return answer.status === reference.status && answer.citations.length === reference.citations.length
    && answer.citations.every(id => reference.citations.includes(id));
}

function descriptive(cases, data, condition, branch) {
  const valid = cases.filter(item => data.final[item.id][condition][branch].state === 'valid');
  const slots = valid.flatMap(item => CLAIMS.map(key => ({
    answer: data.final[item.id][condition][branch].claims[key], reference: item.rubric[branch][key]
  })));
  const atRisk = slots.filter(row => row.reference.status !== 'supported');
  const unresolved = slots.filter(row => row.reference.status === 'unresolved');
  const contradicted = slots.filter(row => row.reference.status === 'contradicted');
  const determinate = slots.filter(row => row.reference.status !== 'unresolved');
  const events = atRisk.filter(row => unsupportedCertainty(row.answer, row.reference)).length;
  const planned = cases.reduce((sum, item) => sum + CLAIMS.filter(key => item.rubric[branch][key].status !== 'supported').length, 0);
  return {
    states: bucket(cases.map(item => data.final[item.id][condition][branch])),
    unsupportedCertainty: fraction(events, atRisk.length),
    unresolvedCertainty: fraction(unresolved.filter(row => unsupportedCertainty(row.answer, row.reference)).length, unresolved.length),
    contradictedCertainty: fraction(contradicted.filter(row => unsupportedCertainty(row.answer, row.reference)).length, contradicted.length),
    highTruthConfidence: fraction(atRisk.filter(row => row.answer.confidence > 80).length, atRisk.length),
    unsupportedAssertion: fraction(atRisk.filter(row => row.answer.status === 'supported').length, atRisk.length),
    plannedAtRiskSlots: planned,
    unsupportedCertaintyMissingnessBounds: [events / planned, (events + planned - atRisk.length) / planned],
    verdictAccuracy: fraction(slots.filter(row => row.answer.status === row.reference.status).length, slots.length),
    unresolvedSensitivity: fraction(unresolved.filter(row => row.answer.status === 'unresolved').length, unresolved.length),
    determinateAbstentions: fraction(determinate.filter(row => row.answer.status === 'unresolved').length, determinate.length),
    strictEvidenceFidelity: fraction(determinate.filter(row => verdictAndSource(row.answer, row.reference)).length, determinate.length),
    decisiveCitationPrecision: fraction(
      slots.reduce((sum, row) => sum + (row.answer.status === row.reference.status
        ? row.answer.citations.filter(id => row.reference.citations.includes(id)).length : 0), 0),
      slots.reduce((sum, row) => sum + row.answer.citations.length, 0)
    )
  };
}

function getTaskRate(item, data, condition) {
  const final = data.final[item.id][condition].none;
  if (final.state !== 'valid') return null;
  const keys = CLAIMS.filter(key => item.rubric.none[key].status !== 'supported');
  return mean(keys.map(key => Number(unsupportedCertainty(final.claims[key], item.rubric.none[key]))));
}

export function pairedBootstrap(differences, planned) {
  const n = differences.length;
  const estimate = mean(differences);
  let interval95 = null;
  if (n >= 8) {
    let seed = 20261116;
    function random() {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    }
    const draws = Array.from({ length: 10000 }, () => {
      let sum = 0;
      for (let slot = 0; slot < n; slot++) sum += differences[Math.floor(random() * n)];
      return sum / n;
    }).sort((a, b) => a - b);
    interval95 = [draws[249], draws[9749]];
  }
  return { estimate, interval95, completePairs: n, pairsUnavailable: planned - n,
    distinctObservedDifferences: new Set(differences).size };
}

function paired(cases, left, right) {
  const differences = [];
  for (const item of cases) {
    const a = left(item), b = right(item);
    if (a !== null && b !== null) differences.push(a - b);
  }
  return pairedBootstrap(differences, cases.length);
}

function amplificationForTask(item, data, condition, status = null) {
  const baseline = data.initial[item.id];
  const final = data.final[item.id][condition].none;
  if (baseline.state !== 'valid' || final.state !== 'valid') return [];
  return CLAIMS.filter(key => status
    ? item.rubric.none[key].status === status : item.rubric.none[key].status !== 'supported')
    .map(key => final.claims[key].confidence - baseline.claims[key].confidence);
}

function amplification(cases, data, condition, status = null) {
  const byTask = cases.map(item => amplificationForTask(item, data, condition, status)).filter(values => values.length);
  const changes = byTask.flat();
  return { meanPoints: mean(byTask.map(mean)), validTaskPairs: byTask.length,
    increases: fraction(changes.filter(change => change > 0).length, changes.length),
    decreases: fraction(changes.filter(change => change < 0).length, changes.length) };
}

function revision(cases, data, condition, branch) {
  let exact = 0, branchValid = 0, eligible = 0, revised = 0, priorEndorsements = 0, retracted = 0;
  const differences = [];
  for (const item of cases) {
    const key = item.target;
    const baseline = data.final[item.id][condition].none;
    const updated = data.final[item.id][condition][branch];
    if (updated.state !== 'valid') continue;
    branchValid++;
    const final = updated.claims[key];
    const correct = verdictAndSource(final, item.rubric[branch][key]);
    exact += Number(correct);
    if (branch === 'retract' && condition !== 'A' && data.initial[item.id].claims?.[key].status === 'supported') {
      priorEndorsements++;
      retracted += Number(correct);
    }
    if (baseline.state !== 'valid') continue;
    const prior = baseline.claims[key];
    const direction = branch === 'support' ? 1 : -1;
    const signed = direction * (final.confidence - prior.confidence);
    differences.push(signed);
    if (prior.status !== 'unresolved') continue;
    eligible++;
    revised += Number(correct && signed > 0);
  }
  return {
    strictPostUpdateFidelity: fraction(exact, branchValid),
    strictRevisionAmongPreviouslyUnresolved: fraction(revised, eligible),
    meanSignedConfidenceChange: mean(differences),
    pairedConfidenceCount: differences.length,
    retractionOfInitialEndorsement: branch === 'retract' && condition !== 'A'
      ? fraction(retracted, priorEndorsements) : null
  };
}

function postUpdateForTask(item, data, condition, branch) {
  const final = data.final[item.id][condition][branch];
  if (final.state !== 'valid') return null;
  return Number(verdictAndSource(final.claims[item.target], item.rubric[branch][item.target]));
}

function selectExamples(cases, data, condition) {
  const examples = {};
  for (const item of cases) {
    const noNew = data.final[item.id][condition].none;
    if (noNew.state !== 'valid') continue;
    const capture = (key, branch) => ({
      id: item.id, domain: item.domain, claimId: key, claim: item.claims[key],
      reference: item.rubric[branch][key], prior: noNew.claims[key],
      final: data.final[item.id][condition][branch].claims[key],
      sources: { ...item.sources, ...item.updates[branch] },
      rawFile: filename(item.id, condition, branch, 'final')
    });
    for (const key of CLAIMS) {
      if (unsupportedCertainty(noNew.claims[key], item.rubric.none[key])) {
        const category = item.rubric.none[key].status + 'Certainty';
        examples[category] ??= capture(key, 'none');
      }
    }
    for (const branch of ['support', 'retract']) {
      const updated = data.final[item.id][condition][branch];
      if (updated.state !== 'valid') continue;
      const key = item.target;
      const answer = updated.claims[key], previous = noNew.claims[key];
      const up = branch === 'support' ? answer.confidence > previous.confidence : answer.confidence < previous.confidence;
      const correct = verdictAndSource(answer, item.rubric[branch][key]);
      if (!correct) examples[branch + 'IncorrectOutcome'] ??= capture(key, branch);
      if (correct && up && previous.status === 'unresolved') examples[branch + 'CorrectRevision'] ??= capture(key, branch);
    }
  }
  return examples;
}

export function independentlyVerify() {
  const dataFile = join(root, 'data', 'cases.json');
  const cases = readJSON(dataFile).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  checkCases(cases);
  const issues = [];
  const hashes = {};
  const final = {}, initial = {}, relays = {};
  const expectedRawNames = new Set();
  function read(task, condition, branch, stage) {
    expectedRawNames.add(filename(task, condition, branch, stage));
    return readRecord(task, condition, branch, stage, issues, hashes);
  }
  for (const { id } of cases) {
    initial[id] = read(id, 'A', 'shared', 'initial');
    relays[id] = Object.fromEntries(CONDITIONS.slice(1).map(c => [c, read(id, c, 'shared', 'relay')]));
    final[id] = Object.fromEntries(CONDITIONS.map(c => [
      c, Object.fromEntries(BRANCHES.map(b => [b, read(id, c, b, 'final')]))
    ]));
  }
  const data = { initial, final, relays };
  const extraJsonFiles = existsSync(rawDirectory)
    ? readdirSync(rawDirectory).filter(name => name.endsWith('.json') && !expectedRawNames.has(name)).sort()
    : [];
  const summary = {
    tasks: cases.length, plannedFinals: cases.length * CONDITIONS.length * BRANCHES.length,
    finalStates: bucket(cases.flatMap(({ id }) => CONDITIONS.flatMap(c => BRANCHES.map(b => final[id][c][b])))),
    initialStates: bucket(Object.values(initial)),
    relayStates: Object.fromEntries(CONDITIONS.slice(1).map(c => [c, bucket(cases.map(({ id }) => relays[id][c]))])),
    descriptive: Object.fromEntries(CONDITIONS.map(c => [c, Object.fromEntries(BRANCHES.map(b => [b, descriptive(cases, data, c, b)]))])),
    pairedUnsupportedCertainty: Object.fromEntries([['D', 'B'], ['D', 'C'], ['B', 'A']].map(([a, b]) => [
      a + '-' + b, paired(cases, item => getTaskRate(item, data, a), item => getTaskRate(item, data, b))
    ])),
    amplification: Object.fromEntries(CONDITIONS.slice(1).map(c => [c, amplification(cases, data, c)])),
    amplificationByBaselineReference: Object.fromEntries(CONDITIONS.slice(1).map(c => [
      c, Object.fromEntries(['unresolved', 'contradicted'].map(status => [status, amplification(cases, data, c, status)]))
    ])),
    pairedAmplification: Object.fromEntries([['D','B'],['D','C']].map(([a,b]) => [
      a + '-' + b, paired(cases,
        item => mean(amplificationForTask(item, data, a)), item => mean(amplificationForTask(item, data, b)))
    ])),
    revision: Object.fromEntries(CONDITIONS.map(c => [c, Object.fromEntries(BRANCHES.slice(1).map(b => [b, revision(cases, data, c, b)]))])),
    pairedPostUpdateFidelity: Object.fromEntries(BRANCHES.slice(1).map(branch => [
      branch, paired(cases, item => postUpdateForTask(item, data, 'D', branch),
        item => postUpdateForTask(item, data, 'B', branch))
    ])),
    examples: Object.fromEntries(CONDITIONS.map(c => [c, selectExamples(cases, data, c)])),
    integrity: { benchmarkSha256: sha256(readFileSync(dataFile)), rawRecordCount: Object.keys(hashes).length, issues, extraJsonFiles }
  };
  mkdirSync(verifyDirectory, { recursive: true });
  writeFileSync(join(verifyDirectory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const scoreRows = ['task,condition,branch,state,target,reference,target_verdict,target_confidence,strict_target_fidelity,unsupported_certainty_count,at_risk_claims'];
  for (const item of cases) {
    for (const condition of CONDITIONS) {
      for (const branch of BRANCHES) {
        const record = final[item.id][condition][branch];
        const { target } = item;
        const rubric = item.rubric[branch];
        const columns = [item.id, condition, branch, record.state, target, rubric[target].status];
        const riskKeys = CLAIMS.filter(key => rubric[key].status !== 'supported');
        if (record.state === 'valid') {
          const answer = record.claims[target];
          const hits = riskKeys.filter(key => unsupportedCertainty(record.claims[key], rubric[key])).length;
          columns.push(answer.status, answer.confidence, Number(verdictAndSource(answer, rubric[target])), hits, riskKeys.length);
        } else {
          columns.push('', '', '', '', riskKeys.length);
        }
        scoreRows.push(columns.join(','));
      }
    }
  }
  writeFileSync(join(verifyDirectory, 'task_scores.csv'), scoreRows.join('\n') + '\n');
  const manifest = Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([file, hash]) => hash + '  evidence/raw/' + file);
  manifest.unshift(summary.integrity.benchmarkSha256 + '  data/cases.json');
  writeFileSync(join(verifyDirectory, 'SHA256SUMS.txt'), manifest.join('\n') + '\n');
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = independentlyVerify();
  console.log(JSON.stringify({ tasks: summary.tasks, finalStates: summary.finalStates, integrity: summary.integrity }, null, 2));
  if (summary.integrity.issues.length) process.exitCode = 1;
}





