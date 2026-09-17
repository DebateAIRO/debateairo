# Mission closure report — `consent-ui` (V's `/goal`, 2026-09-06 ~17:00 → gate 2026-09-07 08:35 EEST)

## What V asked, and what exists
V asked for the design's cookie banner (10a) with its preferences card (10b), and on `/sign-up` a privacy-policy checkbox that opens the design's modal (10c) and ticks only through the modal's own agreement control, with account creation gated on BOTH the 18+ box and the privacy box; Opus 5 coders, a Grok 4.6 reviewer per finished element.
**Exists, on `slice/consent-s02` @ `4cc0f4b6` (contains `slice/consent-s01` @ `4ddc350c`):** `apps/ui/components/consent/` (CookieBar, CookiePreferencesCard, CookieConsent, PrivacyPolicyModal, ConsentSettingsPanel, modalSemantics), `apps/ui/lib/consent.ts` + `privacyPolicy.ts`, the S01/S02 blocks in `globals.css`, the layout mount, the Settings → Privacy panel, the sign-up wiring in `SignUpFlow.tsx` (the row opens the modal; `I have read it` enables at scroll-end; the box ticks only through it; `Create account` needs both boxes; the request shape unchanged), ADR-0021/0022, and 17 consent test files (197 tests) plus the cross-slice suite. Both modes; keyboard paths; `Esc` stack; focus return.

## The loops (convergence counters)
REQUIREMENTS: 3 rounds (PASS r3) · ARCHITECTURE: 3 rounds per slice (PASS r3 both) · PROGRAMMING: 14 clusters + 3 cross clusters, 17 blind reviews, 3 reworks (S01-C6, S02-C1C2, S02-C8), 1 rework at CROSS-03; 0 round-4 escalations · QA gate: 3 Grok element reviews, all PASS r1. 31 Claude seats + 3 Grok seats + 1 Explore seat; ~11M subagent tokens; every seat's self-report collected; `SKILLS LOADED` verified against transcript bodies for every seat (0 fabrications). Phase reports: `PHASE-ARCH.md`, `PHASE-CODE.md`; ledger `LEDGER.md` (every seat exit).

## Not done, and whose it is
- **V's test points** (vertical-slice law 7): serve the lane per `docs/missions/consent-ui/V-TEST-POINT.md`; the acceptance steps are in each slice SPEC and the Grok verdicts' "could NOT verify" lists (geometry, paint, real Space/Enter, both modes, signed-in Settings). S02-S69 stayed `UNVERIFIED` by every seat for a structural reason (one stack, main tree).
- **Merge to `dev` and push** — V's, never the harness's. The lane is `slice/consent-s02`; S01's lane is contained in it.
- **Rulings** — `V-DECISIONS-PACKET.md` V-9…V-24 (V-24 = the SPEC-v4 authorization that folds the loop's defaults; V-23 = the policy's §08 copy).
- **Residue tickets** (WHEN, not WHETHER): `t_f9c52ced` (CROSS-03 r2 N1–N3), `t_4f97ca86` (S02 PLAN/docs), `t_38c6bbf2` (S01 docs, FORCE_COLOR arms, TRAPS index), `t_8962842f` (A11Y-OVERLAYS inherits helper N2 + z/Esc agreement), `t_466c8034`, `t_bb70fa13`, `t_0f8688d8`, `t_8c256490`, `t_5fe1f90a`, `t_94c9010a` (RULED), V-23's ticket.
- **Slice tickets** `t_26efb70d` / `t_9ccf3598`: open until V's veto (gate reports posted).

## Where the reports are
`.hermes/reports/consent-ui/`: `LEDGER.md`, `PHASE-ARCH.md`, `PHASE-CODE.md`, this file, `agent-reports/` (35 seats incl. `ORCHESTRATOR.md`, the murder case), `review-packages/`, `probes/`, `snapshots/`. Verdicts: `docs/missions/consent-ui/reviews/`. Packets: `.hermes/planning/consent-ui/packets/` (COMMON §10.16–10.76 — the loop's law, each line a priced defect).
