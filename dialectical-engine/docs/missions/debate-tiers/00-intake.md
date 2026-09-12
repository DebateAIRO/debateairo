# INTAKE — mission `debate-tiers` (heartbeat v4.0.0, graph mode)

- **Date:** 2026-09-09 · **Orchestrator:** Claude Code, Fable 5.1 (Claude-Router seat) · **Spine:** v4.0.0 · **Board:** `debate-tiers` (Hermes kanban store, `~/.hermes/kanban/boards/debate-tiers/kanban.db`) · **Base:** `dev` @ `7f89f7b7` (origin/dev is one protocol commit behind; V pushes)
- **Slice tickets (V's, close only on V's veto):** S01 `t_11abead2` (`ui: yes`) · S02 `t_e4b4ab3a` (`ui: no`). Nodes: REQ `t_cb9482de` → REQ-REV `t_e95f08a5` → ARCH(S01) ∥ ARCH(S02) → … (created as the graph advances; `scripts/graph.sh debate-tiers` renders it).
- **Lanes:** `dialectical-engine/.worktrees/tiers-s01` (branch `slice/tiers-s01`) · `dialectical-engine/.worktrees/tiers-s02` (branch `slice/tiers-s02`), both from `7f89f7b7`; setup + baseline logs in `.hermes/reports/debate-tiers/logs/setup-tiers-s0{1,2}.log`.

## V's goal (verbatim, `/goal`, 2026-09-09)

> use the /heartbeat family if necessary :
>
> i want the app to contain two payment tiers when a debate is initiated. One would be Free, and the other would be premium. And the model fleet for those tiers will be fully added later. For now and for testing purposes, free tier contains GPT 5.6 Luna and Sonnet 5. The Premium tier contains a debate with 5.6 Sol, Opus 5 and Grok 4.6 (For now)
>
> How done looks like: Upon clicking "Start a debate" or when starting a debate, the user gets to choose if the debate is free or premium. A UI element above where the question is written will appear. The free tier locks all gauges and editing and locks the user at Depth 2 with Sonnet 5 and GPT 5.6 Luna. Premium enables the user to change effort levels and all the option gauges at will. before starting the programming verify if the heartbeat family skill gives me the UI mockup with /taste. Also use Codex 5.6 Sol agents for coding. When a vertical slice of this feature is done, the review will be done with a Opus 5 Agent.

## Classification (set once)

```yaml
risk_tier:
  S01: medium   # UI + a contract field on the ask; becomes HIGH if REQ/ARCH put the run-record persistence (a migration) in S01
  S02: high     # provider selection per run (spend routing) + the run records its tier (persistence)
planning_tier: n/a under v4.0.0 (REQ → ARCH per slice; no docs-only shortcut applies)
```

## R7 election — V named the coding and slice-review seats; the rest is an orchestrator ruling (row V-1)

```yaml
loop_ownership:
  orchestrator:  claude-fable-5.1                 # this session — schedules, dispatches, consumes; no verdicts, no code
  requirements:  [claude-opus-5]                  # RULING V-1 (V named none): one Opus 5 subagent
  architecture:  [claude-opus-5]                  # RULING V-1: one Opus 5 subagent per slice, in parallel
  mock:          [claude-opus-5]                  # RULING V-1: a Claude seat is required (the /taste + Claude Design canvas skills)
  programming:   [codex@gpt-5.6-sol]              # V: "use Codex 5.6 Sol agents for coding"
  review:        [claude-opus-5]                  # V: "the review will be done with a Opus 5 Agent" — one blind Opus 5 session per lens
  qa:            [V]                              # Done on a slice = V's veto after personally testing
```

**Decorrelation (recorded):** every planning and review seat shares Opus 5 — decorrelation by prompt, fresh session and probe-not-read only. V chose Opus 5 for review knowingly; the Opus-plans-Opus-reviews part is the orchestrator's default pending row V-1. Coding (Codex Sol) vs review (Opus 5) IS cross-house.

## Transports (probed 2026-09-09; no-terminal law — every seat is a background process or subagent)

- **Codex Sol:** `/Applications/ChatGPT.app/Contents/Resources/codex` (codex-cli 0.148.0-alpha.9) · probe `codex exec -c model='"gpt-5.6-sol"' … </dev/null` → `ALIVE gpt-5.6-sol`, session id `01a0871e-d410-7902-a39e-ceb815e6f939` (resumable with `codex exec resume <id>`; options belong to `exec`, before the subcommand — TRAPS:121). RULING: coding seats run `-c sandbox_mode='"danger-full-access"'` inside their lane cwd, because `workspace-write` cannot reach `~/.hermes` (the board) and blocks loopback fixtures (TRAPS:802, :828, :1006); containment = the file contract, the no-push law, the blind slice review.
- **Opus 5:** Agent tool, background, `model: opus`, fresh session per node; transcripts under `~/.claude/projects/-Users-vladmihaimiron-Documents-DebateAIRO/<session>/subagents/agent-*.jsonl` for the SKILLS-LOADED body check. SendMessage is NOT offered in this harness build → rework to an Opus seat is a fresh session carrying the predecessor's handoff (§7 of the orchestrator contract).
- **Grok:** not on the roster.

## Measured state (2026-09-09, commands beside each value)

- Tree: `dev` @ `7f89f7b7`; 97 dirty entries in the main tree, other missions' work — never touched (`git status --short | wc -l`).
- Stacks: pid 74445 serves the MAIN tree on `:3000` (the https dev stack; V's standing rule: never stop, swap or reconfigure it); pid 38096 is a support-review TLS relay on `:4000` from `/private/tmp` — not ours. Lanes are served, on V's word only, from a `.claude/launch.json` entry on another port.
- **The debate-start surface:** `apps/ui/app/new/page.tsx` (466 lines). Question textarea (`ndEyebrow` "NEW QUESTION", placeholder "Type a debatable claim or question…") · gauges on the default surface: Risk tier (segmented: casual/standard/high-stakes; no default unless the deployment register carries a `riskTier` row — `apps/ui/app/new/defaults.tsx`), Composition budget tier (segmented low/medium/high, provisional default `low`), Tree depth (slider 1..5, default 1), Steering menu selections and Steering annotations (textareas) · behind `⚙ OPTIONS`: Depth mode, Depth of scrutiny, Branching width, Concurrency, Max tokens — V2 controls "the V3 run contract has no slot for — they are not sent" (`page.tsx:266-271`). `Start` is enabled only when the ask is complete (`ready`, `page.tsx:104-111`). The `/` library composer first calls `createDebate` with a tier-less config that throws `ASK_FIELD_REQUIRED` today (`apps/ui/components/LibraryComposer.tsx:29-31`), swallows it (`:34`) and FALLS BACK to `/new?topic=…` (`:37`) — a route fallback, not a route (corrected 2026-09-09 after REQ-REV-p1 N7).
- **The ask contract:** `packages/contract/src/index.ts:107-118` `AskRequestSchema` is `.strict()` — `question_line, risk_tier, tier_source, tier_provenance_ref, composition_budget_tier, depth_params (open record), decision_scope, as_of, steering_presets, steering_annotations`. No model selection, no plan/tier field. Client: `packages/contract/src/client.ts:504` `submitAsk` → `POST /v1/asks`.
- **The API:** `apps/api/src/index.ts:905` the ask route; admission `evaluateAskAdmission` (`:1205-1230`) resolves `discoveredPanel` = every HEALTHY provider-discovery target and sets `panelSize = discoveredPanel.length` (`:1225`); `packages/register/src/index.ts:185-199` derives the composition (nodes per root, reviews) from `panelSize`.
- **The fleet today (dev stack, `.local/dev-auth/api.env` → `PROVIDER_DISCOVERY_TARGETS_JSON`, secrets not read):** three targets, all local CLI bridges — `development:codex-cli` → `gpt-5.6-sol` @ `127.0.0.1:8791`; `development:claude-cli` → `claude-opus-5` @ `:8792`; `development:grok-cli` → model `CLI_HANDSHAKE_UNAVAILABLE` @ `:8793`. **Neither `gpt-5.6-luna`, `claude-sonnet-5` nor `grok-4.6` is a configured target**, and a target must probe HEALTHY to join a panel (`apps/api/src/provider-discovery.ts:16-30`). Bridge processes: `apps/runner/src/dev-api-environment*.ts`, `dev-api-process*.ts`.
- **No plan/premium/subscription/billing concept exists** in `apps/api`, `packages/contract` or `apps/ui` (grep `premium|entitlement|subscription|plan_id|paywall|billing` = 0 hits).
- **Tests touching `/new`:** `tests/render/ux01-new-debate-form.test.tsx`, `tests/unit/v2ui-pages.test.ts`, `tests/architecture/s14-contract.test.ts`, `tests/render/sup-04-widget.test.tsx`, `tests/architecture/sup-04-mounts.test.ts`, `tests/unit/evaluator-dev-menu-ui.test.ts`. Baseline per lane in the setup logs (typecheck is RED at base by other missions' diagnostics — assert the DELTA).
- **Design of record:** V's `ui_designs/DebateAI Design Document.html` (Turns 1,3–11) has NO tier or premium artboard — the selector is undesigned; the MOCK(S01) node designs it inside the `/new` chrome. Readable Turn 4 extract: `docs/missions/ui-overhaul/design/design-document-rendered.html:967-1101` (artboard `4a New debate`).
- Model labels shown to users come from `apps/ui/lib/makerIdentity.ts` via `apps/ui/components/ModelPresentation.tsx`; landing cards name `claude-opus-5` and `gpt-5.6-sol` (`apps/ui/components/landing/cards.ts:27-28`).

## Contradiction check — resolved or routed NOW, at one seat's cost

| # | Conflict | Disposition (the default binds until V rules) |
|---|---|---|
| C1 | V: Free = Luna + Sonnet 5, Premium = Sol + Opus 5 + Grok 4.6 vs the dev stack: only Sol and Opus 5 are configured and healthy; the Grok bridge has no handshake; no Luna or Sonnet 5 target exists | **ROUTED — row V-7 (IMPORTANT OPERATION: provider config carries authorization headers; the harness will not edit it).** Default: S02 implements tier rosters as configuration FILTERED against the discovered-and-healthy panel; an ask whose tier has an unavailable member is REFUSED with a typed error naming the missing model (honesty law — never a silent substitute). V adds targets for `gpt-5.6-luna`, `claude-sonnet-5`, `grok-4.6` (bridges or real providers) before TEST(S02). |
| C2 | "payment tiers" vs no billing, plan or entitlement concept anywhere | **RESOLVED — V: "for now and for testing purposes".** No paywall, no billing: any signed-in user may pick Premium; the run records its tier so billing can bind to it later (row V-6 confirms). |
| C3 | "Upon clicking Start a debate or when starting a debate … above where the question is written" vs two surfaces: the `/` composer (routes to `/new`) and the `/new` form | **ROUTED — row V-2.** Default: the selector lives on `/new`, directly above the question textarea; the `/` composer is unchanged (it already lands on `/new`). |
| C4 | "locks all gauges and editing" vs the question must remain editable | **ROUTED — row V-3.** Default: Free locks every gauge (risk tier, budget tier, tree depth, both steering textareas, and the `⚙ OPTIONS` V2 knobs) and keeps the question editable; "editing" = the steering textareas. |
| C5 | Free locks the gauges, but Risk tier has NO default today (the form waits for input) | **ROUTED — row V-4.** Default: Free pins risk tier to the deployment floor (`deriveRiskTierDefault`, else `standard`), budget tier `low`, tree depth `2`, steering empty, the V2 knobs at their defaults; `Start` enables once the question is long enough. |
| C6 | "change effort levels" vs no control named "effort" (`effort_grade` in the contract belongs to investigation gaps, not asks) | **ROUTED — row V-5.** Default: "effort levels" = the existing gauges (risk tier, composition budget tier, tree depth 1..5); no new control is invented. |
| C7 | A tier with 2 models vs a tier with 3 vs `panelSize = discoveredPanel.length` driving the composition math | **RESOLVED by design (ARCH):** the tier's roster size becomes the panel size for that run (`packages/register/src/index.ts:185-199` already handles any size ≥ 1). |
| C8 | "the user gets to choose" vs a form that must not start without a choice | **ROUTED — row V-9, decided at the mock gate.** Default: Free is preselected when the form opens (so the locks apply immediately); V sees both readings on the canvas. |
| C9 | Where the tier is recorded | **ROUTED — row V-8.** Default: the ask carries `plan_tier: "free" \| "premium"` (contract, `.strict()` extended) and the run persists it; if that needs a migration the owning slice is HIGH risk. |

## What the REQ node decides (and must not)

REQ writes the compass and the two frozen SPECs from this record: the exact Free/Premium behaviour per gauge, the tier rosters as configuration, the refusal semantics of C1, the acceptance steps V runs in both modes (S01 on `/new`; S02 by starting one debate per tier and seeing the tier's models argue), the `ui:` flags (S01 yes, S02 no), and DONE.md as a PLACEHOLDER for S01 — V defines done at the mock gate. REQ does not choose the selector's visual form (the mock does) and does not touch `.local/dev-auth/api.env`.
