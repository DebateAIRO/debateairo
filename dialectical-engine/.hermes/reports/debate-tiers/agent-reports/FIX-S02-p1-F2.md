# FIX-S02-p1-F2 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

Commit `88f8a01f` closes five review findings in four authorized paths. The seat ran from CLAIM at 12:39:59 EEST to commit/report preparation at 13:03 EEST, about 23 minutes. Exact billed tokens are UNVERIFIED because this harness exposes no per-turn counter.

## Finding 1 — the assertions observed downstream symptoms instead of the claimed properties

CAUSE: four separate guards watched a weaker boundary than their prose claimed. The refusal cases checked a code but not all missing model ids; R8 checked absence of SQL but not the thrown refusal; evaluator isolation checked a panel after the tier filter had already removed the evaluator; the caller inventory scanned one API file and package `src` trees rather than production. These are one class: an assertion can remain green when an earlier transform makes its discriminator unreachable.

PRICE: six pre-edit reproductions (M2, the two-cell evaluator probe, M16, M17, invalid-tier scratch probe, M10), five required post-edit mutant runs, three neighboring mutants, and four repeated refutations after test-shape corrections. Direct test time was about 80 seconds; orchestration and log inspection occupied roughly 9 minutes. Transcript-token cost is UNVERIFIED, but the mutation frames and restore receipts account for about one third of the seat's tool calls.

NEAR MISS: the first wire rewrite walked only `apps/*/src` and `packages/*/src`. That caught the supplied `apps/api/src/main.ts` mutant but still omitted production under `apps/ui/app`, `apps/ui/lib`, and `apps/ui/components`. The class sweep led to walking all `apps/` and `packages/` TypeScript sources while excluding build and test directories.

RECOMMENDATION: every assertion manifest should name the observation boundary, the transform that could make the discriminator vacuous, one target mutant, and one neighboring mutant that stays outside its scope. VERDICT: add these four fields to packet-declared assertions / CONFIDENCE high / STRONGEST COUNTER: some assertions span several transforms, but that is a reason to split the property or enumerate the boundaries rather than leave them implicit.

## Finding 2 — full-file reading consumed the largest context block

CAUSE: the four write-surface files total 3,460 lines, including two files near 1,500 lines each; the packet also required the union, oracle, reviewer ranges, predecessor records, sibling handoffs, and role contracts. One append-only decision file exceeded a single tool response and had to be reread in non-overlapping pages.

PRICE: about 5 minutes before the first mutant run at 12:44:52 EEST. Exact token billing is UNVERIFIED; the source-only reads comprised several tens of thousands of input tokens and dominated the transcript before any test ran.

DEAD END: the first full `DECISIONS.md` read was truncated and therefore did not satisfy the reading floor; two bounded page reads were needed.

RECOMMENDATION: generate hashed, non-overlapping context pages for large allowed files, with the complete changed function and test describe-block first and automatic continuation to EOF. VERDICT: make pagination a packet-runner operation / CONFIDENCE high / STRONGEST COUNTER: localized extracts can miss distant coupling, so the machine must still prove full coverage when the contract requires a full-file read.

## Finding 3 — static typing caught a test-only regression before the final table

CAUSE: the evaluator helper stored the raw panel under an explicitly narrowed `{ provider_ref, maker }` type, then returned that value from `resolveDiscoveredPanel`, whose contract requires every `DiscoveredPanelMember` field.

PRICE: one typecheck run with one new diagnostic, one type-only patch, one focused evaluator rerun, one second typecheck, and a repeated evaluator target/neighbor mutation pair. About 45 seconds and one evidence restart; exact tokens are UNVERIFIED.

NEAR MISS: runtime Vitest was green because transpilation erased the narrow annotation. The inherited-red typecheck delta was the only gate that exposed it.

RECOMMENDATION: preserve the declared producer type when capturing intermediate values in tests, and run allowed-path typecheck before the definitive mutation matrix. VERDICT: keep static-delta before final refutations and repeated clusters / CONFIDENCE high / STRONGEST COUNTER: focused runtime RED is still the first useful signal, so static checks belong after minimal GREEN, not before TDD.

## Finding 4 — one promoted probe correctly stays red after the fix but lacks a transition-aware oracle

CAUSE: `REV-S02-p1-correctness-tests-slice-probe.test.ts` records the old `TypeError` outcome as an equality. After the boundary fix, six cases pass and that observation case fails because it receives `AskRefusal/ASK_PLAN_TIER_INVALID` with `The gold plan tier is invalid`.

PRICE: one expected-red promoted-probe run plus manual extraction of the received/expected diff, about 10 seconds and one judgment point. The packet explicitly warned about this, so there was no retry.

RECOMMENDATION: promoted probes should label assertions as invariant or observation-at-head and publish the expected transition for assigned fixes. VERDICT: add transition metadata to promoted probe headers / CONFIDENCE high / STRONGEST COUNTER: an immutable historical probe is valuable evidence; transition metadata keeps it immutable while making later verdicts mechanical.

## Finding 5 — the packet's restore wording is mechanically contradictory after implementation begins

CAUSE: packet §3 requires `git status --porcelain -- <mutated path>` to print nothing after each restore while also allowing the seat's intended diff in that same allowed path. Once `apps/api/src/index.ts` legitimately differs from HEAD, a byte-perfect restore to the saved green file necessarily prints `M`.

PRICE: no lost work because snapshots and `cmp` were used; each post-fix restore required interpreting `M` as the intended partition rather than an unrestored mutant. This added roughly 12 status checks and 1–2 minutes. Exact tokens are UNVERIFIED.

RECOMMENDATION: define restore success as byte equality to the captured snapshot plus a status result equal to the pre-mutation status for that path. VERDICT: compare status-before and status-after, never require an absolute empty result / CONFIDENCE high / STRONGEST COUNTER: pre-edit reproductions do require empty status, which remains a special case of equality to the captured state.

## Tooling dead ends

- The first CLAIM command passed an unexported shell variable and was rejected with `comment body is required`; the corrected literal command succeeded. PRICE: one CLI retry and under 20 seconds.
- The supplied evaluator mutant script returns rc 0 after a deliberately failing Cell B because the restore trap's final command wins. The seat used the cell summaries, not wrapper rc, as the evidence. PRICE: one manual log read per invocation.
- The generic capture script was insufficient for final gates because the packet makes the runner marker authoritative. A second exact-count runner was required. PRICE: one scratch script and nine invocations.

## One-prompt machine route

Compile the packet into one executable manifest containing: exact HEAD and branch; read pages with hashes; writable and temporary-mutant paths; property/target/neighbor triples; pre-fix and post-fix expected outcomes; capture-first unique log names; exact file/test counts; allowed-path diagnostic filters; restore status-before/status-after equality; exact staging paths; self-report fields; ticket cursor; and READY rendering. The runner should stop on any mismatch and emit `BROKEN`, `UNVERIFIED`, or `BLOCKED` without a prose reconciliation pass.

VERDICT: generate both the human packet and executable seat runner from the same typed manifest / CONFIDENCE high / STRONGEST COUNTER: code-specific mutants still need human authorship, so the manifest automates execution and evidence while leaving property selection and mutant quality reviewable.
