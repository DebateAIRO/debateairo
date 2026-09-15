# [unassigned] F16 · root typecheck blind to web/, apps/ui, and tests/**/*.tsx (T2 F-T2-2/F-T2-3)

Source: T2 report (agent-reports/t02-steering.md F-T2-2, F-T2-3). tsconfig.json:20 excludes
web/ and apps/ui; the include list carries tests/**/*.ts but not .tsx. A broken web/ or ui
edit ships under a green root typecheck. web/ additionally carries one pre-existing error
(web/app/layout.tsx:3 TS2882 './globals.css'), proven pre-existing by byte-identical
before/after runs.
MISSION-LOCAL CURE: ruling D14 — surface-local tsc gates mandatory for lanes touching
web/ or apps/ui (T1/T11 affected now). REPO CURE (adding the gates to the typecheck
script + clearing TS2882): V DECISIONS PACKET row at closure — outside this goal's scope.
status: waiting_human (V, repo cure) · mission-local cure ACTIVE (D14) · created 2026-09-01
