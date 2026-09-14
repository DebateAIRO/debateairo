SKILLS LOADED: heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers, superpowers:brainstorming, superpowers:executing-plans, superpowers:test-driven-development, writing-good-tests, superpowers:systematic-debugging, superpowers:verification-before-completion, superpowers:receiving-code-review, superpowers:using-git-worktrees

# FIX-01 C3 implementer case file

- The core defect was absence of the runtime-to-frozen-installer Tier-1 hook: the real RED measured `installCalls=0`, while installer-only exit cases still passed through Tier 0.
- The smallest lawful seam was the existing branded `prepare()` plus `appendOnExit()` pair; one closure and one pre-call boolean guard avoided edits to every frozen surface.
- Six focused child-process tests cost about 1.5 seconds per run. The required seven mutation/restore cycles plus two syntax-evasion reruns cost roughly 30 seconds of test time and killed every named fault.
- The embedded PostgreSQL nearby run cost about 5.5 seconds and needed sandbox permission because local loopback bind is denied in workspace mode. This trap was already documented in `.hermes/TOOLING-TRAPS.md`, so no duplicate entry was added.
- `tsx` contract generation also hit the already-documented local IPC `listen EPERM` trap; the permitted rerun completed in under one second and generated no diff.
- I nearly missed the required `ambient_context_ref` member on the synthetic redactor input. Runtime tests transpiled it, but typecheck found the single C3 diagnostic; adding explicit `undefined` returned the result to the known eight UI-only diagnostics.
- I also nearly left source bans tied to one quote/spacing spelling. Parent review requested syntax-flexible checks; spaced single-quote listener and spaced exit mutants then proved the class-level guard.
- Dead end: treating the sandbox-blocked embedded database run as product RED would have been false evidence. The permitted rerun passed 16/16 before implementation and 22/22 after it.
- Packet defect: `PLAN-FixAgent.md` was not present in this linked-worktree checkout even though the brief bound it. The absolute main-tree copy existed and was read completely, so the defect cost one lookup and did not block design.
- A future packet can remove that lookup by supplying the absolute authoritative plan path that actually exists in the assigned checkout, or by pinning its blob hash and alternate readable path.
- A future C3 brief can state `ambient_context_ref: undefined` in its sample self-envelope and require syntax-flexible source bans from the first RED, eliminating one typecheck correction and two review-driven mutant reruns.
- The final proof is specific: it distinguishes Tier 1 from Tier 0 through the required install callback and `fallback_minimized=false`, while no-fd and failed-preparation probes require zero install calls.
- Frozen bytes were checked by worktree-vs-BASE blob identity across 16 installer/core/spec/prior-test paths, rather than inferred from `git status`.
- Final state: C3 focused 6/6 three times; combined C3+C1+C2 22/22; architecture 2/2; exact eight known `s14-ui` type diagnostics; zero FIX-01 type diagnostic.
- Commit: `7b1aa223538eebbcd3dea097a93ce990c6d81a88`; tracked and staged diffs are empty. The case report is untracked, the task report is gitignored/untracked, and all earlier untracked reports remain untouched.

READY FOR PEER REVIEW
