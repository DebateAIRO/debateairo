# CODE-T1C2 self-report — t_ff92db49

- Outcome: T1-C2 reached its peer-review gate in the first pass; rework rounds used: 0.
- Root cause of the main test detour: `buildFairShapedAnswer()` projects `root`, `reasoning`, and `con`, while T1-C2-1 requires both `pro` and `con`.
- Price: the impossible PRO query cost two diagnostic runs and roughly two minutes before the fixture received one explicit support edge.
- Dead end: `pnpm exec tsx -e` could not open its IPC pipe in the workspace-write sandbox (`listen EPERM .../tsx-501/*.pipe`); a temporary in-test diagnostic settled the shape instead.
- Packet defect: `.hermes/TOOLING-TRAPS.md` is mandatory to append when a trap costs time, but it is absent from this seat's exhaustive `allowed` list, so the new `tsx` IPC trap is recorded here rather than written out of contract.
- Near miss: raw contract review outcomes are `agree` / `dispute`; the card contract is `agreed` / `disputed` / `absent`. The new RED assertion caught the unadapted raw value.
- Near miss: the first bezel pass gave the shell `var(--r-card)` but omitted it on the core; T1-C2-1 stayed RED until both layers carried the radius.
- Near miss: a first-child stance strip is not necessarily a top strip under card padding; the geometry pin forced absolute `top: 0` positioning.
- The packet's quoted Terracotta trap paid off: reasoning uses `var(--reasoning-line)`, and a direct gold mutant went RED.
- AF-1 cost stayed mechanical after measuring first: 30 residual lines across seven files became zero with existing wave-0 tokens; no token was invented.
- One invalid evidence attempt was rejected: an over-escaped composed M6 grep failed in both states, so it was discarded and rerun as a valid hex-arm `1 -> 0` proof.
- Board-state defect: after atomic claim, `status` became `running` but both duplicate `assignee` and `session_id` fields remained null; title and epoch-23 authorization were the only unambiguous owner record.
- Price of that state defect: two extra ticket readbacks and a handoff caveat; it could make a stricter seat refuse otherwise authorized work.
- Efficiency upgrade: dispatch should supply or name a PRO+CON fixture for any DOM acceptance that requires both, so the first RED measures product absence rather than fixture absence.
- One-prompt-machine upgrade: `hermes kanban claim` should persist the claiming profile and CLI session, or the packet should include the exact follow-up mutation that does.
- Verification worst run: row-8 three-run law stayed 8/8 files, 85 passed, 1 reserved todo; full render stayed 21/21 files, 115 passed, 1 reserved todo.

## RW1 — authority epoch 25, rework round 1 of 3

- Outcome at this checkpoint: all requested code and pins are GREEN, but the amended 12-file row-8 gate is blocked by sandbox loopback policy, so no Hermes-ready claim is made.
- The reviewer found the exact class the hand-typed fixture union hid: `cannot-assess` was valid contract data but unconstructible through the helper and fell through to `absent` on the card.
- The helper now binds to `NodeReview["outcome"]`; four real rendered nodes prove `agreed`, `disputed`, `unassessed`, and `absent` are pairwise distinct.
- B1 cost one mechanism pin: jsdom cannot prove layout, so it asserts non-zero inline width/height plus display/radius and explicitly leaves rendered-size proof to V browser QA.
- B3 replaced identity-by-hash with direct maker ownership: Anthropic/OpenAI/Google/xAI/Alibaba map to their own `--m-*` token; Meta/Mistral/unknown use `--m-default`; no stance token remains.
- N2/N4/N5/N6 are pinned: 4px rim, root `--line-strong`, non-healthy `--surface-sunken`, and map hub `--line-strong`.
- Refutation price: six required negative mutants plus one neighbouring GREEN control took fourteen focused runs; every restore returned to the recorded SHA-256.
- Near miss prevented: testing only the new compact value could still hide carrier disagreement; the four-state test asserts both raw `data-node-review` and compact `data-review` on each node.
- Exact row-8 attempts 1/2/3 each ran 11 files GREEN (`150 passed`, `1 todo`) and skipped the ownership assertions because its suite crashed at `listen EPERM`.
- The environment cause is proven independently: the ownership file alone fails identically, and a minimal Node loopback listener returns `EPERM listen 127.0.0.1`.
- Non-socket gates: focused canvas `12 passed/1 todo`; full render `119 passed/1 todo`; ADR-006 `TS2322=1, TS2882=1, residual=0`; ADR-001 live proof `0→1→0`; root typecheck exit 0.
- One-prompt-machine upgrade: pre-dispatch verification commands that require real sockets must be capability-probed inside the worker sandbox, not only pre-verified in the orchestrator environment.
