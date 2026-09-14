SKILLS LOADED: heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers, superpowers:test-driven-development, superpowers:systematic-debugging, superpowers:verification-before-completion, superpowers:receiving-code-review, writing-good-tests

# FIX-01 v2 Task 1 implementer case file

Status: READY FOR PEER REVIEW

- Cause: C1 encoded an invented handle-return/two-argument stop contract instead of the frozen installers' one-options-object, `void | Promise<void>` start contract.
- Price: the initial compiler RED added five FIX-01 diagnostics above the eight pinned diagnostics; the minimal declarations removed all five.
- The strongest near-miss was in the brief's test recipe: comparing a function parameter to its own exported options type did not detect renaming `spoolFd`.
- Price of that gap: one non-discriminating mutant run, one parent ruling, one test correction, and two additional compiler runs; no production redesign.
- Fix: an independent exact options literal now pins `runtime`, `spoolFd`, and `installExitSink`, while source extraction proves each frozen installer has exactly those three option fields and no fourth.
- Named mutant results: start rename TS2724; `spoolFd` rename TS2741; removed stop argument TS2344; positional start TS2322/TS2344; `@debateai/db` import failed the import gate at line 48.
- Supplementary mutants: returned token TS2322/TS2344; fourth public field TS2741.
- Neighbour controls stayed accepted: local parameter-variable renames retained only the pinned baseline; an allowed `node:buffer` import kept 5/5 tests green.
- Every mutant was restored by inverse patch; porcelain was checked after each restore; the final runtime hash matches the pre-mutation GREEN hash.
- Final cluster evidence is three green runs, each 5/5; worst run GREEN. Final typecheck has exactly eight pinned `s14-ui` diagnostics and zero FIX-01 diagnostics.
- Commit `4bc106cb2214997154c0d20a22b9d414ee048a5a` has the exact required subject and exactly the two authorized C1 files.
- The first `pnpm generate:contract` attempt hit the already-documented sandboxed `tsx` IPC `listen EPERM`; the approved retry exited 0. Price: one failed invocation and about seven seconds.
- Dead end recorded: the original self-referential type comparison cannot prove field names, even though it looks exact; source presence regexes also cannot link renamed runtime fields to private installer types by themselves.
- Packet clarity defects: required mission `INSTRUCTIONS.md` is absent, and checked-in `FIX-01/PLAN.md` is still an unfilled scaffold; the absolute v2 task brief was the executable contract.
- No new tooling trap was found, so `.hermes/TOOLING-TRAPS.md` was not appended. No installer, architecture test, C2 file, or external service was touched.
- Efficiency upgrade: packet authors should mutation-run every promised compiler pin before dispatch; this would have caught the `spoolFd` self-comparison at authoring time.
- One-prompt-machine upgrade: make the exact options-shape assertion and exact private-field-set extraction standard in runtime-contract ticket templates, and generate the mission `INSTRUCTIONS.md` before lane launch.
- Comments read through: parent dispatch and directives through the 2026-09-03 final-check instruction; no Kanban cursor supplied.
- Fix round 1 adopted reviewer B1 after reading the reviewer report and reloading receiving-code-review, TDD, writing-good-tests, systematic-debugging, and verification-before-completion.
- False green reproduced before editing: adding top-level `optionalExtra?: string;` to the API installer's private start options left the old named contract check green at 1/1 selected test.
- Root cause: the source extractor matched only fields beginning with `readonly`; optional or mutable top-level fields were invisible.
- Test-only fix: scan the extracted options block for optional/mutable/readonly field forms while tracking delimiter nesting so multiline callback parameters cannot become top-level fields.
- Final-byte refutation: the same `optionalExtra?: string;` mutant failed the named check with `optionalExtra` as a fourth received field at line 92; the installer was restored by inverse patch to SHA-256 `e7a28df0d78becc323ccadc986260846477e15d65a620cde33e130a21c156fea`.
- Final corrected state: the exact focused command passed 5/5 three times; typecheck reported exactly the eight pinned `s14-ui` diagnostics and zero FIX-01 diagnostics; diff check passed.
- All three installers and the architecture test have zero diff from `a95e12a9`; runtime has zero diff from the pre-round Task 1 commit. No production or frozen final byte changed.
- Fix-round commit `27bdf2a8ca97d4f13ebab48c66f49beaa1504761` has exact subject `test(obs): harden FIX-01 installer contract` and contains only `tests/unit/fix01-runtime-shape.test.ts`. Reports remain untracked and unstaged.
