SKILLS LOADED: heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers, superpowers:brainstorming, superpowers:executing-plans, superpowers:test-driven-development, superpowers:systematic-debugging, superpowers:verification-before-completion, superpowers:receiving-code-review

# FIX-01 v2 Task 2 worker case file

Status: READY FOR PEER REVIEW

Cause under test: pre-arm emits are counted only in the private default gap counter, so replacing the default emitter without a single-owner transfer leaves those losses permanently unreachable.

Preflight finding: the v2 plan still names base `a95e12a9`, while the Task 2 dispatch correctly pins `27bdf2a8ca97d4f13ebab48c66f49beaa1504761` after Task 1 and its review hardening. Cost: one comparison, no retry or rework round.

Near miss avoided: the three existing untracked `.hermes` reports belong to prior seats; they will remain unstaged and untouched.

Properties stated before assertions:
- Zero old losses remain zero; install never fabricates a row.
- One and 37 same-turn pre-arm losses transfer with exact source, class, and count.
- The emitter swaps synchronously, so same-turn post-swap values reach only the new bounded queue and its overflow adds to the new counter.
- The first two-argument installer is the sole owner; concurrent and later installers share its transfer and receive no copy.
- The one-argument legacy form returns `undefined` and routes the next emit synchronously.
- A capacity-two queue accepts exactly two of five post-swap emits and counts exactly three losses.

Initial RED: the focused command exited 1 with 3/8 passed and five behavior failures (one, 37, combined-old/new, concurrent ownership, later ownership). Root cause: the current one-argument seam swaps correctly but ignores the supplied counter and returns `undefined`, leaving the old private gap rows unreachable. The zero, legacy synchronous-swap, and new-queue overflow controls passed, so the failure is specifically the absent handoff.

Implemented the approved private default-state/install seam: arity one remains a synchronous `undefined`-returning swap; arity two swaps first, shares one owner promise, waits one microtask, then drains exact existing default-counter rows to that first target. Public emit functions remain synchronous and unchanged.

GREEN evidence: three consecutive required focused runs passed 8/8. Each of the seven named mutants was applied alone, killed, restored, and followed by an 8/8 run plus byte/status proof. Failures by mutant: remove transfer 5; count-to-one 4; remove wait 5; swap-after-wait 4; fabricate loss 7; recreate promise 2; legacy promise-only 1. A private-name-only non-catching control stayed 8/8.

Neighbor checks: FIX-01 architecture 2/2 and obs core 20/20 passed. Contract generation passed after the known sandbox IPC retry. Typecheck produced only the eight pinned s14-ui diagnostics. Source audit produced only the four known environment-read findings. `git diff --check` passed; frozen files are unchanged; only the two allowed tracked files will be staged. Existing and current `.hermes` reports remain unstaged.

Final pre-stage hashes: `emit.ts` `b11b30be445e5aeae2f61d8cace39790ac52a14ead679cdfe580391981074f03`; test `70400feeca372cfd7583b686637b39658b66f5753d825393ed99bf2383ae1b1a`.

Packet defect: the plan's global base is stale (`a95e12a9`); the dispatch/current Task 2 base `27bdf2a8ca97d4f13ebab48c66f49beaa1504761` is correct. Cost: one comparison, no rework round. No new tooling trap. Comments cursor: dispatch and parent directives through 2026-09-03; no Kanban cursor supplied.

Commit: `1dc5f8c6f249d1fd4e551c5705547ddaf5cd21d5` (`feat(obs): transfer exact pre-arm losses`), exactly two allowed tracked files. Post-commit focused verification passed 8/8. Tracked status is clean; all four `.hermes` reports remain untracked/unstaged.

Fix round 1 (B1): verified the reviewer finding against BASE, restored only BASE's terminal LF via `apply_patch`, and retained the approved implementation/tests unchanged. Focused verification passed 8/8. Amended HEAD `1b326053762b3a62567b8af32e47e713fc4e3500` preserves the exact subject, has BASE as sole parent, and changes exactly the two authorized tracked files. BASE-to-HEAD has no trailing deletion outside the seam; final `git diff --check` exits 0. Tracked status is clean; five `.hermes` reports remain untracked/unstaged.
