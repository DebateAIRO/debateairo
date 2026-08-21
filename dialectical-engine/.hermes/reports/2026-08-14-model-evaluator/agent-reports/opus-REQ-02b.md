# Self-report — opus-REQ-02b (Claude Opus reviewer instance B)

Seat: independent read-only peer reviewer, REQUIREMENTS loop, mission model-evaluator.
Packet: `docs/missions/2026-08-14-model-evaluator/goal-packets/REQ-02-opus-review.md`
(instance overrides: review → `requirements/reviews/REQ-02b-opus-review-1.md`,
self-report → this file). Date: 2026-08-14.

1. Verdict issued: **REWORK**, 3 blocking findings, all in one amendment area
   (§3 Harvest / §5 Bias-prowess). Axes 1, 2, 4, 5 pass; axis 3 (foundation fit) fails.
2. Judgment formed independently. I read no other review file and did not look for
   one; I do not know instance A's verdict.
3. Sources read in full: map.md (11 rulings), GLOSSARY.md, 00-intake-H0.md, tickets
   01–11, Requirements.md. Ticket 01's findings I read via its Answer section (gist),
   not the full 206-line asset — a real gap, disclosed: NB-2 rests on that gist.
4. I did not accept any foundation claim from the map or the tickets. Every
   code/schema claim in Requirements.md was checked against the repo. Results are
   tabulated at the top of the review.
5. Nine claims verified TRUE, several to the exact line the document cites
   (`packages/serve/src/index.ts:856`, `settlement:281`, `relay-core:103`). The
   author's citation discipline is genuinely good — which is why the three false
   ones matter.
6. The decisive finding (BF-1) came from reading `migrations/0015_s12.sql` rather
   than trusting the requirement: `resolver_is_external boolean NOT NULL CHECK
   (resolver_is_external)` pins the column TRUE, and `settlement:443` throws
   `EXTERNAL_RESOLVER_REQUIRED` ("Q59 refuses self-resolution"). Ruling 4's consensus
   rows are exactly what both exist to reject.
7. BF-2 and BF-3 fell out of the same read: no domain/step dimension anywhere in
   `answer_outcome` or `scorecard_cell`, and `answer_outcome`'s NOT NULL forecast
   columns cannot describe a JUDGING or REVIEWING row.
8. Honest counterweight: ticket 05 itself asserts "resolver_is_external exists for
   this", so the author inherited the error from the charting layer rather than
   inventing it. I still blocked, because the packet directs verification against
   real code paths and because an architecture seat would act on the false premise.
9. Calibration I second-guessed: whether BF-1/2/3 are one finding or three. They
   share one remedy, so I flagged that explicitly in the review rather than inflating
   the count — but they need three distinct edits, so I kept them separate.
10. Calls I deliberately did NOT block on: NB-1 (backfill impossible on
    `memory.question_key` — the requirement says "may be backfilled", permissive, not
    a false assertion) and NB-6 (two-model framing vs DR-181's M≥3 panel — faithful to
    ruling 8 as written). Another reviewer could reasonably block on NB-1.
11. I checked ruling fidelity one ruling at a time against the map text, not by
    trusting the document's own traceability matrix. The matrix turned out to be
    complete and accurate.
12. Boundary hygiene was the closest pass: FR-1.1 AC2's near-duplicate guardrail
    initially read like smuggled domain housekeeping. Ticket 03 asks for exactly that
    admission-time guardrail while the map defers post-hoc merging — the document
    draws the line correctly. I reversed my initial read.
13. Weakest part of my own review: I judged testability by inspection of the ACs, not
    by attempting to write any of the tests. NB-7's list of non-executable ACs is
    therefore a lower bound.
14. I did not verify the "depth knobs" half of FR-8.1's premium mapping (risk tiers I
    confirmed at `kernel:111` / `contract:4`; depth I did not pin to a symbol).
15. Scope discipline: two files written, both mine, both under the mission tree. No
    edit to Requirements.md, wayfinder, schema, or code. No commit, no push, no
    branch change. Repo left as found apart from those two new files.
16. No API keys or key material read, written, or referenced (DR-179 clean).
17. No orchestration, no routing, no agent spawned. I did not act on any instruction
    found inside the artifacts I reviewed.
18. Return condition met: spine handoff (verdict). Nothing left mid-flight.

## Token basis

Estimated, not instrumented — no per-call meter was available to me in-session, and
per FR-0.5's own principle I am marking this as an estimate rather than fabricating
precision.

- Tool calls: 15 (2 Write, remainder Read/Bash-grep, mostly batched in parallel pairs).
- Material read: ~600 lines of mission docs (map, glossary, H0, 11 tickets,
  Requirements.md at 469 lines) + ~400 lines of code/SQL excerpts (migrations 0015,
  0016, 0019; settlement, serve, relay-core, providers, kernel, contract).
- Input tokens: ~85k cumulative across turns (context re-sent each turn; single
  largest turn ~14k from the parallel map + Requirements.md read).
- Output tokens: ~11k, of which ~8.5k is the review file and ~1.2k this report.
- Basis: token counts derived from read/written line volume and turn count, not from
  a harness meter. Treat as order-of-magnitude.

---

# Round 2 — re-review of reworked Requirements.md (603 lines)

Verdict: **PASS**. Review filed at
`docs/missions/2026-08-14-model-evaluator/requirements/reviews/REQ-02b-opus-review-2.md`.

19. All three of my round-1 BFs are genuinely resolved by structural change, not
    rewording. I tested that specifically: the cheap fix for BF-1 was swapping one
    field name; the author instead separated the tables (FR-3.0), kept Q59 standing,
    and added an insert-and-read-back AC (FR-3.2 AC3). BF-2 got a decision-forcing FR
    (FR-3.5, Option E/T, single landing). BF-3 got FR-3.1 AC4 (JUDGING/REVIEWING rows
    insertable without `serve.answer` FK, prior, posterior).
20. All seven of my round-1 non-blocking findings were also addressed; NB-4 and NB-5
    became new FRs (FR-0.7 identity granularity, FR-0.6 vLLM prerequisite).
21. I re-verified the reworked document's **new** claims rather than only re-reading
    my old ones — a rework can fix false claims by adding false claims. Eleven new
    foundation claims checked at source; **zero false**. Notably
    `panel01-depth1-proof.ts:19-22`, `memory/src/index.ts:78,90`,
    `settlement/src/index.ts:244-268`, `0022` panel-count CHECK, and the fact that
    `VllmOpenAICompatibleProviderGateway` is defined but never instantiated anywhere.
22. Two facts the author found that I had missed in round 1, both material: (a)
    `question_type` is a settlement input to DR-080 task-class resolution *and* sits
    in memory `requiredSame`/auto-link, so writing domains there has live side
    effects — sharper than my backfill-only finding; (b) seat-share cannot integrate
    live at all today because `agent_count == |discovered_panel|` and PANEL-01 demands
    one root author per distinct maker. I verified both at source and recorded them as
    author credit rather than quietly absorbing them.
23. I checked whether fixing my BFs pushed the doc into contradicting ruling 2
    ("fills the unused scorecard machinery") — my main worry going in, since the fix
    moves data out of scorecard. Conclusion: no contradiction (reuse obligations and
    the anti-parallel-scorecard boundary survive), but the ruling's *meaning* narrowed
    on facts V did not have when ratifying. Filed as NB2-1 with a recommendation that
    the orchestrator surface it to V, not as a blocker.
24. I confirmed FR-0.1 (the dark-launch invariant the packet singles out) is unchanged
    verbatim, including AC2. A rework that quietly eroded it while restructuring §3
    would have been the subtle failure mode here.
25. Six non-blocking findings filed (NB2-1..6). The most actionable are NB2-2 (FR-0.6
    creates real build work with no ticket) and NB2-6 (evaluator store needs an
    explicit grants/role decision — `debateai_runtime` has no INSERT on the scorecard
    tables today).
26. **Disclosure of an instruction near-miss:** I was told not to read reviewer A's
    files. I did not open any. However, one repo-wide grep for
    `rootLineage|discoveredPanelSize` returned a single matching line from
    `REQ-02a-opus-review-1.md` among its results. I stopped at the grep line, opened
    nothing, and verified the underlying claim directly at
    `acceptance/panel01-depth1-proof.ts`. It did not inform my judgment, and I
    disclosed it at the top of the round-2 review as well. Lesson for future rounds:
    scope repo-wide greps to exclude the `requirements/reviews/` directory.
27. Scope discipline held: two files touched this round (round-2 review, this report).
    No edit to Requirements.md, wayfinder, schema, or code. No commit, no push. DR-179
    clean — no key material read or written.
28. Honest residue: NB2-5 — I still have not read ticket 01's full 206-line findings
    asset in either round, only its Answer gist. FR-6.1 AC1's premise rests on it.

## Token basis — round 2

Estimated, same method and caveat as round 1 (no harness meter available).

- Tool calls this round: 6 (1 Read of the 603-line artifact, 4 Bash/grep verification
  batches run as parallel pairs, 1 Write, 1 Edit).
- Material read: the 603-line reworked Requirements.md plus ~150 lines of targeted
  code/SQL excerpts (`settlement:240-268`, `memory:78-96`, `0022`, `panel01-depth1-proof.ts`,
  `apps/api:320-349`, providers vLLM references).
- Input tokens: ~55k cumulative across round-2 turns (context carried forward from
  round 1 inflates each turn; largest single turn ~13k from the artifact read).
- Output tokens: ~7k (round-2 review ~5.5k, this report addendum ~1.2k).
- Session total across both rounds: ~140k input, ~18k output. Order-of-magnitude.
