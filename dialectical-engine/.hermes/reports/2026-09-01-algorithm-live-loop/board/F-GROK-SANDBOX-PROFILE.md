# [claude@opus-5] F-GROK-SANDBOX-PROFILE · the grok relay's fixed `--sandbox read-only` cannot be applied on this host, so the ceremony silently ran with two makers

```yaml
state:
  ticket: F-GROK-SANDBOX-PROFILE
  risk_tier: medium
  status: done
  owner: { agent: claude, session: tbd }
  contract: { allowed: [acceptance/grok-relay.ts (buildArguments and the handshake failure surface only), acceptance/run-acceptance.ts (the ABSENT-probe print to stdout only), acceptance/grok-relay.test.ts, acceptance/run-acceptance.test.ts], readonly: [acceptance/relay-core.ts, acceptance/seed-register.ts, logs/closing-run/], forbidden: all_others, verification: [RED: a relay start rejection is printed to the ceremony's stdout naming the maker and the failure code; the grok handshake succeeds on this host or the ceremony refuses loudly when a configured maker is absent; codex static review], human_review: yes }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: closing-run-2026-09-08
```

**Found in the closing run (2026-09-08, run d90ec684).** The lineage shows only Anthropic and OpenAI makers; the third configured maker (xAI, `acceptance:grok-cli`, DR-177) is absent. `run-acceptance.ts:173–200` starts the three relays with `Promise.allSettled`, records a rejected start as an ABSENT provider probe in the (temporary) database, and prints NOTHING to stdout — so the ceremony's own log cannot show that a configured maker was missing. Re-running the relay's exact command from an empty directory with the relay's sanitized environment (`logs/closing-run/grok-handshake-probe.out`): grok 1.0.13 exits 1 with `warning: sandbox could not be applied: runtime-socket deny resolution failed: could not resolve runtime-socket deny path /var/run/docker.sock: endpoint is a symlink` / `error: could not apply the 'read-only' sandbox profile … Refusing to start with its protections missing.` — the relay's compiled-in `--sandbox read-only` (grok-relay.ts buildArguments) was written against another host. **Outcomes:** (1) an absent configured maker is LOUD in the ceremony's stdout (maker, failureCode) — the run's log must not pass silently on two of three makers; (2) the relay's sandbox argument works on this host (a profile grok can apply here, or the docker.sock resolution handled) — decided with V, since `human_review: yes` (it changes what the ceremony's transport isolates). STRENGTH: entailed for the failing handshake (reproduced) and the silent ABSENT path (read); the exact ceremony-time failure code is undetermined (the DB was temporary).

**Diagnostic (01:05 2026-09-08):** `/var/run/docker.sock` is a dangling symlink to `~/.docker/run/docker.sock` (Docker Desktop not running). Without `--sandbox read-only` the identical handshake succeeds (`text: OK`, model `grok-4.6-build`, cost reported 0.0066 USD). Two remedies, V's choice: make the socket resolvable on this host (start Docker Desktop, or a sandbox profile grok can apply) and re-run the ceremony once; or change the relay's sandbox argument (this ticket, human_review). Either way outcome (1) — an absent maker printed loudly — stands.

## 2026-09-16 continuation
Moved `queued` → `done` by RECORDS(CONT-T19). Landed by **Task 17**, range `a38dde4a..5ace5d7c`.
**Outcome (1) — loud absence.** `acceptance/absent-makers.ts` is the ONE announcer, keyed by
**providerRef**: the seat measured that a positional lookup would have named OpenAI for a failed claude on
the boot's 2-relay / 3-provider shape, and corrected the fix round's own suggestion. Both entry paths —
the ceremony and the standalone API boot (`startBootRelays` in `acceptance/main.ts`, the gap that kept the
class open after round 0) — announce through it, and neither owns a private `MAKER ABSENT` literal. The
ABSENT probe record is derived from the announcement in one call, so **the ceremony cannot keep the row
while losing the line**. The ordering ("before the debate starts") is pinned in source: announce before
`createAcceptanceRuntime(`.
**Outcome (2) — probe, then degrade with a mark.** `handshakeWithProbedSandbox` asks for
`--sandbox read-only` first and, on failure, re-runs the IDENTICAL handshake without it (the only
discriminator, since relay-core discards stderr), printing `RELAY DEGRADED xAI SANDBOX-PROFILE-UNAVAILABLE
<code>`; `sandboxProfile` and `degradation` ride on the handle and the served calls inherit the probed
adapter. **If the unsandboxed handshake also fails, the ORIGINAL failure is re-thrown — an absent maker is
never traded for an unprotected one.**
Orchestrator's review: **ACCEPTED** — RED 8/32 at base → 33/33 ×3, readers 34/34 + 14/14, both typechecks
0/0, six mutants killed; fix round 6 files / 53 / 0 ×3 with MF1 and MF2 each killed (SDD ledger
:141–:145). STRENGTH: entailed.
**Applied on V's behalf, with a veto window (V row):** outcome (2) was an OPEN V CHOICE and
degrade-with-mark was applied as the default.
**Recorded, not done (D73 ADDENDUM 3):** `SANDBOX-PROFILE-UNAVAILABLE` is deliberately NOT a kernel
vocabulary member — the vocabulary is closed at 37 and positionally pinned. A run-level mark is V's call.
**Still open and only the operator can do it:** the actual Grok **re-run** (start Docker Desktop, run the
ceremony once). What changed is that it can no longer fail silently in either direction.
