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

## Orchestrator folds after REQ-REV pass 2 PASS (2026-09-09 22:04) — SPEC-v2.md stays frozen; these lines are the record where it is stale

- **N1 (REQ-REV-p2).** `SPEC-v2.md:182-186` and `:298-299` say `tests/unit/t9-mode-tokens.test.ts` and `tests/render/prov01-honesty-drawer.test.tsx` have no `BASELINE.md` row. Both have had one since 21:40 (`BASELINE.md` end section): `t9-mode-tokens` 2 failed | 7 passed (9) on both lanes, both failures named; `prov01-honesty-drawer` 1 passed (1). The rule the SPEC invokes ("measured before the first RED test") is already satisfied; BUILD(S01) asserts the delta against those rows and never re-measures them into the handoff.
- **N3 (REQ-REV-p2).** R20 sub-class B's count sentence is off by one: `tests/render/ux01-new-debate-form.test.tsx:15, 72` is a `vi.fn()` mock of `createDebate`, not a call site (the reviewer's own sweep, verdict §3 N3; the member table is right, the arithmetic is not). BUILD(S01) sweeps by R20's member table, never by the count.
- **N4 (REQ-REV-p2).** `DONE.md:9` and `:29` now point at `SPEC-v2.md` (the orchestrator writes DONE.md at the mock gate).
- **N2 (REQ-REV-p2).** R20 sub-class A's five suites now have `BASELINE.md` rows (end section, 22:07): `api` 24/24 · `contract` 7/7 · `load01-live-proof` 1/1 · `s7-authorization` 31/31 · `evaluator-database` 21/21, both lanes. R19's floor rule applies to them; the one-line additions R20-A prices are asserted as the delta against these rows.

## Decisions taken by ARCH(S01), pass 1 — 2026-09-09, ticket `t_dfd8f52d` (append-only; the rows above stand as written)

Every line number below is the LANE copy at `7f89f7b7`. Every measurement was run by `ARCH(S01)` in
`.worktrees/tiers-s01/dialectical-engine` with 0 dirty entries before and after.

| Date | Question | Choice | Reason | Ruled by |
|---|---|---|---|---|
| 2026-09-09 | Where do S01's RENDERED cases live, given that `tests/render/ux01-new-debate-form.test.tsx` is 1/8 at base? | A new suite `tests/render/tier01-new-plan-tier.test.tsx` on the harness that works; `ux01` is neither repaired nor extended | Measured: all 7 `ux01` failures are one stderr — `Invalid hook call. Hooks can only be called inside of the body of a function component.` — caused by the suite's own `vi.mock("react", …)` (`ux01:57-61`) against the hand-rolled hook slots (`:21-55`). Every case that renders the page fails; the only passing case (`:210-224`) does not render. So `ux01` cannot verify R1, R2, R4–R6, R8–R10 at all, and a BUILD seat writing them there could not tell its own RED from the harness's BROKEN. `tests/render/sup-04-widget.test.tsx` is 8/8 at base with real React + `createRoot` + `act` + jsdom (`:1-51`); that idiom is copied. | ARCH(S01) |
| 2026-09-09 | Does S01 repair the `ux01` harness? | No — a finding with its own ticket | It is not a requirement of this SPEC, it touches no S01 write surface, and a UI slice about a selector is not where a mocked-React harness gets rebuilt. Law 3.2 sets WHEN, not WHETHER: the finding is filed with the handoff. Cost of deferring: `/new`'s pre-existing rendered behaviour stays unverified — which it already is, at base. | ARCH(S01) |
| 2026-09-09 | Where in `apps/ui/app/globals.css` do S01's rules go? | Inserted after `.ndKeyHint` (`globals.css:6206`), never after the consent-ui S01 open marker at `:8188` | The file's tail is contractually closed by two suites that are GREEN at base and named in NO requirement of this SPEC: `tests/unit/consent-s02-style-contract.test.ts:248-249` requires `css.slice(indexOf(S02_CLOSE_MARKER)+…).trim() === ""`, and `tests/render/consent-bar.test.tsx:270-280` admits only whitespace, or consent-S02's one block then whitespace, after consent-S01's close marker — its own comment reads: "A third block, a stray rule between the two, or anything at all after S02's closing marker still fails here." Measured: consent-S01 opens `:8188` closes `:8559`; consent-S02 opens `:8561` closes `:8980`, the last line. Appending S01's CSS at end-of-file reds 10/10 and 7/7. Token additions are unaffected — R17 puts them at `:5-113` and `:115-178`, above the fence. | ARCH(S01), and ADR-0023 because it outlives the mission |
| 2026-09-09 | What actually verifies "the Free lock is not written inside `submit`" (SPEC R16, and the REQ row above)? | A one-line repair to `tests/unit/v2ui-pages.test.ts:83` using that file's own `region()` helper | Measured: the guard is VACUOUS today. `newPage.indexOf("return (")` finds `NewDebatePage`'s return at `page.tsx:57`, before `async function submit` at `:113`, so `slice(4717, 2191).length = 0` and the case asserts nothing about any page. `region()` (`v2ui-pages:28-34`) already carries `expect(endIndex).toBeGreaterThan(startIndex)`, so it turns the empty region into a failure. The repair keeps the case passing (today's `submit` names none of the five), so `v2ui-pages` does not drop below 36/41. | ARCH(S01) |
| 2026-09-09 | Is the tier control a reuse of `SegmentedRow`, an extension of it, or its own markup? | Its own markup in `page.tsx`, rendering `SegmentedRow`'s exact attribute contract | `SegmentedRow` (`page.tsx:347-387`) already renders every attribute R1 names — `role="radiogroup"`, `role="radio"`, `id={field}-{value}`, `data-field`, `data-value`, `aria-checked` — so the semantics are copied, not invented. It cannot be reused as-is because it renders one string per option (`{option.label}`, `:381`) and R3 needs two or three model ids per option; and it renders `.ndRow`, which belongs inside `.ndCard`, while R1 puts the control above `.ndTopicBezel`. Extending the shared component for its one new caller is the alternative, rejected below. | ARCH(S01) |
| 2026-09-09 | Is the Free lock applied by a `useEffect` keyed on the tier, or by initial state plus the control's `onChange`? | Initial state plus `onChange`; no effect | An effect makes R2 and R8 depend on the effect-replay behaviour of whichever harness renders the page, and the measured cost of that dependency is the `ux01` break above. The page has exactly one `useEffect` today (`page.tsx:86-99`, session defaults) and keeps exactly one. The initial constants become the Free values: `riskTier` `""`→`"standard"` (`:75`), `depth` `1`→`2` (`:71`); `budgetTier` already starts `"low"` and both steering states already start `""`. `riskTierWasEdited` stays `false` (`:76`) and is still set true only at `:189-192`, which is what keeps R7's provenance pair reachable. | ARCH(S01) |
| 2026-09-09 | Where inside `packages/contract` does the roster live? | A new sibling module `packages/contract/src/plan-tiers.ts`, re-exported from `src/index.ts` | R11 admits either. A sibling keeps the five model ids in one small file, which is what makes R11's "exactly one declaring file" checkable by naming that file rather than a line range inside a 700-line module. Verified reachable: `packages/contract/package.json` exports `./generated/client.ts`, and that file is `export * from "../src/index.js"` — so anything re-exported from `src/index.ts` reaches `@debateai/contract` for both apps. | ARCH(S01) |
| 2026-09-09 | How is R11's "each model id is written as a roster member in exactly one file" checked without false positives? | A QUOTED-EXACT scan for the literal with its own quotes, not a bare id scan | `apps/ui/components/landing/cards.ts:27-28` writes `claude-opus-5` and `gpt-5.6-sol` inside prose ("Anthropic · Claude · claude-opus-5"). Validated on known-good AND known-bad input before shipping the command: bare-id scan finds 1 file for each of those two ids today, quoted-exact finds 0 files for all five. A bare scan would report a duplicate declaration that does not exist and stall the cluster. | ARCH(S01) |
| 2026-09-09 | Which suites does `REV(S01)` run beyond the nine SPEC R19 names? | The seventeen standing suites that READ an S01 write surface, listed with measured baselines in `PLAN.md` §0 F4 and §7 | R19 names the suites the requirements TOUCH, not the suites that WATCH the files S01 writes. Swept over `tests/` and `acceptance/`, full paths, N of N; seventeen suites read `apps/ui/lib/api.ts`, `apps/ui/app/globals.css` or `packages/contract/src/index.ts`, have no `BASELINE.md` row, and are named in no requirement. Eight of them are RED at base for other missions' reasons, so a seat measuring them for the first time mid-cluster would read inherited failures as its own. All seventeen measured in the S01 lane at `7f89f7b7`, dirty 0 before and after. | ARCH(S01); the rows are offered to the orchestrator, `BASELINE.md`'s only writer |
| 2026-09-09 | The cluster cut, and what runs in parallel | C1 contract → C2 ask wire → (C3 page ∥ C4 stylesheet) → C5 DONE.md | C1 is first so S02's lane can rebase onto the contract commit early (row V-12, packet charge 2). C2 depends on C1 because `createDebate` cannot put `plan_tier` on a `.strict()` `AskRequest` that has no such field. C3 depends on C2 for the builder input. C3 and C4 have disjoint write surfaces — `page.tsx` versus `globals.css` — so they are the pair cut for two concurrent Codex seats; each command carries the OTHER's readers, because disjoint write surfaces do not imply independent effects. | ARCH(S01) |
| 2026-09-09 | Where do the builder and guard cases live? | A new suite `tests/unit/tier01-ask-wire.test.ts` | The builder's only existing test home is `ux01` (1/8, broken harness) and the guard's is `v2ui-data-layer` (57/57). Putting new cases in a 7-failure file invites a seat to read an inherited failure as its own; putting them in a green file makes its floor move for two unrelated reasons at once. A new file has an unambiguous floor of zero. | ARCH(S01) |
| 2026-09-09 | Does `ARCH(S01)` propose a new SPEC version? | No | The pairwise contradiction check over R1–R21 found one tension and the SPEC already answers it in its own text: R2 plus R7 makes `riskTier.length > 0` true on open, which is exactly the newly reachable state R7's pass-2 addition identifies and answers with `machine:plan-tier-free`. No step needs the SPEC to move. | ARCH(S01) |

## Alternatives rejected by ARCH(S01) — the brainstorming discharge (nobody re-derives these)

| Rejected | Why |
|---|---|
| Repair `ux01`'s mocked-React harness inside S01, so the rendered cases can live where they already are | It is a second slice's worth of work inside a UI slice about a selector, it touches no S01 write surface, and it would put S01's own acceptance behind an unrelated repair. Filed as a finding with a ticket instead. |
| Write the rendered cases in `ux01` anyway and accept 8 more failures | R19's floor is "no suite ends with fewer passing cases than its baseline" — new cases that fail for the harness reason satisfy the letter and destroy the signal. A seat would then be reading 15 failures to find its own. |
| Extend `SegmentedRow` with a `sublabel` / `renderOption` prop and reuse it for the tier | It changes a component three other rows already use, for exactly one new caller, before the mock has said whether the tier even reads as a segmented row. If `DONE.md` lands on a plain segmented row with a sub-line, the extension becomes the smaller diff and is a named contingency — not a choice made ahead of the design. |
| Apply the Free values with a `useEffect` keyed on `planTier` | It gets R2 and R8 for free in one hook, and it buys them with a dependency on effect-replay order — the precise mechanism whose failure is `ux01`'s 7/8. Initial state plus `onChange` is verifiable by reading the first render. |
| Put the rosters directly in `packages/contract/src/index.ts` beside `AskRequestSchema` | R11 admits it, but "exactly one declaring file" then means "one region inside a 700-line module", and the check degrades from naming a file to naming a line range that moves. |
| Append S01's CSS at the end of `globals.css`, as the two consent slices did | Measured: it reds `consent-s02-style-contract` (10/10) and `consent-bar` (7/7), neither of which is named in any requirement of this SPEC. The two consent blocks are the tail, by contract, and the S02 close marker is the last text in the file. |
| Assert the cluster suites in ONE multi-path `vitest run` | A multi-path run silently drops a path that does not exist and reports on the subset — so a renamed or unwritten test file yields a green command that no longer runs the test it was written for. One path per invocation is loud, and the per-suite `passed:failed` pair asserts each delta separately instead of pooling them into a total a proper subset can satisfy. |
| Assert only the passed count per suite | A suite that gains one passing case while losing another keeps its total. Both numbers are asserted. |
| Verify R11 with a bare `grep` for each model id | Validated and rejected on measured input: the bare scan finds `apps/ui/components/landing/cards.ts` for two of the five ids, where they sit inside a display string, and would report a duplicate declaration that does not exist. |
| Leave `tests/unit/v2ui-pages.test.ts:83` alone, since the case is green | It is green for every possible page — the region it slices is empty. A guard that cannot fail is not a guard, and SPEC R16 and a `DECISIONS.md` row above both cite it as the thing that keeps the lock out of `submit`. |

## Row opened for V by ARCH(S01) (routed through the orchestrator, never to V directly)

*Written WITHOUT surrounding or nested backticks, per finding N1 of REQ-REV-p1: a nested backtick in
a backtick-wrapped row truncates it when the orchestrator transcribes it into a table cell. Pipes are
avoided for the same reason.*

V-ROW: V-15 · S01 · The sentence above the gauges while Free is chosen · Recommended default: the
mock seat proposes replacement copy and V rules it on the canvas through DONE.md; S01 does not change
the sentence on its own. Evidence: apps/ui/app/new/page.tsx:180-182 renders the fixed line "Choose
your risk tier, composition budget tier, and depth, then click Start." inside .ndCard, directly above
the four gauge rows. Under SPEC R4 and R7 a Free asker can choose none of those three — all three are
disabled and pinned — so the page instructs the reader to do something the page is simultaneously
preventing. That is the honesty law applied to copy rather than to a stored value, and it is the same
shape as row V-14: a true record underneath a sentence that no longer describes it. Against changing
it inside S01 without V: the words on screen are V's through the mock gate, no SPEC requirement names
this sentence, and a seat rewriting product copy on its own initiative is the class of change the
mock gate exists to prevent. It is raised here rather than left silent because acceptance step 4 has V
reading this exact card in both modes, and nothing else in the slice would make anyone look at the
line. Smallest yes/no for V: "Should the intro line above the gauges change while Free is chosen?" ·
VERDICT route it to the mock and DONE.md / CONFIDENCE medium / STRONGEST COUNTER: it is one sentence
and a seat could swap it in a single step, so routing it costs a round trip for a change V would
almost certainly approve — but the sentence is copy, copy is V's on a ui:yes slice, and the cost of
the round trip is one line in DONE.md.

## Correction appended by ARCH(S01) at 22:38 — the row above stands as written, never edited

- **The V-row id `V-15` was taken twice, in parallel.** `ARCH(S02)` wrote `V-ROW: V-15` (SPEC R5's
  "at least two distinct makers" check) and `V-ROW: V-16` in `slices/S02/DECISIONS.md:108, :123`;
  this node wrote `V-ROW: V-15` in this file at `:141`. Both landed in the same orchestrator commit
  `681bc09d`. Neither seat was wrong: the packets, `COMMON.md` and `heartbeat-architecture` all say a
  contested question "goes up as a decision row" and **none of them allocates row ids**, so two
  concurrent architecture seats picked the next free number off the same `V-DECISIONS-PACKET.md`
  (highest `V-14`) within three minutes of each other.
- **Proposed resolution, for the orchestrator, who owns allocation:** S02's two rows are `V-15` and
  `V-16` as written; **this file's row becomes `V-17`** when it is transcribed into
  `V-DECISIONS-PACKET.md`. The row's text, evidence, recommendation and smallest yes/no are unchanged
  — only the id moves. The row above is left exactly as written, per this file's append-only rule.
- **The class, not the instance:** row ids and ADR numbers are both scarce global names handed to
  seats that run concurrently and cannot see each other. `ADR-0023` produced the same shape on the
  same node in the same hour (orchestrator note 22:32; re-measured resolution in
  `ADR-0023-globals-css-append-fence.md`'s numbering row). The remedy is allocation at dispatch — the
  packet names the seat's row ids and ADR number, as this packet already did for the ADR — never
  discovery at write time by a seat reading a file another seat is writing.
- **Orchestrator, 22:38:** the row at `:141` is transcribed as **V-17** in `V-DECISIONS-PACKET.md`, default binding; the class fix is in COMMON §4 (`V-ROW: NEW`, numbered by the orchestrator at transcription).

## Orchestrator folds after ARCH-REV(S01) pass 1 PASS (2026-09-09 23:09) — PLAN.md stands; these lines route the findings

- **N1 → row V-18** (the two gauge hints at `page.tsx:186` / `:197` claim asker provenance under Free); with V-17, drawn at MOCK(S01) and ruled by V through DONE.md. The MOCK packet names both hints and `.ndIntro` on every Free screen row.
- **N6 → the MOCK packet:** screen 3 (Premium chosen, OPTIONS collapsed) is drawn at the R7 values UNLOCKED — Standard / Low / depth 2 / steering empty — because the only reachable route to Premium is from Free (R2+R8), never "at rest" as today's page; screen 6 (no tier chosen, the V-9 alternative reading) is today's initial state — risk tier unselected, depth 1, `planTier` null, nothing disabled (S01-23's contingency, `PLAN.md:381-383`); `.ndIntro`'s sentence appears in screen rows 1, 2 and 5.
- **N9 → the MOCK packet:** `globals.css` styles `:disabled` on 22 lines (`.btn`, `.startBtn`, `.authPrimary`, `.setBtn`, `.libStart`, `.consentBox`, `.policyPrimary`, …), not only `.ndStart` — the house convention is `opacity .45–.55` + `cursor: not-allowed`; the `nd*` vocabulary (`.ndSegItem`, `.ndSlider`, `.ndSteerInput`, `.ndSelect select`) has none. The mock reuses the convention rather than inventing a disabled look; `PLAN.md:476-477` / `:619-620` are read with that correction.
- **N2 → the C4 BUILD packet:** SPEC R17's "no colour literal outside the two token blocks" has NO gate today (`t9-mode-tokens`' only such case is already red at base: 3 hits → 4 leaves the pair unchanged); C4's command gains one scoped assertion in the suite C4 creates. `PLAN.md:813-816` overstates the detection until then.
- **N3 → the C4 BUILD packet:** S01-42 (the locked-control treatment, `PLAN.md:474-478`) gets its done-criterion from DONE.md once V writes it — the BUILD packet quotes it.
- **N4 → the C3 BUILD packet:** S01-24's done-criterion (`PLAN.md:384-386`, `grep -c useEffect … is 1`) is false at base; the BUILD packet carries the corrected criterion measured in the lane.
- **N5 (fold):** `PLAN.md:786` / `:807-808` credit C2 with catching a required `NewDebateAskDefaults` member through `ux01`; `vitest` does not typecheck, so that mutant is caught only by the R21 typecheck delta command (§7), never by C2's suite.
- **N7 (fold):** "Eight are RED at base" (`DECISIONS.md:115`, the handoff) is seven — `BASELINE.md`'s end section carries the seven with their failure names.
- **N8 → whichever BUILD packet owns S01-43:** the R21 delta command writes a shared global path and its base list has no extractor; the packet gives a per-seat output path and the extractor that produces BASELINE.md's pinned-file list.

## Orchestrator folds after MOCK(S01) READY (2026-09-09 23:34) — routed, PLAN.md stands

- **MOCK F1 → the C4 BUILD packet (the locked treatment):** `.ndSelect` draws the visible box while the native `<select>` lies over it at `opacity: 0` (`apps/ui/app/globals.css:6152-6166`); SPEC R4's `disabled` on `#depthMode` / `#scrutinyDepth` lands on the invisible element. The built rule reaches the OUTER box (e.g. `.ndSelect:has(select:disabled)`, or a class the page sets beside `disabled`) so the dim the canvas draws (artboards 9-14) is what renders; the second class member is the code field at `globals.css:6135-6137`. Acceptance step 6 is passed by looking only when the box dims.
- **MOCK F3 (repo, ticketed):** `tests/render/stubs/next-navigation.ts` has no `useRouter`/`useSearchParams` (both called at `page.tsx:65-66`); `renderToStaticMarkup` then returns the EMPTY STRING rather than throwing — the C4 render suite's first assertion is "markup is non-empty".
- The canvas: https://claude.ai/code/artifact/e08c6b3b-60b1-4e8a-9c15-79ca43a16d22 · questions Q1–Q6 in `MOCK.md` (Q1 = V-9, Q2 = V-17/V-18, Q3 the locked treatment, Q4 raw model ids, Q5 the tier names, Q6 the two promises). Nothing on S01 proceeds until V's yes.


## V's ruling at DONE(S01) — 2026-09-10 00:04 EEST (orchestrator transcription; the rows above stand as written)

- V, verbatim, in chat: «well, I love it the way it is. go forward with implementation» — the canvas as `MOCK(S01)` published it (read back 00:06, 0 comments, 0 edits) is the definition of done. `DONE.md` is written from the artboards (`design/S01/`, 15 files, `MANIFEST.tsv`) and carries the fifteen measurements M1–M15.
- The six defaults ratified as drawn: Q1 Free preselected (row V-9 — R2/R18 stand; S01-24's contingency and S01-38's extra `ready` condition are NOT triggered; screen 6 is not a product state) · Q2 the three Free-state lines (rows V-17/V-18 — DONE.md M9) · Q3 dim-only (M8) · Q4 raw ids with dots (M7) · Q5 `Free`/`Premium`, `aria-label="Plan tier"`, no visible label (M1) · Q6 the promises (M6).
- **No SPEC supersession (S01-45).** No measurement contradicts SPEC-v2; the Q2 strings are named by no requirement.
- **No new token (S01-42).** Every hex on the fourteen artboards resolves to a token in `globals.css:5-113` / `:115-178` at `7f89f7b7` (checked 2026-09-10; DONE.md M13). C4's minimum is the selector's rules plus the disabled treatment of `.ndSegItem`, `.ndSlider`, `.ndSteerInput` and the `.ndSelect` OUTER box (MOCK F1).
- Scheduling: BUILD(S01-C1) READY now; C2 after C1; C3 and C4 together after C2 (the plan's designed pair, PLAN.md § "Single-writer"); C5 after C3 ∧ C4. C1 and C2 carry no pixel; C3/C4/C5 read DONE.md.

## Orchestrator folds after BUILD(S01-C1) READY (2026-09-10 01:02) — PLAN.md stands; the record where it is imprecise

- **F1 (BUILD-S01-C1).** `PLAN.md:226-236`: S01-3's done-criterion ("S01-1's assertions pass") cannot hold before S01-4's re-export, and S01-4's "exactly two added lines" gate made the seat put `import { PlanTierSchema } from "./plan-tiers.js"; export * from "./plan-tiers.js";` on ONE line (`index.ts:3`). The shape is right; the gate was a line count. REV(S01) reads the bindings, not the line count.
- **F2 (BUILD-S01-C1).** `PLAN.md:242-251`: the `400` body `{ error: "MALFORMED_REQUEST" }` is CONTAINS (the real body carries a `message`); the case asserts the subset at `tests/unit/api.test.ts:279-286`.
- **F3 (BUILD-S01-C1).** `PLAN.md:255-276`: S01-8's "`grep -rc steering_annotations` unchanged" is false once S01-2/S01-6 add two tierless fixtures (`contract.test.ts:99-120`, `api.test.ts:250-287`); the migration set is the 13 members by line, all migrated; the raw count reads 15 at the commit. S02-M3's post-rebase greps re-measure from the lane, never from this number.
- **F4 (BUILD-S01-C1), repo class, OPEN.** `tests/architecture/s7-authorization-contract.test.ts:180-183` slices `indexOf(A)..indexOf(B)` with no non-empty/order guard (same class as ARCH-S01 F2 at `v2ui-pages.test.ts:83`, repaired by S01-31). S01 pins the contract's marker order at `tier01-roster.test.ts:54-61`; the sweep of the remaining helpers is outside this mission's write surface and is carried in the S01 residue list at TEST(S01).

## Orchestrator folds after BUILD(S01-C2) READY (2026-09-10 01:42) — PLAN.md stands

- **F1 (BUILD-S01-C2).** `PLAN.md:518-527` `run_suites` returns rc 0 after `CLUSTER_GREEN` and after `CLUSTER_RED` (the function's rc is its last `echo`'s) and keeps the raw vitest output in `$o` without emitting it. The runner is a correct gate: its printed marker is the verdict; its rc is not a signal; the raw output is read from the log the `.sh` writes. Every later packet says so.
- **Shared class vocabulary for C3 ∥ C4 (orchestrator ruling, the interface between two concurrent nodes):** the page renders and the stylesheet styles the SAME names — `.ndTier` (the `role="radiogroup"` grid, DONE.md M1) · `.ndTierOption` (each `role="radio"` button; chosen = `[aria-checked="true"]`, M2/M3) · `.ndTierName` (the pill, M4/M5) · `.ndTierPromise` (M6) · `.ndTierModels` (the wrapping row) and `.ndTierModel` (one id, M7) · the existing `.modelDot` for the 7px identity dot (its colour by the id's family through `modelKey`, `apps/ui/lib/models.ts`). The locks: `.ndSegItem:disabled`, `.ndSlider:disabled`, `.ndSteerInput:disabled`, `.ndSelect:has(select:disabled)` (MOCK F1 — no page-side hook needed). Cost if wrong: one rename in one file at REV(S01).

## Orchestrator folds after BUILD(S01-C4) READY (2026-09-10 02:28) — PLAN.md stands

- **F1 (BUILD-S01-C4).** `PLAN.md` §7's R21 extractor (`sed -n 's/^\([^(]*\)(.*/\1/p'`) admits a tsc CONTINUATION line (indented prose containing `(`) as a path; the anchored form — a line starting with a non-space path followed by `(line,col)` — is what the C5 and REV(S01) packets publish, proved on a continuation line first. The base list for the delta is `sed -n '11,32p' BASELINE.md | awk '{print $3}'` (22 files); the added-PATH set at `5e3e4bcf` is empty.
- **The S01 stylesheet block** lives at `globals.css:6208-6270` between `/* === debate-tiers S01 === */` and `/* === end debate-tiers S01 === */` — the file's slice-block convention (ADR-0023); C5's stylesheet assertions scan that block.

## Orchestrator folds after BUILD(S01-C3) READY (2026-09-10 02:48) — PLAN.md stands

- **F2 (BUILD-S01-C3).** `modelColor(identity)` (`apps/ui/components/ModelPresentation.tsx:5-18`) switches on a MAKER identity (`anthropic`, `openai`, `xai`, …), not on a model id; my class-vocabulary ruling said `modelColor(id)`. The built page maps id → maker locally (`page.tsx:65-70`, `modelIdentity`) and pins each `--dot` in the render suite. `apps/ui/lib/models.ts` already carries id → family (`modelKey`) and the dot colour (`modelMeta(modelId).dot`, what `ModelMetaLine` uses). **REV(S01) probe (correctness lens):** whether the local adapter duplicates `modelMeta` and should read `modelMeta(modelId).dot` instead — a finding for the review, not a change here.
- **F3 (BUILD-S01-C3).** `PLAN.md:518-527` `run_suites` captures each suite's output in `$o` and never emits it; every packet that names the runner ships the variant with `printf '%s\n' "$o" >> "$LOG"` after the capture, so the run's log holds the raw frames the summary lines are cut from.


## GATE(S01) folds — 2026-09-10 03:40 EEST (orchestrator)

- **Lenses for REV(S01) pass 1 (ruling):** `risk_tier` S01 = medium (`00-intake.md:19`) and `ui: yes` → three blind lenses in parallel, each in its own detached worktree at `f6c147cc` (`.worktrees/rev-s01-p1-{correctness,security,product}`; 31 node_modules trees cloned by APFS clonefile, contracts generated, 0 dirty): correctness/tests · security/data-safety · product-truth. Cost if wrong: one lens too many (≈300k tokens).
- **Product-truth transport (ruling):** the harness's in-app Browser pane (`mcp__Claude_Browser__*`) — a background subagent can drive it (probed 03:27, a haiku seat's `tabs_context` answered) — against a UI dev server the lens starts from ITS worktree on a free port and a lens-owned stub API answering `GET /v1/session` / `POST /v1/asks`; never V's `:3000` stack, `:8790`, the live database, nor the playwright plugin (a headed Chromium window is V's desktop). Cost if wrong: the lens answers UNVERIFIED on the browser steps and V's TEST(S01) carries them alone.
- **Heavy semaphore (ruling):** the intake declared no `max_concurrent_heavy`; the spine's laptop default is 1; the orchestrator contract §6 says the lenses run in parallel — three vitest-running lenses at once. Cost if wrong: slower runs and timing flakes, absorbed by the three-run law and re-runnable by me.

## REV(S01) pass 1 folds — 2026-09-10 04:16 EEST (orchestrator; two of three lenses consumed)

- **Rows V-20 · V-21 · V-22** (security lens N1–N3; full `V-ROW: NEW` text in `reviews/REV-S01-p1-security-data-safety.md` §6): server-side Free enforcement (S02's, by a SPEC-v3 amendment before S02-C2) · the Premium `tier_provenance_ref` (a FIX(S01) after V's ruling at TEST(S01), before MERGE) · merge order (no push of S01 before S02 lands). Recommended defaults bind until V rules; V sees them at TEST(S01).
- **Residue candidates for TEST(S01)** (correctness lens N1–N4, all non-blocking): the style contract pins token names, not values (`t_6365fd82`) · `#maxTokens` 800 vs the DOM's 768 under step 128 (`t_318c1522` — DONE.md M10 says 800; the product-truth lens measures it) · the `modelIdentity` adapter vs `modelMeta` (`t_1c27e245`) · two more unguarded region readers (`t_3c762b9f`, the `t_1e4fccc1` class). Their WHEN is a FIX(S01) N-sweep after V's ruling at TEST(S01), unless the union says REWORK.


## REV(S01) pass 1 union folds — 2026-09-10 04:24 EEST (orchestrator)

- **Union = REWORK** (`reviews/REV-S01-p1-UNION.md`): PASS + PASS + REWORK on product-truth B1. Every finding is assigned: FIX(S01) F1 (page surface) ∥ F2 (stylesheet surface) on Codex Sol in the S01 lane at `f6c147cc`; REV(S01) pass 2 = two scoped lenses (correctness/tests carrying the security probes; product-truth).
- **B1's value (ruling):** DONE.md M10's `800` is V's oracle and stands as drawn; the `#maxTokens` control must HOLD what the page prints and its assertion must bite outside jsdom — the mechanism (the step grid, the readout) is the FIX seat's. The control's `min/max/step` and the `800` state predate S01; S01's oracle and test surfaced the defect, and S01 owns the surface. Cost if wrong: a one-line step change.
- **Security N2 vs product-truth (ruling):** the two lenses disagree on ONE finding (a Premium ask's `tier_provenance_ref: machine:plan-tier-free` — deliberate under frozen R7, or a durable falsehood); the disagreement is exactly row V-21's question, so no re-check node: V rules at TEST(S01); a SPEC-v3 + FIX follow a yes.
- **Row V-23** (product N2): default = nothing changes; the honesty notice keeps the promise true enough until the V3 contract carries the five knobs.
