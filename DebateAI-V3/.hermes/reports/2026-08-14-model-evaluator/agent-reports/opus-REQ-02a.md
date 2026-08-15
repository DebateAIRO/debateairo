# Self-report — opus REQ-02a (Claude Opus reviewer instance A)

Goal packet: `docs/missions/2026-08-14-model-evaluator/goal-packets/REQ-02-opus-review.md`
(instance overrides: reviews → `requirements/reviews/REQ-02a-opus-review-<n>.md`,
self-report → this file). Seat: bounded read-only peer reviewer.
Round 1 verdict: **REWORK** (B1–B5). Round 2 verdict: **REWORK** (B1–B5 all resolved;
one new blocking finding C1). Round 3 verdict: **PASS** (C1 resolved; narrow diff, no
regression). Rounds 2 and 3 are appended at the end of this report.

1. I read the packet first, then the artifact under review, then its sources in this
   order: map.md (11 rulings), GLOSSARY.md, intake H0, all 11 wayfinder tickets, the
   ticket 01 findings asset, and the decisions ledger entries for DR-115/179/180/181/182.
2. I deliberately did not judge foundation fit from the findings asset. Every code claim
   in my review was re-verified against the actual file and line in DebateAI-V3 — schema
   in `migrations/0015_s12.sql`, `0016_s13.sql`, `0019_xrev01_node_review.sql`,
   `0022_dr181_discovery.sql`, plus `packages/settlement`, `packages/memory`,
   `packages/providers`, `packages/serve`, `apps/api`, `apps/runner`, `acceptance/`.
3. The single highest-value check was reading the `scorecard.answer_outcome` DDL rather
   than trusting the requirement's description of it. `resolver_is_external boolean NOT
   NULL CHECK (resolver_is_external)` admits only TRUE, and settlement throws
   `EXTERNAL_RESOLVER_REQUIRED` ("Q59 refuses self-resolution") on the code side. The
   requirement cites that exact field as already recording consensus-vs-settlement. It
   records the opposite. That is B1.
4. B3 came from a grep that returned nothing: `seat` has zero hits across packages, apps
   and acceptance. Chasing why led to the DR-181 constraint `agent_count =
   jsonb_array_length(discovered_panel)` and PANEL-01's live proof requiring distinct root
   makers equal to panel size — i.e. one seat per maker, enforced three ways.
5. B4 I nearly missed. `question_type` reads like a spare nullable column until you find
   `resolveScorecardTaskClass` refusing unmapped `(settlement_act, question_type)` pairs
   and `requiredSame` in the memory matcher. Combined with the append-only, one-row-per-run
   `memory.question_key`, the doc's "backfill later" is false for that landing site.
6. Honest counter-pressure on myself: B2 is the finding I was least sure should block.
   The doc does hedge with "or documented extension composing with it". I kept it blocking
   because the hedge makes AC1 unfalsifiable — any table satisfies it — and because the
   named target genuinely cannot hold the described rows. I flagged the reasoning openly
   so a rework author can push back.
7. I also checked what the doc gets right and wrote that section first, so the REWORK is
   not read as a rejection of the artifact. Ruling fidelity, boundary hygiene and the
   stranger test all genuinely pass; the failures are concentrated on foundation fit.
8. I ran the DR-179 grep myself over the mission directory rather than asserting it: clean,
   one false positive from the substring in "task-notification".
9. I did not check the second reviewer's output and do not know it exists; this verdict is
   independent by construction.
10. Scope discipline: my only writes were the review file and this report. No edits to
    Requirements.md, no edits to wayfinder tickets, no commits, no push, no branch change.
11. Two `mkdir -p` calls were needed (`requirements/reviews/`,
    `.hermes/reports/.../agent-reports/`); neither directory existed. That is the full
    extent of my filesystem side effects beyond the two files.
12. Things I could not verify and did not claim: whether V has since ruled on Q59 vs
    ruling 4 anywhere outside the ledger entries I read; whether an architecture doc
    already plans the vLLM provider row (none exists in this mission's directory yet).
13. Rework guidance is written as direction, not prescription — for B1, B3 and B5 the
    right answer plausibly requires a V or orchestrator call, and I said so rather than
    inventing one.
14. If the rework author disagrees with B2 specifically, I would accept a tightened AC
    (one documented queryable path, named) over a schema decision at this phase.
15. Time/effort shape: 12 tool calls, roughly two thirds of them code verification rather
    than doc reading.

## Token basis

Exact token usage is **not self-measurable from inside this session** — per the repo's own
practice (TOKEN-LEDGER 2026-08-13/14: state the basis or say it is unavailable, never
estimate; DR-115). The authoritative surface is the orchestrator's harness task-notification
usage fields for this subagent. Recorded basis instead:

- Inputs read: goal packet (50 lines), Requirements.md (470 lines, ~30 KB), map.md,
  GLOSSARY.md, 00-intake-H0.md, 11 ticket files + findings asset (concatenated, ~18 KB),
  4 targeted schema/code slices, ~6 greps, 1 decisions-ledger slice (~75 lines).
- Outputs written: review file (~200 lines), this report.
- Tool calls: 12 (10 read/inspect, 2 writes; plus 1 mkdir).
- Marked **unmetered** for token count, not estimated.

---

# Round 2 — re-review after Grok's rework (same session)

Review artifact: `requirements/reviews/REQ-02a-opus-review-2.md`. Verdict: **REWORK**,
narrowly — B1–B5 all genuinely resolved, one new blocking finding (C1).

16. My working rule for round 2: a corrected sentence is not evidence that the constraint
    was understood. I re-opened `0015_s12.sql`, `0016_s13.sql`, `0019`, `0022`,
    `packages/settlement`, `packages/memory`, and the PANEL-01 proof and checked the
    rework's new foundation table claim by claim rather than diffing prose.
17. Every schema fact in the reworked FR-0.2 table is accurate, including the subtle one I
    expected to be flattened: the `answer_outcome_first_settled_wins` index is *partial*
    (`WHERE accepted`), and the doc says so. That raised my confidence that the author
    actually read the DDL this round.
18. B1 is resolved in the way I hoped but did not specify: the Q59 collision is *named as a
    collision* and routed (Open question 11 + a Boundaries row), instead of being dissolved
    by wording. FR-3.2 AC3 is a positive falsifiable test, which is stronger than what I
    asked for.
19. B2's fix removed the unfalsifiable hedge two ways — FR-3.1 AC4 (JUDGING/REVIEWING rows
    insertable *without* the settlement FK/prior/posterior) and FR-3.5 forcing exactly one
    (domain, step) landing. I checked that Option T still requires a DR-080 non-collision
    proof; it does.
20. B3 and B4 fixes are honest scoping, not weakening. FR-8.1's new M=1/M=2/M≥3 clauses
    close a two-model assumption I had missed in round 1 — worth recording as a miss of
    mine, not a merit of the author only.
21. C1 is the finding I am least comfortable delivering, because it is the *fix for my own
    B5* that created it. I pushed on it before writing it up: read
    `readDeploymentMakerCapability` (single flat `configuredProviderSet` row, no
    purpose/family field), `resolveDiscoveredPanel` (probes exactly that list),
    `apps/api` panel sizing, the `0022` `agent_count` identity, and
    `selectDifferentMakerReviewer`. Configuring vLLM the one way FR-0.6 cites enrolls the
    local model as an authoring and reviewing maker in every live run.
22. I then tried to argue myself out of it: does FR-0.1 already forbid this? No — FR-0.1
    binds "evaluator-**derived data**" and its AC tests only that dispatch does not read
    evaluator rank or cost. A vLLM panel member passes that test while changing every
    panel. The leak is configuration, not data, so nothing in the document catches it.
23. Could the evaluator configure a private gateway instead of the register row? Plausibly
    yes, and I said so in the review — but FR-0.6 explicitly cites the register row as the
    gap it closes, and that ambiguity between "register" and "config" is exactly where the
    side effect hides. Hence one AC, not a restructuring.
24. Honest calibration: C1 is one AC away from PASS from my seat, and I said that in the
    review so the coordinator can weigh a narrow REWORK against a conditional pass. I did
    not soften the verdict to reward a good-faith rework — the defect changes live product
    output, which is the class of thing this seat exists to catch.
25. Scope discipline held: round-2 writes were the round-2 review file and this appended
    section. No edits to Requirements.md, no commits, no push, no branch change. I did not
    read reviewer B's artifacts; this verdict remains independent.

## Token basis — round 2

Same basis rule as round 1: exact tokens are **not self-measurable from inside this
session** (DR-115 / TOKEN-LEDGER practice — state the basis or say it is unavailable,
never estimate). Authoritative surface is the orchestrator's harness task-notification
usage fields.

- Inputs read round 2: reworked Requirements.md (603 lines), 5 targeted code slices
  (`packages/critique` configured-provider reader, `apps/api/src/main.ts` discovery,
  `apps/runner` reviewer selection, orphan-audit line, plus re-checks), 3 greps.
- Outputs written: round-2 review (~150 lines), this appended section.
- Tool calls round 2: 8 (5 read/inspect, 3 writes/edits).
- Cumulative across both rounds: 20 tool calls. Token count **unmetered**, not estimated.

---

# Round 3 — final verification of the C1 fix

Review artifact: `requirements/reviews/REQ-02a-opus-review-3.md`. Verdict: **PASS**.

26. Scope was narrow by instruction, so I spent the round on two things only: is the C1 fix
    real, and did anything else move. The mission directory is untracked in git, so there
    was no diff to lean on — I re-read all 606 lines against the round-2 text I still had
    in context and enumerated the changes myself.
27. The diff is genuinely narrow: FR-0.6(1) mechanism clause, FR-0.6 AC5, FR-0.6
    traceability, Open question 12, one document-control line. Everything else is
    byte-identical. None of the round-1 resolutions (Q59 separation, FR-3.0/3.5, FR-8.0,
    FR-1.3) moved, and neither did the falsifiable ACs that carried them.
28. AC5 matches my prescription clause for clause, including the differential QA test
    (same panel membership and `agent_count` with the evaluator vLLM path
    configured-and-healthy versus absent). I checked it as a list rather than reading for
    gist, because "prescribed fix applied" is the easiest thing to accept too readily.
29. I re-verified the four mechanism facts the author added rather than trusting my own
    round-2 notes: flat `configuredProviderSet` entries with no purpose field,
    `resolveDiscoveredPanel` probing exactly those refs, the `0022` `agent_count`
    identity, and reviewer selection from configured makers. All accurate.
30. The finding I am most glad I chased: at round 2 I flagged reviewer selection as a
    possible second exposure and could not confirm it. This round I followed it —
    the runner's `#configuredMakers` does come from injected settings
    (`apps/runner/src/index.ts:657`), but the array passed to
    `selectDifferentMakerReviewer` (`:1359`) is the local one filtered through
    `run.discoveredPanel` (`:833-887`). Panel discovery is the single choke point, so AC5
    closes the whole surface. That makes the fix stronger than the document claims, and it
    retires a worry I would otherwise have carried into the verdict.
31. I recorded that the document's phrasing understates this (reviewers are drawn from
    configured makers *present in the discovered panel*) as a wording simplification, not
    an error — being precise about which direction an inaccuracy cuts matters when the
    verdict is PASS.
32. Four non-blocking notes carried forward: maker-string naming for the evaluator family,
    the ticket matrix pre-empting OQ12, FR-0.1's still data-scoped wording, and the
    persisting round-2 nits. I deliberately did **not** convert any into a blocker to
    justify a third REWORK; none of them changes behavior.
33. On FR-0.1: I considered asking for the invariant itself to be broadened to cover
    configuration-shaped influence, and decided against it. A specific executable AC where
    the risk lives is worth more than a broadened invariant no QA agent can run. Said so
    in the review so the reasoning is inspectable rather than implicit.
34. Scope discipline held across all three rounds: my only writes were the three review
    files and this report. No edits to Requirements.md, no commits, no push, no branch
    change, no reading of reviewer B's artifacts — the verdict stayed independent.
35. Honest closing calibration: three rounds, 6 blocking findings total, all resolved. The
    author's rework was substantive each time rather than cosmetic, and round 3 needed no
    new argument from me — only verification.

## Token basis — round 3

Same rule: exact tokens **not self-measurable from inside this session** (DR-115 /
TOKEN-LEDGER practice). Authoritative surface is the orchestrator's harness
task-notification usage fields.

- Inputs read round 3: full Requirements.md re-read (606 lines), 3 targeted runner/API
  code slices, 1 git status check.
- Outputs written: round-3 review (~130 lines), this appended section.
- Tool calls round 3: 6 (3 read/inspect, 3 writes/edits).
- Cumulative across three rounds: 26 tool calls. Token count **unmetered**, not estimated.
