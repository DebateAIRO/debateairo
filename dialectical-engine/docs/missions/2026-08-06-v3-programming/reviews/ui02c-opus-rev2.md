# UI-02c — Opus 5 lens, rev2 (confirmation of my own rev1 B1)

**Board:** `debateai-v3` · **Ticket:** `t_0829cf81` · **Diamond:** dual (DR-153)
**Lens:** Opus 5 · **Date:** 2026-08-12
**Method:** verification by execution under DR-163 — isolated APFS clone of the
**parent** git root `DebateAIRO` (`.git` + parent `.gitignore` included), byte-identity
verified before any mutation, every RED/GREEN below produced by running the mutation,
every restore md5-verified against the real tree.
**Writes to the real repository: this file only.**

## VERDICT: `APPROVED` — the diamond completes; UI-02c closes.

My rev1 B1 is closed by execution, not by assertion. The exact mutation that kept
461/461 green at rev1 now fails the full root suite. Every element I prescribed
(pure seam, single source, both render sites, same-model/different-maker assertions,
typed-absence assertion, fixture pair) is present **and independently mutation-killed** —
I ran ten mutations and every one went RED at the assertion it should. A-1 is folded and
its three parts are each mutation-killed too. Nothing this ticket owns regressed.

Four advisories carry forward, one of them substantive (**A-4**, the prop hop) with full
executed evidence. A-4 is a real hole, it is **not** created by this rework, and it is
routable as a bounded follow-up — reasoning in its own section below.

---

## 0. Isolation and clone fidelity

```text
HEAD            real 56b256c…   clone 56b256c…            match
git status      real 271 entries  clone 271 entries       byte-identical (diff empty)
8 key files     md5-identical at clone time and at teardown
```

The first `cp -Rc` (DebateAI-V3 + `.git` + `.gitignore` only) reported 1,347 spurious
`D` entries — the parent repo's other top-level trees are tracked and were absent. Copying
them brought `git status` to exact parity. Recording it because the next lens will hit it:
**`git ls-files` is repo-wide, so a partial parent clone misreports deletions to every
git-backed guard.**

**Clone baseline, before any mutation:**

```text
$ pnpm vitest run --reporter=dot --silent
Test Files  67 passed (67)      Tests  475 passed (475)      Duration 30.55s
```

Matching the handoff's claim exactly (475, up from HYG-01's 471 by the four rev2 tests).

---

## 1. B1 — CLOSED. My rev1 mutation now goes RED, under the full suite.

### 1a. The exact rev1 mutation

Rev1 deleted the house composition from both render sites, leaving every prop, import,
attribute and the `"House unavailable"` literal intact — and the entire suite stayed green
while a two-maker debate rendered mono-model. Re-run verbatim against rev2:

```text
mutation: ModelPresentation.tsx:32 → {maker === null ? "House unavailable" : model?.name ?? modelId}
          ModelPresentation.tsx:51 → {maker === null ? "House unavailable" : modelId}

$ pnpm vitest run --reporter=dot --silent
Test Files  1 failed | 66 passed (67)
Tests       1 failed | 474 passed (475)

FAIL tests/unit/v2ui-pages.test.ts > UI-02c B1 — both shared model renderers consume
     the tested house label > routes ModelMetaLine and ModelBadge through makerIdentityLabel
AssertionError: Target cannot be null or undefined.
  ❯ tests/unit/v2ui-pages.test.ts:534:52
```

Rev1: **461/461 green** under this mutation. Rev2: **red under the full root gate.** That
is the whole finding, closed.

### 1b. Which assertion kills which site

Each render site was deleted alone, so the kill is attributable per-surface:

| mutation | surfaces affected | killed by | observed |
|---|---|---|---|
| `ModelMetaLine` `:32` `{label.text}` → `{modelId}` | canvas, thread, outline, split, map, drawer (6) | `v2ui-pages.test.ts:534` | `expected [ '{label.text}' ] to have a length of 2 but got 1` |
| `ModelBadge` `:51` `{label.text}` → `{modelId}` | tree (1) | `v2ui-pages.test.ts:534` | `expected [ '{label.text}' ] to have a length of 2 but got 1` |
| both, per rev1's shape | all 7 | `v2ui-pages.test.ts:534` | `Target cannot be null or undefined.` |

The single assertion at `:534` (`presentation.match(/\{label\.text\}/g)` must have length 2)
covers both sites: one deletion drops the count to 1, both deletions make `match` return
`null`. Deletion of one site is therefore *not* masked by the other.

### 1c. The behavioral half is killed independently of the source ratchet

The source ratchet pins *that* the seam is consumed; these pin *what it computes*. Both
halves are needed and both are live:

```text
mutation: makerIdentity.ts:21  `${maker} · ${modelName}` → `${modelName}`   (house dropped at the seam)
FAIL tests/unit/v2ui-data-layer.test.ts:190
     "keeps two houses visible when they report the same model id (UI-02c B1)"
     AssertionError: expected 'test-layer/model' to contain 'OpenAI'

mutation: makerIdentity.ts:17  {text:"House unavailable",absence:true} → {text:"",absence:false}
FAIL tests/unit/v2ui-data-layer.test.ts:197
     "labels a missing recorded house as typed absence"
     AssertionError: expected { text: '', absence: false } to deeply equal
                     { text: 'House unavailable', …(1) }
```

So the render sites cannot silently stop consuming the seam, **and** the seam cannot
silently stop putting the house in the string. Both directions of the rev1 hole are shut.

---

## 2. Single source, and the fixture pair is load-bearing

**No third composition path exists.** Every one of the seven surfaces reaches the reader
through `ModelMetaLine` or `ModelBadge`, and both now compute their text from
`makerIdentityLabel`. Full census of `maker` in `apps/v2-ui/{components,app,lib}`: seven
`<ModelMetaLine … maker={…}>` / `<ModelBadge … maker={…}>` call sites (canvas ×2, thread,
outline, split ×2, map, drawer ×2, tree), the two seam calls, the two `data-maker`
attributes, the colour-identity line `DebateTree.tsx:116` (colour, not text), and the
adapter/type declarations. **No component composes maker text itself.** The seam is the
only text path.

**The fixture pair is real and is what the test rests on.** `buildSameModelDifferentMakerAnswer()`
(`tests/support/v2uiFixtures.ts:137-150`) gives two nodes with the identical `model_id`
`"test-layer/model"` and makers `OpenAI` / `Anthropic`. Both of its load-bearing properties
are mutation-killed:

```text
mutation: fixture makers collapsed to a single "OpenAI"
FAIL v2ui-data-layer.test.ts:191  expected 'OpenAI · test-layer/model' to contain 'Anthropic'

mutation: fixture model_ids split to "…-a" / "…-b"  (the "same model" premise broken)
FAIL v2ui-data-layer.test.ts:184  expected Set{ 'test-layer/model-a', …(1) }
                                  to deeply equal Set{ 'test-layer/model' }
```

The ticket's named defect is now a fixture, not a memory — and neither half of it can be
weakened without a red.

---

## 3. A-1 — folded, and each of its three parts is mutation-killed

The absent-house state now reads as the sibling scoring work does:

| | scoring absence | maker absence (rev2) |
|---|---|---|
| visual marking | `.scoreBadge.unavailable` → `--line-strong` border, `--surface-sunken` bg, `--muted` text | `[data-maker-absence="true"]` → **the same three declarations**, plus pill radius `999px` and `2px 6px` padding |
| explains itself | `title` + `aria-label` | `title="No recorded house is available for this argument."` (no `aria-label` — see A-6) |
| identity affordance | none | **none** — `{label.absence ? null : <span className="modelDot" …>}`, and `ModelBadge` also drops `--model-color` and `data-model-color` |

```text
mutation: delete the [data-maker-absence="true"] CSS rule
FAIL v2ui-pages.test.ts:540   expected '/* ====…' to match /\[data-maker-absence="true"\]…/

mutation: unconditional <span className="modelDot" …>  (the misleading dot restored)
FAIL v2ui-pages.test.ts:539   expected 'import type { CSSProperties }…' to match
                              /\{label\.absence \? null : <span clas…/

mutation: remove title={label.absence ? …} from both sites
FAIL v2ui-pages.test.ts:538   expected … to contain 'title={label.absence ? "No recorded h…'
```

**The CSS genuinely applies, it does not merely exist.** I checked specificity rather than
trusting the pin. `[data-maker-absence="true"]` is `(0,1,0)` at `globals.css:1659`; the only
competing selector is `.metaLine` `(0,1,0)` at `:474`, which loses on `color` by source order
and sets no border/background. `.badge` / `.modelBadge` have **no rule in any stylesheet**
(`globals.css` is the only CSS file in `apps/v2-ui`), so on the tree badge nothing competes
at all. The rule takes effect on both surfaces.

The rev1 complaint — "the text is honest; the dot argues with it" — is resolved: the dot is
gone, and the pill now carries the absence in the same vocabulary the scoring pills use.

---

## 4. Nothing this ticket owns regressed

**The strongest available evidence: three of the four files from my rev1 restoration
receipt are byte-identical today.**

```text
rev1 097361a3fb4f4ddc98261b21e7a45b02  adapter.ts        now 097361a3fb4f4ddc98261b21e7a45b02  ✅
rev1 ec87bde900474ee765d8f98cceb10f59  DebateTree.tsx    now ec87bde900474ee765d8f98cceb10f59  ✅
rev1 94bd48ea5f0a432a91a9ae86655fbde8  serve/index.ts    now 94bd48ea5f0a432a91a9ae86655fbde8  ✅
rev1 34dc7d89804be2dcdbd12db4d887b51b  ModelPresentation now 27f5b3a731b8e76e53fbbbedd0cf6e6a  (rev2's own work)
```

The adapter is bit-for-bit what I audited at rev1, so **the frozen formatter
(`v3ScorePercentage` / `labeledNumberBadge`, DR-154(4), UI-02a lane) cannot have been
touched** — no reading required. Same for A2/A5's `packages/serve/src/index.ts`: rev2 kept
its promise not to reopen them.

| gate | result |
|---|---|
| adapter control bytes | `bytes=25623 control=0 NUL=0` (identical to rev1) |
| new/changed rev2 files, control bytes | makerIdentity 789 · ModelPresentation 2158 · fixtures 5194 · globals 72131 · models 1647 — **all 0 control, 0 NUL** |
| `audit:text-bytes` (HYG-01 B3) | `REPOSITORY_TEXT_CONTROL_BYTES=0` |
| HYG-01 manifest completeness + maintained Node suite | 2 passed |
| `pnpm --dir apps/v2-ui test` | `tests 27 · pass 27 · fail 0` |
| root `tsc --noEmit` | exit 0 |
| `apps/v2-ui` `tsc --noEmit` | exit 0 |
| full root suite | **67 files / 475 tests passed** |
| acceptance suite | 9 files / 35 tests passed |
| `tests/integration/database.test.ts` ×2 | 32 passed, 32 passed |
| `audit:architecture` | `{edgeRowsChecked: 27, violations: []}` |
| `audit:source` | `{blocking: []}` |

**`apps/v2-ui/lib/models.ts` is genuinely type-only.** Three `!` non-null assertions added
under `noUncheckedIndexedAccess` (`DOTS[key] ?? DOTS.default!` ×2, `NAMES[key]!`). `!` erases
at compile time — zero runtime delta — and `NAMES[key]!` is sound because `modelKey` returns
a closed set and the `"default"` branch has already returned. The handoff's characterisation
is accurate.

**The rev1 flake did not reproduce.** My rev1 flagged
`UNSERVED-MAKER-POSITION has no typed persistence record` as a transient red on the
multi-maker disclosure path, likely a partially-applied concurrent edit, and asked for one
confirming run after HYG-01 landed. Four clean runs today (two full suites, two focused
integration runs). **Closed, no action.**

**A-2 and A-3 are recorded in the handoff** (`UI-02c-codex-handoff.md:294-306`), stated
accurately and without silent fixing. Task item 5 satisfied.

---

## 5. ADVISORY

### A-4 (substantive). The prop hop is unpinned on six of the seven surfaces.

Executed, not inferred:

```text
mutation: drop maker={node.maker} from DebateTree.tsx:152
$ pnpm vitest run --reporter=dot --silent
Test Files  67 passed (67)      Tests  475 passed (475)          ← GREEN

mutation: drop the maker prop from ALL SIX of tree, thread, outline, split, map, drawer
          (8 call sites)
$ pnpm --dir apps/v2-ui typecheck        exit 0                  ← GREEN (the prop is optional)
$ pnpm vitest run --reporter=dot --silent
Test Files  67 passed (67)      Tests  475 passed (475)          ← GREEN
```

With the prop absent, `maker` is `undefined` inside the component, `makerIdentityLabel`
returns `{text: modelName, absence: false}`, and both the text **and** the dot fall back to
the model family — a two-maker debate on one model id renders mono-model, identically on
both nodes. **The same user-visible defect this ticket was cut for, one hop upstream of the
one I pinned at rev1.** Only `DebateCanvas` is pinned (`v2ui-pages.test.ts:281`, `:293`,
UI-01's lane).

**Why this is an advisory and not a second blocking:**

1. **Rev2 did not create it.** The pins that covered five of these surfaces
   (`assert.match(card, /maker=/)` over canvas/thread/outline/split/map) live in
   `apps/v2-ui/lib/debateStatusPresentation.source-test.mjs`, which HYG-01 quarantined to
   `.disabled`.
2. **It was never enforced coverage.** At HEAD, `apps/v2-ui/package.json` declares
   `"test": "node scripts/run-node-tests.mjs"` and that script **does not exist at HEAD** —
   HYG-01 created it. That file only ever ran when a human typed `node --test <path>`.
   HYG-01's approved diamond ruled precisely this: the 49 quarantined files "no longer read
   as coverage." Blocking UI-02c for not having enforced coverage that HYG-01 correctly
   identified as phantom would re-litigate a closed diamond through this one.
3. **My rev1 set the bar and rev2 cleared it exactly.** Rev1 said "What would flip this to
   APPROVED: B1 only," named the fix line by line, and rev2 delivered that fix and nothing
   less. Raising the bar after a worker meets it precisely is how review cycles stop
   terminating — a cost this mission's review log shows it has already paid.

**Why it should still be closed, and why the fix is terminal rather than a new ratchet
spiral.** The chain from record to reader has exactly three hops, and I have now measured
all three: resolver→adapter is behaviorally pinned (`v2ui-data-layer.test.ts:175,178`);
prop→component is unpinned on 6/7 (this advisory); component→text is pinned by rev2. A-4 is
the **last** unpinned hop, so closing it ends the sequence. The fix is six `toContain` lines
in the existing `UI-02c B1` describe block in `tests/unit/v2ui-pages.test.ts`, using the
`source()` helper already in that file. Orchestrator's routing call — UI-02c rev3, a HYG-01
migration follow-up, or its own small ticket — but the tree should not stay in this state.

### A-5. The render-site ratchet counts occurrences; it does not scope them per component.

`expect(presentation.match(/\{label\.text\}/g)).toHaveLength(2)` is satisfied by two
occurrences **anywhere** in the file. Probed:

```text
mutation: duplicate {label.text} inside ModelMetaLine, replace ModelBadge's with {modelId}
$ pnpm vitest run tests/unit/v2ui-pages.test.ts tests/unit/v2ui-data-layer.test.ts
Test Files  2 passed (2)      Tests  88 passed (88)              ← GREEN
```

The tree badge loses its house and the ratchet does not notice. This is an adversarial
transplant, not realistic drift — every natural mutation (delete one, delete both, replace
either) is caught, per §1b — so it is not blocking. Splitting the check per function body
(`region(presentation, "export function ModelMetaLine", "export function ModelBadge")`)
would close it cheaply.

### A-6. The tree badge no longer shows the recorded `model_id` verbatim — a consequence of my own prescription.

At HEAD, `ModelBadge` rendered `{modelId}` (`DebateTree` was the one surface showing the
exact recorded id). Routing it through the shared seam makes it render
`${maker} · ${modelMeta(modelId).name}`, so a production id like `gpt-5` now reads
`OpenAI · GPT` and **the verbatim recorded `model_id` appears in no rendered text on any of
the seven surfaces** (it survives only as the `data-model-id` attribute). This is the
concrete cost of the single-source requirement I imposed, and it sharpens rev1's A-3: a
recorded fact has been fully replaced by an inferred one in the visible layer. Worth naming
before V's visual gate, since the tree is one of the surfaces V will read. Not blocking —
the house half, which is what the ticket is about, is recorded and correct.

### A-7. The absence pill has `title` but no `aria-label`; the scoring pills carry both.

`DebateCanvas.tsx:381` (`aria-label={`Scoring unavailable: …`}`) and `:531-537`
(`aria-label` + `title`) both explain themselves to a screen reader. `[data-maker-absence]`
explains itself only on hover. The ordered fold ("CSS, a title, no dot") is fully delivered;
this is the residual half-step of rev1's A-1 parity table. One attribute.

Rev1's **A-2** (7-bucket colour hash collides on this repo's own `Primary/Secondary test
maker` fixtures) and **A-3** (model half inferred from the id string) stand as the handoff
records them, and A-6 above compounds A-3.

---

## 6. DR-163-A — no interference observed, but the worker is still resident

The UI-02c Codex session **PID 53376** (`codex exec resume 019ff616…`, elapsed 03:02) is
still alive in the working tree. It has written nothing since the handoff: every rev2 file's
mtime is ≤ `20:21:32`, re-checked at `23:19:26`, unchanged across my entire review, which ran
`23:05`–`23:19`. My rev1 verdict file is unmodified
(`1be9232c99af6f76493b342b020a5a18`). **No mid-review edit to report; nothing to stop.**

Flagging only that a live worker session parked in the shared tree is the standing DR-163-A
hazard — it should be closed before the next dispatch touches these files.

## 7. Restoration receipt

Ten mutations, applied one at a time in the clone, each restored and md5-verified **against
the real tree** (not against a local copy):

```text
27f5b3a731b8e76e53fbbbedd0cf6e6a  apps/v2-ui/components/ModelPresentation.tsx
379abffdef461948c0dd76dbc083de46  apps/v2-ui/lib/makerIdentity.ts
78c72a63a0aabdbe364c2e014ce5fce9  apps/v2-ui/app/globals.css
920f1cfedaf884a521f64fcdd641f9f9  tests/support/v2uiFixtures.ts
ec87bde900474ee765d8f98cceb10f59  apps/v2-ui/components/DebateTree.tsx
0fc93268b29876b906fa4b4d798b7dc0  apps/v2-ui/components/DebateThread.tsx
59af58250ae3ae1341141e8b5d6ceada  apps/v2-ui/components/DebateOutline.tsx
1802869264f1a26e3d407c3dffe71fe7  apps/v2-ui/components/DebateSplit.tsx
46b102e97a4aad7623fbc98d3747344d  apps/v2-ui/components/DebateMap.tsx
cb6864c36338ca3c9065e88b75be9e3a  apps/v2-ui/components/NodeDetailDrawer.tsx
```

`diff -rq` over `apps/v2-ui/components` plus per-file `diff` on the seam, CSS, fixtures and
both test files: **no output — zero residue.** Post-restore full suite: **67 files / 475
tests passed.** No mutation ever touched the real tree; this verdict file is my only write
to it.

## 8. Disposition

**APPROVED.** B1 closed by execution; A-1 folded and mutation-killed; single source
verified with no third path; fixture pair present, exercised, and load-bearing; A-2/A-3
recorded in the handoff; nothing regressed, with three rev1 hashes byte-identical as proof.

The diamond completes — UI-02c closes, stack restart and V's visual gate follow. **A-4
should be opened as a bounded follow-up before the tree moves on**; it is the last unpinned
hop in the record-to-reader chain and a six-line fix in a file that already exists.
