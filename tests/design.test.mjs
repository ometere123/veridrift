import assert from "node:assert/strict";
import test from "node:test";
import { branches, conditions, config, parseFile, randomized, requestFor } from "../src/design.mjs";
import { claimIds, parseAssessment } from "../src/schema.mjs";

const cases = parseFile("data/cases.json");
const smoke = parseFile("data/smoke.json");
const anchors = ["contradicted", "supported", "unresolved"];
const idSet = value => Object.keys(value).sort();
const reference = {
  claims: {
    A: { status: "unresolved", confidence: 53, citations: [] },
    B: { status: "supported", confidence: 100, citations: ["S2"] },
    C: { status: "contradicted", confidence: 0, citations: ["S1"] },
  },
  note: "See S1 and S2.",
};

test("case IDs, anchor balance and matched branch labels", () => {
  assert.equal(cases.length, 24);
  assert.equal(smoke.length, 1);
  const targetCounts = Object.fromEntries(claimIds.map(id => [id, 0]));
  const sourceCounts = {};
  const seen = new Set();
  for (const item of [...cases, ...smoke]) {
    assert(!seen.has(item.id));
    seen.add(item.id);
    assert.deepEqual(idSet(item.claims), claimIds);
    assert.deepEqual(idSet(item.sources), ["S1", "S2", "S3"]);
    assert.deepEqual(idSet(item.rubric), [...branches].sort());
    assert.equal(new Set(Object.values(item.claims)).size, 3);
    assert.deepEqual(Object.values(item.rubric.none).map(claim => claim.status).sort(), anchors);
    assert.deepEqual(item.rubric.none[item.target], { status: "unresolved", citations: [] });
    assert.deepEqual(item.rubric.support[item.target], { status: "supported", citations: ["S4"] });
    assert.deepEqual(item.rubric.retract[item.target], { status: "contradicted", citations: ["S4"] });
    assert.deepEqual(idSet(item.updates.support), ["S4"]);
    assert.deepEqual(idSet(item.updates.retract), ["S4"]);
    assert.notEqual(item.updates.support.S4, item.updates.retract.S4);
    for (const id of claimIds.filter(id => id !== item.target)) {
      const verdict = item.rubric.none[id];
      assert.equal(verdict.citations.length, 1);
      assert(item.sources[verdict.citations[0]]);
      assert.deepEqual(item.rubric.support[id], verdict);
      assert.deepEqual(item.rubric.retract[id], verdict);
    }
    if (item.id.startsWith("V")) {
      targetCounts[item.target]++;
      const weakId = idSet(item.sources).find(id => !Object.values(item.rubric.none).some(v => v.citations.includes(id)));
      sourceCounts[weakId] = (sourceCounts[weakId] ?? 0) + 1;
    }
  }
  assert.deepEqual(targetCounts, { A: 8, B: 8, C: 8 });
  assert.deepEqual(idSet(sourceCounts), ["S1", "S2", "S3"]);
});

test("schema validates exact claim fields and integer bounds", () => {
  assert.deepEqual(parseAssessment(JSON.stringify(reference)), reference);
  const invalid = [
    claim => claim.confidence = 100.5,
    claim => claim.confidence = -1,
    claim => claim.confidence = "90",
    claim => delete claim.status,
    claim => claim.verdict = "supported",
    claim => claim.status = "unknown",
    claim => claim.citations = ["S1", "S1"],
    claim => claim.citations = [" "],
  ];
  for (const mutate of invalid) {
    const copy = structuredClone(reference);
    mutate(copy.claims.B);
    assert.throws(() => parseAssessment(JSON.stringify(copy)));
  }
  assert.throws(() => parseAssessment("not JSON"));
});

test("every generated model message projects only intended evidence and uses a common budget", () => {
  for (const item of [...cases, ...smoke]) {
    for (const condition of conditions) {
      for (const branch of branches) {
        const relay = "A fixture handoff for " + item.id;
        const request = requestFor(item, { condition, branch, stage: "final" }, { relay });
        const packet = JSON.parse(request.messages[1].content);
        assert.deepEqual(idSet(packet), ["claims", "follow_up", condition === "A" ? "sources" : "handoff", "question", "scenario"].sort());
        assert.deepEqual(packet.claims, item.claims);
        assert.deepEqual(packet.follow_up, item.updates[branch] ?? {});
        if (condition === "A") assert.deepEqual(packet.sources, item.sources);
        else assert.equal(packet.handoff, relay);
        assert.equal(request.max_completion_tokens, config.max_completion_tokens);
        assert.equal(request.model, config.model);
        assert.equal(request.response_format.json_schema.strict, true);
        assert(Buffer.byteLength(JSON.stringify(request)) <= config.maxPromptPayloadBytes);
      }
    }
    for (const condition of ["B", "C", "D"]) {
      const request = requestFor(item, { condition, branch: "shared", stage: "relay" }, { initial: reference });
      const packet = JSON.parse(request.messages[1].content);
      assert.deepEqual(idSet(packet), ["claims", "prior_assessment", "question", "scenario", "sources"]);
      assert.deepEqual(packet.prior_assessment, reference);
      assert.deepEqual(packet.sources, item.sources);
      assert.equal(Boolean(request.response_format), condition !== "B");
      assert(Buffer.byteLength(JSON.stringify(request)) <= config.maxPromptPayloadBytes);
    }
  }
});

test("schedule is deterministic and is a permutation", () => {
  const ids = cases.map(item => item.id);
  const first = randomized(ids, "main");
  assert.deepEqual(first, randomized(ids, "main"));
  assert.deepEqual([...first].sort(), ids);
  assert.notDeepEqual(first, ids);
});

