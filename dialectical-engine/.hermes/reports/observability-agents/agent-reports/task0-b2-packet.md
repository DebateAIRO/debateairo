SKILLS LOADED: `superpowers:using-superpowers`; `superpowers:brainstorming`; `superpowers:systematic-debugging`; `superpowers:verification-before-completion`; repository `heartbeat-worker`; repository `heartbeat-protocol`.

# Task 0.4 B2 packet-author seat report

Date: 2026-09-03 (Europe/Bucharest)  
Seat: Task 0.4 B2 architecture-ruling request author  
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan`  
HEAD: `2b670d3059c60d7262cf655bd5d402c88100dff3`

## Delivered artifact

- `.superpowers/sdd/PLAN-FixAgent/task0-b2-ruling-request.md`

The packet is a request, not an architecture ruling. It gives the exact conflict, current semantic-region bytes and hashes, merge history, three possible meanings for `BASE_REF`, effects on FIX-04 and FIX-06, a smallest sound recommendation, exact verification commands and mutants, and the human/Hermes decision form.

## Measured evidence

- `tests/unit/obs-l2-s04-zone.test.ts:33` hardcodes `29f370e0f1017245aa26443ad366e020e815c301`.
- The resolved region at `29f370e…`, S04 implementation commit `7a3ff398…`, and lane tip `5f0bd546…` is 1,986 bytes, SHA-256 `6df1ec02d93796abb648eeed51b706e0ec35c5d4096d61b024c80e070e4eb657`.
- The resolved region at accounts commit `0cec59ef…`, S04 merge first parent `7b3a306…`, S04 merge `3e91cf42…`, and current `2b670d30…` is 1,653 bytes, SHA-256 `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d`.
- `git merge-base 7b3a306… 5f0bd546…` returns `29f370e…`.
- `git diff 29f370e… 7a3ff398… -- apps/api/src/index.ts` is empty.
- Relative to first parent `7b3a306…`, merge `3e91cf42…` adds the S04 test/helper and does not change `apps/api/src/index.ts`.
- The current region resolves `shapeOk: true` with exactly the three ruled POST mounts.

Focused suite, three consecutive runs:

```sh
pnpm vitest run tests/unit/obs-l2-s04-zone.test.ts --reporter=verbose
```

All three runs exited 1 with `2 failed | 15 passed (17)`. A fourth post-write verification run reproduced the same counts and failure identities. The two failures were the `6df1ec…` versus `bff20f…` ZI-2 mismatch and stale `g4` no-op. No code was changed to obtain this result.

I executed the proposed semantic `g4` construction against both old and current sources. It applies a real byte mutation and returns resolver disagreement on each: `(brace=230, indent=219)` at `29f370e…`; `(brace=751, indent=740)` on the current worktree.

## Recommendation carried by the request

ZI-2 should be a per-slice delta invariant. An active worktree gets one explicit full starting SHA recorded at admission. After merge, the evidence compares the merge integration parent to the landed merge result, while current workspace shape stays under baseline-free ZI-1. The proposed S04 historical pair is `7b3a306… -> 3e91cf42…`. FIX-04 and FIX-06 each record their own later base; FIX-06 still waits for FIX-04 and F-7.

This is not binding until architecture/Hermes returns a choice and V/the human custodian ratifies it.

## Sources read

- Full Task 0, FIX-04, FIX-06, and open-decision sections of the assigned authoritative `PLAN-FixAgent.md`.
- Full committed FIX-04 and FIX-06 SPEC, PLAN scaffold, DECISIONS, and PROGRESS files.
- Full S04 correction and peer-ruling documents, relevant post-synthesis rulings, full state-audit B2 evidence, and the exact current test/helper.
- Full `.hermes/TOOLING-TRAPS.md`, repository instructions available at the main checkout, repository README, heartbeat skills/protocol, and all four requested Superpowers skills.
- Git ancestry, merge-parent diffs, blame, commit metadata, and semantic resolver output for every SHA reported in the packet.

## Source-integrity note

The assigned plan is untracked in the main checkout. Main-checkout FIX-04/SPEC.md and FIX-06/SPEC.md each have a two-line uncommitted edit. This packet uses the committed frozen contracts at `2b670d30…` and reports the main differences only as unratified context.

## Scope and handoff state

- Changed only the ruling-request packet and this seat report.
- Did not edit `BASE_REF`, the S04 test/helper, product files, excluded-zone files, specs, decision logs, the active plan, boards, tickets, or external state.
- Did not invoke Hermes, Grok, web, or any external connector.
- Did not stage or commit.
- Pre-existing/shared changes were left untouched, including `FIX-07/DECISIONS.md` and other agents' report files.
