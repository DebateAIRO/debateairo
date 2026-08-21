# PANEL-01 — Opus 5 lens, rev2

**Ticket:** `t_eeea2f6e` · dual diamond (DR-153) · READ-ONLY.
**Verdict: CHANGES REQUESTED — 1 BLOCKING (new, narrow, ~2-line fix), 5 ADVISORY.**

**All three ruled closures are genuinely closed**, and I proved each by mutation
rather than by reading. B-1's disclosure is now a required, two-way-enforced
typed record whose deletion fails a test in either direction; B-2's served-root
rule is named, carried on the answer, and pinned so that a *lying* record fails;
B-3's M-guard is now deletion-sensitive. A-1 was folded correctly and orphaned
nothing. The handoff's advisory dispositions are honest, including the one claim
I most expected to be inflated (the contract regeneration).

The one blocking finding is **not** in any of those three — it is a regression
the rework itself introduced on the ruled ENVELOPE_EXHAUSTED terminal, which the
new required-record entry now makes throw on a two-maker run. It is uncovered by
any test and fixed in two lines.

---

## Mutation evidence (all runs local, tree restored byte-identical afterwards)

| # | mutation | result |
|---|---|---|
| baseline | none | `acceptance/ceremony.test.ts` **2 passed** |
| A | `apps/runner/src/index.ts:896` → `conditionMarks: Object.freeze([])` | **RED** — `ACCEPTANCE_EXECUTION_FAILED:CONDITION_MARK_RECORD_WITHOUT_MARK` |
| A2 | mark **and** record both removed (`:896` + `:908`) | **RED** — `expected [ 'OWED-CHECK-UNEXECUTED', …(1) ] to include 'UNSERVED-MAKER-POSITION'` (`ceremony.test.ts:305`) |
| B | delete `assertRatifiedMakerCount(run.agentCount)` (`:451`) | **RED** — `tests/integration/database.test.ts:768`, expected `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE`, received `RUN_MAKER_CONFIGURATION_MISMATCH`; 1 failed / 30 passed |
| C | `selectServedRoot` returns the *last* root (served reality flipped, rule string unchanged) | **RED** — run fails before settling |
| D | record **lies**: `subjectRef`/`reason` name the unserved root while root 0 is still served | **RED** — `ceremony.test.ts:383`, `subject_ref` expected `ec2ff4ce…` received `3933a144…` |
| restore | `md5` of `apps/runner/src/index.ts` back to `ec88a265626e897e57cdc45a91b43933` | ceremony **2 passed** |

Mutation D is the one that matters most for B-2: it proves ACC-01 pins
**recorded rule ↔ served reality**, not merely "a rule string is present".

---

## The three closures, verified

### B-1 / DR-161 — CLOSED

Every rev1 blocking sub-finding is dead:

- **Vocabulary.** `packages/kernel/src/index.ts:89` mints
  `UNSERVED-MAKER-POSITION` with a DR-161 comment. `ConditionMarkSchema =
  z.enum(CONDITION_MARKS)` (`packages/contract/src/index.ts:10`), so the contract
  carries it transitively at both `condition_marks` (`:327`) and
  `condition_mark_records[].mark` (`:332`).
- **Typed record REQUIRED.** `packages/serve/src/index.ts:773` adds it to the
  `ConditionMarkRecord.mark` union; `:782-788` adds it to
  `REQUIRED_CONDITION_MARK_RECORDS`. **The enforcing line is
  `packages/serve/src/index.ts:910`** — `assertRequiredConditionMarkRecords(...)`
  inside `ServeRepository.persist`, i.e. on the write path every answer takes,
  not a pure helper called only by tests. The gate is **two-way**
  (`:791-807`): mark-without-record → `CONDITION_MARK_RECORD_REQUIRED`;
  record-without-mark → `CONDITION_MARK_RECORD_WITHOUT_MARK`. Both directions are
  unit-pinned at `tests/unit/serve-s05.test.ts:280-284`, and mutation A shows the
  second direction firing through a real run.
- **Reason names both makers and the served root.**
  `apps/runner/src/index.ts:914` —
  `"${rule} served ${servedRoot.maker} root ${servedRoot.nodeId}; ${unservedRoot.maker} root ${unservedRoot.nodeId} remains graph-visible but unserved"`.
  ACC-01 asserts the reason contains `"OpenAI"`, `"Anthropic"`, **and both node
  ids** (`acceptance/ceremony.test.ts:387-390`), so a generic sentence fails.
  `affectedNodeIds` carries both roots (`:917`), and the gate rejects an empty
  affected set (`packages/serve/src/index.ts:911-915`).
- **Chip in plain V2 vocabulary.** `apps/v2-ui/lib/v3/labels.ts:29` and
  `web/lib/v3Presentation.ts:135` both render
  *"Another maker's position was not served"*. Pinned exactly at
  `tests/unit/s14-ui.test.ts:117`, with `CONDITION_MARKS` length pinned to 24
  (`:114`) so removing the member from the kernel is also red.
- **`UNCOVERED-SCOPE` reverted to Q27-only.** Repo-wide it now survives only as
  the kernel vocabulary entry (`packages/kernel/src/index.ts:86`), its two label
  switches, the unrelated `v2ui-live-events` fixture, and the orphan-audit
  FX-DEF-02 `NOT_SHIPPED` row (`tools/orphan-audit/src/index.ts:723`). No runner
  emission. ACC-01 adds a **negative** assertion
  (`acceptance/ceremony.test.ts:306`), so re-collision is caught.
- **Contract regeneration is honest, not hand-edited.**
  `git diff -- packages/contract/generated/` is empty, and that is *correct*:
  `packages/contract/src/generate.ts` emits only the route list and the
  **top-level** keys of each resource, so a new enum member and a new nested
  field (`served_root_rule`) cannot change the output. `condition_mark_records`
  was already in `field-inventory.json:88`. The handoff's phrasing — "regenerated;
  its checked-in output was already byte-current" — is exactly right. No hand-edit
  is even possible here: `client.ts` is a two-line re-export.

### B-2 — CLOSED

- **Named rule.** `apps/runner/src/index.ts:219` `SERVED_ROOT_RULE =
  "first-configured-provider"`; `:222-229` `selectServedRoot()` with a DR-161
  doc-comment and a typed `SERVED_ROOT_UNRESOLVED` refusal on an empty set.
- **The selection actually decides the serve**, rather than decorating a
  positional constant. `servedRootSelection.root` at `:805-806` is the single
  source for: the fact bundle (`:893`), the serve gate's node set (`:980-988`),
  the composer's `availableNodes` (`:1014`), the replay handle (`:841`), the
  propagation ledger subject and artifact (`:881,:887`), and the envelope's
  verified-node subject (`:925-926`). Flipping the function flips reality
  (mutation C).
- **Where the outcome is carried:** *both* places, which answers the directive's
  question precisely.
  1. **A typed field** — `served_root_rule` on `ConditionMarkRecord`
     (`packages/serve/src/index.ts:778`), persisted to
     `serve.condition_mark.served_root_rule` (`:1013,:1024`;
     `migrations/0018_panel01_rework.sql`, replay-safe `ADD COLUMN IF NOT EXISTS`
     with a CHECK constraint pinning the only legal value), read back at `:1227`
     and projected onto the wire at `:1280-1286`, typed in the contract at
     `packages/contract/src/index.ts:337`.
  2. **The record's human `reason`**, which names the rule and the served maker.
- **Test pins recorded-rule == served-reality.** `acceptance/ceremony.test.ts:383-393`
  asserts `subject_ref === nodes[0].node_id` **and**
  `served_root_rule === "first-configured-provider"`. Mutation D (record lies while
  serving root 0) and mutation C (serve root 1 while the rule string stays) both
  go red. This clears rev1's bar — "visible and recorded" — and the alternation
  question stays untouched, as V ruled.

### B-3 — CLOSED

`tests/integration/database.test.ts:754-776` parameterises both codes:
`agent_count: 3 → RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` and
`agent_count: 2` against a critique-less runner
`→ RUN_MAKER_CONFIGURATION_MISMATCH`, each asserting `provider.calls() === 0`
**and** zero persisted `MODEL_CALL` ledger rows — i.e. "before any model call" is
proven twice, from both sides of the gateway. Mutation B turns the suite red.
`RUN_MAKER_CONFIGURATION_MISMATCH` is now asserted (rev1: nowhere).

### A-1's fold — CLEAN

`buildDebateExpansionPlan` is gone from all of `apps/ packages/ web/ tests/
acceptance/ tools/ migrations/` (surviving hits are the codex session log and
review prose only). Nothing else was orphaned: `DebateExpansionLeg` survives as
the base interface of `MultiMakerExpansionLeg` (`apps/runner/src/index.ts:201,209`)
and is still used; root `tsc --noEmit` is clean, so no dangling import remains.
The hand-maintained `neverCalled` list (`tools/orphan-audit/src/index.ts:602-640`)
carries **no stale row** for the deleted symbol — it never had one, which was the
rev1 point, and none was left behind.

The FAIR-illegal M=1 branch is not merely deleted, it **refuses**:
`buildMultiMakerExpansionPlan` throws `MULTI_MAKER_PLAN_REQUIRES_TWO_MAKERS`
(`:250-255`), pinned at `tests/unit/pro01-runner-tree.test.ts:29-33`. It is typed
and tested rather than a silent dead path. (Production never reaches it — the
runner ternary at `:741-743` passes `[]` at M=1 — which is A-2, recorded.)

### Advisories A-3 / A-5 / A-2 — recorded honestly

- **A-3** is stated twice and with the right numbers: handoff line 107 ("+1
  logical call versus DR-159's original arithmetic; depth 1 observed 12 rather
  than 11 and depth 5 computes to 405 rather than 402… the ratified 402 gateway
  ceiling remains authoritative and hard-stops before an unfunded call; only V may
  revise it") and DR-161's ledger note (`decisions-ledger.md:986-990`), identical
  figures to my rev1 arithmetic. This is the disclosure I would most expect to be
  softened; it was not.
- **A-5** recorded (handoff 109) with the correct mechanism — the tree takes the
  support parent, so two of four attack edges live only in the edge/drawer view —
  and correctly notes no graph data is lost.
- **A-2** recorded (handoff 106), including the honest admission that PRO-01's
  old M=1 seven-node proof is **not** claimed reachable.
- A-4, A-6, A-8 recorded; A-7 folded (`acceptance/README.md` now documents
  `JUDGE:defender:root<root>:r<round>:p<index>`).

---

## BLOCKING

### B-4 · A two-maker run that exhausts its envelope now **crashes** on the ruled ENVELOPE_EXHAUSTED terminal instead of serving components-only

The new required-record entry is enforced against `result.conditionMarks` — and
on the budget hard-stop path those marks are **inherited from the fact bundle**
while the records are **replaced wholesale**, dropping the DR-161 record.

Trace:

1. `apps/runner/src/index.ts:892-903` builds the fact bundle with
   `conditionMarks: ["UNSERVED-MAKER-POSITION"]` whenever `effectiveMakerCount === 2`.
2. `:974-975` — if `evaluateRunPressure` returns `HARD_STOP` and the served root's
   restatement passed, the run takes `makeEnvelopeTerminal`.
3. `:944-963` — `conditionMarkRecords` is **reassigned**, not appended:
   `conditionMarkRecords = Object.freeze([ ...enrichmentSkips.map(...), { ENVELOPE_EXHAUSTED … } ])`.
   The DR-161 record built at `:908-918` is discarded.
4. `packages/serve/src/index.ts:375` — `createEnvelopeExhaustedResult` does
   `const conditionMarks = [...input.factBundle.conditionMarks]` and then appends
   the budget marks, so `UNSERVED-MAKER-POSITION` **survives into the result**.
5. `packages/serve/src/index.ts:910` — `assertRequiredConditionMarkRecords` sees the
   mark with no record and throws.

Executed proof (no edits; the real shipped functions, with exactly the record set
`makeEnvelopeTerminal` produces):

```
marks on envelope-exhausted result: ["UNSERVED-MAKER-POSITION","ENVELOPE_EXHAUSTED"]
GATE THREW: CONDITION_MARK_RECORD_REQUIRED - UNSERVED-MAKER-POSITION has no typed persistence record
```

**Why it matters.** `HARD_STOP` fires when `consumedModelAttempts >=
basis.maxModelAttempts` (`packages/budget/src/index.ts:149-195`), and the budget
package's own contract is that a hard stop *must serve* the already-verified
components (`ENVELOPE_EXHAUSTED_WITHOUT_VERIFIED_COMPONENTS`, `:156-161`). Rev2
converts that ruled COMPONENTS_ONLY answer into a thrown `CONDITION_MARK_RECORD_REQUIRED`
and a FAILED work item — for M=2 only, i.e. for the exact shape this ticket ships.
This is also the path DR-161's own A-3 note leans on ("hard-stops gracefully
before an unfunded call"): the graceful stop is no longer graceful for two makers.
No honesty is lost (the user gets a typed failure, not a wrong answer), but a
ruled terminal is unreachable.

**Coverage:** none. The only envelope-exhausted persist test runs at M=1
(`tests/integration/database.test.ts:1084-1105`, marks `["SKIPPED-BY-BUDGET",
"ENVELOPE_EXHAUSTED"]`), where the fact bundle carries no DR-161 mark. Nothing in
`tests/` ever builds a two-maker run.

**Fix (~2 lines + one test).** In `makeEnvelopeTerminal`, preserve the DR-161
record instead of discarding it — e.g. hoist the record built at `:908-918` into a
`const unservedMakerRecord` and reassign as
`Object.freeze([ ...(unservedMakerRecord === undefined ? [] : [unservedMakerRecord]), ...budgetRecords ])`.
Pin it with a serve-unit case that runs `createEnvelopeExhaustedResult` on a fact
bundle carrying `UNSERVED-MAKER-POSITION` and asserts
`assertRequiredConditionMarkRecords` passes with the runner's record set — that
test is red today.

(If the orchestrator or V judges availability-on-exhaustion outside PANEL-01's
scope, this can be downgraded to advisory without touching the three closures.
I record it as blocking because the rework created it, it defeats a ruled
terminal for the shape the rework ships, and nothing defends it — the same
standard rev1 applied.)

---

## ADVISORY

**A-r2-1 · The DR-161 end-to-end pin lives only in the acceptance suite.**
Root `vitest.config.ts` includes `tests/**` only; `acceptance/vitest.config.ts` is
a separate config. Under `tests/`, the vocabulary is pinned
(`tests/unit/s14-ui.test.ts:114-118`) and the gate function is pinned both ways
(`tests/unit/serve-s05.test.ts:280-284`), but **no test under `tests/` builds a
two-maker run** — every integration run is `agentCount: 1` with no critique
(`tests/integration/database.test.ts:99-104,274,360,486`). So the `[]` mutation is
caught by `acceptance/ceremony.test.ts` alone. That is a real, deletion-sensitive
test (mutations A/A2/C/D prove it), so B-1 is closed — but the mission's gate
definition should say out loud that the acceptance suite is required, or the
honesty surface reverts to unguarded for anyone running `pnpm test` only.

**A-r2-2 · `served_root_rule` never reaches a human surface, and the raw token
leaks into the prose that does.** Neither drawer renders the field
(`apps/v2-ui/components/AnswerHonestyDrawer.tsx:139-153` shows mark/scope/
subject_ref/reason/lift_path; `web/components/DebateWorkspaceDrawer.tsx:12-14`
shows mark/subject_ref/reason). The only human-visible carrier is the reason,
which opens with the machine identifier: *"first-configured-provider served
OpenAI root <uuid>; …"*. The chip label is exemplary V2 vocabulary; this sentence
is not. One-line fix in `apps/runner/src/index.ts:914` — e.g. "The first
configured maker's root was served: OpenAI's position <id>; Anthropic's position
<id> is in the graph, unserved." Machine identity stays in the typed field where
it belongs.

**A-r2-3 · The named rule has no direct unit test.** `selectServedRoot` and
`SERVED_ROOT_RULE` are exercised only through ACC-01. That is sufficient today
(proven), but a three-line unit case in `tests/unit/pro01-runner-tree.test.ts`
would keep the rule pinned if ACC-01's shape ever changes, and would put the
rule's identity in the fast suite alongside the vocabulary pin.

**A-r2-4 · Carried from rev1, still open and not listed in the handoff's
disposition: nothing asserts the serve node set has exactly one member.** Rev1
asked for this as a fold-in to B-1. A "serve quietly takes both roots" mutation
still needs three coordinated edits (`:980`, `:1014`, the composer parser), but it
would now make the DR-161 record *silently wrong* — the record would claim one
root was served while two were. One assertion on `answer.nodes` served-set size,
or on the composer's `availableNodes` length, closes it. Advisory only because
the mutation is not a plausible accident.

**A-r2-5 · The architecture suite does not carry the new member (and correctly
cannot).** `tests/architecture/*` contains no `CONDITION_MARKS` assertion; the
closed-vocabulary pin is `tests/unit/s14-ui.test.ts:114`. Likewise the generated
artifacts cannot encode enum members by construction. Both are fine — I record it
so no future reader mistakes "architecture suite green" for "the vocabulary is
pinned there". The real pin is the unit suite's `toHaveLength(24)` plus the two
exhaustive label switches (which fail typecheck if a member is added without a
label).

---

## Verified clean — no finding

- **The rev1 "verified right" engine surfaces are untouched by rev2.** Topology,
  cross-root edges, per-node lineage, arithmetic, and the dormant panel surfaces
  behave exactly as rev1 confirmed; the ceremony's maker sequence, 8 nodes /
  8 edges / 8 strength rows and all six call-site assertions still pass
  (`acceptance/ceremony.test.ts:344-416`, green in my baseline and post-restore runs).
- **Two-way gate ordering is right.** `assertRequiredConditionMarkRecords` runs
  *before* the write transaction opens (`packages/serve/src/index.ts:910` vs
  `:921`), so a violation cannot half-write an answer.
- **Migration is replay-safe and value-constrained** — `ADD COLUMN IF NOT EXISTS`
  plus `CHECK (served_root_rule IS NULL OR served_root_rule = 'first-configured-provider')`.
  The handoff's note that the first architecture attempt rejected bare DDL and the
  migration was made replay-safe matches the file on disk.
- **M-guard ordering unchanged and still correct** — `assertRatifiedMakerCount`
  precedes the configuration-match check (`apps/runner/src/index.ts:451-457`), so
  `agent_count: 3` yields the envelope code, which is what the new test asserts.
- **Handoff accuracy.** Every rev2 claim I spot-checked held, including the two
  most tempting to overstate: the contract-regeneration byte-currency (verified by
  empty `git diff` **and** by reading the generator) and the A-3 arithmetic.

---

## What closes this

One item: **B-4** — preserve the DR-161 record on the envelope hard-stop path and
pin it. Everything the rework directive asked for is done, and done to the rev1
standard of "delete it and a test goes red".
