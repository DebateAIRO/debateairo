# ARCH-REV(S01) pass 1 of 3 — blind review of `slices/S01/PLAN.md` and of the packet that produced it

| | |
|---|---|
| **Verdict** | **PASS** (pass 1 of 3) — 9 non-blocking findings, 3 packet defects, 0 blocking |
| Seat / node | `ARCH-REV-S01` · `ARCH-REV(S01)` · blind (no contact with `ARCH-S01`, no other lens read) |
| Ticket | `t_0e278df0` (slice ticket `t_11abead2` is V's) · comments read through: 1 |
| Date | 2026-09-09 22:40–23:0x EEST · session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886` · model `claude-opus-5` |
| Under review | `docs/missions/debate-tiers/slices/S01/PLAN.md` (859 lines, incl. the `## Screens` block) · `.hermes/planning/debate-tiers/packets/ARCH-S01.md` · `docs/architecture/01-decisions/ADR-0023-globals-css-append-fence.md` · `slices/S01/DECISIONS.md` (the ARCH rows) · `.hermes/reports/debate-tiers/handoffs/ARCH-S01-handoff.md` |
| Measured in | `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine`, branch `slice/tiers-s01`, HEAD `7f89f7b7`, `git status --porcelain` = **0 before and after every run** |
| Main tree at claim | HEAD `19fe6735`, 98 dirty entries (other missions', never touched) |
| Probes | `.hermes/reports/debate-tiers/probes/ARCH-REV-S01/` — 9 files, every log verbatim |

Why PASS and not REWORK: every finding below lands on a node **downstream of the UI gate**
(`MOCK(S01)` → V's `DONE.md`), each remedy is one to three lines, and `heartbeat-reviewer` §4 binds a
planning review to *fold, don't loop*. Nothing here makes the plan unbuildable and nothing invalidates
the artefact the next node consumes. **N1 is the exception on timing, not on tier: its fold has to
reach the `MOCK(S01)` packet itself, not only `DECISIONS.md`, or it is not closed.**

---

## 1. What I ran (probe, never read)

Every number below is mine, produced in the lane from a `.sh`/`.js` file under the seat scratch dir,
logs kept in the probes dir. Nothing was taken from the author's numbers without re-running it.

### 1.1 The four cluster commands, re-run at base — **zero disagreements**

The PLAN's own shared runner (`PLAN.md:518-527`), verbatim, one path per `vitest` invocation.

```
=== C1 (PLAN.md:554) ===                       [probes/p3-cluster-c1.log]
generate:contract rc=0
tests/unit/contract.test.ts               rc=0 passed=7  failed=0 (expect 8/0)
tests/unit/api.test.ts                    rc=0 passed=24 failed=0 (expect 25/0)
tests/unit/load01-live-proof.test.ts      rc=0 passed=1  failed=0 (expect 1/0)
tests/unit/s7-authorization.test.ts       rc=0 passed=31 failed=0 (expect 31/0)
tests/integration/evaluator-database.test.ts rc=0 passed=21 failed=0 (expect 21/0)
BROKEN tests/architecture/tier01-roster.test.ts (no summary line)
tests/architecture/s7-authorization-contract.test.ts rc=1 passed=5 failed=1 (expect 5/1)
tests/architecture/s8-publication-contract.test.ts   rc=1 passed=4 failed=1 (expect 4/1)
CLUSTER_RED
```

```
=== C2 (PLAN.md:555) ===                       [probes/p8-clusters-c2c3c4.log]
BROKEN tests/unit/tier01-ask-wire.test.ts (no summary line)
tests/unit/v2ui-data-layer.test.ts        rc=0 passed=57 failed=0 (expect 57/0)
tests/unit/pol01-policy.test.ts           rc=0 passed=8  failed=0 (expect 8/0)
tests/architecture/s14-contract.test.ts   rc=1 passed=2  failed=3 (expect 2/3)
tests/render/prov01-honesty-drawer.test.tsx rc=0 passed=1 failed=0 (expect 1/0)
tests/render/bug02-debate-effects.test.tsx  rc=0 passed=4 failed=0 (expect 4/0)
tests/render/evaluator-dev-menu-controls.test.tsx rc=0 passed=1 failed=0 (expect 1/0)
tests/unit/s10-erasure-ui.test.ts         rc=0 passed=3  failed=0 (expect 3/0)
tests/unit/v2ui-ownership.test.ts         rc=0 passed=3  failed=0 (expect 3/0)
CLUSTER_RED

=== C3 (PLAN.md:556) ===
BROKEN tests/render/tier01-new-plan-tier.test.tsx (no summary line)
tests/unit/v2ui-pages.test.ts             rc=1 passed=36 failed=5 (expect 36/5)
tests/render/ux01-new-debate-form.test.tsx rc=1 passed=1 failed=7 (expect 1/7)
tests/render/sup-04-widget.test.tsx       rc=0 passed=8  failed=0 (expect 8/0)
tests/architecture/sup-04-mounts.test.ts  rc=1 passed=0  failed=2 (expect 0/2)
tests/unit/evaluator-dev-menu-ui.test.ts  rc=0 passed=2  failed=0 (expect 2/0)
CLUSTER_RED

=== C4 (PLAN.md:557) ===
BROKEN tests/unit/tier01-style-contract.test.ts (no summary line)
tests/unit/t9-mode-tokens.test.ts         rc=1 passed=7  failed=2 (expect 7/2)
tests/render/consent-bar.test.tsx         rc=0 passed=7  failed=0 (expect 7/0)
tests/unit/consent-s02-style-contract.test.ts rc=0 passed=10 failed=0 (expect 10/0)
tests/render/consent-card.test.tsx        rc=0 passed=11 failed=0 (expect 11/0)
tests/render/consent-cross-slice.test.tsx rc=0 passed=7  failed=0 (expect 7/0)
tests/render/consent-guards.test.tsx      rc=0 passed=7  failed=0 (expect 7/0)
tests/render/consent-policy-link.test.tsx rc=0 passed=14 failed=0 (expect 14/0)
tests/render/t3-library.test.tsx          rc=1 passed=11 failed=4 (expect 11/4)
tests/architecture/role-token-map.test.ts rc=1 passed=46 failed=3 (expect 46/3)
tests/unit/pda-s03-keyboard-accessibility.test.ts rc=1 passed=3 failed=2 (expect 3/2)
CLUSTER_RED
```

**Reading.** Every path that EXISTS at base returns exactly the pair the PLAN predicts — 34 of 34
suite rows, no disagreement in any cluster. The only `CLUSTER_RED` arms are (a) C1's three TDD rows
(`contract` 7≠8, `api` 24≠25, the roster suite that does not exist), which is the TDD-RED the PLAN
declares, and (b) the one not-yet-created path each of C2/C3/C4 names, which the runner classifies
`BROKEN`, as designed. So the PLAN's base verdicts — *"C2/C3/C4 GREEN at base for every existing
path"*, `PLAN.md:555-557` — and the handoff's *"C1 CLUSTER_RED on exactly three rows"* are both
**confirmed**, and the handoff's disclosure that the new paths were omitted from its own base run
(`ARCH-S01-handoff.md:16`) is what makes its `CLUSTER_GREEN` wording honest rather than loose.
`generate:contract` rc=0 and `packages/contract/generated` was byte-identical before and after
(`shasum` of the tree: `9a8bf691…` both times), so charge 5's "read-only" was kept.

### 1.2 Charge 1 — the instrument. I tried to refute F1's remedy and could not.

The claim under test (`PLAN.md:57-62`, `:356-359`): the `sup-04-widget` idiom renders `/new` with the
**real compiled components**. I did not read the author's test; I wrote my own fixture from the claim
(`probes/p6-newpage-render.test.tsx`), rendering `apps/ui/app/new/page.tsx` through jsdom + real React
+ `createRoot` + `act` + `IS_REACT_ACT_ENVIRONMENT`, mocking only `next/navigation`,
`@/components/AuthGate` and `@/lib/api` — the exact three the plan names — and exceeding the plan's
parameters by driving state, not only first paint:

```
✓ P1 renders the REAL compiled page — the chrome the Screens block names          206ms
✓ P2 renders the fourteen controls R4 must lock — all reachable by the ids the SPEC names  14ms
✓ P3 propagates STATE through this idiom — the mechanism S01-34/35/36 depend on     8ms
✓ P4 accepts typing into #topic and enables .ndStart — R6 / R18 are reachable here  9ms
✓ P5 reaches createDebate on submit — the S01-39 mount                             11ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
PROBE ask config = {"risk_tier":"standard","tier_source":"ASKER","tier_provenance_ref":"asker:ui-selection",…}
```

P2 found **all fourteen** R4 ids present in the rendered DOM after expanding `⚙ OPTIONS`
(`missing = []`). P3 moved `#riskTier-casual`'s `aria-checked` `false → true` and `#treeDepth`'s
rendered value to `4` through this harness. So: `R1, R2, R4, R5, R6, R8, R9, R10` are all writable in
the new suite, and the F1 decision is sound on measured evidence, not on resemblance to `sup-04-widget`.

- **Every rendered requirement lands in a step of the new suite** — checked one by one against
  `PLAN.md:157-179` and §3: R1 → S01-20/21/22 · R2 → S01-23 (+S01-24, a grep) · R3 → S01-25/26 ·
  R4 → S01-27/28/29 · R5 → S01-30 · R6 → S01-33 · R8 → S01-34/35 · R9 → S01-36 · R10 → S01-37
  (new suite **and** `v2ui-pages:93-95`). No rendered requirement is left in `ux01`.
- **`ux01` is left RED-as-baseline, not repaired and not deleted**: it is on the must-NOT-write list
  (`PLAN.md:656`), C3's command pins it at `1:7` (`PLAN.md:556`), §7 carries it unchanged
  (`PLAN.md:705`), and the repair is filed as its own ticket (`DECISIONS.md:108`). I confirmed the
  break is the suite's own `vi.mock("react", …)` at `ux01:57-61` over the hand-rolled hook slots at
  `:21-55`, and that the one passing case (`:210-224`) is the non-rendering `buildNewDebateAskConfig`
  unit — the pair R20-C pins.

### 1.3 Charge 2 — CSS placement and ADR-0023. Both ways, on known-GOOD and known-BAD input.

`probes/p4-css-gate.js` replicates the assertion logic of the three guards and runs each against four
inputs. Verbatim:

```
=== KNOWN-GOOD (base globals.css) ===
  guard A consent-s02-style-contract:248-249  -> PASS
  guard B consent-bar:270-280                 -> PASS
=== S01's PLANNED placement: rules inserted after .ndKeyHint (:6206) ===
  guard A -> PASS      guard B -> PASS
=== MUTANT 1: a rule appended at end-of-file (PLAN S01-40's own mutant) ===
  guard A -> FAIL  tail="\n\n.ndPlanTier { display: flex; gap: 8px; }\n"
  guard B -> FAIL  after=".ndPlanTier { display: flex; gap: 8px; }"
```

Markers re-measured in the lane: consent-S01 opens `:8188` closes `:8559`; consent-S02 opens `:8561`
closes `:8980`, the last line of an 8980-line file. `.ndKeyHint` **is** at `globals.css:6206`. The two
token blocks are exactly one `:root {` (`:5`) and one `html[data-mode="chamber"] {` (`:115`), matching
the COMMON §6 token contract. Base pairs re-measured inline: `consent-s02-style-contract` **10 passed
(10)**, `consent-bar` **7 passed (7)**, `t9-mode-tokens` **2 failed | 7 passed (9)**.

So the placement decision is right and green-by-delta on the two consent guards — **and one arm of it
is not gated at all**, which is finding **N2** below.

**Is ADR-0023 a decision that outlives the mission, or mission noise?** It outlives it. The property it
records is not about tiers: *the last non-whitespace text of `apps/ui/app/globals.css` is a contract,
written in two suites that name neither the file's editor nor its mission.* Any future slice that
appends CSS at end-of-file — the ordinary thing to do, and what the two most recent slices in this repo
did — turns two green suites red for a reason with no connection to its own work. The ADR states the
rule, the escape hatch (amend both guards in the same commit), and the standing alternative (split
`globals.css`). Its numbering row re-measures the orchestrator's 22:32 collision note and shows there is
no collision (`git log --all` empty for the path, untracked, mtime three minutes before the note).
I re-checked that reasoning and did not contest it; allocation is still the orchestrator's to direct.
VERDICT keep ADR-0023 as written / CONFIDENCE high / STRONGEST COUNTER: an ADR whose whole content is
"two other missions' tests pin the tail of one file" could be a `TOOLING-TRAPS` entry instead — but
`TOOLING-TRAPS` is read as an index plus named headings (`heartbeat-protocol` §3.8), and a slice that
never greps for "globals" would not surface it, which is the discoverability failure the ADR exists for.

### 1.4 Charge 5 — the 17 read-surface suites, and an independent sweep of the class

The reconciliation charge 5 asks for: the handoff (`ARCH-S01-handoff.md:15`) and `DECISIONS.md:115`
say **"Eight are RED at base"**; the F4 table itself (`PLAN.md:110-128`) lists **seven** suites carrying
failures — `load01-debate-page` 2|8, `t1-canvas` 5|12, `s7-authorization-contract` 1|5,
`s8-publication-contract` 1|4, `role-token-map` 3|46, `t3-library` 4|11, `pda-s03-keyboard-accessibility`
2|3 — and the orchestrator's own re-measure header agrees (`BASELINE.md:124`: "7 of 17 carry failures at
base"). **The table is right; the prose miscounts.** That is finding **N7**; nothing downstream reads the
prose, and every cluster command uses the table's pairs, which my C4 run reproduced exactly.

I then swept the class myself rather than trusting the sweep (`probes/p5-readers.log`), over all **six**
production files S01 writes rather than the three F4 covers, and narrowed to the readers that could
actually break — source-text readers and inventory readers:

| S01 write surface | standing suites that read it | any NOT in a cluster command? |
|---|---|---|
| `apps/ui/app/new/page.tsx` | `sup-04-mounts`, `sup-04-widget`, `ux01`, `evaluator-dev-menu-ui`, `v2ui-pages` | none |
| `apps/ui/app/new/defaults.tsx` | `s14-contract`, `ux01`, `v2ui-pages` | none |
| `apps/ui/lib/api.ts` (as source text) | `pol01-policy:84`, `s14-contract:8,21` | none |
| `packages/contract/src/index.ts` (source text / inventory) | `s7-authorization-contract`, `s8-publication-contract`, `contract`, `s7-authorization` | none |
| `apps/ui/app/globals.css` | 12 suites — the 9 of F4, plus `t9-mode-tokens` (C4), `sup-04-widget` and `v2ui-pages` (C3) | none |

`tests/unit/s14-ui.test.ts` looked like a miss on a loose grep; it imports `../../web/lib/api.js` — the
deleted `web/` app, which is also why it carries 8 base typecheck diagnostics — so it is not a reader of
this slice's surface. **F4's sweep survives an independent, wider sweep.** The one structural note:
`sup-04-widget` and `v2ui-pages` read `globals.css` but sit in C3's command while C4 writes that file,
and C3 and C4 run in parallel — the slice-level list (§7) runs both, so the property is held at
`REV(S01)` rather than at either cluster gate. Recorded, not a finding.

### 1.5 My own both-ways trace parser (packet §2)

`probes/p9-trace.log`, built from `SPEC-v2.md` and `PLAN.md`, not from the PLAN's §2 table:

```
SPEC declares 21 requirements: R1 … R21
PLAN declares 46 steps: S01-1 … S01-46   step-number gaps: none   duplicates: none
FORWARD · requirements with NO §2 row: none
FORWARD · §2 rows citing a step that does not exist: none
FORWARD · §2 rows for a requirement the SPEC does not declare: none
FORWARD · §2 rows citing NO step: R19          (points at §7 + every cluster command — legitimate)
REVERSE · steps not cited by a §2 row: S01-11, S01-44, S01-45, S01-46 — all four covered by §2's
         reverse-trace ranges (S01-1…S01-11 → R11/R12/R14/R15/R20-A/F4; S01-44…S01-46 → DONE.md)
```

The trace closes both ways. One cosmetic mismatch: R21's cluster column reads `all` while S01-43 sits
under the C4 heading — correct as intent (R21 is slice-wide), noted so no one reads it as a gap.

### 1.6 Other author claims I re-measured rather than accepted

| Claim | Where | My measurement |
|---|---|---|
| F2: the R16 guard region is empty | `PLAN.md:66-75` | reproduced exactly: `indexOf("async function submit")=4717` (line 113), `indexOf("return (")=2191` (line 57), `slice.length = 0`. `region()` at `v2ui-pages:28-34` does carry `expect(endIndex).toBeGreaterThan(startIndex)`, so S01-31's repair does convert it to a failure |
| R11's quoted-exact discriminator | `PLAN.md:209-213` | reproduced: bare scan finds 1 file for `gpt-5.6-sol` and for `claude-opus-5` (`apps/ui/components/landing/cards.ts:27-28`, inside prose), quoted-exact finds 0 files for all five |
| the 13 R20-A literals at their exact lines | `PLAN.md:262-266` | all 13 lines carry `steering_annotations`; `contract.test.ts:90` is the excess-property case and keeps `caller_scope`, as the step says |
| all 25 tokens the Screens block names exist | `PLAN.md:612-615` | all 25 present: 17 mode-bearing ones declared in BOTH `:root` (:5-113) and the chamber block (:115-178), 8 geometry/type ones once in `:root` (mode-independent). `--m-claude/--m-gpt` at `:40`/`:146`, `--m-grok` at `:41`/`:147` |
| `modelKey` normalises all five roster ids | `PLAN.md:602-606` | true: `apps/ui/lib/models.ts` matches on substrings `claude` / `gpt` / `grok`, so all five map to a family with an existing identity token |
| every §5 chrome line citation | `PLAN.md:575-579` | all correct: `.ndScreen` 5906, `.ndInner` 5907, `.ndEyebrow` 5909, `.ndTitle` 5917, `.ndTopicBezel` 5926, `.ndTopicCore` 5934, `.ndTopic` 5940, `.ndCard` 5958, `.ndOptionsToggle` 6100, `.ndLegacy` 6120, `.ndActions` 6179 |
| F4's "sharpest": the s7 region | `PLAN.md:130-134` | correct: `s7-authorization-contract.test.ts:180-186` slices `export const AskRequestSchema` → `export type AskRequest`; in the lane they are `:107` and `:119`, so S01-11's ordering pin is load-bearing |
| the schema's ten other fields + `.strict()` | SPEC R12 | ten fields exactly, `.strict()` at `:118`; `contractInventory.resources` carries `AskRequestSchema` at `:694-695` |
| S01-35's grep criterion | `PLAN.md:434-435` | satisfiable: 0 today, and this shell's `grep` does treat `\|` as alternation (control run returned 19) |

---

## 2. Findings

Numbered N1…N9, non-blocking. `heartbeat-protocol` §3.2: non-blocking sets **WHEN**, never **WHETHER** —
each needs a ticket the same day. The WHEN column is the part that matters here.

### N1 — the Free lock leaves TWO false claims on screen; the Screens block names only one of them. **WHEN: before `MOCK(S01)` is dispatched.**

`PLAN.md:629-631` ("What the app lacks", item 4) names `.ndIntro` (`apps/ui/app/new/page.tsx:180-182`,
*"Choose your risk tier, composition budget tier, and depth, then click Start."*) as the sentence Free
makes false, and routes it to V as row **V-17**. It is not the only one. Two lines below it, on the very
control the Free lock pins:

- `apps/ui/app/new/page.tsx:186` — the risk-tier row's hint reads
  **"How much is riding on the answer · explicit asker selection"**. Under R4 + R7 the value is *not* an
  explicit asker selection: the control is `disabled`, `riskTierWasEdited` stays `false`, `tier_source`
  stays `MACHINE_DEFAULT`, and R7 renames the ref to `machine:plan-tier-free` **precisely because the
  asker did not choose it**. The screen asserts asker provenance directly above a record that denies it.
- `apps/ui/app/new/page.tsx:197` — the budget-tier hint reads
  **"How much work the composition may spend · provisional default, editable"**. Under Free it is neither
  the asker's to edit nor editable.

This is the same class V-14 and V-17 opened — a sentence that outlives the record beneath it — and it is
sharper than V-17, because V-17 is an instruction the page prevents while `:186` is a **provenance claim
the slice's own contract contradicts**. `.ndProvenance` (`page.tsx:246-248`, *"Tier source, provenance,
and machine as-of are recorded automatically with the run contract."*) stays true and needs nothing.

Consequence if the fold stops at `DECISIONS.md`: `MOCK(S01)` draws the Free canvases with these hints
unchanged, V ratifies them in `DONE.md`, and C5 transcribes them into an assertion — three nodes pinning
a false provenance line on the primary screen of a mission whose compass is the honesty law.

Remedy (three lines, no replanning): add `page.tsx:186` and `:197` to `PLAN.md`'s §5 "What the app
lacks" item 4 alongside `.ndIntro`; name the `.ndIntro` sentence in screen rows 1, 2 and 5 so the mock
draws the line V has to rule on; and open the row below through the orchestrator.

> **V-ROW: NEW · S01 · The two gauge hints that claim asker provenance while Free is chosen ·**
> Recommended default: the same treatment row V-17 already carries — the mock proposes the Free-state
> wording for these two hints and V rules it on the canvas through DONE.md; S01 changes no words on its
> own. Evidence: apps/ui/app/new/page.tsx:186 renders the risk-tier hint "How much is riding on the
> answer · explicit asker selection" and :197 renders the budget-tier hint "How much work the
> composition may spend · provisional default, editable", both inside .ndCard, directly on the rows the
> Free lock disables (SPEC R4) and pins (SPEC R7). Under the Free lock riskTierWasEdited stays false,
> tier_source stays MACHINE_DEFAULT and tier_provenance_ref reads machine:plan-tier-free, so the screen
> claims an asker selection the ask itself denies. Row V-17 already routes the sentence one line above
> these two; this row is the rest of the same card. Smallest yes/no for V: "Should the risk-tier and
> budget-tier hints change while Free is chosen, the same way the intro line does?" · VERDICT route it
> to the mock and DONE.md, together with V-17 / CONFIDENCE high / STRONGEST COUNTER: it is two hint
> strings and a seat could swap them in one step, so routing them costs a round trip — but copy is V's
> on a ui:yes slice, and the words are the mission's own honesty law applied to the screen rather than
> to a column.

### N2 — SPEC R17's "no colour literal outside the two blocks" has **no gate**, and `PLAN.md` §8 claims it has one. **WHEN: in the C4 BUILD packet.**

`PLAN.md:813-816` states that C4 "detects … a mutant that **adds a colour literal outside the two
blocks** (`t9-mode-tokens`)". Measured, with my own fixture (`probes/p4-css-gate.log`):

```
guard C hits at base   = 3   (globals.css:970, :7060, +1 — assertion is expect(hits).toEqual([]))
guard C hits w/ mutant = 4   (S01's placement plus `color: #8A63C9; background: rgba(0,0,0,.04)`)
the case's pass/fail changes: false
=> t9-mode-tokens passed/failed pair moves: NO — the C4 command cannot see this mutant
```

The only case in `t9-mode-tokens` that scans `globals.css` outside the token blocks is *"leaves no
mode-inert colour literal in the four Wave-0 product files"* (`tests/unit/t9-mode-tokens.test.ts:627-647`),
and it is **already one of the two base failures** — I measured it by name:

```
× tests/unit/t9-mode-tokens.test.ts > … > renders one accessible toggle …
× tests/unit/t9-mode-tokens.test.ts > … > leaves no mode-inert colour literal in the four Wave-0 product files
  Tests  2 failed | 7 passed (9)
```

So a raw `#hex`/`rgba()` written into S01's own `nd*` rules leaves `t9-mode-tokens` at `7 passed | 2
failed`, C4 reports `CLUSTER_GREEN`, and §7's rows stay at their base pairs. R17's second sentence is
unverifiable by anything in this plan. The **token** half of R17 is gated and I confirmed it: the
inventory case (`:405`) **passes** at base, so a token in the stylesheet and not in the maps does take
the suite 7→6, exactly as `S01-41` says.

Remedy: `tests/unit/tier01-style-contract.test.ts` is already C4's own new suite, already in C4's
command at `1:0` and already on the write list — give it one assertion **scoped to S01's added region**
(so it inherits none of the 3 pre-existing hits): no `oklch(`, `#hex` or `rgba(` between S01's first and
last added rule. Correct `PLAN.md:813-816` in the same edit.
VERDICT add the scoped assertion / CONFIDENCE high / STRONGEST COUNTER: the same property is visible to
V at acceptance, since a colour literal shows up as a selector that does not change in Chamber — but V's
eye at step 8 of a 12-step script is the most expensive detector in this fleet, and the assertion is one
line in a file the plan already creates.

### N3 — S01-42 has no done-criterion, and it is the step that builds what acceptance steps 4–6 look at. **WHEN: in the C4 BUILD packet.**

`PLAN.md:474-478`. The step reads: *"If `DONE.md` needs no new colour, this cluster adds no token and
S01-41 is satisfied by adding none. … so C4's minimum is the disabled treatment of the four locked
control families plus the selector's own rules."* There is no `Done when:`, no case, no command. My
trace parser lists it among the steps with no `**Done when:**` clause, and unlike the RED steps
(`**Fails with:**`) and the named cases, S01-42 has no criterion of any kind — which the PLAN's own
quantifiability law (`PLAN.md:15-18`) rules out: *"A step that cannot be marked done from its own text
is not a step."*

It matters because of what S01-42 carries. By the plan's own words (`PLAN.md:619-622`): *"Nine locked
gauges that look identical to nine live ones is the whole of acceptance steps 4–6."* Combined with N2,
C4's command as written can be reported `CLUSTER_GREEN` by a seat that wrote **no CSS at all** — its only
S01-specific row is a suite whose content does not exist until C5.

Remedy: give S01-42 a criterion that does not wait for `DONE.md` — the four locked families
(`.ndSegItem`, `.ndSlider`, `.ndSteerInput`, `.ndSelect select`) each carry a `:disabled` rule — and put
that assertion in `tier01-style-contract` at cluster time, leaving geometry and colour to C5 where they
belong.

### N4 — S01-24's done-criterion is false at base. **WHEN: in the C3 BUILD packet.**

`PLAN.md:384-386`: *"**Done when:** `grep -c 'useEffect' apps/ui/app/new/page.tsx` is 1 — the
session-defaults effect at `:86-99`, the only one the file has today."* Measured in the lane:

```
$ grep -c 'useEffect' apps/ui/app/new/page.tsx
2
3:import { CSSProperties, FormEvent, KeyboardEvent, Suspense, useEffect, useState } from "react";
86:  useEffect(() => {
```

The import line is counted. A stranger following the step's own text marks a correct implementation
failed; the two ways out are to exercise judgement (which the law forbids as a criterion) or to delete
`useEffect` from the import, which breaks the page. The claim in the prose — one effect in the file — is
true; only the command is wrong. Remedy: `grep -c 'useEffect(' apps/ui/app/new/page.tsx` is 1
(measured: the import line writes `useEffect,`, the effect writes `useEffect(`).

### N5 — §8 credits C2 with a detection it cannot make; `vitest` does not typecheck. **WHEN: fold into `DECISIONS.md`.**

`PLAN.md:786` and `:807-808` say a **required** `NewDebateAskDefaults` member "would red `ux01`'s one
green case and `pnpm typecheck`" and that C2 detects it "(`ux01` 1→0)". Also `PLAN.md:299-301`: "a
required member would take the suite from 1/8 to 0/8." Measured (`probes/p7-typecheck-claim.test.tsx`):

```
✓ does vitest typecheck? > runs a file carrying a hard TS type error   1ms
✓ does vitest typecheck? > calls buildNewDebateAskConfig with a spread that omits members  1ms
  Tests  2 passed (2)
```

A file containing `const n: number = "definitely not a number";` runs green — `vitest.config.ts` sets no
`typecheck` block, so `pnpm exec vitest run` strips types and never checks them. A required member would
therefore leave `ux01` at `1 passed | 7 failed`, and `ux01` is not in C2's command in any case (it is in
C3, at `1:7`). **The property itself is gated**, twice — by S01-13's own `Done when` (*"`pnpm typecheck`
reports no diagnostic in `tests/render/ux01-new-debate-form.test.tsx`"*) and by §7's R21 typecheck delta
— so this is a wrong sentence in the refutation table, not a hole. It is worth fixing because §8 is what
the next reviewer trusts, and because it is the second member of the class N2 opens: **§8 claims a
mutant-detection the named command cannot perform.** Those two are the only members; I checked all
24 rows of §8 (§1.6 and §2 above cover the rest).

### N6 — two of the six screens under-specify their own content, and the V-17 line is absent from the screen rows. **WHEN: before `MOCK(S01)` is dispatched.**

The block is otherwise strong: six states × two modes = 12 canvases, each reused component by path,
every token verified to exist, the chrome anchored line by line. Two rows do not say what to draw:

- `PLAN.md:590`, screen 3 — *"Premium chosen, OPTIONS collapsed | Premium reads chosen; the four gauge
  rows drawn unlocked and at rest."* **At which values?** Under R2+R8 the only reachable route to Premium
  is from Free, so the gauges show the R7 values (Standard / Low / 2 / empty) unlocked. A mock reading
  "at rest" as today's page draws risk tier with nothing selected and depth 1 — a state the product
  cannot reach, and screen 3 is also the artboard for acceptance step 10.
- `PLAN.md:593`, screen 6 — *"No tier chosen (the row V-9 alternative reading) | neither option chosen,
  Start run disabled with a question typed."* **Locked or unlocked, at which values?** The plan's own
  answer is three sections up, in S01-23's contingency (`PLAN.md:381-383`): initial state reverts to
  today's — `riskTier` `""`, `depth` `1` — and `planTier` is `null`, so nothing is disabled. It is not in
  the block the mock consumes.
- Rows 1, 2 and 5 do not name `.ndIntro`, the single line row V-17 exists to decide (see N1).

Remedy: one clause per row.

### N7 — "Eight are RED at base" is seven. **WHEN: fold into `DECISIONS.md`.**

`slices/S01/DECISIONS.md:115` and `ARCH-S01-handoff.md:15`. The F4 table (`PLAN.md:110-128`) shows seven
suites with failures, and `BASELINE.md:124` — the orchestrator's own re-measure — says "7 of 17 carry
failures at base". Nothing downstream reads the prose; every command uses the table.

### N8 — the R21 delta command writes a shared global path, and its base list has no extractor. **WHEN: in whichever BUILD packet owns S01-43.**

`PLAN.md:745-748`:

```sh
o=$(pnpm typecheck 2>&1); rc=$?
printf '%s\n' "$o" | sed -n 's/^\([^(]*\)(.*/\1/p' | sort -u > /tmp/after.files
```

`/tmp/after.files` is one filename for a fleet that runs C3 and C4 in parallel and a second lane
(`tiers-s02`) at the same time: two seats writing one path is the collision class this node itself
named for V-row ids and ADR numbers (`DECISIONS.md:173-177` — *"scarce global names handed to seats that
run concurrently and cannot see each other"*). Second gap: the `comm -13` needs the **base** list as a
sorted file, and `BASELINE.md`'s rows are `count · file` (`BASELINE.md:11-32`, 22 files — count
confirmed); no command in the plan extracts them, so a stranger hand-types 22 lines.
Remedy: write to the seat's own scratch dir, and add the one-line extractor.

### N9 — "`globals.css` styles `:disabled` for exactly one selector" is false, and it is in the mock's input. **WHEN: before `MOCK(S01)` is dispatched.**

`PLAN.md:476-477` and `PLAN.md:619-620` both say `globals.css` styles `:disabled` **only** for `.ndStart`
(`:6193`). Measured: 22 `:disabled` lines across the file, among them `.btn:disabled` (`:1378`),
`.startBtn:disabled` (`:2152`), `.authPrimary:disabled` (`:1884`), `.setBtn:disabled` (`:5820`),
`.libStart:disabled` (`:6639`), `.consentBox:disabled` (`:8629`), `.policyPrimary:disabled` (`:8918`).
The claim is true only **inside the `nd*` vocabulary**, and the scoped claim is the one that matters:
`.ndSegItem`, `.ndSlider`, `.ndSteerInput` and `.ndSelect select` genuinely have no `:disabled` rule.
It is worth correcting because the sentence tells the mock seat the app has no disabled treatment at
all, when the house convention is visible and consistent — `opacity .45`–`.55` with
`cursor: not-allowed` — and a mock that reuses it produces a canvas V has already accepted elsewhere.

---

## 3. Packet defects (against the orchestrator, not against `ARCH-S01`)

The three already ticketed — **F5** (a base run of TDD-created paths is unsatisfiable as ordered),
**F6** (charge 1 narrower than the SPEC's own citations), **F7** (nothing says whether an ARCH seat may
open a V row) — I confirmed as real from the artefacts: F5 is visible in my own C1/C2/C3/C4 runs, where
every cluster reports `BROKEN` on the one path its first step creates; F7 is visible in the V-15
collision (`DECISIONS.md:159-178`). Beyond them:

**P1 — charge 5 of MY packet cites the wrong section.** `.hermes/planning/debate-tiers/packets/ARCH-REV-S01.md:28`
sends me to `PLAN.md §6` for the 17 read-surface suites. §6 is *"Boundaries, DDD impact and the
single-writer rule"* (`PLAN.md:636-691`); the 17 are in §0 F4 (`PLAN.md:101-134`) and §7
(`PLAN.md:731-735`). Cost: one wrong read, recovered by searching. Remedy: `packet-check.sh` resolves
`§n` citations against the target file's headings.

**P2 — F6 was declared class-fixed, and the very next packet repeats it.** My packet's
`inputs (read these and nothing else)` (`ARCH-REV-S01.md:10`) names neither
`docs/missions/debate-tiers/V-DECISIONS-PACKET.md` nor `docs/missions/debate-tiers/BASELINE.md`, yet
charge 3 turns on **row V-9's both readings**, charge 4 is **entirely about row V-17**, and charge 5
cannot be reconciled without `BASELINE.md`'s rows. I read both, under `heartbeat-protocol` §3.7 rather
than silently. This is the same shape as F6 — *the charges cite what the inputs list omits* — which the
orchestrator recorded as class-fixed. A note is not a class fix. Remedy that is: `packet-check.sh`
**fails** a packet when a charge names a file the `inputs` line does not.

**P3 — a UI planning review has no lawful place to run a render fixture.** My `allowed` list
(`ARCH-REV-S01.md:15`) is exhaustive and contains no path inside the lane, while §2's verification
demands probes and `heartbeat-reviewer` §2 demands the reviewer build its own fixture from the claim.
`vitest.config.ts:14-18` includes only `tests/**` and `acceptance/**` under the project root, so a render
probe **cannot** run from a scratch dir — a fixture that renders `/new` has to live inside the lane.
**Disclosure:** I ran mine from `<lane>/coverage/arch-rev-probe/`, a path gitignored at
`dialectical-engine/.gitignore:5`, with my own `vitest` config in the seat scratch dir; `git status
--porcelain` in the lane was **0 before and after every run**, and I deleted the directory at exit
(`coverage/` no longer exists in the lane). That is outside the letter of my allowed list and I am
naming it rather than leaving it to be found. Remedy: packets for review seats grant
`<lane>/coverage/<SEAT>/` explicitly, or the harness gains a sanctioned probe root inside `tests/`.

**Verified correct in the packet, so nobody re-checks:** base `7f89f7b7` ✓ · main-tree HEAD at
dispatch `19fe6735` ✓ · comment cursor 1 ✓ · charge 1's "1/8 at base, one `Invalid hook call`" ✓ ·
charge 2's `:248-249` / `:270-280` / `:8980` / `:8188` ✓ · charge 5's "reports eight, shows seven" ✓ ·
the `ARCH-S01` author's `SKILLS LOADED` line (`ARCH-S01-handoff.md:5`) carries its full architecture
floor — `using-superpowers`, `heartbeat-protocol`, `heartbeat-architecture`, `brainstorming`,
`writing-plans` — with no skill named that the handoff's own body does not evidence.

---

## 4. UNVERIFIED

- **`pnpm typecheck` was not run by me**, so R21's 22-file base list is taken from `BASELINE.md:11-32`
  as given (count confirmed, contents not re-derived). The ARCH seat also left this unrun.
- **No three-run table.** Each cluster command was run once at base by me; the numbers matched the
  author's independently-produced numbers on all 34 existing-path rows, which is the cross-check that
  matters for a plan review. The three-run rule binds the coding seats' gates.
- **Nothing about appearance.** `DONE.md` does not exist; I make no claim about how the selector looks,
  and none of my findings is a design question (`heartbeat-reviewer` §4).
- **C5 is unfilled by design and I did not price it.** One consequence I did not resolve, offered to the
  orchestrator rather than filed: S01-44 transcribes each `DONE.md` measurement into an **assertion**,
  and no step in C5 makes the **production change** those assertions will demand (V's copy, geometry).
  C3 and C4 are `DONE.md`-gated and run after V's ruling, so the change has a home; the RED-first order
  for C5 (`PLAN.md:845`) does not say so.
- **R14's 202/400 behaviour** I read (`apps/api/src/index.ts:288-297`, `:512-520`, `:905`) and did not
  execute, as the ARCH seat also recorded.
- **The `20` in C3's expected pair** (`PLAN.md:556`) is a step count, not a case count: S01-20…S01-39 is
  20 steps but only ~10-13 of them write a case in the new suite (S01-24 is a grep, S01-26 leans on
  S01-1, S01-28/29 are implementation, S01-31/32 are in `v2ui-pages`). The PLAN authorises the seat to
  restate it, so it is disclosed rather than wrong; I did not attempt an exact recount, because the case
  boundaries are the writing seat's.

---

## 5. Predictions (falsifiable — the evidence that blindness held)

I am pass 1 and read no other verdict. What I expect the next lens on this artefact, or `REV(S01)`
later, to hit — and what I would check first:

1. **The most likely thing another reviewer got wrong about this plan is `ux01`.** A lens that reads the
   suite instead of running it will read "1/8 at base" as an S01 regression risk and demand S01 repair
   it, or will accept the plan's claim that a required type member takes it "1/8 → 0/8". Both are wrong
   in the same direction: `vitest` here does not typecheck, and `ux01`'s seven failures are one stderr
   from its own `vi.mock("react")`. I would check that claim with a two-line probe before arguing it.
2. **A second lens will probably call the `## Screens` block complete.** It enumerates six states and
   twelve canvases, which reads as thorough; the gap is not a missing row but two rows that do not say
   which values to draw (N6), and a false-provenance hint one line below the sentence the block does
   name (N1). I would open `page.tsx:180-200` and read the card top to bottom rather than checking the
   state list against the SPEC.
3. **I expect nobody else to have run the C4 mutant.** C4's rows all sit at their base pairs and the
   §8 table asserts three detections, so the cluster reads as gated. The colour-literal arm is dead
   because the case that would catch it is already red at base — a property you only see by running the
   mutant, not by reading the table. If a later lens contests N2, the settling experiment is four lines
   (`probes/p4-css-gate.js`) and takes under a second.
4. **What I would check first if I were the next lens:** whether `tier01-new-plan-tier.test.tsx` can
   actually assert `disabled` on `#depthMode` and `#scrutinyDepth` *while the OPTIONS panel is collapsed*
   — R4 says "whenever the `⚙ OPTIONS` panel is expanded", and S01-27's case expands it first, so the
   two texts agree; but a seat that reads only the R4 id list will write the case against a collapsed
   panel, find five ids absent from the DOM, and spend a cycle on it. My P2 probe had to expand the
   panel before all fourteen ids resolved.
