// Exploratory implementation diagnostics. Excluded from all prespecified endpoints.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeClaims, BRANCHES, CONDITIONS } from './verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
const cases = read('data/cases.json');

function checkpoint(item, condition, branch, stage) {
  const path = ['evidence/raw/' + item.id, condition, branch, stage].join('-') + '.json';
  if (!existsSync(join(root, path))) return null;
  const record = read(path);
  return record.error || typeof record.content !== 'string' ? null : record;
}

function outcome() {
  return { numerator: 0, denominator: 0 };
}

function count(metric, success) {
  metric.denominator++;
  metric.numerator += Number(success);
}

const copy = outcome(), unresolvedTargetPreservation = outcome();
const relayIdentifierPresent = Object.fromEntries(CONDITIONS.slice(1).map(c => [c, outcome()]));
const correctVerdictWithoutDecisiveRef = Object.fromEntries(CONDITIONS.map(c => [c, outcome()]));
const controlBreakdown = Object.fromEntries(CONDITIONS.map(c => [c, Object.fromEntries(
  BRANCHES.slice(1).map(branch => [branch, {valid: 0, correctVerdict: 0, correctVerdictWithS4: 0, correctVerdictWithS4Alone: 0}])
)]));
const scorePolarity = Object.fromEntries(CONDITIONS.map(c => [c, {
  highScoreAmongContradictedAnchorsNoNew: outcome(),
  highScoreAmongContradictedTargetsWithCorrectS4: outcome(),
  retractionTargetScoreChangeCounts: {rose: 0, tied: 0, fell: 0},
  firstHighScoreOnCorrectContradiction: null
}]));

for (const item of cases) {
  const initialRecord = checkpoint(item, 'A', 'shared', 'initial');
  const dRelay = checkpoint(item, 'D', 'shared', 'relay');
  const dFinal = checkpoint(item, 'D', 'none', 'final');
  if (initialRecord && dRelay) {
    const initial = decodeClaims(initialRecord.content).claims;
    const relay = decodeClaims(dRelay.content).claims;
    for (const [key, claim] of Object.entries(initial)) count(copy, claim.confidence === relay[key].confidence);
  }
  if (dRelay && dFinal) {
    const relay = decodeClaims(dRelay.content).claims[item.target];
    const final = decodeClaims(dFinal.content).claims[item.target];
    if (relay.status === 'unresolved') {
      count(unresolvedTargetPreservation, final.status === 'unresolved' && final.confidence === relay.confidence);
    }
  }
  for (const condition of CONDITIONS.slice(1)) {
    const relay = checkpoint(item, condition, 'shared', 'relay');
    if (!relay) continue;
    for (const reference of Object.values(item.rubric.none).filter(claim => claim.status !== 'unresolved')) {
      const source = reference.citations[0];
      count(relayIdentifierPresent[condition], new RegExp('\\b' + source + '\\b').test(relay.content));
    }
  }
  for (const condition of CONDITIONS) {
    const final = checkpoint(item, condition, 'none', 'final');
    if (!final) continue;
    const claims = decodeClaims(final.content).claims;
    for (const branch of BRANCHES.slice(1)) {
      const update = checkpoint(item, condition, branch, 'final');
      if (!update) continue;
      const target = decodeClaims(update.content).claims[item.target];
      const counts = controlBreakdown[condition][branch];
      counts.valid++;
      if (target.status !== item.rubric[branch][item.target].status) continue;
      counts.correctVerdict++;
      if (target.citations.includes('S4')) {
        counts.correctVerdictWithS4++;
        counts.correctVerdictWithS4Alone += Number(target.citations.length === 1);
      }
    }
    const polarity = scorePolarity[condition];
    const negativeFinal = checkpoint(item, condition, 'retract', 'final');
    if (negativeFinal) {
      const negative = decodeClaims(negativeFinal.content).claims[item.target];
      const prior = claims[item.target];
      const direction = negative.confidence === prior.confidence ? 'tied'
        : negative.confidence > prior.confidence ? 'rose' : 'fell';
      polarity.retractionTargetScoreChangeCounts[direction]++;
      if (negative.status === 'contradicted' && negative.citations.length === 1 && negative.citations[0] === 'S4') {
        count(polarity.highScoreAmongContradictedTargetsWithCorrectS4, negative.confidence > 80);
        if (negative.confidence > 80 && !polarity.firstHighScoreOnCorrectContradiction) {
          const rawNegative = decodeClaims(negativeFinal.content);
          polarity.firstHighScoreOnCorrectContradiction = {
            task: item.id, target: item.target, claim: item.claims[item.target], newEvidence: item.updates.retract.S4,
            noNew: prior, negative, exactNote: rawNegative.note,
            rawFile: 'evidence/raw/' + item.id + '-' + condition + '-retract-final.json'
          };
        }
      }
    }
    for (const [key, reference] of Object.entries(item.rubric.none)) {
      const claim = claims[key];
      if (reference.status === 'contradicted' && claim.status === 'contradicted') {
        count(polarity.highScoreAmongContradictedAnchorsNoNew, claim.confidence > 80);
      }
      if (reference.status !== 'unresolved' && claim.status === reference.status) {
        count(correctVerdictWithoutDecisiveRef[condition], !claim.citations.includes(reference.citations[0]));
      }
    }
  }
}

const summary = {
  label: 'Exploratory diagnostics, separate from the frozen estimands',
  relayDExactCopyAcrossInitialClaimSlots: copy,
  finalDJointUnresolvedAndConfidencePreservationAmongUnresolvedRelayTargets: unresolvedTargetPreservation,
  decisiveOriginalSourceIdentifierMentionedInRelay: relayIdentifierPresent,
  correctNoNewVerdictWithoutDecisiveCitation: correctVerdictWithoutDecisiveRef,
  claimTruthScoreAndVerdictPolarity: scorePolarity,
  targetVerdictAndS4Attribution: controlBreakdown
};
writeFileSync(join(root, 'evidence/verification/exploratory.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));



