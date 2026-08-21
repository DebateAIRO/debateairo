# SELF-REPORT — Hermes seat (FAILED, filed by the orchestrator)

Hermes cannot file its own self-report: it never completed a single model turn across two
runs and produced zero bytes of artifact. This stub is filed by Claude-Router so the
agent-reports set is complete and the failure is not silently absent from the record.
It is explicitly NOT a reconstruction of what the seat would have said.

## What happened

- **Run 1** — 2026-08-17 20:06:26Z to 22:25:59Z (2h 19m 33s). Terminated with
  `API call failed after 3 retries: HTTP 500: no user query found in messages`.
  Root cause: the launch prompt began with `/goal`. Hermes runs a slash-command parser
  (`tui_gateway.slash_worker`); it consumed `/goal ...` as a local command, leaving an empty
  user-message array, which the provider rejected. The `-z/--oneshot` flag was correct usage.
- **Run 2** — 2026-08-18 05:08:39Z to 06:10Z (1h 01m), `/goal` prefix removed. Produced no
  log output beyond the start line and no artifact. At parking: 9.55s total CPU over 61
  minutes, flat across a 5s sample, state `S+` — blocked, not computing. Parked by the
  orchestrator under the stagnation liveness-law.

## Findings for the harness

1. The `/goal` launch law is **incompatible with the Hermes CLI**. Codex and Grok both
   accepted the identical prefix. This is a genuine spine-vs-tooling collision and should be
   amended rather than worked around per-mission.
2. The prefix fix was **necessary but not sufficient** — a second, distinct fault remains
   undiagnosed. Run 2 failed differently (silent block) than run 1 (explicit provider error).
3. Hermes buffering stdout until exit means **logs are useless as a liveness signal** for
   this CLI. Only the artifact and process CPU are trustworthy. Any watchdog covering a
   Hermes seat must sample CPU, not log growth.
4. Cumulative cost: **3h 20m wall clock, zero bytes delivered.**

## Consequence for the mission

The mission was elected with four seats and delivered on three. The Hermes lens —
verification discipline and falsifiability, the reason that seat was elected — is the one
missing from RESEARCH-REPORT.md. An appendix slot is held for it. Per amendment 7, the
orchestrator escalated to V after one failed workaround rather than attempting a third
variant unilaterally.
