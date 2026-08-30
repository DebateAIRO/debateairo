# S01-STRICT Codex self-report

- Seat: S01-STRICT, first-pass implementation of S01-C1-6 plus Architecture-directed rework; round 1 of 3.
- Outcome: changed `NodeSchema.stranger_restatement` from `.passthrough()` to `.strict()`, added contract assertions, and localized the intentionally-invalid publication fixture behind one type-only cast.
- Root cause closed: the nested schema was the contract's lone open key set, so Zod preserved arbitrary fields in parsed `Node` values.
- RED evidence: the focused contract run executed six tests and failed only because the smuggled-key parse did not throw; the five surrounding tests passed.
- GREEN evidence: the same file passed 6/6 after the one-token production change.
- Refutation evidence: the rejection issue is `unrecognized_keys`, names `SMUGGLED_OWNER_SECRET`, and points to `stranger_restatement`.
- Neighbor control: `{ check_status: "FAIL" }` remains valid, so the test does not reject a declared key with another legal enum value.
- Cluster evidence: the authored S01-C1 command passed 34/34 in each of three runs; worst run was GREEN.
- Blast-radius finding: the packet's measured-zero claim is false at compile time even though its runtime trace is correct.
- First-pass exact break: `pnpm run typecheck` failed at `tests/unit/s8-publication.test.ts:126`; `secret_extra` was no longer assignable to the strict inferred `Node` type.
- First-pass attribution: that publication fixture was initially outside this seat's file contract, so it was reported and left untouched until Architecture widened S01's surface in `t_cc34ba78`.
- Separate pre-existing failure: the broad publication run was 68/69 because the database test at line 1712 supplies no `nodes`/`edges` and fails in `publish()`'s `.map()` calls.
- Baseline proof: that database test fails identically with the contract temporarily restored to `.passthrough()`, so `.strict()` did not cause it.
- Price: blast-radius attribution cost two embedded-PostgreSQL starts and about 17 seconds of test wall time; it prevented a false claim that strictness broke the database behavior.
- Near miss: relying only on Vitest would have repeated Architecture's “zero” conclusion because Vitest transpiles the fixture without the repository typecheck.
- Dead end avoided: no fresh `Node` fixture was built; the proven-valid fixture prevented enum/required-field failures from masquerading as the intended RED.
- Packet clarity: the code/test surface and required mutant were precise; “blast radius zero” should have distinguished runtime parse calls from inferred-TypeScript consumers.
- Harness improvement: make `pnpm run typecheck` part of blast-radius acceptance whenever a Zod schema change alters an exported inferred type.
- Rework RED: `npx tsc --noEmit` produced exactly one diagnostic, TS2353 at line 126 for `secret_extra`; `owner_note` was the hidden second excess key.
- Rework fix: cast the whole fixture object to `Node["stranger_restatement"]`; both leak-shaped keys and every redaction assertion remain byte-for-byte present.
- Rework GREEN: typecheck exited 0 in all three verification runs; the combined publication/contract run passed 31/31 each time.
- Discrimination evidence: anchored output confirmed the HANDLE_MARKERS, stranger-restatement leak, and disagreement leak tests all executed and passed in every run.
- Rework price: one two-line test-file change (type import plus cast), one compiler RED run, and three approximately 2.5-second verification runs.

## t_83df0d9c — S01-C1-7 first pass

- Outcome: derived `PublicNodeSchema` from `NodeSchema`, overrode only `disagreement` with `z.null()`, wired the public envelope to it, and typed `redactNodeForPublic` as returning `PublicNode`.
- Dispatch blocker: the first packet pointed at `e879f87`, where S01-C1-7 did not exist; refusing to reconstruct the design cost one routing round but prevented another SYNC-01 divergence. The corrected base is `7bfe662`.
- Current-hole reproduction, before edits: `{"accepted":true,"preserved_disagreement":{"internal_note":"LEAK-ME"}}` from the real `PublicDebateSchema`.
- TDD RED: the named contract test failed only at the public assertion with `expected true to be false`; its owner-side non-null parse had already executed successfully.
- GREEN: the same test rejects the public record, accepts the otherwise-identical null public node, and preserves the non-null record through owner `NodeSchema`.
- Primary refutation: rewiring `PublicDebateSchema.answer.nodes` to `NodeSchema` turned the named test RED; restoring `PublicNodeSchema` turned it GREEN.
- Compile-time refutation: changing `disagreement: null` to `disagreement: node.disagreement` produced TS2322 at `apps/api/src/publications.ts:57`; restoring it returned `npx tsc --noEmit` to exit 0.
- Neighbor mutant: behaviorally equivalent direct `.extend({ disagreement: z.null() })` stayed GREEN, showing the test pins boundary behavior rather than source spelling; the specified `.omit().extend()` form was restored.
- Unit cluster: all three required files passed 34/34 in each of three runs; the public-boundary, publication-redaction, and S04 carrier tests were named in anchored output every time.
- Architecture baseline packet defect: the dispatched `7 failed / 263 passed` was not reproducible at clean `7bfe662`; all three pre-change and all three post-change runs were identically `6 failed / 264 passed` in the same five files.
- Runtime-inventory packet defect: direct grep found 17 executable `PublicDebateSchema.parse/safeParse` expressions before this test, not 15 (3 product, 14 test); all 17 origins were traced and none supplies a non-null public disagreement after projection.
- Compile-time inventory: six files import `Node` and eight import `PublicDebate` (three overlap); with the contract definition this is 12 unique files, so the PLAN's unexplained “13 sites” is not a reproducible file count. Full typecheck is the controlling evidence and is clean.
- Near miss: accepting the PLAN's counts would have repeated `t_cc34ba78` at the measurement layer even though the implementation itself has zero observed compile-time breakage.
- Price: three pre-change architecture runs plus three post-change runs cost about 110 seconds; that established exact filename identity and exposed the stale baseline rather than laundering it into the handoff.

## t_65236b16 — blind-review rework round 1

- Finding reproduced before the test edit: a selective schema mutant accepted only `{ secret_panel_note: "STILL-LEAKS" }` in addition to null.
- Under that mutant the current named test stayed GREEN, while an independent public-envelope probe printed `{"accepted":true,"preserved_disagreement":{"secret_panel_note":"STILL-LEAKS"}}`.
- Root cause: one rejection fixture proved “not this object,” while the test title claimed the universal null-only boundary.
- Fix: the rejection arm is now a labeled table covering the existing keyed object, `{}`, an unrelated key, and a nested object; soft assertions execute every row before reporting failures.
- Finding-mutant RED: the strengthened test fails specifically with `unrelated key: expected true to be false`, so the new row—not an unrelated parse defect—catches it.
- Existing-mutant RED: reverting the split makes all four rows fail; `.catch(null)` and preprocess-to-null also make all four rows fail because success is not rejection.
- Restore evidence: after each transient product mutant, porcelain showed only the four intended ticket files; the reviewed contract and publications diffs returned to their prior forms.
- Near miss caught before handoff: an initial exact-issue assertion failed the selective mutant on `invalid_union` for the old fixture before reaching the admitted new key—another right-answer/wrong-reason check. It was removed in favor of behavior-only assertions.
- GREEN: the correct schema passes the named test, owner `NodeSchema` still preserves its disagreement object, and the null public control remains accepted.
- Three-run unit verdict: 34/34 passed in every run, with the boundary, publication-redaction, and S04 carrier tests named and no skips.
- Typecheck: `npx tsc --noEmit` exits 0.
- Architecture verdict: three runs have the same five failing files as the pre-rework baseline; the instructed variable S9 worktree-walk failure did not appear.
- Scope held: the only durable rework code change is `tests/unit/contract.test.ts`; no sibling redaction or `contractInventory` work was absorbed.
