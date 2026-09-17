# [claude@opus-5] F-SEALEDROWS-L · three record corrections from the approving review

```yaml
state:
  ticket: F-SEALEDROWS-L
  risk_tier: low             # record and comment precision; codex r7: none changes the shipped code, the proof, or the merge decision
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [orchestrator record check], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-codex-r7-2026-09-05
```

Codex r7 APPROVED the lane with these three FOLLOW-UPs. All three are wording; none is code.

**F1 — the retry commentary describes a topology the gateway does not implement.** The packets,
the V-SEALEDROWS-3 packet, the seat reports and a test comment all say the second repair is
"applied to an already-repaired packet." It is not: `request.buildRepairPacket` closes over the
ORIGINAL packet and its signature never receives `attemptPacket`, so each invocation rebuilds from
the captured base. The test is still correct — the stateful second-invocation mutant is still the
right discriminator — but a maintainer following the comments gets a false model of retry
accumulation. The test comment also still says the wire carries two attempts; it carries three.
**Fix:** in the mutable comments (`database.test.ts:4145-4152,4166-4174`) and by append-only
correction in the records, replace the phrase with *"the second invocation of the repair callback,
producing the third attempt from the captured base packet"*, and change two to three.
**The orchestrator's own records carry the error** — `packets/sealedrows-worker.md:733-744`,
`v-packets/V-SEALEDROWS-3…:22-27` — and are corrected by appended note, never by rewrite.

**F2-PACKET — mine.** Admitted as orchestrator packet defect #9 on F-SEALEDROWS-A. The r7 reviewer
packet is corrected by appended note.

**F3-RECORD — the seat's self-accounting mis-categorises one round.** Its final sentence names a
finding inside rework 2 as one of "the two rounds that were not" proxy rounds; by its own table
the two non-proxy rounds are r1 (orchestrator block) and r2 (the real work), and rework 2 carried
an independent E1 tool defect on top of its proxy defect. **Fix:** correct that sentence in
`agent-reports/sealedrows-self.md:776-793` — the seat's file, so the seat or its successor makes
the edit; the orchestrator does not rewrite a seat's report.

Lands with whichever lane next touches the evaluator wire test (F-SEALEDROWS-I), or as a
standalone record round if none does within the mission.
