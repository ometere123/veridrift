# VERIDRIFT frozen main protocol

Freeze checkpoint: `evidence/freeze_manifest.json`. The manifest records SHA-256 hashes of UTF-8 text with CRLF line endings normalized to LF. The runtime refuses to run the main experiment if the snapshot does not match the data, prompts, runner or analysis scoring specification. The separate fixture case S01 checks infrastructure before the main freeze and does not contribute to effects. No prior sprint data, figures, or implementation code contributed to this study.

## Question and hypotheses

Does an agent express unwarranted certainty about the same candidate claim after a handoff, without independent evidence? Do provenance and uncertainty-preserving protocols reduce this tendency while permitting upward and downward revision when independent evidence arrives? We expect positive confidence movement in the ordinary handoff for at-risk candidates and lower unsupported certainty in the explicit uncertainty/provenance protocol than in the ordinary one. We expect a positive direction in each update branch for unresolved no-new finals. These are directional hypotheses, with a primary contrast and descriptive controls. The result can be null, adverse, or asymmetric.

## Tasks and stages

Each of 24 independent fictional tasks has three source records and three fixed candidate claims: one original record establishes a claim, another establishes the negation of a different claim, and a limited proxy, assertion or provisional record bears on a third claim without settling it. The target is that unresolved third claim. Claims and original source identifiers are permuted. Task and condition codes, target identity and rubric stay outside model messages. Exact decisive citations and status are in the synthetic rubric. No world-state truth is assigned to a target in the no-new branch.

The common initial call receives the original records and emits a structured assessment. It occurs once per task. Conditions B/C/D then receive the same originals and parsed initial assessment at an independent, stateless relay call. The exact raw text from each successful relay is passed to its final calls. Each condition reuses one relay across matched final branches. Unsuccessful upstream outputs leave dependents missing. The independent direct condition A receives original records at the final call and has no handoff. All conditions also receive the question and candidate claim texts.

- A, direct. Original source texts and the matched follow-up when present.
- B, ordinary. Free prose relay under a short summary instruction. Source IDs and confidence can appear spontaneously.
- C, provenance. Relay JSON supplies each status and decisive source IDs, with a note that preserves cited material. Its prompt asks to omit numeric confidence. The final assessment uses the common rubric prompt.
- D, provenance and uncertainty. Relay JSON also copies numeric claim-truth estimates and advises preserving unresolved status. The final has an additional instruction to preserve unresolved status absent decisive follow-up, preserve unresolved credence absent relevant follow-up, and distinguish repetition from an independent source.

The three branches are final-call counterfactuals. The none branch supplies an empty follow-up object. The support branch supplies an independent record (S4) establishing the target. The retract branch instead supplies an independent record (also S4) negating the target, correcting the provisional assertion or inference represented upstream. This is an evidence-driven correction test even where the initial model did not endorse the claim as established. Outcome comparisons with the none branch condition on a valid unresolved no-new verdict for directional revision. S4 is never available to initial or relay calls, and each final sees at most one S4. The anchor labels never change.

## Runtime and cost

One pinned `gpt-4.1-mini-2025-04-14` snapshot via Chat Completions, temperature 0, seed 139267, 256 maximum generated tokens, no request storage, task-level concurrency four. The provider can vary output even with these settings. JSON schema constrains assessment fields, not correct statuses, confidence values, motifs or source IDs. The collector applies a second schema check. It does not repair invalid output. Ordinary relay does not use constrained decoding. C and D have different relay schema lengths, and D has extra final instructions. Every call has the same output maximum, but observed generated length and input length can differ. Provenance, information retention, output format and instructions change together. A receives original evidence while the handoff recipients do not. The contrasts estimate the tested protocol bundles on this workflow and do not identify individual mechanisms.

The end-to-end schedule uses a deterministic hash ranking for task ordering and relay/final order inside a task. The main plan has 24 initial, 72 relay and 288 final calls. Files checkpoint each completed attempt. Known HTTP 429s alone can retry, up to three attempts per request. Ambiguous transport failures are left unrerun. Every attempt reserves $0.0024, with a $1 ceiling covering the endpoint probe, smoke, inference and retries. The reserve uses the configured maximum request byte length (4,600, which includes JSON schema and prompt), a conservative allowance for provider prompt framing, and 256 maximum output tokens. Snapshot list pricing is $0.40 input and $1.60 output per million tokens. Account balance was not visible through the available project credential. The authenticated endpoint probe checked that the snapshot could be used. Actual costs are estimates based on provider token usage at undiscounted rates.

## Frozen measurement

See [independent scoring specification](../analysis/SCORING.md). The primary endpoint is the fraction of baseline unresolved or contradicted candidates declared supported with claim-truth confidence strictly greater than 80/100 in the no-new branch. The primary contrast is D minus B, paired at original-task level. A number measures model-reported belief in the claim itself, not confidence in a verdict or empirically calibrated probability. Initial-to-final movement for handoffs is assessed without new evidence, and matched control finals test belief movement under new supporting or contradictory evidence. Parse failures and skips are retained as missing outcomes and shown in denominators.



