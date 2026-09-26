# The verdict story — design

Owner's request (2026-09-25/26): the person asking a question spends many tokens while the engine
explores it. The ending should be worth that: instead of two short paragraphs, the user gets a
**story** that says what they are really trying to decide, which paths the debate explored and
followed up, and why each one holds up or doesn't, in two sizes: a **short version on the site**
and a **deeper version downloadable as a PDF**, with every point and its scores in an appendix.

Base: `origin/dev` at `bf4e3dde`. Branch: `feature/2026-09-26-verdict-story`.

## 0. In plain words (for the owner)

- **The label stays arithmetic.** Supported / Contested / Unsupported is still computed from the
  scores exactly as today. Nothing in this feature can change it (owner ruling: option C).
- **A new "storyteller" AI writes the story after the verdict is saved.** It reads far more than
  today's answer writer: the question, every point with its scores, the judges' best case and
  strongest objection for each point, the reviewers' reasons, which model argued what, where the
  judges disagreed, and which points the verdict hinges on.
- **One writing pass produces both versions** (short and long), so they can never contradict each
  other. A second AI (the checker) checks the story: no invented facts, fair to the losing side,
  agrees with the label, every sentence traced to debate points.
- **Reviewer's note (option C).** When the storyteller thinks the numbers missed something, it may
  add a clearly separate note. The label never changes.
- **Story shapes are files.** One file per kind of question (general, health, money decision,
  legal, factual, personal choice). The storyteller picks the shape that fits. The owners (or,
  later, the evaluator) change the files; every story records which version of the files wrote it.
- **The safety part stays locked in code**: the box around the debate material, the "evidence,
  not orders" rule, and the answer shape. Everything else in the files is the owners'.
- **A failed story never costs the verdict.** The story runs after the debate is finished, on its
  own small budget. If it fails, the site shows today's two paragraphs.
- **Every debate gets a story** (owner ruling: A). The site shows the short version first, on
  phones too; a button downloads the full PDF.

## 1. Rulings this design carries

| Ruling | Source |
|---|---|
| The arithmetic label is final; an AI explains it and may add a labelled reviewer's note (option C) | owner, 2026-09-26 |
| The story is written automatically for every debate (A) | owner, 2026-09-26 |
| Short + long content outline (§4) accepted as the first version | owner, 2026-09-26 |
| Prompts = code-owned safety frame + owner-editable instruction text; the frame stays locked for every AI step | owner ruling V-11 addendum, 2026-09-22; reconfirmed 2026-09-26 |
| No editing tool: prompts are files the engine reads, prepared ahead of time, later upgraded by the evaluator | owner, 2026-09-26; evaluator session 2026-09-25 |
| Shapes differ by kind of question (medical, business decision, …) | owner, 2026-09-26 |
| Sealed register values are superseded by a new version, never edited | standing law |
| Works in both modes: hosted (paid keys) and local (own models / subscriptions) | owner ruling V-9c |

## 2. What exists today (measured at `bf4e3dde`)

- **Label:** `deriveVerdictLabel` (`packages/serve/src/index.ts:1320-1380`), first rung that
  matches: margin or disagreement absent → CONTESTED + `LABEL-BASIS-INCOMPLETE`; winner < 0.35 →
  UNSUPPORTED; margin ≤ 0.05 or disagreement ≥ 0.25 → CONTESTED; winner ≥ 0.70 → SUPPORTED;
  otherwise CONTESTED (thresholds: `packages/register/src/algorithm-policy.ts:266-273`).
- **Prose:** the synthesizer (`packages/serve/src/synthesis.ts:287`) writes at most two segments
  (`ENGINE_COMPOSITION_SEGMENT_CAP = 2`) from a digest of one-line node summaries, final
  strengths and polarity. It is **not given the question**, the judges' steelman/critic, review
  reasons, lineage, dispersion or sensitivity. An evaluator checks it, up to 3 rounds.
- **Site:** on the owner page the label appears only in the Honesty drawer; the prose sits in a
  280px sidebar hidden at ≤920px (`apps/ui/app/globals.css:4512-4515, 7994-7998`). The public
  page is verdict-first. The only export is JSON. No PDF library is installed.
- **Where the material lives at the end of a run** (`apps/runner/src/index.ts` `execute()`):
  question `run.questionLine`; `servedRootSelection`, `verdictLabel` (`:4046-4088`);
  `authoredNodeList` (`:3967`, with `reversalPoint` = critic summary, `panelDispersion`, `maker`);
  `materialised.nodes[].baseStrength`, `materialised.arrows`; `propagation.strengths`,
  `propagation.sensitivityRecords`; `branchFrozenRecords`; `finalSegments`. **Database only:** the
  full judge output (steelman, evidence, fallacy) in `ledger.raw_artifact` (encrypted), review
  outcome + reasons in `ledger.node_review` (reasons encrypted), `ledger.reduced_judgement`
  dispersion/disagreement.
- **Run end:** `persist` (`:4977`) → ledger `SERVE` row → `#work.settle` (`:5021`) → return
  `COMPLETED` (`:5026`), all inside the run's content lease. After settle the work item is `DONE`
  and nothing can re-claim it.
- **Budgets:** one shared per-run attempt ceiling (`budget.assertModelAttemptAllowed`) and one
  per-run money envelope (hosted, provisional $0.25/run, $2/day). The runner's gateway wrapper
  (`apps/runner/src/index.ts:6181-6300`) enforces both on every call.

## 3. Architecture

**A new package `packages/story` (`@debateai/story`)** holds everything that is not wiring: the
shape-pack loader, the material builder, the two prompt contracts, the output validator, the
write-and-check loop, and the story repository. Keeping it out of `packages/serve/src/index.ts`
matters: that file's full text is hashed into the sealed `serveContractHash` register row, so any
edit there forces a new register version.

**Where it runs:** inside the runner, straight after `#work.settle` returns `true`
(`apps/runner/src/index.ts:5026`), still inside the run's content lease, so the in-memory
material is available and the encrypted rows can be read. It runs only when the run served a
verdict (terminal `SERVED` or `DOWNGRADED`, `verdict_state` not null). It **never throws**: every
error is caught, recorded as a `FAILED` story row with a code, and logged. A thrown error there
would otherwise reach the Hatchet handler's failure path and be recorded under the wrong name.

Rejected alternatives:
- **A second work-item kind** (a queued "write story" job): nothing in `claimNext`/`claimById`
  filters on `battery_row_id`, so a second kind would be executed as a debate. Too invasive for
  this feature.
- **Replacing the synthesizer inside the serve chain:** it runs last inside the $0.25 envelope; a
  long story there that hit the cap would end the run `COMPONENTS_ONLY` and cost the verdict. It
  would also edit the sealed serve file.

Known limits, accepted for v1:
- If the runner process dies mid-story, the story for that debate is lost (the API reports it
  unavailable after the waiting window, §7). A recovery sweep on the evaluator-worker pattern is a
  follow-up (§12).
- The runner's worker slot stays busy while the story is written, so the next queued debate on
  that worker starts a few minutes later (at worst the §7 window).

### 3.1 Flow

1. The runner hands the story module a `StoryRunSnapshot`: question, verdict basis (label, rung,
   trigger, winner and runner-up strength, margin, thresholds, band, marks), served statement,
   nodes, arrows, base and final strengths, sensitivity records, frozen branches, lineage, the
   answer id and version, and the plan tier.
2. The module reads the rest from the database inside the same lease: the judge steelman and
   critic summaries from each node's judge raw artifact (parsed leniently; a parse failure omits
   that node's judge text), review outcome + reasons, panel dispersion.
3. It checks readiness: pack loaded and valid, story register rows present, role providers
   reachable, and (hosted) the story money envelope present. Anything missing → a `FAILED` row
   with a precise code (`STORY_PACK_INVALID`, `STORY_NOT_CONFIGURED`, `STORY_ROLE_UNAVAILABLE`,
   `STORY_ENVELOPE_MISSING`) so the site stops waiting at once.
4. It builds the material envelope (§5.2), shrinking it to the tier's byte budget.
5. Write-and-check loop (§6), at most `storyLoopMaxRounds` rounds.
6. It stores one encrypted row in `serve.answer_story` (§7): `READY`,
   `READY_WITH_RESERVATION` or `FAILED`.

## 4. What the story contains (accepted outline)

**Short version (site):** the label and confidence (rendered by the site from the arithmetic, not
written by the AI); a headline; one paragraph of what was asked and the answer; one line per
position explored with its fate; what would change the answer; the reviewer's note if any; a
"Download full report (PDF)" button.

**Long version (PDF):** the default section list is below. A shape file may rename, reorder or add
sections (§5.1):
1. What you are really trying to decide (marked as the AI's reading of the question).
2. The verdict in one paragraph.
3. The paths explored: one chapter per position covering its claim, its strongest support, its
   strongest objections, how it scored, and plainly whether it is workable and why. This includes
   set-aside and stopped paths and why they stopped.
4. What the verdict hinges on (the highest-leverage points).
5. What is still uncertain (judge disagreement; reasoning-only versus looked up or run).
6. What would change the answer, and what to do next.
7. Reviewer's note, only when there is one.
8. Appendix of every point with its scores (built by code, not written by the AI, §9).

## 5. Prompts

### 5.1 The shape pack (owner-editable files)

A directory, default `dialectical-engine/story-shapes/`, resolved relative to the repository at
run time. `DEBATEAI_STORY_SHAPES_DIR` overrides it, and a path that does not resolve fails loudly
(no machine paths baked in). It is loaded once at runner start, not per debate. Deploying a new
pack = replacing the files and restarting the runner.

| File | Holds |
|---|---|
| `pack.json` | `pack_id`, `version` (owner-chosen label), `default_shape`, the list of shape ids |
| `common.md` | instructions shared by every shape: tone, audience, language rule ("write in the language of the question"), how to write the short version, when a reviewer's note is warranted |
| `checker.md` | the checker's instructions |
| `shapes/<id>.md` | one shape: front matter `id`, `title`, `when_to_use` (one line), `sections` (ordered titles), then free guidance text |

The first pack ships six shapes: `general` (default), `health`, `money-decision`, `legal`,
`factual`, `personal-choice`.

**Validation at load (fail closed, never breaks debates):** the ids match `^[a-z][a-z0-9-]{1,31}$`
and are unique; the default shape exists; each shape has 3 to 12 sections; each file is at most
12 KB and the assembled storyteller instruction at most 48 KB; the files are UTF-8 with no control
characters. An invalid pack disables the story (every debate gets a `FAILED`/`STORY_PACK_INVALID`
row) and the runner logs exactly which rule failed.

**Fingerprint:** sha256 over a canonical serialisation of every pack file (sorted paths plus
bytes). Every story row records `pack_version` and `pack_fingerprint`, and every model call
records the full `contractHash` of the instruction actually sent. That makes it possible to tell,
for any story, exactly which file versions wrote it.

The pack files are **not** pinned in the register. Pinning them would make every file edit a new
register version, against the owner's ruling. The sealed-version-with-rules-gate workflow for
owner and evaluator edits belongs to the prompt/evaluator project (§12); this design leaves room
for it by fingerprinting every pack.

### 5.2 The two contracts (code-owned parts)

Both use `buildFramedPrompt` (`packages/providers/src/prompt-frame.ts`), called from
`packages/story`, never from `apps/runner/src/index.ts`, whose count of framed-prompt builders is
guarded by `tests/unit/prompt-surface-guard.test.ts`.

| Contract id | Instruction (owner, from the pack) | Answer form (code) |
|---|---|---|
| `story.storyteller.v1` | `common.md` + a menu of every shape (id, title, when-to-use, sections, guidance) | the story JSON (§5.3) |
| `story.checker.v1` | `checker.md` | the checker JSON (§6) |

**Material fields** inside the fence (all model-written or user-written content is evidence):

| Field | Content |
|---|---|
| `question` | the user's question |
| `verdict` | label, rung and trigger in words, winner and runner-up strength, margin, the thresholds, confidence band, condition marks |
| `served_statement` | today's served segments, so the story agrees with them |
| `positions` | each opening position: node id, claim, author model, final strength, whether it won |
| `points` | each node: id, what it supports or attacks, claim, way of knowing, base and final score, excluded/set-aside flag and reason, judge best case, judge strongest objection, review outcome + reasons, author model, panel dispersion, leverage |
| `hinges` | node ids ordered by leverage (top 5) |
| `set_aside` | frozen or stopped branches and why |
| `prior_objection` | round 2 onward only: the checker's objection, verbatim |

**Size budget** (register row `storyMaterialBudget`, provisional, keyed like the answer writer's
`compositionBundleBudget` by the run's `compositionBudgetTier`): low 40,000 bytes, medium 80,000,
high 120,000, always below the 256 KiB packet cap. **The model never sees the long internal ids.** Every point gets a short reference (`p1`…`pn`)
in the material, and code maps the references back to node ids before storing the story. A
measured depth-5, three-model debate (195 points) was about 216 KB with full ids even at the last
shrinking step, so without short references deep debates could not fit any budget.

The shrinking order when over budget:
1. Judge texts (best case, objection, review reasons) of points outside the top-10 leverage are
   cut to 240 characters.
2. All judge texts are cut to 240 characters.
3. Claims follow the digest ladder: 480, 240, 120 characters.
4. Points outside the top-20 leverage lose their judge texts and review reasons (claim, scores
   and relations stay).
5. Only the positions, their direct children, and the top-20 leverage points (with the chain from
   each up to its position) keep their own entry. The rest become a per-position count
   (`omitted: {position_ref, supports, attacks}`). The story may then speak only of what it can
   see; the PDF appendix still lists every point, because code builds it from the answer.

If it still does not fit, the story is `FAILED`/`STORY_MATERIAL_TOO_LARGE`.

### 5.3 The story answer form

| Field | Rule |
|---|---|
| `shape_id` | one of the menu ids |
| `short.headline` | ≤ 160 characters |
| `short.summary` | ≤ 900 characters, one paragraph |
| `short.paths[]` | one entry per position (at most 8; beyond that the 8 strongest and the site says "and N more"): `position_ref`, `fate` ∈ `HELD_UP` / `PARTLY_HELD` / `FELL` / `SET_ASIDE`, `line` ≤ 240 characters, `node_refs[]` |
| `short.change` | ≤ 400 characters: what would change the answer, plus `node_refs[]` |
| `long.sections[]` | 3–12 entries: `title` ≤ 80 characters, `paragraphs[]` 1–12, each `{text ≤ 2,000 characters, node_refs[]}` |
| `reviewer_note` | `null`, or `{text ≤ 1,200 characters, node_refs[]}` |

All text is **plain text**. The site and PDF never render Markdown, HTML or links from model
output.

**Deterministic checks before the checker sees it** (code, not AI):
- The JSON matches the form.
- Every `node_refs` id exists in the material.
- Each `position_ref` is a position.
- Every position is covered (subject to the 8-cap).
- The chosen shape exists.

They run as the call's content classifier. A failure is sent back as a code + path repair inside
the same call's attempts, the same way the synthesizer's schema repairs work today. If the attempts
run out, the round fails.

## 6. The write-and-check loop

Each round: the storyteller writes → the deterministic checks run → the checker judges. The
checker returns `satisfied`, an `objection` (text or null), and criteria booleans:
`faithful_to_material`, `agrees_with_label`, `fair_to_losing_paths`, `no_overstatement`,
`citations_correct`, `reviewer_note_separate` (the note never restates a different verdict as the
answer), and `goal_marked_as_reading`.

- Satisfied → `READY`.
- Not satisfied and rounds remain → next round with `prior_objection`.
- Rounds exhausted, last candidate passes the deterministic checks → `READY_WITH_RESERVATION`,
  storing the objection. The site and PDF show it as "Our checker still had a reservation: …".
- Otherwise → `FAILED`/`STORY_CHECK_FAILED`.

`storyLoopMaxRounds` is provisional at 2.

**Models:** the new role rows `storytellerRoleRef` and `storyCheckerRoleRef` default to the
synthesizer's and the evaluator's providers (different maker families, as today). They are
separate rows so the evaluator project can later pick the best model per role.

## 7. Storage and the waiting window

Migration `0072_answer_story.sql` (the next free slot) adds:
- **`serve.answer_story`**, insert-once and append-only. It follows the `0057`/`0063`/`0069`
  templates: truncate guard, `reject_mutation`, `GRANT SELECT, INSERT … TO debateai_runtime`, and
  its own content-attestation, ciphertext and erasure-barrier triggers under new function names.
  - Plain columns: `story_id`, `run_id`, `answer_id`, `answer_version` (unique together with
    `answer_id`), `outcome`, `failure_code`, `shape_id`, `pack_version`, `pack_fingerprint`,
    storyteller and checker lineage, `rounds`, artifact refs, `created_at`.
  - Encrypted (`content_ciphertext` + `content_attestation`, carrier `serve.answer_story` added to
    `CONTENT_CARRIERS` and `packages/db/src/schema.ts`): the story JSON, the reservation text and
    the verdict basis.
  - An insert into an erased run (`PRIVATE_CONTENT_ERASED`) is treated as benign.
- **`'STORY'` added to the `ledger.model_spend.spend_source` check**, following the `0021`/`0025`
  alter pattern.

**Status the API reports** for an answer: a stored row → its outcome. No row, verdict present,
answer younger than **40 minutes** → `WRITING`. Otherwise → `UNAVAILABLE`. The same happens when
the answer has no verdict (a blocked or components-only terminal gets no story). The 40 minutes
cover the worst case of the provisional call bounds (§8): 2 rounds × (2 × 300 s + 2 × 180 s) =
32 minutes, plus margin. A unit test asserts that the window stays at least that worst case. A
typical story should take a few minutes.

## 8. Budgets (the story can never cost the verdict)

- **Its own gateway wrapper**, `createStoryProviderGateway`, next to the run wrapper. It keeps
  the content lease and the raw-artifact, ledger and usage recording, but:
  - Its attempt allowance is its own: `storyLoopMaxRounds × 2 call sites × attempts` from the
    call-bound rows, counted over `STORY:` call sites only. The run's
    `assertModelAttemptAllowed` is not used.
  - Hosted mode uses its own money envelope, register row `storyCostEnvelopePolicy`: provisional
    **$0.05 per story** (owner, 2026-09-26: "we will adjust based on real costs"). Its spend
    rows carry `spend_source = 'STORY'`.
  - **What $0.05 means in practice.** Before each call, the envelope checks the worst case
    (request bytes ÷ 2 as input tokens, plus the full output token ceiling) against what is left.
    At an illustrative price of $3 per million input tokens and $15 per million output tokens,
    low-tier material (40,000 bytes) plus a 12,000-token ceiling projects to about $0.24, so the
    call is refused before it is made. At $0.50 / $2 per million it projects to about $0.034 and
    fits. So on the website, the story needs a lower-priced storyteller model, a smaller budget,
    or a higher cap. A refusal is stored as `FAILED`/`STORY_ENVELOPE_EXHAUSTED`, and the site falls
    back to today's paragraphs. The first measured hosted runs set the real numbers. Local mode
    has no money envelope, so this does not affect it.
  - Story spend **counts toward the $2 daily ceiling** but not toward the debate's per-run
    envelope.
- **The run's counters exclude the story.** `countRunModelAttempts` and `readRunSpentMicros`
  skip `STORY:` call sites and `STORY` spend. The structural ceiling formula
  (`packages/register/src/index.ts:307-401`) is **not** changed, so no pinned run basis moves.
- **Call-site keys:** `STORY:STORYTELLER:{round}` and `STORY:CHECKER:{round}`. The run gateway
  refuses the `STORY:` prefix, and the story gateway accepts only that prefix, so no debate call
  can hide in the story allowance.
- **Call bounds** (register rows, provisional):

  | Role | Token ceiling | Attempts | Deadline |
  |---|---|---|---|
  | Storyteller | 12,000 | 2 | 300 s |
  | Checker | 2,048 | 2 | 180 s |

- **Local mode:** no money envelope (as today); the attempt allowance still applies.

## 9. Register rows

A new optional family in `packages/register` (for example `story-policy.ts`), with strict
schemas. It covers `storytellerRoleRef`, `storyCheckerRoleRef`, `storyLoopMaxRounds`,
`storytellerCallBound`, `storyCheckerCallBound`, `storyMaterialBudget` and
`storyCostEnvelopePolicy` (hosted).

- **Optional, not mandatory:** no `register.required_row` entry, and the rows are read only when
  the story runs. Their absence means `FAILED`/`STORY_NOT_CONFIGURED`, never a refused debate.
  So the frozen `register-development-v4.json` fixture, acceptance register v3 and every existing
  publication stay valid. The last acceptance rung (v4) is **not** spent: the story stays off in
  acceptance until the owner chooses otherwise.
- **The dev register builders add the rows**, and re-seeding publishes a new dev version (the
  allocator owns the numbering). Hosted gets them in its next publication, when the owner
  decides. No sealed version is edited.

## 10. API, site and PDF

**API:**
- `GET /v1/answers/{id}/story`, owner-only. Policy row `{auth:"user", resource:"run-owner",
  action:"read-story"}`, closed 404 `STORY_NOT_FOUND` for "not yours" and "malformed".
- Mounted next to ledger-digest, outside the guarded registration zone.
- Implemented through an **optional** `ApiOptions.stories` (404 when absent), so the ~20 existing
  `AskApplication` fixtures are untouched.
- Contract `AnswerStorySchema` + route inventory + typed client `readAnswerStory` + the s7
  authorization matrix; `pnpm run generate:contract`.
- Response fields:
  - `status`, and `unavailable_reason` when unavailable
  - `shape`, pack version and fingerprint
  - lineages, `written_at`, `reservation`
  - `verdict_basis`, which feeds the PDF's arithmetic page
  - `story`

**Public page:**
- `PublicDebateSchema` gains an optional `story_short`, copied at publish time when the story is
  `READY` or `READY_WITH_RESERVATION`; old snapshots still parse.
- `PublicDebateOverview` shows it in place of the summary paragraphs, falling back to them.
- Publishing before the story is ready shows today's paragraphs until the owner re-publishes.

**Owner page:**
- **Placement:** a new `StoryPanel` (`apps/ui/components/StoryPanel.tsx`) mounted right after the
  AI disclosure (`DebatePageClient.tsx:1256`) and before scoring insights. It is a collapsible,
  bounded-height strip (`flex: 0 0 auto`), not a `section.card`, which the view clips.
- **Always visible:** it shows on phones.
- **Contents:**
  - label and confidence in plain words (the D77 per-state sentences, `VerdictBanner.tsx:37-43`)
  - headline, summary, path lines with fate, what would change it
  - reviewer's note and reservation
  - "Download full report (PDF)"
- **States:**
  - `WRITING`: "Writing the full story of this debate…", polled with backoff from 5 s to 30 s,
    stopping at the window.
  - `READY` and `READY_WITH_RESERVATION`: the story as above.
  - `UNAVAILABLE`: the panel shows today's composed text instead.
- The existing sidebar is unchanged.

**PDF:**
- A Next route handler, `apps/ui/app/debate/[id]/report/route.ts` (Node runtime), fetches the
  answer and the story with the user's session. It uses the `serverApi.ts` pattern: cookie,
  forwarded user-agent (the session is bound to it) and client IP.
- It renders with **`@react-pdf/renderer`** (MIT, pure JS, a new dependency; §13) and streams
  `application/pdf` as an attachment. Nothing is stored on the server.
- Fonts: the site's own OFL families (Fraunces, Plus Jakarta Sans) vendored as TTF under
  `apps/ui/assets/fonts/` with their `OFL.txt`. The standard PDF fonts cannot print ș and ț.
- **PDF layout:**
  1. Cover: the question, the label and confidence in plain words, the date, the models that took
     part, the AI disclosure and "In short".
  2. The long story. Citations appear as `[P7]` and link to the appendix entry.
  3. The reviewer's note and the checker's reservation, each boxed, when present.
  4. **How this verdict was computed:** built by code from `verdict_basis`. It shows the rule
     table with this debate's actual numbers, e.g. "winner 0.62, runner-up 0.58, margin 0.04 ≤
     0.05 → Contested".
  5. **Appendix:** every point in tree order, numbered P1…Pn. Each entry shows stance, claim,
     base → final score, way of knowing, review outcome + reasons, author model, and set-aside
     flag. This is the same data the site's tree shows.
  6. **About this report:** pack version and fingerprint, models, rounds, answer id and version,
     generation time.
- **Language:** the story is in the question's language. Fixed headings are English for now (the
  site is English-only).

**Look first, then wire:** before the panel and the PDF are wired to live data, a static mock of
both is built from a fixture story and shown to the owner, and the look is approved. This is the
same "mock, then code" gate the program uses for UI work.

## 11. Testing

The integration suites are **not** in the CI gate. They are run explicitly before merge, together
with the gate.

**Unit tests:**
- The pack loader: every validation rule, the fingerprint's stability, the env override, and a
  loud failure on a missing directory.
- The material builder: the fields, the shrink ladder, too-large → FAILED.
- The deterministic output checks.
- The loop outcomes: READY, reservation, FAILED, and the repair round.
- The wrapper never throws: a thrown provider error still yields a FAILED row.
- The status window logic.

**Prompt guards:**
- New pin blocks in `tests/unit/prompt-text-pins.test.ts` for the two code-owned answer forms.
- The contracts added to the "no retired sentence" list.
- New rows and counts in `tests/unit/prompt-injection-corpus.test.ts`, since the story material
  is model-written.
- The framed-prompt count in `apps/runner/src/index.ts` is unchanged.

**Integration tests** (embedded Postgres, a fake `/chat/completions` server, following
`tests/integration/t17-envelope-ledger.test.ts`):
- A debate completes and a READY story is stored, encrypted.
- The storyteller fails → the answer is intact and a FAILED row exists.
- The story envelope is exhausted → the answer is intact.
- The run attempt ceiling is fully used → the story still runs on its own allowance.
- The owner API returns the story and a foreigner gets 404.
- The publish path copies `story_short`.

**Architecture:**
- The carrier contract test covers `serve.answer_story`.
- The migration follows the append-only rules.
- The dependency floors and cooldown pass with the new package.

**UI:**
- Node or render tests for StoryPanel's four states and the public fallback.
- The existing source-test pins still hold.

**PDF:**
- A fixture story renders.
- The extracted text contains every section title, `[P1]`, and a Romanian sample ("ș ț ă î â")
  intact.
- The appendix lists every node.

## 12. Out of scope (follow-ups)

- A prompt editing tool; the sealed-version / rules-gate / activation workflow for pack edits;
  evaluator grading and tuning of the storyteller and checker roles; fetching the latest pack from
  dezbatere.ro (the evaluator/prompt project).
- A recovery sweep that re-writes stories lost to a runner crash.
- A PDF for public viewers (public pages get the short story only).
- Clickable citations on the site; the long story rendered on the site; a "write the story again"
  button.
- Translating the PDF's fixed headings.

## 13. Decisions confirmed at spec review (owner, 2026-09-26)

1. **New third-party dependency `@react-pdf/renderer`** (MIT) in `apps/ui`: **agreed.** It must
   still pass the 7-day release cooldown, `strictDepBuilds` and a clean `pnpm audit`.
2. **Hosted story cap:** **$0.05 per story**, provisional, adjusted from real costs (see §8 for
   what it implies); counted in the $2 daily cap.
3. **Public pages get the short story only in v1; the PDF is owner-only:** **agreed.**
