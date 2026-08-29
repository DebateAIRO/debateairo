# REV-04 — Blind CODE review self-report (Grok)

**Ticket:** `t_f3f1767a` · **Board:** `public-debate-access` · **Seat:** blind CODE REVIEW of S01  
**Worktree:** `.worktrees/rev-04/dialectical-engine` @ `1c9578a`  
**Verdict:** **REWORK** (blocking leak reproduced)

```
SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, verification-before-completion
```

Default posture: **REFUTE.** Did not write this code; did not write the PLAN.

---

## Packet review (before the diff)

- Packet path resolves from seat cwd; quoted base `1c9578a` matches `git rev-parse HEAD`.
- `packages/contract/generated/client.ts` exists (generate:contract already run). TOOLING-TRAPS entry about lens worktrees needing generate:contract is accurate and was paid for by REV-03.
- Router baselines reproduced here: `s8-publication.test.ts` → `Tests 21 passed (21)`; `pda-s01-envelope-schema.test.ts` → `Tests 3 passed (3)`; `s8-publication-http.test.ts` → `Tests 4 passed (4)`; root `pnpm exec tsc --noEmit` exit 0.
- No packet constant contradiction found against measured baselines. No `allowed`-list defect (packet has no file allow-list).
- **Could not verify** the live “exactly 1 publication” DB count from this seat (no measured DB probe in-environment). Relied on DECISIONS/SPEC text only for that inventory claim.

---

## The question that matters

> Construct a case where an owner-only value reaches an anonymous reader despite the projection.

### B1 — BLOCKING: `replay_handle` VALUE survives via `provenance_ref` alias (real producer)

**Failure scenario (concrete):**

1. Build an `Answer` whose PRESENT edge mirrors `projectServeEdge` in `packages/serve/src/index.ts:168-177`, which sets:
   - `strength.number.provenance_ref = row.provenanceRef`
   - `strength.number.replay_handle = row.provenanceRef` (**same string**)
   - `edge.provenance_ref = row.provenanceRef`
2. Publish through real `PostgresPublicationApplication.publish` → encrypt → `readPublicDebate` (anonymous read path).
3. Observe: `strength.number.replay_handle === "REDACTED_OWNER_ONLY"` **and** the original secret string still present on `strength.number.provenance_ref` and `edge.provenance_ref`, and in `JSON.stringify(debate)`.

**Evidence (own probe, not author’s tests):**

- Script: `.hermes/reports/public-debate-access/scratch/leak-probe.mts`
- Output:
  ```json
  {
    "replay_handle_after": "REDACTED_OWNER_ONLY",
    "number_provenance_ref_after": "edge-prov-alias-HANDLE-9f2a-SHOULD-NOT-LEAK",
    "edge_provenance_ref_after": "edge-prov-alias-HANDLE-9f2a-SHOULD-NOT-LEAK",
    "secret_still_in_json": true,
    "owner_only_value_reached_anonymous_reader": true
  }
  ```
  Exit 2 / `VERDICT_SIGNAL: LEAK_REPRODUCED`.

**Why the author’s suite stayed green:** fixtures set `provenance_ref: "provenance:labeled-number"` / `"provenance:edge"` while `replay_handle` uses distinct `HANDLE_MARKERS`. That shape is **not** what `projectServeEdge` produces.

**Discrimination check:** temporarily aliased the author’s edge fixture to the production shape (same marker in both fields). Without changing product redaction, residual test `strips residual handle marker values from the published JSON` went **RED** (`expected ... not to contain 'real-replay-ptr-edge-b2c1'`). Restored fixture; test green again. So C2-6 would catch this **if** the fixture matched production — today it does not.

**Same class, node arm (also reproduced):**

- Real producers: judgement insert uses `replay_handle = \`judgement:${reducedJudgementId}\``; serve projects `base_provenance_ref = reduced_judgement_id::text`.
- After publish, `base_score.replay_handle` is redacted, but `base_score.provenance_ref` is the UUID; `judgement:${provenance_ref}` reconstructs the original handle exactly.
- Probe: `.hermes/reports/public-debate-access/scratch/node-prefix-probe.mts` → `VERDICT_SIGNAL: NODE_PREFIX_RECONSTRUCTABLE`.

**Root cause:** field-name redaction of `replay_handle` while shallow-copying `provenance_ref` does not remove the owner-only **value** when producers alias or prefix-derive the two. PLAN classified `provenance_ref` COPIED-AND-FLAGGED; that classification is incompatible with B1’s “hide ledger pointer values” property on real edges/nodes.

**Files/lines:**

- Redaction under review: `apps/api/src/publications.ts:19-36` (`redactLabeledNumber` / `redactNodeForPublic` / `redactEdgeForPublic`)
- Producer that forces the alias: `packages/serve/src/index.ts:168-177`
- Node reconstructability: `packages/judgement/src/index.ts` (~348) + `packages/serve/src/index.ts:2158-2164`

**Fix direction (for coder / plan correction, not applied by this seat):** public projection must not leave reconstructable/aliased ledger pointer values in any copied field — e.g. redact/null `LabeledNumber.provenance_ref` (and likely edge-level `provenance_ref` when it equals the strength handle), and pin with a fixture that mirrors `projectServeEdge` plus a `judgement:${id}` node arm. Checklist-flagging `provenance_ref` for S04 does not close a value that B1 already declared owner-only.

---

### N1 — Non-blocking (WHEN: same rework as B1): residual fixtures do not mirror production producers

`tests/unit/s8-publication.test.ts` `answerWithTree` / `labeledNumber` use distinct provenance vs replay strings. That makes C2-6 unable to see the B1 alias leak. Fix with B1; not optional.

---

## Other attack surfaces (attempted; no additional blocker)

| Surface | Result |
|---|---|
| Three `replay_handle` sites | Enumeration matches PLAN for **reachable published** path (node base, node final, edge PRESENT). No fourth published site found (`number_slots` / WITHHELD components are answer-level and **not** placed on the public envelope). |
| `abstention.ledger_unknown_ref` constant | Value replaced; original marker absent from JSON. Constant presence is schema-required, does not encode the secret. |
| `stranger_restatement` passthrough | Fresh `{ check_status }` object; extras stripped. Confirmed by green test + RED under wholesale mutant. |
| `disagreement` → `null` | Schema-valid (`.nullable()`); bag contents absent from JSON. |
| `locator` / `defeater_refs` | Re-traced producers: judgement prompt (citation free text); serve SQL defeater `node_id`s in-tree. Copied as PLAN claims; no owner-only handle found beyond general provenance class already in B1. |
| Unenumerated Node/Edge fields | Walked `NodeSchema`/`EdgeSchema` against PLAN table; no unnamed field found today. Open shapes on the copied path are only the two already PROJECTED/REDACTED. |
| `cost_envelope` / `tier_provenance_ref` | Absent from publish construction block (`publications.ts:174-193`); top-level reject test still present. V Row 4 honored. |
| Mutations owner-only | `POST .../publish`, `POST .../unpublish`, `DELETE /v1/debates/{id}` are `auth: "user"`; only `GET /v1/public/debates` (+ id) are public. No anonymous publish/unpublish/delete/replay route found in the route table. |

---

## Back-compat / legacy disclosure

- Mechanism is `PublicDebateSchema.parse` + `catch { return null }` → handler 404 — **not** `.strict()` as the sole back-compat story. Optional `nodes`/`edges`/`tree_included` keep old ciphertext parsing.
- Measured: old-shape `safeParse` success; `tree_included`/`nodes`/`edges` **undefined** (not `false`, not `[]`).
- Tests: `reads a legacy answer-only snapshot without fabricating a tree`; envelope schema tests for old-shape / required-widen contrast — all green.
- **Could not verify** S02 UI disclosure chrome (out of S01 envelope scope). API/schema discriminator is real and typed.

Do **not** condemn these legitimately green regression/verification arms.

---

## RED-first (applied myself)

Mutated `redactNodeForPublic` / `redactEdgeForPublic` to wholesale `{ ...node }` / `{ ...edge }`, ran:

`-t "residual handle marker|stranger_restatement|nulls disagreement"`

→ `Tests 3 failed | 18 skipped (21)` (C2-6/7/8 all ×). Restored from backup; same filter → `3 passed | 18 skipped`. Diff clean vs backup.

**Conclusion:** residual redaction pins for stranger_restatement / disagreement / distinct-marker handles are real. They do **not** pin the production alias leak (B1).

---

## What I did not do / could not do

- Did not edit product code under review (mutants restored; probes live under `.hermes/reports/.../scratch/` only).
- Did not count live publications in a database.
- Did not run browser/UI flows (S01 is envelope + publish path; no browser tools required for this slice’s assertions).
- Did not read sibling lens tickets or other review verdicts.
- Did not three-run the author’s full clusters (packet asked independent refute probes; I re-ran the cited suites once each for baseline + targeted mutant/fixture arms). Worst-run law for *author* clusters noted; my B1 probes are single-run with deterministic in-memory harness — re-ran alias discrimination after restore to confirm cleanliness.

---

## Where the packet fought me

- It did not. Environment prep (install + generate:contract) held; publication tests actually ran. Framing (“construct a leak”) is what found B1 — same shape as REV-03’s win condition.

---

## Predictions (blindness held)

1. A plan-faithful lens that only audits the field table against the redaction function (without mirroring `projectServeEdge`) will likely **PASS** and miss B1.
2. A RED-first-only lens will correctly bless C2-6/7/8 and may stop there.
3. If another lens files against `provenance_ref` being COPIED, check whether they reproduced the **value** leak or only restated the COPIED-AND-FLAGGED flag — reproduction is the difference between hypothesis and B1.

---

## Verdict markers

```
PEER REVIEW CHANGES REQUESTED
comments read through: created@2026-08-29T17:45 + claim heartbeat
Findings: B1 (blocking), N1 (non-blocking, same-day ticket)
Self-report: .hermes/reports/public-debate-access/agent-reports/REV-04-grok.md
```

---

# ADDENDUM — Re-review of REDACT-01 fix (`t_9e9e04ef`)

**When:** same session, after coder+architecture fix landed in this worktree  
**Skills re-loaded:** heartbeat-protocol, heartbeat-reviewer, verification-before-completion  
**Default posture:** REFUTE (re-reviewing my upheld finding against someone else's fix)  
**Round:** redaction-correctness thread, **round 2 of 3** (round 1 = architecture plan + coder implementation under review)

## Router baselines re-measured (not trusted)

- Own original probes: `NO_ALIAS_LEAK`, `NODE_PREFIX_SAFE` (both exit 0)
- `s8-publication.test.ts` → `Tests 24 passed (24)`
- `pda-s01-envelope-schema.test.ts` → `Tests 3 passed (3)`
- `s8-publication-http.test.ts` → `Tests 4 passed (4)`
- `pnpm exec tsc --noEmit` exit 0
- No `...n` / `...node` / `...edge` spreads remain inside the three redactors (explicit projection confirmed by read)

Do **not** condemn these legitimately green arms.

## What closed (previous B1 / N1)

- Edge triple-alias and `judgement:` prefix reconstruction are closed under the new projections.
- S01-C2-9 production-shaped tests exist and pass (`3 passed | 21 skipped` under their filter). They truly alias the three edge fields to one secret and cover the node prefix arm + node/review raw pointers — adequate mirror of `projectServeEdge` / judgement prefix for **that** defect class.

## Same question, harder — new leak found

### B1 (re-review) — BLOCKING: `LabeledNumber.source` carries the redacted `raw_artifact_id`

**Architecture's own rule** (now in PLAN/DECISIONS): a field is REDACTED iff its producer assigns a value identical to, or derivable from, an already-redacted field's source value or any other owner-only ledger/execution-row pointer — traced through actual producers.

**Producer trace:**

1. `NodeSchema.provenance_ref` is REDACTED (this round) because it is `core.node.provenance_ref` = `raw_artifact_id` (serve join at `packages/serve/src/index.ts` ~2094-2095, 2181).
2. `JudgementRepository.record` / `recordReduced` set `source_ref = input.rawArtifactRef` (`packages/judgement/src/index.ts:323-324` and `:347-348`).
3. Serve maps that into the published tree as `base_score.source = row.base_source_ref` (= `judgement.source_ref`) at `packages/serve/src/index.ts:2158-2164`.

So production assigns the **same raw_artifact_id** to:
- `node.provenance_ref` (now redacted)
- `base_score.source` (still **copied** by `redactLabeledNumber`, which keeps `source: n.source`)

**Reproduction** (own probe, not author tests):

- Script: `.hermes/reports/public-debate-access/scratch/source-alias-probe.mts`
- Output:
  ```json
  {
    "node_provenance_ref": "REDACTED_OWNER_ONLY",
    "base_score_source": "raw-artifact-id-SHARED-BY-node-prov-and-ln-source",
    "secret_still_in_json": true,
    "owner_only_value_reached_via_source": true
  }
  ```
  `VERDICT_SIGNAL: SOURCE_ALIAS_LEAK`

**Why suites stay green:** fixtures use `source: "test source"` while `provenance_ref` uses other strings — never production-aliased. Discrimination: forcing `node.provenance_ref = base_score.source = HANDLE_MARKERS[0]` made `strips residual handle marker values` **FAIL** against current redaction; restore → green.

**Files:** `apps/api/src/publications.ts` `redactLabeledNumber` (copies `source`); producers above; PLAN still lists `LabeledNumberSchema.kind/.source/.producer` as COPIED (line ~941) — that row was not re-swept after `NodeSchema.provenance_ref` became REDACTED.

**Fix direction:** under the stated value-provenance rule, redact `LabeledNumber.source` at least on the judgement/base_score path (and re-sweep any other COPIED field whose producer assigns `rawArtifactRef` / other redacted sources). Pin with a C2-9-style fixture that sets `node.provenance_ref === base_score.source` to a secret marker.

### N1 (re-review) — Non-blocking; WHEN = with B1

S01-C2-9 closed the *previous* alias shape but does not mirror the `source_ref = rawArtifactRef` producer. Residual pin remains vacuous for this arm until a production-shaped source alias fixture exists.

## Other attacks attempted (no additional blocker)

| Attack | Result |
|---|---|
| Original edge/node probes | Closed |
| Hostile bag of must-redact markers (prov/replay/ledger/disagreement/passthrough) | `MUST_REDACT_CLEAN` |
| MakerLineage.provider_ref | Still copied; producer path is providers discovery/config (`packages/providers/src/index.ts` provider_ref keys), not per-execution ledger row — COPIED-VERIFIED holds on the evidence I traced |
| Abstention register_* | Traced via serve select + memory `policy.sourceRef` — policy/register citations, not execution pointers — holds |
| Nested shared refs (`maker_lineage`, `reasons`, `defeater_refs`) | References shared pre-parse; not an owner-only value leak under the rule; zod parse rebuilds |
| Explicit projection vs upstream new field | Return type `: Node` / `: Edge` / `: LabeledNumber` forces naming new required keys at compile time; unnamed input keys are dropped — claim holds for the projection shape |
| Unknown transforms beyond `judgement:` | `final_strength` redacts both `provenance_ref` and `replay_handle`, so transforms between those two are moot. Edge `strength.source` is `strength_source` (separate column from `provenance_ref`) — no alias found like the judgement source case |
| Spreads left in redactors | None |

## Could not do

- Live DB sampling of real published rows to count how often `base_score.source === node.provenance_ref` (producer code makes it the default for judgement-backed base scores; frequency not measured).
- Exhaustive sweep of every `sourceRef` writer for `node_strength_record` / edge `strength_source` beyond the serve/judgement paths cited.
- Browser/UI verification (out of scope).

## Predictions

1. A lens that only re-runs the two original probes will PASS and miss this.
2. A lens that audits the PLAN field table without re-tracing after the new REDACTED set will keep `LabeledNumber.source` as COPIED and miss the contradiction with the value-provenance rule.
3. First place I'd tell a sibling to look: any COPIED field whose producer argument is `rawArtifactRef` or equals a field redacted this round.

## Verdict markers (re-review)

```
PEER REVIEW CHANGES REQUESTED
comments read through: READY FOR PEER REVIEW @2026-08-29T18:56 + claim heartbeat
Findings: B1 (blocking, source↔raw_artifact alias), N1 (non-blocking fixture gap)
Round: redaction-correctness #2 of 3
```

---

# ADDENDUM 2 — Second re-review of REDACT-02 (`t_3d2c21e9`)

**When:** same session, after recursive fixed-point fix + corrected test D  
**Skills re-loaded:** heartbeat-protocol, heartbeat-reviewer, verification-before-completion  
**Default posture:** REFUTE  
**Round:** redaction-correctness thread, **round 3 of 3** (final lawful rework)

## Router baselines re-measured (not trusted)

| Check | Result |
|---|---|
| leak-probe | `NO_ALIAS_LEAK` |
| node-prefix-probe | `NODE_PREFIX_SAFE` |
| source-alias-probe | `SOURCE_ALIAS_SAFE` |
| hostile-copied-fields-probe | `MUST_REDACT_CLEAN` |
| s8-publication | `Tests 25 passed (25)` |
| pda-s01-envelope | `Tests 3 passed (3)` |
| s8-publication-http | `Tests 4 passed (4)` |
| `tsc --noEmit` | exit 0 |

Do **not** condemn these legitimately green arms.

## 1. Fixed-point sweep — own pass against the CONVERGED set

**Converged redacted source values used as the input set:**
`raw_artifact_id`, `reduced_judgement_id`, `judgement:<id>`, `propagation_run_id`, strength replay handle, edge `provenanceRef`, review raw artifact id, `ledger_unknown_ref`.

**Production-shaped answer** planted all of those on their real sites (including `node.provenance_ref === base_score.source === final_strength.source === raw_artifact`, with distinct labeled-number provenance/replay values; edge triple-alias; edge `source = EVIDENCE_VERIFIER`).

**Probe:** `.hermes/reports/public-debate-access/scratch/fixed-point-sweep-probe.mts`

**Result:**
- `production_shaped_secret_leaves: []` — no redacted-class value appeared on any published string leaf
- `VERDICT_SIGNAL: FIXED_POINT_HOLDS`
- `base_source_redacted` / `final_source_redacted` / `node_prov_redacted` all true
- `edge_source_preserved: true` (`EVIDENCE_VERIFIER`)

**Producer re-check of COPIED fields against the enlarged set (no third member):**
- `LabeledNumber.source` on edges ← `StrengthSource` enum (`EVIDENCE_VERIFIER` | `CLUSTER_COLLAPSE` | `UNDERCUT_TRANSMISSION` in `packages/kernel/src/index.ts:181-186`), not a ledger pointer — correctly left COPIED with `redactSource: false`
- `MakerLineage.*` / abstention `register_*` — still config/policy, not equal to any converged secret under traced producers
- `claim` / `locator` / `review.reasons` / `defeater_refs` / `producer` / `kind` — free text or labels; no current producer assigns them from the redacted set

**Separate note (not a fixed-point miss):** planting secrets into COPIED free-text/config fields still passes them through (104 planted survivals across 13 paths). That is expected under an explicit projection that copies those fields; the value-provenance rule is about **producer assignment**, not about sanitizing free text. No current producer was found that assigns a redacted-class value into those paths.

**No third member found.** Architecture’s claim that Pass 3 added nothing is consistent with this independent sweep.

## 2. Test D — production-shaped, not a sketch

Implemented fixture (`tests/unit/s8-publication.test.ts` ~1018-1045):
- Sets `node.provenance_ref = base_score.source = final_strength.source = rawArtifactRef` (**across objects**, matching judgement `source_ref = rawArtifactRef` and runner `sourceRef: own.provenanceRef` / `lineage.provenanceRef` at `apps/runner/src/index.ts:670` and `:2034`)
- Does **not** set `base_score.provenance_ref` or `final_strength.provenance_ref` to that marker (those stay the distinct labeled-number values from `answerWithTree`) — avoids the false same-object alias the coding seat correctly refused
- Edge arm: `strength.number.source = "EVIDENCE_VERIFIER"` must remain copied

`TEST_D_SHAPE_OK true` by static check of the fixture. Matches serve SQL: node prov = raw_artifact_id; base provenance = reduced_judgement_id; final provenance = propagation_run_id.

## 3. Over-redaction arm is real

Mutated edge call to `{ redactSource: true }`:
- Test D → **FAILED** with `expected 'REDACTED_OWNER_ONLY' to be 'EVIDENCE_VERIFIER'`
- Restored → **PASSED**

The arm catches the mirror-image defect. Not decorative.

## 4. Prior stated limits

| Prior limit | Now |
|---|---|
| Live DB frequency of source alias | **Still could not** — no DB access this seat. Judgement INSERT aliases by construction (100% when that path writes); frequency sampling remains for a seat with DB. |
| Exhaustive `source_ref` writers into tables feeding `LabeledNumber.source` | **Closed:** only `packages/judgement/src/index.ts` (two `INSERT INTO ledger.reduced_judgement`) and `packages/ledger/src/index.ts` (`INSERT INTO ledger.node_strength_record`). Callers binding strength `sourceRef` to node provenance: `apps/runner/src/index.ts:670` and `:2034`. No third INSERT writer found. |

## Verdict

**PASS.** Fixed point holds under an independent sweep; corrected test D mirrors production; edge source over-redaction arm discriminates; no third redacted-class member found. Round 3 of 3 closes without escalation to V.

```
PEER REVIEW APPROVED
comments read through: READY FOR PEER REVIEW on t_3d2c21e9 (incl. V Row 7 provisional / architecture path in thread)
Findings this pass: none
```

### Predictions

1. A probe-only lens that re-runs the four named probes will also PASS and may not independently re-derive the writer enumeration.
2. A lens that treats planted free-text survivals as fixed-point failures will false-REWORK; the rule is producer-trace, not content firewall.
3. First place I would still watch post-merge: any new writer that binds a LabeledNumber.`source` (or other COPIED field) to `rawArtifactRef` / node provenance without updating `redactSource` / the projection.
