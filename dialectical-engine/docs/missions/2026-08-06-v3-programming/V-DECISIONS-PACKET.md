# V DECISIONS PACKET — PROG-V3-R1 night run

Night Mode (DR-103): rows queue here for V's morning sitting. Each row: what
is asked, why it blocks, options with the seat's recommendation
(SEAT-PROPOSAL — never authority), and where the answer lands. Rule by
replying in chat or annotating this file; the orchestrator logs the DR rows.

## VG-01 — the pre-S0 gate (BLOCKS S00 and therefore all implementation)

### Row 1 · GPG-3: the four bootstrap pin VALUES
AC-76/DR-039 bar any agent from inventing these. The mechanism (bootstrap
file + one loader + FX-REG-01 equality) is built once values exist.

| Key | SEAT-PROPOSAL (confirm or replace) |
|---|---|
| `nodeRuntimeVersion` | the current even-numbered Node LTS line at your sitting (state the major, e.g. "22" or "24") |
| `pnpmVersion` | the current stable major (state it, e.g. "10") |
| `postgresMajorVersion` | the current stable major (state it, e.g. "17") |
| `typescriptVersion` | the current stable 5.x minor (state it, e.g. "5.9") |

The seat deliberately proposes *"current stable/LTS at sitting time"* rather
than numerals — naming exact numerals from stale knowledge would be an
invented value with authority it doesn't have. One word per row from you
("latest LTS is fine" also works — the worker then pins what `node --version`
etc. resolve on this machine and records the resolved numerals in the DR row).

### Row 2 · GPG-2: stack confirmation (one yes/no)
Confirm the ADR stack stands as ratified wholesale by DR-098: TypeScript on
Node LTS · pnpm workspace · Fastify JSON front door · Drizzle + drizzle-kit
over Postgres (hand-SQL invariants) · Postgres SKIP LOCKED queue ·
Vitest/fast-check/Testcontainers. **Recommendation: yes** (any replacement
re-instantiates only Plan §2.2–§2.7 per Plan §9).

### Row 3 · GPG-4: initial version identifiers (yes/no on a proposal)
SEAT-PROPOSAL: `packages/contract` starts at **0.1.0**; the first ratified
register set is **register_version 1** (an immutable row-set id, not semver).
Both are identifiers, not behavior. **Recommendation: accept.**

## VG-02 — the register/ratification sitting (BLOCKS S06, S09, S15)
Agenda assembles tonight as PRE-05/06/07 land their artifacts. Expected: DR-093
71-row split · DR-084 eight citation routes · DR-083 activation table · REG-8
member shape · pending-value register rows (tier values, mapping tables, band
vocabulary).

### Row 4 · DR-083 activation table — ratify `docs/architecture/10-row-contracts.md`
Landed tonight (PRE-05): 71/71 rows, written predicates quote-derived from
spec §3, checksum 13 MACHINE / 57 HYBRID / 1 LLM preserved. Riding items for
the same yes/no: (a) **three POLICY_BLOCKED filings** (Q14, Q40, R6 — DR-013
lineage rows with no fire condition anywhere in the spec; candidate readings
named, none adopted); (b) the **SP-5 derivation** rescuing Q26/Q31 via §3.6's
stage law (reject it and POLICY_BLOCKED becomes 5); (c) two structural
derivations: the opening activation event is WAIT for the 65 conditional rows,
and per-item rows file 0..N. **Recommendation: ratify with (a)–(c) as read.**
Rev-2 additions (from the review fix cycle — two former silent adoptions are
now explicit decisions): **SP-9** — Q61's run-creation filing: does the run
carry 71 activation rows (Q61 INACTIVE with the watch handle as evidence) or
70 (no in-run record at all)? ADR-0009's initial-event-per-row law vs DR-089's
removal of the row from the run lifecycle. Recommendation: 71 with INACTIVE +
watch handle (keeps the per-row law universal). **SP-3** — Q5/R1/R5/R8 carry
their ordering elements as written CONJUNCTS; Q4's deadline reading is NOT
generalized to them without your word. Options: leave as conjuncts (risk:
rows can self-deactivate as the run advances — Q4's own warned failure mode)
or extend Q4's deadline rule (deletes four written trigger elements).
Recommendation: extend the deadline rule, recorded as a ruling.

### Row 5 · DR-093 split — ratify `ratification/71-row-classification.md`
Landed tonight (PRE-06): **69 correctness / 2 enrichment** (checksum 13/57/1
preserved; per-stage tallies inside). LRD-1 discharged by **Q27** (primary,
node-scoped — the only candidate whose SKIPPED-BY-BUDGET mark projects onto a
node as FX-C52-06's fixture needs) + **Q49** (secondary, answer-scoped). All
30 protected-core rows correctness; neither enrichment row touches the core.
Ten pull-outs offered in the DR-061 shape; two RIDERS need your yes/no with
the batch: **CP-9** — "standard-and-above" governs *activation*, never class;
**CP-10** — a limb-split row takes the class of its strictest limb.
**Recommendation: ratify wholesale with both riders as read** (the seat's §8.1
answers the why-only-two challenge from spec §21.2's own words).
Rev-2 rider **(d)**: exactly one conjunct on one row (Q49's no-feedback
contract, C-6/C-7) rests on CARRIED-DESIGN evidence, never promoted by any
ledger row — ratifying (d) promotes it; declining reverts Q49 to correctness
(CP-1 option a) and LRD-1 still holds via Q27. **Recommendation: ratify (d).**

### Row 6 · DR-084 routes — ratify `ratification/citation-routes.md`
Landed tonight (PRE-07): eight typed citation-failure routes as a six-rung
first-failure ladder with a written closure proof (totality + disjointness +
one named producer per member; no generic "other" — R2 is the ladder's root,
defined positively). Three block/refuse, five serve labelled, all eight write
rows, none silent. Riding items for the same sitting: (a) the **§12.3
amendment draft** — two new Home-2 condition marks (`UNVERIFIED-CITATION`,
`CITATION-RECHECK-FAILED` — renamed in rev 2 from CITATION-WITHDRAWN so no
unratified remedy smuggles into §12.3; rows 23–24), paste-ready, YOURS to
apply (S-13); note it
deliberately trips AC-65/FX-LG-04's count gates until follow-through lands —
authorize that follow-through with it; (b) **SP-1**: should `VERIFIED` be a
ninth member, or the proposed separate two-member outcome column
(recommendation: the column — E-8 says *failures* take the eight); (c)
**SP-4**: R6 merges source-side limit with engine-side compare failure — one
route or two (recommendation: one, same serve consequence); (d) the route
ORDER itself is proposed as ratified (currency before exactness).
**Recommendation: ratify wholesale with the riders as recommended.**

### Q-N5 · SP-10: `DEFECT`'s cause list in spec §12.3 (yours alone)
Mark #14 names two causes; S-7's state machine gives the badge to a third
branch (Q51 provenance failure reaching COMPONENTS_ONLY). §12.3-scoped edit —
V's minting authority. **Recommendation: authorize adding the third cause.**

## Questions raised mid-night

### Q-N1 · Q46's activation state when Q34's two ledger stamps are missing
No named state exists for this case; INACTIVE would falsely read as
*satisfied*. Options: POLICY_BLOCKED (loud, consistent with spec §1's
never-silent rule) · WAIT (implies it could settle, which it cannot without
the stamps) · a new state (S-13 mint — heavy). **Recommendation:
POLICY_BLOCKED.**

### Q-N2 · OD-S-03(b)'s "careful wording" vs Q52's exclusion of terminal non-answers
The ratified survivor obligation collides with Q52's explicit exclusion.
Options: wording obligation binds via Q51's always-fires path (Q52 exclusion
stands) · extend Q52 to terminal non-answers (spec §12.3-adjacent edit).
**Recommendation: the first — no founding edit needed.**

### Q-N4 · Adjudication record (confirm or veto): WITHHELD stays reachable
PRE-04's worker flagged `served_number.WITHHELD` as possibly unreachable after
DR-074. Orchestrator adjudicated with source: manifest §4.2b (OD-05) — strict-
and has no identity element; any unjudged/abstained conjunct ⇒ parent emits no
number, components served (AC-26's limb) — so only the undeclared-operator
producer died. The member stands. **Recommendation: confirm as recorded.**

### Q-N3 · Three stale founding-status strings (authorize a surgical correction?)
spec §3.8/§3.13 still call Q43's conjunct OPEN, §3.11 calls Q59's
`stage11Rollout` OPEN, and §3.13 claims "two residual runnability holes
remain" — all falsified by DR-061's ratified OD-S-01/02/03. Same shape as
A-01: mechanical, ledger-backed, founding-doc scope (needs your word — S-13
discipline). **Recommendation: authorize; it becomes a PRE-11 micro-ticket.**
