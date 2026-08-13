# PANEL-01 — Opus 5 lens, rev3

**Ticket:** `t_eeea2f6e` · dual diamond (DR-153) · narrow re-review of my own rev2
blocking finding · READ-ONLY except this file.
**Verdict: APPROVED — B-4 closed by execution. 2 ADVISORY (neither blocks).**

Grok approved rev3; this confirmation completes the diamond. PANEL-01 closes.

---

## 1 · B-4 re-run against the shipped functions — CLOSED

Rev2's reproduction, re-executed with no edits, against the real
`createEnvelopeExhaustedResult`, `assertRequiredConditionMarkRecords` and the new
`preserveEnvelopeTerminalConditionMarkRecords`, fed the exact record set
`makeEnvelopeTerminal` now produces at M=2 with one enrichment skip:

```
terminal: COMPONENTS_ONLY | coverageMode: NOT_RUN
marks on envelope-exhausted result: ["UNSERVED-MAKER-POSITION","SKIPPED-BY-BUDGET","ENVELOPE_EXHAUSTED"]
records carried:                    ["UNSERVED-MAKER-POSITION","SKIPPED-BY-BUDGET","ENVELOPE_EXHAUSTED"]
GATE ACCEPTED: components-only serve proceeds, no throw
persist affected-node precondition violated: false
```

The counterfactual — same shipped functions, records *reassigned* to the budget
set as rev2 shipped it — still reproduces rev2's failure verbatim, so the probe is
live and not vacuously green:

```
marks: ["UNSERVED-MAKER-POSITION","ENVELOPE_EXHAUSTED"]
GATE THREW: CONDITION_MARK_RECORD_REQUIRED - UNSERVED-MAKER-POSITION has no typed persistence record
```

The ruled ENVELOPE_EXHAUSTED terminal is reachable again for the shape this
ticket ships. Supporting structure, all read on disk:

- `apps/runner/src/index.ts:232-237` — `preserveEnvelopeTerminalConditionMarkRecords`
  is a named export with a DR-comment; `:964` is its only call site, passing the
  live `conditionMarkRecords` (assigned `:928-938`, i.e. strictly before every
  `makeEnvelopeTerminal` invocation at `:995`, `:1111`, `:1116`).
- **Mark and record are minted under identical conditions.** The fact bundle marks
  on `effectiveMakerCount === 2` (`:916`); the record is skipped only when
  `unservedRoot === undefined` (`:928`), and `unservedRoot` is `authoredNodes[1]`
  at M=2 (`:815`), which is unconditionally authored at `:730-745` or the run
  throws first. No path mints the mark without the record.
- **No double-append.** `makeEnvelopeTerminal` is invoked at most once per run —
  `:995` is exclusive with the `else`, and `:1113` gates `:1116` on the result not
  already carrying `ENVELOPE_EXHAUSTED`.
- **No later reassignment.** The two downstream mutations (`:1152`, `:1173`, owed
  checks and type fallback) both spread `...conditionMarkRecords` forward; `:1200`
  hands the accumulated set to `persist`.
- **No orphan-direction risk on this path.** `enrichmentSkips[].conditionMark` and
  `terminal.conditionMark` are literal types in `packages/budget/src/index.ts:82,
  125,135`, so the appended records can only be `SKIPPED-BY-BUDGET` /
  `ENVELOPE_EXHAUSTED`, both of which `createEnvelopeExhaustedResult` also puts on
  the marks (`packages/serve/src/index.ts:375-379`).

## 2 · The new test, mutation-argued

`tests/unit/serve-s05.test.ts:272-309` — "PANEL-01 rev3 preserves the DR-161
record when an M=2 serve exhausts its envelope". It builds the M=2 fact bundle,
runs the shipped `createEnvelopeExhaustedResult`, pins
`terminal: COMPONENTS_ONLY` and `["UNSERVED-MAKER-POSITION","ENVELOPE_EXHAUSTED"]`,
and asserts the shipped gate accepts the record set that the shipped preservation
seam returns.

| # | mutation | result |
|---|---|---|
| baseline | none | `tests/unit/serve-s05.test.ts` **20 passed** |
| **M1** | `apps/runner/src/index.ts:236` → `Object.freeze([...budgetRecords])` (rev2's discard restored **inside the seam**) | **RED** — `serve-s05.test.ts:308`, `expected [Function] to not throw … 'TypedDomainError: UNSERVED-MAKER-POSITION has no typed persistence record'`; 1 failed / 19 passed |
| M2 | `:964` call site reverted to inline `Object.freeze([` (rev2's discard restored **at the call site**) | **GREEN** — 20 passed; `tsc --noEmit` clean; `audit:source` and `audit:orphans` both clean → advisory A-r3-1 |
| restore | `md5 apps/runner/src/index.ts` back to `306343f727ee59a03ad1950f99674412` | 20 passed |

M1 is the mutation rev2 named, and it goes red with rev2's own error code, not a
generic failure. Note the handoff's own RED evidence is weaker than this — it
records a `TypeError: preserveEnvelopeTerminalConditionMarkRecords is not a
function` (the pre-implementation red), which proves the test imports the seam but
not that it detects the semantic discard. M1 supplies that proof.

Tree restored byte-identical after every mutation (`apps/runner/src/index.ts`
`306343f727ee59a03ad1950f99674412`, `packages/serve/src/index.ts`
`e15933bcf995cf7e3a0b9eafbf3f4eb3`, `tests/unit/serve-s05.test.ts`
`34c6311071f5d1a39b11517110e42a50`).

## 3 · The two folded advisories

**A-r2-2 (raw rule token in human prose) — landed, and pinned negatively.**
`apps/runner/src/index.ts:934` now reads *"The first configured maker's root was
served: OpenAI position `<id>`; Anthropic position `<id>` remains graph-visible but
unserved"*. `first-configured-provider` survives repo-wide only where it belongs:
the typed constant (`:219`), `servedRootRule` on the record, the contract literal
(`packages/contract/src/index.ts:337`), the column CHECK
(`migrations/0018_panel01_rework.sql:5-6`), and test fixtures.
`acceptance/ceremony.test.ts:391` asserts `reason` **does not contain** the token,
alongside the four surviving positive assertions (both makers, both node ids,
`:387-390`) — so neither reverting the prose nor flattening it to a generic
sentence can pass.

**A-r2-4 (exactly one served root) — landed as a runtime refusal, not a test.**
`apps/runner/src/index.ts:816-827` builds a single frozen `servedNodes` collection
and throws `FIXED_SINGLE_ROOT_SERVE_VIOLATED` unless it has exactly one member;
that same const is the sole input to the serve gate (`:1000`) and the composer's
`availableNodes` (`:1026`) — verified by grep, there is no second array. This is
stronger than rev2 asked for in one respect (a single source, so "serve quietly
takes both roots" now needs one edit rather than three, and that edit trips the
guard) and weaker in another: no test pins the guard, and as written the check
sits two lines below a one-element literal, so it can only fire on a future edit
to that literal. Advisory-grade either way; recorded as A-r3-2.

## 4 · Canary — the rev2 closures still hold

- **Two-way mark enforcement.** `tests/unit/serve-s05.test.ts` green at baseline,
  including "DR-161 refuses either half of the unserved-maker mark/record contract
  when missing" (`:311-327`) — both `CONDITION_MARK_RECORD_REQUIRED` and
  `CONDITION_MARK_RECORD_WITHOUT_MARK` directions.
- **Enforcement still on the write path and still ahead of the write.**
  `packages/serve/src/index.ts:910` inside `ServeRepository.persist` (`:882`),
  before `withWriteTransaction` at `:921`. `REQUIRED_CONDITION_MARK_RECORDS`
  (`:782-788`) and the `ConditionMarkRecord.mark` union (`:773`) unchanged.
- **Vocabulary pins.** `tests/unit/s14-ui.test.ts` — 14 passed
  (`CONDITION_MARKS` length, the `UNSERVED-MAKER-POSITION` member, and the plain
  V2 label "Another maker's position was not served").
- **Lying-record pin (ACC-01) intact.** `acceptance/ceremony.test.ts:383-394`
  still asserts `subject_ref === positionNode.node_id` **and**
  `served_root_rule === "first-configured-provider"` — rev2's mutation D remains
  caught. Not re-executed (orchestrator reports the full suite green at 461).
- **M-guard.** `apps/runner/src/index.ts` maker-count guard and the parameterised
  `tests/integration/database.test.ts` cases untouched by rev3's diff.

Nothing outside the B-4 seam, the reason prose, the `servedNodes` guard, and the
one new test moved.

---

## ADVISORY (not blocking; no rework required)

**A-r3-1 · The call site is not pinned, only the seam.** M2 shows that reverting
`:964` from `preserveEnvelopeTerminalConditionMarkRecords(conditionMarkRecords, […])`
to an inline `Object.freeze([…])` reintroduces B-4 exactly and is caught by
nothing: not `tests/`, not `tsc --noEmit`, not `audit:source`, not
`audit:orphans` (whose `neverCalled` list is hand-maintained, so the helper going
uncalled is silent). This is not a rework item — `makeEnvelopeTerminal` is a
closure inside a private class method and no test under `tests/` builds a two-maker
run (rev2's A-r2-1, still open), so the extracted seam is the only pinnable
surface, and rev2 asked for exactly this shape. It is worth recording that the
fix's durability rests on the named helper remaining the call site. The cheapest
real closure remains the one A-r2-1 already names: one M=2 run under `tests/`.

**A-r3-2 · `FIXED_SINGLE_ROOT_SERVE_VIOLATED` is untested and adjacent to its own
construction.** See §3. Deleting the guard turns nothing red.

Both carry forward as advisories with rev2's still-open A-r2-1, A-r2-3, A-r2-5.

---

## What closed this

B-4 — the only rev2 blocker — is closed by execution, not by reading: the M=2
envelope-exhausted result carries both the mark and its record, the serve gate
accepts it and serves components-only, and the mutation rev2 prescribed turns the
new test red with rev2's own error code. The two folded advisories landed. The
three rev2-verified closures are untouched.

**APPROVED.**
