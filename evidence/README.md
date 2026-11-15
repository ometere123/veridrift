# Inference evidence

- `freeze_manifest.json` records the frozen material before the main run. Its file digests normalize CRLF to LF for text.
- `raw/` stores one JSON checkpoint per main-model call. The exact provider request body excludes the HTTP Authorization header. The provider response and its raw text are preserved, along with extracted model content, parser output and any error. Independent scoring reconstructs outcomes from raw model content.
- `smoke/` includes the minimal endpoint probe and 16 model calls on S01, a separate exploratory case excluded from the main dataset and outcomes.
- Each run directory has an append-only `attempts.jsonl` ledger. A successful checkpoint is returned on resume without another provider call. A rate-limited attempt can be retried. A transport failure with unknown provider state is recorded and left unrerun.
- `run_summary.json` and `raw_sha256.txt` come from `node src/summarize-run.mjs --write`. Raw evidence digests hash bytes directly. The cost estimate applies standard, undiscounted token rates to the provider's recorded usage, including the probe and smoke. It excludes non-inference work and is not an invoice.

The smoke run hit an overly conservative local request-size guard for a D final before that request was sent. The engineering team increased the guard and reserve before the main freeze, resumed the smoke run from completed checkpoints, and then verified all 16 calls. No model-facing prompt or generation parameter changed as a result of the size-guard adjustment. Raw records contain only synthetic case material and model/provider output.


The main run began at 00:44:08 WAT and its last provider response arrived at 00:46:43 WAT. All 384 planned main calls returned HTTP 200 and passed collection schema checks. This covers 24 initials, 72 relays and 288 finals. There were no provider retries, dropped requests, truncated responses, or schema failures in the main run. The completed smoke had 16 HTTP 200 responses and no retries. The preflight model catalogue query did not generate text, and the separate inference probe returned HTTP 200.

The main model used 216,959 input and 54,862 output tokens. At $0.40 and $1.60 per million, respectively, the main estimate is $0.1745628. Including 16 smoke calls and the endpoint probe brings the estimate to $0.181788. The conservative reserved amount after all 401 inference attempts was $0.9624 against a $1 ceiling. Four deterministic protocol and schema tests were repeated after collection, with four passes and zero failures. No main-generation protocol deviations were recorded.
