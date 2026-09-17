# [unassigned] F-CREDENTIAL-ON-ARGV · the ceremony receives the service credential as a command-line argument, which every process listing on the host can read

```yaml
state:
  ticket: F-CREDENTIAL-ON-ARGV
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract:
    allowed:
      - acceptance/run-acceptance.ts (argument parsing: accept the credential from the environment or stdin; refuse it on argv)
      - acceptance/run-acceptance.test.ts
      - acceptance/README.md
      - .hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh (stop passing it on argv)
    readonly: [acceptance/main.ts, tests/architecture/s7-authorization-contract.test.ts]
    forbidden: all_others
    human_review: yes
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-17 22:30 by the orchestrator, during the second real run.

**The defect.** `acceptance/run-acceptance.ts` takes the service credential as `--service-credential <value>`
(`parseAcceptanceArguments`, `run-acceptance.ts:64-95`), and `tools/closing-run.sh` passes it that way.
A process's arguments are visible to every user on the machine through `ps` for the whole life of
the run (the orchestrator saw the first characters of tonight's credential in a routine process
listing and stopped reading; nothing was recorded). D18's "never print, store or log it" is kept by
the tool and the log, but the operating system publishes it anyway. STRENGTH: entailed (`ps -o command`
shows argv; the tool's invocation line).

**Charge.** The ceremony reads the credential from the environment (`ACCEPTANCE_SERVICE_CREDENTIAL`,
which the tool already requires) or from stdin, never from argv; a credential offered on argv is a
loud typed refusal so the old shape cannot survive by habit. `human_review: yes` because it changes
the operator's command line (the tool keeps working unchanged: it already has the variable).
**Until then:** the run's process listing is sensitive for its ~25 minutes; do not paste `ps` output
into records.
