# VERIDRIFT

**Measuring Unjustified Confidence Amplification Across AI-Agent Handoffs**  
Ometere Joel Dele-Alufe · Independent Researcher, Nigeria  
Apart Research AI × Epistemics Research Sprint · Track 1: Model Epistemics & Decision-Making Evals

VERIDRIFT tests whether agents endorse claims more confidently after a handoff when the available evidence does not establish them, and whether a more explicit handoff still permits revision when a decisive record arrives.

The 24 fictional tasks each have one initially supported claim, one refuted claim and one unresolved claim. Four workflows see matched cases under unchanged, supporting and contradicting evidence schedules. The primary comparison is combined provenance and uncertainty instructions versus ordinary handoff, using task-paired high-confidence endorsement rates. See the frozen protocol and independent scoring specification for exact definitions.

## Results

All 288 final assessments were valid. Ordinary and provenance-plus-uncertainty handoffs each yielded 2/48 high-confidence unsupported endorsements. Exact source fidelity on determinate no-new claims rose from 28/48 for ordinary relay to 47/48 for both provenance workflows. After decisive contradiction, reported claim-truth scores rose on average in all four workflows, despite frequent correct verdicts. The PDF and independent summary report counts, paired intervals, and scope limits.

## Reproduce the analysis

Requires Node.js with the built-in test runner and fetch (Node 22 or later is recommended). The scoring and integrity checks run offline on the committed model traces; no account or API key is needed.

```sh
node --test tests/*.test.mjs analysis/*.test.mjs
node analysis/audit-requests.mjs
node analysis/verify.mjs
python -m pip install matplotlib
python analysis/plot.py
```

- [Frozen protocol](research/frozen_protocol.md), [analysis rubric](analysis/SCORING.md) and [freeze hashes](evidence/freeze_manifest.json)
- [Case construction and labels](data/README.md), [prompts and generation settings](prompts/)
- [Raw request and response artifacts](evidence/raw/) and [independent verification](evidence/verification/)
- [Literature and originality audit](research/literature_audit.md)
- [Final PDF](output/final/VERIDRIFT_Apart_Research_Final.pdf)

To rerun provider inference, work in a fresh copy and **archive your own copy of the existing** `evidence/raw/` **before running** `node src/run.mjs main`. Provide `OPENAI_API_KEY` in the process environment through your normal secret manager. Never save a key in the source or trace tree. The harness validates the frozen hashes, reserves against a $1 operational cap, checkpoints successful calls, and logs retryable failures. Without moving your copy of the existing raw output out of that path, the runner resumes or checks existing work. Provider seeds and temperature zero do not guarantee bitwise reproducibility. Do not regenerate the freeze manifest to score the existing traces.

## Rebuild the paper

Download the current Guidelines-linked [official template DOCX export](https://docs.google.com/document/d/17b3JWki-ZkaqdmqGI5d0gof-HwlGuWU9Mc1_klNZXKs/export?format=docx) to `paper/official_template.docx`. Its expected SHA-256 is pinned in `paper/build_docx.py`. With Python and `lxml` installed, run `python paper/build_docx.py`, then export the resulting `paper/VERIDRIFT.docx` with LibreOffice. The submission PDF and its checksum are authoritative; converter versions can change PDF bytes and line breaks.

## Scope and disclosures

All VERIDRIFT cases, prompts, runner, metrics, results, and figures were created for this sprint. [Beyond Confessions](https://github.com/ometere123/beyond-confessions) was separate prior work; it supplied general engineering experience and an existing provider credential route. No implementation code or experimental artifacts from that project are included as VERIDRIFT evidence. The model saw fictional task records, never the scoring labels. The reported number is a model's elicited claim-truth confidence; it is not validated as a calibrated probability. The study evaluates specified workflow bundles on one model and cannot isolate individual prompt components or establish effects for real-world decisions.
