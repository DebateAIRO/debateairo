SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, verification-before-completion

comments read through: none on a REV-08 ticket (board still has no REV-08 row as of this re-review)

# REV-08 — Re-review after REWORK RETURNED (S04 node-carrier audit)

**Seat:** REV-08 (Grok) · **Board:** public-debate-access  
**Prior verdict:** REWORK (B1, B2 blocking)  
**This pass:** decide whether B1 / B2 / N1 / N2 are actually closed. Author claims not trusted — own probes only.

**Overall verdict: PASS**

---

## Finding status

### B1 — Vacuous fixture — **CLOSED**

**What changed:** Second `it` no longer asserts on a hand-built `PublicDebate`. It builds an owner `Answer` with all ten forbidden keys planted inside `nodes[0].disagreement`, calls real `PostgresPublicationApplication.publish` (stubs only repository + cipher), and asserts on the `PublicDebate` passed to `encrypt` after `nodes.map(redactNodeForPublic)` (`publications.ts:244` → `:260`).

**Own evidence:**
| Probe | Result |
|---|---|
| Suite ×3 | both tests executed; 2/2 pass each run |
| Mutant `disagreement: node.disagreement` | **RED** (toBeNull + `"asker_id"` / marker values present). Schema still accepts the bag — projection was the failing seam |
| Mutant skip `redactNodeForPublic` (`nodes: input.answer.nodes`) | **RED** |
| Mutant keep bag as `{ panel: "kept" }` after stripping names | **RED** on `toBeNull` |
| Restore | green again |

**Vacuity gone?** Yes for the original defect (asserting a clean fixture the author never dirtied). The fixture is now **input** to the product path; the oracle is the **projected** envelope. That is not “moved one layer inward” in the vacuous sense.

**Other break that stays green (new residual, not reopening B1):** Mutant `nodes.map((node, i) => i === 0 ? redactNodeForPublic(node) : node)` → **shipped test stays GREEN** because it only plants on `nodes[0]`. Scratch planting on `nodes[1]` under that mutant goes RED. So quantification over nodes is incomplete. Filed below as **N4** — different class from “passes by construction with no product path.”

**CONFIDENCE:** HIGH · **STRONGEST COUNTER:** “N4 means the property is still under-tested.” True as coverage breadth; false as vacuity. Original B1’s mutant left a non-product test green; that specific shape is gone.

### B2 — PLAN overclaim on S04-C1-2 — **CLOSED**

Read revised S04-C1-2 against the test body (not the author’s summary):

- Title/change text: product-path publish, plant forbidden keys in `disagreement`, stub repo/cipher, capture encrypt input, assert null + markers gone — **matches** `publishThroughProduct` + second `it`.
- **Failure it CATCHES:** copy `disagreement` instead of nulling; notes schema still accepts — **matches** Mutant 1 and the second-lens schema hole (routed to V; not this author’s to fix). Correctly scoped.
- Dropped the old “independent whole-envelope scanner / z.record smuggling via hand fixture” claim.

**CONFIDENCE:** HIGH

### N1 — Value-carrier gap acknowledgement — **CLOSED** (as acknowledgement, not as a fix)

Author did not claim to close the gap. Own probe: `provider_ref: "owner:…"` through real publish → projected value retained; forbidden-key assertions stay **GREEN**.

Acknowledgement locations (adequate, right place):
1. Test comment above the product-path `it` (lines 245–246): does not classify identity-like values under allowed copied names.
2. PLAN S04-C1-2 **Failure it MISSES**: explicit `provider_ref: "owner:..."` neighbour mutant stays GREEN; **“C1 alone does not close R1.”**

A skim of only the R1 section title could still over-credit C1; a reader of the step’s miss line cannot. That is enough for closing N1 as filed.

**CONFIDENCE:** HIGH

### N2 — Stale citations — **CLOSED**

| Cite now | Opens to |
|---|---|
| `apps/api/src/publications.ts:399-400` | `} catch {` / `return null;` inside `readPublicDebate` |
| `packages/contract/src/index.ts:424-442` | full `NodeSchema` body through `}).strict();` |
| `:445-457` | full `EdgeSchema` body through `}).strict();` |

Old `320-321` / `443-476` claims gone from those sites.

**CONFIDENCE:** HIGH

---

## New finding from re-review

### N4 — Product-path test plants disagreement only on `nodes[0]` (NON-BLOCKING)

- **VERDICT:** NON-BLOCKING — ticket for same-day route; does not reopen B1
- **CONFIDENCE:** HIGH — Mutant5 evidence above
- **STRONGEST COUNTER:** “`redactNodeForPublic` is applied via `.map` over all nodes in production; index-0-only is an artificial mutant.” Artificial ≠ impossible; a future edit that special-cases the first node, or a test that is copied with a single-node fixture, would not be caught. Cheap fix: plant on ≥2 nodes (or assert every `nodes[i].disagreement === null`).
- **File:** `tests/unit/pda-s04-node-carrier-audit.test.ts` second `it` + `answerWithDisagreement`

---

## What the test now establishes (stranger-actionable)

S04-C1 now proves two narrow properties: (1) `NodeSchema`/`EdgeSchema` declare none of the ten standing forbidden identity-carrier **key names**; (2) the real `PostgresPublicationApplication.publish` projection **nulls** `node.disagreement` and drops planted forbidden keys/marker values from the encrypted public envelope, even though the schema still types that field as an open `z.record`. It does **not** prove R1 closed: identity-like **values** under allowed copied keys (e.g. `provider_ref`), leaks outside the disagreement bag, schema-level acceptance of arbitrary disagreement keys (V-routed), or disagreement redaction on nodes the fixture never dirties, remain out of scope — use S01’s field table, S04-C4, and the open schema ruling for those.

---

## Self-report (re-review)

- Skills reloaded; evidence-before-claims held — every CLOSED/OPEN above cites a command or opened line.
- Did not take author RED/GREEN narrative on trust; reproduced Mutant1 RED and N1 GREEN myself.
- Sought a post-fix green mutant for the claimed erase property; found N4 (first-node-only plant). Did not inflate that into B1 reopen.
- Honored bounds: no commits/pushes/merges/product edits retained; publications.ts and test file restored to pre-mutant bytes (`diff -q` clean).
- Schema `z.record` hole treated as out-of-scope per packet (V ruling); used only to judge C1-2 scoping.
- `stranger_restatement` `.strict()` noted as other-slice work; not reviewed.
- Prior report path had been sanitized away; this file replaces it with round-1 context + re-review.

READY FOR ROUTER
