# Case authorship and labels

The VERIDRIFT team authored 24 fictional cases for the main experiment and one separate pilot case. No source text describes a real person or event. The source of record is `scenarios.json`. Each row specifies a short decision context, a target claim, a plainly supported anchor, its source, a source negating the contradicted anchor (followed by that claim), a limited source for the target, and two alternate independent follow-ups. The 24 cases share an evidential structure but have different evidence mechanisms, including conditional binding, uncertain synchronization, timing mismatches, estimated values, and measurements on the wrong unit.

Run `node src/build-cases.mjs` to create `cases.json` and `smoke.json`. The six order permutations alternate which claim ID denotes the target, supported anchor and contradicted anchor. Source IDs are case-local. The original S1–S3 roles are also permuted, independently of which claim ID is the target. The rubric gives the sole decisive original or follow-up source for each settled claim. The provisional source can rationally affect belief but does not settle the target. A no-new unresolved target has no world-state truth label. The supported and contradicted follow-ups define different hypothetical worlds.

The inference runner explicitly projects scenario, question, claim text and visible source text into requests. It never exposes a rubric, target ID, condition code, or branch name in a model message. The claims are evaluation units within an original task. They are not independent cases.


