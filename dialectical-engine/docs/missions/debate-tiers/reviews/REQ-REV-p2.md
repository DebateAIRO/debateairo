# REQ-REV — pass 2 of 3 · blind, SCOPED review of the requirements rework · mission `debate-tiers`

- **Verdict: PASS** (pass 2 of 3). Blocking: **none**. Non-blocking: **N1 N2 N3 N4**. Packet defects
  against the orchestrator: **P1 P2 P3**.
- Seat REQ-REV-p2 · node REQ-REV pass 2 · ticket `t_485d6613` · session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`
- Stood in the MAIN tree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, branch `dev`,
  HEAD `d1ec351b` at CLAIM and at verdict, 97 dirty entries (other missions', never touched).
  Lanes read read-only at `7f89f7b7`, 0 dirty entries in each.
- Blind: no contact with the REQ-FIX seat or the pass-1 reviewer. I edited nothing under review; my
  only writes are this file and my self-report.
- **All four blocking findings of pass 1 close.** Each closure was re-walked as inputs → outcome
  against the v2 text and against the code at the lines the v2 text cites, not read and nodded at.

---

## 1. The four closures, re-walked

### B1 — S02 R6's ordering · CLOSED

**Charge 2, answered.** With the Free roster unconfigured today, a build that obeys R3 and R6 as
written returns `ASK_PLAN_TIER_MODEL_UNAVAILABLE` on `POST /v1/asks`, and **cannot** return
`MAKER_INVENTORY_UNSATISFIED` on any path through `evaluateAskAdmission`.

The walk, re-derived from the code and not from the SPEC:

1. `S02/SPEC-v2.md:80-82` pins the order — *the roster check runs immediately after the R3 filter and
   BEFORE `assertMakerAdmission` (`apps/api/src/index.ts:1216`)* — and `:83` makes any later placement
   "a build this SPEC refuses".
2. `plan_tier: "free"` → the R3 filter keeps only `gpt-5.6-luna` / `claude-sonnet-5`; neither is a
   configured target (`00-intake.md:52`, re-read) → filtered panel empty → the roster check fires
   before `:1216` → `ASK_PLAN_TIER_MODEL_UNAVAILABLE`, message naming both members (R7 `:99-103`).
3. **Unreachability of the old code, proven rather than asserted.** `assertMakerAdmission` throws iff
   `new Set(availability.configuredMakers).size < 1` (`packages/critique/src/index.ts:334-339`, read
   verbatim). Under R3 `configuredMakers` is derived from the FILTERED panel
   (`apps/api/src/index.ts:1206` → `:1211`). Filtered panel empty → R6 already refused. Filtered panel
   non-empty → `size ≥ 1` → no throw. There is no third case, so the throw at `:1216` is dead for
   every ask carrying a tier, and every ask carries one after S01 R12 + `.strict()`.
4. Corroboration: `grep -rn 'MAKER_INVENTORY_UNSATISFIED' apps packages tests` finds **two** hits —
   the throw itself (`packages/critique/src/index.ts:336`) and a registry list
   (`packages/obs-capture/src/registry/index.ts:164`). **No test asserts that code**, so making it
   unreachable turns no suite red.

R15 `:159-167` carries the all-members-missing RED test and spells it out in full, including
`the test asserts the code is **not** MAKER_INVENTORY_UNSATISFIED` — the assertion that distinguishes
the two builds. Precondition A `:171-180` is re-read against the new order and now states the thing
that makes this testable today: Free is the all-members-missing case and Premium the
single-missing-member case, **with no preparation at all**. Acceptance step 7 `:201-204` fails loudly
and by name on the wrong code. Every `apps/api/src/index.ts` line R3/R5/R6/R8 cites — `:1195-1231`,
`:1205`, `:1206`, `:1207-1214`, `:1209-1210`, `:1211`, `:1216`, `:1218`, `:1225`, `:1230`, `:1284`,
`:1293` — re-resolved against the file: **12/12 correct**.

The pass-1 fix asked for one sentence. It got the sentence, both failure walks, the RED test, the
re-read precondition and an explicit FAIL in the acceptance step. Closed.

### B2 — R20's class, R19's suites, R13's typing pin · CLOSED

**Charge 3, answered in three parts.**

**(i) Is every member of the pass-1 table covered?** Yes — six of six, and I re-derived the sweep
myself in the lane rather than reading R20's. `grep -rn --include='*.ts' --include='*.tsx'
'createDebate(\|buildNewDebateAskConfig' apps packages tests` at `7f89f7b7`:

| Member (pass-1 table) | Where it lands in v2 | My check |
|---|---|---|
| `tests/unit/v2ui-data-layer.test.ts:753-767` | R20 sub-class B row 2; R19 `:180` base 57/57 | ✓ |
| `tests/unit/pol01-policy.test.ts:49-58` | R20 sub-class B row 3; R19 `:180` base 8/8 | ✓ |
| `tests/unit/v2ui-data-layer.test.ts:749` | R20 sub-class B row 4, unchanged (regex) | ✓ |
| `tests/render/ux01-new-debate-form.test.tsx:15, 72` | R20 sub-class B row 5, unaffected | ✓ |
| `apps/ui/components/LibraryComposer.tsx:29-31` | R20 sub-class B row 6 + §3 Out of scope `:275-287` | ✓ |
| `apps/ui/app/new/page.tsx:132` | R20 sub-class B row 1 | ✓ |
| sub-class C: `page.tsx:121`, `ux01:217`, `:219` | R20 `:221-225` | ✓ |

**My sweep finds no member R20 omits.** I also reproduced sub-class A's census with R20's own method:
`grep -rc steering_annotations` → api 7, contract 3, load01 1, s7-authorization 1,
evaluator-database 1 = **13 in 5 files**, exactly as written, with `ux01` 2 and `s14-contract` 1
correctly excluded as the named non-members.

**(ii) Is R21 satisfiable with the pinned typing?** Yes, and the pin is the right one.
`NewDebateAskDefaults` (`apps/ui/app/new/defaults.tsx:45-55`) already carries three optional members
at `:52-54` (`riskTierWasEdited?`, `steeringPresets?`, `steeringAnnotations?`) — R13's precedent is
exact. `buildNewDebateAskConfig` returns `Record<string, unknown>` (`:64`), and `createDebate`'s
parameter type is `AskConfig`, which is **`type AskConfig = Record<string, unknown>`**
(`apps/ui/lib/api.ts:330`, read verbatim). So an optional member introduces **no** diagnostic at the
`buildNewDebateAskConfig` → `createDebate` boundary, and the two spread call sites
(`ux01:217`, `:219`, read in the lane) compile unchanged. R21 holds. A required member would not:
those two calls spread a `defaults` object with no tier, exactly as R13 `:129-131` says.

**(iii) Does the lane copy still break under the pinned reading?** Yes. Read at
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine/tests/unit/v2ui-data-layer.test.ts`
(lane HEAD `7f89f7b7`, 0 dirty): `:753-766` is a positive `createDebate` whose config carries
`risk_tier`, `tier_source`, `tier_provenance_ref`, `composition_budget_tier`, `depth`,
`decision_scope`, `as_of` — **and no tier**. R13's guard is `requiredString(config, …)`
(`apps/ui/lib/api.ts:332-338`), which throws `ASK_FIELD_REQUIRED` on a missing key, so
`expect(created.id).toBe("run:new")` at **`:767`** fails. Every line number R20 gives for this file
is the lane's. `pol01-policy.test.ts:49-58` likewise: the config at `:50-56` has no tier and `:57-58`
asserts the exact string `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM: No healthy provider remained at claim`,
which the earlier guard pre-empts. Both dispositions in R20 are right, and both suites now carry
baselines (`BASELINE.md:39-40`, `:77-78`).

### B3 — R7's provenance pair · CLOSED

**Charge 4, answered.** The pair is named, it is inside R12's constraint, and the ref names a source
that exists. No `V-ROW:` was written in its place, so the second half of the charge does not arise.

- **Named:** `S01/SPEC-v2.md:78-80` — *the Free lock leaves `riskTierWasEdited` false … `tier_source`
  stays `MACHINE_DEFAULT` … the `false` branch of `tier_provenance_ref` reads
  `machine:plan-tier-free`*. One sentence, one build.
- **Inside R12.** `tier_provenance_ref` is `z.string().trim().min(1)`
  (`packages/contract/src/index.ts:111`, read verbatim) and `createDebate` reads it with
  `requiredString` and no allow-list (`apps/ui/lib/api.ts:377`, read verbatim — the line is exactly
  `const tierProvenanceRef = requiredString(config, "tier_provenance_ref");`). No schema change, so
  R12's "no other field is added, removed or loosened" holds. Contrast option (c) of pass 1, which
  would have needed `AskTierSourceSchema` (`packages/contract/src/index.ts:6`) widened.
- **True.** `machine:plan-tier-free` names the mechanism that actually set the value — the Free lock —
  and R7 `:83-85` extends the rule to the case that would otherwise re-open it: a value still standing
  from the Free lock after R8 switches to Premium is still a machine default and still carries that
  ref. The rule is on the mechanism, not on the tier. That is the one extension I would have asked for.
- **The measured cost claim, re-measured.** R7 `:88-93` claims no suite asserts the `false` branch
  `buildNewDebateAskConfig` derives. I checked all three call sites in the lane: `page.tsx:121` is
  production; `ux01:217` and `:219` assert `.as_of` only (`:217-218` and `:219-223`, read verbatim).
  **True.** And the `true` branch R7 says is untouched is asserted at `ux01:160` and `:185`
  (`tier_provenance_ref: "asker:ui-selection"`) — also true.
- **The probe that could have refuted this and did not.** I suspected `ux01:155-170`
  ("submits the complete discovery-owned ask…", asserting `tier_source: "ASKER"`) would flip to
  `MACHINE_DEFAULT` once R2 preselects Free and R4 disables the risk-tier pills. It does not:
  `submitRenderedPage` (`:131-143`) calls `chooseRiskTier(initial.tree, "standard")` at `:133`, and
  `chooseRiskTier` (`:122-129`) invokes the pill's `onClick` **prop directly**, bypassing the DOM
  `disabled` attribute entirely. `riskTierWasEdited` still becomes true. R7's "R19 keeps green" claim
  survives — but only because `S01/DECISIONS.md:12` rules the lock is the **native `disabled`
  attribute**; a lock implemented by stripping the handler would fail `ux01:155` and `:172`. The SPEC
  forecloses that build. See §6.

### B4 — the PROGRESS.md order · CLOSED

**Charge 5, answered.** **No sentence in either SPEC orders a non-orchestrator seat to write
`PROGRESS.md` or any file outside its contract.** I swept both v2 files rather than trusting the
handoff's sweep: `grep -n 'PROGRESS' S01/SPEC-v2.md S02/SPEC-v2.md` returns **four** hits, all in S02
and all in the corrected direction — `:132` cites it as the orchestrator's, `:137` and `:211` have the
orchestrator relaying, `:151` states the correction. S01 names it **nowhere**. The three ownership
citations R12 `:132-133` gives are exact: `slices/S02/PROGRESS.md:1` = "orchestrator is the sole
writer"; `.claude/skills/heartbeat-requirements/SKILL.md:44` = "**PROGRESS.md — empty.** The
orchestrator is its only writer"; `.claude/skills/heartbeat-orchestrator/SKILL.md:78` = "update the
slice's `PROGRESS.md` — you are its only writer". (Pass 1 cited the requirements skill at `:42`; `:44`
is right today.)

**Can a stranger run step 9?** Yes. Step 9 `:208-215` names three places and two of them are absolute
paths — `docs/missions/debate-tiers/slices/S02/PROGRESS.md` and
`.hermes/reports/debate-tiers/review-packages/S02-p<r>/` — plus the originating handoff. It then does
the thing an acceptance step must do and almost never does: it says what happens when the input is
missing — *if the command is in none of them, R12 was not met and this step is UNVERIFIED, not
passed*. The step can no longer silently go unrun, which was the whole of B4.

## 2. The folded findings, and the folds themselves (charges 6 and 7)

**N2, N4, N7, N8 — all closed.**

- **N2** — `INSTRUCTIONS.md:70-85` names all four RED-at-base suites with `passed/total` (ux01 1/8,
  v2ui-pages 36/41, s14-contract 2/5, sup-04-mounts 0/2) in a table pointing at `BASELINE.md`, plus
  the green ones. Every number matches `BASELINE.md:33-38` and `:71-76`. 85 lines, cap 100.
- **N4** — `S02/SPEC-v2.md:61-72` restates the mechanism, and I re-read the code to check it rather
  than the prose: `assertMakerAdmission` (`packages/critique/src/index.ts:328-340`) classifies nothing,
  throws iff `configuredMakers` is empty (`:334-339`), and its comment at `:332-333` reads "every
  nonempty discovered panel serves"; `runMakerReachability` and `classification` are computed in the
  API at `:1209-1210`; `applyCriticUnavailableCap` (`:342-357`) returns `serves: true` with
  `SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE` and `confidenceBandCapRequired: true`. The v2 text is
  correct line for line, and R5's conclusion is preserved with the sentence that matters most —
  *what refuses a roster that is NOT fully present is R6, and only R6*.
- **N7** — `S01/SPEC-v2.md:275-287` puts the composer's direct call in §3 Out of scope **with what
  must hold the day it is fixed**, and `S01/DECISIONS.md:79-91` **appends** the correction. The
  original rejected-alternative row is byte-identical to what pass 1 quoted — it has moved from `:26`
  to `:30` because four rows were appended to the decisions table above it, but its text is untouched.
  `00-intake.md:49` carries the same correction.
- **N8** — `S01/PLAN.md:31` says **fourteen** and lists all fourteen ids. I counted them: 6 segment
  buttons + `#treeDepth` + 2 textareas + 5 ⚙ OPTIONS knobs = 14. ✓

**The mechanical checks the packet names:**

| Check | Result |
|---|---|
| `ui:` on line 3 of each SPEC-v2 | `ui: yes` (S01), `ui: no` (S02) ✓ |
| supersession line 4 names pass, verdict and every changed requirement | S01 `:4-13` names R7, R13, R19, R20, §3; S02 `:4-15` names R5, R6, R12, R13, R14, R15, §2 — and each matches what actually moved ✓ |
| `SPEC.md` (v1) byte-identical to what pass 1 quotes | **13/13 quoted ranges land on the sentence they name** (S01 R7 `:51-63`, R12/R13 `:86-93`, R19 `:130-137`, R20 `:138-144`, R21 `:145-146`; S02 R3 `:36-41`, R5 `:47-51`, R6 `:55-58`, R12 `:89-91`, R13 `:95-101`, PrecondA `:109-112`, step 7 `:129-130`, step 9 `:133-134`), and `wc -l` is 189 / 141 ✓ |
| `INSTRUCTIONS.md` ≤ 100 lines | 85 ✓ |
| banned words in a criterion | **zero**. Four hits mission-wide, all quotation: the ban list itself in `S01/PLAN.md:9,12` and `S02/PLAN.md:11`, and "handles" in a disposition cell at `00-intake.md:68` (pre-existing, the orchestrator's file, already noted at pass 1) ✓ |
| DECISIONS appended, never rewritten | ✓ verified by quotation, not by `git diff` — see N7 above and §4 |
| no requirement added beyond the findings | S01 `R1…R21` in v1 and v2; S02 `R1…R15` in v1 and v2 — identical id sets ✓ |
| every `path:line` into a SPEC re-pointed | `grep -rn 'SPEC-v2\.md:[0-9]'` over the mission tree and the packets returns **nothing** — every pointer is by requirement id or by section, so no citation can drift ✓ |

**Charge 7 — the three folds.**

- **(b) V-12's BASELINE citation drift — the fold CLOSES.** `V-DECISIONS-PACKET.md:18` now cites
  `BASELINE.md:7, 45`; line 7 is the `tiers-s01` HEAD and line 45 is the `tiers-s02` HEAD ✓.
  `S02/SPEC-v2.md:154-158` corrects R14 from `:43-65` to `:48-70`, and `:48-70` is exactly the
  `tiers-s02` typecheck block ✓. `S01` R13/R21's `BASELINE.md:10-32` is the `tiers-s01` block ✓.
  `BASELINE.md:90` adds the rule that makes the class extinct — *from 21:40 on this file grows ONLY at
  its end*. `S02/DECISIONS.md:57-71` appends the correction and hands the packet copy to the
  orchestrator, who fixed it. The row's own line still literally reads `:7, 40`, which is correct
  discipline in an append-only file. **Fold closes.**
- **(a) `t9-mode-tokens` and (c) `prov01-honesty-drawer` — the rows exist, but four binding sentences
  still say they do not.** `BASELINE.md:95-96` and `:99-100` now carry both suites for both lanes
  (t9 = 2 failed | 7 passed (9); prov01 = 1 passed (1)). **These folds close the missing rows and open
  a contradiction** — see **N1**.

## 3. Findings

Numbered, tiered honestly. None is blocking: none changes which build a stranger writes, and none
makes an acceptance step unrunnable. All four are one-clause folds.

### N1 — the 21:40 baseline fold left four binding sentences asserting the rows it created do not exist

**Against the orchestrator.** Members of one class — *a claim about the contents of an append-only
file, made before the append*:

| # | Where | The stale claim | The fact |
|---|---|---|---|
| a | `docs/missions/debate-tiers/slices/S01/SPEC-v2.md:182-186` | t9-mode-tokens "has no `BASELINE.md` row yet", so the seat measures it and the orchestrator appends the row | `BASELINE.md:95` (s01) and `:99` (s02): **7/9**, measured 21:40 |
| b | `docs/missions/debate-tiers/INSTRUCTIONS.md:81-82` | same claim, in the compass every seat reads first | same |
| c | `docs/missions/debate-tiers/slices/S01/SPEC-v2.md:298-299` | prov01 is "a suite with no `BASELINE.md` row" | `BASELINE.md:96`, `:100`: **1/1** |
| d | `docs/missions/debate-tiers/V-DECISIONS-PACKET.md:20` (row V-14's evidence) | same claim about prov01, inside the row that binds S01's scope | same |

**Inputs → outcome.** BUILD(S01) reads R19, is told t9 has no baseline, measures it itself, reports
its own number as the baseline, and the orchestrator is told to append a row that already exists — a
duplicate in a file whose own rule (`BASELINE.md:90`) is append-only-at-end. R19's saving clause
(`:188-190`, *every baseline number above is read from `BASELINE.md`… a seat whose run straddles a
re-measure re-reads it*) is scoped to "every baseline number **above**", and t9's is not above — it is
the one number R19 does not state. The damage is bounded because R19's fallback orders the measurement
*before the first RED test of the cluster*, so the seat gets 7/9 anyway; that bound is why this is not
blocking.

**Fix (one clause each):** state `tests/unit/t9-mode-tokens.test.ts` **7/9** (both lanes,
`BASELINE.md` end section, measured 2026-09-09 21:40) in R19 and in `INSTRUCTIONS.md:81-82`, and drop
"no row yet"; in (c) and (d) replace "a suite with no `BASELINE.md` row" with "**1/1**, `BASELINE.md`
end section". Fifth member, same class, cheap while you are there: `INSTRUCTIONS.md:38` still advertises
"the rows REQ opened, **V-10…V-13**" — V-14 exists and it is the row that binds S01's honesty-drawer scope.

### N2 — six suites this mission's own requirements will turn RED have no `BASELINE.md` row

**Against the orchestrator, shared with REQ.** This is B2's class one step out, and it is
**pre-existing, not created by the v2 text** — v1 `S01/SPEC.md:142-143` already said "each of those
five suites is run and reported". I raise it because pass 1's B2 fixed the two members it found and
the same hole is still open for six more, and because `BASELINE.md:88` already makes it the
orchestrator's: *a suite without a row is a finding against the orchestrator.*

Members, none of which has a row in either lane section: `tests/unit/api.test.ts` ·
`tests/unit/contract.test.ts` · `tests/unit/load01-live-proof.test.ts` ·
`tests/unit/s7-authorization.test.ts` · `tests/integration/evaluator-database.test.ts`
(R20 sub-class A, S01) and the same `api.test.ts` again under S02 R13 `:144-148`.

**The expensive one, found by walking charge 2 and worth naming precisely.**
`tests/unit/api.test.ts` does not only carry seven ask literals; it calls `evaluateAskAdmission`
**directly** four times, and **S02's R3 filter turns three of those cases RED** — read in the
`tiers-s02` lane at `7f89f7b7`:

- `:137-143` expects the call to **resolve** with a risk match, against a fixture discovered panel
  whose `model_id`s are not roster members → under R3 the filtered panel empties → R6 refuses → the
  `resolves` assertion fails;
- `:159-167` expects `criticUnavailableCap` with `SINGLE-LINEAGE` from `fixtureDiscoveredPanel(1)` →
  same, the one fixture member is filtered out;
- `:169-177` expects a rejection coded `STRUCTURAL_CEILING_INPUTS_UNRESOLVED` from
  `resolveEnvelopeBasis` → R6's pinned order fires **before** `resolveEnvelopeBasis`
  (`apps/api/src/index.ts:1222`), so the code becomes `ASK_PLAN_TIER_MODEL_UNAVAILABLE`;
- `:179-186` (`PROVIDER_PROBE_UNRESOLVED` thrown inside `resolveDiscoveredPanel`) is **unaffected** —
  it throws before any filter.

A seat with no baseline row reads "3 failed" and has nothing to date them against. R13's own grep
predicate is otherwise complete: `grep -rn 'evaluateAskAdmission' apps packages tests` finds only
`apps/api/src/index.ts` and `tests/unit/api.test.ts`, and R13 already lists it.

**Fix:** measure the six rows in both lanes before ARCH/BUILD start (they are cheap — the same script
that produced the 21:40 rows), and add one clause to S01 R20-A / S02 R13 naming the three
`api.test.ts` admission cases as expected, caused, and re-fixtured. I would make the rows a
precondition on releasing ARCH rather than a rework of the requirements.

### N3 — R20 sub-class B's arithmetic, and one non-member left unnamed

**Against REQ-FIX, cosmetic.** `S01/SPEC-v2.md:209-210` says "**Six call sites, five outside
`createDebate` itself**" and then tabulates six rows, one of which is not a call site. My sweep in the
lane: `createDebate(` is called at `apps/ui/app/new/page.tsx:132`,
`apps/ui/components/LibraryComposer.tsx:29`, `tests/unit/v2ui-data-layer.test.ts:749` and `:753`, and
`tests/unit/pol01-policy.test.ts:49` — **five** call sites, plus the definition at
`apps/ui/lib/api.ts:365`. The sixth row, `ux01:15, 72`, is a `vi.fn()` mock declaration. The sweep is
complete; only the count sentence is wrong, and a reviewer checking it mechanically will stop on it.

While there: sub-class A names two non-members "so nobody re-derives them" and omits a third.
`tests/architecture/s7-authorization-contract.test.ts:173-186` slices the contract source between
`export const AskRequestSchema` and `export type AskRequest` and asserts the slice contains none of
`decision_owner`, `action_owner`, `caller_scope`. `plan_tier` introduces none of them, so it is safe —
but it is the third source-text assertion over `AskRequestSchema` in the repo, and naming it costs one
line and saves the next seat the read.

### N4 — `DONE.md`, V's own oracle, still points at the superseded `SPEC.md`

**Against the REQ-FIX packet, not the seat.** `slices/S01/DONE.md:9` ("the floor is `SPEC.md` §2
Acceptance") and `:29` ("`SPEC.md` R2") point at v1, which `INSTRUCTIONS.md:19-20` now declares the
historical record — *read v2, and never a memory of v1*. **Harmless today, and I measured that rather
than assuming it:** `diff` of S01 §2 Acceptance v1 `:148-182` against v2 `:232-266` is **empty**, and
R2 is unchanged. It decays the moment a pass 3 or a V ruling at the mock gate moves R2 or a step —
which is precisely what row V-9 contemplates. REQ-FIX disclosed this under UNVERIFIED and offered to
repoint it; its packet's charge 11 told it to leave DONE.md as written, so the residue is the packet's.
**Fix:** repoint both to `SPEC-v2.md`.

## 4. What I verified, and how

Every command was run from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`; lane reads
from `.worktrees/tiers-s01/…` and `.worktrees/tiers-s02/…`, both at `7f89f7b7` with 0 dirty entries
(`git rev-parse --short HEAD`; `git status --porcelain | wc -l`). No suite was run — a requirements
review runs none; see §5.

| Probe | Command / method | Result |
|---|---|---|
| B1's unreachability claim | read `apps/api/src/index.ts:1195-1231` and `packages/critique/src/index.ts:320-360` verbatim; then `grep -rn 'MAKER_INVENTORY_UNSATISFIED' apps packages tests` | 12/12 cited lines correct; 2 hits, neither a test — the code is unreachable under R3+R6 and no suite asserts it |
| B1's other consumers | `grep -rn 'evaluateAskAdmission' apps packages tests` | 1 production caller (`:1284`, before `startRun` `:1293` ✓ R8) + 4 direct calls in `tests/unit/api.test.ts` → **N2** |
| `ASK_PLAN_TIER_MODEL_UNAVAILABLE` exists today? | `grep -rn` over `apps packages tests` | zero hits — the code is new, as R6 implies |
| B2's class, swept independently | `grep -rn --include='*.ts' --include='*.tsx' 'createDebate(\|buildNewDebateAskConfig' apps packages tests` in the lane | 5 call sites + 3 builder call sites; **no member R20 omits** → count defect only (**N3**) |
| R20-A's census, reproduced | `grep -rc steering_annotations apps packages tests` in the lane | api 7, contract 3, load01 1, s7-authorization 1, evaluator-database 1 = **13 in 5 files**, exactly R20-A |
| R13's typing pin | read `apps/ui/lib/api.ts:330` (`type AskConfig = Record<string, unknown>`), `:332-338`, `:365-397`; `defaults.tsx:45-55`, `:64-80` | optional member introduces no diagnostic; **R21 satisfiable** |
| the lane copy still breaks | read `.worktrees/tiers-s01/…/tests/unit/v2ui-data-layer.test.ts:735-775` and `pol01-policy.test.ts:44-62` | `:767` fails; `:58`'s exact string is pre-empted — both dispositions correct |
| B3's cost claim | read `ux01:155-190`, `:210-230`, `:260-275` in the lane | `:217`/`:219` assert `.as_of` only ✓; `:160`/`:185` assert the `true` branch ✓ |
| B3's refutation attempt | read `submitRenderedPage` `:131-143` and `chooseRiskTier` `:122-129` | `onClick` is invoked as a prop, bypassing `disabled` — the ASKER assertions survive R4; **refutation failed** |
| prov01 is a fixture, not a derivation | read `tests/render/prov01-honesty-drawer.test.tsx:25-45` | `:40-42` asserts a rendered string from a fixture Answer — R7's change cannot reach it ✓ |
| B4's sweep | `grep -n 'PROGRESS' S01/SPEC-v2.md S02/SPEC-v2.md` | 4 hits, all orchestrator-directed; S01 none ✓ |
| ownership citations | `sed` on `heartbeat-requirements/SKILL.md:44`, `heartbeat-orchestrator/SKILL.md:78`, `S02/PROGRESS.md:1` | 3/3 exact |
| v1 frozen | `wc -l` + `sed -n` on all 13 ranges the pass-1 verdict quotes | 189/141 lines; 13/13 land ✓ |
| acceptance identity | `diff <(sed -n 148,182p S01/SPEC.md) <(sed -n 232,266p S01/SPEC-v2.md)` | empty → **N4** is harmless today |
| requirement id sets | `grep -o '^- \*\*R[0-9]*\.\*\*'` on all four files | S01 R1–R21 both; S02 R1–R15 both — nothing added |
| SPEC line citations anywhere | `grep -rn 'SPEC-v2\.md:[0-9]'` over the mission tree and packets | **none** — all pointers are by requirement id |
| banned words | `grep -rniE '\b(improve[sd]?\|improvement\|better\|robust\|handles?\|handling\|handled\|appropriate(ly)?)\b'` over the mission tree | zero in any criterion (4 quotation hits) |
| R17's premise | `grep -n '^:root {\|^html\[data-mode="chamber"\] {' apps/ui/app/globals.css` | exactly one of each (`:5`, `:115`) ✓ |
| BASELINE folds | read `BASELINE.md` in full; resolved `:7`, `:45`, `:10-32`, `:48-70`, `:95-96`, `:99-100` | (b) closes; (a) and (c) create **N1** |
| board ids in both packets | `hermes kanban --board debate-tiers show <id>` for all 11 ids | 11/11 resolve; the 8 finding tickets are still `ready`, as the packet says |
| base ancestry | `git merge-base --is-ancestor 7f89f7b7 HEAD` | YES (`7f89f7b7` → `d1ec351b`) |

## 5. Packet review (charge 1) and UNVERIFIED

**The REQ-FIX-p2 packet.** Constants: base `7f89f7b7` ✓, ticket `t_a4a6ea69` ✓ and all eight finding
ticket ids ✓ (`:24`), the lane path for `v2ui-data-layer` ✓ (`:10` — and the +41-line warning is real:
the block sits at `:742-767` in the lane and `:783-807` in the main tree), the cited product lines
(`:23`) ✓ where I re-resolved them. `allowed` (`:15`) vs what REQ-FIX wrote: `INSTRUCTIONS.md` ✓,
`slices/S01` and `slices/S02` except `PROGRESS.md` ✓, `agent-reports/REQ-FIX.md` ✓ — and both
`PROGRESS.md` files were last written at 21:41, after REQ-FIX's READY, by the orchestrator. **No
evidence REQ-FIX crossed its contract.** `SPEC.md` v1 stayed byte-identical at its READY, which is the
harder claim and which I verified by content (13/13 quoted ranges) rather than by mtime. Its
`SKILLS LOADED` line names `using-superpowers`, `heartbeat-protocol`, `heartbeat-requirements`,
`receiving-code-review`, `brainstorming` — **the requirements floor met in order**; I cannot see its
transcript, so the bodies are UNVERIFIED (same blind-seat limitation pass 1 reported for REQ).
The one packet defect REQ-FIX itself reported — §1 "output" and charge 11 telling it to re-freeze
`SPEC.md` in place, against the requirements contract — is real, and the 21:14 correction was right.

**Defects in MY packet (P1–P3), against the orchestrator:**

- **P1 — charge 1's prescribed verification cannot be executed.**
  `git status --short docs/missions/debate-tiers` returns **empty**: the orchestrator committed the
  entire mission tree as `d1ec351b` at 21:42:50, ~40 seconds before dispatching me at 21:43. The
  packet was written against an untracked tree; the command it names now proves nothing, in either
  direction. I substituted `git show --stat d1ec351b` (46 files: the mission tree, the packets, the
  ledger, agent reports, handoffs, logs, the v1 SPEC snapshot, and `.claude/launch.json`), file mtime
  ordering, and the quotation comparison the packet's own §2 already names. Cost ~4 minutes.
  **Fix:** a packet dispatched after a freeze names the freeze commit and the command that reads it
  (`git show --stat <sha> -- docs/missions/<m>`), never `git status`.
- **P2 — the `allowed` list forbids the artifact the reviewer contract orders me to write.**
  `heartbeat-reviewer` §7 says *copy any probe worth keeping into `.hermes/reports/<m>/probes/`
  yourself*; my `allowed` (`:15`) is exhaustive and lists only this file and my self-report, and
  `heartbeat-protocol` §6 forbids crossing the file contract. I obeyed the packet and inlined every
  probe command verbatim in §4 instead. **Fix:** either the allowed list gains
  `.hermes/reports/debate-tiers/probes/REQ-REV-p2-*`, or the skill's §7 gains "unless your packet's
  allowed list excludes it". Two binding documents should not order opposite things.
- **P3 — two HEADs in one dispatch record.** The DISPATCHED comment says "main-tree HEAD at check
  `42038a27`"; the tree stood at `d1ec351b` when I measured 40 seconds later, and `COMMON.md:7` says
  `1dfb7f03`. The packet's own instruction (*measure it where you stand*) makes this harmless, but it
  is a third number a seat must reconcile before it can trust the first.

**UNVERIFIED — what I could not do:**

- **No suite was run.** A requirements review runs none, and my `allowed` list contains no log path.
  Everything above is derived from source read at named lines, from schema and guard semantics, and
  from `BASELINE.md`. The fastest confirmations remain, in a lane:
  `pnpm exec vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/pol01-policy.test.ts` for B2 and
  `pnpm exec vitest run tests/unit/api.test.ts` for N2.
- **No acceptance step executed**, S01 1–12 or S02 1–9. QA is V's, `/new` is behind the sign-in wall
  pass 1 documented, and row V-7's three targets are V's operation. `.local/**` never opened; the
  `:3000` stack untouched; nothing opened on V's desktop.
- **REQ-FIX's skill bodies:** UNVERIFIED (blind seat, no transcript access).
- **The three `api.test.ts` breakages of N2** are derived from reading the fixtures and the admission
  path, not from a run. I am confident in `:169-177` (control-flow, certain) and confident in
  `:137` / `:159` conditional on `fixtureDiscoveredPanel` emitting `model_id`s outside the two
  rosters — which is what "`gpt-5.6-luna` and `claude-sonnet-5` are not configured targets" makes
  overwhelmingly likely, but which one `grep` at ARCH time settles for good.

## 6. Predictions (charge 8, and my own)

**Pass-1 §6, one by one.**

- *"ARCH(S02) will place the roster filter correctly at `:1205` and still leave the refusal after
  `assertMakerAdmission`."* **Defeated.** The sentence that defeats it is `S02/SPEC-v2.md:80-82`:
  *the roster check runs immediately after the R3 filter and BEFORE `assertMakerAdmission`
  (`apps/api/src/index.ts:1216`), so an empty or short filtered panel is refused as
  `ASK_PLAN_TIER_MODEL_UNAVAILABLE` and never as `MAKER_INVENTORY_UNSATISFIED`* — with `:83`
  ("Placing the check anywhere after `:1216` is a build this SPEC refuses"), `:96-98` naming the exact
  misreading of R3 that produced the prediction, R15 `:159-167`'s RED test, and step 7 `:202-204`
  failing by name. This is over-determined now; four independent sentences would have to be ignored.
- *"BUILD(S01) will run exactly the seven suites R19 names … and never open
  `tests/unit/pol01-policy.test.ts`."* **Defeated.** R19 `:180` lists it with base 8/8 and R20's table
  row `:216` names the exact assertion that breaks and why a careless run misreads it as message
  drift. `BASELINE.md:40` and `:78` carry the row in both lanes.
- *"B3 will be built as option (a) — the path of least code — and nobody downstream will notice."*
  **Half defeated, and the surviving half is now disclosed rather than silent.** R7 `:78-80` pins
  option (a) *with the honest string*, so the run record no longer names a floor nobody read. But
  V-14's binding default keeps `apps/ui/lib/v3/labels.ts:6` mapping `MACHINE_DEFAULT` to "machine
  default from the deployment floor", which `AnswerHonestyDrawer.tsx:86` renders beside the honest
  ref — so on V's screen a Free run still reads as a deployment-floor default. The SPEC says so at
  `:289-301` and routes it as a V row. The prediction's spirit survives at one remove: **the honest
  column and the false sentence now ship together, and only V can close that.**
- *"If a later reviewer disagrees with me anywhere, I expect it to be on B3's tier."* **I do not
  disagree.** B3 was worth a pass: three builds compiled and one was true, and the closure is the
  cheapest of the four.

**Mine, for the seats downstream — falsifiable, and the evidence that blindness held.**

I predict **ARCH(S01) will pin the Free lock as a `disabled` attribute and BUILD(S01) will still turn
`tests/render/ux01-new-debate-form.test.tsx:155` and `:172` red at least once**, not through the
attribute but through a state-layer short-circuit in `onChange` — and that whoever sees it will blame
R7's provenance change rather than the handler, because the failing assertion is
`tier_source: "ASKER"`. The refutation is in this file: `chooseRiskTier` calls the prop, not the DOM,
so only a handler change can move that assertion. I predict **BUILD(S02) will report
`tests/unit/api.test.ts` with three new failures dated "pre-existing"**, because it has no row in
`BASELINE.md` and the file is RED-adjacent in every other mission — N2 exists to make that
mis-attribution cost one grep instead of one pass. And I predict **the t9-mode-tokens row will be
appended a second time** by an orchestrator obeying R19 `:185` literally, unless N1(a) is folded
first. If a pass-3 reviewer disagrees with me anywhere, I expect it to be on N2's tier: it is the one
finding I weighed as blocking and filed non-blocking, on the ground that `BASELINE.md:88` already
obliges the orchestrator to close it and that spending the last rework pass on six baseline rows would
buy nothing the fold does not.

---

**Verdict: PASS — pass 2 of 3.** B1, B2, B3 and B4 all close: each was re-walked as inputs → outcome
against the v2 text and against the code at the lines that text cites, and in each case exactly one
build is now true. N2, N4, N7 and N8 close. `SPEC.md` v1 is intact in both slices, the supersession
blocks name what actually moved, no requirement was added beyond the findings, `INSTRUCTIONS.md` is 85
lines, and the banned-word count in a criterion is zero. N1–N4 and P1–P3 are folds for the
orchestrator, not a rework: none of them changes which build a stranger writes. **Planning closes;
`ARCH(S01)` ∥ `ARCH(S02)` are released** — with one request that costs nothing and prevents a
mis-attribution: land N2's six `BASELINE.md` rows before the first BUILD cluster starts.
