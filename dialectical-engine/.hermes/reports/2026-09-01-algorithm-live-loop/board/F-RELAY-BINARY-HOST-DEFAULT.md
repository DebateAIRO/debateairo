# [unassigned] F-RELAY-BINARY-HOST-DEFAULT · two maker relays default to another operator's home directory

```yaml
state:
  ticket: F-RELAY-BINARY-HOST-DEFAULT
  risk_tier: medium
  status: done
  owner: { agent: claude, session: 2026-09-17-orchestrator }
  contract:
    allowed:
      - acceptance/relay-core.ts (the one resolver: discovery by name on PATH, the resolved-path checks)
      - acceptance/claude-relay.ts, acceptance/grok-relay.ts, acceptance/model-shim.ts, acceptance/hermes-relay.ts (the compiled-in paths removed; the call sites hand over a name)
      - acceptance/*.test.ts for those modules; acceptance/README.md (how a binary is found)
    readonly: [acceptance/run-acceptance.ts, acceptance/absent-makers.ts]
    forbidden: all_others
    human_review: done (V ruled 2026-09-17 — see below)
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19); drafted by the BUILD(CONT-T17) seat in
`task-17-report.md` §"Ticket draft (records task, no code)" (SDD ledger :143). **`human_review: yes` — V
chooses the discovery rule; the seat explicitly did not.**

**V ruled on 2026-09-17:** *"we should never put named paths in the code, only relative paths, since this
code is run on multiple computers … If it needs to be set to something local, it needs to be deduced
first, never set in stones."* So the discovery rule is: the operator's `ACCEPTANCE_*_BINARY` key when
set; otherwise the maker's NAME looked up on PATH the way `command -v` does; and whatever resolves must
be an existing, non-empty, executable file or the relay refuses with a typed code naming the path and
the reason. The scope grew from two defaults to all four (`model-shim.ts`'s `/Applications/ChatGPT.app/…`
and `hermes-relay.ts`'s home-derived path are the same class). Plan:
`docs/superpowers/plans/2026-09-17-relay-binaries-deduced.md`. The same day V's own run stopped on
`~/.local/bin/claude` → a 0-byte `…/versions/2.1.274` left by an interrupted CLI update — the
"must actually run" check is what catches that class; `tools/closing-run.sh` now performs it before
anything is spent (`PREFLIGHT_ONLY=1`).

**Outcome (2026-09-17, done at `fbb8cde5`).** `acceptance/relay-core.ts` resolves every maker by
NAME: the operator's `ACCEPTANCE_<MAKER>_BINARY` key when set (a path, or a name to look up),
otherwise the first existing entry under that name over the handed env's absolute PATH entries, then
one admission gate (regular, non-empty, executable, header readable, program header incl. ELF;
symlinks followed for the checks, the link kept as the spawn path); refusal
`<MAKER>_CLI_BINARY_UNRESOLVED:<REASON>:<path>` with six reasons; the admitted absolute string is the
one `spawn` receives; no shell anywhere; the four compiled-in paths gone (the corrected grep is empty);
hermes under the same resolver with its start path failing as a `CliRelayFailure`. README section
"Which CLI a maker relay runs (D10)". Blind review spec MET · quality CHANGES → fix round 1 →
re-check APPROVED (one Critical closed: relative paths re-resolved by `execvp` in the child). Gate:
D75 ADDENDUM 1 (d). Six commits `ea69a7ba..fbb8cde5`. Residual (ledger minor): the three non-hermes
starts rely on their callers' `allSettled`; M-7 test duplication deferred.

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
