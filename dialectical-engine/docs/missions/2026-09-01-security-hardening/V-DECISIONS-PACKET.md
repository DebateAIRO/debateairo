# V DECISIONS PACKET — 2026-09-01 security hardening

Rows are appended by the orchestrator during triage (PLAN §3 A.8). Each row: recommended option first, ambitious option honestly costed. V answers inline; answers are copied to PLAN §7 as rulings.

| ID | Source | Question | Recommended | Alternative(s) | V's ruling |
|---|---|---|---|---|---|
| V-1 | PLAN B10 | Admission limits for `POST /v1/asks` and anonymous public reads: proposed `20 asks / 60 min / user`, `120 public reads / 15 min / source`, refuse `429 ADMISSION_RATE_LIMITED`. Values become a versioned register row. | Adopt as proposed | Higher/lower values; per-tier values by risk tier | |
| V-2 | PLAN B8 | Enable GitHub private vulnerability reporting, secret scanning + push protection, Dependabot alerts on `DebateAIRO/debateairo` (account-setting changes, reversible). | Enable all three | Enable only Dependabot alerts | |
| V-3 | L2-F11 | KEK rotation is structurally impossible today (wrapped-key files record no KEK id; no rotate command). Add `kek_id` v2 records + `KEK_PREVIOUS_PATH` + `pnpm keys:rotate-kek` now (task B18, ~half a day), or defer to P3-03. | Now (before first real users on the VPS) | Defer to P3-03 | |
| V-4 | Hygiene/CI lane | The architecture suite already fails 8 files / 12 tests on the dev baseline (contract drift from the UI-overhaul/obs merges, unrelated to security). CI is honest-red until fixed. | Hand to the live-loop DEV-SYNC step (owns those surfaces); this mission fixes only pure pins it touches | This mission fixes all 8 now (scope creep into the other mission's files) | |

