# CODE-T1C1 self-report — T1-C1

- Seat/session: `CODE-T1C1` / `01a05afd-70e0-7962-9f49-dcb42ed172a5`; ticket `t_dd2f3ce0`; authority epoch 21.
- Outcome boundary: first-pass implementation only; peer review and Hermes verification remain outstanding.
- Cause finding: packet lines 67–69 require two literally empty `describe` blocks, but Vitest 4.1.10 fails each with `No test found in suite`.
- Price: one BROKEN test run plus one harness patch (about two minutes); the safe executable placeholders are `it.todo` sentinels.
- Upgrade: packet authors should say “implementation-empty with one `it.todo` sentinel” whenever serial clusters reserve Vitest describe blocks.
- Cause finding: the ticket store has legacy `scratch`/null workspace fields, null assignee, and no canonical typed-state block despite the epoch-21 route.
- Price: two read-only source/protocol probes and a claim-note workaround; invoking `hermes kanban claim` would have created an unrelated empty scratch directory.
- Upgrade: H6 should materialize `dir:<approved workspace>` plus typed owner/session fields before dispatch, or state explicitly that comment-only claim is intended.
- Near miss: the first test run was a harness crash (`readRunVisibility` missing), not RED; systematic classification prevented false TDD evidence.
- Dead end: `debateDetailFromRunProjection(RUNNING)` always includes a skeleton root tree, so it cannot exercise the `hasTree === false` mount branch.
- Fix: use a tree-less projection and keep refresh mocked at the network boundary; the corrected no-tree test then failed only on the absent toggle.
- Near miss: the published ADR-006 gate emitted `tee: /dev/stderr: Operation not permitted`; the already-documented capture-first fallback preserved the compiler result.
- Compile result: the PDA-owned TS2322 moved only from `(1488,11)` to `(1490,11)` and remains exactly one occurrence; TS2882 remains exactly one.
- Efficiency win: the packet’s explicit sibling-vs-conditional mutant and 6+6 residual inventory eliminated design guesswork and kept product edits to two files.
- Efficiency win: SHA-256 restore receipts plus `apply_patch` avoided every Git operation and proved all seven mutants left no residue.
- Re-anchor result: both anchor-sensitive unit files stayed byte-identical and passed all three row-7 runs, so editing them would have been churn.
- Verification result: row-7 worst run `8 files / 81 passed / 2 todo`; full render `21 files / 111 passed / 2 todo`; scoped literal oracle `12 -> 0`.
- Recommended one-prompt improvement: preflight the packet’s own scaffold shape under the installed runner and persist the board workspace/typed state before launching the seat.
