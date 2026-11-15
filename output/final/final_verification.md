# Final verification

- Final report: 7 searchable US Letter pages, including 6 main-text pages. All 7 rendered pages visually inspected. The second table begins on the page after its caption. The report uses the Guidelines-linked official DOCX, exported with LibreOffice.
- Abstract: 198 words. Limitations and Dual-Use / Ethical Considerations and LLM disclosure present.
- PDF size: 226,694 bytes (under 25 MB).
- PDF SHA-256: 67c4018db277e6b49d8f637f487693d2cf8d651e0337a7159f091b4201d6b8ed
- Benchmark: 24 distinct synthetic tasks and 288 valid matched final assessments. The main study completed 384/384 calls, comprising 24 shared initial assessments, 72 relays, and 288 finals. Zero missing, invalid, or retried main runs. The separate 16-call smoke task and one inference probe are excluded from results.
- Exact model: gpt-4.1-mini-2025-04-14.
- Estimated inference: USD 0.17456 for main runs and USD 0.18179 total including smoke and probe, at configured token rates.
- Deterministic tests: 8 passed, 0 failed. Independent JavaScript scoring and request audit passed. Separate Python recomputation matched headline counts, paired intervals and score-polarity checks, and verified 385 artifact hashes. Credential-pattern scan of staged files found no matches.
- Public repository: https://github.com/ometere123/veridrift
- Final research and PDF artifact commit: 4f1d0760d30dc1c21806ed6a174c2f1f34d55883. A subsequent commit adds this verification record.
- Limitations: one model, short chains, synthetic cases, and bundled prompt and information differences. The primary interval is degenerate because observed paired differences were identical. Elicited scores have ambiguous semantics after contradiction. Author spelling follows the supplied instructions. The accessible registration message did not establish an independent spelling.
- Submission is left to the author.
