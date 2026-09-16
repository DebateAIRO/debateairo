# [unassigned] F-RELAY-BINARY-HOST-DEFAULT · two maker relays default to another operator's home directory

```yaml
state:
  ticket: F-RELAY-BINARY-HOST-DEFAULT
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract:
    allowed:
      - acceptance/grok-relay.ts (the GROK_BINARY default only)
      - acceptance/claude-relay.ts (the CLAUDE_BINARY default only)
      - acceptance/grok-relay.test.ts (the D10 default assertion only)
      - acceptance/claude-relay.test.ts (the D10 default assertion only)
    readonly: [acceptance/relay-core.ts]
    forbidden: all_others
    human_review: yes
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19); drafted by the BUILD(CONT-T17) seat in
`task-17-report.md` §"Ticket draft (records task, no code)" (SDD ledger :143). **`human_review: yes` — V
chooses the discovery rule; the seat explicitly did not.**

`acceptance/grok-relay.ts:13` is `GROK_BINARY = "/Users/vladmihaimiron/.grok/bin/grok"` and
`acceptance/claude-relay.ts:29` is `CLAUDE_BINARY = "/Users/vladmihaimiron/.local/bin/claude"` — **a
different operator's home directory, compiled in as the default, and each pinned by a test.** Task 18
measured both defaults **ABSENT on this host**.

**It works today only because of the D10 environment override** (`ACCEPTANCE_GROK_BINARY`,
`ACCEPTANCE_CLAUDE_BINARY`), which the readiness packet
`packets/readiness-ask-2026-09-16.md` now carries with this host's discovered paths. With the override
unset the relay refuses loudly — correct behaviour, confusing message.

**The decision:** `command -v` discovery, a config key, or keep the override as the only road.
STRENGTH: entailed.
