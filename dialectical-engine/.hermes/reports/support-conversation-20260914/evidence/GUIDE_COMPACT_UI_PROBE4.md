# GUIDE_COMPACT_UI_PROBE4 evidence

- Ticket/session: `t_f96afae0` / `/root/preview`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `REWORK_CHECKPOINT_CONSTANT_UNDEFINED`
- Child exit: `1`

## Result

The exact independently reviewed command ran once. Chromium launched and the all-Support abort route was installed, but the first checkpoint referenced undefined `EVIDENCE_ROOT` at probe line 33. The outer catch then called the same broken checkpoint at line 245, so no fixed result JSON was written. The required PROBE4 output remains absent.

Every classified Support route in this executable is aborted before runtime, and no synthetic response exists. No Support request could be forwarded. The fixed blocked-attempt counts and exact transition phase are unavailable because failure occurred before the first checkpoint; this receipt does not reconstruct them. No independent UI transition or product behavior result was established.

## Custody

Before and after the failed child, the exact clean product was retained by detached supervisor PID/PGID `77769`, PPID `1`, from the expected worktree. Expected preview listeners remained present, unrelated listener records were preserved, and ordinary system TLS `GET https://localhost:3100/help` returned HTTP 200 without custom CA or insecure mode. The ongoing private runtime log was neither read nor hashed.

## Smallest correction

Restore the checkpoint's evidence-root binding from the already validated output path contract, then add a bounded runtime checkpoint control that executes the writer with an owned temporary valid output. Static syntax and argument checks did not exercise this closure. A new independently reviewed one-shot probe is required; this node must not be relabeled as a UI pass.

No retry, readiness, acceptance, or checkpoint claim is made.
