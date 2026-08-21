# PANEL-01 dual-diamond review — Grok lens (rev3)

**Ticket:** `t_eeea2f6e` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Prior Grok verdict:** `docs/missions/2026-08-06-v3-programming/reviews/panel01-grok-rev2.md` (**APPROVED** — B-1 / B-2 / B-3 closed)  
**Rework input (not peer authority):** Opus rev2 B-4 in `reviews/panel01-opus-rev2.md`  
**Worker claim inventory (not authority):** `handoffs/PANEL-01-codex-handoff.md` rev3  
**Mode:** read-only. Product / runtime sources not edited.  
**Scope:** **only** the rev3 delta named below. Did **not** re-open or re-litigate the three rev2 closures already APPROVED by this lens. Did **not** invent new product work.

**Judged delta**

1. **B-4** — preserve the DR-161 `ConditionMarkRecord` through `makeEnvelopeTerminal` (runner previously reassigned the array wholesale, discarding honesty records on envelope hard-stop).  
2. **One** serve-unit test: M=2 envelope-exhausted persist proves components-only serve instead of `CONDITION_MARK_RECORD_REQUIRED`.  
3. Fold **A-r2-4**: exactly-one-served-root assertion on the serve-node collection.  
4. Fold **A-r2-2**: reword reason prose so the raw `first-configured-provider` token is not in human reason text (token may remain only on the typed rule field).

**Corroboration run (focused units, saved under reviewer scratch):**  
`pnpm vitest run tests/unit/serve-s05.test.ts` → **1 file / 20 tests passed** (includes the M=2 envelope case).  
Optional same set as Grok rev2: `pro01-runner-tree` + `serve-s05` + `s14-ui` → **3 files / 41 tests passed**.

## Verdict

**APPROVED**

Rev3 closes the single narrow block Opus rev2 opened on the envelope-exhausted path. The DR-161 record is no longer discarded when budget records are appended; one serve unit drives the real preserve seam and required-record gate for M=2 marks and expects `COMPONENTS_ONLY` without throw. The two claimed advisory folds are present as stated. The three rev2 honesty closures were not re-judged.

---

## Must-check answers (OBJECTIVE)

| Question | Answer | Evidence |
|---|---|---|
| Does **one M=2 envelope-exhausted serve-unit** exist that would fail if the DR-161 `ConditionMarkRecord` were discarded on the terminal path? | **Yes.** | `tests/unit/serve-s05.test.ts:272–309` — `"PANEL-01 rev3 preserves the DR-161 record when an M=2 serve exhausts its envelope"`. Builds `createEnvelopeExhaustedResult` with fact-bundle marks `["UNSERVED-MAKER-POSITION"]`, builds matching DR-161 + `ENVELOPE_EXHAUSTED` records, runs production `preserveEnvelopeTerminalConditionMarkRecords([unservedMakerRecord], [envelopeRecord])`, asserts `terminal: "COMPONENTS_ONLY"` and marks `["UNSERVED-MAKER-POSITION", "ENVELOPE_EXHAUSTED"]`, and expects `assertRequiredConditionMarkRecords(exhausted.conditionMarks, records)` **not** to throw. If `preserve…` returned only budget records (discard existing), the gate throws `CONDITION_MARK_RECORD_REQUIRED` and the unit fails. If `createEnvelopeExhaustedResult` dropped the inherited mark, the `toMatchObject` on marks fails. |
| Does the record **actually survive** through `makeEnvelopeTerminal` / the production preservation seam into a components-only terminal without `CONDITION_MARK_RECORD_REQUIRED`? | **Yes.** | Runner mints the DR-161 record into `conditionMarkRecords` at M=2 (`apps/runner/src/index.ts:928–938`). `makeEnvelopeTerminal` reassigns via **append, not wholesale replace**: `conditionMarkRecords = preserveEnvelopeTerminalConditionMarkRecords(conditionMarkRecords, […budget…])` (`:964–983`). `preserveEnvelopeTerminalConditionMarkRecords` is `Object.freeze([...existing, ...budgetRecords])` (`:232–237`). `createEnvelopeExhaustedResult` inherits `factBundle.conditionMarks` then appends `ENVELOPE_EXHAUSTED` (`packages/serve/src/index.ts:375–379`) → `terminal: "COMPONENTS_ONLY"` (`:384`). Serve persist still runs `assertRequiredConditionMarkRecords` (`:910`). Mark + preserved record both present → no `CONDITION_MARK_RECORD_REQUIRED`. |

---

## B-4 — envelope hard-stop no longer discards the DR-161 record

### What Opus rev2 blocked

On M=2, fact bundle carries `UNSERVED-MAKER-POSITION` while `makeEnvelopeTerminal` **reassigned** `conditionMarkRecords` to only enrichment-skip + `ENVELOPE_EXHAUSTED` records, dropping the honesty record built at mint. `createEnvelopeExhaustedResult` kept the mark from the fact bundle → serve gate threw `CONDITION_MARK_RECORD_REQUIRED`. Ruled `COMPONENTS_ONLY` terminal unreachable for the shape PANEL-01 ships. Coverage was only M=1 envelope-exhausted.

### Shipped (rev3)

| Piece | Location | Status |
|---|---|---|
| Preservation seam | `apps/runner/src/index.ts:232–237` `preserveEnvelopeTerminalConditionMarkRecords` | **Append existing + budget** |
| Terminal path uses seam | `makeEnvelopeTerminal` `:964–983` | **Calls preserve; does not wholesale-replace with budget-only array** |
| Mark inheritance on result | `createEnvelopeExhaustedResult` `packages/serve/src/index.ts:375–389` | **Inherits fact-bundle marks; terminal `COMPONENTS_ONLY`** |
| Gate still two-way | `assertRequiredConditionMarkRecords` + `REQUIRED_…` includes `UNSERVED-MAKER-POSITION` (`:782–807`, persist `:910`) | **Unchanged (rev2 closure left intact)** |
| M=2 serve unit | `tests/unit/serve-s05.test.ts:272–309` | **Present; green** |

### Would the unit have caught the discarded record?

**Yes, at the production seam it pins.** The unit imports the real runner `preserveEnvelopeTerminalConditionMarkRecords` and the real serve `createEnvelopeExhaustedResult` + `assertRequiredConditionMarkRecords`. Mutation of preserve to budget-only (the logical equivalent of the old reassignment) → records lack `UNSERVED-MAKER-POSITION` while marks still include it → `CONDITION_MARK_RECORD_REQUIRED` → unit red. Mutation that stops inheriting fact-bundle marks → `toMatchObject` on marks red. That is exactly the B-4 failure mode Opus demonstrated.

Note on test shape (not a block): the unit drives the **exported preserve seam** and the **serve exhaust result builder**, not a full runner `executeWorkItem` HARD_STOP integration. That matches the handoff's "same production record-preservation seam" claim and is sufficient for this ~four-line fix; it does not re-open B-1/B-2/B-3.

### Judgment

**PASS — closed.**

---

## Folded advisories (spot-check only)

| Fold | Claim | Spot-check | Residual? |
|---|---|---|---|
| A-r2-4 exactly-one served root | Single `servedNodes` feeds serve gate + composer `availableNodes`; refuse unless length === 1 | `servedNodes` one-element freeze (`apps/runner/src/index.ts:816–824`); `servedNodes.length !== 1` → `FIXED_SINGLE_ROOT_SERVE_VIOLATED` (`:825–827`); `nodes: servedNodes` into gate (`:1000`); `availableNodes: servedNodes.map(...)` (`:1026`) | Closed as claimed |
| A-r2-2 reason prose | Human reason without raw rule token; token only on typed field | Runner reason: ``The first configured maker's root was served: …`` (`:934`) — no `first-configured-provider` in template. Typed `servedRootRule: servedRootSelection.rule` still set (`:936`). ACC-01: `expect(reason).not.toContain("first-configured-provider")` while still pinning `served_root_rule: "first-configured-provider"` (`acceptance/ceremony.test.ts:383–391`) | Closed as claimed |

Neither fold re-opens the three rev2 closures.

---

## Out of scope (not re-judged)

| Item | Disposition |
|---|---|
| B-1 two-way DR-161 gate | Left intact per handoff; **not re-litigated** (Grok rev2 APPROVED) |
| B-2 served-root rule pin | Left intact; **not re-litigated** |
| B-3 M-guard deletion teeth | Left intact; **not re-litigated** |
| Engine topology / ceremony full dual-maker path | Not re-opened |
| New product work beyond the named delta | None invented |

---

## Packet / delta checklist (rev3)

| # | Item | Judgment |
|---|---|---|
| B-4 | Preserve DR-161 record through envelope terminal; components-only not crash | **PASS** |
| Unit | One M=2 envelope-exhausted serve unit that fails if record discarded | **PASS** |
| Fold r2-4 | Exactly-one-served-root assertion | **PASS** (spot-check) |
| Fold r2-2 | Reason prose without raw rule token | **PASS** (spot-check) |

---

## Dual-diamond Grok lens: **APPROVED**

The rev3 delta is exactly what Opus B-4 required: honesty records survive the budget terminal path, one unit would catch the discard, and the two claimed advisory folds are present without expanding product scope. Prior Grok rev2 approvals of B-1/B-2/B-3 stand.
