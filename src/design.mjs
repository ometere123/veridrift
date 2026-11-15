import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { assessmentSchema } from "./schema.mjs";

export const projectPath = name => fileURLToPath(new URL("../" + name, import.meta.url));
export const parseFile = name => JSON.parse(fs.readFileSync(projectPath(name), "utf8"));
export const config = parseFile("prompts/config.json");
export const conditions = ["A", "B", "C", "D"];
export const branches = ["none", "support", "retract"];
export const relays = ["B", "C", "D"];
const prompt = name => fs.readFileSync(projectPath("prompts/" + name + ".txt"), "utf8").trim();

export const digest = contents => createHash("sha256").update(contents).digest("hex");

export function randomized(items, context) {
  const rank = item => digest(JSON.stringify([config.seed, context, item]));
  return [...items].sort((a, b) => rank(a).localeCompare(rank(b), "en"));
}

export function requestFor(record, entry, dependencies = {}) {
  const { stage, branch, condition } = entry;
  const { scenario, question, claims, sources, updates } = record;
  const material = { scenario, question, claims };
  if (stage !== "final" || condition === "A") material.sources = sources;
  if (stage === "relay") material.prior_assessment = dependencies.initial;
  if (stage === "final") {
    if (condition !== "A") material.handoff = dependencies.relay;
    material.follow_up = updates[branch] ?? {};
  }
  let system = stage === "relay" ? prompt("relay_" + condition) : prompt("evaluate");
  if (stage === "initial") system += "\n\nPrepare the first assessment of the original records for a possible handoff.";
  if (stage === "final" && condition === "D") system += "\n\n" + prompt("recipient_D");
  const request = {
    model: config.model,
    temperature: config.temperature,
    max_completion_tokens: config.max_completion_tokens,
    seed: config.seed,
    store: false,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(material) },
    ],
  };
  if (stage !== "relay" || condition !== "B") {
    const hasConfidence = stage !== "relay" || condition === "D";
    request.response_format = {
      type: "json_schema",
      json_schema: {
        name: hasConfidence ? "claim_assessment" : "provenance_handoff",
        strict: true,
        schema: assessmentSchema(hasConfidence),
      },
    };
  }
  return request;
}

export const packetFiles = ["data/cases.json", "data/smoke.json", "data/scenarios.json",
  "prompts/config.json", "prompts/evaluate.txt", "prompts/relay_B.txt", "prompts/relay_C.txt",
  "prompts/relay_D.txt", "prompts/recipient_D.txt", "src/build-cases.mjs", "src/schema.mjs",
  "src/design.mjs", "src/run.mjs", "research/frozen_protocol.md", "analysis/SCORING.md"];

export function freezeFiles() {
  return Object.fromEntries(packetFiles.map(name =>
    [name, digest(fs.readFileSync(projectPath(name), "utf8").replace(/\r\n/g, "\n"))]));
}


