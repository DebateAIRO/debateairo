# Goal packet — C4 artifact-set authors (ARCH-V3-R1 / C4)

Shared packet for the parallel C4 author lanes. Fires ONLY after the C2 plan
gate records PASS. Each lane is an Opus 5 seat with a disjoint file contract
(spine parallelism law: one writer per file; lanes may run concurrently).

## Common state (all lanes)

```yaml
state:
  ticket: ARCH-V3-R1 / C4 / lane-<n>
  risk_tier: high
  status: working
  owner: { agent: opus-5, session: c4-lane-<n> }
  contract:
    allowed: [<the lane's files ONLY — see lane table>]
    readonly:
      - docs/missions/2026-08-05-v3-architecture/architecture/Plan.md   # THE contract
      - docs/missions/2026-08-05-v3-architecture/research/**
      - docs/founding/**
    forbidden: all_others    # no other C4 doc, no founding doc, no mission report
    verification: [every normative claim cites AC-nn and/or DR/founding section;
                   no invented numbers/rulings; scope table's out-of-scope respected]
    human_review: yes        # V ratifies stack + architecture (DR-005/DR-024)
```

## Common authoring laws

1. Plan.md (post-review revision 2, 1737 lines, AC-01..AC-92) is your ONLY
   contract. Where Plan.md § 7's scope table and this packet disagree, Plan.md
   wins. Digests and founding docs are for citation-checking, not new scope.
2. Every normative claim cites its AC row and/or DR / founding-doc section.
   SEAT-PROPOSAL labels carry through wherever the plan carries them; never
   silently promote a proposal to law.
3. No invented numbers (DR-039/AC-76): a constant appears only as a register
   key, with a value only where the pack states one.
4. The stranger law applies to the documents themselves: each must be
   restatable by a reader with no project history (charter clause 2).
5. V-QUESTIONs: never rule one. Where your document touches an open question,
   state the carrier design and mark the behavior "pending V — Q-nn",
   referencing 08-open-questions-for-V.md's numbering.
6. Dates: 2026-08-05 only. Write into docs/architecture/ exactly the files
   your lane owns.
7. CONDITIONAL BANNER (mandatory, added at freeze): the upstream C2 plan
   gate FROZE at the rework cap; V steering is queued (morning packet row
   VS-1). Every C4 file begins with this exact banner block:
   `> **CONDITIONAL** — authored against Plan.md rev 3 while the C2 plan
   gate is FROZEN at the rework cap pending V steering (packet row VS-1;
   see docs/missions/2026-08-05-v3-architecture/reviews/merge-verdict-plan-round3.md).
   Nothing in this document is accepted architecture until V steers.`

## Lane table (disjoint contracts)

| Lane | Files (under docs/architecture/) | Source sections in Plan.md | Notes |
|---|---|---|---|
| 1 | 00-overview.md, 09-traceability.md | §1 (AC-01..92), §2.6, §3, §7 rows 1+10 | Overview to the stranger law; traceability = AC → owner → carrier (data/API) → fixture, bidirectional, incl. AC-86..92 fully resolved |
| 2 | 01-decisions/ADR-0001..0014 (one file per ADR, kebab titles) | §2 (all), §3.2 seams, §4.2, §5.1, §7 row 2's planned set | 14 ADRs: context/options/decision/consequences/AC served; decision status "PROPOSED — V ratifies (DR-005/DR-024)" |
| 3 | 02-data-model.md | §4 (all incl. §4.1a), §7 row 3 | All named rework additions (run split, required-node predicate, undercut FK invariant, upsert semantics, strength_source fence, non-blank CHECK, condition_mark_node, segment→number refs); closed-enum inventory with single sources |
| 4 | 03-module-design.md, 05-register-skeleton.md | §2.6, §3, §4.6, §7 rows 4+6 | Dependency graph as the enforced edge list; provider gateway; pure-core signatures + lint gates; register schema + resolution chains + provisional-row metadata + key inventory (NO values beyond pack-stated) |
| 5 | 04-api-contract.md | §5 (all), §7 row 5 | W1 deliverable: frozen resource vocabulary, projections, closed enums, typed errors, events with declared consumers, auth tiers, versioning, AC-61 field inventory; presentation cells stay out (DR-064) |
| 6 | 06-test-strategy.md | §7 row 7 (its full named list), §8 gate columns | Four layers + charter §5.2 fixture map + fire-both-ways + all rework-named fixtures (the row-7 scope list is exhaustive — miss none) |
| 7 | 07-build-order.md, 08-open-questions-for-V.md | §6 (V-QUESTION rows + §6.8 blocks table + §6.9 + §6.10), §8, §7 rows 8+9 | Build order: per-slice entry criteria + launch-readiness matrix + the two explicit dependencies (OQ-G2 row-6 fixture; charter §9 item 7 before S15). Questions doc: the 28 distinct questions, smallest form, SEAT-PROPOSAL + consequence + blocks-from-slice-Sn. THE single place V answers |

## Handoff marker (each lane's final message)

```text
C4 LANE COMPLETE:
- lane: <n>
- files written: <paths + line counts>
- source sections consumed: <Plan.md §§>
- checks: <citation discipline; scope table respected; V-QUESTION count if lane 7>
- gaps found in Plan.md while authoring (if any): <listed, not silently fixed>
- assumptions/risks: <top items>
```

## Stop conditions

Stop and report instead of improvising if: Plan.md's scope for your document
contradicts itself or a founding doc; your document would need to rule a
V-QUESTION to proceed; or any write outside your lane's files would be needed.
