# [claude@opus-5] F-GROK-SANDBOX-PROFILE · the grok relay's fixed `--sandbox read-only` cannot be applied on this host, so the ceremony silently ran with two makers

```yaml
state:
  ticket: F-GROK-SANDBOX-PROFILE
  risk_tier: medium
  status: queued
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
