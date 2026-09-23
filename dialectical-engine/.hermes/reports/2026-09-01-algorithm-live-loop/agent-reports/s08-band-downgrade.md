MERGE COMPLETE — S08 at f3c7f74f (integration 44836ecf merged in; post-verdict, NOT a rework round) · comments read through: s08-judge-verdict-2026-09-02
report sha256: 6e724412efff02dbc9d63f7b42299385848dbcb4db13ef38573f13178c66c59e
# S08 — T12 band over cited nodes + T13 honest downgrade

Seat `opus-s08-w8` · lane worktree `.worktrees/lane-s08` · branch `lane/s08`
Base `e040b1ee` (TINT1 + T6 + S06) · reviewed tip `e60e0296` ·
**MERGED TIP `f3c7f74f`, tree `4c074873`** (integration `44836ecf` merged in —
TINT1 + T6 + S06 + T7). Never pushed. Four commits (`5940b058` r1 · `ac7f4832`
r2 · `e60e0296` r3 · `f3c7f74f` the merge). `core.fileMode=false`.

`git diff --summary e040b1ee..HEAD | grep -c "mode change"` = **0** (J16(b)),
`logs/s08/r3-mode-change-count.log`.

**§14 is the integration merge** — the judge's PASS was given on `e60e0296`, and
the merge that follows it carries no rework. **r4 changes NO product code**: its
tip, tree and diff are exactly r3's; r4 is evidence only (§13).

**D41 comparator at the MERGED tip** (`logs/s08/stamp-check-r5.out`):

```
$ bash .../tools/stamp-check.sh .worktrees/lane-s08/dialectical-engine ".../logs/s08/r5-"
TIP=f3c7f74fd449ec58ca77f69bac6d35862639d18c  (resolved with git -C .worktrees/lane-s08/dialectical-engine)
records compared: 29 · failures: 0
OK: every record stamps the filed tip
```

**D41 comparator at the reviewed tip `e60e0296`** (`logs/s08/stamp-check-r4.out`):

```
$ bash .../tools/stamp-check.sh .worktrees/lane-s08/dialectical-engine ".../logs/s08/r4-"
TIP=e60e0296f3702e26b40d378f3bdf5cfff7f669e7  (resolved with git -C .worktrees/lane-s08/dialectical-engine)
records compared: 22 · failures: 0
OK: every record stamps the filed tip
```

r3's prefix still passes too (`logs/s08/stamp-check-r3.out`: 26 records, 0 failures).

> **r4 = rework 3/3, EVIDENCE ONLY — the last authorized round.** Every one of the
> 21 (OLD,NEW) pairs is re-run from the unchanged clean tip through the mission's
> own `tools/mutate.sh`, so the tool authors each transcript instead of this seat
> reconstructing one. §13 is the whole of r4, and it also corrects a
> characterisation of two mutants that travelled into the orchestrator's summary.
>
> **r3 = rework 2/3, codex r2's two blocking and four smaller findings.** §12 is
> the whole of r3.
>
> **r2 = rework 1/3, board F30 only.** The orchestrator accepted the omission as
> its own packet defect and re-dispatched F30 as an AMENDMENT. §11 below is the
> whole of r2; §§1-10 are r1's record, unchanged and still filed. r1's rulings on
> F-S08-1 (now **J23**: the production widening belongs to T9, the engine change
> stands as T12's DoD) and F-S08-2 (ticketed to T9's review) are recorded here as
> answered, not re-argued.

---

## 1. What changed

One commit, two files, both inside the lane:

| file | change |
|---|---|
| `packages/serve/src/index.ts` | the CITED-set derivation; the band basis and the downgrade predicate both read it; the empty-cited loud stop |
| `tests/unit/t12-t13-band-basis.test.ts` | new — 11 assertions, 9 D24 mutants behind them |

`git diff --name-only e040b1ee..HEAD` is exactly those two paths. Neither
`web/`, `apps/ui`, `packages/contract` nor `packages/kernel` is touched, so
**D14/D16 do not trigger** and no surface-local gate is owed. No register row is
read that was not already loaded, so **packet step 3 (entry point) does not
trigger**: `apps/runner/src/main.ts` and `apps/runner/src/dev-runner-policy.ts`
are unchanged and no new family, claim-time stop or entry-point assertion is
owed. No public wire change: `band_ceiling.basis` keeps its shape
(`{LOOKED_UP, RAN, REASONING}` counts) — only *which nodes are counted* moves.

### The engine change, stated as one property

> The way-of-knowing basis the confidence band reads, and the predicate the
> honest downgrade reads, are the **same set**: the nodes the composed statement
> **cites**, restricted to the segments conformance actually **verified**.

Both previously read `input.nodes.filter(node => node.loadBearing)` — the serve
set. Two exclusions, each with its own reason:

- a served node the statement never mentions did not carry the answer, so it may
  not lift the band or hold off a downgrade;
- a citation inside a segment conformance never sampled was checked by nobody,
  so it is not evidence either — the goal's own parenthesis, *"conformance-verified
  set"*.

Coupling both to one set is the point of T13 sitting beside T12: an answer's
**shape** and its **confidence** can no longer describe different evidence.

### The empty case — a new loud stop

`[].every(...)` is `true`. A statement citing no verified node would have
downgraded itself on a vacuous truth and only then hit
`BAND_CEILING_BASIS_EMPTY` from the wrong limb, after the form was decided.
`SERVED_STATEMENT_CITES_NO_VERIFIED_NODE` (`packages/serve/src/index.ts:587-590`)
refuses first. Free-form `TypedDomainError` code — not a `ConditionMark`, so no
J5/J11 vocabulary change and no forced UI completion.

**Blast radius, measured not assumed:** every composer fixture in the corpus
carries at least one segment with `node_refs: ["primary"]` — 11 occurrences in
`tests/integration/database.test.ts` and 3 in `acceptance/**` (`ceremony`,
`mono-panel`, `panel-multi-maker`), counted with
`grep -c 'node_refs: \["primary"\]'` — so the stop fires on zero existing runs. Live exposure: `node_refs` is
`z.array(z.string().trim().min(1))` (`apps/runner/src/index.ts:107`), so a
composer returning **every** segment with empty `node_refs` now stops loudly
where it previously served with a band over the served root. That is the honest
direction (goal 26/39-40) and it is the one behaviour change with live reach.

---

## 2. THE DECISION THE PACKET ASKED FOR — read this before the verdict

The packet: *"T10 replaced the SELECTION, not this node set: decide and document
whether the cited set now comes from the conformance-verified citations rather
than this builder."*

**Decided: yes — the basis now comes from the conformance-verified citations.
`buildFixedSingleRootServeNodes` is no longer the basis source.**

**And the goal's premise about it is false at `e040b1ee`.** T12's text says the
builder is the one "which T10 replaces". T10 replaced
`selectServedRootByStrength` (which root is served). The builder still exists
(`apps/runner/src/index.ts:1292`), is still on the production path (`:2724`) and
still returns exactly one node by its own typed invariant
(`FIXED_SINGLE_ROOT_SERVE_VIOLATED`, DR-159 B2-A).

Consequence a reviewer must weigh, stated plainly rather than buried:

- **In the engine**, the forced 0/1 is gone. The gate accepts any cited set, and
  a mixed-way citation yields fractional shares that the register's cut reads
  (proved end-to-end: basis `{LOOKED_UP:2, RAN:0, REASONING:1}` → share 1/3 →
  the REASONING ceiling stops firing and the band stays at the top band).
- **In a production run**, shares are still 0/1 today, because the composer may
  only cite `"primary"` (`apps/runner/src/index.ts:3188-3190`) and that maps to
  the single served root. The moment the served node set widens, the shares
  become real **with no further edit to the band**.

Widening it is **F-S08-1** below. I did not do it in-lane: it edits the composer
prompt, the `node_refs` mapping and `availableNodes`, and it breaks DR-159 B2-A —
a product change on T9's composition seam, which my contract forbids me, and a
ruling rather than a worker's judgement.

T13 is written against the **current** composition seam at `e040b1ee`, as the
packet directs; T9 (lane/s07, unmerged) rewrites that path and the merge is
handled later.

---

## 3. Class enumeration (packet: "ENUMERATE THE CLASS FIRST")

Evidence: `logs/s08/class-enumeration.log`.

**Every consumer of the way-of-knowing tally.** The tally exists **exactly
once**, and it has exactly one consumer:

| site | role |
|---|---|
| `packages/serve/src/index.ts:634-642` | the tally itself (was `:583-585` at base) — **changed** |
| `dependencies.applyBandCeiling` → `deriveBandCeiling` (`:246-296`) | the only consumer; divides each count by the total against the register's cut matrix |
| `validateBandCeilingDecision` (`:310`) | re-checks the decision printed the derived basis (`BAND_CEILING_BASIS_MISMATCH`) |
| `apps/runner/src/index.ts:3255-3258` | the production wiring of that dependency to `servePolicy.bandCeiling` |

The near-neighbour that reads a way of knowing but is **not** the tally:
`packages/serve/src/index.ts:601` — Q51's locator limb. Left on the load-bearing
set on purpose (F-S08-2).

**Every reader of the band** (`confidence_band` / `band_ceiling`). **Corrected
in r3 (codex r2 N2, D34): this is the COMPLETE set, produced from
`logs/s08/class-enumeration.log`, not a hand-written summary. The r1/r2 filing
omitted the five marked ✚ plus the contract client.**

| file | role |
|---|---|
| `packages/serve/src/index.ts` | derives the band, persists it, blanks both on eviction |
| `packages/db/src/schema.ts:503-504` | the persisted columns |
| `packages/contract/src/index.ts` | the public wire shape (+ the both-or-neither invariant) |
| ✚ `packages/contract/src/client.ts:264` | the typed client's view of `confidence_band` |
| `apps/runner/src/index.ts` | the mono cap, the F30 arm, the disputed arm, the superseding projection |
| `apps/runner/src/dev-runner-policy.ts` · `apps/runner/src/main.ts` | the candidate band and the ceiling row as loaded policy |
| ✚ `apps/api/src/publications.ts:58,162,335,350` | the published-debate projections |
| `apps/ui/components/AnswerHonestyDrawer.tsx:112-119` | prints the basis counts `LOOKED_UP / RAN / REASONING` verbatim — the reason F5's RAN bucket must not be deleted |
| `apps/ui/app/page.tsx` · `apps/ui/app/public/debate/[id]/page.tsx` | the answer surfaces |
| ✚ `web/lib/v3Presentation.ts:19,54-55,91` | maps band + ceiling into the legacy presentation shape |
| ✚ `web/components/VerdictBanner.tsx` | the legacy banner |
| ✚ `web/app/page.tsx:47` · `web/app/public/debate/[id]/page.tsx:17` | the legacy public surfaces |
| `packages/memory/src/index.ts:183-220, 727-761, 824-852` | the prior snapshot |
| `packages/critique/src/index.ts:345-354` | `confidenceBandCapRequired` — a band-cap PRODUCER, listed because the artifact lists it |

None of these shapes moved: `band_ceiling.basis` keeps its three counts and
`confidence_band` keeps its type. Producers of the band value are
`applySingleLineageBandCap`, the F30 arm (§11), the disputed-review step-down and
`deriveBandCeiling`'s ceiling.

**Every caller of `buildFixedSingleRootServeNodes`:**
`apps/runner/src/index.ts:2724` (production, unchanged) and
`tests/unit/pro01-runner-tree.test.ts:101,110` (unchanged, still green).
It is no longer referenced by the basis — only by the comment that records why.

---

## 4. RED frames — RED before GREEN on every step

`logs/s08/t12-t13-RED-on-base.log` — the new file run at **`e040b1ee`, clean
tree**, before any source change. **6 failed / 5 passed (11)**, exit 1.

| # | assertion | RED on base? | why |
|---|---|---|---|
| 1 | cited non-load-bearing node counted → **fractional** shares (T12 DoD sentence 1) | **RED** | captured: `A reasoning answer requires both a hypothesis and a research-plan segment` — see the note below |
| 2 | load-bearing node the statement never cites is **not** counted | **RED** | base counts it |
| 3 | homogeneous multi-node citation **stays 0/1** (T12 DoD sentence 2) | green both sides | preservation guard; pinned by mutant **m6** |
| 4 | citations of a segment conformance never verified are excluded | green both sides | base agrees by a different rule; pinned by **m2** |
| 5 | the register cut reads the fractional share (end-to-end, real `deriveBandCeiling`) | **RED** | captured: `A reasoning answer requires both a hypothesis and a research-plan segment` — see the note below |
| 6 | the **RAN** bucket survives (board F5 do-not-tidy) | green both sides | preservation guard; pinned by **m5** |
| 7 | all-cited-REASONING → **DOWNGRADED + hypothesis + plan + band** (T13 DoD) | **RED** | base SERVES a verdict: an *uncited* looked-up node suppresses the downgrade |
| 8 | a **cited** looked-up node keeps the verdict form | **RED** | captured: `A reasoning answer requires both a hypothesis and a research-plan segment` — see the note below |
| 9 | a statement citing no verified node **stops loudly** | **RED** | base returns DOWNGRADED on `[].every(...)` |
| 10 | mono-maker cap steps down **exactly one** place in the sealed vocabulary | green both sides | "step-down retained"; pinned by **m7** |
| 11 | mono-maker cap stops loudly at the floor | green both sides | pinned by **m8** |

GREEN: `logs/s08/t12-t13-GREEN.log` (pre-commit) and
`logs/s08/t12-t13-GREEN-tip.log` (**at the filed tip `5940b058`, clean tree**,
per D27) — **11/11 passed**, exit 0.

**Why rows 1, 5 and 8 fail with a segment-count error (codex r2 N3 — rewritten
FROM the captured output, D34).** My r2 filing described these three as basis and
form comparisons. The log says otherwise, and the log is right. Each of those
three fixtures composes a SINGLE segment. On the baseline the basis and the form
are read from the LOAD-BEARING set, which in each fixture is all-REASONING, so
the baseline enters the downgrade branch — and that branch requires two
segments, so it throws `COMPOSITION_CONTRACT_ERROR` before any band or form
assertion is reached. The RED is real and it is caused by the defect under test
(the baseline choosing the wrong node set), but the recorded failure is the
reasoning-answer segment-count validation, not a basis comparison. Rows 2, 7 and
9 do fail on their own assertions, and the captured text is quoted in the table.
The full generated mapping is `logs/s08/t12-t13-RED-on-base.log`.

Five assertions are green on both sides **by design** — they are the DoD's own
"correctly remains 0/1" and "step-down preserved" clauses, which are
*preservation* obligations. None of them is left unpinned: each is killed by a
named mutant below.

---

## 5. Suites (all at the filed tip `5940b058`, tree `0b2039f6`, D27 order)

Order of work: every content change made → **committed once** → every gate run
against that tip. No record here names a tip other than the filed one.

**Root typecheck** — `logs/s08/root-typecheck-tip.log`, `npm run typecheck`,
**exit 0**.

**Focused cluster ×3, worst run wins** — `logs/s08/cluster-three-runs-tip.log`.
Cluster: `t12-t13-band-basis`, `serve`, `serve-s05`, `pro01-runner-tree`,
`t4-way-of-knowing`, `t10-served-root-selection`, `t11-verdict-label`,
`t06-review-teeth`, `judgement-s04`, `register-s04`.

| run | result | failures |
|---|---|---|
| 1 | 112 / 113 | `pro01-runner-tree > stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path` |
| 2 | 112 / 113 | same |
| 3 | 112 / 113 | same |

**Worst run = 112/113**, identical across all three (no flake inside the
cluster). The single failure is **PRE-EXISTING, not mine**: it is present in the
base zone run below and was already recorded in S06's base failure set
(`logs/s06/zone-failure-set-BASE.txt`, 2026-09-02). It is a
`UNEXPECTED_CLIENT_QUERY:SELECT pg_try_advisory_lock(...)` stub gap, untouched by
this lane.

**Zone, set-equality by name vs `e040b1ee`** — zone = `tests/unit` +
`tests/architecture` (S06's zone definition).

| | file | tests | failures |
|---|---|---|---|
| BASE `e040b1ee` (detached, clean tree, my file absent) | 12 failed / 144 passed (156) | **1297 / 1311** | 14 names |
| TIP `5940b058` | 14 failed / 143 passed (157) | **1305 / 1322** | 17 names |

Total grows by exactly 11 = my new file. `comm` of the two name sets:

- **only at BASE: (empty).** Nothing I changed turned a red green by accident.
- **only at TIP: 3 names**, none of them in the serve/band/runner class:
  `mfa-ui > mounts the one-shot consumer…`,
  `registration > S3c B4 keeps the isolated production RSS curve below the published measured bound`,
  `s10-mail-channel > writes only fixed event copy with the stable opaque message id`.

All three are the **F22 load-flake family** (the RSS-curve name is F22's own
member). J19's F22 extension rules the discrimination is **by solo pass, never by
load number**: re-run solo at the tip, `logs/s08/tip-only-solo.log` —
`mfa-ui` 3/3 exit 0, `registration` 58/58 exit 0, `s10-mail-channel` 1/1 exit 0.
**Zone set-equality holds** once the flake family is discriminated by J19's own
method. Host note: four other seats shared this machine during the zone runs, per
the orchestrator's HOST RELEASED message.

**Not run and why:** no full `pnpm test` (D13/D15 — the authoritative run is the
judge's on the integration branch; the orchestrator's release was for focused and
zone runs only). `tests/integration/**` and `acceptance/**` were not executed
(embedded-postgres / real-CLI spend; J18 routes acceptance execution to the W12
flagship ceremony). Fixture reachability for those paths was established by
reading every composer fixture instead — §1's blast-radius measurement.

---

## 6. Refutation evidence (contract §2 · D24 + ADDENDUM + ADDENDUM-2)

Harness `logs/s08/mutant-harness.py`, index `logs/s08/mut-INDEX.md`, one
transcript per mutant `logs/s08/mut-*.log`.

The campaign starts from the **clean committed tip**: it aborts if
`git status --porcelain` is non-empty before the first apply (ADDENDUM-2), and
also aborts if the target does not match the clean sha before each apply. Each
mutant is an **(OLD, NEW) pair**; the transcript's token is the **NEW** half,
printed verbatim between `<<<TOKEN` and `TOKEN>>>`. **pre=0 → applied>0 →
restored=0 are hard gates that abort the campaign**, not fields. Every transcript
carries the mutation diff, the discriminating result, the restore command, the
`git status --porcelain` after restore, and **sha256 on both sides** plus the
restored sha checked equal to the clean sha. `git status --porcelain` is empty
after the campaign.

| mutant | property it attacks | gates | result | killed by |
|---|---|---|---|---|
| m1 basis reads load-bearing | the basis counts CITED nodes, not the serve set | 0→1→0 | **RED** ✔ | tests 1, 2, 5, 7 |
| m2 verified filter dropped | only CONFORMANCE-VERIFIED citations count | 0→1→0 | **RED** ✔ | test 4 |
| m3 downgrade reads load-bearing | the downgrade fires on the same cited set | 0→1→0 | **RED** ✔ | tests 1, 5, 7, 8 |
| m4 empty-cited stop removed | an uncited statement stops loudly, not vacuously downgrades | 0→1→0 | **RED** ✔ | test 9 |
| m5 RAN bucket deleted | the RAN bucket stays (F5 / J4 do-not-tidy) | 0→1→0 | **RED** ✔ | test 6 |
| m6 homogeneous basis collapsed | a homogeneous multi-node basis is COUNTED, not collapsed to 1 | 0→1→0 | **RED** ✔ | test 3 |
| m7 mono-maker step-down removed | the cap steps down exactly ONE place | 0→1→0 | **RED** ✔ | test 10 |
| m8 mono-maker floor stop removed | the cap stops loudly at the floor | 0→1→0 | **RED** ✔ | test 11 |
| **n1 NEIGHBOUR** — equivalent membership test (`Set.has` → `[...].includes`) | must **NOT** be caught | 0→1→0 | **GREEN** ✔ | nobody — as designed |

Every one of the 11 assertions is killed by at least one mutant; none pins only
its demo mutant (m1 and m3 are distinct halves of the same edit and are killed by
overlapping-but-different sets). n1 confirms the assertions pin **which nodes are
counted**, not the expression that computes membership. m7/m8 mutate
`apps/runner/src/index.ts`, so the "mono-maker step-down retained" clause is a
real pin rather than a green-by-default claim.

---

## 7. Constants and choices, disclosed

- **No band value is declared anywhere in this lane.** The test reads T16's
  sealed vocabulary — `ENGINE_BAND_ORDER` from `@debateai/register` — and derives
  the top band and the ceiling band from it by index (J1: no consumer carries a
  band value). The dev deployment's own cut (`REASONING ≥ 0.5` → `CAPPED`,
  `apps/runner/src/dev-deployment-register.ts:250-263`) is mirrored as a
  **test-layer** fixture, named `test-layer:` throughout, exactly as
  `serve-s05.test.ts` already does.
- **`state !== "NOT_SAMPLED"`** is my reading of the goal's "(conformance-verified
  set)": `JUDGED` and `SAMPLED_PASSED` are verified, `NOT_SAMPLED` is not. In the
  current node model a segment that cites a load-bearing node is always `JUDGED`,
  so the qualifier only bites on citations inside unsampled segments — precisely
  the unchecked ones. Pinned by m2. **A reviewer may read the parenthesis the
  other way**; it is the second thing to attack.
- **`SERVED_STATEMENT_CITES_NO_VERIFIED_NODE`** — new free-form
  `TypedDomainError` code. Not a condition mark, not a union member, no forced UI
  completion.
- **RAN kept** with the reason at the site (F5 / J4).
- **Q51's locator limb left on the load-bearing set**, with the reason at the
  site (F-S08-2).

---

## 8. Packet defects (contract §1 — reported, not absorbed)

1. **The packet omits board F5**, whose `status` is `ready (consumed at S08
   dispatch)` and which DECISIONS **J4** routes to the S08 packet by name ("F4→S08
   packet carries T6's do-not-tidy guard in spirit"). I found it on the board and
   honoured it anyway (it is a *don't*): the RAN bucket survives, with mutant m5
   behind it.
2. **The packet omits board F30**, whose route reads: *"the S08/T12 dispatch
   packet carries an explicit input — consume T3's recorded degraded-panel
   step-down in the band computation (FULL→CAPPED per T16's mapping); test the
   degraded path end-to-end."* That sentence is not in my packet.
   **I did NOT implement it.** It is added behaviour with its own tests; it
   interacts with the step-down consumer T6 already built on a *different*
   predicate (`servedCandidateConfidenceBand`, `apps/runner/src/index.ts:3110-3132`,
   which consumes the mono-maker cap and the *disputed-review* step-down but not
   the PANEL-DEGRADED record); and taking it unasked is the fan-out contract §4
   forbids. **Proposed disposition:** re-dispatch as an explicit input to this
   seat (rework round) or as its own ticket — the enforcement gap F30 names is
   still open and the record should not lose it a second time.
3. **The goal's T12 premise is stale** — "`buildFixedSingleRootServeNodes` …
   which T10 replaces" is false at `e040b1ee` (§2). Not an edit to the frozen
   SPEC (mission law D7); recorded as a finding.
4. The packet's anchors were re-derived accurately: `bandOrder` `:224`,
   validation `:252-274`, `WAYS_OF_KNOWING` `:240`, the tally at `:585` (goal
   cites `:559-568`), T13's arm at `:555-565`, terminal union `:368`,
   `selectServedRootByStrength` `:1237`, builder `:1292`, call site `:2724` — **all
   verified present at `e040b1ee`.** No defect there.

---

## 9. Findings (contract §5 — named, not fixed)

- **F-S08-1 (blocking the DoD's headline sentence, not this lane) — the served
  node set is still single-rooted, so production shares are still forced 0/1.**
  `buildFixedSingleRootServeNodes` (`apps/runner/src/index.ts:1292`, call site
  `:2724`) returns exactly one node under DR-159 B2-A, and the composer may only
  cite `"primary"` (`:3188-3190`). After this lane the band no longer *reads* that
  set, so the fix is now cleanly separable: widen the served node set and the
  composer's `availableNodes`/`node_refs` mapping, and the fractional shares
  appear with no further change to the band. That edit is a product change to
  T9's composition seam and breaks a DR-ruled invariant — **it needs a ruling**,
  and my packet's stop condition ("if the cited-node set requires a public wire
  change beyond J17's class — ask, do not guess") is exactly why I stopped here.
- **F-S08-2 (non-blocking) — Q51's locator limb now reads a different set from
  the form and the band.** `packages/serve/src/index.ts:601` still blocks on
  *load-bearing* nodes with a null locator, while `:605` (form) and `:634-642`
  (band) read the cited set. A cited, non-load-bearing `LOOKED_UP` node with no
  locator therefore reaches a served verdict unchecked. **The hole pre-exists this
  lane** (the same node was invisible to the limb at the baseline); what changed
  is that such a node now carries weight. Widening the limb is a behaviour change
  to a blocking gate that the goal's S08 text does not authorise — ticket it.
- **F-S08-3 (non-blocking, mine, disclosed) —
  `SERVED_STATEMENT_CITES_NO_VERIFIED_NODE` is a new loud stop on a live path.**
  Zero existing fixtures reach it (measured, §1), but a composer returning every
  segment with empty `node_refs` — schema-legal — now stops instead of serving.
- **F-S08-4 (non-blocking, tooling) — zsh does not word-split unquoted parameter
  expansions.** `FILES="a.ts b.ts"; vitest run $FILES` passes ONE argument;
  vitest reports "No test files found" and exits 1, which reads exactly like a
  real failure. Cost this seat one wasted 3-run cluster. **Not appended to
  `.hermes/TOOLING-TRAPS.md`**: that file is outside my ticket's exhaustive
  `allowed` list and was already modified by another session at my session start.
  The orchestrator should carry it across.

Nothing was fixed out of contract. Nothing in another lane's code was touched.

---

## 11. r2 (rework 1/3) — board F30: the served band ENFORCES T3's recorded step-down

### 11.1 The defect, precisely

T3's confirm-item 5 records, on every reduced judgement, that a panel collapsed
to the author's own voice and that the certainty band therefore steps one place
down through T16's sealed row —
`ledger.reduced_judgement.disagreement.certaintyEffect = "DOWNGRADED"`,
`certaintyBand = oneStepDown[candidate]`. Nothing consumed it:
`serve.answer.confidence_band` still shipped the candidate band. A downgrade
that is **recorded and never applied** is the silent-degradation shape the goal
repeals — and the receipt actively disagreeing with the served answer is worse
than either alone.

### 11.2 What landed

`ac7f4832`, three files: `apps/runner/src/index.ts` (the arm + its wiring),
`tests/unit/t12-t13-band-basis.test.ts` (+7 assertions), and
`acceptance/panel-multi-maker.test.ts` (the end-to-end leg, §11.5).

`applyPanelDegradedBandStepDown` (`apps/runner/src/index.ts:1442-1513`, doc comment from `:1442`, declaration at `:1471`) is a
pure, exported decision: given the served root id, the recorded degradations and
the sealed `oneStepDown` map, it returns the band, the effect, and the
provenance pair. The move itself is `applyDeclaredDisagreement`'s over the
sealed mapping — **no band value is chosen in code** (J1). It is wired into the
serve-gate band chain in `executeWorkItem` (`:3194-3213`), between the
mono-lineage cap and the disputed-review arm.

### 11.3 The scope decision, stated so it can be overturned

**Ruled by me, disclosed for review: the SERVED ROOT's own record steps the band.**

- The band is the answer's confidence in the served position, and **J16(a)**
  reads every answer-scope quantity from the served root — the same node T11
  takes its dispersion from. A band sourced from a different node than the label
  would be two answer-scope quantities with two different subjects.
- T3 records the degradation per node with `affectedNodeIds: [subjectRef]`. A
  panel that degraded on a node which never reached the answer stays disclosed
  **on that node** and does not restate the served claim's confidence.
- The disputed-review arm beside it is **run-scope on purpose**, and the reason
  is written at the site: a dispute is a declared disagreement about the
  debate's *content*, wherever declared; a degraded panel is a fact about how
  *one node's* judgement was assessed.

Only the single-voice collapse steps the band. `PANEL-PARTIAL` means members
were lost, not that the author graded itself, and T3 records no step-down for
it — inventing one here would be this file deciding a band.

The alternative reading (run-scope, downgrade more often) is defensible. It is
**pinned by a test and by mutant f1**, so overturning it is a one-line change
whose test says exactly what changed.

### 11.4 RED frames — RED before GREEN

`logs/s08/f30-RED-on-r1-tip.log`, run at the **r1 tip `5940b058`** (so r1's work
is already in and only the F30 arm is missing): **7 failed / 11 passed (18)**.

| assertion | RED? |
|---|---|
| steps the served root's band down one place through T16's sealed row | **RED** |
| names WHAT decided (sealed row as predicate, the root's own mark as observation) | **RED** |
| leaves the band alone when no panel degraded | **RED** |
| leaves the band alone when the degraded panel is not the served root's | **RED** |
| does not fire on `PANEL-PARTIAL` | **RED** |
| the floor is a fixed point | **RED** |
| **the arm is reachable from the declared production entry points** | **RED** |

The last one is the wiring pin, in the S06 B1 shape: it runs the repo's own
`auditSurfaceReachability()` and asserts `applyPanelDegradedBandStepDown` is
reachable from `apps/runner/src/main.ts`. **Declared-but-uncalled is not
reachable**, so an arm that were exported and never wired — the F30 defect one
level up — fails it. Mutant **f4** restores exactly that defect and it goes RED.

GREEN at the committed tip: `logs/s08/r2-GREEN-tip.log` — **18/18**, exit 0.

### 11.5 The end-to-end leg — written, typechecked, NOT executed by me

`acceptance/panel-multi-maker.test.ts` confirm-item 5 is T3's own degraded-panel
test and the one F30 cites. It already drives a real M=2 run in which every
non-author voice fails, and already reads T16's row into `controls`. Added: a
`GET /v1/runs/:id/answer` and three assertions — the served
`confidence_band` **is** `controls.oneStepDown[ACCEPTANCE_CANDIDATE_BAND]`, is
**not** the candidate band (a real move, not the identity), and the answer
carries `PANEL-DEGRADED-SINGLE-VOICE` so the band and the mark that explains it
agree. The expectation is read from the sealed row, never a band literal.

**Status, stated plainly: written and typechecked (root `tsc` includes
`acceptance/**` since TINT1, J16(c)), not executed in-lane.** J18 routes
acceptance execution to the W12 flagship ceremony; the host also carries a
concurrent full batch suite, and D13 exists because concurrent heavy suites
manufacture failures that belong to nobody. A W12 failure attributable to this
assertion is this seat's micro-fix, per J18.

I considered the integration home instead (`tests/integration/database.test.ts`,
where T6's disputed-band sibling is pinned end-to-end) and rejected it: a new
degraded-panel fixture needs the secondary maker's assessments to fail to parse
in the right queue order, and an unexecutable new fixture in the judge's D15
batch is worse than none. Recorded in the self-report §10.

### 11.6 Gates at the r2 tip `ac7f4832` (tree `3c5b402c`, D27 order)

- **Root typecheck** `logs/s08/r2-root-typecheck-tip.log` — **exit 0** (config
  includes `acceptance/**`, so the new acceptance assertion is type-checked).
- **Focused cluster ×3, worst run wins** `logs/s08/r2-cluster-three-runs-tip.log`.
  Cluster = r1's ten files + `t03-judge-panel` + `tests/architecture/scaffold.test.ts`
  (added because r2 introduces an **export**, which is what an orphan/edge audit
  would notice).

  | run | result | failures |
  |---|---|---|
  | 1 | 137 / 140 | pro01 defender-call · scaffold purity gates · scaffold 28 edge rows |
  | 2 | 137 / 140 | same |
  | 3 | 137 / 140 | same |

  **Worst run = 137/140**, identical across all three. All three failures are
  **PRE-EXISTING**: each name is in `zone-failure-set-BASE.txt` from r1's base
  run at `e040b1ee`.
- **Cause-change check (T1-B2 lesson), not just name-matching.** The two scaffold
  failures are compared **by payload** at base and at the r2 tip: both print the
  same three `obs-capture` items, byte-identical (`logs/s08/r2-cluster-three-runs-tip.log`
  vs `logs/s08/zone-BASE.log`). The new export added nothing to the orphan audit
  or the edge rows, so the cause did not change under this diff.
- **D14/D16 not triggered**: the four changed files are `apps/runner/src/index.ts`,
  `packages/serve/src/index.ts`, `tests/unit/…`, `acceptance/…` — no `web/`,
  `apps/ui`, `packages/contract` or `packages/kernel`.
- **Entry point (packet step 3) not triggered**: no new register family is read.
  The arm consumes `panelPolicy.oneStepDown`. The J12 loud stop for an unsealed
  row is present at the new call site and typed, not defaulted.
  **CORRECTION (codex r2 B1, §12.1): r2 also said that family is one `main.ts` +
  `dev-runner-policy.ts` "already load and pass". That is FALSE at this base** —
  it is board F33, owned by lane T3C, unmerged here. See §12.1.
- **No zone run this round** — the coordinator's message restricts this host to
  focused runs while a full batch suite runs on the integration worktree (D13).
  The payload-level cause check above is what replaces it.
- **`mode change` count = 0.**

### 11.7 Refutation for r2 (D24 + ADDENDUM + ADDENDUM-2)

The campaign was re-run whole at the r2 tip: **17 mutants, 14 CATCH all RED, 2
neighbours GREEN, 1 blind-spot demonstration GREEN.** Gates `pre=0 → applied>0 →
restored=0` on every one; both-side sha256 recorded; tree clean before and after.

| mutant | property | result | killed by |
|---|---|---|---|
| f1 scope widened to run-scope | only the SERVED ROOT's degraded panel steps the band | **RED** ✔ | "not the served root" |
| f2 `PANEL-PARTIAL` also fires | only the single-voice collapse steps the band | **RED** ✔ | the PANEL-PARTIAL test |
| f3 the step never fires | the recorded downgrade is APPLIED, not merely recorded | **RED** ✔ | the step-down test |
| f4 **arm unwired from the serve path** | the arm is on the SHIPPED path — *this restores the exact F30 defect* | **RED** ✔ | the reachability pin |
| f5 degraded always true | it fires only on a recorded degradation | **RED** ✔ | 3 negative tests |
| f6 observation provenance blurred | the record NAMES what decided | **RED** ✔ | "names WHAT decided" |
| n2 NEIGHBOUR `.some` → `.filter(...).length > 0` | must NOT be caught | **GREEN** ✔ | nobody — as designed |
| **b1 BLIND-SPOT DEMO — double step** | see below | **GREEN** — *not caught* | nobody |
| m1-m8, n1 (r1) | re-run at the r2 tip | unchanged ✔ | as in §6 |

**The blind spot, proven rather than asserted.** No assertion of mine can
distinguish "step down exactly one place" from "step down to the floor", because
T16's sealed vocabulary has exactly **two** members (`CAPPED`, `FULL`) and both
readings land on `CAPPED`. Instead of claiming coverage I do not have, mutant
`b1-blind-spot-double-step` applies a genuine double step and the suite stays
green — `logs/s08/mut-b1-blind-spot-double-step.log`. Filed as **F-S08-5**. The
mono-maker cap does **not** share the blind spot: it walks `bandOrder` by index,
so mutant m7 catches the same class there.

17 of the 18 assertions are killed by a named mutant. The exception is the
floor-is-a-fixed-point test: the fixed point comes from T16's sealed mapping
(`buildOneStepDownBands` maps the weakest band to itself), not from a branch of
mine, so there is no mutation in this diff that moves it. It is a real guard
against a future change on either side; it is not evidence about this diff, and
is not counted as such.

### 11.8 Findings added in r2

- **F-S08-5 — CLOSED in r3 (codex r2 N4).** It read: T16's sealed band vocabulary
  has two members, so on the `oneStepDown` path "one step down" and "step to the
  floor" are observationally identical to every test written over the sealed
  order, demonstrated by a surviving mutant `b1`. **The reviewer was right that
  this was cheaply closable**: the helper takes a generic `Record`, so a
  test-layer THREE-band fixture separates the two without touching the sealed
  production vocabulary. Added in r3; `b1` now goes RED. See §12.5.
- **F-S08-6 (non-blocking, tooling; second trap of this lane)** — a
  substring-counting mutant gate treats a 4-space-indented fragment as occurring
  inside its 8-space-indented twin. My campaign aborted on "the OLD text occurs
  2 times" rather than mutating the wrong arm and crediting the kill to somebody
  else's code. Count with the surrounding line, not the fragment. (Not appended
  to `TOOLING-TRAPS.md` — seats may not write that file.)

r1's F-S08-1 and F-S08-2 are **answered** (J23; ticketed to T9's review) and are
not re-argued here. F5's do-not-tidy guard is still honoured: the RAN bucket
survives with mutant m5 behind it.

---

## 12. r3 (rework 2/3) — codex r2: two blocking, four smaller

Reviewed as one round over r1+r2. Every item below is answered; nothing is
deferred to a later round.

### 12.1 B1 — my filing overstated F30's production reachability. It was false.

**The claim, and the correction.** r2 §11.6 said `panelPolicy` is a family that
`main.ts` + `dev-runner-policy.ts` "already load and pass". **At this lane's base
`e040b1ee` that is false.** It is board **F33** — the production entry point
never loads `panelPolicy` — owned by lane **T3C** under J20/J22, and T3C is not
in this base. On this exact tip a production `M >= 2` single-voice run therefore
stops at `PANEL_WEIGHTING_UNRESOLVED` at the claim-time gate, **before the F30
arm executes at all**.

This is worse than a slip: I read F33 in r1 (it is quoted in r1's §2 rulings) and
then asserted its opposite in r2. The correction is applied at the place the
false sentence was written (§11.6) as well as here.

**What the reachability test actually proves, restated in the test itself.** It
is a **static call-graph audit**: a path of textual call references runs from a
declared production entry point to `applyPanelDegradedBandStepDown`, so an arm
that were exported and never wired fails it (mutant f4). It does **not** prove
execution — a syntactic audit cannot see whether the production constructor is
configured to traverse that graph. The `describe` is renamed to
`"F30 — static call-graph reachability from the production entry points (NOT
executable proof)"` and carries the dependency in a block comment at the test.

**The dependency, stated as the packet asks.** Executable F30 proof is
**CONDITIONAL on T3C landing**. The pairing is: T3C supplies the resolved panel
weighting on the production path; this lane supplies the arm and the step-down;
the **integration pairing + the closing W12 run** demonstrate together that a
run can start with resolved panel weighting, reach F30, and publish the stepped
band — including the persisted-projection assertion this lane wrote into T3C's
sibling acceptance test (§11.5). **I did not wire `main.ts`**: that is T3C's
charge, and taking it would be this lane expanding its patch into another's.

### 12.2 B2 — the T13 tuple is now proved on the PERSISTED path, with mutants

**The gap was real.** My T13 unit case asserted terminal, form, both texts,
`confidenceBand` and `bandCeiling.label`. That last value is the **ceiling's**
name, not the verdict **label** — a different thing, and the one the goal's
"label + band still shown" is about. `runServeGateChain` exposes no verdict
state at all, so the label only exists once the runner attaches
`verdictLabelBasis` and `ServeRepository.persist` derives `answer.verdict_state`
from it. A regression at either boundary was invisible to my test. J25 says the
same thing from the other direction: a disclosure is proved where a reader of
the served answer can see it.

**What landed.** The all-reasoned production run already in
`tests/integration/database.test.ts` (TERM-01's reasoning-only contract case —
the real `WalkingSkeletonRunner`, doubles only at the provider boundary) now
asserts the **whole tuple on one persisted `serve.answer` row**:

| asserted on the persisted row | value |
|---|---|
| `terminal` | `DOWNGRADED` |
| `answer_form` | `HYPOTHESIS_WITH_RESEARCH_PLAN` + both synthesizer-written texts |
| `verdict_state` (**the label**) | `CONTESTED` |
| `verdict_unavailable` | `null` |
| `confidence_band` | the mono-lineage cap of the sealed candidate band, computed by calling `applySingleLineageBandCap` on the run's own sealed rows — never a band literal |
| `band_ceiling.basis` | `{LOOKED_UP: 0, RAN: 0, REASONING: 1}` — the CITED set |

**It executes here, three times.** `logs/s08/r3-persisted-tuple-three-runs.log`
— 3/3 green, exit 0 each. Wall time per run, read from that log rather than
recalled: **14.15 s, 6.60 s, 6.76 s** (embedded postgres; the first run pays the import and
migration cost). This is not an acceptance file routed to W12; it is a run in
this lane, at the filed tip.

**Four mutants at the label boundary** (`logs/s08/r3-mut-l*.log`), all judged by
that integration test:

| mutant | boundary | result | what caught it |
|---|---|---|---|
| l1 persist drops DOWNGRADED from `usableBasis` | persistence | **RED** ✔ | `ANSWER_PERSIST_FAILED` — the run stops rather than persisting a label-less answer |
| l2 runner drops DOWNGRADED from `answerCarriesLabel` | attachment | **RED** ✔ | `A servable answer must carry the propagated label basis` |
| **l3 persisted label VALUE corrupted** (`derivation.label` → `"SUPPORTED"`) | persistence | **RED** ✔ | **my new assertion**: `expected 'SUPPORTED' to be 'CONTESTED'` |
| **l4 persisted band skips the mono cap** | persistence | **RED** ✔ | **my new assertion**: `expected 'TEST_TOP_BAND' to be 'TEST_CAPPED_BAND'` |

**Honest accounting of which mutant pins which assertion.**
**CORRECTED IN r4 — see §13.4: this paragraph was wrong.** l1 and l2 make the run
**fail loudly**, and I wrote that they were "caught by the pre-existing
`result.kind === \"COMPLETED\"` assertion". The tool's raw output shows no
assertion ran at all: the throw propagates out of `executeWorkItem` at the
`await` on `tests/integration/database.test.ts:4413`, before the first `expect`.
The rest of this paragraph stands: they are not pins of my new tuple assertions — they prove the two
halves of the boundary must agree and that disagreement stops rather than
degrades, which is worth knowing but is not a pin of my rows. **l3 and l4 are
the pins**: each leaves everything else intact and changes exactly one persisted
value, and each is caught by exactly one of my new assertions and nothing else.
That is why I built them after seeing l1/l2's kill lines.

**One assertion I will not overclaim.** The persisted `band_ceiling.basis` row is
a shape guard here, not a discriminating T12 pin: this fixture serves **one**
node, so its cited set and its load-bearing set coincide and no T12 mutation can
separate them in it. T12's discrimination lives in the unit file, where the
multi-node fixtures exist (m1, m2, m6). Stated rather than counted.

### 12.3 N2 — the reader enumeration is now generated, not summarised

§3's "every reader" table is replaced with the **complete** set produced from
`logs/s08/class-enumeration.log` (D34: generate the claim from the artifact).
The six the r1/r2 summary omitted are marked ✚: `packages/contract/src/client.ts`,
`apps/api/src/publications.ts`, `web/lib/v3Presentation.ts`,
`web/components/VerdictBanner.tsx`, `web/app/page.tsx`,
`web/app/public/debate/[id]/page.tsx`. `packages/critique/src/index.ts`
(`confidenceBandCapRequired`) is listed too — it is a band-cap producer rather
than a reader, and it is in the table because the artifact contains it.

None of them is touched by this lane, so D14/D16 remain untriggered; the point
of the enumeration is that the class was surveyed, and the survey was wider than
the report.

### 12.4 N3 — three RED explanations rewritten from the captured output

Rows 1, 5 and 8 of §4's table now quote what the log actually says
(`A reasoning answer requires both a hypothesis and a research-plan segment`) and
a note explains the mechanism: those three fixtures compose a single segment, the
baseline reads the all-REASONING load-bearing set, enters the downgrade branch,
and that branch's two-segment requirement throws before any band or form
assertion runs. The RED is caused by the defect under test; the recorded failure
is the segment-count validation. Rows 2, 7 and 9 already matched their output.

The fixture count is **11 + 3** — 11 occurrences of `node_refs: ["primary"]` in
`tests/integration/database.test.ts` and 3 in `acceptance/**`, counted with
`grep -c`. The stable report already carried 11 + 3; the r1 **self-report** said
10 and is corrected.

### 12.5 N4 — F-S08-5 is CLOSED, not accepted

The helper takes a generic `Record<string, string>`, so a **test-layer
three-band** map (`test-layer:TOP → MID → FLOOR`) makes one step and a floor
collapse observably different **without touching the sealed two-member
production vocabulary**. Two assertions added: `TOP` steps to `MID` and *not* to
`FLOOR`; `MID` steps to `FLOOR` and `FLOOR` stays.

The previously-surviving mutant is re-run under it and **turns RED**:
`r3-mut-b1-blind-spot-double-step.log` — `expected 'test-layer:FLOOR' to be
'test-layer:MID'`. It is reclassified in the campaign from a blind-spot
demonstration to an ordinary CATCH. **F-S08-5 is closed.**

### 12.6 Gates at the r3 tip `e60e0296` (tree `28126352`, D27 order)

All content changes made, **committed once**, then every gate run against that
tip; each record carries `commit: e60e0296…` and the D41 comparator confirms it
(head of this report, 26 records, 0 failures).

- **Root typecheck** `logs/s08/r3-root-typecheck.log` — **exit 0**.
- **Focused cluster ×3** `logs/s08/r3-cluster-three-runs.log` — **139/142** on
  all three runs, identical. The three failures are the same pre-existing names
  as r2 (pro01 defender-call; the two scaffold gates), each present in
  `zone-failure-set-BASE.txt` at `e040b1ee`.
- **Persisted-tuple ×3** `logs/s08/r3-persisted-tuple-three-runs.log` — **3/3
  green**, exit 0 each.
- **Mutation campaign, re-run whole** — `logs/s08/r3-mut-INDEX.md` and 21
  transcripts: **19 CATCH all RED, 2 neighbour controls GREEN**. No surviving
  blind spot remains. Gates `pre=0 → applied>0 → restored=0` on every mutant,
  both-side sha256 recorded, tree verified clean before and after.
- **`mode change` count = 0**; five files changed vs base, none in `web/`,
  `apps/ui`, `packages/contract` or `packages/kernel` → D14/D16 untriggered.
- **No zone run**: the host still carries a concurrent full batch suite (D13).

### 12.7 N1 — the orchestrator's own finding, recorded

The r1 packet omitted **F5** as well as F30, though J4 routed F5 to this lane and
the board marked it consumed at dispatch. I honoured F5 independently (the RAN
bucket survives, mutant m5 behind it), so the omission changed no code. It is
the orchestrator's packet-generation defect and is recorded, not mine to fix.

---

## 13. r4 (rework 3/3) — the evidence moves to the tool

No product change. Same tip `e60e0296`, same tree `28126352`, same diff. The
lane worktree was clean before the round and is clean after
(`logs/s08/location-proof-r4.out`).

### 13.1 Why this round exists

My r1-r3 campaigns ran through a Python harness I wrote: it applied the
mutation, ran the suite, read the exit code, and then **composed the record**.
The seat that ran and graded the mutations also authored the evidence. The
mission tool `tools/mutate.sh` — written after I filed r3 — moves that boundary:
it stamps, gates, applies, runs, restores and writes the transcript itself, and
a seat can only choose the pair and the command. Every one of the **21** pairs
is re-run through it from the unchanged clean tip.

`logs/s08/mutate-driver-r4.sh` is the only thing I wrote: it reads a pair
directory and calls the tool. It does not post-process the tool's output.

**Correction (codex r4, closed by D46).** I described `r4-mut-INDEX.md` as
"generated from the raw transcripts", and the reviewer was right that no filed
artifact showed it: the driver invokes the tool but never reads a pair's `meta`,
never parses a transcript and never writes or checks the index, so the driver
could have succeeded while the index went stale. The index was in fact produced
by an inline script I ran and did not file — which is the same thing as prose, as
far as the record is concerned. The generator is mission tooling rather than lane
work, so the orchestrator wrote it: **`tools/mutant-index.sh` (D46)**, which
reads only the raw transcripts and decides ASSERTION vs THREW from the presence
of an assertion frame. Its independent run over these 21 transcripts is filed at
`logs/s08/r4-mut-INDEX-DERIVED.txt` and confirms this section's tally —
**21 transcripts, 19 killed, 2 survived**. My numbers were right; the derivation
was missing, and it now exists outside this seat.

### 13.2 Two tokens FITTED TO THE TOOL (the tool was not edited)

The tool's contract exposed two constraints my hand-rolled harness did not have.
Both were resolved by changing the tokens, never the tool:

1. **The gates are line-oriented.** `pre`/`applied`/`restored` use `grep -cF`, so
   a multi-line NEW is treated as several patterns and any one of them matching
   an existing line trips the `pre = 0` gate. Five of my NEW tokens were
   multi-line (`f1`, `f2`, `f3`, `b1`, `n2`); each is now a **single line** with
   the same semantics — e.g. `f1`'s two-line predicate is joined into one line,
   and `b1`'s double step becomes
   `input.oneStepDown[input.oneStepDown[band] ?? band]`.
2. **`s/\Q$OLD\E/$NEW/` interpolates perl variables even inside `\Q`**, so
   neither half may contain `$`, `@`, `\` or the `/` delimiter. Exactly one pair
   was affected: `f6`'s OLD was the template literal
   `` `ledger.reduced_judgement:${MARK}:${nodeId}` ``. It is re-anchored to the
   `$`-free assignment line above it (`  const observationRef =`, verified unique
   with `grep -c`), and the NEW assigns the generic string there. The property it
   attacks — the record NAMES what decided — is unchanged, and the tool still
   catches it.

Every pair was audited for those four characters before the run; the audit is in
the driver's pair generator and its assertions.

### 13.3 The result: 19 caught, 2 neighbour controls survive

Generated from `logs/s08/r4-mut-INDEX.md`. Every row's cause is quoted from the
tool's own output — the assertion that failed, or a plain statement that
execution threw before any assertion ran. Gates were `pre=0 → applied>0 →
restored=0` with `HASHES MATCH` and empty porcelain on **all 21**.

| mutant | expected | observed | what the tool's output shows |
|---|---|---|---|
| `b1-blind-spot-double-step` | RED | **RED** | **assertion failed** in *steps TOP to MID and stops there, never collapsing to the *: `expected 'test-layer:FLOOR' to be 'test-layer:MID' // Object.is equality` |
| `f1-panel-scope-widened-to-run` | RED | **RED** | **assertion failed** in *leaves the band alone when the degraded panel belongs to a*: `expected 'CAPPED' to be 'FULL' // Object.is equality` |
| `f2-partial-mark-also-fires` | RED | **RED** | **assertion failed** in *does not fire on a PANEL-PARTIAL mark - only the single-vo*: `expected 'CAPPED' to be 'FULL' // Object.is equality` |
| `f3-step-never-fires` | RED | **RED** | **assertion failed** in *steps the served root's band down one place through T16's *: `expected 'FULL' to be 'CAPPED' // Object.is equality`<br>**assertion failed** in *steps TOP to MID and stops there, never collapsing to the *: `expected 'test-layer:TOP' to be 'test-layer:MID' // Object.is equality`<br>(+1 more, all in the index) |
| `f4-arm-unwired-from-serve-path` | RED | **RED** | **assertion failed** in *reaches applyPanelDegradedBandStepDown by call reference f*: `expected [ …(659) ] to include 'applyPanelDegradedBandStepDown'` |
| `f5-degraded-always-true` | RED | **RED** | **assertion failed** in *leaves the band alone when no panel degraded*: `expected 'CAPPED' to be 'FULL' // Object.is equality`<br>**assertion failed** in *leaves the band alone when the degraded panel belongs to a*: `expected 'CAPPED' to be 'FULL' // Object.is equality`<br>(+1 more, all in the index) |
| `f6-observation-provenance-blurred` | RED | **RED** | **assertion failed** in *names WHAT decided: the sealed row as predicate, the serve*: `expected 'ledger.reduced_judgement:panel' to contain 'PANEL-DEGRADED-SING…` |
| `l1-persist-label-drops-downgraded` | RED | **RED** | **threw before any assertion**: `ANSWER_PERSIST_FAILED` |
| `l2-runner-label-attachment-drops-downgraded` | RED | **RED** | **threw before any assertion**: `A servable answer must carry the propagated label basis (winner, margin, …` |
| `l3-persisted-label-value-corrupted` | RED | **RED** | **assertion failed** in *declares the reasoning-only segment contract and settles t*: `expected 'SUPPORTED' to be 'CONTESTED' // Object.is equality` |
| `l4-persisted-band-skips-the-mono-cap` | RED | **RED** | **assertion failed** in *declares the reasoning-only segment contract and settles t*: `expected 'TEST_TOP_BAND' to be 'TEST_CAPPED_BAND' // Object.is equality` |
| `m1-basis-reads-load-bearing` | RED | **RED** | **assertion failed** in *counts a cited node the serve set never marked load-bearin*: `expected [ { LOOKED_UP: +0, RAN: +0, …(1) } ] to deeply equal [ { LOOKED_…`<br>**assertion failed** in *does not count a load-bearing node the statement never cit*: `expected [ { LOOKED_UP: 1, RAN: +0, …(1) } ] to deeply equal [ { LOOKED_U…`<br>(+2 more, all in the index) |
| `m2-verified-filter-dropped` | RED | **RED** | **assertion failed** in *excludes the citations of a segment conformance never veri*: `expected [ { LOOKED_UP: 1, RAN: +0, …(1) } ] to deeply equal [ { LOOKED_U…` |
| `m3-downgrade-reads-load-bearing` | RED | **RED** | **threw before any assertion**: `A reasoning answer requires both a hypothesis and a research-plan segment`<br>**threw before any assertion**: `A reasoning answer requires both a hypothesis and a research-plan segment`<br>(+2 more, all in the index) |
| `m4-empty-cited-stop-removed` | RED | **RED** | **assertion failed** in *stops loudly when the served statement cites no conformanc*: `promise resolved "{ terminal: 'DOWNGRADED', …(11) }" instead of rejecting` |
| `m5-ran-bucket-deleted` | RED | **RED** | **assertion failed** in *keeps the RAN bucket in the basis vocabulary (F5 do-not-ti*: `expected [ { LOOKED_UP: +0, RAN: +0, …(1) } ] to deeply equal [ { LOOKED_…` |
| `m6-homogeneous-basis-collapsed` | RED | **RED** | **assertion failed** in *keeps 0/1 shares for a HOMOGENEOUS multi-node citation*: `expected [ { LOOKED_UP: +0, RAN: +0, …(1) } ] to deeply equal [ { LOOKED_…` |
| `m7-mono-maker-step-down-removed` | RED | **RED** | **assertion failed** in *steps a mono-lineage candidate band down exactly one place*: `expected 'FULL' to be 'CAPPED' // Object.is equality` |
| `m8-mono-maker-floor-stop-removed` | RED | **RED** | **assertion failed** in *stops loudly when no ruled band exists below the candidate*: `expected function to throw an error, but it didn't` |
| `n1-neighbour-equivalent-membership` | GREEN | **GREEN** | **no failing test** — neighbour control survives, as designed |
| `n2-neighbour-equivalent-degraded-predicate` | GREEN | **GREEN** | **no failing test** — neighbour control survives, as designed |

### 13.4 The correction — l1 and l2 were NOT caught by an assertion

My r3 filing said l1 and l2 were "caught by the pre-existing `result.kind ===
\"COMPLETED\"` assertion", and that characterisation travelled into the
orchestrator's summary. **It is wrong, and the reviewer is right to reject it.**
From the tool's raw output:

- **l1** (persist drops DOWNGRADED from `usableBasis`) — `TypedDomainError:
  ANSWER_PERSIST_FAILED`, thrown from `runnerStage` at
  `apps/runner/src/index.ts:1520` and propagating out of
  `WalkingSkeletonRunner.execute` into the test at
  `tests/integration/database.test.ts:4413` — the `await …executeWorkItem(…)`
  line. **No assertion was evaluated at all**, not the completion one and not
  mine. The `expect` on the next line never ran.
- **l2** (runner drops DOWNGRADED from `answerCarriesLabel`) — `TypedDomainError:
  VERDICT_LABEL_BASIS_UNRESOLVED`, thrown from `deriveHonestVerdict` at
  `packages/serve/src/index.ts:905`, same propagation, same test line, same
  answer: **execution threw before any assertion ran**.

What they prove is therefore narrower and different from what I claimed: not
that an assertion observes the boundary, but that **the two halves of the label
boundary must agree, and when they disagree the run stops instead of persisting
a label-less answer**. That is worth having, and it is not a pin of my rows.

**The pins remain `l3` and `l4`**, and the tool's output confirms them as
assertion failures in exactly one of my new persisted rows each:
`expected 'SUPPORTED' to be 'CONTESTED'` and
`expected 'TEST_TOP_BAND' to be 'TEST_CAPPED_BAND'`.

`m3` is the one other mutant with mixed causes, and the index says so per test.
It has **4 failing tests, not three** — the count in this paragraph was written
from an earlier three-line summary instead of from the index, and is corrected
here (`awk '/^## m3-/,/^$/' r4-mut-INDEX.md | grep -c '^- '` = 4).
**3** of them threw `A reasoning answer requires both a hypothesis and a
research-plan segment` before their assertions ran; **1** failed its own
assertion, `expected 'SERVED' to be 'DOWNGRADED'`. The index itself was right
throughout; only this sentence was not generated from it.

### 13.5 Location — a content check proves nothing about where the file is

All r4 evidence is written into the **mission report directory**, not the lane's
gitignored `logs/`, which dies with the worktree (D41(b)).
`logs/s08/location-proof-r4.out` carries the raw `pwd` and `ls -la`: 21
`r4-mut-*.log` transcripts + `r4-mut-INDEX.md` + `r4-pairs/` (21 pair
directories) + `mutate-driver-r4.sh` + `stamp-check-r4.out`, all under
`…/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/`.

The D41 comparator over the new prefix is at the head of this report: **22
records, 0 failures.** Its own output is written OUTSIDE the checked prefix, so
the run is clean rather than flagging itself.

---

## 14. Integration merge — `44836ecf` into `lane/s08`

Merged tip **`f3c7f74f`**, tree **`4c074873`**. Not a rework round: the judge's
PASS was given on `e60e0296` and nothing below changes a decision that verdict
rested on. One comment was added at the judge's request (§14.3).

### 14.1 What merged, and what actually overlapped

`git merge-base HEAD 44836ecf` = `e040b1ee`, this lane's own base, so the
incoming side is exactly the four lanes landed since: **TINT1, T6, S06, T7**.
Sixteen files differ from base at the merged tip; **three** are touched by both
sides, and they are the three the packet named:
`apps/runner/src/index.ts`, `packages/serve/src/index.ts`,
`tests/integration/database.test.ts`.

All three auto-merged with no conflict markers. **That is not the resolution** —
an auto-merge can be textually clean and semantically wrong, which is the case
worth catching. Each was resolved by reading both sides and by grepping the
INCOMING diff for the identifiers this lane defines or depends on, rather than
by trusting silence.

### 14.2 The three files, each with its reasoning

**`packages/serve/src/index.ts` — disjoint regions, verified.**
Incoming (`git diff e040b1ee..44836ecf`) is two hunks: `ConditionMarkRecord`'s
mark union gains `BRANCH-FROZEN-LOW-LEVERAGE` (T7's freeze disclosure), and T6's
r4b comment correction on `resolveTrueUnjudgedReasons` — both past line 1000.
S08's change is the cited-set derivation, the band basis and the downgrade
predicate, around lines 560-660. The incoming diff names **none** of the
identifiers S08 defines or reads (`citedNodes`, `verifiedSegmentIds`,
`assertedNodeRefs`, the basis, the Q51 arms). Nothing of T7's or T6's is dropped:
the widened union and the corrected comment are both present at the merged tip.

**`apps/runner/src/index.ts` — the largest incoming diff, and the one I checked
hardest.** T7 adds ~435 lines of adaptive-stopping surface, including hunks
close to where S08 inserted `applyPanelDegradedBandStepDown`. I grepped the
incoming diff for every identifier S08's arm depends on or sits beside —
`node_refs`, `buildFixedSingleRootServeNodes`, `answerCarriesLabel`,
`servedCandidateConfidenceBand`, `applySingleLineageBandCap`,
`verdictLabelBasis`, `servedNodes` — and it touches **none** of them. So T7 did
not move the composer's citation mapping (which is what would change the cited
set), did not move the label attachment, and did not move the band chain S08
wired into. Both sides are present at the merged tip: the F30 arm at `:1742`
wired at `:3605`, T7's stopping surface intact and its own test file green.

**`tests/integration/database.test.ts` — settled by running it, though it
establishes less than this report first claimed.** T7 adds `stoppingPolicy`
provisioning to `runnerSettings()` (δ=0, ε=0, "wide of the fixtures'
arithmetic") plus its own assertions. It does **not** touch `servePolicy`, so
S08's persisted-tuple expectations still derive from the same sealed rows.

**CORRECTION (codex merge review; the orchestrator repeated the same error in its
ledger and has corrected its own row).** This paragraph said that provisioning
the stopping policy makes T7's rule *live in every fixture, including the
all-reasoned TERM-01 run*. **That is false, and it is a claim I did not generate
from the artifact.** TERM-01 calls `createRunnerWork`
(`tests/integration/database.test.ts:319-325`), which calls `createRun` without
overriding the default `agentCount = 1` (`:205-208`). The runner sets
`expansionPlan = []` when `effectiveMakerCount <= 1`
(`apps/runner/src/index.ts:2926-2928`), and `closeGlobalRound` (`:2950`) is
called only from inside the expansion loop (`:3067`) — so on an empty plan it is
never called at all. **TERM-01 is a mono-maker run and T7's stopping boundary
never fires in it.**

What the three runs therefore establish, exactly: **the persisted tuple is
unchanged under the merged configuration** — same sealed rows, same runner, with
T7's provisioning present — green 3/3 at the merged tip (§14.4), with
`verdict_state = CONTESTED`, the mono-capped band and
`basis = {LOOKED_UP: 0, RAN: 0, REASONING: 1}`. They do **not** exercise a
T7 stopping-boundary interaction, and nothing in this lane's evidence does. A
multi-maker fixture would be needed for that, and it belongs to T7's own
coverage, not to a claim made here.

**No landed lane's assertion is weakened, relaxed, deleted or renamed.** Nothing
was taken wholesale from either side, and there was no case where a landed
assertion conflicted with one of mine — had there been, it would be a finding
and a stop, not a keyboard decision.

### 14.3 The judge's product note, taken as one comment

The verified-segment predicate is `state !== "NOT_SAMPLED"`, and
`ConformanceJudgement` carries conformance separately in `conforms`. Read on its
own terms the predicate would admit a JUDGED-but-non-conforming segment and let
its citations into the band. It cannot, because the
`!conformance.every((judgement) => judgement.conforms)` guard about thirty lines
above returns `componentsOnly` first — so the predicate is correct **because of a
guard elsewhere**, not by itself. That coupling is now named in a comment at the
predicate, pointing at the guard it depends on, so the next person to move either
piece sees it. Comment only; the logic is untouched, and the mutation campaign
below re-runs unchanged.

### 14.4 Gates at the merged tip — every record emitted by `tools/gate-run.sh` (D45)

Each record carries the MEASURED checkout's commit and tree, porcelain before,
the exact unpiped command, raw output, the command's own exit, porcelain after,
and a clean-state verdict. **Every one reports `CLEAN-STATE: unchanged`.**

| gate | record | result |
|---|---|---|
| root typecheck (config includes `acceptance/**`) | `r5-root-typecheck.log` | **exit 0** |
| focused cluster ×3, worst run wins | `r5-cluster-run{1,2,3}.log` | **202 / 205**, identical on all three |
| B2 persisted tuple ×3 | `r5-persisted-tuple-run{1,2,3}.log` | **3/3 green**, exit 0 each |
| `mode change` count vs base | `r5-mode-change-count.log` | **0**, 16 files changed |

The cluster's three failures are the same pre-existing names as every earlier
round — `pro01` defender-call and the two `scaffold` gates — each present in
`zone-failure-set-BASE.txt` at `e040b1ee`. The cluster now also runs T7's
`t07-adaptive-stopping.test.ts`, which is **green in this merged tree**: the
merge did not break the lane whose code I merged in.

**The pins survive the merge.** All 21 (OLD,NEW) pairs were re-run at the merged
tip through `tools/mutate.sh` — every OLD still applies, gates `pre=0 →
applied>0 → restored=0` throughout, tree clean before and after. The orchestrator's
`tools/mutant-index.sh` (D46) over those transcripts gives, independently of me:
**21 transcripts, 19 killed, 2 survived** (`mut-INDEX-DERIVED-r5.txt`) — identical
to the reviewed round.

**Location and stamps.** All records are in the mission report directory, proved
by raw `pwd` + `ls -la` in `logs/s08/location-proof-r5.out`, not by a content
hash — a content check answers "are these the right bytes", never "will these
bytes outlive the worktree". `tools/stamp-check.sh` over the new prefix:
**29 records, 0 failures** at `f3c7f74f`. The derived index carries no commit
stamp (it is a derivation, not a gate record), so it is filed as
`mut-INDEX-DERIVED-r5.txt`, outside the checked prefix, rather than counted as a
record that failed to stamp.

---

## 10. Evidence index (`logs/s08/`)

| log | what |
|---|---|
| `t12-t13-RED-on-base.log` | RED at `e040b1ee`, 6 failed / 5 passed |
| `t12-t13-GREEN.log` | GREEN pre-commit |
| `t12-t13-GREEN-tip.log` | GREEN at filed tip `5940b058` (D27) |
| `root-typecheck-tip.log` | root typecheck, exit 0 |
| `cluster-three-runs-tip.log` | focused cluster ×3, worst 112/113 |
| `zone-BASE.log` / `zone-failure-set-BASE.txt` | zone at `e040b1ee`, 1297/1311, 14 names |
| `zone-TIP.log` / `zone-failure-set-TIP.txt` | zone at tip, 1305/1322, 17 names |
| `tip-only-solo.log` | the 3 TIP-only names, solo at tip, all exit 0 (J19/F22) |
| `mode-change-count.log` | `mode change` count = 0 + the 2-file diff |
| `class-enumeration.log` | tally consumers, band readers, builder callers |
| `mutant-harness.py`, `mut-INDEX.md`, `mut-*.log` | the D24 campaign at the r2 tip, **17 mutants** (m1-m8, f1-f6, n1, n2, b1) |
| **r2** `f30-RED-on-r1-tip.log` | F30 RED at the r1 tip, 7 failed / 11 passed |
| **r2** `r2-GREEN-tip.log` | 18/18 at the filed tip `ac7f4832` |
| **r2** `r2-root-typecheck-tip.log` | root typecheck (incl. `acceptance/**`), exit 0 |
| **r2** `r2-cluster-three-runs-tip.log` | focused cluster ×3, worst 137/140 |
| **r2** `r2-mode-change-count.log` | `mode change` count = 0 + the 4-file diff |
| **r3** `r3-root-typecheck.log` | root typecheck, exit 0 |
| **r3** `r3-cluster-three-runs.log` | focused cluster ×3, worst 139/142 |
| **r3** `r3-persisted-tuple-three-runs.log` | the B2 persisted tuple, 3/3 green |
| **r3** `r3-mode-change-count.log` | `mode change` count = 0 + the 5-file diff |
| **r3** `r3-mut-INDEX.md`, `r3-mut-*.log` | the campaign at the r3 tip, **21 mutants** (m1-m8, f1-f6, b1, l1-l4, n1, n2) |
| **r3** `stamp-check-r3.out` | the D41 comparator: 26 records, 0 failures |
| **r4** `r4-mut-*.log` (21) | **written by `tools/mutate.sh`**, one per pair, raw |
| **r4** `r4-mut-INDEX.md` | this seat's index: gates, cause, per-test |
| **r4** `r4-mut-INDEX-DERIVED.txt` | **the orchestrator's `tools/mutant-index.sh` (D46)** over the same transcripts — independent confirmation: 21 / 19 killed / 2 survived |
| **r4** `r4-pairs/` | the 21 tool-fitted (OLD,NEW) pairs, one directory each |
| **r4** `mutate-driver-r4.sh` | the only thing this seat wrote: it calls the tool |
| **r4** `stamp-check-r4.out` | the D41 comparator: 22 records, 0 failures |
| **r4** `location-proof-r4.out` | raw `pwd` + `ls -la` — evidence lives in the mission directory |
| **merge** `r5-root-typecheck.log`, `r5-cluster-run{1,2,3}.log`, `r5-persisted-tuple-run{1,2,3}.log`, `r5-mode-change-count.log` | gates at `f3c7f74f`, each emitted by `tools/gate-run.sh` (D45) |
| **merge** `r5-mut-*.log` (21) | the campaign re-run at the merged tip by `tools/mutate.sh` |
| **merge** `mut-INDEX-DERIVED-r5.txt` | `tools/mutant-index.sh` (D46): 21 / 19 killed / 2 survived |
| **merge** `stamp-check-r5.out`, `location-proof-r5.out` | 29 records 0 failures; raw `pwd` + `ls -la` |

Self-report: `agent-reports/s08-band-downgrade-self.md` (filed before this marker).
