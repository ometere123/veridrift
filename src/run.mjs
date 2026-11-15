import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { parseAssessment } from "./schema.mjs";
import { branches, conditions, config, digest, freezeFiles, parseFile, projectPath,
  randomized, relays, requestFor } from "./design.mjs";

const [mode, ...args] = process.argv.slice(2);
const deadlineArg = args.find(arg => arg.startsWith("--deadline="));
const deadline = deadlineArg ? Date.parse(deadlineArg.slice("--deadline=".length)) : Infinity;
assert(deadline === Infinity || Number.isFinite(deadline), "invalid deadline");
const freezePath = "evidence/freeze_manifest.json";
function writeJson(name, data) {
  const output = projectPath(name);
  const temp = output + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(temp, output);
}
if (mode === "freeze") {
  if (fs.existsSync(projectPath(freezePath))) throw new Error("freeze manifest already exists");
  writeJson(freezePath, { frozenAt: new Date().toISOString(), files: freezeFiles() });
  process.exit(0);
}
assert(["smoke", "main"].includes(mode), "run with smoke, freeze, or main");
if (mode === "main") assert.deepEqual(freezeFiles(), parseFile(freezePath).files, "frozen files diverged");

const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error("OPENAI_API_KEY is required");
const dirname = mode === "main" ? "evidence/raw" : "evidence/smoke";
fs.mkdirSync(projectPath(dirname), { recursive: true });
const lock = projectPath("evidence/.runner.lock");
fs.closeSync(fs.openSync(lock, "wx"));
const attemptsPath = projectPath(dirname + "/attempts.jsonl");
const resumeAttempts = new Map();
let spentReserve = config.attemptReserveUsd; // Independent endpoint probe.
for (const folder of ["evidence/smoke", "evidence/raw"]) {
  const attemptFile = projectPath(folder + "/attempts.jsonl");
  if (!fs.existsSync(attemptFile)) continue;
  for (const line of fs.readFileSync(attemptFile, "utf8").trim().split("\n").filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.event === "attempt") {
      spentReserve += config.attemptReserveUsd;
      if (folder === dirname) resumeAttempts.set(row.run, row);
    }
    if (row.event === "http" && folder === dirname &&
        resumeAttempts.get(row.run)?.attempt === row.attempt) {
      resumeAttempts.set(row.run, { ...resumeAttempts.get(row.run), http: row.status });
    }
  }
}
const log = event => fs.appendFileSync(attemptsPath,
  JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
const counters = { checkpointed: 0, attempted: 0, valid: 0, failed: 0 };
const runId = entry => [entry.task, entry.condition, entry.branch, entry.stage].join("-");

async function judgement(record, entry, dependencies = {}) {
  const run = runId(entry);
  const name = dirname + "/" + run + ".json";
  const request = requestFor(record, entry, dependencies);
  const body = JSON.stringify(request);
  const requestSha256 = digest(body);
  assert(Buffer.byteLength(body) <= config.maxPromptPayloadBytes, "request exceeds frozen byte cap: " + run);
  if (fs.existsSync(projectPath(name))) {
    const prior = parseFile(name);
    assert.equal(prior.requestSha256, requestSha256, "checkpoint request differs: " + run);
    counters.checkpointed++;
    return prior;
  }
  let content = null, parsed = null, response = null, responseText = null, error = null;
  let finishReason = null, httpStatus = null;
  const previous = resumeAttempts.get(run);
  if (previous && previous.requestSha256 !== requestSha256) throw new Error("pending request differs: " + run);
  const retryable = status => status === 429;
  if (previous && !retryable(previous.http)) {
    error = "prior_attempt_missing_checkpoint";
  } else {
    for (let attempt = (previous?.attempt ?? 0) + 1; attempt <= config.maxAttempts; attempt++) {
      if (Date.now() >= deadline) { error = "deadline"; break; }
      if (spentReserve + config.attemptReserveUsd > config.maxSpendUsd) { error = "budget_cap"; break; }
      spentReserve += config.attemptReserveUsd;
      counters.attempted++;
      log({ event: "attempt", run, attempt, requestSha256 });
      let reply;
      try {
        reply = await fetch(config.endpoint, {
          method: "POST",
          headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(60_000),
        });
      } catch (failure) {
        error = failure.name === "TimeoutError" ? "provider_timeout" : "transport_error";
        log({ event: "transport", run, attempt, error });
        break; // Its billing/completion status is ambiguous. Do not retry.
      }
      httpStatus = reply.status;
      log({ event: "http", run, attempt, status: httpStatus });
      if (retryable(httpStatus) && attempt < config.maxAttempts) {
        const advertised = Number(reply.headers.get("retry-after"));
        await pause(Math.min(30, Math.max(2 ** attempt, advertised || 0)) * 1000);
        continue;
      }
      try {
        responseText = await reply.text();
        response = JSON.parse(responseText);
      } catch {
        error = "invalid_provider_json";
        break;
      }
      if (!reply.ok) {
        error = "provider_http_" + httpStatus;
        break;
      }
      if (response.model !== config.model) { error = "unexpected_model"; break; }
      content = response.choices?.[0]?.message?.content ?? null;
      finishReason = response.choices?.[0]?.finish_reason ?? null;
      if (finishReason !== "stop" || typeof content !== "string" || !content.trim()) {
        error = "incomplete_or_empty";
        break;
      }
      try {
        if (entry.stage === "relay" && entry.condition === "B") {
          if (content.trim().startsWith("{") || content.includes(String.fromCharCode(96).repeat(3))) throw new Error("relay not prose");
          parsed = content;
        } else {
          parsed = parseAssessment(content, entry.stage !== "relay" || entry.condition === "D");
        }
      } catch {
        error = "schema_invalid";
      }
      break;
    }
    if (!parsed && !error) error = "retry_exhausted";
  }
  if (parsed) counters.valid++;
  else counters.failed++;
  const checkpoint = { ...entry, requestSha256, request, httpStatus, response, responseText, content,
    parsed, error, finishReason, recordedAt: new Date().toISOString() };
  writeJson(name, checkpoint);
  return checkpoint;
}

async function runTask(record) {
  const task = record.id;
  const initial = await judgement(record, { task, condition: "A", branch: "shared", stage: "initial" });
  const relayRecords = {};
  if (initial.parsed) {
    for (const condition of randomized(relays, task + "-relay")) {
      relayRecords[condition] = await judgement(record, { task, condition, branch: "shared", stage: "relay" },
        { initial: initial.parsed });
    }
  }
  const variants = conditions.flatMap(condition => branches.map(branch => ({ condition, branch })));
  for (const { condition, branch } of randomized(variants, task + "-final")) {
    if (condition !== "A" && !relayRecords[condition]?.parsed) {
      log({ event: "skip", run: runId({ task, condition, branch, stage: "final" }), reason: "missing_handoff" });
      continue;
    }
    await judgement(record, { task, condition, branch, stage: "final" }, { relay: relayRecords[condition]?.content });
  }
}

try {
  const orderedCases = randomized(parseFile(mode === "smoke" ? "data/smoke.json" : "data/cases.json"), mode);
  let cursor = 0;
  const workers = Array.from({ length: config.concurrency }, async () => {
    while (cursor < orderedCases.length) {
      const next = orderedCases[cursor++];
      if (Date.now() >= deadline) break;
      await runTask(next);
      console.log(next.id + " " + JSON.stringify(counters));
    }
  });
  const outcomes = await Promise.allSettled(workers);
  console.log(JSON.stringify({ ...counters, reservedUsd: spentReserve }));
  for (const outcome of outcomes) if (outcome.status === "rejected") throw outcome.reason;
} finally {
  fs.unlinkSync(lock);
}


