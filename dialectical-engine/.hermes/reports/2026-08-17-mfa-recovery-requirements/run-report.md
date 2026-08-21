# MISSION RUN REPORT — 2026-08-17-mfa-recovery-requirements

Loop fired: REQUIREMENTS ENGINEERING only (V order). Orchestrator: Claude-Router.
Seat shape: parallel blind (R7 election). Status at time of writing: **loop ended,
3 of 4 seats delivered, synthesis NOT yet run.**

## Timeline (UTC, 2026-08-17)

| Seat | Start | Exit | Wall clock | Outcome |
|---|---|---|---|---|
| Grok 4.6 | 20:06:26 | 20:27:19 | 20m 53s | **DELIVERED** — 28/28 RQs, 919 lines |
| Codex gpt-5.6-sol @xhigh | 20:06:26 | 20:35:40 | 29m 14s | **DELIVERED** — 28/28 RQs (A–E) |
| Opus (SDK subagent) | ~20:07 | ~20:35 | 28m 12s | **DELIVERED** — 28/28 RQs, ~30k words |
| Hermes | 20:06:26 | 22:25:59 | 2h 19m 33s | **FAILED** — no artifact |

## Per-agent token ledger (accounting basis named per row — reporting law R8)

| Seat | Tokens | Basis | Confidence |
|---|---|---|---|
| Codex gpt-5.6-sol @xhigh | 663,850 | CLI's own goal-usage footer in `logs/codex.log` | VERIFIED |
| Opus seat (parent) | 221,881 | harness task-result `subagent_tokens` | VERIFIED |
| Opus child agent `af0b1926` | 127,088 | task-notification `subagent_tokens` | VERIFIED |
| Opus children ×4 (`a9de9a46`, `a9f82cd8`, `af0bf491`, +1) | UNVERIFIED | no completion receipt captured by the orchestrator | UNVERIFIED |
| Grok 4.6 | UNVERIFIED | grok CLI writes no token/usage keys into its session files; `events.jsonl` sweep returned nothing | UNVERIFIED |
| Hermes | UNVERIFIED (near-zero) | died on provider 500 before substantive work | UNVERIFIED |

**Receipted total: 1,012,819 tokens.** This is a FLOOR, not the true spend — Grok,
four Opus children, and Hermes are unreceipted. Do not quote it as the mission total.

Note: Grok also spawned 5 subagents of its own (`sessions/01a01155-2400-.../subagents/`),
none of which produced a captured receipt. Chained `/goal` calls inherit the launch
law but evidently not the accounting law.

## Failure analysis — Hermes seat

**Symptom:** `API call failed after 3 retries: HTTP 500: no user query found in messages`,
after 2h19m of retry/idle. No artifact written.

**Root cause:** the goal packet prompt led with `/goal `. Hermes runs a slash-command
parser (`tui_gateway.slash_worker`). It consumed `/goal …` as a slash command, leaving
an empty user-message array, and the provider rejected the request. The `-z/--oneshot`
flag itself was correct usage.

**Collision recorded:** the spine's `/goal` launch law (every agent launched via its own
`/goal` command) is INCOMPATIBLE with the Hermes CLI, which treats a leading `/` as a
local command rather than message text. Codex and Grok both accepted the same prefix.
Remedy: for the Hermes seat only, express the goal as plain instruction text and name
the packet path, without the `/goal` prefix.

**Orchestrator error:** the visible-launch law requires verifying each launch within
2 minutes; that check passed (process alive, log created). But no watchdog covered the
seat afterwards, so a seat that died at 22:25:59Z went unnoticed for ~6 hours. The
stagnation liveness-law (20 minutes of zero change → freeze and report) was not armed
for this mission. This is an orchestrator failure, not a seat failure.

## Loop convergence counters (REQUIREMENTS loop)

- rework_round: 0 (no CHANGES REQUESTED issued — no review stage reached)
- wakes_since_transition: n/a (no Kanban ticket created for this mission)
- escalations emitted: 0
- V DECISIONS PACKET rows pending: 1 (DR-188 preservation-vs-retention conflict)

## Deliverables on disk

- `docs/missions/2026-08-17-mfa-recovery-requirements/research/grok-requirements.md` (99,930 B)
- `docs/missions/2026-08-17-mfa-recovery-requirements/research/codex-requirements.md` (130,530 B)
- `docs/missions/2026-08-17-mfa-recovery-requirements/research/opus-requirements.md` (198,379 B)
- Total research delivered: 428,839 B / ~429 KB across 3 independent blind seats

## Outstanding

1. Hermes seat re-run (fixed invocation) OR a recorded decision to proceed on 3 seats.
2. Synthesis pass — NOT yet dispatched.
3. V DECISIONS PACKET — 1 row banked (DR-188 conflict); below the 3-row flush threshold.
4. Per-seat SELF-REPORTS (v3.2.0 amendment 6) — not collected from any seat.

---

## ADDENDUM — Hermes retry outcome (2026-08-18)

**Retry launched** 05:08:39Z with the `/goal` prefix removed (the diagnosed root cause).
**Outcome: FAILED AGAIN — parked by the orchestrator at 06:10Z.**

Evidence at time of parking:
- elapsed 01:00:58, **total CPU 9.55s**, flat over a 5s sample (0:09.55 -> 0:09.57), state `S+`
- zero bytes written to the log after the RETRY start line; no artifact anywhere on disk
- process was blocked, not computing

The prefix fix was therefore **necessary but not sufficient** — the `/goal` slash-parser
collision was real (it produced the explicit HTTP 500 on run 1), but a second,
distinct fault keeps the Hermes seat from doing work in this harness.

**Cumulative Hermes cost: 3h 20m of wall clock across two runs, zero bytes delivered.**

**Escalation (v3.2.0 amendment 7):** tooling friction escalates to the human after ONE
failed workaround. One workaround was attempted and failed. The orchestrator is NOT
attempting a third variant unilaterally. Options for V, smallest first:
1. Accept the mission on 3 seats (report already delivered and internally consistent).
2. Re-run the Hermes seat interactively so V can watch the CLI's own error surface.
3. Substitute a 4th independent seat of a different family for the Hermes lens.

**Mission deliverable is unaffected:** `RESEARCH-REPORT.md` (180 KB) was synthesized from
3 independent blind seats, with an appendix slot held for a 4th source.

**Stagnation liveness-law:** tripped (60 min zero change on this seat, threshold 20 min).
Handled correctly this time — the armed watchdog surfaced it rather than 6 hours of drift.

---

## ADDENDUM 2 — Agent self-reports collected (v3.2.0 amendment 6)

Filed late, under V's prompting. The requirement was never in any goal packet — an
orchestrator failure named independently by Opus, Codex, and Grok. Sessions were resumed
from their originals (same-terminal law) rather than reconstructed.

Set is complete: `agent-reports/{opus,codex,grok,synthesis,hermes,orchestrator-claude-router}-*.md`

### CONFIRMED DEFECT — the self-report law is undiscoverable by workers

Codex reported a harness version inconsistency. Verified, and it is worse than reported:

- normative spine (`debateai-heartbeat-protocol.md`): `version: 3.0.0`
- `.claude/skills/heartbeat-protocol/SKILL.md`: carries `v3.2.0 amendments`
- `.codex`, `.grok`, `.hermes`, `.agents` node contracts: **no version string at all**
- `grep -rl "self-report"` across every protocol doc and all five node contracts returns
  **exactly one file**: `.claude/skills/heartbeat-protocol/SKILL.md`

**Amendment 6 exists only in the orchestrator's own contract.** No worker seat could have
discovered it from the repository. Codex's charge — "the orchestrator dispatched a rule
that agents could not discover" — is upheld in full.

Compounding this: that same `.claude` skill file had been **deleted from the repo entirely**
by the `apps/dialectical-engine` -> `dialectical-engine` reorganization, and was recovered
from git at the start of this session. Commit `3e7679d` is titled "companion update to the
Spine §5.2 amendment" but the companion update never reached the other four node contracts.
The v3.2.0 laws (fleet building, visible-launch, stagnation liveness, same-terminal rework,
planning-graph gate, reporting/self-report, conversation-mode recovery, Codex notes) are
Claude-only and always have been.

**Remedy:** promote the v3.2.0 amendments into the spine (which every node loads), or
replicate them into all five node contracts and stamp a version string in each. Until then
any amendment-6-through-9 rule is unenforceable against a non-Claude seat.

### Final token ledger (superseding the floor in the original report)

| Seat | Tokens | Basis | Confidence |
|---|---|---|---|
| Codex `gpt-5.6-sol` @xhigh | 818,403 | CLI footer, cumulative incl. self-report resume (was 663,850 at first exit) | VERIFIED |
| Opus seat — research | 221,881 | harness task result | VERIFIED |
| Opus seat — self-report turn | 202,551 | harness task result | VERIFIED |
| Opus child `af0b1926` | 127,088 | task notification | VERIFIED |
| Synthesis — report | 290,309 | harness task result | VERIFIED |
| Synthesis — self-report turn | 298,164 | harness task result | VERIFIED |
| Opus children (uncommissioned nesting) | UNVERIFIED | 2 authorized by Opus; 1 sub-delegated unasked, spawning 2-3 more it could not read | UNVERIFIED |
| Grok 4.6 + its 5 subagents | UNVERIFIED | grok CLI writes no token/usage keys to session files | UNVERIFIED |
| Hermes | ~0 | failed both runs before substantive work | UNVERIFIED |

**Receipted floor: 1,958,396 tokens.** Still a floor: Grok, its five subagents, and Opus's
uncommissioned nested agents remain unreceipted.

### Converging critique from the seats (each reached independently)

1. **No Kanban ticket for any seat** (Opus, Codex, Grok). The spine's typed-state, comment-
   cursor, claim and authority-epoch rituals were dead letter; Grok called logging
   `not ticketed` "a fig leaf." Board custody is Hermes-Verifier's and Hermes was dead —
   the orchestrator should have declared the gap at intake, not proceeded silently.
2. **No token or fetch budget** (Opus, Codex, Grok). Measurable cost: Grok stopped fetching
   early, leaving Veriff/Persona/Onfido/Jumio UNVERIFIED and Meta's rate CSV unparsed.
3. **Self-report absent from the contract** (all three) — and, per the defect above,
   undiscoverable even in principle.
4. **Silent degradation to 3 of 4 seats** (Codex, Grok). Grok could not tell whether its
   Discord/Signal/WeChat "no product" finding was consensus or unopposed. Codex asks for a
   bounded seat-recovery policy: after a verifier fails twice, re-elect or explicitly waive.
5. **Shared write directory leaked independence** (Grok): listing `research/` to prove it had
   copied no one revealed that other seats existed. Isolate per-seat write dirs.
6. **Contract violated by the self-report itself** (Opus): packets declared one allowed path
   and `forbidden: all_others`; the report path must be in `allowed` at dispatch, "otherwise
   the next seat learns that the contract is negotiable."

### Methodology findings from the synthesis seat

- **Blindness verifiably held.** Opus pre-registered falsifiable predictions about what other
  seats would get wrong; one was confirmed (Codex overstates the NIST KBA clause's scope).
- **The CONVERGED tag flatters.** Much of it is converged-on-shape, not converged-on-number.
  Readers of RESEARCH-REPORT.md should weight it accordingly.
- **Parallel-blind was worth it, non-linearly:** ~70% redundancy on the core, with the value
  concentrated in ~15 places — including the mission's only substantive error and the direct
  answer to V's in-house question. Three seats is the right number; synthesis is the
  expensive part and scales with seat count.
- **Roster model-duplication cost more than the Hermes failure.** Hermes is `gpt-5.6-sol` —
  the same base model as Codex, making it the least independent of the four elected seats.
  On two of the four 2-1 splits Codex is the dissenter, so a Hermes vote plausibly makes them
  2-2, which is worse than its absence. **Elect seats by model diversity, not seat count.**
- **The orchestrator anchored the adjudicator:** synthesis instructions pre-loaded four
  "known convergences to verify," on the one seat whose job is impartial adjudication.
- **"Bot B: no egress" was forwarded as a hard requirement without noticing that a hosted
  model call is itself egress.** Three seats split three ways; it reaches V as a fork that
  better intake framing would have pre-empted.
