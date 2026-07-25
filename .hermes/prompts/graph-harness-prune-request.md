GRAPH-HARNESS PRUNE REQUEST — LEDGER WITH V'S RULINGS (post final-push; V ruling #4)
Written 2026-07-24 by Claude (per Task 6.6). Nothing was executed before V's per-item answer; V's answers recorded verbatim; only unambiguous approvals executed.

Item 1 — remove the merged skill-dev worktree
- target: C:/Users/vladm/Desktop/debate/DebateV2-skill-dev-20260710-170226
- receipt: was present in `git worktree list` @ 420d8be; merged proof: `git branch --merged` listed `+ hermes/heartbeat-skill-dev-20260710-170226`
- V's answer: "yes"
- EXECUTED 2026-07-24: `git worktree remove` — REMOVED-CLEAN; post-check: worktree list count 0, directory gone. Branch ref retained.

Item 2 — dispose the ts-t1-proof snapshot
- target: C:/Users/vladm/Desktop/debate/ts-t1-proof (67M)
- what it is (V asked): a disposable before/after test-fixture snapshot pair (`baseline/` vs `candidate/`) from the 2026-07-14 truth-seeking TS-T1 isolated-runtime-proof run — plain copied directory trees (not a git worktree), each carrying stale copies of the old protocol docs; identified in the migration audit as fully disposable and referenced by nothing live.
- V's answer: "what are those?" → explained above; AWAITING V's yes/no. NOT executed.

Item 3 — reference-archive moves (~90 dated postmortems out of the Lite/FULL reference pools)
- V's answer: "no. we need them" → RULING RECORDED: NO archive moves; all reference files stay exactly where they are. The Task 3.9 kept-vs-archived index remains as documentation only. CLOSED — nothing executed, nothing will be.

Item 4 — transient push worktree
- target: C:/Users/vladm/Desktop/debate/DebateV2-dev-push (created by Claude-Router solely to fast-forward origin/dev; branch push/graph-harness-migration = e436c1d, fully pushed)
- V's answer: "only if transient" → it is purely transient (single-purpose, fully pushed, no unique state). EXECUTABLE under this answer; held one beat for the Item-2 reply so removal happens in one pass — zero risk either way.

Item 5 — rogue session-root Claude skill deletion
- target: C:/Users/vladm/Desktop/debate/.claude/skills/_retired-heartbeat-protocol-rogue-20260723/
- precondition (ruling D1): delete only when the new Claude application skill has landed — receipt: session-root skills dir contains ONLY the retired dir; replacement NOT landed.
- V's answer: "only cause deletes when done" → matches D1 exactly: HELD until the replacement skill is live. NOT executed.

Item 6 — .pre-v3.bak pre-migration originals (LITE 873-line, FULL 989-line, reference files, rogue backup)
- V's answer: "yes, keep" → RULING RECORDED: all backups KEPT. CLOSED — nothing executed, nothing will be.

Standing state after this ledger: executed = Item 1 only; awaiting V = Item 2 (yes/no after explanation); pending-by-condition = Item 4 (one-beat hold), Item 5 (D1); permanently closed as KEEP = Items 3 and 6.

--- EXECUTION UPDATE (2026-07-24, second pass) ---
Item 2 — ts-t1-proof: V ruled "Stale data that we do not need or use, you can delete" -> EXECUTED: rm -rf; post-check: directory gone (67M freed).
Item 4 — DebateV2-dev-push worktree: transient condition confirmed -> EXECUTED: git worktree remove; post-check: absent from worktree list; branch ref push/graph-harness-migration retained (its deletion was never requested).
Final ledger state: Items 1, 2, 4 EXECUTED; Items 3, 6 CLOSED-KEEP by V ruling; Item 5 HELD for D1 (new Claude skill landing). Prune complete except the D1-conditional item.
Note: this ledger file and the receipt-appended approval record are local/untracked post-push; they ride the next routine commit to dev.
