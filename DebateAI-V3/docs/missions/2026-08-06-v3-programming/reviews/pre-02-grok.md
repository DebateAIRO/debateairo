# PRE-02 · Grok independent peer review

| Field | Value |
|---|---|
| Ticket | `t_427c1757` — PRE-02 · Fold-in B: `02-data-model.md` + `03-module-design.md` + `04-api-contract.md` |
| Reviewer | Grok (independent peer lens under DR-101; Claude-authored ticket) |
| Date | 2026-08-06 |
| Verdict (rev 1) | **CHANGES REQUESTED** (F1 only) |
| Verdict (rev 3 delta) | **APPROVED** |
| Scope under review | `docs/architecture/02-data-model.md`, `03-module-design.md`, `04-api-contract.md` **only** |
| Consistency context (not judgment targets) | Mission ledger DR-068…DR-101; S09 ticket body (`t_c5e8ec5a`); founding `requirements-spec.md` §12.3 Home 3 post-PRE-08 / §7.3 E-7 |
| Independence | Did **not** read any Codex verdict or any `reviews/pre-02-codex*` file. Rev-2/rev-3 worker handoffs on the ticket and the three architecture files are in scope; Codex peer comments were skipped. |

---

## Verdict

**CHANGES REQUESTED** — one blocking finding (orchestrator-contract Home-3 restatement missed). The nine red-team limbs and the worker's seven scrutiny points otherwise hold. Residuals are recorded; none other rises to CHANGES REQUESTED on its own.

---

## Authority read (in order)

1. `.grok/skills/heartbeat-protocol/SKILL.md` — Grok reviewer = independent read-only peer; never reads the other diamond verdict.
2. `hermes kanban show t_427c1757` through `READY FOR PEER REVIEW: PRE-02 fold-in B complete` (stopped there). Orchestrator notes of 22:26 and 22:33 are contract.
3. Mission ledger: `docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` (DR-068…DR-101).
4. The three files under review (untracked — read directly).
5. Consistency context only where a red-team limb required it (S09 body for `DERIVED`; `06` roster for FX-WIRE-02/03; founding Home 3 for the orchestrator Home-3 note).

**Comments read through:** `2026-08-06 23:01` claude-worker `READY FOR PEER REVIEW` (did not read any subsequent peer-review comments).

---

## Hard checks (ticket DONE WHEN + red-team)

### (0) Zero CONDITIONAL; no invented numbers; FX-WIRE-02/03 vs 06 — **PASS** (with residual)

| Check | Evidence |
|---|---|
| `CONDITIONAL` in the three files | **0 hits** (grep). Residual wording is historical `SEAT-PROPOSAL` status encoding and "provisional" / discharged-marker narrative — not a CONDITIONAL banner. |
| Invented numbers | **None found.** Composition-budget values stay register rows; DR-072's `0.97→0.5` is ledger-cited measurement, not invented here; pagination limits unstated. |
| FX-WIRE-02 / FX-WIRE-03 | **Consistent with `06`'s roster:** same ids; FX-WIRE-02 = executions keyset pagination at **S1** (+ S14 interface limb in 06); FX-WIRE-03 = `GET /v1/session` at **S0**. Worker text that says they are "specified nowhere yet / PRE-03 must add them" is **stale relative to current 06** (both rows already fully specified) — residual overstatement of debt, not a roster collision. |
| A-11 vs A-12 citation | **04 is correct** against FinalPlan-consolidation: **A-11** = executions pagination; **A-12** = A5.2-over-orderings SEAT-PROPOSAL. `06`/`05`/`00` mis-cite A-12 for pagination — **out of PRE-02 scope** (residual for PRE-03 / owners of those files). |

---

### (1) Valuation schema SPLIT (§11A.3.0) vs §11A.2 all-in-core + one-migration-lineage — **PASS**

**What the worker decided:** context 6 spans two *existing* schemas —

| Table | Schema |
|---|---|
| `value_hinge`, `reversal_point` | `core` |
| `overlay_run`, `sensitivity_record` | `ledger` |

**Argument (held):** a schema here is a **discipline namespace, not a context boundary** (§1 already places contexts 1/3/10 in `core` and has `ledger` written by all). `overlay_run` / `sensitivity_record` share grain and discipline with `propagation_run` / `node_strength_record`. **No new schema** → AC-02 / one-migration-lineage law untouched.

**Against silent architecture change:** the ticket body explicitly required *"Decide the valuation tables' schema home (§11A.3 names none; critique's four are in core)"* — so a decision under lane authority was assigned work, not smuggled. §11A.3.0 names the decision, the rejected all-in-core alternative, and the discipline argument. §11A.2's all-in-core is a **precedent for run-scoped critique objects**, not a hard law that every context must collocate all tables. Context ownership stays on `valuation` (`03` §4.1) regardless of physical schema.

**Not blocking.** Residual: a future builder who only reads §11A.2 may still assume all-of-context-6-in-core; the §1 picture + §11A.3.0 already correct that.

---

### (2) DR-089 terminal carrier — no S-13 mint — **PASS**

| Claim | Evidence |
|---|---|
| Carrier only | `run_progress_event.kind` gains **`TERMINAL`** (event-stream kind beside PHASE / ENVELOPE_*), not a new Home-3 served state (`02` §3.3, §3.9, §12 row 27, §13, §14). |
| Value vocabulary | Value is `04` §12.3's existing `run.terminal` **with its typed kind**; where the run ends on a terminal route the kind is **DR-037's five**. Explicit: *"no new member is minted here (AC-65, S-13)"*. |
| Wire side | `04` §10.1: *"No new typed state is minted here: the member is DR-037's"*. `run.terminal` stays the existing ui §1.3 name at grade P. |
| WAIT drain | Write-time refusal of `TERMINAL` while any row derives `WAIT`; Q61 re-homed outside the run to `job:settlement-watch` (`03` §1.2, §5.5.0, §9.4). Four existing homes, no new table. |

**No new typed state or vocabulary member under S-13.** Adding `TERMINAL` to the progress-event kind enum is infrastructure vocabulary (like `PHASE`), not a served typed state.

---

### (3) `claim_type` column home on `core.node` — **PASS** (repair, not overreach)

§13 already inventoried OD-16 as closed and enforced in `kernel` but named **no table**. Placing `claim_type` on `core.node` under lane authority is the only coherent key domain for §9.1's claim-type → composition map and for DR-087's `value_laden boolean NOT NULL` to sit **beside** (never inside) the closed vocabulary. OD-16 stays closed; the §12 row 29 invariant is the **absence** of a CHECK binding flag to type. Documented as repair, not a V ruling. **Not overreach.**

---

### (4) DR-076 mints — E1 consumers, projection payloads, `node.spawned` E2 — **PASS**

| Name | Grade | Declared consumer (E1) | Payload |
|---|---|---|---|
| `node.spawned` | **P** (was S) | W6, W8, **W10** | `{node_ref, parent_ref, placeholder_edge_ref}` — references only |
| `node.generating` | S | W6, W8 | bare signal |
| `node.being_judged` | S | W6, W8 | bare signal (judgement contents stay tier 2/3) |
| `node.scored` | **P** | W6, W8, W10 | labeled number (§9.1) **or** M1 typed unjudged record — never fabricated τ (AC-21, AC-63) |

**E2 collisions resolved on the record:** (1) no `graph.placeholder_edge_added` — DR-075 makes the arrow a real edge, so `graph.edge_added` already means it; (2) `node.scored` ≠ `node.complete` (generation vs appraisal; AC-21 path can be complete-and-unjudged).

**`node.spawned` S→P** is a **payload upgrade of an inherited ui §1.3 name**, not a rename and not a new meaning — the meaning remains "node spawned"; the upgrade carries the spawn-time connection references DR-076 requires. Explicit "nothing here becomes a column" + `02` §14 three-position lifecycle as **derived-only**.

---

### (5) DR-092 `action_scope` as member-attribute — **PASS**

Minted as `action_scope ∈ {ITEM_SCOPED, PRE_ITEM}` — a **declared attribute of each action-kind member in `kernel`**, explicitly **not** a `ledger_entry` column (`02` §6.1). §14 lists the classification as derived from the kind. AC-85 / "never by value" argument spelled out; `UNCLASSIFIED_ACTION` classed `PRE_ITEM`; population predicate reads scope and nothing about `stance_at_action`. **Cannot drift into a stored row column without contradicting §6.1 and §14.**

---

### (6) DR-074 WITHHELD sweep — no orphaned live limb — **PASS**

| File | Undeclared-operator limb | Strict-and limb (AC-26) |
|---|---|---|
| `02` §7.4, §9 | Deleted as AC-77 orphan; anti-defect re-homed to mandatory register row + recorded operator/level | Survives intact |
| `03` §6.1, §10 | Deleted row; reason stated | Survives |
| `04` §9.2 | Deleted reason; enum stays three members | Survives |

Grep of the three files: every remaining `WITHHELD` / `undeclared` hit is either the **surviving AC-26 limb**, the **deletion narrative**, or a **historical AC-22 citation** on the status enum provenance line (e.g. `04` §10 number-slot source list still names AC-22). No live path claims the undeclared-operator reason can still be produced.

**Residual (non-blocking):** clean the historical AC-22 citations on the three-member status enum to "AC-12 / AC-26 (AC-22 limb deleted at DR-074)" so a grepping reader does not re-open the limb.

---

### (7) `tier_source` DERIVED recorded-not-deleted vs S09 directive — **PASS**

**S09 ticket body (`t_c5e8ec5a`):** *"AUDIT: DERIVED may now be unreachable — if no production path produces it, remove the member or it is an FX-ORPH-02 BLOCKING orphan, and rescope FX-DB-07 from 'all three suppliers' to the reachable set (trap)."*

**What PRE-02 did:** left the three-member enum; recorded the residue explicitly (`02` §13 note, §17 item 7, §19 residue table; `04` §5.1, §10, §17) with **owed decision before S9's exit** — named producer **or** removal — rather than unilaterally deleting.

**Consistent with S09.** The audit/removal trap is S09's build-time gate, not PRE-02's unilateral schema surgery. Recording-not-deleting is the correct fold-in posture.

---

### (8) Sample 8 other folded rulings for overstatement — **PASS**

| Sample | Ledger grant | Folded claim | Overstatement? |
|---|---|---|---|
| **DR-069** | NO FENCE; honour system; consumer-manifest not required | `03` §2 quotes ruling **verbatim** including "no enforcement mechanism / honour system"; manifest deleted from §1.2 / edges / §12; structural rule 4 re-based on AC-59/60 | **No.** |
| **DR-071** | UNDERCUT_TRANSMISSION writable; OD-06 2→3; per-edge reduction | Writable member; §5.5(4); `transmission_reductions` on `propagation_run` | **No.** |
| **DR-075** | Placeholder arrows live endpoints; endpoint-absent narrows to foreign/deleted | §5.5(5); ordinary edge row, no `is_placeholder` column | **No.** |
| **DR-078** | Independent composition-budget row; user-facing low/medium/high | `composition_budget_tier` on frozen head + POST /v1/asks; values stay register | **No numbers invented.** |
| **DR-082/086** | Second independent gate; caps band; wears label; never blocks | `band_ceiling` non-optional; cap not promoted to fifth blocking gate | **No.** |
| **DR-091** | CROSS-entry leverage snapshot as trigger basis; never score input | `verification_trigger_basis` side-by-side with `sensitivity_record`; excluded from EvaluationSnapshot's five fields | **No.** |
| **DR-093** | Propose-and-ratify-once; until ratified every row behaves as correctness | `03` §9.5 — until ratified, CORRECTNESS; no invented 71-row split | **No.** |
| **DR-097** | Register rows outside clause 4; advisory unread-key audit | `03`/`04` advisory lane; no claim of production exemption beyond ledger | **No.** |

Also spot-checked without issue: DR-070 (`user_dev_token` provisional), DR-077 (rule on `propagation_run`, selection+dispersion on `reduced_judgement`, ref on `node_strength_record` — no AC-85 duplicate), DR-083 (in-repo activation predicates), DR-088 (auto-activation = shipped dark; NOT-SHIPPED attestation).

---

### (9) Apps/scheduler three jobs + purity fence + DR-101 skip — **PASS** (ticket MUST DO on 03)

- Three jobs: `job:replay-self-test`, `job:reaper`, **`job:settlement-watch`** (DR-089) with H-O-24 credential-separation table (`03` §5.5.0).
- Edge row 24 gains `settlement`; acyclicity argument present.
- battery/decision purity fence text intact.
- DR-101 process-seat note **skipped** as instructed.

---

## Blocking finding

### F1 · Stale "Home 3 known-incomplete at four" caveats — orchestrator contract unmet

**Authority:** orchestrator note on the ticket (2026-08-06 22:33, **before** READY FOR PEER REVIEW — contract):

> stale 'spec §12.3 Home 3 known-incomplete at four' caveats now factually false in your files — 02-data-model.md L1001/L1005/L1479/L1491; 04-api-contract.md L701/L751. Also check 02 L1491's Home-3 column routing observation. The correction is live; restate these as resolved-at-five.

**Fact check:** PRE-08 landed. Founding `requirements-spec.md` §12.3 Home 3 now lists **five** terminal routes (row 5 = depth-zero, authority DR-037 / placed by DR-099 A-01). The "known-incomplete at four" claim is **factually false**.

**Still live in scope files (line numbers have drifted with the fold-in; content has not):**

| File | Location (approx.) | Stale claim |
|---|---|---|
| `02` | §7.7 (~L1278–1296) | "Home 3 lists only the first four"; "known-incomplete"; "FinalPlan / V register must either place…" |
| `02` | §13 preamble (~L1919–1922) | "Home-3 table is known-incomplete at four" as the reason terminal routes source from DR-037 rather than §12.3 |
| `02` | §13 terminal-routes row (~L1933) | "spec §12.3 Home 3 is known-incomplete at four" |
| `02` | §19 TRACE-7 ≡ H-C-1 (~L2190) | State = **still owed** — founding-pack correction still directed / not closed |
| `04` | §10 terminal-routes row (~L824) | "Home 3 is known-incomplete at four" |
| `04` | §10.1 (~L877–889) | Full "why five not four" block still cites known-incomplete and directed FinalPlan item |

**Required repair (worker, same session):**

1. Restate every Home-3 incompleteness caveat as **resolved-at-five** — PRE-08 / DR-099 A-01 / DR-100 follow-through placed depth-zero in `spec §12.3` Home 3.
2. Close **TRACE-7 ≡ H-C-1** in `02` §19 (no longer "still owed").
3. Re-source the terminal-routes inventory: membership is now **spec §12.3 Home 3 (five) = DR-037 = §5.2 F-4**, with no ledger-vs-founding split remaining for this table. DR-037 remains the historical authority of the five; the founding-table defect that forced the exception is discharged.
4. Check the Home-3 **column routing** observation (orchestrator: former L1491 area — today the §13 row that routes terminal routes through `serve.condition_mark (Home 3)`): confirm the post-correction routing still holds or restate if the placement changed how the inventory cites the home.

**Why blocking:** the orchestrator note is contract for this ticket; leaving factually false incompleteness claims after a named founding-table correction freezes the wrong side of S-13's minting home and keeps a closed gap open in the disposition table.

---

## Residuals (non-blocking)

| # | Residual | Disposition |
|---|---|---|
| R1 | Historical AC-22 citations on the three-member `PRESENT\|EVICTED\|WITHHELD` provenance lines | Optional clean-up so greps do not re-open the deleted limb |
| R2 | Worker handoff claims FX-WIRE-02/03 "specified nowhere yet" | Current `06` already specifies both; no action required in 02/03/04 beyond optionally dropping "owed to PRE-03" language if PRE-03 has landed |
| R3 | Cross-doc A-11 (correct in 04 / FinalPlan) vs A-12 (wrong in 06/05/00) for executions pagination | Out of PRE-02 scope; flag for PRE-03 / those file owners |
| R4 | Valuation split is a judgment call | Argument holds; residual only for readers who stop at §11A.2 |
| R5 | `tier_source.DERIVED` residue correctly parked for S9 | Do not delete in rework of F1; leave the S9 trap intact |

---

## Summary of scrutiny-point answers (worker §SCRUTINY POINTS)

| # | Worker ask | Grok answer |
|---|---|---|
| 1 | Keep DERIVED recorded, or delete? | **Keep recorded** — matches S09's AUDIT trap. Do not delete unilaterally in PRE-02. |
| 2 | DR-089 carrier without new membership OK? | **Yes.** S-13 not engaged. |
| 3 | `claim_type` on `core.node` overreach? | **No** — necessary repair. |
| 4 | Valuation split reviewable either way | **Accepted** as lane-authority decision with coherent discipline argument; not a silent architecture change. |
| 5 | DR-077 recording split | **Holds** (AC-85, grain on propagation_run / node_strength_record). |
| 6 | `node.spawned` S→P | **Payload upgrade, not renamed meaning** — E2 clean. |
| 7 | FX-WIRE-02/03 cross-ticket | **IDs/slices consistent with 06**; "nowhere specified" claim is outdated residual only. |

---

## What would turn this APPROVED

Address **F1 only** (Home-3 restated as resolved-at-five across `02` and `04`; TRACE-7 closed; terminal-routes inventory re-sourced; Home-3 routing observation checked). No other blocking change required from this review.

---

# DELTA CHECK — rev 2 + rev 3 (2026-08-06)

| Field | Value |
|---|---|
| Ticket | `t_427c1757` |
| Reviewer | Grok (independent under DR-101) |
| Delta under review | rev 2 (F1 Home-3 / TRACE-7) + rev 3 (five Codex-driven fixes + SP-8 + R1/R2) |
| Authority | prior Grok review above; rev-2 handoff `READY FOR PEER REVIEW (rev 2)`; rev-3 handoff on ticket; the three architecture files |
| Independence | Did **not** open `reviews/pre-02-codex*` or any Codex verdict comment. Judged from files + worker handoffs only. |
| **Verdict** | **APPROVED** |

Prior F1 is **discharged**. The nine judgment calls previously approved are **unchanged** and still hold. Rev-3 delta does not introduce a blocking defect. Zero CONDITIONAL; no invented numbers.

---

## (1) F1 sites — present-tense five; TRACE-7 discharged — **PASS**

Rev-2 handoff listed **six** sites. All six verified live:

| # | Site | Live state |
|---|---|---|
| 1 | `02` §7.7 | **"The terminal-route count is five, in spec §12.3 itself."** Five routes listed; row 5 authority DR-037 / placement DR-099 A-01; split demoted to labelled history; FX-LG-04 prohibition **lifted**; TRACE-7 **DISCHARGED**. |
| 2 | `02` §13 preamble | Single source for condition marks, abstention kinds **and terminal routes** is spec §12.3; **"There is no longer an exception for terminal routes."** |
| 3 | `02` §13 terminal-routes row | Source = **spec §12.3 Home 3 — complete at five**; DR-037 as authority; constraint AC-65 / DR-037 / DR-099 A-01. |
| 4 | `02` §19 TRACE-7 ≡ H-C-1 | State = **DISCHARGED, 2026-08-06**; past-tense gap title; test prohibition lifted. |
| 5 | `04` §10 terminal-routes row | Source = **spec §12.3 Home 3 — complete at five**; same authority chain. |
| 6 | `04` §10.1 | Transcribed from §12.3 Home 3; workaround retired; **"That citation is now false and is removed"**; TRACE-7 DISCHARGED. |

**Home-3 column routing** (orchestrator item): re-checked and restated under the §13 table — Homes are membership homes not storage; Home 1 → `serve.abstention`, Homes 2+3 → `serve.condition_mark`; A-01 moved no storage; discriminator complete **22 + 5**.

**Residual grep:** `known-incomplete` appears only inside historical/retired sentences (lifted prohibition; removed citation). No live incompleteness claim. No `still owed` TRACE-7 phrasing.

**F1 blocking finding is closed.**

---

## (2) Rev-3 DERIVED rescope vs S09 audit trap — **PASS** (trap intact)

**What changed:** fixture half rescoped to **reachable** suppliers (`02` §3.7(c); `04` §16 row 2). Removal decision remains **ROUTED to S09** with `FX-ORPH-02` (BLOCKING) + `FX-DB-07` named (`02` §13 note, §17 item 7, §19 residue; `04` §5.1).

**S09 trap survival — the two deliberate quotations:**

| File | Form |
|---|---|
| `02` §13 note | Block-quoted AUDIT line including `rescope FX-DB-07 from "all three suppliers" to the reachable set (trap).` |
| `04` §5.1 | Inline quotation of the same S09 obligation with `'all three suppliers'`. |

Exact phrase `"all three suppliers"` / `'all three suppliers'` appears **only in those two quotations**. Narrative uses "REACHABLE suppliers" / "Rescoped from 'all three'" — does **not** assert a three-supplier production guarantee.

**Does rescope weaken the trap?** No. Rescoping the *fixture* to reachable suppliers **is the trap's first half already applied**; the *audit* (named producer or remove member under FX-ORPH-02) remains S09's entry obligation. Prior Grok limb (7) and residual R5 are honoured: DERIVED still recorded, not unilaterally deleted.

---

## (3) FX-WIRE-03 ownership scoping — **PASS** (DR-070 / tier discipline)

`04` §16 row 9 asserts: principal resolves **session → asker → answer ownership**; tier-2 `/inspection` and per-asker memory scope evaluate against this surface; **fixture asserts OWNERSHIP SCOPING AND ITS PROVENANCE — never authentication strength**; DR-070 provisional + charter-A5.2 revisit language retained. Slices **S0 + S13**.

Correction note records that UNAUTHENTICATED / SCOPE_FORBIDDEN **remain live contract rules** (§13.1.3, §13.2) but are **not** this fixture's subject — consistent with DR-070's out-of-scope ruling on authorization/credentials and with tier discipline (fixture attests ownership chain, not auth strength).

---

## (4) Settlement-watch INSERT-only vs AC-41 — **PASS**

`03` §5.5.0 third credential: read-only everywhere except three appends — `scorecard.answer_outcome`, its `ledger_entry` rows, **INSERT-only on `scorecard.scorecard_cell` for a new derivation version**; no UPDATE/DELETE on any of the three; no write on `serve`/`core`. `02` §3.9 calibration row matches.

**Rogue-version / masquerade analysis (recorded derivation version + read-side selection):**

| Attack shape | Blocked by |
|---|---|
| Silent rewrite of a **past** scorecard | **No UPDATE/DELETE** — past materialised rows stay immutable |
| Presenting a new version as if it were an old one | **Version-keyed new row set** — supersession, not edit; past versions remain addressable |
| Independent *definition* of scorecard values | Materialisation is **context 8's derivation** via row 24 `settlement` edge under rule 6; scheduler is **execution host, not second definer**; AC-41 definition remains "pure function of the ledger" (`02` §8) |

A compromised principal with INSERT rights could still append a **new** bad version that becomes current under latest-version selection — that is principal compromise on a materialisation host, not an in-place independent write path. AC-41's cache-with-replayable-definition property is kept by: immutable past versions, recorded derivation version, ledger as definition, settlement ownership of the rule. Three-way job target separation intact (scorecard+ledger / core / serve).

**AC-41 holds at the credential layer as claimed.**

---

## (5) SP-8 access-depth row — **PASS** (exact three; no fold)

`02` §13 inventory row **access depth**: members exactly `OPENED_FULL`, `PREVIEW_ONLY`, `ACCESS_BLOCKED`; source **spec §7.3 E-7** (verified at founding: same three + "primary versus secondary is recorded alongside it"); primary/secondary **"alongside … never folded into it"**; carrier `evidence.source_record` CHECK + §11A.1 preview-only rule. §11A.1 `source_record` names the enum and E-7 citation.

No six-member fold. No invented members.

---

## (6) `band_ceiling` single-input — **PASS** (matches `02` §7.6)

`04` §9.5: basis = **way-of-knowing distribution over load-bearing nodes alone**; DR-082 quoted with no second input; Plan.md AQ-1 dual-input recommendation recorded as **superseded SEAT-PROPOSAL**; structural reason (shared input would break independence) stated; Q51 outcomes left on `condition_marks[]` / `conformance_outcome`.

`02` §7.6 already carried single-input (way-of-knowing distribution; basis records the distribution the cap was computed from) — consistent; no invented coupling.

---

## (7) Zero CONDITIONAL; no invented numbers — **PASS**

| Check | Result |
|---|---|
| `CONDITIONAL` in the three files | **0 hits** |
| Invented numbers | **None.** Composition-budget / band cuts stay register rows; pagination limits unstated; only ledger-cited historical measurement (`0.97→0.5` DR-072) and structural counts (5/22/5) appear. |

---

## Prior nine judgment calls (standing) — **still PASS**

Valuation split; DR-089 TERMINAL carrier / no S-13 mint; `claim_type` on `core.node`; DR-076 E1/E2 + `node.spawned` S→P; `action_scope` member-attribute; DR-074 WITHHELD sweep; DERIVED recorded for S09; sample fold-ins; apps/scheduler three jobs + purity fence + DR-101 skip — **unchanged by rev 2/3; not re-opened.**

---

## Residuals after delta

| # | Residual | Disposition |
|---|---|---|
| R1 (prior) | AC-22 status-enum provenance clean-up | **Taken in rev 3** — provenance lines now AC-12/AC-26 with DR-074 reason-died note. Closed. |
| R2 (prior) | "FX-WIRE owed to PRE-03 / nowhere specified" | **Taken in rev 3** — 06 owns specification; 04 owns obligation. Closed. |
| R3 (prior) | A-11 vs A-12 mis-citation in 06/05/00 | **Routed to PRE-03** (out of file contract). Still out of PRE-02 scope. |
| R4 (prior) | Valuation split residual for §11A.2-only readers | Non-blocking; judgment call stands. |
| R5 (prior) | Keep DERIVED for S09 trap | **Honoured** — trap quotations intact; fixture half rescoped. |

No new residual rises to CHANGES REQUESTED.

---

## Delta verdict

**APPROVED.** F1 discharged at all six sites; TRACE-7 closed; rev-3 five-finding delta + SP-8 + R1/R2 hold under red-team; S09 trap intact; AC-41 INSERT-only reasoning holds; zero CONDITIONAL; no invented numbers; standing judgment calls preserved.
