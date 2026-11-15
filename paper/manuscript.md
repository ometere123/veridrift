# VERIDRIFT: Measuring Unjustified Confidence Amplification Across AI-Agent Handoffs

DELE-ALUFE OMETERE JOEL  
Independent Researcher, Nigeria

## Abstract

{{ABSTRACT}}

## 1. Introduction

Suppose a purchasing agent sees a tentative vendor note, a second agent summarizes it, and a third recommends approving a payment. By the time the third agent answers, the same note may sound like a verified record. The agents have produced more judgments, but the evidential basis has not changed. A good handoff should preserve the difference between an inference and its source, and still let a later agent change its mind when a decisive record arrives.

VERIDRIFT asks whether fixed evidence yields high-confidence endorsements of claims that the source packet cannot establish, and whether a handoff that carries source identifiers and uncertainty can reduce these endorsements while preserving responsiveness to new evidence. The benchmark holds candidate claims constant across four routes and compares a branch with no new source to branches with newly decisive supporting or contradicting records. The target is the behavior of a specified workflow; the experiment neither infers the model's private beliefs nor validates its numerical reports as probabilities.

## 2. Related Work

Gao et al. (2026) provide the closest precedent: their source-dependence study shows that agents can mistakenly treat repeated messages from one source like independent corroboration. They test sequential relay as well as other topologies and show that a source-reference rule can reduce premature commitment while retaining sensitivity to independent corroboration. Bara (2026) formalizes a complementary point: repeated agents can extract additional information about a shared source even when they contribute no additional external source. Therefore, a numerical increase alone cannot identify an epistemic error.

VERIDRIFT extends this line of evaluation by scoring the semantic relation between a fixed candidate and its packet, tracking unsupported and contradicted claims separately, comparing provenance alone with explicit uncertainty preservation, and branching into confirmation or late contradiction from the same intermediate state. This is an evaluation contribution, rather than a claim to have discovered confidence amplification or invented provenance. Nnamdi et al. (2026) document shifts toward stronger expressed certainty in summarization and rewriting. DebUnc (Yoffe et al., 2025) already uses uncertainty in multi-agent debate. ClaimArena-LLM (Anghel et al., 2026) already uses claim-level evidence relations in adversarial debate. Here agents operate in a serial summary workflow and face a source-backed intervention at a defined stage. The sprint's examples MisleadBench, Confidence Audit, FlipRate, and Provenance Study motivate implied versus defended positions, elicited confidence, warranted revision, and traceability respectively (Apart Research, 2026).

## 3. Methods

### Case construction and evidence schedule

Each synthetic task presents a realistic record-based decision and three fixed candidate claims. The initial records suffice to establish one claim, suffice to refute another, and leave one unresolved. The scoring key records evidence status and which source identifiers support a verdict; it is separate from the model-facing packet. Claim slots are scored against the evidence available by that stage, not an unobserved real-world outcome. Each original task is one statistical unit. Candidate claims and branch variants within it are dependent.

The no-new branch adds no record. The support branch adds an independent, decisive record for the previously unresolved candidate. The contradiction branch instead adds a decisive record against that candidate. The alternatives are separate counterfactual packets: they do not both occur in one trial. The new record appears at the final stage and the same prior handoff is reused across branches. A successful contradiction outcome can be a correct resolution of an initially uncertain claim; a hard retraction of a prior endorsement is a stricter outcome and is possible only when an endorsement occurred.

### Four routes and hypotheses

A, Direct: the final call receives the original records and any branch-specific source. In B, C and D, the relay receives both the originals and a shared initial assessment, while the final call receives the relay text and any new record. B, Ordinary: the relay is a prose summary with no prescribed structure. C, Provenance: the relay uses structured fields for evidence status and source identifiers, asks for gaps and omits numeric confidence. D, Provenance with uncertainty: the relay also copies prior numeric estimates. The D recipient is explicitly instructed to preserve unresolved status and credence in the absence of relevant new evidence. All final assessments use the same structured output contract.

The primary directional prediction was fewer unsupported or contradicted high-confidence endorsements in D than B under no new evidence. C versus D and A versus B help interpret the compound intervention. The supporting control tests whether a safer relay still permits endorsement when evidence warrants it. The contradiction control tests whether the new negative record can overcome an earlier favorable assessment. Even when nominal output caps are identical, the relay instructions change which evidence, caveats, and numerical anchors reach the final agent. A also differs in access to original records and number of model calls. Contrasts identify differences between the tested workflows, not the isolated effect of a source identifier or confidence field.

{{RUN_CONFIGURATION}}

### Outcomes and analysis

{{SCORING}}

## 4. Results

{{RESULTS}}

## 5. Discussion and Limitations

{{DISCUSSION}}

### Future work

A useful next test would put original evidence access on a separate experimental axis, vary handoff depth, and compare across model families. An explicit duplicate-source manipulation would distinguish evidential loss in the summary from repeated endorsement. Blinded human review across independently authored domains would test whether the simple evidence relations and citation rubric generalize to records whose quality, authority, and relevance are contested.

## 6. Conclusion

{{CONCLUSION}}

## Code and Data

{{CODE}}

## References

{{REFERENCES}}

## Appendix A. Limitations and Dual-Use / Ethical Considerations

The packets are synthetic, short, and closed. Their designed supporting and refuting evidence is often decisive; real evidence is frequently incomplete, contested, or correlated. The experiment uses a single model and short same-model chains. The prompts may produce a change in the expression of certainty without changing downstream decisions or robustness under paraphrase. Source identifiers can be copied or fabricated; carrying them does not authenticate the documents or their authors. Reported credence is neither a calibrated probability nor a measure of internal model state. Intervals describe task sensitivity within the chosen benchmark and do not justify population claims.

The benchmark contains no personal data. Synthetic packets and model traces are published for audit; credentials and account metadata are excluded. Results could help an operator make an unsupported story sound more reliable, or could give a reviewer false assurance that a cited claim was independently verified. Use the protocols to make claims easier to inspect and retain access to original records where possible. The study does not validate automated decisions in consequential settings.

## Appendix B. Reproducibility and LLM Usage Statement

The protocol, synthetic case sources and reference labels, prompt texts, runner, raw response artifacts, and independent scorer document the experiment. The project files were created for the AI × Epistemics Sprint. Beyond Confessions, a separate AI Collusion Sprint entry, provided prior engineering experience and an existing credential route; no code, results, figures, or datasets from that project are used as VERIDRIFT evidence. Codex and its subagents assisted with implementation, source checking, analysis, writing, and critique. The experimental inference model is documented separately from these authoring tools.
