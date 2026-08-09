# Goal packet — C2 Plan author (ARCH-V3-R1)

Launch packet per Graph Spine v2 §4: state block, upstream artifacts, one
handoff marker, stop conditions. Nothing else is authorized.

## 1. Ticket-state block

```yaml
state:
  ticket: ARCH-V3-R1 / C2
  risk_tier: high            # architecture — immutable floor
  planning_tier: 2
  status: working
  owner: { agent: opus-5, session: c2-author }
  contract:
    allowed:
      - docs/missions/2026-08-05-v3-architecture/architecture/Plan.md   # your ONLY write
    readonly:
      - docs/missions/2026-08-05-v3-architecture/research/digest-requirements-spec.md
      - docs/missions/2026-08-05-v3-architecture/research/digest-carryover-manifest.md
      - docs/missions/2026-08-05-v3-architecture/research/digest-ui-boundary-contract.md
      - docs/founding/**        # spot-check source of truth when a digest is unclear
      - README.md
    forbidden: all_others       # no code, no founding-doc edits, no other files
    verification: [every normative claim cites a DR or founding-doc section;
                   every stack choice labeled SEAT-PROPOSAL;
                   every open item carries exactly one disposition]
    human_review: yes           # V ratifies the stack (DR-005/DR-024); nothing here is final
  rework_round: 0
```

## 2. Upstream artifacts (read in this order)

1. The three research digests (paths above) — your primary evidence base.
2. `docs/founding/quality-charter.md` — the acceptance bar your plan must be
   buildable against (read fully).
3. `docs/founding/GLOSSARY.md` + `docs/founding/decisions-ledger.md` —
   vocabulary and authority trail (read fully).
4. `docs/founding/requirements-spec.md`, `carryover-manifest.md`,
   `ui-boundary-contract.md` — consult targeted sections only where a digest
   flags something you must verify at source. Do not re-read them whole.

## 3. The artifact: Plan.md

Write `docs/missions/2026-08-05-v3-architecture/architecture/Plan.md` — the
architecture plan for DebateAI-V3. Target 600–1200 lines. Required sections:

1. **Consolidated constraint base** — the union of the three digests' hard
   constraints, deduplicated, each with its citation. This is the plan's
   ground truth; everything after must trace to it.
2. **Stack proposal** — language/runtime, web/API framework, Postgres access
   + migration tooling, test framework(s), repo layout, dev/run tooling.
   Every choice: SEAT-PROPOSAL + rationale + at least one rejected
   alternative with the reason. Binding constraints to honor: Postgres only
   store (DR-024, C-1); pure propagation core H3 (no I/O/clock/randomness/DB
   in scoring math — DR-034's precondition); provider-agnostic H1/H2;
   swappable semantics H4; UI data layer rebuilt against the native API
   (DR-048); one transport front door (UI digest L5); no orphaned modules
   (DR-047 clause 4). The kept V2 UI's framework is whatever it already is —
   check the ui digest; do not propose rewriting kept components.
3. **Bounded contexts and module map** (DDD law) — modules with owned
   invariants, honoring one-graph/one-engine/one-serve (DR-030) and the
   FINAL organ↔stage table (DR-056a). State the DDD impact explicitly:
   contexts, domain terms (GLOSSARY-conformant), invariant ownership.
4. **Data model direction** — Postgres schema shape (not full DDL): graph
   store with a mandatory first-class edge table whose target is polymorphic
   (node OR edge — DR-066's undercut carrier), execution ledger (append-only,
   total deterministic order, contract-hash discipline), model ledger +
   scorecards (DR-046), register (DR-023), memory store, answer index.
   Every schema decision cites its constraint.
5. **API direction** — resource/projection shape honoring the wire contract
   (typed honesty projections; full bundle + conformance record behind the
   authorized inspection/replay handle, asker-scoped per DR-066; real
   pagination; reads side-effect-free). Encoding (REST/GraphQL/etc.) is
   yours to propose, V's to ratify.
6. **Open-item dispositions** — for EVERY GENUINELY-UNANSWERED item and
   EVERY ambiguity in the three digests (spec OQ-G1..G10, AM-1..14; manifest
   U-1..U-5, A-1..A-11; UI C2/C5/C6/C8 + its 12 ambiguities): exactly one of
   - `RESOLVED-BY-PACK` — the pack answers it; cite where.
   - `DESIGN-NEUTRALIZED` — the architecture is shaped so any plausible V
     answer fits; say how.
   - `V-QUESTION` — queued for V, phrased as the smallest possible question,
     with your seat recommendation and its consequence. Never rule it.
   DEFERRED-BY-DESIGN items: list them in one table confirming the
   architecture leaves the deferral open (no per-item analysis needed).
7. **C4 artifact-set plan** — the architecture documents you will author at
   C4 into `docs/architecture/` (names + per-doc scope, e.g. overview,
   ADRs, data-model, module-design, api-contract, register skeleton,
   test-strategy honoring the charter's fixtures/property tests/replay
   ceremony, build-order). This list is reviewable scope — keep it honest.
8. **G5 slicing preview** — first cut of vertical slices for the future
   PROGRAMMING mission (walking-skeleton first; each slice names its
   charter gates).

## 4. Authoring laws

- No invented rulings: product questions are V's. No invented numbers
  (DR-039). Proposals are labeled SEAT-PROPOSAL.
- Every normative claim cites a DR or a founding-doc section. Uncited
  normative text is a review finding.
- Where digests disagree with founding docs, the founding doc wins; where a
  founding doc disagrees with the ledger, the DR wins — flag both cases.
- Write dates only as 2026-08-05 (mission date); no other timestamps.

## 5. Handoff marker (your final message — nothing else)

```text
READY FOR STAGE REVIEW:
- mission/step: ARCH-V3-R1 / C2
- artifact path: docs/missions/2026-08-05-v3-architecture/architecture/Plan.md
- upstream artifacts used: <list>
- checks: <self-checks run: citation discipline, disposition completeness,
  section completeness against this packet §3>
- assumptions/risks: <top items>
- open-item disposition counts: RESOLVED-BY-PACK n / DESIGN-NEUTRALIZED n / V-QUESTION n
```

## 6. Stop conditions

Stop and report (do not improvise) if: a founding doc contradicts the ledger
in a way that blocks a plan section; the digests' constraint sets conflict
irreconcilably; or any write outside your single allowed path would be
needed. Record the blocker in your final message instead of the marker.
