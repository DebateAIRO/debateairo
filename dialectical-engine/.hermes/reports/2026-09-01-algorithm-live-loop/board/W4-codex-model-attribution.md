# [claude@opus-5] W4 · restore model attribution for the codex relay (blocks the closing run)

```yaml
state:
  ticket: W4
  risk_tier: high
  status: waiting_product_proof # RELABELLED (W4-R1-N3): the FAIR-02 / F10 HARNESS REPAIR, not a closing-run prerequisite. Codex r1 APPROVE 0/5 (2026-09-05). Two-file code delta TRANSFERRED onto integration at ea4afa52 (git apply, hunks matched once; FAIR-02 on integration exit=1 before → exit=0 after, logs/w4/transfer-*.log); the lane's 34 trap lines appended verbatim to integration's TOOLING-TRAPS (N5 correction pending). dev route: W5 round 3 carries the same delta; V merges into dev. Follow-ups W4-R1-N1..N5 filed · b13 14:11 2026-09-05 on 1485b9e2: 22 red = 21 T0 stable-red + 1 NEW (F-T17T9-3, V's decision); 0 load failures; FAIR-02 VANISHED from red. Not green by the closed-list rule; closes on b14 after V's F-T17T9-3 call
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review, judge verdict]
    human_review: no
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-w4, branch: lane/w4, merge_status: transferred-to-integration-ea4afa52, base: b5a6b6eb, tip: b85dd32e }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: v-rulings-2026-09-03
```

**The closing run cannot execute without this.** The Global DoD requires real per-node maker
lineage, so every answer must be attributable to a named model. Of three sealed provider identities
only ONE is currently identifiable: claude works, grok is not installed on this host, and codex
answers but its replies cannot be traced to a model.

**What is known, measured rather than assumed:**
 · Live calls WORK. The adversarial-corpus relay arms execute live and pass. Its one failing arm is
   an environment-variable mismatch (`LANG` absent from the child env), unrelated.
 · The failure is `CODEX_CLI_MODEL_UNRESOLVED`, raised at `acceptance/model-shim.ts:149` when
   `findRollouts(sessionsRoot, threadId)` returns a count other than 1.
 · The session store EXISTS and is populated: `~/.codex/sessions/YYYY/MM/DD/` holds 183 `.jsonl`
   files named `rollout-<timestamp>-<uuid>.jsonl`.
 · `findRollouts` recurses correctly and matches `-${threadId}.jsonl`, so the LOOKUP logic is sound
   against that layout.
 · Therefore the likely fault is UPSTREAM: the thread id extracted from codex's stdout
   (`parseCodexStdout`) no longer matches the uuid in the filename, or is not extracted at all,
   because codex's output format has drifted.

**The outcome required** (the mechanism is yours to choose): a live codex reply can be attributed to
a named model, reliably, so a multi-maker run records real maker lineage. Prove it by making
`acceptance/dual-maker-proof.test.ts > FAIR-02 … round-trips one live call` pass — it has been RED
since before this mission and is in T0's baseline.

**This is PRE-EXISTING and environmental.** No lane caused it and none was chartered to fix it. Do
not widen into unrelated relay work. If the fault turns out to be in codex itself rather than in the
shim, say so and stop — that is a finding, not a defeat.
