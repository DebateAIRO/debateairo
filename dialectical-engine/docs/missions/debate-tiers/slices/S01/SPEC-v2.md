# SPEC — S01 · The Free/Premium selector on `/new` (ticket `t_11abead2`)

ui: yes
**SPEC v2 — re-frozen at the REQ-FIX node's READY marker (pass 2 of 3, 2026-09-09), superseding v1
under the verdict `docs/missions/debate-tiers/reviews/REQ-REV-p1.md`.** Requirements changed by this
supersession, and nothing else: **R7** (B3 — the provenance pair a Free ask sends), **R13** (B2 — the
`NewDebateAskDefaults` typing, pinned so R21 stays satisfiable), **R19** (B2 — two suites added with
their measured baselines), **R20** (B2 — the class named, with its three sub-classes and the
member-by-member sweep), **§3 Out of scope** (N7 — the composer's direct `createDebate` path; B3 —
the honesty-drawer label). Every other requirement, the `ui:` flag, the acceptance steps and the
slice boundary stand exactly as frozen at pass 1. A change after THIS marker is a further
supersession block under the same rule, V-ratified — never a silent in-place edit.
`SPEC.md` (v1) is left byte-identical beside this file and is the historical record; where the two differ, THIS file binds.

## 0. The slice, end to end

V opens `/new`, sees a Free/Premium control above the question, sees which models each tier runs,
sees Free holding every gauge shut at fixed values while the question stays typeable, switches to
Premium and moves a gauge, and presses `Start run` — and the ask that leaves the browser carries the
tier it chose. What the tier then DOES to the fleet is S02; S01 ends when the ask carries the tier
and the API accepts it.

**The visual form of the selector is not specified here.** It is the mock seat's (`MOCK(S01)`), and
V defines done on the canvas (`DONE.md`). This SPEC pins semantics, state and wire shape only.

## 1. Requirements

Each requirement is numbered, and each is checkable by a command or by looking at one named place.

### The control

- **R1.** On `/new`, above the question textarea (`apps/ui/app/new/page.tsx:160-177`), a control
  offers exactly two mutually exclusive options. In the rendered DOM each option carries
  `data-field="planTier"` and `data-value="free"` / `data-value="premium"`, sits in an element with
  `role="radiogroup"`, and exposes `aria-checked`. Exactly one option has `aria-checked="true"` at
  every moment. (Pattern already in the page: `SegmentedRow`, `page.tsx:362-385`. Row V-2 puts the
  control on `/new`; the `/` composer at `apps/ui/components/LibraryComposer.tsx:37` is unchanged.)
- **R2.** When `/new` is opened afresh, `data-value="free"` is the option with `aria-checked="true"`.
  (Row V-9's default. V may overturn it at the mock gate; if V does, R2 is superseded there and the
  page opens with neither option checked and `Start run` disabled until one is chosen.)
- **R3.** Each option displays the model ids its tier runs: `free` shows `gpt-5.6-luna` and
  `claude-sonnet-5`; `premium` shows `gpt-5.6-sol`, `claude-opus-5` and `grok-4.6`. The strings come
  from the exported roster declaration of R11, not from literals in the page. Presentation labels may
  come through `apps/ui/components/ModelPresentation.tsx`; the identifiers come from the roster.

### What Free locks

- **R4.** While `free` is checked, every one of these carries the native `disabled` attribute:
  the six segment buttons `#riskTier-casual`, `#riskTier-standard`, `#riskTier-high-stakes`,
  `#budgetTier-low`, `#budgetTier-medium`, `#budgetTier-high`; the slider `#treeDepth`; the
  textareas `#steeringPresets` and `#steeringAnnotations`; and, whenever the `⚙ OPTIONS` panel is
  expanded, `#depthMode`, `#scrutinyDepth`, `#branchingWidth`, `#concurrency`, `#maxTokens`.
  (Ids as rendered by `SegmentedRow`/`SelectRow`/`SliderRow`, `page.tsx:347-466`. Row V-3.)
- **R5.** The `⚙ OPTIONS` toggle button itself stays operable in Free: expanding and collapsing the
  panel works in both tiers, so V can see the locked knobs. (Row V-3 locks the knobs, not the view.)
- **R6.** `#topic` carries neither `disabled` nor `readonly` in either tier, and typing into it
  changes its value in both. (Row V-3: the question stays editable.)
- **R7.** While `free` is checked the values shown are exactly: risk tier `standard`; composition
  budget tier `low`; `#treeDepth` = `2`; `#steeringPresets` and `#steeringAnnotations` both empty;
  and the `⚙ OPTIONS` knobs at the values the page already initialises — `depthMode` `fixed`,
  `scrutiny` `standard`, `branchingWidth` `2`, `concurrency` `3`, `maxTokens` `800`
  (`page.tsx:69-74`).
  *Derivation of `standard`:* row V-4 reads "the deployment floor (`deriveRiskTierDefault`, else
  `standard`)"; the floor is unreachable from this page, because `tests/unit/v2ui-pages.test.ts:90`
  asserts `apps/ui/app/new/page.tsx` never contains `contractClient.readDeployment`,
  `tests/render/ux01-new-debate-form.test.tsx:168` asserts the page never calls it, and
  `deriveRiskTierDefault` (`apps/ui/app/new/defaults.tsx:26`) has no caller anywhere in `apps` or
  `tests`. The `else` branch of row V-4 is therefore the only one this page can take. Opened to V as
  row **V-10** (`DECISIONS.md`).
  *Derivation of `2`:* V's verbatim goal, "locks the user at Depth 2" (`00-intake.md:13`).
  *The provenance pair a Free ask sends (added at pass 2, finding B3).* Pinning the risk tier without
  the asker touching the control makes the state pair *(risk tier set, `riskTierWasEdited` false)*
  reachable for the first time: `riskTier` starts `""` (`page.tsx:75`), `riskTierWasEdited` starts
  `false` (`page.tsx:76`) and is set true only by the risk-tier segment's `onChange`
  (`page.tsx:189-192`), and `ready` needs `riskTier.length > 0` (`page.tsx:107`). In that state the
  ask carries `tier_source: "MACHINE_DEFAULT"` and `tier_provenance_ref: "machine:deployment-floor"`
  (`apps/ui/app/new/defaults.tsx:71-72`) — a source this page never reads, which the same evidence as
  row V-10 establishes. So: **the Free lock leaves `riskTierWasEdited` false — the asker did not
  choose the value, and `tier_source` stays `MACHINE_DEFAULT` — and the `false` branch of
  `tier_provenance_ref` reads `machine:plan-tier-free`, naming the mechanism that set the value.**
  The `true` branch is untouched: an asker who moves the control still sends `ASKER` /
  `asker:ui-selection`, which `tests/render/ux01-new-debate-form.test.tsx:160, 185` assert and R19
  keeps green. The rule is on the mechanism, not on the tier: a value still standing from the Free
  lock when Premium is chosen (R8) is still a machine default and still carries
  `machine:plan-tier-free`. No schema change follows — `tier_provenance_ref` is
  `z.string().trim().min(1)` (`packages/contract/src/index.ts:111`) and `createDebate` reads it with
  `requiredString` and no allow-list (`apps/ui/lib/api.ts:377`), so R12's "no other field is added,
  removed or loosened" holds. Measured cost of the string change: no suite asserts the `false` branch
  produced by `buildNewDebateAskConfig` — the three call sites are `apps/ui/app/new/page.tsx:121` and
  `tests/render/ux01-new-debate-form.test.tsx:217, 219`, and the two test calls assert `.as_of` only;
  every other occurrence of `machine:deployment-floor` in `tests/` is a literal passed in or a
  fixture, never a value this function derived (`grep -rn 'machine:deployment-floor' apps packages
  tests` in the lane at `7f89f7b7`, 2026-09-09). The words the honesty drawer renders for
  `MACHINE_DEFAULT` are a separate surface and are out of scope — §3, and row **V-14**
  (`DECISIONS.md`).
- **R8.** Choosing `free` sets every value in R7 to the R7 value, whatever it was before. Choosing
  `premium` removes every `disabled` attribute R4 added and leaves the values as they are on screen.
  No value is restored from a remembered pre-Free state: what is on screen is what is sent.

### What Premium unlocks

- **R9.** While `premium` is checked, none of the controls listed in R4 carries `disabled`, and each
  one accepts a change that is then visible in its own value — segment `aria-checked` moves, the
  slider's rendered number changes, the textareas accept text. (Row V-5: "effort levels" means these
  existing gauges; no new control is invented.)
- **R10.** `#treeDepth` keeps the range 1..5 in both tiers. Free pins the VALUE to 2 and disables the
  control; it does not change `DEPTH_MIN`, `DEPTH_MAX` or the slider bounds.

### The wire

- **R11.** Exactly one declaration in the repo maps each tier to its ordered list of model ids —
  `free` → [`gpt-5.6-luna`, `claude-sonnet-5`], `premium` → [`gpt-5.6-sol`, `claude-opus-5`,
  `grok-4.6`] — exported from `packages/contract/src/index.ts` (or a sibling module of that package
  re-exported from it), because `apps/ui` and `apps/api` both already import `@debateai/contract`
  (`apps/ui/lib/api.ts:8`, `apps/api/src/index.ts:43`). `grep -rn` for each of the five model ids
  across `apps/` and `packages/`, excluding `*.test.*` and build output, finds each id written as a
  roster member in exactly one file. S02 reads this same declaration; it does not re-declare it.
- **R12.** `AskRequestSchema` (`packages/contract/src/index.ts:107-118`) gains one field,
  `plan_tier`, admitting exactly the two string values `free` and `premium`, required, with the
  schema still `.strict()`. No other field is added, removed or loosened.
- **R13.** `buildNewDebateAskConfig` (`apps/ui/app/new/defaults.tsx:64-80`) puts the chosen tier in
  the config it returns, and `createDebate` (`apps/ui/lib/api.ts:365-397`) copies it into the
  `AskRequest` it submits. `createDebate` rejects any value outside the two, before any network call,
  in the same shape as the existing `RISK_TIERS` / `BUDGET_TIERS` guards (`apps/ui/lib/api.ts:357-358,
  371-379`) — a thrown `Error` whose message begins `ASK_FIELD_REQUIRED:`.
  *The typing, pinned at pass 2 (finding B2), because R13 and R21 cannot both hold until it is.* The
  tier joins `NewDebateAskDefaults` (`apps/ui/app/new/defaults.tsx:45-55`) as an **optional** member,
  and the `createDebate` guard above is the single place that makes the field mandatory on the wire.
  A **required** member is rejected: `tests/render/ux01-new-debate-form.test.tsx:217` and `:219` call
  `buildNewDebateAskConfig` with a spread `defaults` object that carries no tier, so a required member
  turns both calls into new TypeScript diagnostics in a file that is not pinned in `BASELINE.md:10-32`
  — exactly what R21 forbids. The optional member is also the shape this type already uses for the
  three inputs the page does not always supply (`riskTierWasEdited?`, `steeringPresets?`,
  `steeringAnnotations?`, `defaults.tsx:52-54`). No default is invented for an absent tier: the config
  reaches `createDebate` without one and is refused there, before any network call, with a message
  beginning `ASK_FIELD_REQUIRED:` — the same treatment `risk_tier` gets today
  (`apps/ui/lib/api.ts:371-372`).
- **R14.** `POST /v1/asks` (`apps/api/src/index.ts:905`) answers `202` for a body carrying
  `plan_tier: "free"` and for one carrying `plan_tier: "premium"`, and `400` with
  `{ error: "MALFORMED_REQUEST" }` for a body carrying `plan_tier: "gold"` and for one carrying no
  `plan_tier` at all (`.strict()` + required, via `parseRequest`, `apps/api/src/index.ts:288-297,
  512-520`). S01 does not change what the API DOES with the value — that is S02.
- **R15.** `pnpm run generate:contract` is re-run in the lane after R12, because
  `AskRequestSchema` is in `contractInventory.resources` (`packages/contract/src/index.ts:695`) and
  the generated `field-inventory.json` and `openapi.json` are derived from it
  (`packages/contract/src/generate.ts:7-19`). The generated directory is gitignored
  (`dialectical-engine/.gitignore:7`), so nothing generated is committed.

### What must not move

- **R16.** These source-shape assertions still pass, because they read the page as text:
  - the region of `apps/ui/app/new/page.tsx` from `async function submit` to `return (` contains none
    of `branching`, `concurrency`, `maxTokens`, `role_overrides`, `adaptive_expansion`
    (`tests/unit/v2ui-pages.test.ts:79-87`) — so the Free lock is written in the render and state
    layer, never inside `submit`;
  - `const DEPTH_MIN = 1;`, `const DEPTH_MAX = 5;` and the attribute pair matching
    `/min=\{DEPTH_MIN\}\s+max=\{DEPTH_MAX\}/` survive verbatim (`tests/unit/v2ui-pages.test.ts:93-95`);
  - `value={riskTier}`, `setRiskTier(value)`, `value={budgetTier}` and
    `setBudgetTier(value as CompositionBudgetTier)` survive verbatim
    (`tests/unit/v2ui-pages.test.ts:42-44, 53-61`);
  - the region from `const ready =` to `async function submit` still contains `riskTier`,
    `budgetTier`, `decisionScope` and `asOf` (`tests/unit/v2ui-pages.test.ts:63-70`).
- **R17.** Every colour the selector introduces is declared as a custom property inside the single
  `:root {` block AND the single `html[data-mode="chamber"] {` block of `apps/ui/app/globals.css`,
  and registered, comma-tight, in the maps of `tests/unit/t9-mode-tokens.test.ts`. No colour literal
  is written outside those two blocks.
- **R18.** Because R2 keeps a tier always chosen, `plan_tier` is never the reason `Start run` is
  disabled: the `ready` expression (`apps/ui/app/new/page.tsx:104-111`) gates on the same conditions
  as before. If V overturns R2 at the mock gate, `ready` gains the tier as one more condition and
  this requirement is superseded with it.

### Suites

- **R19.** These suites are run three times in the lane, worst run wins, and reported as
  `passed/total` against `docs/missions/debate-tiers/BASELINE.md`:
  `tests/render/ux01-new-debate-form.test.tsx` (base 1/8), `tests/unit/v2ui-pages.test.ts`
  (base 36/41), `tests/architecture/s14-contract.test.ts` (base 2/5),
  `tests/render/sup-04-widget.test.tsx` (base 8/8), `tests/architecture/sup-04-mounts.test.ts`
  (base 0/2, RED at base), `tests/unit/evaluator-dev-menu-ui.test.ts` (base 2/2),
  `tests/unit/v2ui-data-layer.test.ts` (base 57/57) and `tests/unit/pol01-policy.test.ts` (base 8/8)
  — both added at pass 2, finding B2, and both measured in BOTH lanes at `7f89f7b7` on 2026-09-09 —
  and `tests/unit/t9-mode-tokens.test.ts` (2 pre-existing failures; this suite has no `BASELINE.md`
  row yet, so the rule at the foot of `BASELINE.md` applies: it is measured in the lane before the
  first RED test of the cluster that touches it, that measurement is reported `passed/total` in the
  measuring seat's own READY handoff, and the orchestrator — `BASELINE.md`'s only writer — appends
  the row; it is the baseline from then on). No suite ends
  with fewer passing cases than its baseline. `s14-contract` is RED at base and S01 touches the
  contract: the delta is stated case by case and by direction. Every baseline number above is read
  from `BASELINE.md`, never from a seat's memory; a seat whose run straddles a re-measure re-reads it
  before its handoff.
- **R20.** *(Rewritten at pass 2, finding B2. The v1 text swept one sub-class of three.)* **The class
  is every site that constructs an ask which must now carry a tier** — not only the literals the
  schema parses. R12 makes the field required on the wire and R13 puts a guard in front of the
  wire, so the class has three sub-classes, and every member of all three is listed below. Line
  numbers are **at the lanes' base `7f89f7b7`**; the main tree's copy of `v2ui-data-layer` carries
  +41 lines of another mission and its numbers do not apply in a lane. Reproduce the sweep with
  `grep -rc steering_annotations apps packages tests` and
  `grep -rn --include='*.ts' --include='*.tsx' 'createDebate(\|buildNewDebateAskConfig' apps packages tests`.

  **A — ask literals parsed by `AskRequestSchema` (R12).** 13 literals in 5 files:
  `tests/unit/api.test.ts` (7), `tests/unit/contract.test.ts` (3),
  `tests/unit/load01-live-proof.test.ts` (1), `tests/unit/s7-authorization.test.ts` (1),
  `tests/integration/evaluator-database.test.ts` (1). Each gains a `plan_tier`, and each of those
  five suites is run and reported. Two further `steering_annotations` sites are NOT members and are
  named so nobody re-derives them: `tests/render/ux01-new-debate-form.test.tsx:266, 272` are
  `toMatchObject` partials, and `tests/architecture/s14-contract.test.ts:64` is a source-text
  assertion over `apps/api/src/index.ts`.

  **B — `createDebate` config literals (R13's guard).** Six call sites, five outside `createDebate`
  itself:

  | Site | What R13 does to it | Disposition |
  |---|---|---|
  | `apps/ui/app/new/page.tsx:132` | the S01 path itself; the config carries the chosen tier | R13 |
  | `tests/unit/v2ui-data-layer.test.ts:753-767` | positive create, config has no tier → the guard throws → `expect(created.id).toBe("run:new")` (`:767`) fails | gains a `plan_tier`; suite in R19 (base 57/57) |
  | `tests/unit/pol01-policy.test.ts:49-58` | asserts the exact text `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM: No healthy provider remained at claim` (`:58`); the guard rejects earlier with `ASK_FIELD_REQUIRED: …` → fails. It still *rejects*, so a run read carelessly looks like message drift rather than a caused break | gains a `plan_tier`; suite in R19 (base 8/8) |
  | `tests/unit/v2ui-data-layer.test.ts:749` | negative case, asserts `/ASK_FIELD_REQUIRED/` as a regex → still passes | unchanged |
  | `tests/render/ux01-new-debate-form.test.tsx:15, 72` | `createDebate` is a `vi.fn()`; the assertions at `:264` and `:272` are `toMatchObject` → unaffected | unchanged; suite already in R19 |
  | `apps/ui/components/LibraryComposer.tsx:29-31` | production, tier-less; it already throws `ASK_FIELD_REQUIRED: risk_tier` today and the bare `catch {}` at `:34` swallows it, so behaviour is unchanged and only the message inside the catch changes | unchanged; named in §3 Out of scope |

  **C — `buildNewDebateAskConfig` inputs (R13's typing).** Three call sites:
  `apps/ui/app/new/page.tsx:121` (the S01 path; passes the chosen tier) and
  `tests/render/ux01-new-debate-form.test.tsx:217` and `:219` (a spread `defaults` object with no
  tier). The two test call sites compile unchanged **only because** R13 pins the member optional; a
  required member turns them into new typecheck diagnostics and breaks R21.

  A member of any sub-class found later that this sweep missed is a finding on this requirement, not
  a surprise.
- **R21.** `pnpm typecheck` gains no diagnostic outside the files already pinned in
  `BASELINE.md:10-32`.

## 2. Acceptance — V runs these, in a browser, on the real dev stack

Precondition: the MAIN https stack on `:3000` serves the merge candidate, and V is signed in.
Run steps 1–12 once in **Terracotta** (light) and once in **Chamber** — switch with the `☾` / `☀`
button in the top bar (`apps/ui/components/ModeToggle.tsx:32-43`, `aria-label` "Switch to Chamber
mode" / "Switch to Terracotta mode"). Every step is pass/fail by looking; UNVERIFIED is a legal
answer to any of them.

1. Open `/new`. A Free/Premium control is visible ABOVE the question box, and one of the two reads as
   chosen.
2. The chosen one is **Free**. (If V ruled otherwise at the mock gate, the expected state is the one
   `DONE.md` records, and this step follows `DONE.md`.)
3. The Free option names `gpt-5.6-luna` and `claude-sonnet-5`. The Premium option names
   `gpt-5.6-sol`, `claude-opus-5` and `grok-4.6`.
4. With Free chosen: Risk tier reads **Standard**, Composition budget tier reads **Low**, Tree depth
   reads **2**, and both steering boxes are empty.
5. Still in Free, try to change each of them — click `Casual`, click `High`, drag the depth slider,
   click into each steering box and type. Nothing moves, and nothing is typed.
6. Click `⚙ OPTIONS`. The panel opens in Free. Try each control inside it — the dropdowns will not
   open and the three sliders will not move.
7. Click into the question box and type a claim of more than six characters. The text appears.
   `Start run` becomes available.
8. Choose **Premium**. Every gauge from steps 4–6 becomes usable: set Risk tier to `High stakes`, set
   Composition budget tier to `High`, drag Tree depth to `4`, type one line into each steering box,
   and change one `⚙ OPTIONS` control.
9. Choose **Free** again. The gauges return to the step-4 values and lock again; the question text is
   still there, unchanged.
10. Choose **Premium** again. The gauges are usable again and show what step 9 left on screen — the
    step-8 values are NOT silently restored.
11. With **Free** chosen and a question typed, open the browser devtools Network tab, press
    `Start run`, and read the request body of `POST /v1/asks`: it carries `"plan_tier":"free"`, and
    the response is `202`.
12. Repeat step 11 with **Premium**: the body carries `"plan_tier":"premium"` and the response is
    `202`. (What the run then does with the tier — which models argue — is S02's acceptance, not
    this one. Until S02 lands, both tiers run the same fleet, and that is correct here.)

## 3. Out of scope for S01

Filtering the fleet by tier, the refusal when a roster member is unavailable, panel size, and
recording the tier on the run — all S02. Billing, payment, entitlement or any gate on who may choose
Premium — row V-6: none in this mission. The selector's visual form, copy and layout — the mock seat's
and V's, through `DONE.md`.

**The `/` composer's direct `createDebate` call** *(added at pass 2, finding N7).* The library
composer is a route *fallback*, not a route: it first calls
`createDebate(topic.trim(), { max_depth: 3, branching: 2, max_tokens: 800 }, COOKIE_SESSION_MARKER)`
(`apps/ui/components/LibraryComposer.tsx:29-31`) with a config carrying no `risk_tier` and no tier, so
it throws `ASK_FIELD_REQUIRED` today; the bare `catch {}` at `:34` swallows the throw and `:37`
routes to `/new?topic=…`. S01 changes nothing here — R13's guard is swallowed by the same catch, only
the message inside it changes — which is why this is out of scope and not a member of R20 sub-class B
that needs an edit. **What must hold the day someone makes that direct call succeed:** it constructs
an ask, so it is a member of R20's class and the ask must carry a `plan_tier` the asker chose. The
composer has no tier control and row V-2 keeps the selector on `/new` alone, so the two closable
paths are to delete the direct call in favour of the `/new` route, or to put a selector on the
composer as a slice of its own. A tier defaulted at that call site is the invented value the honesty
law forbids.

**The words the honesty drawer renders for a machine default** *(added at pass 2, finding B3).*
`apps/ui/components/AnswerHonestyDrawer.tsx:86` renders
`Risk tier {answer.risk_tier} · {riskTierSourceLabel(answer.tier_source)} · {answer.tier_provenance_ref}`,
and `riskTierSourceLabel` maps `MACHINE_DEFAULT` to the fixed phrase "machine default from the
deployment floor" (`apps/ui/lib/v3/labels.ts:6`). For any run whose stored `tier_source` is
`MACHINE_DEFAULT` that phrase names the deployment floor whatever the ref beside it says — so R7's
honest `machine:plan-tier-free` will appear next to a sentence that still names a floor this page
never read. Changing the phrase is out of scope for S01: the drawer is the debate page and not the
`/new` surface this slice owns, the label is shared by every run in the app, and
`tests/render/prov01-honesty-drawer.test.tsx:41` asserts the phrase verbatim (a suite with no
`BASELINE.md` row). Routed as row **V-14** (`DECISIONS.md`). **What must hold the day it changes:**
the words come from `tier_provenance_ref` or from a vocabulary value that distinguishes the sources,
never from a phrase hard-coded to one source, and prov01's assertion moves with the words.
