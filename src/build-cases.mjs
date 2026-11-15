import fs from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const path = name => fileURLToPath(new URL(name, import.meta.url));
const input = JSON.parse(fs.readFileSync(path("../data/scenarios.json"), "utf8"));
const permutations = ["ABC", "ACB", "BAC", "BCA", "CAB", "CBA"];
const withoutId = text => text.replace(/^S[1-4] /, "");

const cases = input.map((row, i) => {
  assert.equal(row.length, 11);
  const [domain, scenario, question, targetText, supportedText, s1, s2,
    contradictedText, s3, supportText, retractText] = row;
  const [target, supportedId, contradictedId] = permutations[i % 6];
  const [s1Id, s2Id, s3Id] = [...permutations[Math.floor(i / 3) % 6]].map(x => "S" + (x.charCodeAt(0) - 64));
  const ordered = entries => Object.fromEntries(Object.entries(entries).sort());
  function rubric(status, citations) {
    return ordered({
      [target]: { status, citations },
      [supportedId]: { status: "supported", citations: [s1Id] },
      [contradictedId]: { status: "contradicted", citations: [s2Id] },
    });
  }
  return {
    id: domain === "smoke" ? "S01" : "V" + String(i + 1).padStart(2, "0"),
    domain, scenario, question, target,
    claims: ordered({ [target]: targetText, [supportedId]: supportedText, [contradictedId]: contradictedText }),
    sources: ordered({ [s1Id]: withoutId(s1), [s2Id]: withoutId(s2), [s3Id]: withoutId(s3) }),
    updates: { support: { S4: withoutId(supportText) }, retract: { S4: withoutId(retractText) } },
    rubric: {
      none: rubric("unresolved", []),
      support: rubric("supported", ["S4"]),
      retract: rubric("contradicted", ["S4"]),
    },
  };
});

for (const [name, subset] of [["cases", cases.slice(0, -1)], ["smoke", cases.slice(-1)]]) {
  fs.writeFileSync(path("../data/" + name + ".json"), JSON.stringify(subset, null, 2) + "\n");
}



