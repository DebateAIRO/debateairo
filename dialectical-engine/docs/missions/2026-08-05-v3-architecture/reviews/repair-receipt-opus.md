# Repair receipt — Opus lens (g3-reviewer), Plan.md rev 3

Receipt only, not a review round. Verifies that the six findings from
`reviews/opus-plan-rereview-2.md` (O-39…O-44) landed in
`architecture/Plan.md` rev 3 (1852 lines). No verdict, no re-litigation, no new
findings. Author's claims read from `reviews/repair-annex-confirmation.md`;
every row below was checked against Plan.md itself.

| # | Sev | Landed | Evidence |
|---|---|---|---|
| **O-39** | MAJOR | **YES** | §2.6 layout line 513: "`replay/` … **Imports ONLY** packages/published-arithmetic and no other workspace package (§2.5a). **It does NOT carry its own agg/sigma/product** — a local copy is the second scoring implementation AC-14/AC-85 forbid"; §8 S1 deliverable line 1737 restated identically ("never a local copy of `agg`/`σ`/product"); the gate gap closed at §2.5 — the isolation proof "**fails if `apps/replay` declares any local arithmetic symbol of its own**". |
| **O-40** | MAJOR | **YES** | Both limbs. Rule (iii), §8 line ~1804: "Components-only may be *entered at compose time* only by AC-53's three ruled routes; a *post-serve* replay eviction transitions an already-served answer to the same surface (§4.4 clause 3), **which is a degradation of a served answer rather than a fourth compose-time route**", with my both-shapes-breach reasoning reproduced and the "**For V, priced explicitly**" line on the withdrawn composed text. Consumer limb, §4.4 clause 2: "**Its named served consumers, so it is not an orphan** (AC-77, §8 rule (ii); the never-called list is BLOCKING): the **tier-2 authorized record** … and the **execution-ledger digest**". |
| **O-41** | MINOR | **YES** | §2.5: the isolation proof's "expected content is pinned at **SYMBOL granularity, not package granularity: exactly `agg`, `σ` and `product`**", with the reason ("Package granularity would be satisfied by a `published-arithmetic` that had grown past the published definitions"), plus "A one-line CI assertion pins `packages/published-arithmetic`'s **exported surface** to the same three symbols"; §2.6 layout carries the zero-deps-insufficient note; §7 doc 7 repeats both. |
| **O-42** | MINOR | **YES** | §4.1a: "**`UPDATE` and `DELETE` are both revoked on this table** (grant revocation plus a raising trigger)", citing §4.1 standing rule 1 and AC-05, with the reason stated ("Revoking `UPDATE` alone would leave a `DELETE` on `run` free to…"); fixture (a) "`UPDATE` and `DELETE` against the frozen head both raise" carried into §7 doc 7 and S1's gate list. |
| **O-43** | MINOR | **YES** | §4.1a: `run_row_activation` is now "one **immutable** row per `(run_id, …)`" carrying `predicate_ref`, with `{state, predicate_inputs (as evaluated at this transition), skip_evidence, at_seq}` on the append-only event stream, under an explicit "**One discipline per table.**" and the reason I gave ("they are written *at* a transition — `skip_evidence` by definition at the…"). |
| **O-44** | MINOR | **YES** | All three limbs. (1) §6.6 UI-9 now reads "**`condition_mark_node` is the single authoritative store**… and there is **no `affected_node_ids` array on the mark row**"; the only two remaining occurrences of that identifier in the file are both negations. (2) §6.10 preamble line 1679: "**Three** questions this seat raises rather than answers." (3) §2.6 layout line 495 carries a `battery/decision/` entry, alongside its `kernel`-only dependency row and structural rule 5. |

**Must-fix-before-C4 items.** Confirmed: the two items I flagged for human
confirmation are **O-39** and **O-40**, and both are in the table above as
**YES**.

**Residual risks R-1…R-6 — left as accepted records, not silently actioned.**
Confirmed by inspection, not by the author's word:

- **R-1** (§5.2's "full record" read as the structured `conformance_record`) —
  unchanged and still a settled reading, not promoted to a question; §6.10 still
  carries three AQ rows, §6.8 still reads 56 / grand total 67 (R 20 · D 18 ·
  V 29) and "**28 distinct questions for V**". No new V-QUESTION was minted from
  any residual risk.
- **R-2** (eviction withdraws the whole composed answer) — recorded, not
  reversed: §4.4 clause 3 stands, and rule (iii)'s new "For V, priced
  explicitly" line surfaces the cost rather than changing the design.
- **R-3** (`UNDERCUT_TRANSMISSION` "NOT WRITABLE" by convention) — §4.2(4)
  unchanged; no enforcement mechanism added, A-1 still S2's entry criterion.
- **R-4** (standing-misconfiguration counter's consequence unnamed) — §3.2 Seam C
  line 782 still reads "A ledger-derived counter classifies every capped run
  against the two predicates" with no consequence stated. Untouched, as
  accepted.
- **R-5** (S0 gate BLOCK outcomes unnamed) — the S0 trace still shows
  `PASS | BLOCK` without naming each block's terminal. *(Adjacent: a
  Codex-directed C-13 edit expanded GATE 4 to Q51's three limbs and added two
  Q51 fixtures; that is a different item and does not action R-5.)*
- **R-6** (28 open questions, 12 blocking at or before S6) — the counts are
  unchanged, which is the point of the record.

**Applied differently than directed.** Nothing of mine was applied contrary to
direction. Two of my items landed **inside larger Codex-directed edits and were
extended by them**, consistently rather than contrarily: O-43's move of
`skip_evidence` / `predicate_inputs` onto the event arrived within C-18's
activation rework, which additionally made the activation row immutable and
`last_evaluated_at_seq` derived; and O-40's suppression carrier is now
subsumed by C-19's new §4.4 clause 2a, a single append-only `served_number_event`
carrying both eviction transitions, with `segment_suppression` retained and its
consumers named as I required.

---

*Receipt by g3-reviewer (Opus 5), independent seat, 2026-08-05. Read-only: no
file other than this one was created or edited. No `codex-*` review file was
read in any round; `repair-annex-confirmation.md` was supplied by the
coordinator as a receipt input.*
