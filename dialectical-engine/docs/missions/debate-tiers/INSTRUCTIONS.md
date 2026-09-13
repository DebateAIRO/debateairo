# INSTRUCTIONS — mission `debate-tiers` (the compass; detail lives in the slice files)

## What this mission is

A debate is started at one of two plan tiers. **Free** locks every gauge on `/new` and runs a fixed
two-model fleet; **Premium** unlocks the gauges and runs a three-model fleet. The tier travels on the
ask, picks the fleet for the run, and is recorded on the run. No billing, no paywall — V: *"for now
and for testing purposes"* (`00-intake.md:11`, C2 / row V-6).

## Slices

| Code | Ticket | Name | `ui:` | Done oracle |
|---|---|---|---|---|
| S01 | `t_11abead2` | The tier selector on `/new`: the Free locks, the Premium unlock, the tier's models named, and the ask carrying `plan_tier` | **yes** | `slices/S01/DONE.md`, written by V at the mock gate (`MOCK(S01)` → `DONE(S01)`). The SPEC acceptance is the floor, not the ceiling. |
| S02 | `t_e4b4ab3a` | The tier picks the fleet: rosters as configuration, filtered against the healthy panel; the typed refusal naming a missing model; panel size = roster size; the run records its tier | no | `slices/S02/SPEC-v2.md` §Acceptance, run by V |
| S03 | `t_f14b0ca0` | The fleets move into one editable file, `config/models.yaml`: Free = `gpt-5.6-luna` + `glm-5.3-flash` over API keys on V's Z.ai subscription, Premium unchanged on its three CLIs; one restart checks the file, refuses a bad SHAPE without touching the running configuration, and — when a key is missing or a model does not answer — starts with that slot absent and a named warning, the tier then refusing asks by name | no | `slices/S03/SPEC-v2.md` §Acceptance, run by V |

**Each slice's binding spec is `slices/<S>/SPEC-v2.md`**, re-frozen at REQ-FIX pass 2 (2026-09-09)
under the verdict `reviews/REQ-REV-p1.md`; the supersession block on line 4 of each names every
requirement that moved. `SPEC.md` beside it is v1, kept byte-identical as the historical record —
read v2, and never a memory of v1.

**S01 owns `packages/contract/src/index.ts`.** `plan_tier` is a `.strict()` schema change
(`packages/contract/src/index.ts:107-118`); S02 reads the field and the tier rosters from that same
package. S02's lane rebases onto S01's merged contract change — see `slices/S02/DECISIONS.md`.

## Roster and review route

Orchestrator `claude-fable-5.1` · REQ / ARCH / MOCK `claude-opus-5` · coding `codex@gpt-5.6-sol` ·
review `claude-opus-5`, one blind session per lens · QA is V personally (`00-intake.md:24-35`).
Route per slice: `REQ → REQ-REV → ARCH(S) → [MOCK(S) → V's DONE(S), UI only] → BUILD clusters → REV(S) → V`.
Three `REV(S)` passes per slice, then it is V's (`heartbeat-protocol` §3.3).

## Table of contents — real files, read at the lines your packet names

| What | Where |
|---|---|
| V's verbatim goal, the measured state, contradictions C1–C9 | `docs/missions/debate-tiers/00-intake.md` |
| Rows V-1…V-9 (each default binds until V rules) + the rows REQ opened, V-10…V-13, and V-14 (REQ-FIX pass 2) | `docs/missions/debate-tiers/V-DECISIONS-PACKET.md` · `slices/S01/DECISIONS.md` · `slices/S02/DECISIONS.md` |
| Lane baselines — typecheck RED at base, and a row per suite any SPEC names | `docs/missions/debate-tiers/BASELINE.md` |
| SPEC / PLAN / PROGRESS / DECISIONS / DONE per slice | `docs/missions/debate-tiers/slices/S01/` · `slices/S02/` |
| Packets (one per seat), the mission LEDGER, agent self-reports | `.hermes/planning/debate-tiers/packets/` · `.hermes/reports/debate-tiers/` |
| The spine (v4.0.0 amendments win over older text) | `docs/agent-protocols/debateai-heartbeat-protocol.md` |
| Role contracts | `.claude/skills/heartbeat-<role>/SKILL.md` |
| Tooling traps — read as its index, then only the sections your packet names | `.hermes/TOOLING-TRAPS.md` |
| The `/new` surface being changed | `apps/ui/app/new/page.tsx` · `apps/ui/app/new/defaults.tsx` · `apps/ui/lib/api.ts` |
| The ask contract and the admission path | `packages/contract/src/index.ts` · `apps/api/src/index.ts` |
| Design of record — **none exists for tiers**; the readable `/new` chrome the selector sits in | `docs/missions/ui-overhaul/design/design-document-rendered.html:967-1101` |

## Standing laws (by name; the text is in the spine and `heartbeat-protocol` §3)

- **No self-review** · **a finding is a finding, and you fix the CLASS** · **three REV passes, then it is V's**
- **The board is the state** · **reproduce first, RED before GREEN** · **verbatim means verbatim**
- **Say what you cannot do** — UNVERIFIED is always legal · **the reading floor** · **the no-terminal law**
- **The honesty law, this mission's sharpest edge:** an unavailable model is named in a refusal, never
  substituted, never silently dropped from a panel (C1 / row V-7).
- **Never:** push · merge · mark a slice Done · delete product or database data · fabricate runtime data
  · reveal secrets · cross your file contract · ignore ticket comments · sub-delegate your deliverable
  · open a terminal, window or app on V's desktop.

## This mission's no-touch surface

`.local/**` — provider config carrying authorization headers; adding the three missing discovery
targets is row V-7, V's own operation, and no seat edits that file or prints it.
The running `:3000` stack (pid 74445, the MAIN tree https dev server) is never stopped, swapped or
reconfigured. The main tree carries ~100 uncommitted entries from other missions: never touched,
reverted, stashed or cleaned. Coding happens in `.worktrees/tiers-s01` and `.worktrees/tiers-s02`.

## Baseline discipline

`pnpm typecheck` is RED at base on both lanes — inherited, never claimed. **Four of the suites this
mission names are also RED at base**, and a seat that takes one for green will blame its own diff:

| Suite | Base, both lanes | Note |
|---|---|---|
| `tests/render/ux01-new-debate-form.test.tsx` | **1/8** | 7 of 8 cases already failing — on the very page S01 rewrites |
| `tests/unit/v2ui-pages.test.ts` | **36/41** | source-text guards over `apps/ui/app/new/page.tsx` |
| `tests/architecture/s14-contract.test.ts` | **2/5** | S01 touches the contract: state the delta case by case and by direction |
| `tests/architecture/sup-04-mounts.test.ts` | **0/2** | inherited from the support-publication work |

The green-at-base suites this mission names are `sup-04-widget` 8/8, `evaluator-dev-menu-ui` 2/2,
`v2ui-data-layer` 57/57 and `pol01-policy` 8/8. `t9-mode-tokens` is 2 failed | 7 passed (9) at base and
`prov01-honesty-drawer` 1/1 — both rows in `BASELINE.md`'s end section since 21:40 [orchestrator fold 22:04, REQ-REV-p2 N1].
`docs/missions/debate-tiers/BASELINE.md` is the only authority for every number above; read it there,
never from memory. Every gate asserts the **delta**, names each failure, and dates it pre-existing or
its own. Suites are reported as `passed/total`, three runs, worst run wins.

## S03 — appended by REQ-S03, 2026-09-13

- S03's binding spec is **`slices/S03/SPEC-v2.md`**, frozen at REQ-FIX's READY (pass 2, verdict `reviews/REQ-REV-S03-p1.md` + V's 16:05 update); `SPEC.md` beside it is v1, byte-identical, history only. Requirement ids R1–R29 are stable across v1→v2; R30–R32 are new.
- S03's own intake record — V's goal, C10–C15, F1–F12, rulings R-S03-1…4 — is `docs/missions/debate-tiers/00-intake-S03.md`; the 2026-09-09 `00-intake.md` still binds for everything it says.
- Slice files: `slices/S03/` (SPEC-v2, SPEC, PLAN, PROGRESS, DECISIONS; no `DONE.md`, `ui: no`). Lane: `.worktrees/tiers-s03/dialectical-engine`, branch `slice/tiers-s03` @ **`9a000c37`** (v1 said `7188b167`; the cherry-pick moved one test file only); the lane baseline per suite is `.hermes/reports/debate-tiers/logs/setup-tiers-s03.log`, **as corrected at its line 28** (`dev-api-environment` is 10/10, not 9/10).
- Rows in force: **V-34** (an OpenAI key placed in `.local/dev-auth/provider-keys.env`) blocks acceptance steps 3, 4 and 10b only · **V-35 ANSWERED** (the Z.ai subscription endpoint) · **V-36** (four-line Free entry) · **V-37** (`glm-5.3-flash`) · **V-38** (a missing key or a failing probe starts the stack with that slot absent and a named warning) — each default binding until V rules.
- **Cite LANE line numbers.** The main tree carries another mission's uncommitted `+13` lines in `apps/api/src/index.ts`, so its numbers for that one file run 13 ahead of the lane BUILD works in.
- This slice's no-touch surface gains `.local/dev-auth/provider-keys.env`: V places the keys, and no seat reads, writes, prints or tests against their values.
