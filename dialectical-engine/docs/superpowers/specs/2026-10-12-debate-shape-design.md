# Spec: a better debate shape (angle map + focused arguing)

Status: SPEC. Approved by the owner in chat on 2026-10-12. Every design choice in it was made in chat. The owner
pre-approved this written spec, the plan and the build: "yes, write the spec and also implement it, I only want to be
notified at the end … Only if something is off I should be notified". Base: origin/release/2026-10-12-r14 (4be76a3e3).
Branch `design/2026-10-12-debate-shape`. Phase 2 builds on Project 1's call scheduler (spec
`2026-10-12-parallel-calls-design.md` on branch `feat/2026-10-12-parallel-calls`).

Research behind this spec: the owners' private research folder `docs/research/2026-10-12-debate-shape/`, outside this
repository. It holds 40+ papers, measurements from earlier debates and cost models. The comparison method that decides
between openings and judges the new shape is the owners' private method and is deliberately not in this repository.

## In plain words

Today every AI writes one full opening answer without seeing the others. Under every point the engine adds exactly one
supporting and one attacking reply. Every point is graded by all the other AIs, and every opening replies to every other
opening. Three problems follow:

- **The answers overlap.** Different AI makers mostly give the same answer. In the earlier engine every opening reached
  the same verdict, so the "margin" between openings often compares two versions of one answer.
- **The pros and cons repeat.** 12–15 attacks came down to 5–6 different ones.
- **Grading costs too much.** With 4 AIs, 72 of ~120 calls are grading; with 7 AIs, three quarters. And only the
  highest grade counts.

The new shape has two stages.

**Stage 1, the map.** It is cheap and wide, about $0.01–0.02:

1. One call picks the angles to look from. Three are always included: the strongest case for the opposite answer, what
   the person asking is probably worried about, and the practical "what should I do".
2. Each AI lists short points from its own angle. They all work at the same time, and none sees the others' lists.
3. One call merges the lists, and the code records which AIs raised each point.
4. One or two "what is still missing?" rounds follow; this is the owner's snowball.
5. A "choose" step names 2–4 genuinely different answers and the most important points for and against each.

**Stage 2, the debate.** It is graded and focused:

- Each answer is argued in full by a different AI.
- 3–4 chosen points sit under each answer, and each point is written out and graded.
- Grading uses 3 graders from other makers (2 on Free), with 2 more when they disagree a lot.
- Each answer replies once to its strongest rival.
- Deeper rounds happen only under the points that could change the answer.
- The served answer and the story work as today. They also list what was raised but not debated.

The work runs in two phases:

- **Phase 1** adds only the map steps to the practice tool. It compares today's opening with three openings (A snowball
  from the first AI, B blind lists + fill gaps, C the angle map) on 12 questions. The owners' method picks the opening
  from that data.
- **Phase 2** builds the whole shape into the runner, behind an owners' switch.

Expected cost per debate (preview prices, rough):

| Plan | Depth 1 | Depth 2 |
|---|---|---|
| Free, 3 AIs | $0.15 → $0.17 | $0.24 → $0.21 |
| Premium, 5 AIs | $0.44 → $0.30 | $0.67 → $0.45 |
| Premium, 7 AIs | $0.98 → $0.30 | $1.39 → $0.45 |

## Owner rulings this spec rests on (2026-10-12, in chat)

| # | Ruling |
|---|---|
| S1 | Opening = C, the angle map: angle planner → blind angle lists in parallel → merge → 1–2 gap rounds → choose. A and B are kept only as Phase 1 comparison arms. |
| S2 | Positions are DISTINCT answers. The choose step names 2–4 different answers, each argued by a different AI and shown as "the case for …, argued by X". |
| S3 | Grading: 3 graders from other makers (2 on Free), never the author's maker, plus 2 more on close calls. |
| S4 | Order: Phase 1 (openings in the practice tool, test, pick with data) before Phase 2 (whole shape, then the whole-debate test). |
| S5 | Per-plan sizes (map AIs / answers / graders): Free 3/3/2 · Plus 4/3/3 · Pro 5/4/3 · Max 7/4/3, never more than the makers available. Owners only, never a page control. |
| S6 | Depth mode: Adaptive by default. Fixed is offered on Premium. Free is adaptive with ceiling 2. |
| S7 | Depth of scrutiny: small budgets, Premium only. Deep = up to 2 extra rounds on a point and 6 extra points per debate. Exhaustive = 3 rounds and 15 points. Free stays Standard. |
| S8 | "Max tokens" becomes Answer length: Short / Standard / Detailed = about 300 / 700 / 1,500 words, a target never a hard cut, for every plan. The story keeps its own shape. |
| S9 | The owners pre-approved spec, plan and build; notify only at the end or when something is off. `gh pr merge` still needs the owner's yes. |

## 1. Stage 1, the map (shared by Phase 1 and Phase 2)

### 1.1 Steps, inputs and outputs

All map steps are ordinary framed model calls (`buildFramedPrompt`: the owners' instruction text, the argument-language
directive and the code-owned safety frame; the material is one fenced JSON envelope). They are written in the question's
language. Every reply is parsed by a strict schema with the existing repair path (patch follow-up, then full re-ask).
Points are short: a claim of at most 240 characters plus a "why it matters" line of at most 240 characters.

| Step | Who | Sees | Returns |
|---|---|---|---|
| Angle planner | 1 AI (rotates) | the question | 4–7 angles `{angle_id, label, focus}`. It must include the three fixed kinds `OPPOSITE_CASE`, `ASKER_WORRY` and `PRACTICAL`, plus 1–4 angles specific to the question. |
| Angle list | each map AI, in parallel | the question + its own angle | 3–8 points `{claim, why_it_matters, leans: "for_some_answer" \| "against_some_answer" \| "context"}` + 1–3 `candidate_answers` (short answers to the question it thinks are live) |
| Merge | 1 AI (rotates; never the chooser's maker) | every item with an opaque item id; never who wrote it | groups: `{key_point_id, claim, member_item_ids[]}`; `{answer_id, answer, member_item_ids[]}` |
| Gap round | 1 AI per round (Free 1 round, Premium up to 2; a maker that did not merge, rotating; a maker that wrote no list is preferred when one exists) | the question + the merged key points and answers as plain labels, never counts or authors | `new_points[]` (same item shape) + `framing_challenges[]` (≤ 3 lines). A round that adds fewer than 2 new points ends the gap rounds. |
| Choose | 1 AI (a maker that did not merge) | the question + merged points and answers, each point tagged by code with how many different makers raised it blind and whether it came from a fixed angle | 2–4 `answers[]` `{answer_id, statement}`, each with ranked `for[]` and `against[]` key point ids ("could this change the answer?"), and `strongest_rival` per answer |

Rules the code enforces, never the AI:

- **Who raised what.** The code computes it from item ids. The merge AI never counts. Items written blind and items from
  gap rounds are kept apart, so "raised independently by N makers" counts only blind items.
- **Choose quotas.** Each chosen set must include:
  - at least one point raised by exactly one AI;
  - the strongest `OPPOSITE_CASE` point;
  - the `ASKER_WORRY` point, when the map has one.

  When the choose reply misses a quota, the code adds the missing point by rule, ranked by "raised by most different
  makers", and records `CHOOSE_QUOTA_FILLED`.
- **Distinct answers.** The choose AI must name at least 2 distinct answers. When it names one, the code adds the
  map's best-supported different candidate answer. When the map has none, it adds the negation framed by the
  `OPPOSITE_CASE` angle, and records `ANSWERS_FILLED`.
- **Everything not chosen is kept.** Each unchosen point is stored with its makers as "also raised, not debated".

### 1.2 Fallbacks ("always an answer")

| Failure | What happens |
|---|---|
| Angle planner fails after repairs | The fixed three angles + `GENERAL`. Record `MAP_ANGLES_FALLBACK`. |
| An angle list fails or its AI sits out | Its angle is given to the next map AI that has finished. Otherwise it is dropped. |
| Merge fails | The code merges: identical claims after normalisation group; everything else stays its own point. Record `MAP_MERGE_FALLBACK`. |
| Gap round fails | It is skipped. |
| Choose fails | Answers = the candidate answers raised by the most makers (2–P of them). Points = by rule, most-raised first, quotas applied. Record `MAP_CHOOSE_FALLBACK`. |
| Fewer than 2 map lists arrive, or the whole map fails | Today's opening (each AI writes its own position). Record `MAP_UNAVAILABLE_TODAYS_OPENING`. |

## 2. Phase 1: openings in the practice tool

A new practice mode `openings` in `tools/preview-practice`. It uses the same gates, relay, refusals, busy handling,
redaction and outside-the-repository report folder as `formats`.

- **Questions.** 12 fixed questions in code, as the practice tool requires: 6 Romanian, 6 English, covering public
  policy, ethics, health and practical matters, personal decisions and contested facts. Never read from the command
  line.
- **Arms per question, same AIs:**
  - **T, today's opening:** each AI writes a full position with today's `primary-root` / `independent-root` contract,
    blind.
  - **A, snowball from the start:** AI 1 lists points; each next AI sees a short list of the points so far and adds only
    new ones. The first AI rotates per question.
  - **B, blind lists:** every AI lists points with no angle, blind; then merge, one gap round and choose.
  - **C, the angle map:** as in §1.
- **Output.** Every reply goes to `openings.jsonl` the moment it finishes. Each record holds the arm, question, step,
  AI and maker, exactly what it could see (blind, or the ids of what it was shown), its order position, timing, tokens,
  cost, format check and the reply text. `report.json` and `report.md` hold counts, cost, time, slips and fallbacks per
  arm. The tool computes no quality score; scoring is the owners' private method.
- **Measurement run.** One run, all five preview AIs, within the owner's test budget ($5 DeepInfra + $1 Haiku; expected
  about $0.5–1). Before the run there is a `--dry` mode with scripted answers, which spends nothing.
- **Decision.** The owners' private method picks the opening. The owner is told only when the data contradicts S1.

## 3. Phase 2: the whole shape in the runner

### 3.1 The owners' switch and per-plan sizes: register row `debateShapePolicy`

A new OPTIONAL register row family, following the `callConcurrencyPolicy` and `answerRoleRotationPolicy` pattern: never
required and never edited; a new value is a new register version. When the row is absent, the runner uses today's shape
byte for byte, which is the rollback switch. The row parses strictly; an invalid row refuses runner boot.

```text
{ "kind": "DEBATE_SHAPE_POLICY", "version": 1,
  "plans": { "free": {...}, "plus": {...}, "pro": {...}, "max": {...}, "premium": {...} },  // premium = fallback for plus/pro/max
  each plan: { "mapAIs": 3, "answers": 3, "graders": 2, "pointsPerAnswer": 3, "deeperTopPoints": 1,
               "gapRoundsMax": 1, "closeCallExtraGraders": 2, "fixedDepthAllowed": false,
               "scrutiny": { "deep": null | {"roundsPerPoint":2,"pointsPerDebate":6},
                             "exhaustive": null | {"roundsPerPoint":3,"pointsPerDebate":15},
                             "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 } },
  "answerLength": { "short": {"words":300,"writerBound":8192}, "standard": {"words":700,"writerBound":12288},
                    "detailed": {"words":1500,"writerBound":16384} } }
```

The start values are S5–S8. Premium plans use pointsPerAnswer 4, deeperTopPoints 2, gapRoundsMax 2,
fixedDepthAllowed true, and Deep and Exhaustive as in S7. Sizes never exceed the makers present: `answers ≤ makers`, and
`graders ≤ makers − 1`. The close-call threshold is the existing `disagreementThreshold` (0.25). Publishers: the preview
v2 kit (`PREVIEW_SOURCE_ROW_KEYS_V2`) and the hosted file's optional member.

### 3.2 The three user controls

The ask contract gains three optional fields. They follow the path `depth` takes today: contract → `POST /v1/asks` →
plan normalisation → money estimate → `core.run.depth_params` → `readFrozenHead` → runner.

- `depthMode: "fixed" | "adaptive"`. The default is adaptive. Fixed is allowed only when the plan allows it; otherwise
  it is normalised to adaptive. Free is adaptive with depth 2.
- `scrutiny: "standard" | "deep" | "exhaustive"`. The default is standard. A plan without that budget normalises it to
  standard.
- `answerLength: "short" | "standard" | "detailed"`. The default is standard.

A missing field means the default, so old clients keep working. The four money places learn the fields: the estimate
SQL, the waiting-line SQL, the billing SQL and the strict receipt parser. The /new page:

- turns Depth mode (Fixed / Adaptive), Depth of scrutiny (Standard / Deep / Exhaustive) and Answer length (Short /
  Standard / Detailed, replacing Max tokens) into real controls;
- disables what the plan does not allow, as it does today;
- removes the "not sent" legacy notice;
- carries every new string in all 35 locales: parallel Haiku translators by language group, then one Opus spot-check
  of the risky locales.

### 3.3 Run flow (when the row is present and the run has at least 2 makers)

1. **Map** (§1), with this plan's `mapAIs`. A one-maker run has no map and keeps today's single-position path.
2. **Positions.** The chosen answers become roots 0..P−1, assigned round-robin to different makers. The first answer
   goes to the opener-rotation seat. New judge leg kind `assigned-root` ("Author the strongest case for the answer
   named in assigned_answer"). Its material is `question_line`, `assigned_answer` and `map_points`, the chosen points
   for and against this answer as plain labels. This is a closed-table change and gets a new sealed `judge` contract
   hash. A busy or sitting-out maker hands its answer to the next maker without one; with none left, to a maker that
   already argues one. Root 0 keeps today's rule (it must exist).
3. **Round 1 points.** Under each position go its top `pointsPerAnswer` chosen points, `against` first, then `for`; at
   least one of each when the map has both. Each point is a normal child node: `attack` for against, `support` for
   for. It is written by a maker different from the position's author, rotating. The material gains `consideration`,
   the chosen point's label (closed-table change, same hash bump). Each child is a normal node with panel, review and
   restatement, so nothing can vanish from the served answer (`readNodesForRun` INNER JOIN).
4. **Cross-replies.** One per position, to its `strongest_rival`: P cross nodes instead of P(P−1). Same leg kind as
   today.
5. **Deeper rounds** (depth ≥ 2), round by round across all positions:
   - **Adaptive:** after round k, propagation runs (the existing `evaluate`). The `deeperTopPoints` points per position
     with the highest root leverage each get one exchange: a reply against them and, when attacked, one defence. The
     existing δ stop and ε freeze apply at each boundary, which now comes after every round across all positions, so
     they can actually save work.
   - **Fixed:** every point of the previous round gets an exchange.
6. **Panels.** `graders` members from makers other than the author's, rotating. When a node's dispersion is at least
   0.25, up to `closeCallExtraGraders` more members join from makers not yet on that panel, and the node is reduced
   again. This is recorded as `PANEL-CLOSE-CALL-EXTENDED`. The reduction rule (highest weighted voice) and the
   same-family weight are unchanged.
7. **Scrutiny** (after the planned rounds, Premium only). Nodes are ranked by need:
   - dispersion of at least 0.25, or
   - a reviewer `dispute`, or
   - root leverage ≥ `scrutinyLeverageMin` with base strength < `scrutinyWeakBelow`. These are row fields with start
     values 0.05 and 0.5.

   They get further exchanges within `roundsPerPoint` per point and `pointsPerDebate` per debate, and are marked
   `SCRUTINY-EXTENDED`.
8. **Answer and story**, as today, plus:
   - **Answer length:** the synthesizer instruction gets the target sentence ("Write about N words"). Its call bound
     becomes max(sealed bound, `answerLength.<choice>.writerBound`).
   - **"Also raised" material:** the unchosen map points (claim and makers) go to the story material as a new
     `alsoRaised` list, bounded by the story budget. A new story-shapes paragraph tells the storyteller to mention them
     plainly.
   - **The debate page** shows an "Also raised, not debated" list (read model + adapter field), and titles each
     position "The case for …, argued by <AI>".
   - No internals appear in any of these texts.

Invariants kept (each has a test):

- maker roots stay the only servable nodes;
- root 0 is mandatory;
- every counting node has a panel, a cross-maker review and a restatement;
- the label is derived by code before synthesis;
- the graph is acyclic;
- marks come only from the kernel's list, with their records;
- the story covers ≤ 8 positions;
- a money stop still writes the answer.

New marks are added to the kernel's `CONDITION_MARKS` list (never at its tail), each with its typed record:
`MAP_*_FALLBACK`, `ANSWERS_FILLED`, `CHOOSE_QUOTA_FILLED`, `PANEL-CLOSE-CALL-EXTENDED`, `SCRUTINY-EXTENDED`.

### 3.4 Storage

The map is material, not graded claims (ruling DR-062: "a perspective is a folder, not a scored claim"). It goes into a
new migration with two tables:

- `core.map_item`: run, step, item id, AI ref, maker, blind flag, angle id, claim, why, leans, order.
- `core.map_choice`: run, answers with their assigned makers, the chosen point ids per answer, strongest rival, also-raised
  ids, and fallback marks.

Both tables are encrypted like other debate content wherever debate content is encrypted. Map calls leave normal ledger
MODEL_CALL and spend rows under new call-site keys: `MAP:angles`, `MAP:list:<i>`, `MAP:merge`, `MAP:gap:<k>`,
`MAP:choose`.

### 3.5 Scheduling

Every step plugs into Project 1's `CallScheduler` and ordered recorder:

- the map lists run in parallel;
- merge, gap and choose are sequential;
- positions run in parallel once choose has landed;
- round-1 points start as soon as their position is written;
- panels, reviews and cross-replies follow Project 1's readiness rules.

The saved order is the plan order, so the same answers always give the same debate. The serial path (no concurrency
row) still works.

### 3.6 Money

The start-of-debate estimate (`computeStructuralCeilingBasis`, `apps/api/src/preview-budget-estimate.ts`), the attempt
ceiling and the per-role call shares learn the new formula. With A = mapAIs, P = answers, J = graders, K = points per
answer, X = deeper top points, d = depth and G = gap rounds:

- map calls = A + 3 + G;
- nodes = P + P·K + P + (d−1)·P·X·2 (adaptive) or (d−1)·P·K·2 (fixed), plus the scrutiny budget;
- calls per node = 1 + J + 1, plus close-call extras (estimated at 2 per scrutiny-eligible node, capped);
- answer and story as today.

The estimate stays a ceiling and never under-counts. The four money places carry the three new fields.

## 4. Prompts

There are five new instructions: angle planner, list (with and without an angle), merge, gap and choose. There are also
two new judge leg directives (`assigned-root`, and the `consideration` sentence for points) and the synthesizer's length
sentence. Each instruction is owner-editable text. Each is wrapped by the unchanged code-owned safety frame, and its
fingerprint is sealed in the register, so a change is a new register version. The lists treat the question as
evidence, not orders, as every step does today.

## 5. Tests

- **Unit:**
  - each map schema, plus the repair path;
  - who-raised-what counting (blind vs gap);
  - choose quotas and answer filling;
  - every fallback;
  - plan sizes capped by makers present;
  - panel size, rotation and close-call extension;
  - adaptive round order and δ/ε at every round boundary;
  - scrutiny ranking and budgets;
  - the answer-length bound;
  - contract normalisation per plan;
  - estimate formulas for both shapes;
  - register row parsing (absent / valid / invalid).
- **Integration** (embedded Postgres, scripted answers):
  - a full new-shape debate gives a served answer, story and also-raised list;
  - a row-absent run is byte-identical to today;
  - each fallback ends with an answer;
  - a money stop mid-map ends with an answer;
  - finish-order independence under the scheduler.
- **Practice:**
  - `openings --dry` (scripted) and one real `openings` run (Phase 1);
  - a real practice debate with all AIs on the new shape before any preview upload (owner rule), plus the
    whole-debate comparison with today's shape (owners' private method).
- **Render tests** for the /new controls and the debate page's also-raised list.
- One heavy test run at a time on the owner's Mac (memory rule).

## 6. Out of scope

- Changing the panel's highest-voice rule. That is an open owner question elsewhere: under it, close-call extra
  graders can only raise a grade or widen the measured disagreement.
- Model choice per role (scorecard).
- Thinking levels (its own spec).
- User-chosen AIs.
- Deploying the register row or the gate on the server (listed for the owner).
