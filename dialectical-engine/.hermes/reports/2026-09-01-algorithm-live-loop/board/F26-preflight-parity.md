# [unassigned] F26 · ceremony preflight diverges from the relay it vouches for (T0 F-PREFLIGHT-PARITY)

Source: T0 r3. Three divergences in one ticket: PATH vs hardcoded absolute path (r1);
parent env vs child allowlist (r1); bare args vs `--setting-sources ""` (r3) — each time
the preflight passed minutes before the relay failed on the same binary.
CURE (named by the seat): the preflight must call the adapter's own buildArguments /
buildCliChildEnvironment so it IS the relay and cannot drift. IN SCOPE for TREL2 (D18)
as the verification seam for its fix; repo-permanence is a V-packet row.
status: ready (consumed by TREL2) · escalation_target: v_packet · created 2026-09-01
