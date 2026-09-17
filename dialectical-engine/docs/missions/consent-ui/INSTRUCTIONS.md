# consent-ui — mission compass

**What:** Ship the two consent surfaces the design specifies — the cookie bar (10a)
with its preferences card (10b), and the sign-up privacy gate (8a checkbox group +
the privacy-policy modal 10c) — so that registration requires both an 18-or-over
affirmation and a privacy-policy acceptance taken from reading the policy. Front-end
only: the request to `/v1/auth/register` keeps its exact shape.

**Done (V):** V personally exercises each slice in the real https dev stack
(`https://localhost:3000`) in BOTH modes and vetoes or accepts. A green suite is a
worker milestone, never Done. Two slices, each independently exercisable.

## Slices

| Code | Name | "UI element fully done" (the Grok 4.6 gate) |
|---|---|---|
| S01 | Cookie consent — bar (10a), preferences card (10b), persistence, Settings re-entry | Every S01 cluster GREEN on the worst of three runs · every per-cluster Opus review PASS or all findings closed · `slice/consent-s01` committed · every numbered step of `slices/S01/SPEC.md` §V acceptance runnable in the dev stack. Only then is Grok 4.6 fired. |
| S02 | Sign-up privacy gate — checkbox group (8a), privacy-policy modal (10c), both-boxes gating | Same bar, against `slices/S02/SPEC.md` §V acceptance. Never fired on a partial element. |

## Roster and review route

- **Requirements:** Claude Opus 5 (REQ-01, `t_5916299b`) — this compass + both SPECs
  (frozen) + PLAN scaffolds. Reviewed blind by REQ-REV-01 (Opus 5, `t_12513808`).
- **Architecture:** Claude Opus 5 — one seat per slice, in parallel; fills `PLAN.md`
  steps, clusters, boundaries, ADRs. Reviewed blind by an Opus 5 seat.
- **Programming:** Claude Opus 5, one lane per slice (V: "Coding agents will be Opus 5
  agents"). Per-cluster task review: Opus 5, fresh blind session.
- **Finished-UI-element review:** Grok 4.6, fired once per slice and only when that
  slice is fully done (V: "only review a feature when it is truly done").
- **QA:** V personally. Rework rounds: max 3; round 4 is a V DECISIONS PACKET row.
- Decorrelation note and seat transport: `00-intake-H0.md` (R7 election).

## Table of contents (pointers only)

| Pointer | Path |
|---|---|
| Intake — V's verbatim goal, C1–C10 contradiction check, measured state | `docs/missions/consent-ui/00-intake-H0.md` |
| V decisions packet — **every row's default binds until V rules on that row** (rows are appended over time; do not cite a range) | `docs/missions/consent-ui/V-DECISIONS-PACKET.md` |
| **Measured baseline — the authority for every "is it green?" claim; assert the DELTA, never the absolute** | `docs/missions/consent-ui/BASELINE.md` |
| Design of record — 10a/10b/10c markup | `docs/missions/consent-ui/design/turn-10-cookie-consent.html` |
| Design of record — sign-up card and checkbox group (8a) | `docs/missions/consent-ui/design/turn-8a-signup.html`, `.../turn-8a-checkbox-group.html` |
| Design of record — every string, both-mode token map, categories, policy | `docs/missions/consent-ui/design/design-data.js` |
| Slice S01 (SPEC frozen · PLAN · PROGRESS · DECISIONS) | `docs/missions/consent-ui/slices/S01/` |
| Slice S02 (SPEC frozen · PLAN · PROGRESS · DECISIONS) | `docs/missions/consent-ui/slices/S02/` |
| Contested decisions — REQ-01's picks, routed by the orchestrator | `docs/missions/consent-ui/requirements/contested-decisions.md` |
| Seat packets (COMMON first, then your own) | `.hermes/planning/consent-ui/packets/` |
| Agent self-reports | `.hermes/reports/consent-ui/agent-reports/` |
| Tooling traps — read first, append what costs you time | `.hermes/TOOLING-TRAPS.md` |
| Sign-up card today (checkbox 185-188 · submit 190-192 · register call 68-73) | `apps/ui/components/SignUpFlow.tsx` |
| Root layout — mode guard 36-42, `.appShell` mount 45-48 | `apps/ui/app/layout.tsx` |
| Settings — auth-gated at 37-39; `.set*` panel vocabulary | `apps/ui/app/settings/page.tsx` |
| Token contract — `:root` 5-97, `html[data-mode="chamber"]` 99-158 | `apps/ui/app/globals.css` |
| Auth card CSS vocabulary — `.authCheck` 885-894, `.authCheck input` 896-902 | `apps/ui/app/globals.css` |
| Stacking ladder — `--z-*` tokens at 78; `.topBar` 30, `.drawer` 55, `.modalScrim` 70, `.toast` 80 | `apps/ui/app/globals.css` |
| House modal pattern (scrim + card, inline, no portal) | `apps/ui/components/GuideModal.tsx:32-45` |
| Registration request — UNCHANGED by this mission | `packages/contract/src/client.ts:215-220` |
| Test: sign-up render + submit (S02 updates it) | `tests/render/auth-flow-integration.test.tsx` |
| Test: token contract + colour-literal gate (S01 owns the token edits) | `tests/unit/t9-mode-tokens.test.ts` |
| Test: source-text guard banning `terms`/`privacy notice`/`localStorage` in SignUpFlow | `apps/ui/components/authRoutes.source-test.mjs:48` |
| Test: root-layout direct-child shape — mount AFTER `{children}` | `tests/render/t3-library.test.tsx:231-237` |
| Typecheck baseline, owned by another mission (`BASELINE.md` above is this mission's authority) | `docs/missions/observability-agents/TYPECHECK-BASELINE.md` |
| Shared modal semantics — the ONE helper: focus trap, focus return, Esc stack. S02 writes it, S01 consumes it | `apps/ui/components/consent/modalSemantics.ts` (`COMMON.md` §10.7) |
| Heartbeat spine v3.4.0 | `docs/agent-protocols/debateai-heartbeat-protocol.md` |
| Role contracts | `.claude/skills/heartbeat-{protocol,requirements,architecture,worker,reviewer}/SKILL.md` |

**Several suites are RED at base and are inherited, never claimed** — `BASELINE.md` is the
only place their measured state lives, and it is re-measured rather than quoted here.

## Standing laws (by name)

No self-review (§2.1) · a finding is a finding, and you fix the CLASS not the instance
(§2.2) · rework cap 3 (§2.3) · the board is the state (§2.4) · reproduce first, RED before
GREEN on every round (§2.5) · verbatim means verbatim (§2.6) · say what you cannot do —
UNVERIFIED is always legal (§2.7) · SPEC frozen at creation, PLAN scaffolded by
requirements and filled by architecture, PROGRESS written only by the orchestrator,
DECISIONS append-only · vertical-slice law (V, 2026-09-01) · QA is V personally · privacy
posture · honesty — a UI never claims a capability the product lacks · naming: the product
is `dialectical-engine`, say "current algorithm version". Banned in any criterion:
improve, better, robust, handle, appropriate. Full text: the spine + `heartbeat-protocol`.

## Order of work (dependency hint only)

**Both SPECs are at v3** (REQ-01 rework round 2, 2026-09-06, answering
`docs/missions/consent-ui/reviews/REQ-REV-01-r2.md`); each carries a supersession header naming
the finding behind every v3 change and pointing at `SPEC-v2.md` for v2's. The frozen v1 and v2
sit beside it as `SPEC-v1.md` and `SPEC-v2.md`. **Read `SPEC.md`; the archives are history.**
**S02 seats: R17's checkbox hook is the one place two rounds of review were spent — it names
exactly ONE test idiom (`field(name).click()` inside `act`) and lists the forms that are
measured not to work. Do not invent a second one.**

Two S02 artefacts both slices need, in this order: **`modalSemantics.ts`** (the ONE shared
focus trap / focus return / Esc stack — S01's card cannot satisfy its own requirements without
it), then **`PrivacyPolicyModal`**, which consumes it and which S01's 10b card opens read-only
from its `Privacy notice` link. Both are standalone and prop-driven with no consent side
effect of their own — the modal's interface contract is stated byte-identically in both SPECs
and neither slice may change it alone. Otherwise the slices are
independent and run in parallel lanes. S01 is the sole writer of the `globals.css` token
blocks and of `tests/unit/t9-mode-tokens.test.ts`, including the tokens S02 consumes.
Architecture owns exact sequencing.
