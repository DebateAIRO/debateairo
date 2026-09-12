# REQ-REV — pass 1 of 3 · blind review of the REQ packet, the compass and both SPECs · mission `debate-tiers`

- **Verdict: REWORK** (pass 1). Blocking: **B1 B2 B3 B4**. Non-blocking: **N1…N8**.
- Seat REQ-REV · node REQ-REV pass 1 · ticket `t_e95f08a5` · session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`
- Stood in the MAIN tree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, branch `dev`.
  HEAD `1dfb7f03` at CLAIM, `d38cab86` at verdict (the orchestrator committed four `fix(protocol)`
  commits under me; none touches a product file this review reads — `git log --oneline 7f89f7b7..HEAD`).
  100 dirty entries, other missions', never touched. Read-only everywhere but this file and my self-report.
- Blind: no contact with the REQ seat, no other reviewer's output read.

## 0. What I did, and what that buys

I reviewed the REQ packet first (charge 1), then read both SPECs and re-derived **every `path:line`
they cite against the file at that line** — 42 distinct citations (`grep -ohE '…\.(ts|tsx|css|md|html|sql)`?:[0-9]+(-[0-9]+)?' … | sort -u | wc -l`)
across `apps/ui`, `apps/api`, `packages/contract`, `packages/db`, `packages/critique`,
`packages/register` and `tests/`. Then I probed for the three things my packet asks for: a
requirement two seats would build differently (B1, B3), an acceptance step nobody can run (B4, and
the auth wall in §5), a cost census that misses a member of its own class (B2).

**The citation discipline in these SPECs is the best I have measured in this fleet.** I checked all
42 `path:line` references and found **zero** that pointed at the wrong line — and, because the main
tree carries 100 dirty entries, I then diffed all 18 cited files against the lanes' base: every one
is byte-identical to `7f89f7b7`, so the citations hold in the lanes too. `AskRequestSchema` at
`packages/contract/src/index.ts:107-118`, `parseRequest` at `apps/api/src/index.ts:288-297`,
`markAskRefusal` at `:299-302`, the status/code map at `:512-520`, the reply at `:530-533`,
`evaluateAskAdmission` at `:1195-1231` with `resolveDiscoveredPanel` `:1205`, `makers` `:1206`,
`makerAvailability` `:1207-1214`, `assertMakerAdmission` `:1216`, `panelSize` `:1225`, the return
`:1230`; `startRun` `:1293` after admission `:1284`; `DiscoveredPanelMember` at
`packages/db/src/index.ts:973-979`; the sentinel/encrypt block `:1156-1170` and `askContract:
storedAskContract` at `:1201`; `core.create_encrypted_run` at `:1182`; `composition_budget_tier` at
`packages/db/src/schema.ts:120` and `discovered_panel` at `:123`; the composition math at
`packages/register/src/index.ts:185-199`; `assertMakerAdmission` at
`packages/critique/src/index.ts:328`; `ContractHttpError`'s message at
`packages/contract/src/client.ts:82-83`; the question textarea at `apps/ui/app/new/page.tsx:160-177`,
the knob defaults at `:69-74`, `ready` at `:104-111`, `SegmentedRow` at `:362-385`, the error render
at `:134-135, 155`; `buildNewDebateAskConfig` at `apps/ui/app/new/defaults.tsx:64-80`,
`deriveRiskTierDefault` at `:26`; `createDebate` at `apps/ui/lib/api.ts:365-397` with the
`RISK_TIERS`/`BUDGET_TIERS` guards at `:357-358` and the guard block at `:371-379`; `ModeToggle.tsx:32-43`;
`generate.ts:7-19`; `.gitignore:7`; and every cited `tests/unit/v2ui-pages.test.ts` line (`42-44`,
`53-61`, `63-70`, `79-87`, `90`, `93-95`) and `tests/render/ux01-new-debate-form.test.tsx:168`.

That accuracy is why the four blocking findings below are worth a pass: they are not sloppiness,
they are four places where the SPEC stops one sentence short of the code it constrains, and each of
those sentences decides which of two builds a stranger writes.

---

## 1. BLOCKING findings

### B1 — S02's refusal has no ordering constraint, and the only acceptance path runnable today returns the wrong error code

**Where:** `docs/missions/debate-tiers/slices/S02/SPEC.md:36-41` (R3), `:55-58` (R6), `:129-130`
(acceptance step 7), `:109-112` (Precondition A).

**The failure, as inputs → outcome.** R3 puts the roster filter straight after
`resolveDiscoveredPanel` (`apps/api/src/index.ts:1205`) and requires everything downstream to be
computed from the FILTERED panel. R6 says a missing roster member raises
`ASK_PLAN_TIER_MODEL_UNAVAILABLE` "inside `evaluateAskAdmission`" — and never says WHERE inside.

Today neither `gpt-5.6-luna` nor `claude-sonnet-5` is a configured discovery target
(`00-intake.md:52`). So for `POST /v1/asks` with `plan_tier:"free"`:

1. `discoveredPanel` = the three healthy dev targets (`:1205`).
2. The R3 filter keeps only roster members → **the filtered panel is empty**.
3. `makers` = `[]` (`:1206`), `configuredMakers` = `[]` (`:1211`).
4. `assertMakerAdmission` (`:1216`) throws — I read its body:
   `packages/critique/src/index.ts:334-339` throws `MAKER_INVENTORY_UNSATISFIED` iff
   `new Set(availability.configuredMakers).size < 1`.
5. `markAskRefusal` (`:1218` → `:299-302`) wraps it as an `AskRefusal` → the boundary maps it to
   `422` with `error: knownError.code` (`:515`, `:520`, `:530-533`).

Result: `{ "error": "MAKER_INVENTORY_UNSATISFIED", "message": "No healthy maker was discovered for
standard (provider_probe:…)" }`. **Acceptance step 7 demands `ASK_PLAN_TIER_MODEL_UNAVAILABLE`**, and
step 6 demands the message name the missing model — this message names none.

A build that obeys R3 to the letter (filter before `:1206`) and places R6's check anywhere after
`:1216` produces exactly this. A build that places it immediately after the filter passes. The SPEC
does not choose, and **Precondition A designates steps 5–7 "the whole acceptance" until V adds the
three targets** — so the coin lands on the one path V can run this week.

**Also unpinned by the same gap:** with `premium` and only `grok-4.6` missing, the filtered panel has
2 members from 2 makers, `assertMakerAdmission` does NOT throw, and the run proceeds with 2 of 3 —
violating R9 ("no shrinking") unless R6's check fires first. So the ordering is load-bearing in both
directions.

**Fix (one sentence):** R6 gains — *the roster check runs immediately after the R3 filter and before
`assertMakerAdmission` (`apps/api/src/index.ts:1216`), so an empty or short filtered panel is refused
as `ASK_PLAN_TIER_MODEL_UNAVAILABLE` and never as `MAKER_INVENTORY_UNSATISFIED`.* Add a RED test to
R15 for the all-members-missing case, which today is the Free tier.

VERDICT blocking / CONFIDENCE high / STRONGEST COUNTER: a careful ARCH(S02) seat would infer the
order from R3's "everything downstream is computed from the filtered panel". It would — but R3's list
of downstream values ends at `:1230` and includes `assertMakerAdmission` as a CONSUMER of the filtered
panel, which is precisely the reading that puts the throw at `:1216` before any roster check.

---

### B2 — R13's `createDebate` guard turns two unnamed suites RED, and makes R21 unsatisfiable as written

**Where:** `docs/missions/debate-tiers/slices/S01/SPEC.md:89-93` (R13), `:130-137` (R19),
`:138-144` (R20), `:145-146` (R21).

R20 measures the blast radius of making `plan_tier` required as **13 ask literals in 5 files**. I
reproduced that count with R20's own method (`grep -c steering_annotations`: api 7, contract 3,
load01-live-proof 1, s7-authorization 1, evaluator-database 1 = 13) — the census is correct **for the
class it swept**, which is *literals parsed by `AskRequestSchema`*. R13 creates a second class R20
never sweeps: *`createDebate` config literals*, because R13 adds a required-field guard in
`apps/ui/lib/api.ts` that every existing caller must now satisfy. R20 itself says a missed literal is
a finding on this requirement, so here is the sweep, member by member:

Line numbers below are **at the lanes' base `7f89f7b7`**, not the dirty main tree — see the note
under the table.

| Site | Effect of R13 | Named in R19/R20/BASELINE? |
|---|---|---|
| `tests/unit/v2ui-data-layer.test.ts:753-767` | positive create, config has no tier → guard throws → `expect(created.id).toBe("run:new")` (`:767`) FAILS | **no** |
| `tests/unit/pol01-policy.test.ts:49-58` | asserts the exact rejection text `"RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM: No healthy provider remained at claim"` (`:58`); the guard rejects earlier with `ASK_FIELD_REQUIRED: plan_tier…` → FAILS (it still *rejects*, so a careless run reads as "still red-ish") | **no** |
| `tests/unit/v2ui-data-layer.test.ts:749` | negative, asserts `/ASK_FIELD_REQUIRED/` (regex) → safe | no |
| `tests/render/ux01-new-debate-form.test.tsx:15, 72` | `createDebate` is `vi.fn()`; assertions at `:182`, `:264` are `toMatchObject` → safe | yes (R19) |
| `apps/ui/components/LibraryComposer.tsx:29-31` | production; already throws `ASK_FIELD_REQUIRED: risk_tier` today and is swallowed by the bare `catch {}` at `:34` → behaviour unchanged, only the message changes | **no** (see N7) |
| `apps/ui/app/new/page.tsx:132` | the S01 path itself | yes |

**A line-number hazard I nearly published, and the sweep that caught it.** I first read
`v2ui-data-layer.test.ts` in the MAIN tree, where the block sits at `:794-806` — the file is one of
the 100 dirty entries and carries **+41 lines** of another mission's work
(`git diff --numstat 7f89f7b7 -- tests/unit/v2ui-data-layer.test.ts` → `41 0`). The lanes are at
`7f89f7b7`, so a lane seat handed `:794` finds nothing. I then diffed **every file the two SPECs
cite** against `7f89f7b7`: all 18 are byte-identical, so **all 42 SPEC citations are valid in the
lanes as well as the main tree**. The only divergent file is the one the SPECs do not cite and this
finding does. Verified block-for-block: the base text at `:742-766` is identical to the main tree's
at `:783-807`.

Third class, unswept and worse: **`buildNewDebateAskConfig` inputs.** R13 says it "puts the chosen
tier in the config it returns", which adds a member to `NewDebateAskDefaults`
(`apps/ui/app/new/defaults.tsx:45-55`). `tests/render/ux01-new-debate-form.test.tsx:217` and `:219`
call it with a spread `defaults` object that has no tier. If the member is required, those two calls
become **new TypeScript diagnostics in a file that is NOT pinned in `BASELINE.md:10-32`** — which is
exactly what **R21** forbids. So R13 and R21 cannot both hold unless the SPEC names the typing choice
(optional member + runtime guard, or required member + those two call sites updated), and it names
neither.

**Consequences.** `tests/unit/v2ui-data-layer.test.ts` and `tests/unit/pol01-policy.test.ts` appear in
none of: R19's suite list, R20's five files, the intake's six `/new` tests (`00-intake.md:54`), or
`BASELINE.md`. So no baseline exists for them, R19's rule "no suite ends with fewer passing cases than
its baseline" cannot be applied to them, and a `REV(S01)` measuring only the named suites would PASS a
slice that broke two.

**Fix:** name the class in R20 as *every site that constructs an ask which must now carry a tier* with
the three sub-classes above; add `tests/unit/v2ui-data-layer.test.ts` and
`tests/unit/pol01-policy.test.ts` to R19 with baselines measured in the lane at `7f89f7b7`; and pin
the `NewDebateAskDefaults` typing decision in R13 so R21 stays satisfiable.

VERDICT blocking / CONFIDENCE high / STRONGEST COUNTER: a BUILD seat would hit both failures the
moment it runs the full suite. It would — but the full suite is RED at base for other missions, R19
lists exactly which suites to run, and R19's own floor rule is stated per-suite against a baseline
these two do not have. This is the failure mode where "all named suites green" is true and the slice
is broken.

---

### B3 — The Free lock writes a provenance the mission's own honesty law forbids, and the SPEC pins the value but not the provenance

**Where:** `docs/missions/debate-tiers/slices/S01/SPEC.md:51-63` (R7), `:64-66` (R8), `:86-93`
(R12/R13). Code: `apps/ui/app/new/defaults.tsx:70-72`, `apps/ui/app/new/page.tsx:75-76, 107, 121-131`.

R7 pins the Free risk-tier VALUE to `standard` and derives it carefully (V-10). It says nothing about
the two fields that travel beside it:

```
tier_source:        defaults.riskTierWasEdited ? "ASKER" : "MACHINE_DEFAULT"
tier_provenance_ref: defaults.riskTierWasEdited ? "asker:ui-selection" : "machine:deployment-floor"
```
(`apps/ui/app/new/defaults.tsx:71-72`, quoted verbatim)

`riskTier` starts `""` (`page.tsx:75`) and `riskTierWasEdited` is set true **only** by the segmented
control's `onChange` (`page.tsx:189-192`). `ready` requires `riskTier.length > 0` (`page.tsx:107`).
So the state pair *(risk tier set, `riskTierWasEdited` false)* is **unreachable today** — S01's Free
lock creates it for the first time, and nothing in the repo constrains what it should send.

Three builds, all defensible from the SPEC as frozen:

- **(a)** leave the flag false → every Free run persists `tier_provenance_ref:
  "machine:deployment-floor"`, naming a source R7 and row V-10 establish is *never read* from this
  page (`tests/unit/v2ui-pages.test.ts:90` and `tests/render/ux01-new-debate-form.test.tsx:168`
  forbid the read; `deriveRiskTierDefault` at `apps/ui/app/new/defaults.tsx:26` has no caller). The
  run record asserts a provenance that did not happen.
- **(b)** set the flag true when Free pins → persists `tier_source: "ASKER"` for a value the asker
  never chose.
- **(c)** invent a third provenance → `tier_source` is `z.enum(["ASKER","MACHINE_DEFAULT"])`
  (`packages/contract/src/index.ts:6`) and is re-guarded at `apps/ui/lib/api.ts:373-376`; a third
  value is a schema change **R12 forbids** ("No other field is added, removed or loosened").

The chosen string is persisted plaintext on `core.run` (`packages/db/src/schema.ts:118-119`), survives
encryption, and is the field billing/audit would read. No existing test constrains this path, so the
wrong choice is invisible until someone audits Free runs.

**Fix:** R7 gains one sentence naming the pair Free sends. The honest option inside R12's constraint is
**(a)** with `tier_provenance_ref` changed to a string that names the real source — e.g.
`"machine:plan-tier-free"` — since `tier_provenance_ref` is `z.string().trim().min(1)`
(`packages/contract/src/index.ts:111`) and takes any non-empty string without a schema change. Whatever
V or ARCH picks, the SPEC must say it, because all three builds compile and only one is true.

VERDICT blocking / CONFIDENCE high / STRONGEST COUNTER: this is provenance metadata, not the feature —
it breaks no acceptance step and V will not see it in a browser. Correct, and that is the argument for
fixing it in this pass rather than after S01 merges and the dev database is full of Free runs that
claim a deployment floor nobody read. `INSTRUCTIONS.md:49-50` makes the honesty law this mission's
"sharpest edge"; this is that edge, one field over.

---

### B4 — S02 R12 and R13 order a non-orchestrator seat to write `PROGRESS.md`, and acceptance step 9 depends on that write

**Where:** `docs/missions/debate-tiers/slices/S02/SPEC.md:89-91` (R12), `:95-101` (R13), `:133-134`
(acceptance step 9).

R12: *"that command is written into `PROGRESS.md` by the seat that implements R11"*.
R13: the enumerated suites are *"listed in `PROGRESS.md`"*.
Acceptance step 9: *"run the command `PROGRESS.md` records for R12"*.

But `docs/missions/debate-tiers/slices/S02/PROGRESS.md:1` — written by REQ itself — reads
"**orchestrator is the sole writer**", and both role contracts agree:
`.claude/skills/heartbeat-requirements/SKILL.md:42` ("PROGRESS.md — empty. The orchestrator is its
only writer") and `.claude/skills/heartbeat-orchestrator/SKILL.md:78` ("update the slice's
`PROGRESS.md` — you are its only writer").

So the BUILD seat either crosses its file contract (a `heartbeat-protocol` §6 NEVER) or leaves the
command unrecorded, and **acceptance step 9 is then an instruction to run a command that no file
records** — an acceptance step nobody can run, which is the thing this node exists to catch.

**Fix:** R12/R13 name an artifact the implementing seat owns — its handoff and the review package —
and the orchestrator relays the command into `PROGRESS.md`; step 9 then cites where V reads it.

VERDICT blocking / CONFIDENCE high / STRONGEST COUNTER: the orchestrator could simply copy the command
across, making this bookkeeping. It could — but step 9 is the ONLY verification of R11/V-11, the row
that decides whether a database migration happens, and a step whose input has no owner is the step
that silently goes unrun.

---

## 2. Non-blocking findings (each needs a ticket; WHEN, never WHETHER)

**N1 — `V-DECISIONS-PACKET.md` rows V-11 and V-12 are truncated, and V-12 has no default at all.**
`docs/missions/debate-tiers/V-DECISIONS-PACKET.md:17` ends at "Recommended default: a plaintext" —
cut where the nested backtick in the source `V-ROW:` line opened. `:18` (V-12) reads "How the S02 lane
gets" with an **empty** Default cell. `COMMON.md:4` and this file's own header make each row's default
binding; a row with no default binds nothing, and `INSTRUCTIONS.md:33` sends seats to this file.
Full text survives at `slices/S02/DECISIONS.md:32-50`. Orchestrator's file, orchestrator's fix — the
two rows must be transcribed with their pipes and backticks escaped, as V-8 already does (`\|`).

**N2 — `INSTRUCTIONS.md:65-66` names one of the three suites that are RED at base.**
`BASELINE.md:33-35, 66-68` records three: `ux01-new-debate-form` 1/8, `v2ui-pages` 36/41,
`s14-contract` 2/5. The compass names only `s14-contract`. A seat reading the compass would take the
`/new` render suite — 7 of 8 cases already failing, on the very page S01 rewrites — for green and
blame its own diff. The SPEC gets this right (R19 carries all three baselines); the compass does not.

**N3 — three suites in R19 have no recorded baseline anywhere.**
`SPEC.md:130-137` requires every listed suite reported "against `docs/missions/debate-tiers/BASELINE.md`"
and forbids ending below baseline. `tests/render/sup-04-widget.test.tsx`,
`tests/architecture/sup-04-mounts.test.ts` and `tests/unit/evaluator-dev-menu-ui.test.ts` are listed but
measured in neither lane section of `BASELINE.md`. (All four files exist — I stat'd them.) Either
BASELINE.md gains them or R19 says "baseline measured in the lane at `7f89f7b7` before the first RED
test". Shared REQ/orchestrator finding.

**N4 — S02 R5 misstates the code it cites.** `SPEC.md:47-51` says the filtered panel "satisfies
`runMakerReachability` … and `assertMakerAdmission` … classifies `CAPABLE`". `assertMakerAdmission`
(`packages/critique/src/index.ts:328-341`) classifies nothing and never reads `runMakerReachability`
or `classification`; it throws iff `configuredMakers` is empty — its own comment says "every nonempty
discovered panel serves". The two-maker threshold has a real consequence, but it is elsewhere:
`applyCriticUnavailableCap` (`packages/critique/src/index.ts:342-357`) marks a one-maker panel
`SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE` and sets `confidenceBandCapRequired` — it still serves.
R5's conclusion (both rosters span ≥ 2 makers) holds; its stated mechanism does not, and it is the
mechanism a BUILD seat would write a test against.

**N5 — packet defect (orchestrator): the REQ packet's read contract contradicts its own charge 4.**
`packets/REQ.md:10` says "inputs (read these and nothing else)" and lists the intake, the design
extract and `docs/architecture/`; `:16` puts "every product file" under forbidden. Charge 4 (`:26`)
then requires REQ to name "the contract/API lines they touch" and to place ownership of
`packages/contract/src/index.ts`. REQ discharged it from `COMMON.md §6`'s measured extracts and got
every line right — but the packet as written told a seat to cite a file it was forbidden to open.
(`packets/REQ-REV.md:10` fixed this for me explicitly: "plus the product files the SPECs cite … a
requirement is checkable only against the code it constrains". Same fix belongs upstream.)

**N6 — packet defect (orchestrator): `COMMON.md:41` lists five tests touching `/new`; `00-intake.md:54`
lists six.** The intake's sixth is `tests/unit/evaluator-dev-menu-ui.test.ts`. REQ used the intake's
six (R19), so nothing broke — but the two binding documents disagree on a measured fact, and the one
every seat reads first is the short one.

**N7 — the `/` composer is described as a route; it is a route *fallback* from a failing direct call.**
`00-intake.md:49`, `SPEC.md:29-30` and `slices/S01/DECISIONS.md:26` all describe
`apps/ui/components/LibraryComposer.tsx:37` as "routes to `/new?topic=…`". The composer first calls
`createDebate(topic, { max_depth: 3, branching: 2, max_tokens: 800 }, COOKIE_SESSION_MARKER)` at
`:29-31` — a config with no `risk_tier`, so it throws `ASK_FIELD_REQUIRED` and the bare `catch {}` at
`:34` falls through to `:37`. Nothing breaks under S01 (the new guard is swallowed by the same catch),
so this is not B2. It matters because the day someone "fixes" that direct path, it creates asks with
no tier, and no S01 requirement covers it. One line in S01 §3 Out of scope, or a ticket.

**N8 — `S01/PLAN.md:31` miscounts R4's controls: "the thirteen controls" — R4 names fourteen.**
Counted from `SPEC.md:41-46`: 6 segment buttons + `#treeDepth` + 2 textareas + 5 `⚙ OPTIONS` knobs.
A cluster written against "all thirteen" leaves one control unlocked and the assertion still green.

---

## 3. Charges — answered one by one

**1. Packet review first.** Done, and it is the first thing I read. `packets/REQ.md` constants: base
`7f89f7b7` ✓ (`git merge-base --is-ancestor` YES); ticket ids `t_cb9482de` / `t_11abead2` /
`t_e4b4ab3a` ✓ against the board; the design extract `design-document-rendered.html:967-1101` ✓ named
consistently in COMMON, intake and INSTRUCTIONS. `allowed` (`:15`) vs what REQ wrote: INSTRUCTIONS.md
✓, `slices/**` ✓ (10 files), `agent-reports/REQ.md` ✓ — REQ wrote **nothing** outside its contract
(`git status --short docs/missions/debate-tiers` shows only those paths). Packet path resolves from
the stated cwd ✓. Defects: **N5**, and **N6** against COMMON. REQ's `SKILLS LOADED` line I cannot
check — the REQ ticket carries no READY comment I am permitted to read as a blind reviewer, and my
packet does not put the REQ ticket in my inputs; **UNVERIFIED**, flagged for the orchestrator.

**2. Intake C1–C9 and rows V-1…V-9 vs the SPEC lines.** Every SPEC line I traced sits on a default or
cites its row: C3/V-2 → R1; C8/V-9 → R2 (with the supersession path named); C4/V-3 → R4, R5, R6;
C5/V-4 → R7 (the `else standard` branch, opened as V-10 rather than taken silently — correct
procedure); C6/V-5 → R9; C9/V-8 → R12; C2/V-6 → §3 Out of scope in both SPECs; C7 → S02 R4; C1/V-7 →
S02 R6/R7 and Precondition A. **No SPEC line contradicts a binding default without a `V-ROW:`.** The
two contested choices REQ took beyond the rows (Free risk-tier value; `plan_tier` required) are both
written as `V-ROW:` lines with evidence and a smallest yes/no (`S01/DECISIONS.md:36-50`) — this is the
procedure working. Defect found here is **N1**, in the orchestrator's transcription, not REQ's.

**3. Both SPECs mechanically checkable; acceptance runnable in both modes.** Every requirement is
numbered and lands on a named artefact (an id, a line, a status code, a suite). Acceptance: S01
steps 1–12 run twice via `ModeToggle` (`:32-43` verified, `aria-label` and `☾`/`☀` glyphs exact);
S02 steps 1–9 likewise, with the mode explicitly declared a no-op to be proven. Both modes ✓.
**Stranger run — see §5 for what I could and could not execute.**

**4. Free locks per control, rosters as configuration, refusal names the model, contract ownership.**
Per control ✓ — R4 names 14 ids and I verified all 14 exist as rendered: `SegmentedRow` builds
`id={`${field}-${option.value}`}` (`page.tsx:347-385`) over `RISK_TIER_OPTIONS`
(`casual|standard|high-stakes`, `page.tsx:28-32`) and `BUDGET_TIER_OPTIONS` (`low|medium|high`,
`:34-38`), giving the six segment ids exactly as R4 writes them; `SliderRow`/`SelectRow` take an
explicit `id` and the remaining eight match at `page.tsx:203` (`treeDepth`), `:216`
(`steeringPresets`), `:232` (`steeringAnnotations`), `:276` (`depthMode`), `:284` (`scrutinyDepth`),
`:292` (`branchingWidth`), `:301` (`concurrency`), `:310` (`maxTokens`). Nothing else on the form is
a gauge — `decisionScope` and `asOf` are never rendered as controls (`:246-248` says so in copy). Rosters as configuration ✓ (R11 + S02
R2). Refusal names the missing model ✓ (S02 R7, every missing member). `plan_tier` ownership stated ✓
(`INSTRUCTIONS.md:17`, `S01/DECISIONS.md:10`, `S02/DECISIONS.md:15` — three files, one answer).
Count defect: **N8**.

**5. `ui:` flags.** S01 `SPEC.md:3` = `ui: yes` ✓ — it adds a visible control to `/new`. S02
`SPEC.md:3` = `ui: no` ✓ — it adds no surface; the refusal reuses the existing error block
(`page.tsx:155`) and its acceptance is a browser run only because that is where a debate starts,
which `SPEC.md:16-17` states. `DONE.md` is a **placeholder** ✓: header declaring V writes it, eight
implied screen states for the mock to draw, four open questions, and `## V's definition of done` left
`_(empty — V writes here)_` (`S01/DONE.md:35-37`). REQ did not define done.

**6. Every test the intake lists named with its expected delta.** All six of `00-intake.md:54` are in
R19, plus `t9-mode-tokens`. Deltas present for `ux01` (1/8), `v2ui-pages` (36/41), `s14-contract`
(2/5) and match `BASELINE.md:33-35` exactly. Missing for three → **N3**. Missed suites → **B2**.
Three suites are RED at base and the compass names one → **N2**.

**7. Banned words and cross-SPEC contradictions.** Banned words in a criterion: **zero**. The only
hits in the mission tree are the ban list quoted in `S01/PLAN.md:9,12` and `S02/PLAN.md:11`, and
`S01/PLAN.md:13-14` pre-empts the false positive by name. (`00-intake.md:68` uses "handles" in a
disposition cell — the orchestrator's file, not a criterion. REQ rewrote the same sentence as
"computes" in S02 R4, which is the discipline working.) Shared interface sentences: the rosters are
byte-identical in `S01:80-82` and `S02:27-28`, and identical to V's verbatim goal; the `grep -rn`
sentence differs only by S02's "still … after S02", which is intended. **No contradiction between
the two SPECs.**

---

## 4. What I verified, and how

| Probe | Command / method | Result |
|---|---|---|
| 42 `path:line` citations | `sed -n` on each cited range in the MAIN tree at `d38cab86` | 42/42 correct |
| …and valid in the LANES too | `git diff --numstat 7f89f7b7 -- <each of the 18 cited files>` | all 18 byte-identical to base; the only divergent test file (`v2ui-data-layer`, +41 lines) is cited by no SPEC |
| R20's census | `grep -rc steering_annotations` over the 5 named files, then over all of `tests/` | 13 in 5 files reproduced; 3 further hits in 2 files, both correctly excluded (source-text assertion at `s14-contract:64`; `toMatchObject` partials at `ux01:266,272`) |
| The class R20 missed | `grep -rn 'createDebate\|buildNewDebateAskConfig\|AskRequestSchema\|submitAsk\|/v1/asks' tests apps packages` | 2 suites break (B2), 1 production caller unaffected (N7) |
| `assertMakerAdmission`'s real rule | read `packages/critique/src/index.ts:328-357` | throws at `< 1` maker, not `< 2` (N4); drives B1 |
| R4's 14 ids | derived from `SegmentedRow`/`SelectRow`/`SliderRow` + the two option arrays | all 14 exist; PLAN says 13 (N8) |
| `ui:` flags, DONE placeholder, INSTRUCTIONS ≤ 100 lines | `sed -n 3p`, `wc -l` | `yes`/`no` ✓; placeholder ✓; 68 lines ✓ |
| Banned words | `grep -rniE '\b(improve[ds]?\|improvement\|better\|robust\|handles?\|handling\|handled\|appropriate(ly)?)\b'` over the mission tree | zero in any criterion |
| globals.css token premise (R17) | `grep -n '^:root {\|^html\[data-mode="chamber"\] {'` | exactly one of each (`:5`, `:115`) ✓ |
| Base ancestry | `git merge-base --is-ancestor 7f89f7b7 HEAD` | YES; 4 `fix(protocol)` commits between, no product file |
| The live stack | `lsof -nP -iTCP:3000 -sTCP:LISTEN`; `curl -sk -L https://localhost:3000/new` | pid 74445 listening; 200 |

## 5. UNVERIFIED — and the stranger run

- **S01 acceptance steps 1–12: UNVERIFIED, all twelve.** I opened `https://localhost:3000/new` in the
  harness browser pane (`heartbeat-protocol` §3.9 permits it). Signed out, `/new` renders the
  **sign-in page** ("WELCOME BACK", email + password, "No account yet? Create one") at
  `https://localhost:3000`. My packet forbids signing in or creating an account, so no step that
  needs the form was executable. **This is not a SPEC defect** — `SPEC.md:150` states the
  precondition "V is signed in" — it is the honest boundary of this pass. Every DOM-level premise
  those steps rest on (the 14 control ids, the option labels `Casual`/`Standard`/`High stakes` and
  `Low`/`Medium`/`High`, the `⚙ OPTIONS` toggle's independence from the knobs, the mode toggle's
  labels, `Start run`'s `disabled={!ready || submitting}`) I verified in source instead, and all hold.
- One environment note, not a finding: a first-visit consent banner ("YOUR DATA, ON THE RECORD" /
  Essential only · Choose what to store · Accept all) overlays the app. It is in the lanes' base, so
  both lanes have it; I did not dismiss it (accepting a consent banner is not mine to do). If V tests
  in a fresh profile, step 1 begins by answering it.
- **S02 acceptance steps 1–4 and 8–9: UNVERIFIED** by construction — row V-7, V's own operation, and
  `.local/**` is this mission's no-touch surface. Steps 5–7 I could not run either (auth).
- **REQ's `SKILLS LOADED` line: UNVERIFIED** — see charge 1.
- I ran **no suite**. The blocking findings above are derived from source and from the schema/guard
  semantics, not from a lane run; the fastest confirmation of B2 is
  `pnpm exec vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/pol01-policy.test.ts` in a lane
  before and after R13's guard, and I recommend the FIX pass do exactly that rather than take my word.

## 6. Predictions (falsifiable — evidence that blindness held)

There is no parallel lens on this node; my predictions are about the seats downstream. I predict
**ARCH(S02) will place the roster filter correctly at `:1205` and still leave the refusal after
`assertMakerAdmission`**, because R3's prose reads as a data-flow constraint and nothing in it is
about control flow — B1 will survive architecture and surface as a wrong error code in V's hands at
S02's test point. I predict **BUILD(S01) will run exactly the seven suites R19 names, report them
green against baseline, and never open `tests/unit/pol01-policy.test.ts`** — and that pol01 will fail
in a way that looks like a pre-existing message drift rather than a caused break, because it still
throws, just with a different string. I predict **B3 will be built as option (a)** — the path of least
code — and that nobody downstream will notice, because no test reads `tier_provenance_ref` on this
path and the browser never shows it. If a later reviewer disagrees with me anywhere, I expect it to be
on B3's tier: it is the one finding whose damage is invisible until an audit, and the one I most
considered filing as non-blocking.

---

**Verdict: REWORK — pass 1 of 3.** B1, B2, B3, B4 blocking; N1–N8 for tickets. Two passes remain
before this is V's. The SPECs' evidence discipline is high enough that all four blocking findings are
closable by adding sentences to requirements that already exist — none requires re-slicing, and the
`ui:` flags, the slice boundary, the rosters, DONE.md and the V-row procedure all stand as written.
