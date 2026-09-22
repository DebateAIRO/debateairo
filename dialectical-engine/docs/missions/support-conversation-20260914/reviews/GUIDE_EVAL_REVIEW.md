# GUIDE_EVAL_REVIEW — bounded evaluation-contract review

## Verdict

**REWORK.** The committed 50/60 result is not a production-equivalent Support evaluation, and the frozen production-context evidence exposes a separate retrieval defect. The ten class-A expectations must not be changed to `NO_SOURCE` merely to make the suite green.

Revision reviewed: `714c7aa9f649b3e1bff4c517cb69b7245f68d9a3`. The detached lane was clean. All 32 indexed author artifacts matched their recorded SHA-256 and byte counts.

## Findings

### B1 — the committed evaluator uses the legacy corpus and answer contract

`tests/support-eval/run.ts:382` calls `loadHelpCorpus(content)` without the exact review manifest or recovery components. Its answer service at lines 395–397 does not enable `requireStructuredDraft`, and its deterministic relay at lines 341–347 returns prose rather than the production JSON contract. Production instead loads the exact manifest and recovery file with `requireReviewedRecovery:true` (`apps/api/src/main.ts:79-85`) and enables `requireStructuredDraft:true` (`apps/api/src/main.ts:488-496`).

That difference directly explains the committed ten failures. `SUP-A-01..05` and `SUP-A-11..15` require six article IDs in EN/RO whose front matter has blank owner ratification. They are nevertheless admitted to production as exactly reviewed projection/fallback records by `packages/support-kb/src/index.ts:530-635`. The legacy answer path filters those entries out and returns `NO_SOURCE`; production does not. Class E 6/6 is useful evidence for the new fixed public-boundary refusal, but it does not cure the A fixture mismatch.

### B2 — the production context has overbroad and misordered retrieval

The approved pure in-memory discriminator used the exact detached context/catalog code and exact detached 38 projection entries. It reproduced the meaningful A/B part of the author's strict diagnostic:

- Six positive controls omit at least one required source: `SUP-A-05`, `SUP-A-06`, `SUP-A-09`, `SUP-A-14`, `SUP-A-15`, and `SUP-A-19`.
- Five negative controls wrongly produce sources: `SUP-B-01`, `SUP-B-02`, `SUP-B-03`, `SUP-B-05`, and `SUP-B-06`. Only `SUP-B-04` remains source-free.
- The other fourteen A controls contain every required source. This narrows the defect; it does not justify replacing all existing retrieval behavior.

The source-to-sink is concrete. `buildSupportKnowledgeContext` admits a capability on any positive catalog overlap (`context.ts:181-205`), assigns every sibling article in that capability a large order-based score (`context.ts:227-246`), and emits up to three (`context.ts:248-252`). `createSupportAnswerService` treats any emitted source set as answerable (`answer.ts:212-250`); an invalid strict draft may then recover from the first entry's fallback and return it as grounded (`answer.ts:335-354`). This makes a generic token such as “plan”, “debate”, “availability”, or “features” sufficient to turn unsupported price/model-count/verdict/SLA/roadmap questions into answer candidates, while directly relevant sibling articles can be displaced by catalog order.

The discriminator imported only absolute detached `context.ts` and `catalog.ts` paths. It constructed entries from detached article/component bytes so the mutable primary workspace package symlink could not participate. Its log records code and corpus hashes and exited 0. It did not call a model, HTTP server, database, browser, or network.

## Smallest correction contract

The correction owner should change only the following functional surfaces unless a test proves another immediate dependency:

1. `tests/support-eval/run.ts`: build the fixture from the exact composed revision's review manifest, recovery components, and content with `requireReviewedRecovery:true`; enable the strict answer contract; keep the immutable snapshot lookup. Replace the prose relay with a deterministic valid JSON relay that cites the opaque source references supplied in the output contract. It must not consult case expectations.
2. `packages/support-kb/src/context.ts`: require meaningful article/capability evidence before admitting a source, and rank direct article relevance ahead of unrelated sibling order. The corrected context must include all required sources for the six named A controls and return no sources or actions for the five named B controls.
3. `tests/unit/support-context.test.ts` and `tests/support-eval/run.test.ts`: add the exact A/B producer/consumer regressions. Preserve all B `NO_SOURCE` expectations and the six class-E fixed-refusal cases. Do not loosen expected outcomes or required sources solely to obtain green.

If the independently authored guide corpus changes an expected source at composition, the case may change only when the newly reviewed article actually replaces that fact. Pin the composed `kbVersion` and record the mapping; do not infer it from a moving primary workspace.

Verification is one pure 26-case context matrix followed by one isolated `--runs=1` evaluation at the exact composed revision. Require A required-source subsets, B empty source/action sets and `NO_SOURCE`, class E 6/6 with zero private/model tool calls, and no regressions in C/D/F/G. A controlled relay proves structural routing and response handling, not live-model quality.

## Limits

No product, source, Git, index, KB, metadata, model, HTTP, browser, or acceptance change was made. The probe did not import the mutable primary loader or execute Support. Incoming KB authoring may change the final composed snapshot, so the correction must bind its fixture and evidence to that exact revision. Live model quality remains unverified.
