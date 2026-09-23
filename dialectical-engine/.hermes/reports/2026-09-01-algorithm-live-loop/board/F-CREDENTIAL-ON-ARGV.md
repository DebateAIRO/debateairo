# [done 2026-09-18] F-CREDENTIAL-ON-ARGV · the ceremony receives the service credential as a command-line argument, which every process listing on the host can read

```yaml
state:
  ticket: F-CREDENTIAL-ON-ARGV
  risk_tier: high
  status: done
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

**DONE 2026-09-18 (D77 f, ADDENDUM 1) — V ruled "fix it before the push".** Product commits `9c51c8ab`,
`382d9d0c`, `097cd35d`, `4b80482a`, `169e413a`; blind review spec MET · quality APPROVED after one fix
round (`agent-reports/d77-credential-seat-2026-09-18.md`, `agent-reports/d77-credential-review-2026-09-18.md`).
- The ceremony reads `ACCEPTANCE_SERVICE_CREDENTIAL` from the environment and from nowhere else (the
  orchestrator resolved the ticket's "environment or stdin" to environment only). `--service-credential`
  on the command line — alone, with a value, joined with `=`, in any position — is refused with
  `ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED` before any other argument check, and the message never
  contains what was offered.
- The review found two paths that still wrote the value to the run log, both closed: the `=`-joined
  spelling walked past the first refusal into the generic unknown-argument error, which quoted the whole
  token; and `tools/closing-run.sh` echoed its own arguments into the log header before the ceremony
  could refuse. The tool now refuses both spellings itself (exit 7) before anything is written, and the
  parser never quotes a token that looks like a credential or is longer than its longest supported name
  (a bound deduced from the supported set, never a literal).
- The README's proof commands carry the variable, no fenced block holds a bare `<` or `>` any more (13
  lines before, none after), and a placeholder must keep the meaning of what it replaces.
- **Still open, on the record:** a credential typed as the VALUE of a legitimate argument is not caught
  (any argument value is already in the process list; the parser does not echo rejected values) — the
  reviewer's call: out of scope, not Important. No ceremony has run since the change, so the child's
  inheritance of the variable is reasoned from the tool's `export`, not witnessed; the next real run
  witnesses it. `F-CLOSING-RUN-OUTDIR-OVERRIDE` carries the testing gap the fix round met.
