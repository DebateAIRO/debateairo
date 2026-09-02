# REQ-REV-01 — verdict on the translation requirements (round 1)

SKILLS LOADED: superpowers:using-superpowers, dialectical-engine:heartbeat-protocol, dialectical-engine:heartbeat-reviewer, superpowers:verification-before-completion

Seat REQ-REV-01, blind lens, Opus 5, session `a125c37e`. Round 1 of max 3. Reviewing REQ-01's
artifacts (ticket `t_7bf7a8a4`) and the packet that dispatched them. I read no other review, and no
other lens exists yet. Every number below is from a script or command **I** wrote and ran; where I
reproduced the author's number independently I say so, because a reproduced number is the strongest
thing a reviewer can hand back.

## Verdict: REWORK

Four blocking findings, twelve non-blocking. This is a strong artifact — 76 of 76 `path:line`
citations resolve and say what they are claimed to say, all 28 slices pass the freeze/format law
mechanically, all 17 language rows match ICU exactly, the extraction partition is a real partition,
and I reproduced the 79-declaration CSS count and the 10-source-reading-test count from my own rules
without knowing the author's. The four blockers are all one family: **the artifact establishes
extraction ownership rigorously and never establishes write-concurrency**, and one of them is a
verifier that silently reported 100% coverage when the truth is 96%.

Round 1. A REWORK here does not approach the round-4 wall.

---

## Packet review (P-findings against the orchestrator's packet — `REQ-01.md` and `COMMON.md`)

The author filed seven packet defects in its self-report §5. **All seven are real; none is invented.**
I verified each against the file it names:

| # | Author's claim | My verification |
|---|---|---|
| P1 | Cursor stated as 3 in the packet, 2 in the orchestrator's ticket comment | REAL — `packets/REQ-01.md:7` says "comment cursor at dispatch: 3"; comment 3 on `t_7bf7a8a4` says "your cursor at dispatch is 2". Three comments existed, so the packet is right and the comment is wrong — the defect is that an auditable number is stated twice, differently |
| P2 | Ticket body still says "Fable 5.1 subagent" | REAL — confirmed by the orchestrator's own superseding comment on `t_81e24a2c` and ledger row 2026-09-02 03:20 |
| P3 | Q1 names seven categories and no discriminator | REAL — `REQ-01.md:32` lists (a)–(g) and the exclusions and never says that a string's *position* decides whether shape heuristics may fire |
| P4 | Q4 uses "own" for extraction ownership and for write-concurrency | REAL — `REQ-01.md:35` carries both properties in one sentence. **This defect is the direct cause of B1 and B3 below** |
| P5 | Q7 gives no cluster-header count | REAL — `REQ-01.md:38` says "cluster table headers `<CODE>-C1…`" with no N |
| P6 | `superpowers:brainstorming` has an interactive gate a background subagent cannot execute | REAL — the skill's process is a partner dialogue with a hard approval gate before any artifact |
| P7 | §3 "scripts only READ the repo" vs Q7 "generate sixteen SPECs" | REAL — `REQ-01.md:20` vs `:38` |

**P-findings the author missed:**

- **P8 — `docs/missions/translation/00-intake-H0.md:18` cites `TopBar.tsx:57` for the top-bar
  suppression; the statement is at line 58.** Line 57 is the third line of a comment; line 58 is
  `if (pathname?.startsWith("/debate/") || …) return null;`. The author silently corrected this to
  `:58` in `translation.md:86` (R08) and `slices/I01/DECISIONS.md:15` and never flagged that an
  upstream constant was wrong. **Change that closes it:** `00-intake-H0.md:18` `:57` → `:58`.
- **P9 — `REQ-01.md:10-19`'s `allowed` list has no path for the census measurement script, and the
  mission then requires that script as a standing artifact.** `translation.md:221` (O2.2) says the
  scanner and this census must share **one definition file** "so the two cannot drift", and
  `translation.md:277` ranks that recommendation #2 with confidence high. The only place the packet
  permits the classifier to live is `…/scratchpad/req-01/`, which dies with the session. A mandatory
  deliverable outside `allowed` is a packet defect (`heartbeat-reviewer` §1), and this one guarantees
  that ARCH-01 or a coding seat re-derives the classifier, that it differs, and that the difference
  surfaces as a leak in wave 5. **Change that closes it:** add a repo path (e.g.
  `apps/ui/scripts/i18n/`) to the `allowed` list of whichever seat re-creates the classifier, and do
  it **before** ARCH-01 designs O2. The author reached the same conclusion independently
  (self-report §6.1) and could not act on it, because its packet forbade it.
- **P10 — `REQ-01.md:42-55`'s output skeleton jumps Q4 → Q6 → Q8** with no line saying that Q5, Q7
  and Q9 are delivered as separate files. The author routed them correctly anyway. **Change:** one
  line in §4 — "Q5, Q7 and Q9 are separate files and carry no heading here."

**My own packet (`REQ-REV-01.md`):** I read back every constant it quotes. Tree state `4f764037`,
ticket ids, the author's comment count (6, exact), my own comment count (3 at dispatch, exact), the
four `ModeToggle` line numbers (4/4 exact), the cookie-filter line range 36–130 (`filteredSessionCookies`
is at `route.ts:82`, the two cookie constants at `:36-37`, the call at `:75` — all inside the range),
and the baseline numbers (25/230 files, 36/1911 tests, present and itemised in the ledger). **8 of 8
correct. No defect found in my own packet.**

---

## Blocking findings

### B1 — Slice I11 is scheduled concurrently with seven slices whose files it is required to write. SINGLE WRITER is violated by construction.

**Where:** `docs/missions/translation/slices/I11/SPEC.md:17` (I11-R01), `:19` (I11-R03), `:21`
(I11-R05), `:64-72` (the owned-files table) · `docs/missions/translation/requirements/translation.md:196`
(the I11 row: "Parallel-safe with: I02–I10") and `:201` (wave order) ·
`docs/missions/translation/INSTRUCTIONS.md:23,26`.

**The scenario, as concrete inputs → wrong outcome.** `I11-R03` requires that "each of the 24
hand-made plural lines listed in `requirements/census.md` selects its form through `Intl.PluralRules`"
and that "the `=== 1 ? "" : "s"` idiom appears nowhere in `apps/ui` afterwards". `I11-R01` requires
the same for "each of the 16 formatting sites". I mapped every one of those 40 sites onto the slice
that `census.json` says owns its file. The result:

```
e = hand-made plural sites (24)
  owner I04: components/DebatesBuffer.tsx
  owner I06: components/ArgumentFocusView.tsx, components/DebateCanvas.tsx, components/DebateTree.tsx
  owner I07: components/NodeDetailDrawer.tsx
  owner I08: components/LegacyRunClaimControls.tsx, components/RecommendedInvestigations.tsx
  owner I09: lib/scoringFormat.ts, lib/scoringResponse.ts, lib/v3/adapter.ts, lib/v3/liveEvents.ts
  owner I11: lib/format.ts
g = date/number/relative-time format sites (16)
  owner I03: components/AccountErasureControls.tsx, components/SessionControls.tsx
  owner I04: components/DebatesBuffer.tsx
  owner I05: components/CanvasViewport.tsx
  owner I08: components/EvaluatorDevMenu.tsx
  owner I09: lib/v3/adapter.ts
  owner I10: app/public/debate/[id]/PublicDebatePageClient.tsx, components/PublicAnswerDisclosure.tsx,
             components/PublicHonestyDrawer.tsx
  owner I11: lib/format.ts
```

**I11 must write into 16 files owned by I03, I04, I05, I06, I07, I08, I09 and I10** — and the wave
schedule runs I11 in the same wave as I02–I09 and declares it parallel-safe with I10. Meanwhile
`I11/SPEC.md:66` states over its own owned-files table: *"Every file below is written by this slice
and by no concurrent slice"*, and lists two files.

Dispatch CODE-I09 and CODE-I11 into the same wave, each in its own worktree: I09's worker rewrites
`lib/scoringResponse.ts:125-161` to read from `locales/en/domain.json`; I11's worker rewrites the same
`pluralize` helper onto `Intl.PluralRules`. Either the merge conflicts across four files, or one
worktree's version wins silently and the other slice's extraction is lost. `I11-R03`'s whole-app
assertion then fails on text I09 re-introduced, and neither slice caused it alone. That is exactly the
mission law in `COMMON.md` §3: *"SINGLE WRITER — no two concurrent slices own the same file."*

The artifact documents the cross-write and the parallel schedule in the same breath:
`slices/I09/SPEC.md:28` says "slice I11 replaces the mechanism" while `translation.md:196` says I11 is
parallel-safe with I09.

**The change that closes it (pick one):**
1. **Sequence it.** `translation.md:196` — I11's "Depends on" becomes `I01–I10`; its "Parallel-safe
   with" becomes `none`. `translation.md:201` and `INSTRUCTIONS.md:23,26` — wave order becomes
   `I01 → I02–I09 → I10 → I11 → English frozen → L-* × 16`. Then re-issue `slices/I11/SPEC.md` as a
   superseding version whose owned-files table names all 18 files it writes. This is the cheaper fix
   and `I11-R03`'s whole-app assertion needs it anyway.
2. Or move the 40 sites into their owning slices' SPECs and reduce I11 to `globals.css` + `lib/format.ts`,
   deleting `I11-R01` and `I11-R03`'s cross-app scope.

The author named this exact class in its self-report §3.3 and §5.4 and swept only the I01/I05 member.
`heartbeat-protocol` §2.2: a reported finding is a sample of a class, and the remedy is chosen by the
shape. The shape here is "every slice whose SPEC requires an edit outside its owned-files table".

### B2 — Mission requirements R10 and R12 are traced by no slice, and the handoff reports 56/56 coverage as a measurement.

**Where:** `docs/missions/translation/requirements/translation.md:91` (R10), `:93` (R12), `:311` (the
handoff's coverage row) · `.hermes/reports/translation/agent-reports/REQ-01.md` §7 receipts row
"56/56 requirements covered, 0 undefined citations — `comm` of cited vs defined R-ids" · the same
claim in board comment 6 on `t_7bf7a8a4`.

**My re-count.** I parsed the *last cell* of every SPEC requirement row (the "Traces to" column) across
all 28 slices and compared the union against the 56 ids defined by `^- \*\*(R\d\d)\*\* —` in
`translation.md`:

```
MISSION R ids defined: 56
Cited-but-undefined mission ids: (none)
Defined-but-uncited mission ids: R10,R12
```

I then grepped every occurrence of `R10`/`R12` anywhere under `slices/`: **every hit is a slice-local
id** (`I01-R10`, `L-ar-R12`, `I06-R10` …), never a mission-level citation. Coverage is **54 of 56**.

**Root cause, and it is the interesting part.** A naive `R\d\d` extractor over the whole SPEC body
matches `R10` inside `I01-R10`. The author's own self-report §3.1 states the lesson — *"a classifier's
error rate is invisible in its output"* — and then its verifier hit exactly that failure and reported
100%. The `comm` receipt is honest about the method and wrong about the answer.

**Why it matters beyond bookkeeping.** R10 ("every subsequent route rendered in that browser is in the
chosen language") and R12 ("a choice survives a browser reload of that route and of any other route")
are the two requirements that encode V's own done-criterion 3 — *"the choice takes effect on every
route rather than being a dead control … and the choice survives reloads and navigation"*
(`00-intake-H0.md:19`). ARCH-01 fills PLAN steps from the SPEC trace rows; a requirement with no trace
row gets no step and no cluster. I01's browser acceptance steps 4 and 6 do exercise reload and
cross-route persistence, so V's own test would catch a regression — but nothing in the plan would.

**The change that closes it:** in `slices/I01/SPEC.md`, add R10 and R12 to the "Traces to" cell of
`I01-R08` (line 24) or add one requirement row covering them, and update `PLAN.md`'s trace table and
its "Trace count: 24 requirements, 24 scaffold rows" line. Then re-run the coverage check with an
extractor anchored to the trace column (`\|\s*`ID`\s*\|.*\|([^|]*)\|\s*$`), not a body-wide `R\d\d`,
and correct `translation.md:311` and the self-report receipt to the number it produces.

### B3 — Two frozen SPECs both claim `components/NodeDetailDrawer.tsx:637`.

**Where:** `docs/missions/translation/slices/I07/SPEC.md:28` (I07-R12) and
`docs/missions/translation/slices/I11/SPEC.md:19` (I11-R03).

I07-R12: *"The two hand-made plurals at `components/NodeDetailDrawer.tsx:637` and
`components/RecommendedInvestigations.tsx:87` — the latter owned by slice I08 — are not both claimed
here: only line 637 belongs to this slice."*
I11-R03: *"Each of the 24 hand-made plural lines listed in `requirements/census.md` selects its form
through `Intl.PluralRules` …"* — and `census.md`'s (e) table lists `NodeDetailDrawer.tsx:637` as row 10
of 24.

Both cannot hold. CODE-I07 and CODE-I11 are dispatched in the same wave, each reads its own frozen
SPEC, and both edit line 637. The author reported "Contradictions found: **1**" (`translation.md:314`,
the DebateAI/Dialectical Engine row). This is a second one, and unlike the first it is between two
requirements the mission will act on.

**The change that closes it:** rewrite `slices/I07/SPEC.md:28` to say that line 637 is *extracted* by
I07 and its *plural mechanism* is replaced by I11 after I07 merges — the same sentence
`slices/I09/SPEC.md:28` already uses for `pluralize` — and make the sequencing real via B1's fix.

### B4 — The census counts 15 machine-code internal invariant errors as translatable copy, and R23 then makes translating them mandatory; 8 test assertions depend on them.

**Where:** `docs/missions/translation/requirements/census.json` rows for `lib/api.ts:85,202,211,215,219,327,335,343,354,372,375,379,381`, `app/new/page.tsx:95`, `lib/v3/adapter.ts:639`
· `translation.md:116` (R23) · `translation.md:194` (I09 owns `lib/api.ts`), `:189` (I04 owns `app/new/page.tsx`).

I re-counted `lib/api.ts` by my own rule before reading `census.md`'s. My count: **2** plausibly
user-facing strings (`:112` "Every V3 read is asker-scoped; sign in first.", `:309` "Evaluator dev menu
request failed (…)"). The census says **15**. The 13-string gap is one class:

```
throw new Error("V3_HAS_NO_SETTINGS_WRITE: deployment configuration is register-governed, not UI-writable.")
throw new Error(`ASK_FIELD_REQUIRED: ${key} must be supplied explicitly; the UI invents no ask values.`)
```

These are `SCREAMING_SNAKE: sentence` programmer invariants, thrown for internal contract violations,
never rendered. `census.md:11`'s weak-position rule includes them because they are prose-shaped and it
has no negative rule for a machine-code prefix — while `census.md`'s exclusion table already carries
"SCREAMING_SNAKE enum value / status code: 81", so the class is recognised for bare tokens and not for
prefixed sentences. My sweep of the whole census for `^[A-Z][A-Z0-9_]{5,}:\s` found exactly **15** rows.

**Why it is blocking.** R23 has no escape hatch: *"Every string counted in `census.md` is read from a
catalog at render time and no longer appears as a literal in `apps/ui/app`, `apps/ui/components` or
`apps/ui/lib`, except the tokens named in R31."* A CODE-I09 worker obeying R23 must move these into
`locales/en/domain.json` and 16 seats must translate them. Then:

```
tests/unit/v2ui-data-layer.test.ts:98,675,676,677,678,690,808   rejects.toThrow(/PROXY_FETCH_…|V3_HAS_NO_…|ASK_FIELD_REQUIRED/)
tests/unit/s10-erasure-ui.test.ts:50                            rejects.toThrow(/PROXY_FETCH_REQUEST_INPUT_UNSUPPORTED/)
```

Eight assertions break, in two files that are **not** in R52's ten-file class (neither reads source
from disk). And `lib/api.ts:310` re-parses the shape — `` throw new Error(`${code}: ${message}`) `` —
so a localised `message` changes an identifier the code itself composes. `lib/api.ts` is also the file
that reads `__Host-debateai-csrf` at `:295`, which is the security-adjacent surface `COMMON.md` §3
fences.

**The change that closes it:** add one exclusion rule to `census.md` §Method — *"a string whose first
token matches `^[A-Z][A-Z0-9_]{5,}:` is a machine-code invariant, not copy"* — remove the 15 rows from
`census.json`, and correct the totals (1371 → 1356 before B-class N2 below). Then add a sentence to
R23 naming the exclusion, so a worker does not have to re-derive it.

---

## Non-blocking findings

Each demands a fix; the tier sets **when**, not whether. Each is a same-day ticket.

- **N1 — `census.md`'s "The 18 files with zero translatable strings" section names 11, and one of the
  11 is not a scanned file.** `requirements/census.md:157-159`. I computed the set mechanically
  (91 scanned minus the 73 with strings): the true 18 are the 10 listed plus
  `lib/authNavigationGuard.ts`, `lib/canvasViewport.ts`, `lib/debateHeaderOverflow.ts`,
  `lib/debateTreeUtils.ts`, `lib/observability/index.ts`, `lib/returnPath.ts`,
  `lib/scoring/scoringResponseSpecification.ts`, `lib/types.ts`. `app/globals.css` is listed and is not
  a `.ts`/`.tsx` file, so it is not one of the 91 (`census.md:9` and `:20` both say so). Consequence:
  8 zero-string files have no owner, and the SPECs' own rationale — *"Files with zero translatable
  strings are owned so that an import change has a single owner"* — has a hole where `lib/types.ts`
  and `lib/authNavigationGuard.ts` (imported by `TopBar.tsx`, I01) sit. **Change:** list all 18 and
  assign each to a slice.
- **N2 — Two CSS values counted as copy.** `census.json` rows `components/landing/LandingSample.tsx:51`
  ×2, texts `"left center"` and `"right center"` — the `transformOrigin` values of the card cascade,
  inside a `style={{…} as CSSProperties}` object. Not on screen. Same root as B4: the prose-shape
  heuristic fires on any string with a space. **Change:** exclude string values assigned inside an
  object literal cast to or typed as `CSSProperties`; remove the two rows.
- **N3 — Two of the "16 formatting sites" are not formatting sites.**
  `requirements/census.md:198` lists `components/DebatesBuffer.tsx:5`, which is
  `import { isComplete, relativeTime, statusLabel } from "@/lib/format";`, and `:212` lists
  `lib/format.ts:1`, which is the `relativeTime` signature. `slices/I11/SPEC.md:17` then orders a
  worker to make "each of the 16 formatting sites … pass the active language to `Intl`". Two more of
  the 16 (`CanvasViewport.tsx:119,573`) are explicitly excluded in the same section as not
  user-visible. Twelve are real. **Change:** split the table into "12 user-visible formatting sites"
  and "4 reference lines, not sites", and re-word I11-R01 against the 12.
- **N4 — Nine test files carry English owned by two or more slices of the same parallel wave, and
  C7's disposition tells each owner to re-point them concurrently.** I intersected the 1113 distinct
  census texts (length ≥ 14, no interpolation) against all 221 test files:
  `tests/unit/v2ui-pages.test.ts` ← I05, I06, I07, I08, I09, I10 · `tests/render/ui02e-debate-canvas.test.tsx`
  ← I06, I08, I09 · `tests/unit/pda-s02-affordance-drift.test.ts` ← I05, I07, I10 ·
  `tests/unit/v2ui-data-layer.test.ts` ← I06, I07, I09 · `apps/ui/lib/scoringResponse.test.mjs`
  ← I06, I07, I09 · `tests/render/load01-debate-page.test.tsx` ← I05, I11 ·
  `tests/render/t1-canvas.test.tsx` ← I08, I09 · `tests/render/t5-drawer.test.tsx` ← I07, I09 ·
  `tests/unit/s10-erasure-ui-render.test.tsx` ← I03, I08. The extraction partition covers the 73
  source files and says nothing about the test surface, which is where C7 lands. **Change:** add a
  test-ownership column to the Q4 table, or state in `translation.md:203` that the orchestrator
  serialises test re-pointing after the extraction wave.
- **N5 — `apps/ui/lib/scoringResponse.test.mjs` is coupled to 14 census strings and is covered by
  nothing.** It is a `node:test` file that imports `lib/scoringResponse.ts` and asserts its **return
  values**. It is not one of R52's ten (it reads no source from disk — I verified the ten
  independently and it is not among them), and O1's identity oracle covers component HTML rendered
  from fixtures, not module return values. When I09 makes those functions read a catalog, this test
  goes RED with no requirement owning it. **Change:** add a clause to R52 — *"and every test that
  asserts a copy module's return value is re-pointed in the slice that extracts that module;
  `apps/ui/lib/scoringResponse.test.mjs` is one"* — and extend O1.3's coverage to name copy-module
  return values.
- **N6 — R41 has no closing set and no owner.** `translation.md:146` says *"No number, date or plural
  is assembled by string concatenation anywhere in `apps/ui`"* — an absolute over the whole app —
  and is traced only by `I11-R03` and `I11-R05`, whose reach is `lib/format.ts` and
  `lib/v3/adapter.ts:363`. `components/landing/LandingSample.tsx:70` renders `BASE {card.base}%` (and
  `:72` `FINAL {card.final}%`), which is a number assembled by concatenation, is owned by I04, and is
  in none of the 16 or 24 closing sets. R38 and R39 each name a closing set; R41 does not. **Change:**
  give R41 a measured closing set the way R38 and R39 have one, or scope it to the sites I11 owns.
- **N7 — The key-identity policy is unstated, and 16 seats will each decide it alone.** `census.json`
  carries **1371 sites but only 1113 distinct texts**. `translation.md:33` predicts "near 1360" keys,
  which assumes one key per site; `slices/L-*/SPEC.md` say "≈1360 keys each"; R26 speaks of key sets
  without saying whether two sites rendering the same English share a key. A seat that de-duplicates
  and a seat that does not produce different key sets and R26 fails for reasons neither caused.
  **Change:** one sentence in `translation.md` §Q1 stating whether identical English at two sites is
  one key or two, and why.
- **N8 — `LANG-TEMPLATE/SPEC.md` cannot be checked for sense, which is the one thing its own line 5
  says it exists for.** Instantiated with the English row: `LANG-TEMPLATE-R01` (line 35) requires
  "Every cell of the `en` column of `requirements/glossary.md`" — `glossary.md:19`'s header is
  `Term (English) | What it means… | Where it appears | zh-CN | hi | … | ro`, **there is no `en`
  column**; `-R05` (line 39) reads "the set of `{placeholder}` names in the English value equals the
  set in the English value", a tautology; `-R11` (line 45) would fail every key; and `-R14` (line 48,
  "a diff of `apps/ui/locales/en/**` … is empty") contradicts `-R03` (line 37, the eleven `en`
  namespace files exist) and `-R13` (line 47, "writes only files under `apps/ui/locales/en/`"). The 16
  generated SPECs are correct — I checked `L-zh-CN`, `L-ja` and `L-pt-BR` by seeded draw and their
  R05/R11/R13/R14 all read correctly, their ICU facts match my own probe exactly, and the conditional
  no-space-wrapping row fires for `zh-CN` and `ja` and not `pt-BR`. **Change:** substitute a real
  target language (e.g. `es`) in the master, or add a line marking R01/R05/R11/R14 as degenerate under
  the English self-substitution.
- **N9 — `slices/I01/SPEC.md:84-98` calls its owned-files table exhaustive and omits two files
  `I01-R18` may require it to write.** `I01-R18` (line 34) contemplates "every new token is registered
  in the `TERRACOTTA`, `CHAMBER` or `MODE_INDEPENDENT` map of `tests/unit/t9-mode-tokens.test.ts`",
  which implies a write to `app/globals.css` and to that test file; `slices/I01/DECISIONS.md:18`
  records the decision explicitly. Neither file is in I01's owned list, and `app/globals.css` is owned
  by I11 (`slices/I11/SPEC.md:71`). I01 merges before I11 starts, so this is not a concurrency
  violation today — it is an exhaustive list that is not exhaustive, and B1's fix must not reorder
  I01 behind I11 without revisiting it. **Change:** add both files to I01's table with a "conditional,
  only if a token is added" note.
- **N10 — The self-report prices a number it states wrong, twice.**
  `.hermes/reports/translation/agent-reports/REQ-01.md` §2.2 and §6.3 say `.hermes/TOOLING-TRAPS.md`
  is **905 lines**. The seat's own HEARTBEAT (board comment 5) says it read "all 862 lines", and
  `git diff --numstat` shows the seat appended 87 lines against a file that is now 949 — so it read
  862. §6.3's upgrade proposal is priced on the wrong figure. **Change:** 905 → 862 in both places.
- **N11 — `requirements/glossary.md:49` uses a banned word as a noun in a definition sixteen seats
  must translate.** *"**replay** | Re-running a recorded generation from its stored handle."* My
  word-boundary scan of every mission artifact returned exactly two hits: this one and
  `INSTRUCTIONS.md:82`, which is the law statement itself. `COMMON.md` §4 scopes the ban to "any
  acceptance criterion or requirement", so this is outside the letter of the ban — but "handle" as a
  noun is the single most ambiguous word in a file whose purpose is one-word-per-term precision.
  **Change:** "from its stored identifier".
- **N12 — R13 does not say whether the locale cookie is `HttpOnly`, and two other requirements force
  the answer.** `translation.md:97` fixes name, `Path`, `Secure`, `SameSite` and `Max-Age` and is
  silent on `HttpOnly`; `translation.md:90` (R09) requires the choice to take effect with no document
  load and `translation.md:101` (R17) forbids every other carrier, which together force a
  browser-side write and therefore a non-`HttpOnly` cookie. Leaving it unstated makes a security
  attribute an implicit consequence in a mission whose `COMMON.md` §3 zone rule turns security
  attributes into a fence. **Change:** add "and no `HttpOnly` attribute, because the menu writes it
  from the browser" to R13, so the omission is a decision on the record rather than an inference.

---

## What I verified and how

Every command below was run by me from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`;
scripts live in `…/scratchpad/req-rev-01/` and only read the repo.

**P9 — languages, `node -e` over `Intl.PluralRules` / `Intl.Locale` / `Intl.NumberFormat`, Node v22.23.1:**
all 17 rows of `translation.md:41-57` match ICU exactly — cardinal categories, ordinal categories,
maximized script, direction and default numbering system, as **sets**. Verbatim, first and last rows:
`en | Latn | ltr | card=[one, other] | ord=[few, one, two, other] | nu=latn` …
`ro | Latn | ltr | card=[few, one, other] | ord=[one, other] | nu=latn`. Arabic returns all six cardinal
categories and `nu=latn` (so `translation.md:62`'s claim that Arabic-Indic digits are **not** automatic
is correct); Bengali returns `nu=beng` and `Intl.NumberFormat("bn").format(123)` is `১২৩`;
`Intl.NumberFormat("hi").format(1234567.89)` is `12,34,567.89`. **17/17. No finding.**

**P10 — `find apps/ui/app -name page.tsx`:** 10 routes, exactly the 10 R01 lists. O5.1's
filesystem enumeration is sound. `apps/ui/app/__visual` (one empty subdirectory) and
`apps/ui/app/visual-debate-preview` hold no files, as the UNVERIFIED note says.

**P5 — citation audit, run over ALL citations rather than the 12 the packet asks for.** I extracted
every `path:line` from `translation.md`, `census.md`, `INSTRUCTIONS.md` and all 28 SPEC/PLAN/DECISIONS
files, resolved each against the repo and printed the real source line: **76 distinct citations, 0
unresolved, 0 out of range, 0 saying something other than what is claimed.** Spot confirmations:
`TopBar.tsx:30` → `<span className="brandName">Dialectical Engine</span>`; `LandingChrome.tsx:30` →
`DebateAI`; `TopBar.tsx:58` → the `return null`; the four `ModeToggle` sites at `TopBar.tsx:64`,
`TopBar.tsx:90`, `LandingChrome.tsx:38`, `DebatePageClient.tsx:1139`, and `grep -rn '<ModeToggle'`
returns exactly those four and no fifth; all eight `toLocale*`-with-no-locale sites;
`lib/scoringResponse.ts:125` → `function pluralize(…)`. **This is the strongest part of the artifact.**

**P3 — trace equality, my own parser.** SPEC requirement rows vs PLAN scaffold rows, per slice, plus
each PLAN's own "Trace count: N requirements, N scaffold rows" line: **equal in all 28, and the stated
count matches the parsed count in all 28** (I01 24/24 … LANG-TEMPLATE 15/15). Zero duplicate ids, zero
requirements with an empty "Traces to" cell, zero cited-but-undefined mission ids. The one failure is
B2.

**P6 — census, re-measured against my own rule, stated before I read the author's.** My rule: a string
is translatable if a reader of the rendered page sees it as words — JSX text and child expressions,
user-reaching attributes, prose in copy/message positions; excluding class names, routes, keys, enum
and comparison operands, glyphs, brand marks, model ids, `data-*`. Seeded draw of 6 files
(`sha256("REQ-REV-01:P6:2026-09-02")` = `e1555160f3…`, 4-byte big-endian draws without replacement over
the 73 census files sorted lexicographically):

| File | Census | Mine | Verdict |
|---|---|---|---|
| `components/ScoringErrorBoundary.tsx` | 1 | 1 | exact |
| `components/landing/LandingHero.tsx` | 9 | 9 | exact |
| `lib/v3/tokenUnlock.ts` | 9 | 9 | exact |
| `components/TopBar.tsx` | 12 | 12 | exact |
| `components/landing/LandingSample.tsx` | 15 | 13 | 2 CSS values → N2 |
| `lib/api.ts` | 15 | 2 | 13 machine-code invariants → B4 |

Partition check, mechanical: `census.json` holds **1371 rows across 73 distinct files, 0 files carrying
two slice labels**; the I01–I11 SPEC owned-files tables hold **84 entries, 0 owned by two slices, 0
census file absent from every owned list, 0 census file whose SPEC owner differs from `census.json`, 0
literal owned path missing from disk**. Per-slice sums reproduce the published table exactly
(22+117+90+143+190+163+206+147+229+49+15 = 1371) and the category sums do too (645+450+106+167+3 = 1371).
**The extraction partition is real.** Its silence about write-concurrency is B1.

**P2 — banned words.** A case-insensitive scan of every artifact returns 69 hits; with word boundaries
and the law statement's own text and its `WRONG:` examples removed, **two** remain: `INSTRUCTIONS.md:82`
(the law statement wrapping onto a second line — legal) and `glossary.md:49` (N11). A dedicated scan of
the 28 SPECs' requirement and acceptance rows returns **zero**. The author's claim is correct.

**P8 — freeze and format law, all 28 slices, mechanically:** FROZEN header present · PLAN marked
SCAFFOLD ONLY · **0 pre-filled step or cluster cells in any PLAN trace table** · 4 cluster headers each,
every verification command stubbed with the ARCH-01 placeholder · PROGRESS carries all four headings
and all four are `_(empty)_` · DECISIONS marked append-only and seeded with 6–10 dated rows. **28/28,
no exception.** `INSTRUCTIONS.md` is 90 lines by `wc -l` (cap 100), and I checked it is pointers: no
requirement text, no census detail, no acceptance step.

**Independent re-derivation of the author's measured constants.** I wrote my own rule for physical CSS
direction declarations (property carries `-left`/`-right`, or bare `left:`/`right:`/`float:`, plus
`text-align` with a `left|right` value, excluding logical properties) before reading `census.md`'s
table: **79**, and my per-property histogram matches the author's table row for row
(`left:` 16 · `margin-left` 14 · `border-left` 9 · `text-align:left` 8 · `right:` 7 · `padding-left` 7 ·
`text-align:right` 6 · `padding-right` 5 · `border-left-width` 4 · `border-left-color` 2 ·
`border-bottom-left-radius` 1). `globals.css` is 6266 lines. The "8 logical properties already in
place" is also correct (7 × `padding-inline:` + 1 × `padding-block:`) — my first, narrower probe
returned 0 and I was wrong, not the author. `filteredSessionCookies` exists at
`app/api/[...path]/route.ts:82` and the two admitted names are at `:36-37`. No
`not-found.tsx`/`error.tsx`/`global-error.tsx` anywhere under `apps/ui/app`. Next free ADR is 0019.
`apps/ui/lib/observability/{logger,suspiciousScoring}.ts` exist. **The receipt "10 test files read
`apps/ui` source from disk" reproduces exactly** under my own grep — 10 files, named.

**P10 (oracles).** O1.3's coverage arithmetic (73 minus the 18 with none) is consistent; O1.4's "18
render test files GREEN at `4f764037`" is consistent with the intake's 20 minus the two base-RED ones;
O5.1 matches my route enumeration; O5.3's "four and four today" matches my `<ModeToggle` grep; R53's
"4 UI-relevant + 21 non-UI = 25" matches the ledger's named failure list, and the ledger does carry the
UI-relevant four with their firing assertions. O1.5 and O5.5 both require the oracle be shown able to
fail, and O6 states the three-run law once for all — that is the right shape. No oracle leans on a
base-RED file.

**P13 (contested rows).** T-1…T-8 each carry question, options, pick, confidence and strongest counter;
each is written without codebase knowledge; none re-asks V-1…V-8 (T-4 refines V-6's carrier rather than
re-opening it, T-5 refines V-7's negotiation, T-6 refines V-2's Arabic entry). The rows are copied
verbatim into `V-DECISIONS-PACKET.md:144-153` and the two places where the orchestrator's default
differs from REQ-01's pick (T-1, T-8) are stated in `V-DECISIONS-PACKET.md:142`. **No finding.**

**P11 (author's SKILLS LOADED).** The line is present and opens both the board handoff and
`translation.md:302`: `superpowers:using-superpowers, dialectical-engine:heartbeat-protocol,
dialectical-engine:heartbeat-requirements, superpowers:brainstorming,
superpowers:verification-before-completion`. The requirements floor (`heartbeat-protocol` §1) is
`superpowers:brainstorming` — present. The load order matches `COMMON.md` §1 and the CLAIM/HEARTBEAT
narrative. On substance-compliance: brainstorming exists to surface design questions and settle them
with the partner before building, and routing eight open choices to T-1…T-8 with options, pick,
confidence and strongest counter — none decided silently, none asked of V mid-run — is that output
delivered through the harness's asynchronous partner channel. **I judge the floor met in substance, and
the honest declaration that the letter could not be met is exactly what `heartbeat-protocol` §2.7
requires.** The conflict is a defect in the protocol, not in the seat (P6 above).

**P12 (self-report bar).** `.hermes/reports/translation/agent-reports/REQ-01.md`, 236 lines, filed
before the handoff. It names causes rather than symptoms (§1: "the symptom looks like a quota problem;
the cause is that a long-running requirements seat has no checkpoint"; §2.1: three of four classifier
defects share one cause). It prices findings (45 min and ~120k tokens of duplicated reading; ~35 min,
four runs, ~40k tokens; ~13k tokens; ~8 min). It names four near-misses, six dead ends, and seven
packet ambiguities with exact section numbers. It states what it did not do. **Not anodyne — it clears
the bar with room.** Its only defects are N10 and the B2 receipt.

**Write bounds.** `git status --porcelain` shows the seat modified exactly one tracked file,
`.hermes/TOOLING-TRAPS.md`, and `git diff --numstat` shows **+87 / −0** — append-only respected. The
untracked additions are `.hermes/planning/translation/`, `.hermes/reports/translation/` and
`docs/missions/translation/`, all inside the allowed list. `apps/ui/next-env.d.ts` is clean. **No
out-of-contract write.**

## What I did NOT verify

- **I ran no test, no build and no dev server.** The full suite exceeds the 600 s tool cap and this is
  a documents review; I took the 25/230 and 36/1911 baseline from the ledger rather than reproducing
  it. Every statement above about a test is about its *source text*, never about its outcome.
- **R30's 25 KB gzipped bound is UNVERIFIED by me too.** No build was run. The author marks it
  UNVERIFIED and hands it to ARCH-01; I agree and add nothing.
- **The speaker/internet-user ranking behind V-2 — UNVERIFIED.** No network from this seat either. I
  confirm only that nothing in R01–R56 depends on the ordering.
- **Whether a user-visible sentence is assembled at run time from non-prose parts — UNVERIFIED.** I did
  not attempt to refute the author's negative; an AST cannot see it and neither can a grep.
- **Register judgements per language (the Q2 rightmost column) are not mechanically checkable and I
  did not check them.** I verified they exist, carry a reason, and are carried through to each L-slice's
  `-R10`; whether `tú` beats `usted` for this product is a judgement V or a native speaker settles.
- **The design fit of R44–R46.** I did not read `docs/missions/ui-overhaul/design/`; the author's
  UNVERIFIED note says the design document specifies no menu, and I took that on its word.
- **I sampled 6 of 73 files for the census re-count, not all 73.** Two of six disagreed, both from one
  rule gap, and I swept that gap across all 1371 rows mechanically — but a *different* rule gap in the
  67 files I did not read by hand would not have been found.
- **I did not verify the 6800 exclusions individually**, only their reason histogram and the two
  classes my sample exposed.

## Predictions

Blind, before any other lens exists. **First, I expect ARCH-01 to hit B1 as a wall rather than as a
finding** — it will start writing I11's PLAN steps, discover that step 1 is "edit `lib/scoringResponse.ts`",
check the owned-files table, find two files, and either stop or quietly widen the slice; the quiet
widening is the expensive branch and it is what I would check first in ARCH-01's output: does I11's
PLAN name a file outside I11's SPEC table? **Second, I expect the first coding seat (CODE-I01) to trip
on `app/globals.css` and `tests/unit/t9-mode-tokens.test.ts`** — it will need one token for the menu's
open-list surface, both files are outside its exhaustive owned list, and `t9-mode-tokens` is base-RED,
so its "did I break it" signal is already noisy (N9). **Third, I predict another lens reads the
`comm`-based 56/56 receipt and repeats it rather than re-running it** — it is stated three times (board
comment, `translation.md:311`, self-report §7) with a named method, which is precisely the shape that
gets nodded at; probe-not-read is the whole defence and B2 is what it buys. **Fourth, I expect a lens
to flag the DebateAI/Dialectical Engine contradiction as its headline finding**; it is real, it is
already row T-1, both marks are untranslatable under R31 either way, and it changes no requirement — it
is the least expensive thing on the page and the easiest to mistake for the most important. **Fifth, I
expect nobody else to check the 40 formatting-and-plural sites against the ownership map**, because
doing it needs `census.json` joined to the SPEC tables rather than either read alone; if another lens
did find B1, I expect it found it from `I09/SPEC.md:28`'s "slice I11 replaces the mechanism" sentence
rather than from the data. **Sixth, I expect no other lens to have re-derived the 79 CSS declarations
from its own rule**; I did, it matched to the property, and that is the single most reassuring number
in the artifact.

## comments read through: 6
