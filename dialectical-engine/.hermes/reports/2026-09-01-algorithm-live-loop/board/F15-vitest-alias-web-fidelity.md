# [unassigned] F15 · vitest `@` alias resolves web/ component imports into apps/ui (T2 F-T2-1)

Source: T2 report (agent-reports/t02-steering.md F-T2-1). vitest.config.ts:8 aliases `@` to
apps/ui for EVERY test, so a web/ component's `@/lib/api` import resolves to apps/ui's
client under test — no render test can exercise web's real client wiring through `@/`.
T2's own assertions are unaffected (it mocks the specifier and says so).
DISPOSITION: V DECISIONS PACKET row at closure (test-harness change, outside this goal's
scope law). Named so no later lane mistakes an apps/ui behavior for a web/ one in a test.
status: waiting_human (V) · escalation_target: v_packet · created 2026-09-01
