# GUIDE_LIVE observed manual state

The actual 54-row browser matrix did not start. There are no manual answer or navigation steps to reproduce as successful evidence.

The supported preview was last verified at `https://localhost:3100/help` with ordinary system TLS and status `200`, under detached PID/PGID `98637` at exact revision `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`. It was intentionally left running after the pre-request failure.

To reproduce the blocker without sending Support traffic, derive the frozen first row against the exact product context:

1. Use sequence 1: full Help, English, prompt `Pricing`, expected source `app-navigation`, action policy `NONE`.
2. Observe that exact revision `91d17ae2...` maps `app-navigation` to both `help-desk` and `home-library`.
3. The signed-out resolver derives `help`, `support-status`, and `home`.
4. The verifier rejects those actions as `GUIDE_HARNESS_PROSE_ONLY_ACTION_PROOF_MISMATCH` before any session or request is created.

Do not treat the live page alone as a successful guide demonstration. Forgot-password remains unresolved and is omitted from any walkthrough.
