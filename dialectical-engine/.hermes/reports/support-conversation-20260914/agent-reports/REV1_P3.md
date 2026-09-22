# REV1 case file — CP1 correctness review, pass 3

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-16. Node `REV1_P3`, ticket `t_88683868`, reviewer session `/root/plan_review`, exact product revision `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`, production/runtime evidence revision `606b2eabea1dc9212159e53c193cf69655424e77`, evidence freeze `bc0e85fc6013e0067cdb178a4bf7cc0526bdd72c`, source administrative HEAD `446c685e977104ecf2b0b5ee0519f7123968429f`.

## Cause and verdict

The scoped correctness verdict is **PASS**. The final architecture removes the two causes established by the earlier correctness passes. The model now sees separately reviewed projections rather than raw article bodies, and one rejected completion no longer forces an ordinary source-matched question into a generic dead end when the same immutable source has an admitted exact fallback. The response still makes exactly one model attempt. Valid drafts remain unchanged; rejected bytes are discarded; the server either returns the exact reviewed fallback with canonical provenance and trusted source-appropriate actions or retains `REFUSE_SAFETY` when no safe admitted fallback exists.

The final test-only correction fixes the remaining integration mismatch without changing production. The stale degraded fixture supplied a structured snapshot entry without `modelProjection`, so production correctly returned `NO_SOURCE` before transport. Adding only the admitted projection restores the intended one model call and keeps the fixture's missing-fallback `REFUSE_SAFETY`, exact usage and healthy relay-state assertions. The author capture passed 8/8. My independent rerun also passed 8/8, and a negative control proved the branch distinction: projection present produced one screened call, refusal, exact `3/4/0.001` usage and a healthy circuit; projection absent produced zero calls, `NO_SOURCE`, no usage and retained degraded state.

My second direct-service batch exercised an accepted draft; rejected non-JSON, wrong-kind, extra-key, unknown-source and unsafe-text completions; and missing/unsafe fallback controls. Each rejected class made one call. The five admitted-fallback cases returned the exact fallback with canonical top source, the trusted `start-debate` action and exact usage; rejected marker bytes appeared in neither stored assistant records nor returned responses. Missing and unsafe fallbacks returned `REFUSE_SAFETY` with empty sources/actions. The exact loader admitted 36/36 reviewed entries, 18 per language, with frozen projections/fallbacks; 22 capability-language context surfaces contained no closed canonical IDs, catalog routes or repository-path metadata in the bounded scan.

The actual-model evidence remains correctly attributed to `606b2eabea1dc9212159e53c193cf69655424e77`: 7/7 canonical rows were useful, six through accepted drafts and one through the exact English Settings fallback. API and DOM bytes matched; English creation pointer activation and compact Romanian keyboard activation both reached `/login?next=%2Fnew`. The final `5cbfc6d…` commit changes only `tests/integration/support-degraded.test.ts` by adding one projection line, so this review uses the live result as evidence for unchanged production behavior without relabeling it as a new live run or as model improvement.

The exact Forgot-password destination remains unknown and independently blocks CP1. The correct current behavior is still fail closed: no guessed URL, Settings/MFA substitute or new question. A PASS for this correctness scope is not CP1 acceptance.

## Price of the defects and repair loop

- The mission needed three final correctness passes because prompt/corpus/output constraints were initially distributed across prose, raw article bodies and lexical screens rather than encoded as one admission contract.
- Pass 2 reached 381 focused tests and a 23-file integrated run, then actual traffic still produced only 3/7 useful answers. The deterministic recovery design was chosen only after that stochastic architecture failed.
- The final 25-file run at `606b2eab…` spent 79.82 seconds and reached 977 passed, one failed and one TODO. Its one failure was a stale casted fixture that bypassed the strict corpus loader. A production-shaped fixture builder would have prevented that cycle.
- The attestation stage first had 77 type diagnostics because a mission-added test introduced `TS2532`; the narrow correction restored the exact inherited 76-diagnostic output. That final output is byte-identical to the captured baseline, but the project typecheck still does not pass.
- Reviewer setup incurred two avoidable failed captures: the first Vitest attempt lacked package-local dependency links, and the `tsx` CLI tried to open a sandbox-blocked IPC pipe. The successful path used the repository capture wrapper with `node --import tsx` and `TSX_DISABLE_CACHE=1`.
- Exact provider and reviewer token/cost usage is **UNAVAILABLE**. The architecture now bounds future model cost to one attempt and makes ordinary source-matched usefulness deterministic after a rejected completion.

## What I nearly got wrong

The final integrated failure initially looked like a production regression in degraded recovery. Tracing it from snapshot admission to ranking showed a test-only state that production cannot create in strict reviewed-recovery mode: the casted fixture omitted `modelProjection`. The discriminating negative control mattered because merely turning the old test green would not prove that transport, screening, usage and health were restored for the intended reason.

I also kept actual-model usefulness separate from architecture correctness. Seven useful rows are a finite observation, not proof that the model improved or that all future drafts will validate. The supported reliability claim comes from the server-owned exact fallback after one real attempt, while the strict accepted-output screen remains a separate security boundary.

## Process residue

I created one dependency symlink outside the packet's explicit optional list: `apps/runner/node_modules` pointed to the clean primary lane at the same exact revision while the targeted degraded test imported the status formatter. I noticed the scope error immediately after the run, removed that symlink, and later removed the three allowed temporary dependency links as well. No target dependency or tracked product byte was modified; final primary and detached worktrees are clean at `5cbfc6d…`. The first and successful captures remain preserved so the substrate mistake is visible rather than erased.

The retained `DONE.md` step 9 also says every malformed, credential-bearing or reset-operation completion becomes `REFUSE_SAFETY`. `SPEC-v3` and `CP1-REVIEWED-RECOVERY` supersede that sentence: an admitted same-version exact reviewed fallback may return a grounded answer; absent or invalid fallback refuses. I did not edit the frozen input. This is an owner-facing documentation discrepancy, not a runtime-contract finding in the reviewed product.

## Making the coding and review loop more efficient

The initial implementation packet should generate one machine-readable contract from the reviewed corpus and use it everywhere: production loader, fixtures, model context, fallback selection and review manifests. Tests that need a structured snapshot should call a strict fixture builder that requires the same projection, fallback and review fields as production. This removes cast-based states that cannot occur at runtime.

The packet checker should also compare the immediate product typecheck against the attributed baseline before dispatch and should derive focused/integrated suites from the changed interface graph. That would have caught the extra diagnostic and stale degraded fixture before the expensive integrated run.

The one-prompt target is now practical: freeze the reviewed projection/fallback bytes, exact source/action rules, one-attempt semantics, closed diagnostics, finding disposition table and exact verification commands in the first packet. The author can implement against finite oracles, and the independent reviewer can test the frozen representation instead of reconstructing intent through repeated prompt edits and live samples.

## Measurements and limits

- Mechanical custody: 74 lens inputs, 180 immutable GATE inputs and 108 final product paths matched their frozen hashes with zero mismatches. GATE_P3 manifest SHA-256 is `83c3d7e6e961464eb2baf2096b9ad4df5d24054c55ec81622de0732c6e8d5aa4`; final product manifest SHA-256 is `666236be2799d448df75a64ab8e3793c31fc67c4f803df297107d6d3040d60e2`.
- Reviewer execution: one focused Vitest file, 8/8; two direct-import Node/TS controls using synthetic in-memory message ports and the exact corpus loader. No reviewer HTTP server, database, browser, actual model, preview, account, credential or reset operation was used.
- The direct-service batch checked storage/return byte identity. HTTP/DOM equality and pointer/keyboard behavior come from the frozen LIVE_P2 evidence, not this reviewer's runtime.
- The retained author/attestor evidence supplies the broader persistence, rating, resolution, E1/E2/E6, no-source, private-status, human-handoff and case-summary oracles. This pass inspected their affected interfaces and did not rerun the broad suite or whole typecheck.
- Source authority is HEAD-only at `446c685e977104ecf2b0b5ee0519f7123968429f`; no source working-tree cleanliness or byte-exactness claim is made. Product primary and detached worktrees ended clean at exact `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`.
- I did not read another current pass-3 lens verdict. Root-supplied coordination contained no such verdict. Owner ratification, checkpoint advancement and ticket/finding closure remain with root.

## Skills actually loaded in this reviewer session

- `superpowers:using-superpowers`
- `.claude/skills/heartbeat-protocol/SKILL.md`
- `.claude/skills/heartbeat-reviewer/SKILL.md`
- `superpowers:verification-before-completion`
- `superpowers:systematic-debugging`
- `superpowers:test-driven-development`

