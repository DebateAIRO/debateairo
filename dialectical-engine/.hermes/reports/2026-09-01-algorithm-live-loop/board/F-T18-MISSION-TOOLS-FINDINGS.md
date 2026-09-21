# [unassigned] F-T18-MISSION-TOOLS-FINDINGS · four defects in the mission's own instruments

```yaml
state:
  ticket: F-T18-MISSION-TOOLS-FINDINGS
  risk_tier: high            # closing-run.sh drives the ceremony and gates on the credential
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T18) (SDD ledger :150; the drafts are
`task-18-report.md` §"Ticket lines"). The seat's own framing is worth keeping: **the mission's tools were
the only unmeasured instrument.** Four rows, one ticket, as the report offered.

1. **All 26 files under `tools/` are mode `100644`.** Not one is executable, so every documented
   `tools/<x>.sh …` invocation — as the briefs and the tools' own usage comments write it — fails with
   `permission denied` and **exit 126**. That is neither 0 nor the tool's own 1, so a gate reading
   "non-zero means the check failed" **reports a failure that never ran.** Remedy: `chmod +x` committed
   once, or every caller writing `bash tools/…` / `python3 tools/…`. Same family as
   `TOOLING-TRAPS:1477`.
2. **`tools/closing-run.sh:20` — `mkdir -p "$OUTDIR"` precedes the clean-tree refusal.** A run refused
   for a dirty tree still creates `logs/closing-run/`. The reviewer's ruling was adopted: **leave it** —
   the directory is inside the mission tree and harmless. Recorded because **an empty
   `logs/closing-run/` is NOT evidence that a ceremony started**, and `logs/` is gitignored
   (`dialectical-engine/.gitignore:13`) so `git status` cannot see one appear.
3. **`tools/closing-run.sh:23` — the log header reads versions by bare PATH lookup** (`claude --version`
   …) rather than from the resolved `"$CLAUDE_BIN"` / `"$CODEX_BIN"` / `"$GROK_BIN"` the run actually
   spawns. Where PATH and the `ACCEPTANCE_*_BINARY` override disagree, **the header records a different
   binary's version than the ceremony used** — and that header is the provenance of the closing run.
   Not fixed, and not fixable by that seat: verifying a fix requires executing the real CLIs.
4. **`tools/d15-classify.py:39-45` — an unresolvable `INT` subtracts nothing, silently.** The
   `merge-base --is-ancestor` probe fails, `contains` is False for every closed name, and the classifier
   **over-reports stable-red with no diagnostic.** Pre-existing (the unreachable laptop path had the
   identical effect); the port only makes `INT` resolvable here. Making the failure loud is a behaviour
   change beyond a path, so it stays a ticket.

**Standing, by design, not a defect:** the tools remain untestable below the credential gate, and the
readiness table is a transcription the operator re-measures at run time. STRENGTH: entailed.
