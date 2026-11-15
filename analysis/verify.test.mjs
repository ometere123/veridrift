import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeClaims, unsupportedCertainty, pairedBootstrap } from './verify.mjs';

function claim(confidence=80, status='supported', citations=[]) {
  return { confidence, status, citations };
}
const valid = () => ({claims:{A:claim(),B:claim(47,'unresolved'),C:claim(5,'contradicted',['S2'])},note:'test'});

test('independent decoder accepts exactly the intended structure', () => {
  const response = valid();
  assert.deepEqual(decodeClaims(JSON.stringify(response)), response);
  response.claims.A.confidence = 101;
  assert.throws(() => decodeClaims(JSON.stringify(response)), /confidence/);
  response.claims.A.confidence = 0.5;
  assert.throws(() => decodeClaims(JSON.stringify(response)), /confidence/);
  response.claims.A.confidence = '80';
  assert.throws(() => decodeClaims(JSON.stringify(response)), /confidence/);
});

test('independent decoder rejects duplicate or unexpected keys', () => {
  const response = JSON.stringify(valid());
  assert.throws(() => decodeClaims(response.replace('"confidence":80', '"confidence":80,"confid\\u0065nce":80')), /duplicate/);
  assert.throws(() => decodeClaims(response.replace('"citations":[]', '"citations":[],"extra":0')), /envelope/);
  assert.throws(() => decodeClaims(response.replace('["S2"]', '["S2","S2"]')), /repeated/);
});

test('strict threshold and asserted-support gate are separate', () => {
  for (const status of ['contradicted', 'unresolved']) {
    assert.equal(unsupportedCertainty(claim(80), {status}), false);
    assert.equal(unsupportedCertainty(claim(81), {status}), true);
    assert.equal(unsupportedCertainty(claim(100,'unresolved'), {status}), false);
  }
  assert.equal(unsupportedCertainty(claim(100), {status:'supported'}), false);
});

test('task pair bootstrap is reproducible, preserves missingness, and omits small-sample intervals', () => {
  const differences = [0.5, 0, 0, -0.5, 0, 0, -0.5, 0];
  const paired = pairedBootstrap(differences, 24);
  assert.equal(paired.estimate, -0.0625);
  assert.deepEqual(paired.interval95, [-0.25, 0.125]);
  assert.equal(paired.completePairs, 8);
  assert.equal(paired.pairsUnavailable, 16);
  assert.deepEqual(pairedBootstrap(differences, 24), paired);
  assert.equal(pairedBootstrap([1, 1], 24).interval95, null);
  assert.deepEqual(pairedBootstrap(Array(8).fill(0), 8).interval95, [0,0]);
});

