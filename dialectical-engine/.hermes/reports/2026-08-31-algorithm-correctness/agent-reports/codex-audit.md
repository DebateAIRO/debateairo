# CODEX AUDIT SELF-REPORT — CLAIM-BY-CLAIM AUTOPSY

## Murder-case finding

The expensive failure mode was not code navigation; it was semantic overloading. Several claims joined four to eight independently falsifiable statements and slid between planned behavior, materialized behavior, engine capability, and the currently bootable deployment profile. That ambiguity nearly converted precise counterexamples into softened TRUE-TODAY verdicts.

The largest engineering risk exposed by the audit is the runner's policy provenance. The runner main entry now looks fully wired, but its source is the development runner policy reader, which positively rejects anything except development refs. A filename that acts as the production entry while consuming a dev-only sealed row makes static reviews and operators overestimate production readiness. The upgrade is a production policy loader with production provenance, a startup assertion naming the runtime profile, and an acceptance test that boots the exact production entry without dev rows.

The second risk is prompt prose masquerading as enforcement. The composer is told to preserve facts, add none, and cite only supplied references, yet code validates node refs but merely copies served-number refs. The upgrade is a deterministic composer validator: whitelist node and number refs, verify every asserted fact against the frozen bundle or an explicit derivation, and fail before conformance if the model adds content outside that set.

The third risk is plan/materialization conflation. Tree and exchange planners have exact cardinalities, but transport exhaustion turns planned legs into halt records without nodes, and mono-maker runs deliberately skip expansion. The upgrade is to name and persist separate planned, attempted, and materialized node counts and test formulas only against their stated domain.

## Price paid

- Wall clock: approximately 55 minutes from repaired packet acceptance through report drafting and verification preparation.
- Static evidence passes: three broad repository searches, then focused line reads across contract/API, runner/judgement, graph/propagation, and serve/UI subsystems. The broad outputs were truncated twice, costing roughly 5 minutes of narrower repeat reads.
- Executable retries: three pnpm-exec-tsx launches failed before running any assertion because pnpm tried to create a temporary directory under /Users/stefan.nour/Library/pnpm/.tools/pnpm, which the sandbox forbids. A direct local-tsx attempt also failed because dependencies are absent, and a Corepack fallback failed because Corepack is not installed. Rough price: 6–8 minutes and zero dynamic evidence.
- Protocol rework: the original packet defect was repaired by the orchestrator and explicitly not charged to this seat. Packet v2 itself required no audit rework.

The toolchain failure should be fixed with a hermetic repository-local verification command whose executable and dependency store already exist inside the writable worktree, or with a preflight that declares static-only verification before the seat spends retries. A review packet should name the exact command expected to work in the assigned sandbox.

## What I nearly got wrong

1. C6 nearly became FALSE. Read-only history proved the omission was real in the parent of 2d1f86b8, so STALE is the accurate verdict.
2. C1 nearly became STALE by analogy. Blame/history showed the depth UI has been a 1–5 selector since introduction, so there is no evidence it was ever true; it is FALSE.
3. C15 nearly passed on the closed-form count. The formula silently assumes M>=2 and no authoring failures; current mono execution yields one root, and halted subtrees materialize fewer nodes.
4. C16 nearly passed because the planner has exactly M(M−1) legs. The runtime's halted branch records no exchange node.
5. C18 nearly passed under a narrow verdict-pipeline reading. The evaluator subsystem converts agree/dispute to 1/0, disproving the absolute phrase “nothing numeric,” even though current tau, edges, polarity, and verdict remain unchanged.
6. C20 nearly became PARTLY because the boot policy accepts only accumulate. The claim describes a present engine capability (“can”), and strict-and withholding is implemented; the boot-policy limitation belongs in the counterargument.
7. C23 nearly passed by treating the composer system prompt as a contract. The post-parse code checks node refs but does not whitelist served-number refs or deterministically compare prose facts.
8. C25 nearly passed because the mono helper is named a band cap. Its arithmetic moves one step below the candidate band before applying the ceiling; it does not derive one step below the selected ceiling.

## Dead ends and repeated token costs

- Large multi-file numbered-line reads produced more evidence than the output channel retained. The fix is to begin with symbol-level search, store a claim-to-symbol matrix, and request only 20–60 decisive lines per symbol.
- The HTML source repeats its analysis in narrative, pseudocode, gap cards, and source maps. Searching it was useful only for the “missed” section; rereading it claim-by-claim would duplicate tokens. The markdown claim specification should remain the governing artifact, as packet v2 correctly established.
- Dynamic probing without a dependency preflight repeated the same environmental failure. One initial local-executable check plus a Corepack availability check would have prevented the pnpm retries.
- Numeric line pointers are inherently stale. Symbol names plus a pinned commit are cheaper and more robust; line numbers should be generated only in the final evidence pass.

## Exactly where packet v2 remained unclear

Packet v2's routing, authority, paths, marker, and stop conditions were clear. The ambiguity was in the upstream claim specification it named:

- C1 did not define whether “web form accepts” meant selectable UI affordance, client serialization, or an API request forged outside the form.
- C15 gave an unqualified node-count formula despite simultaneously describing branch failure and elsewhere specifying mono root-only behavior. Its intended domain (M>=2, all calls successful, planned maximum) was unstated.
- C16 said “exactly one response node” without distinguishing planned exchange legs from successfully materialized nodes.
- C18's “nothing numeric” could mean only the active question-to-verdict path or every downstream numeric consumer, including evaluator profiles.
- C20's “can become unservable” did not state whether capability should be assessed in the injectable engine or only through today's runner-main policy source.
- C23 used “must” for a mixture of strict schema checks, prompt instructions, and model-based conformance. Those enforcement classes need separate clauses.
- C25 used “one step below the ceiling” for code that actually moves one step below the candidate and only then applies the ceiling.

These ambiguities were resolvable from code, so none justified CANNOT-ASSESS, but each consumed extra evidence passes and should be removed from future one-prompt packets.

## What must be upgraded

1. Generate a machine-readable claim manifest in which every clause has one subject, one runtime profile, one quantifier, and one expected evidence symbol.
2. Split plan invariants from execution invariants and expose planned, attempted, and materialized counts in the run ledger.
3. Replace composer trust with deterministic fact/reference validation before model conformance.
4. Separate development and production entrypoints or make the runtime profile explicit and fail if provenance does not match it.
5. Preserve review outcome as an explicit disagreement dimension instead of using row existence for standing while separately numericizing outcome in evaluator profiles.
6. Add a real edge-magnitude producer or remove the misleading evidence-verifier source label until one exists; today's UNKNOWN-only edges make debate propagation numerically inert under accumulate.
7. Provide a hermetic, sandbox-compatible audit test launcher and a preflight that reports whether dynamic verification is available.
8. Add an executable claim audit that asserts C1–C26-like invariants at the pinned production profile and emits the evidence matrix directly.

## Turning this into a better one-prompt machine

A stronger single dispatch would contain only the typed ticket state plus one immutable manifest path. That manifest should pin the commit; enumerate each atomic claim; state whether it targets UI, API, engine, or bootable production; distinguish nominal, successful, and failure-path behavior; provide the exact local verification command; define the verdict boundary for mixed clauses; and prescribe a machine-checkable report schema. The agent could then run one generated evidence harness, investigate only failed or uncovered clauses, and render the final markdown from the evidence matrix. That would reduce repeated source loading, prevent prompt-language assumptions from becoming code claims, and make peer adjudication mostly a review of counterexamples rather than a second full repository traversal.
