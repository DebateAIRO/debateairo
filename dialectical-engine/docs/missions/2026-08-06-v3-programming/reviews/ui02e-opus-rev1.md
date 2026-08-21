# UI-02e — Opus 5 lens, rev1 (DR-153 dual diamond)

Ticket `t_c75654bd` · lane DR-153 · mutating lens · run: independent of the Grok
lens (`ui02e-grok-rev1.md` was present on disk and was **not** read before this
verdict was formed).

**Verdict: nothing blocking. Four advisories (A-1 … A-4), all non-blocking.**

## Method (DR-163)

APFS clone (`cp -c -R`) of the parent git root
`/Users/vladmihaimiron/Documents/DebateAIRO` — `.git`, parent `.gitignore`, and
`node_modules` carried over — taken 2026-08-13 ~15:05:50. Every mutation was
applied inside the clone only; each was preceded and followed by a restore from
a pristine copy with md5 verification (`a94d8ea1…` DebateCanvas,
`e70af0d7…` ModelPresentation, `ec760aad…` adapter). Final clone md5s match
pristine. The only write to the real tree is this file.

Baseline in the clone reproduces: `tests/render/ui02e-debate-canvas.test.tsx`
3 passed, 282 ms.

## 1–3. Mutation ledger — every named mutation is genuinely killed

All mutations serial, one at a time, restored between runs. Focused file:
`tests/render/ui02e-debate-canvas.test.tsx`.

| # | Mutation | Result | Which test died |
|---|---|---|---|
| M1 | drop `maker={node.maker}` at `DebateCanvas.tsx:344` (empty-state) | **RED** 1 failed / 2 passed | maker test |
| M2 | drop `maker={node.maker}` at `:376` (contentful) | **RED** 2 failed / 1 passed | maker test **and** typed-absence test |
| M3 | delete the `V3ScoreBadges` JSX render site (`:386–388`) | **RED** 2 failed / 1 passed | score test and typed-absence test |
| M4 | `ModelMetaLine` absence branch → `return null` (maker pill silenced) | **RED** 1 failed / 2 passed | typed-absence test |
| M4b | `ModelBadge` absence branch → `return null` (reviewer pill silenced) | **RED** 1 failed / 2 passed | typed-absence test |
| M5 | `V3ScoreBadges` ABSENT branch → `return null` (score pill silenced) | **RED** 1 failed / 2 passed | typed-absence test |

**The rev1-of-UI-02a defect class is not present.** The score assertion is on
`renderToStaticMarkup` output — `BASE 62%`, `FINAL 41%`, `data-v3-score="base_score"`,
`data-v3-score="final_strength"`. M3 deletes the *JSX render site* while leaving the
`V3ScoreBadges` function declaration fully intact, and the suite goes red. Two
further probes confirm the mapping (not merely the presence of two strings) is
pinned:

- swapping `base_score`/`final_strength` at their adapter source
  (`apps/v2-ui/lib/v3/adapter.ts:287–288`) → **RED**
- `data-v3-score={badge.id}` → `data-v3-score="base_score"` (constant) → **RED**

Assertion scoping in the typed-absence test is real, not vacuous: the rendered
document carries **5** `>House unavailable</span>` occurrences; the
`renderedCard("node:typed-absence")` slice carries exactly the **2** the test
asserts. Had the slice been doc-wide the assertion would have failed.

## 4. TESTS-ONLY — confirmed by three independent lines of evidence

1. **mtime scan** of `apps/ packages/ web/ tests/ tools/ acceptance/` for the
   claim window (14:56 claim → 15:03 handoff): the only non-generated file
   written is `tests/render/ui02e-debate-canvas.test.tsx` (14:59:51). Everything
   else in-window is `apps/v2-ui/.next-dev/**` dev-server output and
   `apps/v2-ui/tsconfig.tsbuildinfo`. `apps/v2-ui/app/new/page.tsx` (14:42:56)
   and `tests/render/ux01-new-debate-form.test.tsx` (14:39:35) both predate the
   claim and belong to the UX lane.
2. **md5**: the real tree's `DebateCanvas.tsx`, `ModelPresentation.tsx`, and
   `lib/v3/adapter.ts` are byte-identical to my clone's pristine copies.
3. **Compiled-artifact diff** (strongest): the Next dev server's hot-update
   artifacts embed the compiled `components/DebateCanvas.tsx` module. The newest
   pre-ticket compile carrying it is `page.ccabc83da706bae2.hot-update.js`
   (2026-08-13 **00:21:13** — before the ticket was even created at 14:05); the
   current one is `page.a016ac713570e7ff.hot-update.js` (15:07:03). Their
   `DebateCanvas.tsx` module bodies are **byte-identical** (the only diff is the
   trailing module-map delimiter, an artifact of my slice boundary). The product
   file is provably back to its pre-ticket compilation.

The handoff's claim — "mutated only transiently and serially … then restored" —
is accurate.

## 5. Collection

`npx vitest list` enumerates all three UI-02e tests under
`tests/render/ui02e-debate-canvas.test.tsx`. The root `vitest.config.ts`
`include` is `["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, so the file is in
the enforced root suite, not a side config. Render layer now enumerates four
files: `load01`, `ui02d`, `ui02e`, `ux01`.

## 6. Canary and baseline

- Full enforced root suite in the clone: **75 files / 525 passed + 1 skipped**, 29.7 s.
- `tests/render` + `tests/unit/v2ui-pages.test.ts` (carries the UX-02 and UI-02d
  source pins): **5 files / 74 passed + 1 skipped**.
- Same suite with `ui02e-debate-canvas.test.tsx` removed: **74 files /
  522 passed + 1 skipped** — so the ticket adds exactly one file and three
  tests, and every pre-existing pin (UX-02, UI-02d, LOAD-01, UX-01) stays green.

Note for the record: the pre-ticket baseline quoted to this lens
("75 files / 525+1") is in fact the **post**-ticket count. True pre-ticket is
**74 files / 522 passed + 1 skipped**. Not a ticket defect; correcting the
number so the `+3` is visible.

---

## ADVISORY

### A-1 — the `:344` empty-state maker is pinned by cardinality, not by source

The maker test asserts document-wide counts (`2 × "OpenAI · GPT · gpt-5"`,
`2 × data-maker="OpenAI"`). That kills the *drop* (M1), which is the UI-02d
defect. It does not kill a *wrong-source* rewrite at the empty-state site:

- `:344` `maker={node.maker}` → `maker="OpenAI"` (hardcoded) → **GREEN 3/3**
- `:344` `maker={node.maker}` → `maker={generation?.maker}` → **GREEN 3/3**

The contentful twin is source-pinned — the same `generation?.maker` rewrite at
`:376` is **RED**, because the typed-absence card makes `node.maker` (`null`)
and `generation?.maker` (`undefined`) diverge there. The empty-state card has no
such divergence: the fixture sets `maker: "OpenAI"` *and*
`active_generation.maker: "OpenAI"`, and both makers on the canvas are `"OpenAI"`.

Fix when the lane next touches this file: give the empty card a maker distinct
from its generation's (e.g. node `"Anthropic"`, generation `"OpenAI"`) and assert
the empty card's own `data-maker` inside `renderedCard(html, "node:empty")`
rather than a document-wide count.

### A-2 — the empty-state typed-absence guard at `:342` is unpinned

```
{generation || node.maker !== undefined ? (        // :342, empty-state
```
Dropping the `|| node.maker !== undefined` disjunct → `{generation ? (` is
**GREEN 3/3**. The identical guard at `:375` (contentful) **is** pinned — the
same disjunct weakened to `node.maker !== null` is RED.

Cause: the fixture's empty card always carries an `active_generation`, so the
empty-state branch never exercises the generation-absent path. A card that is
empty *and* has no generation but does carry a recorded maker would silently
lose its identity line, and the suite would stay green. This is the same
under-coverage shape UI-02d found at `:344`, one level in — worth naming now so
it does not become UI-02f.

Fix: add an empty-state card with `active_generation: null` (one with a recorded
maker, one with `maker: null`) and assert its identity line / absence pill.

### A-3 — one handoff ledger row misreports its RED

`handoffs/UI-02e-codex-handoff.md`, row 2 ("Remove `maker={node.maker}` from the
contentful-card call site") records *"1 failed / 2 passed"*. The reproducible
result is **2 failed / 1 passed** — the typed-absence test also dies, because
`:376` renders the absence card's author pill too. The mutation is still killed;
only the observed-output column is wrong. Rows 1, 3, 4 and 5 reproduce exactly
as written. Worth correcting so the ledger stays a trustworthy artifact.

### A-4 — process: mutations were run in the shared tree against the live gate

The `.next-dev` hot-update trail shows `DebateCanvas.tsx` compiling in *mutated*
states at 14:59:06, 14:59:17 and 14:59:27 (one maker prop missing; three
`V3ScoreBadges` references instead of four), and again at 15:07:00–15:07:02 by a
concurrent actor. The dev server serving the DR-145 visual gate at `:3000` was
live throughout. The end state is restored and byte-identical, so nothing is
broken — but for a mission whose gate is defined as "what V sees at `:3000`",
mutating the served component in place is a hazard: a gate screenshot taken
during those windows would have shown mutated UI. Recommend the mutation
protocol move to a clone/worktree (DR-163) for every seat, not only reviewers.

---

## Conclusion

The ticket delivers what it promised. `DebateCanvas` — the surface V reads at the
DR-145 gate — now has a real rendered pin under the enforced root suite; the
UI-02d hole at `:344` is closed; the score badges are pinned as rendered
percentage text with the badge-to-id mapping load-bearing; all three typed-absence
pills (author maker, reviewer maker, score) die when collapsed to silence; the
change is provably tests-only. **Nothing blocking.** A-1 and A-2 name residual
precision gaps of the same family the ticket was created to close and should be
folded into whatever next touches this file; A-3 is an evidence correction; A-4
is a protocol recommendation for the lane.

*Opus 5 lens, 2026-08-13.*
