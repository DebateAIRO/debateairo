# PLAN — S01 · The Free/Premium selector on `/new` (ticket `t_11abead2`)

Filled by `ARCH(S01)` pass 1 (2026-09-09, ticket `t_dfd8f52d`) against the frozen
`SPEC-v2.md`, the orchestrator folds at the foot of `DECISIONS.md`, and `BASELINE.md`.
**Every line number in this file is the LANE copy at `dev` @ `7f89f7b7`**
(`.worktrees/tiers-s01/dialectical-engine`). The main tree's copies of `v2ui-data-layer`
and other files carry other missions' uncommitted lines and their numbers do not apply here.

Every measurement below was RUN by `ARCH(S01)` in the S01 lane from a `.sh` file under
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/9b3e06e9-75fb-4fd0-8561-04ca8aec6886/scratchpad/seats/ARCH-S01`,
with `git status --porcelain | wc -l` = 0 before and after every run.

## The quantifiability law

Every step is finite, categoric and markable done by a stranger. WRONG: "improve the lock". RIGHT:
"`#treeDepth` carries the `disabled` attribute while `data-value=free` is `aria-checked`, and the
test asserting it passes." A step that cannot be marked done from its own text is not a step.
Banned in any step or criterion: improve, better, robust, handle, appropriate.
(The five words in the previous sentence are the ban list itself, quoted from
`heartbeat-requirements` §4 — they are not used as a criterion anywhere in this mission's files.)

## The UI gate comes first

S01 is `ui: yes`. `MOCK(S01)` builds the canvas and V writes `DONE.md` BEFORE any BUILD node starts.
If V's `DONE.md` contradicts a SPEC requirement, that is a supersession recorded in `DECISIONS.md`,
not a silent divergence — and R2 and R18 of the SPEC name in advance the requirement most likely to
move. **Clusters C1 and C2 carry no pixel and are not gated by `DONE.md`** (§Gating below); C3, C4
and C5 are.

---

## 0. Four measured facts that shape this plan

These were not in the SPEC. Each was measured in the lane; each moves a cluster.

### F1 — `tests/render/ux01-new-debate-form.test.tsx` cannot render `/new` at all. It is a BROKEN harness, not a RED suite.

All 7 failing cases fail with the same stderr, captured verbatim:

```
Invalid hook call. Hooks can only be called inside of the body of a function component.
```

The cause is the suite's own `vi.mock("react", …)` at `tests/render/ux01-new-debate-form.test.tsx:57-61`,
which replaces `useState`/`useEffect` with the hand-rolled slot machine at `:21-55` while
`renderToStaticMarkup` uses the real React internals. **Every case that renders the page fails; the
one case that does not render passes.** The single passing case is
`B6 refreshes untouched as-of at submit and preserves an explicitly edited value` (`:210-224`) — the
pure `buildNewDebateAskConfig` unit, which is exactly the pair of call sites SPEC R20-C pins
(`:217`, `:219`).

Consequence: **no rendered behaviour of `/new` can be verified in `ux01`.** R1, R2, R4, R5, R6, R8,
R9 and R10 are all rendered behaviour. A BUILD seat writing them into `ux01` would get a failure it
cannot tell from its own — the exact shape `TOOLING-TRAPS` calls "never RED until you prove the
command RAN".

The repo already has a render harness that works, green at base: `tests/render/sup-04-widget.test.tsx`
(8/8) uses `// @vitest-environment jsdom` + **real** React + `createRoot` from `react-dom/client` +
`act` + `vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)` (`:1-51`). `tests/render/prov01-honesty-drawer.test.tsx`
(1/1) uses plain `renderToStaticMarkup` with unmocked React. **S01's rendered cases use the
`sup-04-widget` idiom in a new suite; `ux01` is neither repaired nor deepened by this slice** and
stays at its 1/8 floor. Repairing `ux01` is a finding with a ticket (law 3.2), not S01's step.

### F2 — the guard SPEC R16 leans on is vacuous. Measured, not inferred.

`tests/unit/v2ui-pages.test.ts:83` computes
`newPage.slice(newPage.indexOf("async function submit"), newPage.indexOf("return ("))`.
`indexOf("return (")` finds `NewDebatePage`'s own return at `page.tsx:57`, which is **before**
`async function submit` at `page.tsx:113`, so the slice is empty and the case asserts nothing:

```
indexOf(async function submit) = 4717 line 113
indexOf(return () = 2191 line 57
slice(a,b).length = 0
```

So SPEC R16's first bullet, and the `DECISIONS.md` row *"Where is the Free lock written in the
source? → In the render and state layer, never inside `submit`"*, currently rest on a case that
passes for every possible page. Step **S01-31** repairs it with the file's own `region()` helper
(`v2ui-pages.test.ts:28-34`), whose `expect(endIndex).toBeGreaterThan(startIndex)` makes an empty
region a failure. The repair keeps the case passing (today's `submit` contains none of the five
names), so `v2ui-pages` does not drop below its 36/41 floor.

### F3 — the tail of `apps/ui/app/globals.css` is contractually closed. S01's CSS may not be appended at the end.

Two suites that are **green at base and named in no requirement of this SPEC** forbid it:

- `tests/unit/consent-s02-style-contract.test.ts:248-249` — `css.slice(indexOf(S02_CLOSE_MARKER) + …).trim()`
  must be `""`. Base: 10 passed (10).
- `tests/render/consent-bar.test.tsx:270-280` — after the consent-S01 close marker there may be only
  whitespace, or consent-S02's one block and then whitespace; the comment at `:262` states the rule
  it enforces: *"A third block, a stray rule between the two, or anything at all after S02's closing
  marker still fails here."* Base: 7 passed (7).

Markers in the lane's `globals.css` (8980 lines): consent-S01 opens at `:8188`, closes at `:8559`;
consent-S02 opens at `:8561`, closes at `:8980` — the last line of the file. **S01's rules are
inserted in the `nd*` region, after `.ndKeyHint` at `globals.css:6206` and before the next rule, never
after `:8188`.** Token additions are unaffected: R17 puts them in the two blocks at `:5-113` and
`:115-178`, both above the fence.

### F4 — R19 names the suites the requirements TOUCH, not the suites that WATCH the files S01 writes.

`TOOLING-TRAPS` §"Disjoint WRITE surfaces do not imply independent EFFECTS" asks: *which STANDING
tests READ the files each slice WRITES?* Swept in the lane over `tests/` and `acceptance/`, full
paths, N of N; every suite below reads an S01 write surface, has no `BASELINE.md` row, and is named
in no requirement. **All seventeen were measured by `ARCH(S01)` in the S01 lane at `7f89f7b7`,
dirty 0 before and after** (`extra-baselines.sh`); the numbers are §7's floor and are offered to the
orchestrator — `BASELINE.md`'s only writer — as rows to append.

| Suite | Reads | Base (lane `tiers-s01`) |
|---|---|---|
| `tests/render/bug02-debate-effects.test.tsx` | `apps/ui/lib/api.ts` | 4 passed (4) |
| `tests/render/evaluator-dev-menu-controls.test.tsx` | `apps/ui/lib/api.ts` | 1 passed (1) |
| `tests/render/load01-debate-page.test.tsx` | `apps/ui/lib/api.ts` | 2 failed \| 8 passed (10) |
| `tests/render/t1-canvas.test.tsx` | `apps/ui/lib/api.ts` | 5 failed \| 12 passed (17) |
| `tests/unit/s10-erasure-ui.test.ts` | `apps/ui/lib/api.ts` | 3 passed (3) |
| `tests/unit/v2ui-ownership.test.ts` | `apps/ui/lib/api.ts` | 3 passed (3) |
| `tests/architecture/s7-authorization-contract.test.ts` | `packages/contract/src/index.ts` **source text of `AskRequestSchema`** | 1 failed \| 5 passed (6) |
| `tests/architecture/s8-publication-contract.test.ts` | `packages/contract/src/index.ts` | 1 failed \| 4 passed (5) |
| `tests/architecture/role-token-map.test.ts` | `apps/ui/app/globals.css` | 3 failed \| 46 passed (49) |
| `tests/render/consent-bar.test.tsx` | `apps/ui/app/globals.css` (**F3**) | 7 passed (7) |
| `tests/render/consent-card.test.tsx` | `apps/ui/app/globals.css` | 11 passed (11) |
| `tests/render/consent-cross-slice.test.tsx` | `apps/ui/app/globals.css` | 7 passed (7) |
| `tests/render/consent-guards.test.tsx` | `apps/ui/app/globals.css` | 7 passed (7) |
| `tests/render/consent-policy-link.test.tsx` | `apps/ui/app/globals.css` | 14 passed (14) |
| `tests/render/t3-library.test.tsx` | `apps/ui/app/globals.css` | 4 failed \| 11 passed (15) |
| `tests/unit/consent-s02-style-contract.test.ts` | `apps/ui/app/globals.css` (**F3**) | 10 passed (10) |
| `tests/unit/pda-s03-keyboard-accessibility.test.ts` | `apps/ui/app/globals.css` | 2 failed \| 3 passed (5) |

The sharpest of these is `tests/architecture/s7-authorization-contract.test.ts:180-186`, which slices
`packages/contract/src/index.ts` **from `export const AskRequestSchema` to `export type AskRequest`**
and asserts that region names none of `decision_owner`, `action_owner`, `caller_scope`. `plan_tier`
is none of those, so R12 passes it — but any reordering that moves `export type AskRequest` above the
schema empties the region. Step **S01-11** pins the ordering.

---

## 1. The direction (the brainstorming discharge; the rejected directions are in `DECISIONS.md`)

1. **The tier is state on the page, and the lock is derived from it — not stored.** One value,
   `planTier`, drives both `disabled={…}` on the fourteen controls and the values R7 pins. Nothing
   remembers a pre-Free state (`DECISIONS.md`, rejected alternative 2), so R8 is a property of the
   render, not of a cache.
2. **The Free values are applied at two moments only: the initial state, and the tier control's own
   `onChange`.** No `useEffect` keyed on the tier. An effect would make R2 and R8 depend on the
   effect-replay behaviour of whichever harness runs the page — and F1 is what that dependency costs.
3. **The roster is data in `packages/contract`, imported by the page.** R3's ids are never literals in
   `page.tsx`; R11 makes the declaration singular, which is what stops the names on the selector from
   drifting from the models that argue.
4. **The tier is optional in the UI type and mandatory on the wire.** R13's pinned shape: the single
   place that makes it mandatory is the `createDebate` guard, which fires before any network call.
5. **The rendered cases go in new suites on the harness that works** (F1), the source-shape cases stay
   in `v2ui-pages`, and the stylesheet cases go in a new style contract (F3).

## 2. SPEC → PLAN trace (forward: every requirement has at least one step)

| SPEC req | Covered by step(s) | Cluster |
|---|---|---|
| R1 control semantics | S01-20, S01-21, S01-22 | C3 |
| R2 initial tier | S01-23, S01-24 | C3 |
| R3 tier names its models | S01-25, S01-26 | C3 |
| R4 Free locks the **fourteen** controls, by id: `#riskTier-casual` · `#riskTier-standard` · `#riskTier-high-stakes` · `#budgetTier-low` · `#budgetTier-medium` · `#budgetTier-high` (6 segment buttons) · `#treeDepth` (slider) · `#steeringPresets` · `#steeringAnnotations` (2 textareas) · `#depthMode` · `#scrutinyDepth` · `#branchingWidth` · `#concurrency` · `#maxTokens` (5 ⚙ OPTIONS knobs). *Corrected at REQ-FIX pass 2, finding N8: v1 said thirteen, and a cluster written against "all thirteen" leaves one control unlocked with its assertion still green.* | S01-27, S01-28, S01-29 | C3 |
| R5 OPTIONS toggle stays operable | S01-30 | C3 |
| R6 question stays editable | S01-33 | C3 |
| R7 Free values, **and the provenance pair a Free ask sends** (`tier_source` `MACHINE_DEFAULT`, `tier_provenance_ref` `machine:plan-tier-free`) | values: S01-23, S01-34; provenance: S01-14, S01-15 | C3 / C2 |
| R8 switching re-pins, no hidden restore | S01-34, S01-35 | C3 |
| R9 Premium unlocks | S01-36 | C3 |
| R10 depth range 1..5 preserved | S01-37 | C3 |
| R11 one roster declaration | S01-1, S01-3, S01-9 | C1 |
| R12 `plan_tier` in `AskRequestSchema` | S01-2, S01-4, S01-10 | C1 |
| R13 UI builder + `createDebate` guard, **with the `NewDebateAskDefaults` member pinned optional** | S01-12, S01-13, S01-16, S01-17, S01-18 | C2 |
| R14 API 202 / 400 | S01-6, S01-7 | C1 |
| R15 `generate:contract` re-run | S01-5 | C1 |
| R16 source-shape guards unchanged | S01-31, S01-32 | C3 |
| R17 tokens in the two blocks | S01-40, S01-41, S01-42 | C4 |
| R18 `ready` unaffected | S01-38 | C3 |
| R19 named suites vs baseline — **nine now**, `v2ui-data-layer` (57/57) and `pol01-policy` (8/8) added at pass 2 | §7, and every cluster command | C1–C4 |
| R20 every site that constructs an ask which must now carry a tier — **three sub-classes**: A the 13 schema-parsed literals in 5 files · B the 6 `createDebate` config sites · C the 3 `buildNewDebateAskConfig` sites. *Corrected at REQ-FIX pass 2, finding B2: v1 swept sub-class A only.* | A: S01-8 · B: S01-19 · C: S01-13 (typing), S01-39 (the page's own call) | C1 / C2 / C3 |
| R21 no new typecheck diagnostic | S01-43, and §7's typecheck delta | all |

### Reverse trace (every step serves a requirement or a measured fact)

S01-1…S01-11 → R11, R12, R14, R15, R20-A, F4. S01-12…S01-19 → R7, R13, R20-B, R20-C.
S01-20…S01-39 → R1–R10, R16, R18, R20-C, F1, F2. S01-40…S01-43 → R17, R21, F3.
S01-44…S01-46 → `DONE.md`, V's acceptance. **No step exists that serves no row above.**

---

## 3. Steps

Steps are numbered once across the slice. Each names its file surface, its acceptance test, and the
frame in which it fails first. `RED` steps must be observed failing before their `GREEN` partner.

### Cluster S01-C1 — the contract, the rosters, and every ask literal that must now carry a tier

Write surface: `packages/contract/src/plan-tiers.ts` (new) · `packages/contract/src/index.ts` ·
`tests/architecture/tier01-roster.test.ts` (new) · `tests/unit/contract.test.ts` ·
`tests/unit/api.test.ts` · `tests/unit/load01-live-proof.test.ts` ·
`tests/unit/s7-authorization.test.ts` · `tests/integration/evaluator-database.test.ts`.

- **S01-1 (RED) · R11.** Create `tests/architecture/tier01-roster.test.ts` with the case
  `R11 declares each tier's ordered roster exactly once in the repo`. It asserts:
  (a) `PLAN_TIER_ROSTERS.free` equals `["gpt-5.6-luna", "claude-sonnet-5"]` — deep equality, so order
  is part of the assertion; (b) `PLAN_TIER_ROSTERS.premium` equals
  `["gpt-5.6-sol", "claude-opus-5", "grok-4.6"]`; (c) for each of those five ids, a scan of `apps/`
  and `packages/` excluding `node_modules`, `packages/contract/generated` and `*.test.*` finds the
  **quoted-exact** literal `"<id>"` in exactly one file, and that file is
  `packages/contract/src/plan-tiers.ts`.
  *Why quoted-exact:* `apps/ui/components/landing/cards.ts:27-28` writes `claude-opus-5` and
  `gpt-5.6-sol` inside prose (`"Anthropic · Claude · claude-opus-5"`). Measured discriminator, run
  against both known-good and known-bad input before shipping it: unquoted finds 1 file for each of
  those two ids today, quoted-exact finds 0 for all five. So a bare id scan would report a duplicate
  declaration that does not exist.
  **Fails at this step with:** `PLAN_TIER_ROSTERS` is not exported from `@debateai/contract`.
  **Done when:** the case exists and fails with that named reason.
- **S01-2 (RED) · R12.** Add to `tests/unit/contract.test.ts` the case
  `R12 admits plan_tier free and premium and refuses anything else`, asserting:
  `AskRequestSchema.parse({…, plan_tier: "free"}).plan_tier === "free"`; the same for `"premium"`;
  `expect(() => AskRequestSchema.parse({…, plan_tier: "gold"})).toThrow()`;
  `expect(() => AskRequestSchema.parse({…})).toThrow()` for a body with every other field and no
  `plan_tier`; and that a body carrying `plan_tier: "free"` **and** an unknown key still throws, so
  `.strict()` is asserted in the presence of the new field.
  **Fails at this step with:** the schema has no `plan_tier`, so `.strict()` rejects the two positive
  bodies.
  **Done when:** the case exists and fails on the two positive assertions.
- **S01-3 (GREEN) · R11.** Create `packages/contract/src/plan-tiers.ts` exporting exactly:
  `PlanTierSchema` (`z.enum(["free", "premium"])`), `type PlanTier`, `PLAN_TIERS` (the ordered
  tuple `["free", "premium"]`), and `PLAN_TIER_ROSTERS` (a frozen record of the two ordered arrays
  above). No other export. The five model ids appear in this file and nowhere else under `apps/` or
  `packages/`.
  **Done when:** S01-1's assertions (a), (b) and (c) pass.
- **S01-4 (GREEN) · R12.** In `packages/contract/src/index.ts`: re-export the module
  (`export * from "./plan-tiers.js";`) and add exactly one line, `plan_tier: PlanTierSchema,`, to
  `AskRequestSchema` (`:107-118`). The other ten fields and the trailing `.strict()` are byte-identical.
  **Done when:** S01-2 passes and `git diff --stat packages/contract/src/index.ts` shows the two added
  lines and no deletion.
- **S01-5 (GREEN) · R15.** Run `pnpm run generate:contract` in the lane. Assert
  `packages/contract/generated/field-inventory.json` → `resources.AskRequestSchema` contains
  `plan_tier`, and that `git status --porcelain packages/contract/generated` is empty (the directory
  is gitignored at `dialectical-engine/.gitignore:7`).
  **Done when:** both assertions hold and `generate:contract` exits 0.
- **S01-6 (RED) · R14.** Add to `tests/unit/api.test.ts` the case
  `R14 answers 202 for each plan tier and 400 MALFORMED_REQUEST for a bad or absent one`, using the
  file's existing `buildApi(...).inject({ method: "POST", url: "/v1/asks", … })` harness (the idiom
  at `:217-232`). Four assertions: body with `plan_tier: "free"` → `202`; with `"premium"` → `202`;
  with `"gold"` → `400` and `{ error: "MALFORMED_REQUEST" }`; with no `plan_tier` → `400` and the
  same body.
  **Fails at this step with:** the two positive bodies answer `400`, because `.strict()` rejects the
  unknown key before S01-4 lands. **If S01-4 has already landed**, this step's RED evidence is the
  two negative assertions run against a schema where `plan_tier` is optional — the seat records
  which frame it observed.
  **Done when:** the case exists and its failure is observed and named.
- **S01-7 (GREEN) · R14.** No production change: `apps/api/src/index.ts:905` already parses through
  `parseRequest(AskRequestSchema, …)` and `:288-297` + `:512-520` already map a `ZodError` to `400`
  `MALFORMED_REQUEST`. **Done when:** S01-6 passes with no edit under `apps/api/`.
- **S01-8 (GREEN) · R20-A.** Add one `plan_tier` line to each of the **13** ask literals, member by
  member. The value is `"free"` unless the case's own meaning names a tier. Sites, at lane
  `7f89f7b7`, identified by the `steering_annotations` line each literal carries:

  | # | File | Line |
  |---|---|---|
  | 1–7 | `tests/unit/api.test.ts` | `:135`, `:157`, `:239`, `:271`, `:337`, `:429`, `:501` |
  | 8 | `tests/unit/load01-live-proof.test.ts` | `:23` |
  | 9 | `tests/unit/s7-authorization.test.ts` | `:79` |
  | 10–12 | `tests/unit/contract.test.ts` | `:71`, `:83`, `:90` |
  | 13 | `tests/integration/evaluator-database.test.ts` | `:1330` |

  `tests/unit/contract.test.ts:90` is the `.strict()` excess-property case: it gains `plan_tier` and
  **keeps** its `caller_scope` key, because the case's point is that the parse still throws.
  **Not members, named so nobody re-derives them** (SPEC R20-A): `ux01:266, :272` are `toMatchObject`
  partials and `s14-contract:64` is a source-text assertion over `apps/api/src/index.ts`.
  **Done when:** `grep -rc steering_annotations` over those five files is unchanged and the C1 command
  is green.
- **S01-9 (GREEN) · R11.** S01-1's assertion (c) passes with `plan-tiers.ts` as the single declaring
  file for all five ids.
- **S01-10 (GREEN) · R12.** `tests/unit/contract.test.ts` reports 8 passed (8) — its base 7 plus
  S01-2's one case.
- **S01-11 (GREEN) · F4.** `packages/contract/src/index.ts` keeps `export const AskRequestSchema`
  **before** `export type AskRequest` with no other `export type AskRequest` occurrence between them,
  so the source region `tests/architecture/s7-authorization-contract.test.ts:180-183` slices stays
  non-empty. **Done when:** that suite reports 1 failed | 5 passed (6) — its base, unchanged.

### Cluster S01-C2 — the ask wire: the builder, the provenance and the guard

Write surface: `apps/ui/app/new/defaults.tsx` · `apps/ui/lib/api.ts` ·
`tests/unit/tier01-ask-wire.test.ts` (new) · `tests/unit/v2ui-data-layer.test.ts` ·
`tests/unit/pol01-policy.test.ts`. Depends on C1 (the type and the schema field).

- **S01-12 (RED) · R13.** Create `tests/unit/tier01-ask-wire.test.ts` with
  `R13 puts the chosen tier in the ask config`: `buildNewDebateAskConfig({…, planTier: "premium"}, t)`
  returns `plan_tier: "premium"`, and the same call with `planTier: "free"` returns `"free"`.
  **Fails with:** the returned record has no `plan_tier` key.
- **S01-13 (GREEN) · R13, R20-C.** In `apps/ui/app/new/defaults.tsx`, add to `NewDebateAskDefaults`
  (`:45-55`) the member `readonly planTier?: PlanTier;` — **optional**, imported from
  `@debateai/contract` — and return `plan_tier: defaults.planTier` from `buildNewDebateAskConfig`
  (`:64-80`). No default is invented for an absent tier.
  **Why optional is load-bearing:** `tests/render/ux01-new-debate-form.test.tsx:217` and `:219` spread
  a `defaults` object carrying no tier; a required member turns both into new TypeScript diagnostics
  in a file that `BASELINE.md` does not pin, which R21 forbids. Those two call sites sit inside the
  ONE case of that suite that passes at base (F1), so a required member would take the suite from
  1/8 to 0/8.
  **Done when:** S01-12 passes and `pnpm typecheck` reports no diagnostic in
  `tests/render/ux01-new-debate-form.test.tsx`.
- **S01-14 (RED) · R7.** In `tests/unit/tier01-ask-wire.test.ts`, the case
  `R7 names the mechanism that set an unedited risk tier`: with `riskTierWasEdited: false` the config
  carries `tier_source: "MACHINE_DEFAULT"` **and** `tier_provenance_ref: "machine:plan-tier-free"`;
  with `riskTierWasEdited: true` it carries `"ASKER"` and `"asker:ui-selection"`. Both arms are
  asserted for `planTier: "free"` **and** for `planTier: "premium"`, because SPEC R7 puts the rule on
  the mechanism, not on the tier: a value still standing from the Free lock when Premium is chosen is
  still a machine default.
  **Fails with:** the `false` branch returns `"machine:deployment-floor"` (`defaults.tsx:72`).
- **S01-15 (GREEN) · R7.** Change the `false` branch of `tier_provenance_ref` at
  `apps/ui/app/new/defaults.tsx:72` from `"machine:deployment-floor"` to `"machine:plan-tier-free"`.
  The `true` branch is untouched. No schema change follows: `tier_provenance_ref` is
  `z.string().trim().min(1)` (`packages/contract/src/index.ts:111`) and `createDebate` reads it with
  `requiredString` and no allow-list (`apps/ui/lib/api.ts:377`).
  **Done when:** S01-14 passes and `tests/render/prov01-honesty-drawer.test.tsx` still reports
  1 passed (1) — it renders a fixture, not a value this function derived.
- **S01-16 (RED) · R13.** In `tests/unit/tier01-ask-wire.test.ts`, the case
  `R13 refuses an ask with no tier or an unknown tier before any network call`: `createDebate` with a
  config carrying no `plan_tier` rejects with a message matching `/^ASK_FIELD_REQUIRED:/`;
  with `plan_tier: "gold"` it rejects with a message matching `/^ASK_FIELD_REQUIRED: plan_tier/`; and
  in **both** cases the injected client's `submitAsk` was not called.
  **Fails with:** `createDebate` accepts the config and calls `submitAsk`.
- **S01-17 (GREEN) · R13.** In `apps/ui/lib/api.ts`, inside `createDebate` (`:365-397`) and beside the
  existing `RISK_TIERS` / `BUDGET_TIERS` guards (`:357-358`, `:371-379`): add a module-level
  `const PLAN_TIERS_SET = new Set(PLAN_TIERS);`, then
  `const planTier = requiredString(config, "plan_tier");` and
  `if (!PLAN_TIERS_SET.has(planTier)) throw new Error("ASK_FIELD_REQUIRED: plan_tier must be free or premium.");`,
  and put `plan_tier: planTier as AskRequest["plan_tier"]` in the `ask` object literal. Every guard is
  before `requireToken(token)` and `client.submitAsk(ask)`, so no network call precedes the refusal.
  `requiredString` already throws a message beginning `ASK_FIELD_REQUIRED:` (`:332-338`).
  **Done when:** S01-16 passes.
- **S01-18 (GREEN) · R13.** `apps/ui/lib/api.ts` keeps `"/api"` (`tests/architecture/s14-contract.test.ts`
  case 2) and `apps/ui/app/new/defaults.tsx` keeps the literal `as_of: asOf.toISOString()`
  (`s14-contract` case 5). **Done when:** `s14-contract` reports 3 failed | 2 passed (5) — its base,
  unchanged, with the same two cases passing.
- **S01-19 (GREEN) · R20-B.** The two members of sub-class B that break under S01-17 each gain a
  `plan_tier`: `tests/unit/v2ui-data-layer.test.ts:753-767` (the positive create, whose
  `expect(created.id).toBe("run:new")` at `:767` the guard would pre-empt) and
  `tests/unit/pol01-policy.test.ts:49-58` (which asserts the exact text
  `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM: No healthy provider remained at claim` at `:58`, a string the
  guard would pre-empt with a different refusal).
  **Unchanged, and named so nobody edits them:** `tests/unit/v2ui-data-layer.test.ts:749` asserts
  `/ASK_FIELD_REQUIRED/` as a regex and still passes; `ux01:15, :72` is a `vi.fn()` mock, not a call
  site (orchestrator fold N3); `apps/ui/components/LibraryComposer.tsx:29-31` is production, already
  throws `ASK_FIELD_REQUIRED: risk_tier` today, and its bare `catch {}` at `:34` swallows the new
  message identically — SPEC §3 Out of scope.
  **Done when:** `v2ui-data-layer` reports 57 passed (57) and `pol01-policy` 8 passed (8).

### Cluster S01-C3 — the page: the selector, the Free lock, the Premium unlock

Write surface: `apps/ui/app/new/page.tsx` · `tests/render/tier01-new-plan-tier.test.tsx` (new) ·
`tests/unit/v2ui-pages.test.ts`. Depends on C2. **Gated by `DONE.md`.**

The new suite opens with `// @vitest-environment jsdom`, imports **real** React, renders through
`createRoot` + `act` with `vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)`, and mocks only
`next/navigation`, `@/components/AuthGate` and `@/lib/api` — **never `react`** (F1). The idiom is
copied from `tests/render/sup-04-widget.test.tsx:1-51`, which is 8/8 at base.

- **S01-20 (RED) · R1.** Case `R1 offers exactly two mutually exclusive tier options`: the rendered
  document contains exactly two elements with `data-field="planTier"`, their `data-value`s are
  `free` and `premium`, they sit inside an element with `role="radiogroup"`, and exactly one carries
  `aria-checked="true"`. **Fails with:** zero elements match `[data-field="planTier"]`.
- **S01-21 (GREEN) · R1.** Add the control to `apps/ui/app/new/page.tsx`. It renders the same
  attribute set `SegmentedRow` renders (`page.tsx:362-385`): per option a `<button type="button"
  role="radio" id={`planTier-${value}`} data-field="planTier" data-value={value}
  aria-checked={…}>`, inside `<div role="radiogroup">`. **Done when:** S01-20 passes.
- **S01-22 (GREEN) · R1.** The control's rendered markup precedes `ndTopicBezel` (`page.tsx:160`) in
  document order — asserted as `indexOf` of the radiogroup < `indexOf` of `ndTopicBezel` in the
  serialized markup, so "above the question" is a measurement and not a judgement.
- **S01-23 (RED→GREEN) · R2, R7.** Case `R2 opens on Free with the R7 values already pinned`: on a
  fresh render `[data-value="free"]` carries `aria-checked="true"`; `#riskTier-standard` carries
  `aria-checked="true"`; `#budgetTier-low` carries `aria-checked="true"`; `#treeDepth` has
  `value="2"`; `#steeringPresets` and `#steeringAnnotations` are both empty.
  Implementation: the initial state constants become the Free values — `useState("standard")` for
  `riskTier` (`page.tsx:75`), `useState(2)` for `depth` (`page.tsx:71`); `budgetTier` already starts at
  `PROVISIONAL_COMPOSITION_BUDGET_DEFAULT` = `"low"` (`defaults.tsx:10`); both steering states already
  start `""`. `riskTierWasEdited` stays `useState(false)` (`page.tsx:76`) and is still set true only by
  the risk-tier segment's `onChange` (`:189-192`), which is what keeps R7's provenance pair reachable.
  **Contingency, named in advance (SPEC R2, row V-9):** if `DONE.md` overturns R2, this step's initial
  state reverts to today's (`riskTier` `""`, `depth` `1`), the initial `planTier` is `null`, and
  S01-38 gains the tier as one more `ready` condition. Nothing else in this cluster moves.
- **S01-24 (GREEN) · R2.** No `useEffect` is keyed on the tier. **Done when:**
  `grep -c 'useEffect' apps/ui/app/new/page.tsx` is 1 — the session-defaults effect at `:86-99`, the
  only one the file has today.
- **S01-25 (RED→GREEN) · R3.** Case `R3 names each tier's models from the roster declaration`: the
  `free` option's text content contains `gpt-5.6-luna` and `claude-sonnet-5`; the `premium` option's
  contains `gpt-5.6-sol`, `claude-opus-5` and `grok-4.6`.
- **S01-26 (GREEN) · R3, R11.** The five strings reach the page **only** through
  `PLAN_TIER_ROSTERS` imported from `@debateai/contract`. **Done when:** S01-1's assertion (c) still
  passes with `plan-tiers.ts` as the single declaring file — i.e. `page.tsx` contains no
  quoted-exact model id.
- **S01-27 (RED) · R4.** Case `R4 locks all fourteen controls while Free is chosen`: with the
  `⚙ OPTIONS` panel expanded, each of the fourteen ids listed in the trace row for R4 carries the
  native `disabled` attribute. The case iterates a literal list of the fourteen ids and asserts a
  count of fourteen, so a missing id fails rather than passing vacuously.
  **Fails with:** none of the fourteen carries `disabled`.
- **S01-28 (GREEN) · R4.** `SegmentedRow`, `SelectRow` and `SliderRow` (`page.tsx:347-466`) each gain
  a `disabled: boolean` prop forwarded to the native element they already render — `<button>`,
  `<select>`, `<input type="range">`. The two steering `<textarea>`s (`:215-226`, `:231-243`) take
  `disabled` inline. Every call site passes `disabled={planTier === "free"}`; the tier control itself
  passes nothing and is never disabled.
- **S01-29 (GREEN) · R4.** The lock is written in the render and state layer, never inside `submit`.
  **Done when:** S01-31's repaired region guard passes over a non-empty region.
- **S01-30 (RED→GREEN) · R5.** Case `R5 keeps the OPTIONS toggle operable in Free`: the
  `.ndOptionsToggle` button carries no `disabled` attribute in either tier, and clicking it with Free
  chosen flips `aria-expanded` from `false` to `true` and renders `id="additionalRunOptions"`.
- **S01-31 (GREEN) · R16, F2.** In `tests/unit/v2ui-pages.test.ts:83`, replace the raw slice with the
  file's own helper: `const submitBlock = region(newPage, "async function submit", "return (");`.
  `region()` (`:28-34`) already asserts `endIndex > startIndex`, so the empty region F2 measured
  becomes a failure instead of a silent pass. The five forbidden names are unchanged.
  **Done when:** the case passes **and** an inserted `maxTokens` inside `submit` makes it fail — the
  seat records that mutant run, because a guard not shown to fail is not shown to work.
- **S01-32 (GREEN) · R16.** The other three source-shape assertions of R16 still pass verbatim:
  `const DEPTH_MIN = 1;`, `const DEPTH_MAX = 5;`, the `min={DEPTH_MIN} max={DEPTH_MAX}` pair
  (`v2ui-pages:93-95`); `value={riskTier}`, `setRiskTier(value)`, `value={budgetTier}`,
  `setBudgetTier(value as CompositionBudgetTier)` (`:42-44`, `:53-61`); and the region from
  `const ready =` to `async function submit` still containing `riskTier`, `budgetTier`,
  `decisionScope`, `asOf` (`:63-70`).
  **Done when:** `v2ui-pages` reports 5 failed | 36 passed (41) — its base, with the same five
  pre-existing failures named in §7 and no new one.
- **S01-33 (RED→GREEN) · R6.** Case `R6 keeps the question typeable in both tiers`: `#topic` carries
  neither `disabled` nor `readonly` with Free chosen and with Premium chosen, and dispatching an
  input event with `"a debatable claim"` changes its value in both.
- **S01-34 (RED→GREEN) · R7, R8.** Case `R8 re-pins every Free value on choosing Free, whatever was
  on screen`: from Premium with risk tier `high-stakes`, budget tier `high`, depth `4` and text in
  both steering boxes, clicking `[data-value="free"]` returns all six to the R7 values and re-applies
  the fourteen `disabled` attributes. Implementation: the tier control's `onChange` sets the six
  values when the chosen value is `free`, and sets none of them when it is `premium`.
- **S01-35 (RED→GREEN) · R8.** Case `R8 restores nothing from a remembered pre-Free state`: after the
  round trip in S01-34, clicking `[data-value="premium"]` leaves risk tier `standard`, budget tier
  `low`, depth `2` and both steering boxes empty — the step-9 values, not the step-8 ones. No state
  variable holds a pre-Free snapshot. **Done when:** the case passes and
  `grep -c 'previous\|snapshot\|remembered' apps/ui/app/new/page.tsx` is 0.
- **S01-36 (RED→GREEN) · R9.** Case `R9 unlocks every gauge in Premium and each accepts a change`:
  with Premium chosen none of the fourteen carries `disabled`; then clicking `#riskTier-high-stakes`
  moves its `aria-checked` to `"true"`, setting `#treeDepth` to `4` renders the value `4`, and an
  input event on each steering textarea changes its value.
- **S01-37 (GREEN) · R10.** `#treeDepth` renders `min="1"` and `max="5"` in **both** tiers; Free pins
  the value and disables the control without touching `DEPTH_MIN`, `DEPTH_MAX` or the slider bounds.
  Asserted in the new suite and, as source text, by `v2ui-pages:93-95` (S01-32).
- **S01-38 (GREEN) · R18.** The `ready` expression (`page.tsx:104-111`) gains no term. Case
  `R18 never disables Start run for the tier`: with a question of more than six characters typed and
  either tier chosen, `.ndStart` carries no `disabled`. **Contingency:** if `DONE.md` overturns R2,
  `ready` gains `planTier !== null` and this step's criterion becomes "`.ndStart` is disabled while no
  tier is chosen and enabled once one is".
- **S01-39 (GREEN) · R20-C.** `page.tsx:121` passes `planTier` into `buildNewDebateAskConfig`, and
  `page.tsx:132`'s `createDebate` call is unchanged in shape. **Done when:** a submit from the new
  suite reaches the mocked `createDebate` with a config whose `plan_tier` is the chosen tier.

### Cluster S01-C4 — the stylesheet

Write surface: `apps/ui/app/globals.css` · `tests/unit/t9-mode-tokens.test.ts` ·
`tests/unit/tier01-style-contract.test.ts` (new). **Disjoint from C3's write surface — C3 and C4 run
in parallel.** Gated by `DONE.md`, which fixes the colours and the geometry.

- **S01-40 (GREEN) · R17, F3.** Every rule S01 adds is inserted after `.ndKeyHint`
  (`apps/ui/app/globals.css:6206`) and before the next existing rule — **never after the consent-ui
  S01 open marker at `:8188`**. **Done when:** `tests/unit/consent-s02-style-contract.test.ts` reports
  10 passed (10) and `tests/render/consent-bar.test.tsx` 7 passed (7); both fail on an appended rule
  (F3), and the seat records one mutant run appending a rule at end-of-file to show they do.
- **S01-41 (GREEN) · R17.** Every colour the selector introduces is declared as a custom property
  inside **both** the single `:root {` block (`:5-113`) and the single `html[data-mode="chamber"] {`
  block (`:115-178`), and registered comma-tight in the `TERRACOTTA` and `CHAMBER` maps of
  `tests/unit/t9-mode-tokens.test.ts` (`:42-154`, `:156-268`) — or, if it is mode-independent, in
  `MODE_INDEPENDENT` (`:270-314`). No colour literal is written outside those two blocks.
  **Why both maps, exactly:** `t9-mode-tokens`'s first case asserts the FULL inventory
  (`rootNames.sort()` equals `[...Object.keys(TERRACOTTA), ...Object.keys(MODE_INDEPENDENT)].sort()`,
  `:412-418`). That case **passes at base**, so a token added to the stylesheet and not to the map
  takes the suite from 7/9 to 6/9.
  **Done when:** `t9-mode-tokens` reports 2 failed | 7 passed (9) — its base, with the two
  pre-existing failures named in §7 and no third.
- **S01-42 (GREEN) · R17.** If `DONE.md` needs no new colour, this cluster adds no token and S01-41 is
  satisfied by adding none. The disabled states of `.ndSegItem`, `.ndSlider`, `.ndSteerInput` and
  `.ndSelect select` have no rule today — `globals.css` styles `:disabled` only for `.ndStart`
  (`:6193`) — so C4's minimum is the disabled treatment of the four locked control families plus the
  selector's own rules.
- **S01-43 (GREEN) · R21.** `pnpm typecheck` gains no diagnostic outside the files pinned under
  `BASELINE.md` § *Lane `tiers-s01`*. **Done when:** the §7 typecheck delta command reports an empty
  added-file list.

### Cluster S01-C5 — the `DONE.md` measurements

**The command is filled in after V writes `DONE.md`**, and not before: `DONE.md` is V's, and its
measurements (geometry, colour, both modes) do not exist until V has written them. Named now so the
graph carries the node.

- **S01-44.** Transcribe each `DONE.md` measurement into one assertion in
  `tests/unit/tier01-style-contract.test.ts` (stylesheet text: geometry, colour token, both modes) or
  in `tests/render/tier01-new-plan-tier.test.tsx` (rendered markup), one assertion per measurement,
  each naming the `DONE.md` line it measures.
- **S01-45.** Any `DONE.md` measurement that contradicts a SPEC requirement is a supersession
  appended to `DECISIONS.md` with its date and V's ruling — never a silent divergence.
- **S01-46.** V runs SPEC §2 acceptance steps 1–12 in Terracotta and in Chamber. QA is V personally;
  no seat marks this done.

---

## 4. Clusters — BUILD units, one verification command each

One command per cluster, run three times, worst run wins. The review unit is the whole slice at
`REV(S01)`, never a cluster. Every command below was **RUN at base by `ARCH(S01)`** from a `.sh`
file in the S01 lane; the base verdict column records what it did.

Each command follows the capture-first idiom (`TOOLING-TRAPS` §"A guard that steals the exit
status") and runs **one path per `vitest` invocation**, so a missing or renamed file reports
`No test files found` loudly instead of being silently dropped from a multi-path filter
(§"A multi-path `vitest run` SILENTLY DROPS paths that do not exist"). `PT` is a `suite:expected-passed:expected-failed`
triple, so each suite asserts its own delta rather than a pooled total. Run from
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine`
— the level holding `package.json`, one below the worktree root (`TOOLING-TRAPS` §"The worktree root
is NOT the project root here").

**The shared runner**, written once into the seat's own `.sh` file and reused by C1–C4:

```sh
run_suites() { ok=1; for p in "$@"; do f=${p%%:*}; r=${p#*:}; xp=${r%%:*}; xf=${r##*:};
  o=$(pnpm exec vitest run "$f" 2>&1); rc=$?;
  s=$(printf '%s\n' "$o" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1);
  if printf '%s\n' "$o" | grep -q 'No test files found' || [ -z "$s" ]; then
    echo "BROKEN $f (no summary line)"; ok=0; continue; fi
  ap=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p'); ap=${ap:-0};
  af=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p'); af=${af:-0};
  echo "$f rc=$rc passed=$ap failed=$af (expect $xp/$xf)";
  [ "$ap" = "$xp" ] && [ "$af" = "$xf" ] || ok=0; done;
  [ $ok -eq 1 ] && echo CLUSTER_GREEN || echo CLUSTER_RED; }
```

`No test files found` is classified BROKEN, never RED (`TOOLING-TRAPS` §"zsh + vitest"). The
expected pair is asserted for **both** numbers, so a suite that gains a passing case while losing
another cannot slip through on a pooled count.

> **`ap=${ap:-0}` and the empty-summary arm are not decoration — they are a defect this node
> shipped and then caught.** The first version of this runner defaulted only `af`. Run at base it
> printed, verbatim:
>
> ```
> tests/architecture/sup-04-mounts.test.ts rc=1 passed= failed=2 (expect 0/2)
> CLUSTER_RED
> ```
>
> because vitest prints `Tests  2 failed (2)` — with **no `passed` field at all** — for a suite where
> nothing passes. `sup-04-mounts` is 0/2 at base and stays 0/2, so cluster C3's command would have
> reported RED forever, on a correct tree, for a fault in the command. That is
> `TOOLING-TRAPS` §"Do not let the gate condemn the fix it mandates". The `[ -z "$s" ]` arm is
> paired with the default so the default cannot rescue an unrun suite into a `0/0` pass.
> Both versions were run against six inputs — a 0-passing suite at its true pair, an all-passing
> suite, a mixed suite, a 0-passing suite at a wrong pair, a green suite at a wrong pair, and a
> nonexistent path — and v2 answers all six correctly.

| Cluster | Steps | What it builds | Verification command (one) | Base verdict, run by `ARCH(S01)` | Depends on |
|---|---|---|---|---|---|
| **S01-C1** | S01-1 … S01-11 | `plan_tier` on the ask, the two tier rosters, the 13 ask literals, the API 202/400 cases | `g=$(pnpm run generate:contract 2>&1); grc=$?; [ $grc -eq 0 ] && run_suites tests/unit/contract.test.ts:8:0 tests/unit/api.test.ts:25:0 tests/unit/load01-live-proof.test.ts:1:0 tests/unit/s7-authorization.test.ts:31:0 tests/integration/evaluator-database.test.ts:21:0 tests/architecture/tier01-roster.test.ts:1:0 tests/architecture/s7-authorization-contract.test.ts:5:1 tests/architecture/s8-publication-contract.test.ts:4:1` | **GREEN at the pre-C1 expectations.** `generate:contract` rc=0. Measured at base: `contract` 7/7, `api` 24/24, `load01-live-proof` 1/1, `s7-authorization` 31/31, `evaluator-database` 21/21, `s7-authorization-contract` 5 passed \| 1 failed (6), `s8-publication-contract` 4 passed \| 1 failed (5). `tests/architecture/tier01-roster.test.ts` **does not exist at base** — the path was omitted from the base run and its first run is S01-1's RED. The expected pairs in the command are the POST-cluster values (contract 7→8, api 24→25, roster 0→1); at base the command reports `CLUSTER_RED` on exactly those three rows, which is the TDD-RED this cluster starts from. | — |
| **S01-C2** | S01-12 … S01-19 | the builder's tier and provenance, the `createDebate` guard, the two sub-class B literals | `run_suites tests/unit/tier01-ask-wire.test.ts:3:0 tests/unit/v2ui-data-layer.test.ts:57:0 tests/unit/pol01-policy.test.ts:8:0 tests/architecture/s14-contract.test.ts:2:3 tests/render/prov01-honesty-drawer.test.tsx:1:0 tests/render/bug02-debate-effects.test.tsx:4:0 tests/render/evaluator-dev-menu-controls.test.tsx:1:0 tests/unit/s10-erasure-ui.test.ts:3:0 tests/unit/v2ui-ownership.test.ts:3:0` | **GREEN at base for every existing path.** Measured: `v2ui-data-layer` 57/57, `pol01-policy` 8/8, `s14-contract` 2 passed \| 3 failed (5), `prov01-honesty-drawer` 1/1, `bug02-debate-effects` 4/4, `evaluator-dev-menu-controls` 1/1, `s10-erasure-ui` 3/3, `v2ui-ownership` 3/3. `tests/unit/tier01-ask-wire.test.ts` does not exist at base; its first run is S01-12's RED. | C1 |
| **S01-C3** | S01-20 … S01-39 | the selector, the fourteen locks, the Premium unlock, the repaired region guard | `run_suites tests/render/tier01-new-plan-tier.test.tsx:20:0 tests/unit/v2ui-pages.test.ts:36:5 tests/render/ux01-new-debate-form.test.tsx:1:7 tests/render/sup-04-widget.test.tsx:8:0 tests/architecture/sup-04-mounts.test.ts:0:2 tests/unit/evaluator-dev-menu-ui.test.ts:2:0` | **GREEN at base for every existing path.** Measured: `v2ui-pages` 36 passed \| 5 failed (41), `ux01` 1 passed \| 7 failed (8), `sup-04-widget` 8/8, `sup-04-mounts` 0 passed \| 2 failed (2), `evaluator-dev-menu-ui` 2/2. `tests/render/tier01-new-plan-tier.test.tsx` does not exist at base; its first run is S01-20's RED. The `20` is the case count S01-20…S01-39 write and is restated by the seat if a step lands more. | C2, `DONE.md` |
| **S01-C4** | S01-40 … S01-43 | the selector's rules, the disabled treatment of the four locked control families, any token `DONE.md` fixes | `run_suites tests/unit/tier01-style-contract.test.ts:1:0 tests/unit/t9-mode-tokens.test.ts:7:2 tests/render/consent-bar.test.tsx:7:0 tests/unit/consent-s02-style-contract.test.ts:10:0 tests/render/consent-card.test.tsx:11:0 tests/render/consent-cross-slice.test.tsx:7:0 tests/render/consent-guards.test.tsx:7:0 tests/render/consent-policy-link.test.tsx:14:0 tests/render/t3-library.test.tsx:11:4 tests/architecture/role-token-map.test.ts:46:3 tests/unit/pda-s03-keyboard-accessibility.test.ts:3:2` | **GREEN at base for every existing path.** Measured: `t9-mode-tokens` 7 passed \| 2 failed (9), `consent-bar` 7/7, `consent-s02-style-contract` 10/10, `consent-card` 11/11, `consent-cross-slice` 7/7, `consent-guards` 7/7, `consent-policy-link` 14/14, `t3-library` 11 passed \| 4 failed (15), `role-token-map` 46 passed \| 3 failed (49), `pda-s03-keyboard-accessibility` 3 passed \| 2 failed (5). `tests/unit/tier01-style-contract.test.ts` does not exist at base. | `DONE.md`; parallel with C3 |
| **S01-C5** | S01-44 … S01-46 | the `DONE.md` measurements | **filled after V writes `DONE.md`** — one assertion per `DONE.md` line, added to the C3 and C4 suites, then C3's and C4's commands re-run with their pair counts restated | not runnable at base: `DONE.md` does not exist yet | C3, C4, V |

### Gating

`DONE.md` gates C3, C4 and C5 only. **C1 and C2 carry no pixel** — a contract field, a roster, a
builder and a guard — so they run as soon as `ARCH-REV(S01)` passes, which is also what lets S02's
lane rebase onto S01's contract commit early (packet charge 2, row V-12).

---

## 5. `## Screens` — the mock seat's input

`MOCK(S01)` designs inside the existing `/new` chrome. V defines done on the canvas; this block is
the inventory of what must appear, not a design.

### The chrome the selector sits in (unchanged, `apps/ui/app/new/page.tsx:149-177`)

`.ndScreen` (`globals.css:5906`) → `.ndInner` (max-width 660px, `:5907`) → `.ndEyebrow` "NEW
QUESTION" (`:5909`) → `.ndTitle` "What should we debate?" (`:5917`) → **the selector goes here** →
`.ndTopicBezel` / `.ndTopicCore` / `.ndTopic` (`:5926`, `:5934`, `:5940`) → `.ndCard` with the four
gauge rows (`:5958`) → `.ndOptionsToggle` (`:6100`) → `.ndCard.ndLegacy` when expanded (`:6120`) →
`.ndActions` with `.ndStart` and `.ndCancel` (`:6179`).
The readable `4a New debate` artboard extract is
`docs/missions/ui-overhaul/design/design-document-rendered.html:967-1101`. **There is no tier
artboard: the selector is undesigned** (`00-intake.md:55`).

### Screens and states — six, each in Terracotta and in Chamber (12 canvases)

| # | Screen / state | What is on it |
|---|---|---|
| 1 | **Free chosen, OPTIONS collapsed** (the default per R2 / row V-9) | Free reads chosen; Free names `gpt-5.6-luna` + `claude-sonnet-5`, Premium names `gpt-5.6-sol` + `claude-opus-5` + `grok-4.6`; Risk tier **Standard**, Composition budget tier **Low**, Tree depth **2**, both steering boxes empty — all nine visible gauges drawn locked; the question box empty and typeable; `Start run` disabled (no question yet) |
| 2 | **Free chosen, OPTIONS expanded** | as 1, plus the five `⚙ OPTIONS` knobs drawn locked at `fixed` / `standard` / `2` / `3` / `800`; the `⚙ OPTIONS` toggle itself drawn **operable** (R5) |
| 3 | **Premium chosen, OPTIONS collapsed** | Premium reads chosen; the four gauge rows drawn unlocked and at rest |
| 4 | **Premium chosen, OPTIONS expanded, gauges moved** | Risk tier `High stakes`, budget `High`, depth `4`, text in both steering boxes, one `⚙ OPTIONS` control changed — the acceptance step-8 state |
| 5 | **Free re-chosen after 4** | every gauge back at the state-1 values and locked; the question text still present and unchanged (acceptance step 9) |
| 6 | **No tier chosen** (the row V-9 alternative reading) | neither option chosen, `Start run` disabled with a question typed. Drawn so V can rule R2 on the canvas; if V takes it, SPEC R2 and R18 are superseded in `DONE.md`. |

### Components each screen reuses, by path

- `apps/ui/app/new/page.tsx:347-387` `SegmentedRow` — the pill-group pattern R1 names, and the source
  of the attribute contract (`role="radiogroup"`, `role="radio"`, `id`, `data-field`, `data-value`,
  `aria-checked`). The tier control renders the same attributes.
- `apps/ui/app/new/page.tsx:389-421` `SelectRow` · `:423-466` `SliderRow` — the two locked-control
  families behind `⚙ OPTIONS` and the depth slider.
- `apps/ui/components/ModelPresentation.tsx` `ModelBadge` / `ModelMetaLine` — the house dot and label
  for a model id. `apps/ui/lib/models.ts` `modelKey` already normalises all five ids to a family
  (`claude`, `gpt`, `grok`), so `--m-claude`, `--m-gpt` and `--m-grok` are the identity colours
  available without any new token. **Presentation only** — the identifiers come from
  `PLAN_TIER_ROSTERS` (R3, R11).
- `apps/ui/components/ModeToggle.tsx:32-43` — the `☾` / `☀` control V switches modes with at
  acceptance.

### Tokens each screen consumes (all existing; `globals.css:5-113` and `:115-178`)

Surfaces `--surface`, `--surface-2`, `--surface-sunken`, `--core`, `--shell` · text `--text`,
`--text-2`, `--text-3`, `--muted` · lines `--line`, `--line-2`, `--line-strong` · brand `--accent`,
`--focus` · identity `--m-claude`, `--m-gpt`, `--m-grok` · geometry `--r-card`, `--r-panel`,
`--r-btn`, `--r-pill` · type `--t-ui`, `--t-meta`, `--t-micro`, `--ls-eyebrow`.

### What the app lacks (the mock has to invent these, and `DONE.md` fixes them)

1. **A locked-control treatment.** `globals.css` styles `:disabled` for exactly one selector,
   `.ndStart:disabled` (`:6193`). `.ndSegItem`, `.ndSlider`, `.ndSteerInput` and `.ndSelect select`
   have **no** disabled rule, so a `disabled` attribute changes nothing a reader can see. Nine locked
   gauges that look identical to nine live ones is the whole of acceptance steps 4–6.
2. **A place to put a model list inside a segmented option.** `SegmentedRow` renders
   `{option.label}` — one string. R3 needs two or three ids per option, so either the tier control
   carries its own markup or `SegmentedRow` gains a second slot. See `DECISIONS.md`.
3. **A tier vocabulary.** No `premium`, `plan`, `tier` chrome exists anywhere in `apps/ui`
   (`00-intake.md:53`: grep for `premium|entitlement|subscription|plan_id|paywall|billing` = 0 hits).
   The words on the two options are V's.
4. **A rule about where the locked values are explained.** `.ndIntro` (`page.tsx:180-182`) reads
   "Choose your risk tier, composition budget tier, and depth, then click Start." — a sentence that is
   false while Free is chosen. Whether it changes, and to what, is V's.
5. **CSS placement is not free** (F3): every rule lands before `globals.css:8188`.

---

## 6. Boundaries, DDD impact and the single-writer rule

### Files this slice may write (exhaustive)

**Production:** `packages/contract/src/plan-tiers.ts` (new) · `packages/contract/src/index.ts` ·
`apps/ui/app/new/defaults.tsx` · `apps/ui/lib/api.ts` · `apps/ui/app/new/page.tsx` ·
`apps/ui/app/globals.css`.
**Tests:** `tests/architecture/tier01-roster.test.ts` (new) · `tests/unit/tier01-ask-wire.test.ts`
(new) · `tests/render/tier01-new-plan-tier.test.tsx` (new) · `tests/unit/tier01-style-contract.test.ts`
(new) · `tests/unit/contract.test.ts` · `tests/unit/api.test.ts` · `tests/unit/load01-live-proof.test.ts` ·
`tests/unit/s7-authorization.test.ts` · `tests/integration/evaluator-database.test.ts` ·
`tests/unit/v2ui-data-layer.test.ts` · `tests/unit/pol01-policy.test.ts` · `tests/unit/v2ui-pages.test.ts`
(one line, S01-31) · `tests/unit/t9-mode-tokens.test.ts` (map rows only, S01-41).

### Files this slice must NOT write

`apps/api/**` — S01 changes nothing about what the API *does* with the tier (SPEC R14, §3).
`packages/db/**`, `migrations/**` — the run's record of its tier is S02 (row V-11).
`apps/ui/components/LibraryComposer.tsx` — SPEC §3 Out of scope.
`apps/ui/lib/v3/labels.ts`, `apps/ui/components/AnswerHonestyDrawer.tsx` — row V-14.
`tests/render/ux01-new-debate-form.test.tsx` — F1: repairing it is its own ticket.
`tests/render/consent-*.test.tsx`, `tests/unit/consent-s02-style-contract.test.ts`,
`tests/architecture/role-token-map.test.ts` — read-only constraints on S01 (F3, F4).
`.local/**`, the `:3000` stack, every other mission's dirty file in the main tree (COMMON §3).
`SPEC.md` and `SPEC-v2.md` — frozen. `DONE.md` — V's. `BASELINE.md` — the orchestrator's.

### Single-writer

No two concurrent nodes own the same file. **C3 and C4 are the only clusters designed to run at
once**, and their write surfaces are disjoint: C3 writes `page.tsx`, `tier01-new-plan-tier.test.tsx`
and one line of `v2ui-pages.test.ts`; C4 writes `globals.css`, `tier01-style-contract.test.ts` and
map rows of `t9-mode-tokens.test.ts`. Disjoint surfaces do **not** imply independent effects
(`TOOLING-TRAPS` §"Disjoint WRITE surfaces…"), which is why both commands carry the other's readers:
C3's carries `sup-04-widget` and `sup-04-mounts` (they read `page.tsx`), C4's carries the nine
`globals.css` readers of F4.
**Against S02:** `packages/contract/src/index.ts` is S01's alone in this mission
(`INSTRUCTIONS.md`); S02 reads `plan_tier` and `PLAN_TIER_ROSTERS` and declares neither, and its lane
rebases onto S01's merged C1 commit (row V-12).

### Bounded contexts and domain terms

- **Context touched: the ask contract** (`packages/contract`). One new required field, `plan_tier`,
  and one new declaration, `PLAN_TIER_ROSTERS`. The invariant S01 owns: *an ask names the plan tier
  its asker chose, and the name is one of exactly two.* The honesty law's edge here is that no
  default is invented anywhere — not in the schema (rejected alternative, `DECISIONS.md`), not in
  the builder, not at the guard.
- **Context touched: the debate-start surface** (`apps/ui/app/new`). Invariant: *what is on screen is
  what is sent* (R8). No hidden pre-Free state.
- **Domain terms introduced:** `plan tier` (free | premium), `tier roster` (the ordered model ids a
  tier runs), `the Free lock` (the mechanism that pins and disables the fourteen controls, and the
  thing `machine:plan-tier-free` names).
- **Not introduced, deliberately:** entitlement, subscription, paywall, billing — row V-6 puts none of
  them in this mission, and naming one in code would outlive the reason it was written.
- **A term corrected:** `tier_source` and `composition_budget_tier` already exist on the ask and mean
  something else. `plan_tier` is the name row V-8 wrote precisely so a reader cannot mistake it for
  either (`DECISIONS.md`).

---

## 7. Verification list for the whole slice — what `REV(S01)` runs once every cluster is green

Three runs, worst run wins. Every row asserts the **delta** against `BASELINE.md`, never an absolute.
Rows marked **†** have no `BASELINE.md` row yet; they were measured by `ARCH(S01)` in the S01 lane at
`7f89f7b7` (dirty 0 before and after) and are offered to the orchestrator to append.

### The suites SPEC R19 names

| Suite | Base | After S01 |
|---|---|---|
| `tests/render/ux01-new-debate-form.test.tsx` | 1 passed \| 7 failed (8) | 1 passed \| 7 failed (8) — unchanged; the 7 are the F1 harness break, not S01's |
| `tests/unit/v2ui-pages.test.ts` | 36 passed \| 5 failed (41) | 36 passed \| 5 failed (41) |
| `tests/architecture/s14-contract.test.ts` | 2 passed \| 3 failed (5) | 2 passed \| 3 failed (5) — case by case: `routes browser contract traffic…` and `W7 removes the obsolete source-text test corpus…` stay passing; the three failures stay failing and none changes direction |
| `tests/render/sup-04-widget.test.tsx` | 8 passed (8) | 8 passed (8) |
| `tests/architecture/sup-04-mounts.test.ts` | 0 passed \| 2 failed (2) | 0 passed \| 2 failed (2) |
| `tests/unit/evaluator-dev-menu-ui.test.ts` | 2 passed (2) | 2 passed (2) |
| `tests/unit/v2ui-data-layer.test.ts` | 57 passed (57) | 57 passed (57) |
| `tests/unit/pol01-policy.test.ts` | 8 passed (8) | 8 passed (8) |
| `tests/unit/t9-mode-tokens.test.ts` | 7 passed \| 2 failed (9) | 7 passed \| 2 failed (9) |
| `tests/render/prov01-honesty-drawer.test.tsx` | 1 passed (1) | 1 passed (1) |

The named pre-existing failures, so no seat claims one: `v2ui-pages` — `kills MUT-A…`, `kills MUT-C…`,
`uses DR-160 content-aware overflow…`, `pins tree, thread, outline, split, map, and drawer at all
eight call sites`, `shows typed review outcome and reviewer house on cards…`. `t9-mode-tokens` —
`renders one accessible toggle that reads the document mode, flips it, and persists it`, `leaves no
mode-inert colour literal in the four Wave-0 product files`. `sup-04-mounts` — `admits exactly the
four product-route importers`, `keeps the root layout and every zone route structurally
support-free`. `s14-contract` — `uses the generated contract client…`, `FX-ORPH-04 walks web
consumers…`, `carries the S04 orphan-audit wording fix…`. `ux01` — the seven of F1.

### The R20-A suites

`tests/unit/api.test.ts` 24 → **25** (S01-6 adds one case) · `tests/unit/contract.test.ts` 7 → **8**
(S01-2) · `tests/unit/load01-live-proof.test.ts` 1 → 1 · `tests/unit/s7-authorization.test.ts`
31 → 31 · `tests/integration/evaluator-database.test.ts` 21 → 21.

### The readers of S01's write surfaces that no requirement names (F4) †

All seventeen rows of the F4 table, at the numbers measured there. Every one must end at its base
pair. The two that are load-bearing rather than incidental: `tests/unit/consent-s02-style-contract.test.ts`
10/10 and `tests/render/consent-bar.test.tsx` 7/7 — the pair that closes the tail of `globals.css`.

### The new suites †

`tests/architecture/tier01-roster.test.ts` · `tests/unit/tier01-ask-wire.test.ts` ·
`tests/render/tier01-new-plan-tier.test.tsx` · `tests/unit/tier01-style-contract.test.ts` — each 0 at
base (the file does not exist), each fully passing after its cluster.

### Typecheck delta (R21)

```sh
o=$(pnpm typecheck 2>&1); rc=$?
printf '%s\n' "$o" | sed -n 's/^\([^(]*\)(.*/\1/p' | sort -u > /tmp/after.files
```
The added-file list — `comm -13` of the base file list (`BASELINE.md` § *Lane `tiers-s01`*, the
22-file pinned list) against `/tmp/after.files` — must be **empty**. `rc=1` is expected and
inherited; `rc=0` would itself be a change worth reporting.

### Cross-cluster and cross-slice mounts

1. `packages/contract/generated/field-inventory.json` → `resources.AskRequestSchema` contains
   `plan_tier` after `generate:contract` (C1 → C2 → the API).
2. The page's rendered model ids equal `PLAN_TIER_ROSTERS` member for member (C1 → C3), asserted by
   S01-25 reading the export rather than a literal.
3. A submit from `tier01-new-plan-tier.test.tsx` reaches the mocked `createDebate` with the chosen
   tier, and `tier01-ask-wire.test.ts` proves that config survives `createDebate` onto the ask
   (C3 → C2 → C1).
4. **Cross-slice:** S02 imports `PlanTier` and `PLAN_TIER_ROSTERS` from `@debateai/contract` and
   declares neither (row V-12). The mount is the C1 commit S02's lane rebases onto.
5. `git status --porcelain | wc -l` in the lane is 0 for `packages/contract/generated` after
   `generate:contract` — the directory is gitignored (R15).

### Acceptance

SPEC §2 steps 1–12, run by V personally, once in Terracotta and once in Chamber, plus every
`DONE.md` measurement. No seat marks a slice done.

---

## 8. Refutation — what each criterion catches, and what it does not

### Per step (the failure the criterion catches, and one it does not)

| Step | Catches | Does NOT catch |
|---|---|---|
| S01-1 | a second declaration of any of the five ids; a roster in the wrong order | an id that is correct in the roster and wrong in the design — the roster is self-consistent, not verified against V's words. Row C1 / V-7 is where the ids came from |
| S01-2 | `plan_tier` absent, optional, or admitting a third value; `.strict()` dropped | a `plan_tier` the API accepts and then ignores — that is S02 |
| S01-4 | a schema edit that drops another field (the diff-stat arm) | a re-ordering of the remaining fields, which no assertion pins |
| S01-5 | `generate:contract` not re-run; the generated file committed | a stale `generated/` in a **different** lane — S02's lane must run it too after rebasing |
| S01-6 | the API accepting `plan_tier: "gold"`, or a body with none | a `202` whose run then does nothing with the tier (S02) |
| S01-8 | any of the 13 literals left tier-less, via its own suite's count | a **14th** literal added to those files after this sweep. R20's own rule: a later member is a finding on R20 |
| S01-13 | a required member (it would red `ux01`'s one green case and `pnpm typecheck`) | a member typed `string` instead of `PlanTier` — the typecheck arm catches the assignment, not a widened alias |
| S01-15 | the provenance string still naming the deployment floor | the honesty drawer's *sentence* still naming that floor beside it — row V-14, SPEC §3, deliberately out of scope |
| S01-17 | a tier-less or unknown-tier ask reaching the network (the `submitAsk` not-called arm) | a tier the asker never chose being *inserted upstream* — nothing between the page and the guard is asserted to be pass-through |
| S01-20/21 | a control with the wrong attributes, or with both options checked | a control that is present, correct and invisible (0 opacity, off-screen) — that is `DONE.md`'s and V's eye |
| S01-22 | the selector rendered below the question box | the selector rendered above it and *visually* below it via CSS order — V's acceptance step 1 |
| S01-23 | any of the six Free values wrong on open | a value correct on open and wrong after a session-defaults effect resolves; S01-24's single-`useEffect` arm is what bounds that |
| S01-27 | any of the fourteen left operable (the count-of-fourteen arm defeats a vacuous pass) | a control disabled by CSS `pointer-events` instead of the attribute — the assertion is on the attribute, which is also what R4 requires |
| S01-31 | the Free lock written inside `submit`; **and** the empty-region defect itself, since `region()` throws on it | the lock written in a helper called *from* `submit` and defined outside the region |
| S01-34/35 | a restore from remembered state; a Free re-choice that pins only some values | a restore implemented in `sessionStorage` rather than a state variable — the `grep` arm names three identifiers, not a storage API |
| S01-40 | a rule appended after `globals.css:8188` (the two consent suites red) | a rule inserted *inside* the `nd*` region that shadows an existing `.nd*` selector |
| S01-41 | a token in the stylesheet and not in the map, or the reverse | a token registered in both and never referenced by any rule |
| S01-43 | a new diagnostic in a file the baseline does not pin | a new diagnostic **inside** an already-pinned file — the delta is by file, not by count. Deliberate: the pinned counts belong to other missions and move without S01 |

### Per cluster (the mutant class the command detects)

- **C1** — detects any mutant that removes the field, the roster, or a tier from an ask literal:
  every one shows up as a `passed/failed` pair that differs from the expected triple. It does **not**
  detect a mutant that changes what `apps/api` does after the `202`; nothing in C1 exercises the
  runner.
- **C2** — detects a mutant that deletes the guard (`tier01-ask-wire`'s `submitAsk`-not-called arm
  goes green→red), that reverts the provenance string, or that makes the type member required
  (`ux01` 1→0). It does **not** detect a mutant that changes the guard's *message text* beyond the
  `ASK_FIELD_REQUIRED:` prefix; only the prefix is asserted.
- **C3** — detects a mutant that removes any one of the fourteen `disabled` attributes (the
  count-of-fourteen arm), that swaps the initial tier, that restores pre-Free values, or that moves
  the lock into `submit` (S01-31's repaired region). It does **not** detect a mutant that changes the
  option **labels** — those are `DONE.md`'s, measured in C5.
- **C4** — detects a mutant that appends a rule at end-of-file (the two consent suites), that adds a
  colour literal outside the two blocks (`t9-mode-tokens`), or that declares a token in only one
  mode (`t9-mode-tokens`'s inventory case). It does **not** detect a rule that is valid, registered,
  and wrong to the eye — that is V's, at acceptance.
- **C5** — detects a `DONE.md` measurement not carried into an assertion, because each assertion
  names the `DONE.md` line it measures and the count is compared to `DONE.md`'s.

### The contradiction check between SPEC requirements

Run over R1–R21 pairwise for the pairs that touch the same object. **One tension found, and it is
already resolved in the SPEC's own text, not by this plan:** R2 (Free preselected) plus R7 (Free pins
risk tier to `standard`) makes `riskTier.length > 0` true on open, so R18's `ready` becomes reachable
without the asker touching the risk-tier control — which is exactly the state R7's pass-2 addition
identifies as newly reachable and answers with `machine:plan-tier-free`. No further contradiction:
R4's fourteen ids and R9's "none of the controls listed in R4" are the same list read in two
directions; R10 and R7 are the range and the value, and `v2ui-pages:93-95` pins the range while R7
pins the value. **No step needs the SPEC to move**, so no new SPEC version is proposed by this node.

---

## 9. RED-first order

```
C1:  S01-1 RED → S01-3 GREEN → S01-2 RED → S01-4 GREEN → S01-5 → S01-6 RED → S01-7 GREEN
     → S01-8 → S01-9 · S01-10 · S01-11 (assertions on the cluster command)
C2:  S01-12 RED → S01-13 GREEN → S01-14 RED → S01-15 GREEN → S01-16 RED → S01-17 GREEN
     → S01-19 → S01-18 (assertion)
C3:  S01-20 RED → S01-21/22 GREEN → S01-23 RED→GREEN → S01-25 RED→GREEN → S01-27 RED
     → S01-28 GREEN → S01-30 · S01-33 · S01-34 · S01-35 · S01-36 RED→GREEN
     → S01-31 (repair, with its mutant run) → S01-24 · S01-26 · S01-29 · S01-32 · S01-37
     · S01-38 · S01-39 (assertions)
C4:  S01-40 (with its end-of-file mutant run) → S01-41 → S01-42 → S01-43
C5:  after V's DONE.md
```

Two mutant runs are steps in their own right and are reported with their output: S01-31's
(`maxTokens` inserted inside `submit` must red the repaired guard) and S01-40's (a rule appended at
end-of-file must red `consent-s02-style-contract` and `consent-bar`). A guard not shown to fail is
not shown to work — the class `TOOLING-TRAPS` §"Validate a checker on known-GOOD input, not only
known-bad" records in both directions.

## 10. ADRs

**`ADR-0023-globals-css-append-fence.md`** — written by this node. The decision that outlives the
mission: `apps/ui/app/globals.css` has a contractually closed tail, and every future slice's CSS goes
before it. F3 is mission-independent; the next UI slice that appends at end-of-file reds two suites
that name neither it nor its mission. Mission-local law stays in `DECISIONS.md`.
