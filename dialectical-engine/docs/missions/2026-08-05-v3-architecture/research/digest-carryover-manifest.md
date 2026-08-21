# Digest — `docs/founding/carryover-manifest.md`

Architecture-facing digest of founding artifact 2 of 4 (DR-001). Source: `docs/founding/carryover-manifest.md`,
revision 4, 2394 lines, header line 1 `ACCEPTED — DR-067 (2026-08-05)`. Vocabulary cross-checked against
`docs/founding/GLOSSARY.md`.

**Scope of this digest.** It reports what the manifest says, with citations. It proposes no architecture and
invents no requirements. Where the manifest and the decisions ledger disagree, the manifest's own §2.2 order of
authority item 1 rules that *"the DR wins and this manifest is wrong"* — such cases are flagged explicitly in §7.0
and §8.

**Two reading notes an architect needs before opening the manifest.**

1. **The manifest froze before its last three rulings.** Its authority line (line 7) cites `DR-001 … DR-064`, but
   `docs/founding/decisions-ledger.md` carries **DR-065, DR-066 and DR-067**. DR-066 resolves manifest §16.2
   items 1–2 — the two items the manifest itself leaves open — and **contradicts** manifest §6.3 on the undercut
   carrier. DR-067 is the acceptance. §7.0 records these; §8 A-1 records the contradiction. Manifest line 8
   ("Status: draft; awaiting the orchestrator's grep-level final audit … then gate 31 and V acceptance") is stale
   text superseded by DR-067.
2. **The manifest's own citations do not resolve in this repository.** Every `../wayfinder/…`, `../research/…`
   and `../reviews/…` path (used throughout, e.g. §4.5, §10.1–10.5, §15) points outside `docs/`, which contains
   only `founding/` and `missions/`. Under §14 consequence 1 the manifest **is** the clean-room interface and a
   fact not in it must be obtained by amending it — so the unresolvable evidence chain is not a blocker for a
   clean-room implementer, but it means no claim in this digest can be deepened past the manifest's own wording.

---

## 1. Document map

| § | Lines | What it governs |
|---|---|---|
| header | 1–19 | Acceptance stamp (DR-067), authority pointer, revision-4 changelog; declares zero open decisions and zero candidate spans. |
| **1** | 22–80 | How to read the document: V3 is greenfield; six V2 "organs" are kept as **designs**, never as outputs to reproduce (DR-033, DR-047, DR-003); stranger-facing vocabulary; the stranger test governs the document itself (DR-018, DR-031). |
| **2.1** | 86–107 | The three authority tags — `RULED(DR-n)` / `CARRIED-DESIGN` / `CANDIDATE(OD-n)` — and the rule that no open decision may carry a mandatory answer. As of DR-062 there are no `CANDIDATE` spans. |
| **2.2** | 109–148 | The eleven-item order of authority (ledger supreme; no V2 conformance; clean-room; behavior-only except V's stack constraints; DR-027 recording; DR-034 replay; DR-028 no-number; DR-039 no invented measurements; house rules as floors; composition final). Constants are register source material only (DR-023). |
| **3** | 152–174 | The kept organ set and the **organ↔battery-stage table**, ruled final and non-vetoable (DR-030, DR-056a). Everything outside the six organs is greenfield. |
| **3.1** | 176–193 | The Model B perimeter (DR-035): what comes in from V2's in-memory scoring experiment (labeled arrow, per-node uncertainty) and what is explicitly excluded. |
| **4** | 197–454 | **Organ 1 — the scoring engine.** Purpose; the exact DF-QuAD arithmetic (a–d); M1–M3 and the way-of-knowing, restatement, value-overlay and fragility clauses (e–k); I/O and fingerprint (4.3); edge-case table (4.4); the two literature vectors and the property statements (4.5); stage owner (4.6). |
| **5** | 458–640 | **Organ 2 — the per-node judge contract.** Claim normalization, child context, prompt honesty constraints, output schema, parsing, the deterministic reducer, plural judges, dispersion, the working disagreement flag, correlated-error discounting, earned judge weight, lineage vocabulary, typed non-answers (5.2a–m); I/O (5.3); failure table (5.4); stage owner (5.5). |
| **6** | 644–831 | **Organ 3 — the one graph.** Node identity/structure/content, three orthogonal lifecycles, write-time enforcement, the 13-item per-node epistemic record (6.2); the arrow, three distinct relations, defeaters, child/arrow kind vocabularies, residuals (6.3); I/O and edge cases (6.4); stage owner (6.5). |
| **7** | 835–931 | **Organ 4 — decision→spawn plumbing.** Pure-function policy, fixed precedence, the categorical-only steering law, blockers, decision→work mapping, the decision audit invariants, loop termination, typed budget skips (7.2a–h); I/O and edge cases (7.3); stage owner (7.4). |
| **8** | 935–1074 | **Organ 5 — execution ledger and receipts.** The persistence mechanism, input hash, contract hash, cache identity, the four reconstruction paths, append-only total order (8.2a–g); the DR-034 replay law and the DR-027 recording extension and DR-054 inspection handle (8.3); I/O and edge cases (8.4); stage owner (8.5). |
| **9** | 1078–1265 | **Organ 6 — serve layer + internal debug facet.** Serve preconditions, sanitizing, coverage reconciliation, stale expiry, honest-degradation vocabulary, suppression/shadow mode, the serve-layer obligation list, serve composition, serve termination, the wire boundary (9.2a–j); the debug facet's content, placement, failure tiers and node set (9.3); I/O and edge cases (9.4); stage owner (9.5). |
| **10** | 1269–1473 | **The defect register D1–D5** — five MUST-NOT-REPRODUCE clauses, each with mechanism, V2 `file:line` evidence, measured consequence, what V2 does right, and what V3 does instead. |
| **11** | 1477–1503 | The eight Proposal-B house rules H1–H8 carried as required behaviors (DR-029), each with its battery successor and standing; plus convergence machinery as the measurable half of H8. |
| **12.1** | 1509–1536 | The governing test rulings: DR-033 kills the MUST-MATCH class; DR-047 retires the race; two questions rerouted to the Quality Charter. |
| **12.2** | 1538–1595 | **The four layers of V3's test base**: literature vectors + corrected properties; P-D1…P-D5; H1–H8 gates; law gates. Plus the scenario-coverage inventory. |
| **12.3** | 1597–1608 | What V2 is still good for: disease documentation and design source material. Informal human comparison only. |
| **12.4** | 1610–2188 | **The register — ratified and closed** (DR-062, all 17 rows wholesale) plus 6 earlier-closed/rerouted rows. Each row prints what was decided, what follows, the complete options, and the adopted option. |
| **13.1** | 2197–2219 | **Stack constraint: Postgres**, including the observability layer (DR-024) and the model ledger (DR-046); the four SQLite-shaped V2 behaviors and which property carries. |
| **13.2** | 2221–2244 | The V3 flag/config register is drawn fresh and V-ratified before production (DR-023); the scoring-relevant V2 flag inventory as source material; the knobs already ruled (DR-019/020/021/052). |
| **14** | 2248–2272 | **Clean-room process control** (DR-003, DR-033): the binding dirty-room / clean-room role split, the manifest-as-interface rule, and the literature-vector exemption. |
| **15** | 2276–2343 | Traceability index — every tagged clause to its DR or research source. |
| **16** | 2346–2394 | Open tensions: §16.1 withdraws all six revision-3 entries with dated dispositions; §16.2 records three new items arising from the ratification. |

---

## 2. Carried organ inventory

### 2.0 The organ↔stage table (§3, `RULED — DR-030 · DR-056(a)`, non-vetoable per §2.2 item 11)

| # | Organ | One-sentence identity (§3) | Battery stage owner(s) | § |
|---|---|---|---|---|
| 1 | Scoring engine (re-specified DF-QuAD/QBAF) | Turns judged nodes and typed arrows into one number per node, with receipts. | **WEIGH + COMPOSE** | 4 |
| 2 | Per-node judge contract | Gets one model's structured grade for one node and reduces it to numbers deterministically. | **WEIGH** | 5 |
| 3 | The one graph (node + arrow shapes) | The single object every stage reads and writes. | **SPLIT** owns it as an object; substrate for all stages | 6 |
| 4 | Decision→spawn plumbing | Turns a per-node exploration decision into new work, audibly and only on categorical grounds. | **SPLIT** mechanics | 7 |
| 5 | Execution ledger and receipts | Records everything executed, before the math, so every served number is replayable. | **All stages write; SERVE reads** | 8 |
| 6 | Serve layer + internal debug facet | The one place answers leave the system, plus an operator-only view of the graph's internals. | **SERVE** | 9 |

Three composition judgements are ruled final (§3, DR-030 / DR-056a): **(J1)** one scoring engine shared by WEIGH
and COMPOSE; **(J2)** one graph — SPLIT's children and defeaters *are* the nodes and typed arrows; **(J3)** SERVE
reads a new battery serve layer built on the execution ledger, with V2's `qbaf_debug` content re-specified as that
layer's internal debug facet. Stages **LOCK, ROUTE, AIM, HARVEST, RUN, CROSS, SETTLE are greenfield** and
constrained by nothing in this manifest except §2.2's cross-cutting laws (§3, last paragraph).

### 2.1 Organ 1 — scoring engine (§4)

**Specified behavior.** Take a graph of claims each carrying a judge-produced base score τ, plus typed arrows, and
produce one number per claim (§4.1). Full arithmetic in §4 of this digest. Under DR-030(J1) it is the **only**
scoring math in V3 — one set of receipts rather than two.

**Must be:** the published DF-QuAD arithmetic (§4.2a, §4.2b); typed arrows as first-class objects able to target a
non-parent node (§4.2c, DR-022 as narrowed by DR-035, DR-030 J2); topological evaluation with a deterministic,
**recorded** arrow order so V3's own replay is exact (§4.2a, `CARRIED-DESIGN`); loop-free by construction with
three enforcement layers (§4.2d, DR-056b + DR-042); output as a **per-node record joining the number to its
origin, never a flat `node_id → float` map** (§4.3, `RULED — D4 clause §10.4`); a graph fingerprint that is
input-order-independent, changes when any τ changes, and differs between two operator selections on the same graph
(§4.3, `CARRIED-DESIGN`); a ledger row for every computation (§4.3, DR-027).

**Must not be:** no default τ at any layer (§4.2e, DR-028); no derived interior base score from children — *"a
number computed from nothing, which is D1"* (§4.2e); no free-settable arrow strength (§4.2c, DR-062 OD-06); no
sensitivity fed back into τ or arrow strength — *"weights → strengths → sensitivity → weights has no declared
fixed point"* (§4.2k, `CARRIED-DESIGN`); no value weight touching τ, arrow strengths, strengths or provenance
(§4.2j, DR-017); no cap constant on supporter count and no count-insensitive aggregator (§4.2g, DR-062 OD-01); no
numeric ceiling per way-of-knowing (§4.2h, DR-062 OD-12); no similarity **gate** on restatement, flag only
(§4.2i, DR-062 OD-08); no partial result or fixed-point approximation on a cycle (§4.2d); no silent unmapped
marker on an unknown node or arrow kind — loud failure (§4.4).

**Minimum output field list** (§4.3, `CARRIED-DESIGN`): `{strength, tau_source, way_of_knowing, cluster_id,
judged_by, abstained, supported_by, attacked_by, operator_used}`, plus the graph fingerprint, the operator
identifier emitted **by the computing component**, the leverage ranking and fragility table (§4.2k), the
resolution-chain level that supplied the operator (DR-062 OD-22), and arrow-lift markers where an arrow passed an
unjudged interior node (DR-062 OD-02).

### 2.2 Organ 2 — per-node judge contract (§5)

**Specified behavior.** For one node, obtain a structured model assessment, reduce it **deterministically** to a
small number vector plus human-legible explanation, and persist both raw output and reduced result under an
identity pinning every semantic input (§5.1). The determinism is what makes DR-034's replay law achievable.

**Must be:** code-first claim typing with a bounded model call only on `unknown` (§5.2a, DR-062 OD-16), recording
`substance:` and `enforcement:` per DR-037; closed type set, explicit `mixed`, explicit `unknown`, hedges never
changing the type, unmatched scope **absent rather than guessed** (§5.2a); direct supporting/attacking children
only in child context, in stable order, excerpts truncated at word boundaries and marked truncated, non-truncated
excerpts byte-identical (§5.2b); prompt honesty constraints — never invent evidence/citations/sources; relevance
scored against the question actually asked; counterargument strength against the strongest **real** attack, or
against plausible counters **while saying so** (§5.2c); five required output sub-objects (steelman, critic,
evidence, context, fallacy), all declared numbers validated to `[0,1]`, typed fatal flags `{type, severity,
description}` (§5.2d); parsing strategies in strict order with **parse failure and schema failure kept
distinguishable** (§5.2e); a deterministic reducer with two intermediates, two published compositions branching on
claim type with the branch **emitted**, ordered score caps each recording what/to what/why/by what, an enumerable
uncertainty ladder, uncertainty drivers in fixed never-reordered order, typed holes, recommended investigations
with declared priority arithmetic and sort key, three-band labels, and a two-directional rationale naming the
weakest link (§5.2f); the evidence-free composition covering **normative, definitional and value-laden** claims,
selected from a **claim-type → composition map held as data, never a source literal** (§5.2f, DR-062 OD-17);
opt-in panels where each member has its own judge role and contract hash and every failure mode yields an honest
typed note (§5.2g); dispersion measured across ≥2 distinct judgements with a **prepended** dispersion driver
(§5.2h); correlated-error grouping by family in **first-appearance order**, non-compounding discount, unknown
families never discounted against each other, raw provider/model strings never embedded in a served weight record
(§5.2j); earned judge weight from outcome scorecards with ~20 % exploration share, probation for new models, and a
model ledger in Postgres (§5.2k, DR-026, DR-046); "independence unknown" with a typed reason, never a default of
"independent" (§5.2l); one abstention kind plus several condition marks, model chooses / machine enforces (§5.2m,
DR-044 Q55, DR-051).

**Must not be:** no replacement of the score object by a weighted mean when calibration is on — *"disagreement is
surfaced, not smoothed"* (§5.2h, DR-032); no un-fireable disagreement gate (§5.2i, DR-032 + DR-063 VR-1); no
silent drop of an unparseable stored panel assessment — the drop is an executed event and must be recorded and
digest-visible (§5.4, DR-027); no silently reused same-lineage judge where independence is required (§5.4, DR-013
/ DR-014 / DR-055); no default τ from a judge that produced nothing usable (§5.4, DR-028); raw judge text is never
included in a served item (§5.3).

**Enum ownership.** §5.2(m) states explicitly that the typed-non-answer enum's membership is **not restated
here**; its single source is `requirements-spec.md` §12.3 (Requirements S-11…S-13). This manifest cites by
reference and never duplicates.

### 2.3 Organ 3 — the one graph (§6)

**Node must be:** opaque stable never-reused identity; owning question; structural lineage; depth; sibling
ordinal banded by child kind; and a **materialized path** — *"the cheap subtree operator that makes
ancestor-triggered invalidation possible at all"* (§6.2). Content: non-blank claim when served; a pointer to the
currently authoritative body text on an append-only revision record — history with exactly one live text; a typed
annex for evidence nodes treated as empty when absent (§6.2).

**Three orthogonal lifecycles** (§6.2, `CARRIED-DESIGN`):
1. **Generation status** — `pending → complete | failed | stale`, plus a derived-only never-persisted
   "generating". Failure is bounded: node fails, decision becomes a stop with an exhaustion reason, path is
   abandoned, **the answer survives**. `stale` = invalidated and never scored; regenerating marks every descendant
   stale by path prefix and cancels their work.
2. **Path status** — `active | abandoned`. Abandonment is a **pause, not a deletion**: still scored, still an
   arrow endpoint, reopenable on new grounded evidence.
3. **Exploration decision** — closed set `continue, deepen, seek_evidence, challenge, abandon, reopen`, plus
   reason.

**Which states enter the scored graph:** everything except `stale`, and **the debug facet uses the identical node
set**, read from the run's declared set rather than re-derived (§6.2, §6.4, §9.3, DR-062 OD-18).

**Write-time enforcement** (§6.2): node type, lifecycle vocabularies, non-blank claim, path/depth consistency, and
acyclicity (DR-056b) are enforced **at write time, not by convention**.

**The per-node epistemic record lives on the node** (§6.2, DR-018 / DR-031(R9, Q27, Q28) / DR-019), 13 items
ordered by how much each blocks the stranger law: (1) plain-language restatement using the canonical
`stranger_restatement` contract at `requirements-spec.md` §12.7, **cited by name, never restated**, with the
verdict-only reading of its action field (DR-061 OD-S-06); (2) per-node revision trigger; (3) node-level
provenance projection readable at the node, not a join away; (4) stranger-test status able to block serving, with
coverage exhaustive for load-bearing nodes and sampled otherwise at a rate **frozen at run start** whose ratchet
applies to the *next* run (DR-019, DR-052); (5) no bare numbers in the top layer; (6) the judge's "why it matters"
sentence and its typed relation to the root; (7) per-node certainty in words, not a three-value enum; (8) "what
this shows" for extracted evidence; (9) self-describing node identity — a **perspective node is a grouping device,
not a scored claim**: it carries perspective identity, label and text, emits **no arrow**, its children attach to
the nearest real claim above, and the "this whole angle is weak" summary is served as a **computed roll-up**
(DR-062 OD-03); (10) no placeholder served as a claim; (11) structural drops visible at the node; (12) the
residual objection set as a **field of the fact bundle** (DR-049); (13) the uncovered-scope statement (DR-031
Q27).

**Arrow must be:** a **stored object, not derived at read time** (§6.3, DR-030 J2, DR-022→DR-035), shaped
`{source, target, polarity ∈ {support, attack}, strength ∈ [0,1], kind}` with §4.2(c) semantics. V2 has **no edge
table at all** and recomputes every relation from `(node_type, parent_id)` — named the largest structural gap.

**Three relations V2 collapses into one parent pointer are three relations** (§6.3): (1) **containment/lineage**
for invalidation and subtree summaries; (2) **argumentative relation** as an arrow in its own right — in V3 a node
can support one parent and attack another, and can relate to a non-parent; (3) **evidential relation** derived
from a verdict keyed to the evidence node, fail-closed — a supporting verdict gives a support arrow weighted by
the verifier's grounded score **only if** that score is a real number in range; unverifiable, pending, unknown,
absent or malformed gives **no arrow**; a **contradicting** verdict gives an **attack arrow with a typed unknown
magnitude** that is visible but contributes nothing (DR-062 OD-04).

**Defeaters are first-class** (§6.3, DR-030 J2, DR-041 Q26): defeater generation is a **system obligation** routed
to a differently-categorized model; supports-only output is kept rather than discarded; author self-attack
weakness is recorded as a scorecard process fact; **a node is incomplete until its defeater set is non-empty or
explicitly exhaustion-marked**. DR-042 adds the **shared-crux sub-claim** kind.

**Ratified vocabularies** (§6.3, DR-062 OD-19). **Child kinds:** support, attack, **defeater**, **shared-crux
sub-claim**, **necessary condition**, **sub-question**, **assumption**, **scope carve-out** — necessary conditions
being what strict-and exists to combine, scope carve-outs being where Q27's uncovered-scope statement lands.
**Arrow kinds:** **rebutting** (denying the claim) vs **undercutting** (granting the claim while denying it
supports its parent). Manifest first-release shape: *"an undercut is recorded as an attack on the **target-side
justification** and marked as an undercut, rather than as arrow-on-arrow arithmetic, which the engine has no shape
for"*. **⚠ Superseded — see §7.0 and §8 A-1: DR-066 rules the undercut targets the support EDGE.** Both
vocabularies are **closed declared enums with loud failure on anything unknown** (§4.4, §6.3, §6.4).

**Standing after failed falsification** (§6.2, DR-041 Q29): no kill on author failure; the falsifier hunt rotates
across models; at exhaustion the piece wears a visible `UNFALSIFIED-AFTER-ROTATION` mark that **degrades standing
— never silent deletion, never silent full citizenship**, placed by DR-051 in the closed condition-marks enum.

### 2.4 Organ 4 — decision→spawn plumbing (§7)

**Must be:** a **pure function** over two typed signal bundles (score signal: node identity, claim type, numeric
scores, holes, fatal flags, recommended actions, persisted cross-judge disagreement flag; optional evidence
signal: status, grounded score, uncertainty, entailment verdict, caveats) plus current path state (§7.2a). Fixed
precedence: **reopen → challenge → seek evidence → deepen → abandon → continue** (§7.2b).

**The categorical-only steering law** (§7.2c, `CARRIED-DESIGN`, "load-bearing"): every decision is classified
`categorical` or `scalar` by whether *at least one* firing reason was a categorical predicate — an evidence
status, an entailment verdict, a fatal-flag membership, a claim-type evidence requirement, a persisted
disagreement label — rather than a threshold crossing on an uncalibrated judge scalar. **Only categorically
grounded decisions may spawn real work. Unclassified decisions fail closed to scalar.** Blockers (reasons *not* to
abandon) are recorded for audit but **explicitly excluded** from the classification (§7.2d).

**The decision audit invariants** (§7.2f) — architecture-facing in full:
- `abandon` requires grounded input, an abandoned path, and a matching stopping status.
- On an active path the stopping status must equal the decision — unless input was not grounded, in which case the
  prior state is preserved with **zero spawns**.
- An abandoned path can only be preserved by non-grounded input and can **never** spawn children.
- A non-spawning decision may not carry a spawn count.
- **Grounded** input requires: no reason codes at all; score *and* evidence both present *and* fresh; and all six
  identity fields non-null (score input hash, scoring contract hash, score record id, score run id, score run
  sequence, evidence snapshot id) — run id and run sequence present or absent **together**.
- Availability and freshness are cross-validated: only a *present* component may be fresh or stale; absent,
  in-progress or terminally-unverifiable components must be *unknown*.
- Reason codes are normalized and non-duplicated.
- The **replay identity hash deliberately excludes** the idempotency key, the spawn count and the classification
  fields, so re-deriving the same decision **replays**, while genuinely different content **fails loudly**.

**Bounds and skips:** two regeneration rounds (three attempts) then a typed "not runnable" abstention carrying the
rejection evidence (§7.2g, DR-020 knob 5); topic cap 7, regeneration cap 2 (DR-019); budget override is a **typed
skip for enrichment only** — provenance, abstention typing, standard-and-above blind verification, citation routes
and **serve-conformance** can never be budget-skipped, and every skip carries a visible `SKIPPED-BY-BUDGET` marker
(§7.2h, DR-021, DR-052); every run carries a **visible call/cost envelope** derived from asker depth × risk tier,
with typed enrichment skips first, then a hard stop serving already-verified components under
`ENVELOPE_EXHAUSTED` — **never a silent timeout** (DR-052).

**Spawn vocabulary:** the plumbing spawns the full ratified child vocabulary (§7.2e, DR-062 OD-19), so V2's two
shapes are a floor rather than the menu; and it must be able to spawn defeater work **without an author's
request** (DR-041 Q26).

### 2.5 Organ 5 — execution ledger and receipts (§8)

**Mechanism (all §8.2 is `CARRIED-DESIGN`):**
- **(a)** The raw artifact is persisted **unconditionally, parseable or not**: raw text, its hash, request
  metadata, parse status and error, the validated assessment or nothing, provider metadata, latency, checked-at
  timestamp. Provider metadata is **allow-listed before storage and recursively scrubbed**.
- **(b)** The **input hash** defines "the same input": canonical key-sorted serialization of version tag,
  normalized claim, argument text, question asked, and children **exactly as the prompt renders them** — caller's
  order, never re-sorted, already-truncated excerpt hashed rather than the source. Load-bearing property: **adding
  an attacking child changes the hash**, so a rescore cannot cache-hit on a children-blind key.
- **(c)** The **judge contract is deliberately NOT part of the input hash** — a separate column, so a superseded
  artifact is recognized as **superseded** rather than colliding.
- **(d)** The **contract hash** freezes identity, version, role, rubric version, prompt version, schema version,
  reducer version **and the full output schema**. Any change invalidates every cached result and artifact, so
  **old outputs can never be silently reinterpreted by newer code**. The default provenance factory reads **live**
  constants, never string literals.
- **(e)** Cache identity includes the contract hash; a changed contract yields a **new row**, old row preserved.
- **(f)** **Four reconstruction paths:** (A) rebuild from artifacts — recompute claim and input hash, select the
  newest artifact matching node + input hash + current role + parse status + **current contract hash**,
  re-validate, **re-run the reducer**, re-attach plural-judge provenance; any miss yields **nothing for that node,
  never a fabricated score**. (B) serve a stored public result verbatim — the legacy lane, which **never
  re-reduces old assessments through current code** and **never fabricates a score when nothing was persisted**;
  its per-item provenance consequences are indicted (§10.4) and must not carry. (C) resume a partial pass —
  re-attribute artifacts only where the contract hash matches the current active contract **for their own role**.
  (D) **completeness gate** — before an aggregated run is persisted, **every** required node must have ≥1 raw
  artifact under the running job; missing any → job fails and **no** aggregated run is written.
- **(g)** **Append-only with a total order:** runs carry a monotonic sequence assigned under a write lock so
  same-tick runs are orderable; nothing is ever rewritten. V2's random-identifier fall-through **must not carry** —
  ordering must be **total and deterministic**, a direct DR-034 precondition.

**The replay law** (§8.3, DR-034), three binding parts: (1) **no model in the replay path** — replay is arithmetic
over stored records; (2) **continuously self-tested** — the refusal is a standing test so a regression is caught
before it can serve; (3) **one independent replay ceremony at launch** that must pass **exactly**, where DR-060(b)
+ DR-063(VR-3) define exactly as **byte-identical served numbers**, the **serve decision replays as stored data**
with the conformance verdict an **input artifact never re-generated**, and independence is satisfied by DR-063
option (ii). **The law is V3-internal**: V3 reproduces its own numbers from its own records; V2 is irrelevant.
When one number will not replay it is **evicted** with a **typed missing-number mark** and the rest serves under a
`DEFECT` badge — *"One number is lost, never the answer"* (DR-059).

**The recording extension** (§8.3, DR-027), binding on every organ: (1) everything executed is recorded — attempts,
retries, failures, could-not-dos, abstentions with type, condition marks, typed skips including
`SKIPPED-BY-BUDGET` and `ENVELOPE_EXHAUSTED`, every judgement V2 would have discarded, every degraded computation
V2 would have swallowed; (2) **two tiers** — raw tapes internal only (raw judge text never reaches a served item),
digest user-visible in human language; (3) **consistency law** — if the ledger says a check did not run, no served
sentence may imply it did; (4) query amendments typed and visible, mechanical repair vs semantic re-aim (DR-008);
(5) human steer logged verbatim (DR-019 knob 4); (6) Postgres-backed including observability (DR-024).

**The inspection handle** (§8.3, DR-054): the complete fact bundle and the conformance record are **fetchable on
demand through an authorized inspection/replay endpoint**; the default view carries typed projections only;
internal prompt material is excluded.

### 2.6 Organ 6 — serve layer + internal debug facet (§9)

**Serve preconditions** (§9.2a): the stored output must have been produced by the ledger, or refused; items must
be a list, or refused; **every** item must validate, or refused; the status string must be known, or refused; no
item may reference a node outside the current set, or refused. **Each refusal is a distinct typed reason.** The
replay precondition is **per number, not per payload** (DR-034 + DR-059).

**Sanitizing** (§9.2b): re-validate every item; strip raw judge output; reduce debug detail to declared version
fields or drop entirely; scrub every served reason string for secret markers and **drop rather than serve damaged**
any entry that fails the scrub; copy optional scalars **only when well-typed**.

**Coverage reconciliation** (§9.2c): drop items for non-current nodes; add **typed pending** entries where work is
active and **typed error** entries otherwise; then recompute. **Status is derived, never asserted.** Stale active
jobs past deadline transition to failed with a typed reason **on every read** (§9.2d).

**Honest-degradation vocabulary** (§9.2e): a missing or malformed input proves nothing and is read as its honest
zero-information value, never guessed; a verdict with no usable basis degrades to a typed `unavailable` rather
than to a number; a lean with no live supporting or attacking node returns **nothing** rather than a fabricated
even split.

**Suppression and shadow mode** (§9.2f): when a verdict is withheld the reader is told **why in prose** *and*
**what would unlock it**; the evidence gate runs in **shadow mode**, publishing what it *would* have suppressed
beside the unsuppressed band; DR-017's value overlay reuses exactly this shape. Eligibility (DR-062 OD-20) is
**every claim type for which external evidence is possible** — the exact complement of §5.2(f)'s evidence-free
list — **tiered by risk** using DR-012's class × risk-tier structure. Causal, comparative and predictive claims
are gated where V2 gated only empirical ones.

**Serve-layer obligations** (§9.2g), each individually tagged: per-item provenance travels with every number —
judge identity, contract hash, input hash, run identity, freshness, tau source, way of knowing, cluster identity —
and **no aggregate number may stand in for per-node labels** (D4 clause); the execution digest is part of the
served answer (DR-027); judge disagreement as flag + certainty downgrade, never averaged, never a refusal
(DR-032); one abstention kind + several condition marks (DR-051); value-decided segments carry a visible marker
naming whose weights, `weight_source` with **no `default` member**, mixed questions in two labeled sections
(DR-017, DR-053); unresolved type or field auto-serves with a label travelling **on the answer and in every node's
provenance** (DR-021 knob 10); stale/under-review answers serve with a visible badge, never silently (DR-015);
where independent critique was unavailable the answer **cannot reach the top confidence band**, says so, and
records a lift condition (DR-014, DR-041 Q31, DR-055); off-subject evidence's downgrade is visible with the
off-subject share named (DR-009); every answer names its abstention-price cell (DR-012); findings and
recommendations render in **separate blocks** and a recommendation with no owner in the value overlay is a
**defect, not a style choice**; the fragility table and leverage ranking are served outputs with
`LEVERAGE_UNRESOLVED` where the K=1 bound was hit (DR-031 Q46/Q49, DR-050); an `UNINSTRUMENTED` fairness verdict
**blocks** the fairness claim and the remediation layer is served **openly marked model-authored and biased**,
never replacing the verdict (DR-045); **all nine honesty surfaces** are served and the kept UI's data layer is
**rebuilt against V3's native shapes rather than adapted** (DR-048); the one-line summary is a **non-numeric
sentence** with per-side provenance as layer-2 detail, V2's "leans" percentage and its admission rule retired
(DR-062 OD-11).

**Serve composition** (§9.2h, DR-044): pure rendering was **rejected**. The machine assembles **all** computed
facts into one structured prompt; **one composition model** writes the served text honoring those facts, never
reciting the machinery; a **second model** judges text-against-facts conformance; and **the machine enforces that
verdict**. The conformance judgement is itself a recorded fact. For oversized bundles (DR-058): multi-pass by
load-bearing priority (summarize, then refine), with honesty-critical fields — residual objections, badges,
marks — **machine-injected into the output structure outside model discretion**, so silent truncation is
impossible; past the declared hard budget the answer falls to components-only. Conformance sampling (DR-060a):
**load-bearing sentences always judged**, non-load-bearing sampled at the frozen stranger rate; the protected core
forbids skipping the conformance **role**, never mandates exhaustive sampling.

**Serve termination** (§9.2i, DR-049): `max_recompose = 2`; after the second conformance failure the answer serves
**components-only** — verified facts, badges, node graph — under a visible `DEFECT` badge; **never blank, never
unchecked prose**. **Gate order is fixed: R9 (stranger) → Q53 (objection visibility) → conformance → Q51
(provenance)**, and the conformance judge **may never demand an edit that violates R9**. DR-057: R9 has **two
surfaces** — node text stranger-checked **before** composition, and the composed verdict gets its **own R9 pass
afterwards**; a verdict failing its post-composition R9 pass goes to components-only + `DEFECT`, **terminal, no
new loop**. DR-059: components-only mode still owes the reader the **reversal point** and the **builds-on-previous
disclosure** as structured **projection fields that render without composed prose**.

**The wire boundary** (§9.2j, DR-054): the browser receives typed honesty **projections** — badges, marks,
provenance summaries, per-node restatements, all nine surfaces. The complete fact bundle and conformance record
are fetchable on demand through an **authorized inspection/replay endpoint**. Internal prompt material is excluded
from the default view.

**The internal debug facet** (§9.3): content is the graph fingerprint, per-node strengths, the full tau-source map
including per-node arrow markers, the operator identifier **actually used**, and deduplicated attack and support
arrow lists — with the identifier being the recorded run input and the map being the per-node provenance record,
**not a flat float map**. It is attached only on the successful path, absent when not requested, **explicitly not
part of the stable wire contract**, contains **no raw judge output**, and is reached through the authorized
inspection handle. Its stated invariant: **the debug facet can never affect real scoring.** Failure tiers: an
evidence-enrichment failure degrades to "no evidence arrows" while the block is still produced; **any other
failure returns a typed unavailable reason and nothing else — no partial strengths**; each degradation is **a
ledger row** (DR-027). Node set is **identical** to the scored graph's (DR-062 OD-18).

---

## 3. The D1–D5 MUST-NOT-REPRODUCE law (§10) and the P-D1…P-D5 properties (§12.2)

**Framing (§10 preamble, both from DR-033).** First, the V2 `file:line` evidence **documents the diseases; it is
not a conformance target** — no V3 test compares against any of it. Second, **each clause is a property of V3,
testable without any V2 artifact** — §12.2's P-D1…P-D5 replace the MUST-DIFFER vector marks DR-028 and DR-026
originally called for. Explicitly **not** in the register by V's steer: "no outcome memory", dead checks, the
discarded strongest objection — except that the dead disagreement check is governed separately by **DR-032** and
lands in §5.2(i).

### D1 — no judgement, no number. All four variants (§10.1, `RULED — DR-028`)

*"No judgement and no magnitude ⇒ no number, ever. A typed, visible record takes its place."*

| Variant | Mechanism (as stated) |
|---|---|
| **D1(a)** adapter default | Any node with no judge score is silently given a base score of **0.5**, then indistinguishable inside the aggregation from a measured one. A second independent pair exists on the experimental path. |
| **D1(b)** both `or 0.0` serving paths | An absent score is coerced to **zero mass** and summed as if measured; unscored branches are ranked as strength zero. |
| **D1(c)** branch-summary 0.0 | A missing or non-numeric score field becomes **0.0** for branch summarization and ranking. |
| **D1(d)** invented 0.7 for contradicted evidence | A contradicting verdict has **no magnitude the verifier vouches for** — its own schema requires the evidence object absent unless the verdict is "supported" — so V2 substitutes a declared constant **0.7**. |

**Measured consequences.** Root + four unjudged children, all defaulted → root strength **0.96875**
(`agg([0.5]×4) = 1 − 0.5⁴ = 0.9375`, then `σ(0.5, 0, 0.9375) = 0.96875`). Five such supporters → **0.984375**.
Subtler replay: a parent with one **judged** 0.80 supporter sits at 0.900; add three unjudged siblings at the
silent 0.5 and it reads **0.9875**.

**What V2 does right and must not be lost** (§10.1): provenance *is* recorded per node as a tau source and
persisted; an aggregate coverage number is computed and used as a band gate below which the band becomes
`insufficient_scoring` with the honest sentence that an all-default run's strength is a topology artifact, not
evidence; and a malformed coverage value is read as zero, never guessed. **Why that is not enough**: the gate is
aggregate and band-level only — the fabricated number is still served in the verdict's basis and printed inside
the `insufficient_scoring` language as a "structural reading for transparency"; the lean meter's gate is merely
"coverage above zero", so one judged node in a hundred licenses a reading built from ninety-nine invented ones;
and at half coverage a `supported` band can still ship with half its base scores invented.

**What V3 does:** M1 (§4.2e) — no default τ at any layer; unjudged node emits no arrow and carries a typed record
whose kind the model chooses and the machine enforces (DR-044 Q55, DR-051); the parent lands on exactly the value
its judged children justify. For D1(b)/D1(c): an absent score is **absent, not zero** — it may not enter a sum, a
mass or a ranking as a number. For D1(d): an **attack arrow with a typed unknown magnitude**, visible to the
reader, contributing nothing to the arithmetic (DR-062 OD-04).

### D2 — the aggregation choice is a recorded input, never a source literal (§10.2)

**Mechanism.** Three registered variants; the production path selects one by a **literal in the source**, calls
the adapter **without** a semantics argument so the default is always used, then stamps that same literal onto the
persisted run. The **only** runtime override in the whole system is a debug environment variable read only when
the debug view is on. A third variant is stamped on a separate in-memory path by a literal that **does not
describe the computation that produced it**.

**Measured consequence.** The identical tree with identical base scores yields root **0.96875** under the
production variant and **0.5** under the registered alternative — `supported` versus `contested` from the same
judgements. Mechanism visible in the arrow tables: under production every perspective container emits a
**support** arrow into the root; under the alternative a container emits **no arrow** and its arguing descendants
lift to the nearest argumentative ancestor, so counter-arguments buried under a "supporting" lens become **real
attacks on the root**.

**What V2 does right:** the variant is stamped on every persisted run; the fingerprint is salted with any
non-default identifier so runs under different rules can never be confused; convergence **refuses to compare**
across a semantics change; and version registration is honest — an unknown identifier **raises** rather than
silently defaulting.

**What V3 does:** with one engine, the remediation lands on the **per-parent operator** — declared by policy or a
human at zero model cost, or by one bounded declaration call, and where no declaration results the parent number
is withheld and components are served (DR-040); the rival reading is computed and served where it flips the band
(DR-031 Q47); scope is a **resolution chain** — per parent → run → deployment — with the level that supplied the
effective value recorded on the number (DR-062 OD-22).

### D3 — counting is by provenance, not by string (§10.3)

*"Two items count as one when their provenance says they are one. Shared source is deterministic and **gates**:
count a cluster once, conservatively at the strength of its strongest member, never the sum. Shared assumption is
a **flag**, never a gate."*

**Mechanism.** Every deduplication in V2 is **byte equality** — of an arrow tuple, an identity tuple, or a
raw-output hash. Nothing anywhere compares meaning. Nine dedup sites are inventoried plus **one site with no dedup
check at all** (evidence extraction), so re-extraction duplicates evidence leaves and inflates the distinct-source
count.

**Measured consequence.** A single supporter at **0.40**, restated a second and third time, aggregates to **0.64**
then **0.784**. Under cluster collapse the three contribute **0.400**.

**The nearest thing V2 has, and why it does not count:** an independence counter over distinct source-domain and
method pairs whose own docstring says it measures *sourcing breadth, never truth*, which deliberately excludes the
producing model family, and which **gates nothing** — its only consumer is serialization.

**What V3 does:** cluster collapse as **the gate** (§4.2g), key ruled at DR-062 OD-09; siblings restating each
other without shared provenance **flagged and never gated** (OD-08); sibling counting left **uncapped** with
clustering as its only control (OD-01).

### D4 — every served number carries its own provenance (§10.4)

*"Every weight-bearing number travels with its own kind, source and producer. No aggregate number may stand in for
per-item labels. A payload-level label that a per-item fact contradicts is forbidden."*

**Mechanism.** Provenance is computed and persisted — and then **no serving path reads it per item**. Numbers from
measured judgements and numbers from defaults are summed, averaged and displayed through the same channel with
nothing on the served artifact distinguishing them. Evidence includes: strengths persisted as a **flat
node-to-float map** with tau sources persisted **beside** it, never joined; a lean that sums strengths with **no
per-node source check**, gated only on debate-wide coverage above zero; a verdict reading only the root's strength
and aggregate coverage, whose "majority source" field is derived from the aggregate number rather than any node's
actual label; a legacy hydration lane selecting a stored result **without any contract-hash predicate** and
serving it verbatim, with **nothing per item** marking it superseded, where a mixed payload reports the fresh
producer label **for the whole payload**; and a UI whose only provenance surface is the aggregate coverage number,
with **no** consumer of tau sources, score provenance, judgment mode, judge families or reducer version.

**Structural root cause.** The provenance object declares only the output kind, an "included: false" assertion,
the score source and two version strings — **no judge identity, no judge version, no contract hash, no input hash,
no run id, and no per-node tau source**.

**What V2 does right:** provenance is genuinely *recorded*, always and honestly — per-node tau sources; a run-level
check refusing to serve a payload not produced by judge outputs; always-on lineage recording that never fabricates
independence; calibration weights and judgment mode recorded **even when only one judge ran**; an uncertainty
source distinguishing measured dispersion from the heuristic checklist; a strength kind distinguishing the two
compositions; and a secret scrub on every served string. **"The defect is the join, not the recording."**

**What V3 does:** the per-node record replaces the flat map (§4.3) and is served per item (§9.2g), as typed
projections with the full bundle behind an authorized handle (DR-054). *"This clause and DR-034's replay law are
two halves of one property: **a number you cannot attribute is also a number you cannot recompute.**"*

### D5 — judge weight is earned, not declared (§10.5, `RULED — DR-026`)

**Mechanism.** V2's calibration has a configuration-override branch that **can never execute**, because the caller
passes `config=None` unconditionally, so the weight function always returns weight **1.0** with source
`cold_start` and **never anything learned**. V2 self-documents this in a note stamped onto every persisted run:
`modelWeight=constant-1.0(P8)`.

**What V2 does right:** the honesty — the weight source is labelled `cold_start` and **never** claims to be
learned; the correlated-error discount's properties are declared and conservative; weights are recorded even when
only one judge ran; raw provider and model strings are never embedded in a served weight record.

**What V3 does** (DR-026, DR-046): weight comes from the outcome store DR-015/DR-016 establish, consumed as
per-model scorecards driving weighting and diversity-routing, with a mandatory exploration share, a probation
period for new models, and a model ledger in Postgres. A cold-start weight remains permissible **while honestly
labelled cold and while the learned path is reachable**; **the cold-start exit must demonstrably execute**.
**DR-032 rides on this clause**: real weights are the precondition for a disagreement flag that can actually fire.

### The property tests architecture must make testable (§12.2 layer 2)

| Property | Statement | How it is checked (verbatim obligations) |
|---|---|---|
| **P-D1** | No code path can produce a base score in the absence of a judgement. | Generate graphs with arbitrary unjudged subsets; assert **no number exists for an unjudged node**, and that **each parent's value equals the value computed from its judged children alone** — §4.2(e)'s identity-element argument makes this exactly checkable. |
| **P-D2** | The operator is a declared, recorded input, emitted by the component that computed the run; **no production selection path reads a literal**. | Assert **both operators are computable on demand** and produce different recorded identifiers; assert the identifier **travels with the result**; assert that where the rival operator flips the band **both readings appear** (DR-031 Q47); assert an **undeclared parent takes DR-040's path** rather than a default. |
| **P-D3** | Counting is by provenance: N restatements sharing a provenance key contribute **exactly once, at the strongest member**. | Property test over generated sibling sets — the **0.784 → 0.400** collapse computed from V3's own arithmetic. |
| **P-D4** | Every weight-bearing number in a served payload carries its own kind, source and producer; **no payload-level label may be contradicted by a per-item fact**. | Assert a number with no provenance is **unservable**; assert a mixed-freshness payload reports **freshness per item**; **fuzz payload assembly** for aggregate labels that contradict item facts. |
| **P-D5** | Judge weight is a function of recorded outcomes, and **the learned path is reachable**. | Feed recorded outcomes; assert **at least one judge's weight moves**; **a weight constant under all outcome histories fails**. Paired with DR-032's fire requirement, bar per DR-063 VR-1: shown to fire **both ways** before adoption, **fired at least once** by launch, **rate-consistency monitored** thereafter. |

---

## 4. Scoring math specification, at the manifest's own precision (§4.2, §4.4, §4.5)

**Labeling note.** The manifest labels exactly **three** rules M1 (§4.2e), M2 (§4.2f), M3 (§4.2g). **There is no
M4 anywhere in the document** (verified by grep: `M1|M2|M3|M4` matches only lines 271, 287, 303, 337, 1321, 1389).
§4.2(h)–(k) are unlabeled clauses, not a fourth M-rule.

### 4.1 The operators

**Aggregation α ("probabilistic sum")** — `RULED — DR-030(J1) · DR-056(a)` for the engine's identity; the formula
is the published definition (§4.2a):

```
agg([])      = 0
agg(v1 … vn) = 1 − Π(1 − vi)
```

Computed as a **left fold** `a ← 1 − (1−a)(1−v)` from `a = 0`. **Commutative in exact arithmetic but not
bit-identical under reordering in IEEE-754 doubles**, so V3's **arrow order must be deterministic and recorded** —
*"not to match anything, but so that V3's own replay (DR-034) is exact"*. `CARRIED-DESIGN` for the ordering
requirement.

**Mediating function σ** — `RULED — DR-030(J1)` for the accumulate operator; formula is DF-QuAD's published
definition (§4.2b):

```
σ(τ, va, vs) = τ − τ·(va − vs)         if va ≥ vs
σ(τ, va, vs) = τ + (1 − τ)·(vs − va)   otherwise
```

The comparison is **`≥`, not `>`**, so the tie case `va == vs` returns **exactly τ**. *"This is what makes DF-QuAD
discontinuity-free; `>` would introduce the discontinuity the method exists to avoid."* Equivalently, with
`d = vs − va`, σ is **continuous and non-decreasing in `d` over `[−1, 1]`, with slope `τ` below zero and `1 − τ`
above it** — the fact §4.5's properties rest on.

**Strict-and** — the product, and `RULED — DR-062 (OD-05)`: **strict-and has no identity element.** Every declared
conjunct must be judged; where any conjunct is unjudged or abstained the parent emits **no number** and its
components are served. *"A conjunction with an unmeasured conjunct has not been measured — treating a missing
conjunct as certainly true would be D1's failure mode in a new costume."* The withheld-parent shape is DR-040's,
reused. Worked case from OD-05: three conditions at 0.9, 0.8, 0.7 → product **0.504**; if one abstains the parent
withholds rather than reading 0.504.

### 4.2 Typed edges

**Shape** (§4.2c, §6.3): `{source, target, polarity ∈ {support, attack}, strength ∈ [0,1], kind}`.

**Ruled properties** — `RULED — DR-022 as narrowed by DR-035 · DR-030(J2)` for the arrow's existence, polarity,
stored strength, **and its ability to target a node that is not the source's structural parent** — *"which is what
makes a defeater expressible at all, and which V2 cannot do"*.

**Transmission rule** (`CARRIED-DESIGN`, §4.2c): a child's contribution to its target is
**`arrow strength × strength(child)`** before aggregation.

**Integrity rule** (`CARRIED-DESIGN`): an identity `(source, target, polarity)` carrying **two different strengths
is a loud typed error, never a silent pick**.

**Arrow strength is closed** — `RULED — DR-062 (OD-06)`: it is **only ever the output of a ruled mechanism** — the
evidence verifier's grounded score for evidence arrows, or provenance cluster collapse (§4.2g). **No author,
policy, model or configuration row may set it freely.** Rationale: the weight research surveyed thirteen candidate
factors and found none needing a free arrow strength rather than a base-score cap or a cluster gate.

**Arrow kinds** (§6.3, DR-062 OD-19): **rebutting** (denying the claim itself) vs **undercutting** (granting the
claim while denying that it supports its parent). Manifest first-release carrier: an attack on the **target-side
justification**, marked as an undercut, *"rather than as arrow-on-arrow arithmetic, which the engine has no shape
for"*. **⚠ Superseded by DR-066** — see §7.0/§8 A-1: the ledger rules the undercut is *"a typed attack targeting
the support EDGE, never the claim node — architecture inherits it as a requirement."*

**Child kinds** (§6.3, DR-062 OD-19): support, attack, defeater, shared-crux sub-claim, necessary condition,
sub-question, assumption, scope carve-out. **Closed declared enum, loud failure on unknown** (§4.4).

### 4.3 Evaluation order and cycles (§4.2d)

`CARRIED-DESIGN` for **topological evaluation over the union of support and attack arrows**, so every
predecessor's strength is final before it is read. A node with **no incoming arrows** gets `σ(τ, 0, 0) = τ`.

`RULED — DR-056(b) · DR-042` for cycles, at **three layers**: (1) **construction refuses** cycle-closing arrows —
the builder is loop-free by construction, a circular attack is **redirected** to a typed **shared-crux sub-claim**
(or an attack on the common ancestor), and *"circular dependency found"* is **served information, not a silent
repair**; (2) **compute time raises a typed error** if a cycle is nevertheless present — *"never a partial result,
never a fixed-point approximation"*; (3) **write time rejects** the cycle-creating arrow.

### 4.4 M1 — per-node base scores come from judgement or not at all (§4.2e, `RULED — DR-028`)

**There is no default τ at any layer.** An unjudged node emits **no arrow** and carries an explicit typed
abstention record. *"The arithmetic makes this exact rather than a compromise: `agg([]) = 0` is the aggregation's
identity element and `σ(τ, 0, 0) = τ`, so dropping an unjudged child's arrow leaves the parent on precisely the
value its judged children justify."* Which typed record it carries is ruled by DR-044(Q55) · DR-051 (§5.2m).

**Interior nodes** — `RULED — DR-062 (OD-02)`: **an unjudged interior node is transparent.** It emits no arrow of
its own; its children's arrows attach to the **nearest judged ancestor**. Because the graph's shape changes, that
change is **visible at both ends** — a marker at the lifted child naming where its arrow actually landed, and a
marker at the skipped node naming that it conducted without contributing. **Deriving an interior node's base score
from its children is forbidden: that is a number computed from nothing, which is D1.**

### 4.5 M2 — the combination operator is declared per parent (§4.2f, `RULED — DR-040(Q45)`)

Two operators: **accumulate** (probabilistic sum) and **strict-and** (product). Declaration path is a
**machine-only fast path**: policy-declared or human-declared costs **zero model calls**; an **undeclared** parent
gets **one bounded declaration call**; where no declaration results the **parent number is withheld and the
components are served**.

**Magnitude, and why this outranks every weighting question:** on four sub-claims at 0.95, 0.60, 0.35, 0.50,
accumulate gives **0.9935** and strict-and gives **0.0997** — a **9.96×** gap.

`RULED — DR-031(Q47)`: computing what the *other* rule would have produced is a **MACHINE row and spec law**;
where the rival operator would **flip the served band**, **both readings are served with the deciding choice
printed — never averaged, never an abstention**.

`RULED — DR-062 (OD-22)`: the declaration lives on a **resolution chain** — per parent node → run-level
declaration → deployment setting — and **whichever level supplied the effective value is recorded on the number**.
The identifier is recorded **per run *and* per parent regardless of who set it**.

### 4.6 M3 — counting is by provenance, not by string (§4.2g)

`RULED` as a defect clause (D3, §10.3): **sibling support is partitioned by a provenance key and each cluster
contributes once, at the strength of its strongest member.** *"A gate, not a bonus: the aggregation already
rewards multiple supporters, so paying again for independence double-counts it."* Computed effect: three
restatements of a 0.40 claim aggregate to 0.784 and contribute **0.400** under cluster collapse.

**Key width** — `RULED — DR-062 (OD-09)`: primary key = **underlying study or dataset identity + producing model
family**; **source domain and publisher** are fallbacks used only where study identity is absent; **producing-run
identity always applies**. The key is a **declared, recorded run input**, and is **printed wherever a cluster
changed a number** — *"a change of key is a configuration change and every affected figure says which key produced
it."*

**Cardinality** — `RULED — DR-062 (OD-01)`: **counting is uncapped**, exactly as the published operator counts;
cluster collapse is its only control. **No top-k cap and no count-insensitive aggregator**: a cap constant would
flip verdicts without facts behind it (DR-039), and a count-insensitive rule would **break both literature
vectors**.

### 4.7 Uncertainty shapes

- **Per-node uncertainty as a first-class shape** comes in from Model B **as design reference** (§3.1, DR-035),
  together with the labeled-arrow idea. The experiment's score-walking code, loop handling and 0.5 defaults are
  **out**, the last being itself a D1 site.
- **Dispersion** (§5.2h): with ≥2 distinct judgements, uncertainty is the **spread of a fixed composite signal**
  across them, **scaled and clamped**; the item's uncertainty source becomes `dispersion`; a dispersion driver is
  **prepended so it reads first**. **Fewer than two parseable judgements yields *no measurement*, and that absence
  must never be read as zero uncertainty.**
- **The reducer's uncertainty machinery** (§5.2f): a clarity term **decaying with each ambiguity flag**; an
  **enumerable uncertainty ladder**; **uncertainty drivers in a fixed, never-reordered emission order** so callers
  may rely on "first = primary"; typed holes.
- **Contradicting evidence** (§6.3, DR-062 OD-04): an **attack arrow with a typed unknown magnitude** — the engine
  treats an unknown magnitude as contributing nothing.
- **Restatement flag** (§4.2i, DR-062 OD-08): the node and wire carry `possible_restatement_of: [node_ids],
  similarity: x.xx` and **no number changes**.

### 4.8 Way of knowing (§4.2h)

`RULED — DR-044(Q51)` for the band half: the **locator gate**, the **provenance join** and the **reasoning-only
downgrade** are **blocking machine gates** — an answer resting on reasoning alone is **downgraded from a verdict
to a hypothesis plus a research plan**, and **the gate blocks rather than annotates**. `RULED — DR-062 (OD-12)`
for the arithmetic half: **there is no numeric ceiling on τ.** Labels are `LOOKED_UP | RAN | REASONING` (GLOSSARY).

### 4.9 Value overlay, fragility and leverage (§4.2j, §4.2k)

**Overlay** (`RULED — DR-017`): value weights are a **second layer attaching at computed hinge nodes**; **τ, arrow
strengths, strengths and provenance are computed with no reference to any value weight**.
`weight_source ∈ {owner_elicited, org_policy, none}` — **no `default` member, for the same reason there is no
default τ**. Flow A (serve the conditional plus the reversal point) always runs; Flow B asks one swing question
per real hinge; Flow C is opt-in standing profiles. `RULED — DR-043(Q50)`: the model may propose criteria under
**three guards** — every proposed criterion must link to actual evidence or code drops it; rejected candidates are
served visibly; the asker may add criteria through the steering menu. **Weights remain human-only; all arithmetic
is machine.** `RULED — DR-053` for mixed questions: **two phases on one graph** — phase 1 settles the empirical
half fully, phase 2 runs the value machinery on the settled graph — one served answer in **two labeled sections**
("what is true" / "what follows given your values"), **phase order machine-enforced**, typed dual settlement act.

**Fragility and leverage are outputs, never weights** (`RULED — DR-031 Q46, Q49`, MACHINE rows):
**removal-based impact** — recompute with a node dropped and report the difference — produces the leverage ranking
and the fragility table. `RULED — DR-050`: **K = 1** halt-and-deepen round per parent per run; after it,
recombination proceeds and the answer carries a visible `LEVERAGE_UNRESOLVED` residual naming the carrying piece
and its verification thinness. `CARRIED-DESIGN` for the closing prohibition: **feeding sensitivity back into τ or
arrow strength is forbidden by construction.**

### 4.10 Edge-case table (§4.4), verbatim behaviors

| Situation | Behavior | Tag |
|---|---|---|
| Empty node set | Empty result. Never a fabricated number. | `CARRIED-DESIGN` |
| Node with no incoming arrows | `strength = τ` | `CARRIED-DESIGN` |
| `va == vs` exactly, accumulate | `strength = τ` (first σ branch) | `RULED — DR-030(J1)` |
| `va == vs` exactly, strict-and | Reached only when every conjunct is judged; no identity element, so an unjudged conjunct withholds the parent number | `RULED — DR-062 (OD-05)` |
| τ outside `[0,1]` | Typed error at compute time | `CARRIED-DESIGN` |
| Arrow endpoint absent from node set | Typed error at compute time | `CARRIED-DESIGN` |
| Cycle | Refused at construction, rejected at write, typed error at compute | `RULED — DR-056(b) · DR-042` |
| Duplicate identical arrow | Collapses once | `CARRIED-DESIGN` |
| Same arrow identity, two different strengths | Loud typed integrity error | `CARRIED-DESIGN` |
| Unknown node or arrow kind | **Loud failure** | `CARRIED-DESIGN` |
| Node has no judgement | No arrow; typed abstention record; parent unaffected | `RULED — DR-028 · DR-044(Q55) · DR-051` |
| Some/all of a parent's children abstained | **Operator-dependent.** strict-and: any abstained conjunct withholds and components are served. accumulate: a missing supporter is genuinely neutral (`agg([]) = 0`), no fraction rule, **no threshold constant** | `RULED — DR-062 (OD-07)` |
| Any failure at all | Caught, typed, **and written to the ledger** | `RULED — DR-027` |

---

## 5. Test-base obligations (§4.5, §12.1, §12.2)

### 5.1 The governing law — DR-033 (§12.1)

*"Nothing from V3 must match V2; starting fresh, never look back at what was already debated; V2 serves as
reference; V3 must be much better."* The cascade, verbatim: (1) **The MUST-MATCH class is dead — V2 output
conformance is not a V3 requirement anywhere**; (2) V3's math is tested against **literature vectors plus V3-spec
property tests**, with D1–D5 becoming properties of V3 itself; (3) **ticket 27, the V2 vector recorder, is out of
scope**, and DR-024's clause naming that recorder "the sole scoring-ground-truth source" is superseded with it;
(4) DR-003's clean-room re-specification **stands** — what died is only the obligation to reproduce V2's outputs.
DR-047 then retires the comparison itself: **no formal race, no frozen victory criteria, no control-arm ceremony,
no matched-cost law, no V2 pin**; humans compare informally at will; DR-025 survives solely as the definition of
"the V2 reference" (as-shipped production, flags off, failed nodes included). The fourth artifact is the **V3
Quality Charter**, whose five acceptance themes are: best dialectical engine to date judged by V on outputs;
human-oriented answers with the stranger law as acceptance test; a clean maintainable codebase; **no orphaned
modules — everything shipped is reachable and called**; and research-upgradeability without re-architecture.

### 5.2 Layer 1 — external ground truth (§4.5)

`CARRIED-DESIGN`. *"These are the published authors' numbers, not V2's, and carry zero clean-room
contamination."* Under DR-033 they are **the only recorded input→output pairs V3 reproduces**.

- **Literature vector 1** (arXiv:2307.13582 Fig. 3). All τ = 0.5; supports `B→A, C→A`; attacks
  `D→A, E→B, F→D, G→F, H→F`. **Required:** `F = 0.125`, `B = 0.25`, `D = 0.4375`, `A = 0.59375`; leaves
  `C, E, G, H = 0.5`.
- **Literature vector 2** (arXiv:2407.08497 Fig. 1). τ: `alpha 0.5, beta 0.3, gamma 0.6, rho 0.7, zeta 0.4`;
  supports `beta→alpha, zeta→gamma`; attacks `gamma→alpha, rho→beta`. **Required:** `zeta = 0.4`, `rho = 0.7`,
  `gamma = 0.76`, `beta = 0.09`, `alpha = 0.165`.

**Property statements over generated graphs** (§4.5). The previous draft asserted *strict* monotonicity, which is
**mathematically false at the boundaries** — *"a correct implementation would have failed the stated test."*
Corrected non-strict statements: **determinism**; **non-increasing under added attack**; **non-decreasing under
added support**; **empty graph → empty result; isolated node → its own τ**.

**Strictness holds only under stated preconditions, and the generators must encode them.** With
`c = arrow strength × strength(source)` and `va`, `vs` the target's aggregated attack/support *before* the
addition:

> **Strictly decreasing** under an added attack **iff** `c > 0` **and** `va < 1` **and** `0 < τ < 1`.
> **Strictly increasing** under an added support **iff** `c > 0` **and** `vs < 1` **and** `0 < τ < 1`.

Reasons given: `c = 0` moves nothing; `va = 1` (or `vs = 1`) is already saturated since `1 − (1−1)(1−c) = 1`;
`τ = 0` makes σ's lower slope zero so an attacked target pinned at 0 stays 0; `τ = 1` makes the upper slope zero
so a supported target at 1 stays 1. The arrow must also be **novel**: an exact duplicate identity collapses (§4.4)
and a cluster-absorbed arrow contributes nothing (§4.2g). **Generators for the strict properties must exclude
`τ ∈ {0, 1}`, zero-strength arrows, zero-strength sources, pre-saturated aggregates, duplicate identities and
cluster-absorbed arrows; the non-strict properties are generated without those exclusions.**

### 5.3 Layer 2 — P-D1…P-D5

See §3 of this digest for the full table. Architectural consequence stated by §12.2: each replaces a MUST-DIFFER
vector mark with **a rule that must hold for every input, checkable with no V2 artifact present**.

### 5.4 Layer 3 — house-rule gates (§11, §12.2)

*"Each is a testable gate, and they are layer 3 of V3's self-test base: a house rule that cannot be expressed as a
gate is a house rule V3 cannot prove it kept."* (§11)

| # | Carried behavior | Successor | Standing |
|---|---|---|---|
| **H1** | **Provider-agnostic agents** — all scoring, debate, evidence, metareasoning and orchestration code calls **one provider interface**, never model SDKs or CLIs directly. | **None** — survives explicitly. | **Rule governs.** Precondition for DR-013's lineage law and DR-046's routing: "different maker" and "route to the next-best model" are only enforceable if provider identity is a **first-class configured value rather than an import**. |
| **H2** | **A second provider is addable through configuration** — provider layer + configuration, **without changing** agent, scorer, evidence or semantics code. | DR-019 knob 3; DR-014; **DR-055's launch gate**. | Successor governs; rule is the floor. **The configuration swap is now a launch dependency.** |
| **H3** | **Pure propagation** — the graph-scoring math contains **no model calls, no file or network I/O, no clock, no randomness and no database access**. | **None** — survives explicitly. | **Rule governs, and DR-034 makes it structural: replay with no model in the path is impossible unless the math is pure.** V3 needs the purity test as a standing gate. |
| **H4** | **Swappable semantics** — the default gradual semantics lives behind a strategy interface. | **None** as a battery row — but doubly load-bearing: D2 forbids selecting by source literal, and DR-040 + DR-031 Q47 require **both operators to exist and both to be computable on demand**. | **Rule governs, strengthened.** |
| **H5** | **Every leaf is gated by the evidence subsystem** — evidence leaves citing sources get base scores from the evidence pipeline, not a model assertion. | DR-009; DR-020 knob 7's eight typed citation failure routes; DR-044 Q51; DR-038's Q35/Q37 two-field record with zero-weight-with-retention and repair/bound/exclude as enforced gates. | Successor governs; rule is the floor. |
| **H6** | **Anonymize debate sources** — agent identity stripped before another debate role reads prior turns. | DR-019 knob 3; DR-013/DR-014; DR-041's rival carver selected for measured behavioral difference. | Successor governs; rule is the floor — **anonymization is the mechanism that makes "blind" true rather than merely claimed**. |
| **H7** | **The skeptic certifies that no unaddressed attack remains** — a node is not converged until the skeptic hook passes. | DR-041's defeater obligation; DR-049's gate order (Q53 ahead of conformance); the residual-objection field. | Successor governs; rule is the floor. Also the repair for "strongest objection computed and discarded". |
| **H8** | **Confidence-driven, cost-soft** — stop conditions driven by convergence, unresolved caveats and skeptic certification; **cost is a soft tie-breaker**. | DR-021 knob 9 + **DR-052's cost envelope**; DR-020 knob 5; DR-050's K=1; DR-010/011/012's abstention price. | Successor governs; rule is the floor. |

**Convergence** (`CARRIED-DESIGN`, §11): typed non-comparison reasons (first evaluation, semantics changed,
topology changed, strengths unavailable), a **maximum-delta comparison over the overlapping node set**, the
**refusal to compare across a semantics change**, and an explicit **changed-evidence-topology detector**, carried
as the measurable half of H8. Epsilon and defaults are register rows (DR-023), drawn fresh.

### 5.5 Layer 4 — law gates (§12.2)

- **DR-034 replay** — continuous self-test that every servable number recomputes from frozen records with **no
  model in the path**, plus the **launch ceremony**: one independent replay of recorded runs that must pass
  exactly.
- **DR-027 ledger completeness** — every executed thing has a row; the digest is user-visible; **no served
  sentence implies a check the ledger says did not run**.
- **DR-049 serve termination** — `max_recompose = 2`; gate order **R9 → Q53 → conformance → Q51**; components-only
  under `DEFECT` rather than blank or unchecked prose.
- **DR-051 partition law** — the exhaustive mapping table exists and leaves no residue; one abstention kind and
  several condition marks per answer.
- **DR-052 cost envelope** — visible envelope; enrichment skipped before any hard stop; protected core never
  skipped; **stranger-sample rate frozen at run start**.
- **DR-018/DR-019 stranger coverage** — load-bearing nodes exhaustively restatable; sampling derived from the
  asker's run parameters; **ratcheting on the *next* run**.
- **DR-017 overlay detachment** — **recompute every strength with the value overlay detached and assert
  byte-identity, as an enforced invariant rather than a convention**.
- **DR-009 / DR-012 / DR-014 / DR-021 / DR-045 / DR-050 / DR-055** — off-subject downgrade visible; every answer
  names its abstention-price cell; a missing second lineage caps + labels + records a lift path; every budget skip
  and unresolved-type fallback carries its label; an `UNINSTRUMENTED` verdict blocks the fairness claim;
  `LEVERAGE_UNRESOLVED` appears where the deepening bound was hit; multi-maker critique executes at
  standard-and-above tiers.

### 5.6 Scenario coverage (§12.2, closing paragraph)

Property tests should exercise at least: single node; shallow-wide fans; deep chains; realistic mixed graphs;
degenerate and error graphs; container and pass-through shapes; evidence-verdict variants; base-score extremes;
the mediating-function tie boundary; arrow-strength extremes and conflicts; float accumulation order; unjudged
subsets; the dedup ladder from byte-identical through whitespace, case, Unicode and paraphrase; judge-output
duplication both byte-identical and one-byte-apart; abstention and degradation paths; operator-selection variants;
mixed-provenance payloads; the reducer's compositions, caps, ladders and orderings; banding and suppression; and
the normalizer's classification, scope and ambiguity behavior. **"None carries a V2 expected output."**

### 5.7 The prohibition, restated for the test architecture

`RULED — DR-033`, §2.2 item 2 and §12.1: **V2 output conformance is not a V3 requirement anywhere. Divergence is
sanctioned.** §12.3: what no longer exists is *"a formal race, a control arm, frozen victory criteria, a
matched-cost law, a V2 pin, or any conformance test at any level."* The only permitted recorded input→output pairs
are the two literature vectors (§4.5, §14 consequence 2, which exempts them from clean-room contamination).

---

## 6. Hard architecture constraints stated in the manifest

**C-1 · Postgres, including observability.** `RULED — DR-024` (§13.1). V3's persistence is **Postgres, not
SQLite**, and this **includes the observability layer**: score provenance, the execution-ledger artifact store,
and the debug views. **There is no second store for observability.** DR-034's replay law sits directly on top of
it. `RULED — DR-046` adds the **model ledger** (sessions and per-category model bests) to the **same database**.

**C-2 · Requirements are behavior-only *except* where V imposed a stack constraint.** §2.2 item 5 (DR-005 as
superseded in part by DR-024); §13 opening. C-1 is the **only** such entry in this manifest.

**C-3 · Four SQLite-shaped V2 behaviors: the constraint does not carry, the property does.** §13.1 table, all
`CARRIED-DESIGN`: (i) **never hold a write lock across a model call**; (ii) **per-member failure isolation** for
panel calls; (iii) the unlinked-artifact random-identifier tiebreak carries **nothing** — V3's ledger ordering
**must be total and deterministic**, a DR-034 precondition; (iv) **a crash mid-batch leaves completed nodes
durable and resumable**.

**C-4 · Composition is settled and final and no longer vetoable.** §2.2 item 11, §3 (DR-030 as ratified by
DR-056a): **one scoring engine, one graph, one serving truth**, plus the organ↔stage table.

**C-5 · One graph, literally.** §6.1 (DR-030 J2, DR-056a): *"there is exactly one graph — the SPLIT stage's
children and defeaters **are** its nodes and typed arrows, and every battery stage reads and writes that same
object."* Arrows are **stored objects, not derived at read time** (§6.3) — an edge table is mandatory.

**C-6 · Clean-room role split is binding, not advisory.** §14 (DR-003, restated by DR-033). **Dirty room** (may
read V2 source): the research seats and whoever writes the behavioral specifications in the manifest. **Clean
room** (may read only this manifest, never V2 source): whoever implements V3's organs. *"The two roles must be
held by different people or different agent seats. A single participant who reads V2 source and then writes V3's
implementation has voided DR-003 regardless of intent."* Two consequences: **the manifest is the interface** — a
missing fact is obtained by **amending the manifest through review, not by looking at V2**; and **the literature
vectors are exempt**.

**C-7 · No V2 conformance anywhere.** §2.2 item 2, §12.1, §12.3 (DR-033, DR-047). See §5.7.

**C-8 · Everything executed is recorded** (§2.2 item 6, §8.3, DR-027): *"an organ that does work without leaving a
record of having done it violates DR-027 wherever it lives."* Cross-cutting; a swallowed exception is a violation
(§4.4, §5.4, §8.4, §9.3).

**C-9 · Nothing is served that cannot be recomputed** (§2.2 item 7, §8.3, DR-034). **No model in the replay
path**; continuously self-tested; a launch ceremony that must pass **byte-identically on served numbers** with the
serve decision replayed as **stored data** (DR-060b, DR-063 VR-3). Failure to replay **evicts one number**, never
the answer (DR-059).

**C-10 · No judgement ⇒ no number** (§2.2 item 8, DR-028): *"any organ that would otherwise emit a number it did
not measure emits a typed, visible record instead."*

**C-11 · No invented measurements** (§2.2 item 9, DR-039): *"A metric, label, threshold or rule enters the spec
only with hard facts behind it. Nothing is adopted to manufacture confidence or 'for the sake of measuring
something'."* This is the standing bar every future constant must clear (§12.4 rows OD-01, OD-08, OD-12).

**C-12 · The eight house rules are floors and standing gates.** §11, §12.2 layer 3 (DR-029). H3's purity is
structurally load-bearing for C-9. H1's single provider interface is a precondition for DR-013 and DR-046. H4
requires **both operators computable on demand**.

**C-13 · Determinism obligations.** Deterministic, **recorded** arrow order because the left fold is not
bit-identical under reordering in IEEE-754 (§4.2a); **total, deterministic ledger ordering, never an arbitrary
tiebreak** (§8.2g, §13.1); the replay identity hash for decisions excludes idempotency key, spawn count and
classification fields (§7.2f); the reducer is deterministic by construction (§5.1).

**C-14 · Write-time enforcement at the node.** §6.2: **node type, lifecycle vocabularies, non-blank claim,
path/depth consistency** enforced at write time, not by convention; acyclicity per DR-056(b). §6.4: unknown node
type or arrow kind is **loud failure at write time**; blank claim rejected at write time, not merely at
serialization.

**C-15 · Closed declared enums with loud failure on anything unknown.** §4.4, §6.3, §6.4. Applies to child kinds,
arrow kinds, node types, lifecycle vocabularies, abstention kinds and condition marks.

**C-16 · Materialized path is a required capability.** §6.2: *"The path is not decoration: it is the cheap subtree
operator that makes ancestor-triggered invalidation possible at all, and V3 needs the same capability whatever it
is called."*

**C-17 · Per-node record, never a flat map.** §4.3 (`RULED — D4 clause §10.4`), §9.3: strengths must be per-node
records joining the number to its origin; the debug facet's tau map is the per-node provenance record, **not a
flat float map**.

**C-18 · Wire boundary.** §9.2j, §8.3, §9.3 (DR-054): typed honesty **projections** by default; **the complete
fact bundle and conformance record behind an authorized inspection/replay endpoint**; **internal prompt material
excluded from the default view**; **raw judge text never in a served item** (§5.3, §8.3, §9.3). *(Refined by
DR-066(1) — see §7.0.)*

**C-19 · The debug facet can never affect real scoring**, is **not part of the stable wire contract**, and uses
the **identical node set** as the scored graph (§9.3, DR-062 OD-18).

**C-20 · Fixed serve gate order and bounded recomposition.** §9.2i (DR-049): **R9 → Q53 → conformance → Q51**;
`max_recompose = 2`; **the conformance judge may never demand an edit that violates R9**; DR-057's
post-composition R9 failure is **terminal, no new loop**.

**C-21 · Honesty-critical fields are machine-injected outside model discretion.** §9.2h (DR-058) — residual
objections, badges, marks — *"so silent truncation is impossible."*

**C-22 · The protected core is never budget-skippable.** §7.2h (DR-021, DR-052): provenance, abstention typing,
standard-and-above blind verification, citation routes, **and serve-conformance**. Every skip carries a visible
marker; envelope exhaustion is **never a silent timeout**.

**C-23 · Only categorically-grounded decisions may spawn real work; unclassified fails closed to scalar.** §7.2c —
*"there is no calibrated ground truth for judge scalars, so a scalar threshold must never steer spend."*

**C-24 · Completeness gate before any aggregated run is persisted.** §8.2f path D: missing any required artifact →
**job fails, no aggregated run written**.

**C-25 · Contract-hash invalidation is total.** §8.2d: any change to rubric, prompt, output schema or reducer math
changes the hash and **invalidates every cached result and artifact**, so *"old outputs can never be silently
reinterpreted by newer code"*; the contract hash is **deliberately excluded from the input hash** (§8.2c) and
**included in cache identity**, with history never overwritten (§8.2e).

**C-26 · Value overlay detachment is an enforced invariant.** §4.2j, §12.2 layer 4 (DR-017): recompute every
strength with the overlay detached and **assert byte-identity**.

**C-27 · Constants are drawn fresh and V-ratified before production.** §2.2 closing, §13.2 (DR-023): *"Every
numeric constant recorded in this manifest is source material for a register row and nothing more."*

**C-28 · The UI data layer is rebuilt against V3's native shapes, not adapted.** §9.2g (DR-048), with all nine
honesty surfaces served.

**C-29 · Multi-maker critique is a launch gate.** §5.2g (DR-055): standard-and-above tiers must execute real
different-maker critique **from day one**; single-maker operation is legal **only as labeled degraded operation**
wearing DR-014's caps.

**C-30 · Quality-charter constraint inherited into architecture: no orphaned modules.** §12.1 (DR-047): *"no
orphaned modules — everything shipped is reachable and called"*, plus **research-upgradeability without
re-architecture**.

---

## 7. Open questions the manifest itself defers

The manifest declares (header line 17–18, §2.1, §12.4) that it *"contains zero open decisions and zero candidate
spans"* and that its register is **closed**. That is true of its `CANDIDATE(OD-n)` apparatus. It is **not** true
of the items below, which the manifest either routes elsewhere, conditions on future facts, or records as
unresolved in §16.2.

### 7.0 Resolved after the manifest froze — by DR-066 and DR-067 (ledger, not manifest)

The manifest's authority line cites DR-001…DR-064; `docs/founding/decisions-ledger.md` carries three later rows.
Under §2.2 item 1 these **override the manifest text**.

| Manifest item | Ledger ruling | Status for architecture |
|---|---|---|
| §16.2 item 1 — five sequenced adoptions with no trigger | **DR-066(2)**: *"the successor stage is pre-approved CONTINGENT on its named condition firing + V sign-off at activation; successors with no named condition (OD-11 layering, OD-20 risk-tiering) require a fresh ruling"* | **Partly resolved.** OD-04, OD-08, OD-17 successors are pre-approved-contingent. **OD-11 layering and OD-20 risk-tiering remain GENUINELY-UNANSWERED** and need a fresh V ruling. |
| §16.2 item 2 — undercut has no home in the graph organ | **DR-066(2)**: *"UNDERCUT CARRIER: an undercut is a typed attack targeting the support EDGE, never the claim node — architecture inherits it as a requirement"* | **Resolved, and it CONTRADICTS manifest §6.3.** See §8 A-1. Architecture must design an edge-targeting-edge relation. |
| §9.2j / §8.3 authorized inspection handle (DR-054) | **DR-066(1)**: *"'SHOW ME WHY' IS ASKER-SCOPED — the asker may replay their own answer's full record on demand (authorization = their session's scope; internal prompt material stays operator-only)"* | **Resolved and refined.** The manifest says only "authorized"; the ledger fixes the authorization model. |
| §12.4 OD-14 residue — the verdict-state token and its allowed combinations | **DR-066(3)**: the GLOSSARY's canonical verdict-model entry ratified as written (two axes; DR-014 caps the confidence band; numbers at DR-023) | **Resolved.** Vocabulary is `GLOSSARY.md` "Verdict model (canonical, DR-063 VR-2)". Numbers still deferred (see 7.1 O-1). |
| Manifest line 8, "Status: draft; awaiting … gate 31 and V acceptance" | **DR-067**: the acceptance; REQUIREMENTS loop CLOSED; the ARCHITECTURE mission consumes this pack | **Resolved.** Line 8 is stale; line 1's `ACCEPTED — DR-067` is authoritative. |

### 7.1 DEFERRED-BY-DESIGN — routed to a named owner or gated on a named condition

| # | Deferred item | Location | Routed to / condition |
|---|---|---|---|
| **O-1** | **Every numeric constant in the manifest**, including verdict band boundaries, abstention-price cell values, convergence epsilon and defaults, reducer coefficients and cap values, and the per-class detectability threshold for hard best-model routing | §2.2 closing; §13.2; §11 (convergence); §5.2f; §5.2k; §12.4 OD-13 | **DR-023** flag/config register, designed anew and **V-ratified before production**. DR-063(VR-2) defers every band number there; DR-067 restates it. |
| **O-2** | **OD-13 — verdict band thresholds** | §12.4 closed/rerouted table | **REROUTED — DR-047 → DR-063(VR-2)**: names and per-cell principle fixed, every number to DR-023. *"Tracked in artifact 4's register and the flag register, not counted here."* |
| **O-3** | **OD-01 — supporter-count cap** | §4.2g; §12.4 OD-01 | Reopenable **only** on *"measured outcomes showing clustering failing to catch inflation"* — the fact base DR-039 requires. |
| **O-4** | **OD-08 — promotion of the restatement flag to a collapsing gate** | §4.2i; §12.4 OD-08 | Available **only** after the similarity threshold is *"shown to fire correctly in both directions on real data"*, and then only with **complete-linkage grouping, within one polarity and one parent**. Successor pre-approved-contingent per DR-066(2). |
| **O-5** | **OD-12 — a numeric ceiling on τ per way of knowing** | §4.2h; §12.4 OD-12 | Reopenable on *"outcome data showing reasoning-only claims scoring high and being wrong"*, per DR-039. |
| **O-6** | **OD-04 — replacing the typed unknown magnitude with a verifier-vouched magnitude** | §6.3; §10.1; §12.4 OD-04 | *"the intended successor … can replace the unknown magnitude without changing the graph's shape — but only with a fact base behind the number, per DR-039."* Pre-approved-contingent per DR-066(2). |
| **O-7** | **OD-17 — deriving evidence-free composition membership from each claim type's own declaration (option c)** | §5.2f; §12.4 OD-17 | *"at the next revision of the type vocabulary."* Pre-approved-contingent per DR-066(2). |
| **O-8** | **OD-05 — a separate typed "incomplete conjunction" state (option c)** | §12.4 OD-05 | *"(c) is (b) with better copy and **may be adopted alongside it**."* Permissive, no owner named. |
| **O-9** | **Battery stage order / the retrieve-first experiment** | §7.2g | *"Stage order is the battery's as written, **provisional until the deferred retrieve-first experiment rules** (knob 6)."* DR-067 routes experiments post-prototype (DR-004). |
| **O-10** | **The whole stack apart from Postgres** | §13 opening; §2.2 item 5 | *"DR-005 left the stack to the ARCHITECTURE loop. DR-024 supersedes it in part."* Everything not C-1 is architecture's. |
| **O-11** | **The typed-non-answer enum membership** | §5.2m | Owned by `requirements-spec.md` §12.3 (Requirements S-11…S-13). *"This manifest cites by reference and never duplicates."* |
| **O-12** | **The `stranger_restatement` contract shape** | §6.2 item 1 | Owned by `requirements-spec.md` §12.7, ratified DR-061 (OD-S-06). *"cited by name here, never restated."* |
| **O-13** | **UI presentation cells (30 of them), including whether a percentage is served** | §16.2 item 3 | **DR-064**: delegated to **build-phase mockup reviews**, one per flex surface; *"architecture consumes their consequences, not their shapes."* Restated by DR-067. |
| **O-14** | **The V2 self-consistency estimator** | §3.1 closing | *"out by omission … If V intended otherwise, say so at review."* An open invitation, never taken up in the manifest. |
| **O-15** | **DR-046's provisional routing numbers** | §5.2k | *"hard best-model routing waits for a per-class detectability threshold (numbers **provisional in the DR-012 pattern**)"*, and the ~20 % exploration share is stated as *"about"*. |

### 7.2 GENUINELY-UNANSWERED — no owner, no condition, no ruling

| # | Item | Location | Why it is unanswered |
|---|---|---|---|
| **U-1** | **OD-11's layer-2 layering trigger** — who decides that per-side provenance detail (option c) is "arrived"? | §16.2 item 1; §12.4 OD-11 | DR-066(2) explicitly: *"successors with no named condition (OD-11 layering …) require a fresh ruling."* No such ruling exists in the ledger. |
| **U-2** | **OD-20's risk-tiering trigger** — who decides the risk tiers have arrived, and what the tier→claim-type gating map is? | §16.2 item 1; §12.4 OD-20; §9.2f | DR-066(2): *"(… OD-20 risk-tiering) require a fresh ruling."* The manifest only says the tiering reuses DR-012's class × risk-tier structure; the actual per-cell eligibility map exists nowhere. |
| **U-3** | **The acceptance bar for DR-032's "must demonstrably fire"** — the manifest routes it two ways | §12.1 *(charter acceptance item, "authored with the spec")* vs §5.2i / §12.4 OD-21 *(bar set by DR-063 VR-1)* | Both statements stand in the same document. VR-1 gives a three-part bar; §12.1 says the bar is a charter item. Whether the charter adds anything beyond VR-1 is not stated. |
| **U-4** | **What judge weight actually multiplies** | §5.2h (DR-032), §5.2j, §5.2k (DR-026/DR-046), §10.5, §12.2 P-D5 | DR-046 requires weights to drive *"weighting and diversity-routing"*, and P-D5 requires a judge's weight to **move** with outcomes — but DR-032 forbids *"replacing the whole score object with a weighted mean"* and §5.2h forbids averaging dispersion away. No clause states the consuming arithmetic. See §8 A-6. |
| **U-5** | **Whether judge weight is frozen into the replay record** | §8.2d, §8.3 (DR-034), §5.2k | The contract hash pins rubric/prompt/schema/reducer versions — **not the judge weight**, which DR-046 makes *"always-evolving, updated on every factually-settled round."* Nothing states that the weight-at-serve-time is part of the frozen records replay reads. See §8 A-5. |

---

## 8. Ambiguities an architect needs clarified

Strict list. Each is a place where two manifest clauses (or a manifest clause and a ledger row) cannot both be
implemented as written, or where a stated obligation has no stated carrier.

**A-1 · The undercut carrier: manifest §6.3 and DR-066 disagree, and the difference is a schema decision.**
§6.3 (DR-062 OD-19) says an undercut is *"an attack on the **target-side justification** and marked as an
undercut, **rather than as arrow-on-arrow arithmetic, which the engine has no shape for**"*, and §16.2 item 2
notes that §6.3 defines only three relations and *"no object called a justification"*. `decisions-ledger.md`
DR-066(2) rules the opposite carrier: *"an undercut is a typed attack targeting the **support EDGE**, never the
claim node — architecture inherits it as a requirement."* Under §2.2 item 1 the DR wins. **What is unspecified:**
whether the arrow record's `target` becomes a polymorphic reference (node-id | arrow-id), and — critically —
**what an edge-targeting attack does to the arithmetic**, since §4.2(c)'s transmission rule
(`arrow strength × strength(child)`) and §4.2(b)'s σ are both defined only over node-targeted arrows, and DR-062's
own text says the engine has no shape for arrow-on-arrow evaluation. The manifest's cycle law (§4.2d), topological
order, and the fingerprint definition (§4.3) are all node-graph-shaped.

**A-2 · Arrow strength is typed `[0,1]` but must sometimes be "unknown".** §4.2(c) and §6.3 declare the arrow as
`{source, target, polarity, strength ∈ [0,1], kind}`. DR-062 OD-04 (§6.3, §10.1) requires *"an attack arrow with a
**typed unknown magnitude**"*. §4.4 gives a typed error for τ outside `[0,1]` but says nothing about an absent or
unknown arrow strength. **Unspecified:** whether `strength` is nullable with a separate typed reason, or whether a
distinct `magnitude_status` field carries it; and how §4.2(c)'s "closed" rule (OD-06) and the integrity rule
(two strengths on one identity = loud error) apply when one of them is "unknown".

**A-3 · Two different lifting predicates for the same operation.** OD-02 (§4.2e) lifts a child's arrow to *"the
**nearest judged ancestor**"* with a required marker at **both** ends. OD-03 (§6.2 item 9, §6.3) lifts a
perspective folder's children to *"the **nearest real claim above it**"*, with **no marker requirement stated**.
These are different predicates — "judged" vs "real claim" — and the composition is unspecified: what happens when
the nearest real claim above a folder is itself unjudged, and whether folder-lifting also emits the OD-02 markers.
D2's own evidence (§10.2) shows this exact re-attachment rule moving the root from 0.96875 to 0.5, so the
composition is verdict-affecting.

**A-4 · The cluster key's fields are evidence-item fields; the partition is over sibling claim nodes.** §4.2(g)
states *"**sibling support** is partitioned by a provenance key"* and §10.3's measured case is three restatements
of a **claim** at 0.40. OD-09 (§12.4) selects the key from fields *"each already recorded on an **evidence
item**"* — study/dataset identity, producing model family, domain, publisher, run. **Unspecified:** how a
non-evidence sibling claim node acquires a study identity or producing model family; and whether cluster collapse
applies to **attack** arrows at all — §4.2(g) says "sibling support", while D3's clause (§10.3) is polarity-neutral
and OD-08's gate caveat mentions clustering *"within one polarity"*, implying both polarities cluster.

**A-5 · Where cluster collapse acts, and therefore what replay and the fingerprint see.** §4.2(c) lists *"provenance
cluster collapse (§4.2g)"* as one of the **two producers of arrow strength**, which reads as collapse writing arrow
strengths. §4.2(g) instead describes an aggregation-time rule — *"each cluster contributes once, at the strength of
its strongest member"*. The two readings differ observably: the first changes stored arrow strengths (and so the
graph fingerprint, the debug facet's arrow lists, and P-D3's assertion target); the second is a pure compute-time
filter. Combined with **U-5**, this is the same class of question as whether judge weight is part of the frozen
record DR-034 replays.

**A-6 · The judge-weight consumption path is required to exist and forbidden in its only described form.**
DR-026/DR-046 (§5.2k, §10.5) require weights that move with outcomes, and P-D5 (§12.2) tests that *"at least one
judge's weight moves"*. DR-032 (§5.2h) forbids V2's *"replacing the whole score object with a weighted mean"*, and
§5.2(h) requires dispersion to be **measured, never averaged away**. §5.2(j)'s correlated-error discount also
"discounts" weights without stating what consumes them. **Unspecified:** what a judge weight multiplies in the
reduction from N judgements to one τ, given averaging is prohibited — or whether weight is consumed **only** by
diversity-routing and the dispersion/disagreement surfaces, in which case P-D5's "weight moves" assertion has no
arithmetic consequence to test.

**A-7 · OD-20's "exact complement of §5.2(f)'s evidence-free list" is not well-defined over OD-16's type set.**
§9.2(f) fixes evidence-gate eligibility as *"the exact complement of §5.2(f)'s evidence-free composition list, so
the two stay consistent by construction rather than by maintaining a second list"*. §5.2(f) names the evidence-free
set as **normative, definitional and value-laden**. OD-16 (§12.4) names the claim-type vocabulary as *"empirical,
causal, normative, definitional, prediction, comparative, **mixed**, **unknown**"* — which **does not contain
"value-laden"** and **does contain "mixed" and "unknown"**. **Unspecified:** whether "value-laden" is a claim type,
a cross-cutting flag, or a member yet to be added; and which side of the complement `mixed` and `unknown` fall on —
i.e. whether an unknown-typed claim is evidence-gated or not.

**A-8 · DR-040's bounded declaration call may be unreachable under OD-22's resolution chain.** §4.2(f) states both
that *"an **undeclared** parent gets **one bounded declaration call**"* and that the scope is a resolution chain
*"per parent node, defaulting to a run-level declaration, defaulting to a **deployment setting**"*. If a deployment
setting always exists, no parent is ever undeclared and the declaration call — plus the withheld-parent path
DR-040 defines, which P-D2 explicitly tests (*"assert an undeclared parent takes DR-040's path rather than a
default"*) — becomes structurally unreachable. That is the shape D5 indicts (§10.5: a branch that *"can never
execute"*). **Unspecified:** whether the deployment level is optional, whether the declaration call sits above or
below the run level in the chain, and what the effective-level record says when the call supplied the value.

**A-9 · `pending` nodes enter the scored graph but the manifest never says what they are.** §6.2/§6.4 (OD-18)
admit *"everything except `stale`"*, and generation status includes `pending`. §7.3 has spawns create *"new nodes
and arrows … as **pending placeholders**"*. §6.2 item 10 forbids serving a placeholder as a claim. **Unspecified:**
whether a pending node counts as an "unjudged interior node" for OD-02's transparency-and-markers rule (so a
mid-flight run emits skip markers on every in-progress branch), and whether its placeholder arrows are live arrow
endpoints for §4.4's "arrow endpoint absent from the node set" error.

**A-10 · The manifest's evidence chain is unresolvable in this repository.** Every `../research/…`,
`../reviews/…` and `../wayfinder/…` citation — including the `file:line` V2 evidence in §10, the vector source
`03-golden-vector-plan.md` in §4.5, and the weight-derivation results in §4.2(e)–(k) — points outside `docs/`,
which contains only `founding/` and `missions/`. §14 makes the manifest the sole clean-room interface, so this is
not a clean-room breach; but it means **no manifest claim can be checked or deepened against its cited source**,
and the P-D3 / literature-vector numbers must be taken from the manifest text alone.

**A-11 · Two labeling residues worth confirming before they propagate.** (i) The manifest defines **M1, M2, M3
only** — there is no M4 anywhere in the document (grep-verified); any downstream reference to "M4" is an
invention. (ii) The traceability index (§15) lists DR-001…DR-063 but the authority line cites DR-001…DR-064, and
DR-064 appears only in §16.2 item 3 with no traceability row; DR-065/066/067 appear nowhere in the manifest.
