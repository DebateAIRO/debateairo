# DECISIONS — S01 · The Free/Premium selector on `/new` (append-only)

One line per decision: date · question · choice · reason · who ruled. Checked before any question
goes to V — a question answered here is re-asked to nobody. Never rewritten, only appended.

## Decisions taken

| Date | Question | Choice | Reason | Ruled by |
|---|---|---|---|---|
| 2026-09-09 | Which slice owns `packages/contract/src/index.ts`? | **S01** | S01's own acceptance is "the ask carries the tier"; without the `.strict()` field the POST is rejected as `MALFORMED_REQUEST` before S02 could ever read it (`apps/api/src/index.ts:288-297`). S02 reads the field and the rosters, and declares neither. | REQ (charge 4) |
| 2026-09-09 | Where do the tier rosters live, so the screen and the fleet cannot disagree? | One exported declaration in `packages/contract`, created by S01 | Both apps already import `@debateai/contract` (`apps/ui/lib/api.ts:8`, `apps/api/src/index.ts:43`). A second declaration in S02 would let the names on the selector drift from the models that argue — the exact failure V would see and could not explain. | REQ |
| 2026-09-09 | How is a locked gauge locked? | The native `disabled` attribute on the existing controls | `SegmentedRow` renders `<button>`, `SelectRow` a `<select>`, `SliderRow` an `<input type=range>` (`apps/ui/app/new/page.tsx:347-466`) — all natively disable-able, all mechanically checkable, and a disabled control drops out of the tab order without extra code. | REQ |
| 2026-09-09 | Which value does risk tier take in Free? | `standard` | Row V-4's own fallback branch. The deployment floor is unreachable from this page: `tests/unit/v2ui-pages.test.ts:90` forbids `contractClient.readDeployment` in `apps/ui/app/new/page.tsx`, `tests/render/ux01-new-debate-form.test.tsx:168` asserts it is never called, and `deriveRiskTierDefault` (`apps/ui/app/new/defaults.tsx:26`) has no caller in `apps` or `tests`. | REQ, opened to V as row V-10 |
| 2026-09-09 | Is `plan_tier` required or optional on the ask? | Required | An optional field lets a run exist with no tier, and S02 would then choose a fleet for an ask that never chose one — the invented default the honesty law forbids. Priced: 13 ask literals in 5 files gain one line (SPEC R20). | REQ, opened to V as row V-13 |
| 2026-09-09 | Where is the Free lock written in the source? | In the render and state layer, never inside `submit` | `tests/unit/v2ui-pages.test.ts:79-87` asserts the region from `async function submit` to `return (` names none of `branching`, `concurrency`, `maxTokens`. A lock that resets the V2 knobs inside `submit` turns that suite RED for a reason unrelated to tiers. | REQ |
| 2026-09-09 | How is Tree depth pinned to 2 in Free? | The VALUE becomes 2 and `#treeDepth` is disabled; the 1..5 range is untouched | `tests/unit/v2ui-pages.test.ts:93-95` asserts `const DEPTH_MIN = 1;`, `const DEPTH_MAX = 5;` and the `min={DEPTH_MIN} max={DEPTH_MAX}` pair verbatim. Narrowing the range to pin the value breaks them. | REQ |
| 2026-09-09 | Does the field keep row V-8's name? | Yes — `plan_tier` | The ask already carries `risk_tier`, `tier_source` and `composition_budget_tier`; a bare `tier` or `plan` would read as one of those at a glance. Row V-8 already wrote `plan_tier`. | REQ |
| 2026-09-09 | Does REQ specify the selector's appearance? | No | `heartbeat-requirements` §2: what done looks like on a UI slice is V's, through `MOCK(S01)` → `DONE.md`. This SPEC pins semantics (`data-field`, `aria-checked`), state and wire shape only. | REQ (contract) |
| 2026-09-09 | What provenance does a Free ask send, now that the Free lock makes *(risk tier set, `riskTierWasEdited` false)* reachable? | `tier_source` stays `MACHINE_DEFAULT`; the `false` branch of `tier_provenance_ref` reads `machine:plan-tier-free` instead of `machine:deployment-floor` | The asker did not choose the value, so `MACHINE_DEFAULT` is true; the deployment floor is NOT what set it, so naming the floor is a false record on a plaintext column billing and audit read (`packages/db/src/schema.ts:118-119`). No schema change follows: `tier_provenance_ref` is `z.string().trim().min(1)` (`packages/contract/src/index.ts:111`) and `createDebate` reads it with `requiredString` and no allow-list (`apps/ui/lib/api.ts:377`). Measured cost: no suite asserts the `false` branch this function derives — the three call sites are `page.tsx:121` and `ux01:217, 219`, and the two test calls assert `.as_of` only. | REQ-FIX pass 2 (finding B3) |
| 2026-09-09 | Is the new `NewDebateAskDefaults` member required or optional? | Optional, with the `createDebate` guard as the single mandatory check | A required member turns `tests/render/ux01-new-debate-form.test.tsx:217` and `:219` — spreads with no tier — into new typecheck diagnostics in a file not pinned in `BASELINE.md:10-32`, which R21 forbids; R13 and R21 could not both hold. The type already carries three optional members for inputs the page does not always supply (`defaults.tsx:52-54`). No default is invented: an absent tier is refused before any network call with `ASK_FIELD_REQUIRED:`, exactly as `risk_tier` is today (`apps/ui/lib/api.ts:371-372`). | REQ-FIX pass 2 (finding B2) |
| 2026-09-09 | Which suites does R19 name, now that R13's guard reaches beyond the schema-parsed literals? | The seven of pass 1 plus `tests/unit/v2ui-data-layer.test.ts` (base 57/57) and `tests/unit/pol01-policy.test.ts` (base 8/8) | Both construct a `createDebate` config with no tier and both break under R13: `v2ui-data-layer:753-767` fails its positive create at `:767`, and `pol01-policy:49-58` asserts an exact rejection string at `:58` that the guard pre-empts. Neither had a baseline at pass 1, so R19's floor rule could not be applied to them and a `REV(S01)` measuring only the named suites would have passed a slice that broke two. Baselines measured in BOTH lanes on 2026-09-09 and recorded in `BASELINE.md`. | REQ-FIX pass 2 (finding B2) |
| 2026-09-09 | Does S01 change the words the honesty drawer renders for `MACHINE_DEFAULT`? | No — out of scope, routed as row V-14 | `apps/ui/lib/v3/labels.ts:6` maps `MACHINE_DEFAULT` to the fixed phrase "machine default from the deployment floor", rendered at `apps/ui/components/AnswerHonestyDrawer.tsx:86` beside the ref. It is the debate page, not the `/new` surface this slice owns; it is shared by every run in the app; and `tests/render/prov01-honesty-drawer.test.tsx:41` asserts the phrase verbatim. Changing a shared honesty label and a green assertion inside a UI slice about `/new` is a slice of its own. | REQ-FIX pass 2 (finding B3, second class member) |

## Alternatives rejected (the brainstorming discharge — nobody re-derives these)

| Rejected | Why |
|---|---|
| Hide the gauges entirely while Free is chosen | V said "locks", not "removes". A hidden gauge gives V nothing to look at in acceptance step 5, and the mock cannot draw a lock that is not on screen. |
| Remember the Premium values and restore them when Premium is re-chosen | Hidden state the screen does not show. What is on screen is what is sent; a restore makes acceptance step 10 depend on memory V cannot see. YAGNI. |
| Put the selector on the `/` library composer as well | Row V-2: the composer already routes to `/new?topic=…` (`apps/ui/components/LibraryComposer.tsx:37`), so one selector on `/new` covers both entry paths. Two selectors is two places to disagree. |
| A separate `/new/free` and `/new/premium` route, or a `?tier=` parameter | Doubles the surface every existing `/new` test walks, and V's words are "a UI element above where the question is written" (`00-intake.md:13`). |
| Read the deployment floor for the Free risk tier | Two existing assertions forbid this page from reading deployment state (see the V-10 row above). Adding the read to satisfy row V-4 literally would turn a green guard RED for a reason unrelated to tiers. |
| Take the displayed model names from `apps/ui/lib/makerIdentity.ts` | That map is presentation — labels and colours. The roster is the source of truth for WHICH models; identity may still supply how each is drawn. |
| Make `plan_tier` optional with a `free` default in the schema | A schema default is an invented value: the API would record a tier the asker never chose. |
| Disable the `⚙ OPTIONS` toggle itself in Free | V would not be able to see the locked knobs at all, and acceptance step 6 would be unrunnable. The knobs lock; the view does not. |
| Add the tier to `depth_params` (an open record, `packages/contract/src/index.ts:114`) instead of a new field | It would slip past `.strict()` without a contract change — and that is exactly why it is wrong: the tier would be invisible in the field inventory, in the OpenAPI document and to every reviewer. |

## Rows opened for V (routed through the orchestrator, never to V directly)

`V-ROW: V-10 · S01 · The Free risk-tier value · Recommended default: pin risk tier to "standard" and
do not read the deployment floor from /new. Evidence: tests/unit/v2ui-pages.test.ts:90 and
tests/render/ux01-new-debate-form.test.tsx:168 forbid the read; apps/ui/app/new/defaults.tsx:26 has
no caller. Row V-4's own "else standard" branch. Smallest yes/no for V: "Free pins risk tier to
Standard?" · VERDICT pin standard / CONFIDENCE high / STRONGEST COUNTER: a deployment that sets a
riskTier floor of high-stakes would have Free quietly run below its own floor — if V wants the floor
respected, the read has to move to the server side, which is a slice of its own.`

`V-ROW: V-13 · S01 · plan_tier required or optional on AskRequestSchema · Recommended default:
required, no schema default. Priced: 13 ask literals in 5 files (tests/unit/api.test.ts ×7,
tests/unit/contract.test.ts ×3, tests/unit/load01-live-proof.test.ts, tests/unit/s7-authorization.test.ts,
tests/integration/evaluator-database.test.ts) each gain one line. Smallest yes/no for V: "Must every
ask name its tier?" · VERDICT required / CONFIDENCE high / STRONGEST COUNTER: any ask producer
outside this repo would break at once — none was found (grep for AskRequestSchema and /v1/asks over
apps, packages and tests, 2026-09-09).`

*Row V-14 is written WITHOUT surrounding or nested backticks, on purpose: finding N1 of REQ-REV-p1
recorded that rows V-11 and V-12 were truncated in `V-DECISIONS-PACKET.md` where a nested backtick in
a backtick-wrapped `V-ROW:` line opened. Plain text transcribes into a table cell intact. Pipes are
avoided for the same reason.*

V-ROW: V-14 · S01 · The words the honesty drawer renders for a machine-default risk tier · Recommended
default: S01 does NOT change them; the phrase stays as it is and the change is a slice of its own.
Evidence: apps/ui/lib/v3/labels.ts:6 maps MACHINE_DEFAULT to the fixed phrase "machine default from
the deployment floor", and apps/ui/components/AnswerHonestyDrawer.tsx:86 renders that phrase beside
answer.tier_provenance_ref. Under S01 R7 a Free run stores tier_provenance_ref
"machine:plan-tier-free" — honest — while the sentence beside it still names a deployment floor this
page never read, so the drawer keeps a claim the record no longer makes. Against changing it now: the
drawer is the debate page and not the /new surface S01 owns; the label is shared by every run in the
app, not only Free ones; and tests/render/prov01-honesty-drawer.test.tsx:41 asserts the phrase
verbatim in a suite that has no BASELINE.md row, so changing it turns an unmeasured honesty suite red
inside a UI slice about a selector. Smallest yes/no for V: "May the honesty drawer keep saying
'machine default from the deployment floor' for a Free run whose tier was set by the Free lock?" ·
VERDICT keep the phrase in S01 and route the change / CONFIDENCE medium / STRONGEST COUNTER: the
honesty law is this mission's sharpest edge (INSTRUCTIONS.md), the drawer is where V would actually
read the claim, and a false sentence on screen is worse than a false string in a column — if V rules
that way, the change is to derive the words from tier_provenance_ref rather than from tier_source,
and prov01's assertion moves with them.

## Corrections appended at REQ-FIX pass 2 (2026-09-09) — the rows above stand as written, never edited

- **The `/` composer is a route FALLBACK, not a route** (finding N7). The rejected-alternative row
  above, "Put the selector on the `/` library composer as well", says the composer "already routes to
  `/new?topic=…` (`apps/ui/components/LibraryComposer.tsx:37`)". Measured correction: the composer
  first calls `createDebate(topic.trim(), { max_depth: 3, branching: 2, max_tokens: 800 },
  COOKIE_SESSION_MARKER)` at `:29-31` — a config with no `risk_tier` — which throws
  `ASK_FIELD_REQUIRED` today; the bare `catch {}` at `:34` swallows it and `:37` is the FALLBACK that
  runs. **The row's conclusion is unchanged** — one selector on `/new` still covers both entry paths,
  because the direct call cannot succeed — but the reason is "the direct call always fails", not "the
  composer routes". The consequence is written into `SPEC-v2.md` §3 Out of scope: the day someone makes
  that direct call succeed it becomes a member of R20's class and the ask must carry a tier the asker
  chose. `00-intake.md:49` carries the same correction (the orchestrator's, made 2026-09-09).
