# UI-02d — Opus 5 lens, rev1 (DR-153 dual diamond)

**Ticket:** `t_94ac4a9d` · **Worker:** Codex GPT-5.6 Sol · **Lens:** Opus 5 (1M)
**Method:** DR-163 isolated APFS clone of the parent git root
`/Users/vladmihaimiron/Documents/DebateAIRO` (clone birth `13:42:42`, `.git` +
parent `.gitignore` carried, byte-identity verified). Every mutation applied
alone in the clone, focused command executed, md5-restored before the next.
Only this verdict was written to the real tree.

## VERDICT: **NOTHING BLOCKING.** Four advisories, none of them this ticket's making.

The set's last coding diamond is right. V's DR-165(2) ruling is satisfied
literally — a card reading `Anthropic · Claude · claude-opus-4-5` answers
*"I want to see if its sol, Sonnet, fable or Opus"* in the words V asked for.
The six surfaces are pinned, seven of the eight call sites by real rendered
behaviour. The A-5 transplant I executed against rev2 now fails. A-7 is
delivered on both pills. Nothing regressed.

The one substantive finding (**A-1**) is that the *canvas* — the seventh
surface, the one V actually reads — still has an unpinned maker hop at
`DebateCanvas.tsx:344`. That call site is outside UI-02d's declared scope by
the ticket's own premise, and UI-02d did not create it. It should not hold
this ticket. It should not be forgotten either.

---

## 0. Baseline and restoration receipt

```text
clone $ pnpm vitest run --reporter=dot --silent
Test Files  74 passed (74)
     Tests  520 passed | 1 skipped (521)          ← baseline, matches the handoff exactly

clone $ pnpm vitest run --reporter=dot --silent   ← after the entire mutation battery
Test Files  74 passed (74)
     Tests  520 passed | 1 skipped (521)
```

All eleven mutated files byte-identical to baseline in the clone, and the real
tree byte-identical to my baseline at close:

```text
clone=OK real=OK  apps/v2-ui/lib/makerIdentity.ts
clone=OK real=OK  apps/v2-ui/components/ModelPresentation.tsx
clone=OK real=OK  apps/v2-ui/components/DebateTree.tsx
clone=OK real=OK  apps/v2-ui/components/DebateThread.tsx
clone=OK real=OK  apps/v2-ui/components/DebateOutline.tsx
clone=OK real=OK  apps/v2-ui/components/DebateSplit.tsx
clone=OK real=OK  apps/v2-ui/components/DebateMap.tsx
clone=OK real=OK  apps/v2-ui/components/NodeDetailDrawer.tsx
clone=OK real=OK  tests/unit/v2ui-pages.test.ts
clone=OK real=OK  tests/render/ui02d-model-identity.test.tsx
canvas clone=a94d8ea1b733cb5d6395564e1b7820b5 real=a94d8ea1b733cb5d6395564e1b7820b5
```

---

## 1. The verbatim id renders — **PASS**

`makerIdentityLabel` (`apps/v2-ui/lib/makerIdentity.ts:14-28`) composes
`[maker, friendlyFamily, modelId]`. The id is passed through, never
reconstructed. The provenance chain is recorded end to end:

- `packages/contract/src/index.ts:277-282` — `MakerLineageSchema` has
  `maker: z.string().min(1)`, `model_id: z.string().min(1)`.
- `apps/v2-ui/lib/v3/adapter.ts:138-144` — `active_generation.model_id =
  contractNode.maker_lineage.model_id`, verbatim; `maker` likewise.
- the six components pass `modelId={generation?.model_id ?? null}` unchanged.

**Executed, on the real components under the enforced render layer** (the RED
output prints the actual rendered HTML, so this is behaviour, not source):

| mutation | result |
|---|---|
| **M1** — swap the exact id for the family string: `[modelName, modelId]` → `[modelName, modelName]` | `Tests 6 failed \| 94 passed`. Every surface rendered `OpenAI · GPT · GPT`; six render assertions named it. |
| **M1b** — derive the id from the family hash (the DR-115 violation): `[modelName, modelKey(modelId)]` | `Tests 6 failed \| 94 passed`. Rendered `OpenAI · GPT · gpt`. |

What V will read, probed against the real seam with realistic recorded ids:

```text
{"maker":"OpenAI",   "modelId":"gpt-5.6-sol",       "text":"OpenAI · GPT · gpt-5.6-sol"}
{"maker":"Anthropic","modelId":"claude-opus-4-5",   "text":"Anthropic · Claude · claude-opus-4-5"}
{"maker":"Anthropic","modelId":"claude-sonnet-4-5", "text":"Anthropic · Claude · claude-sonnet-4-5"}
{"maker":"Anthropic","modelId":"claude-fable-1",    "text":"Anthropic · Claude · claude-fable-1"}
{"maker":"xAI",      "modelId":"grok-4.5-high-loop","text":"xAI · Grok · grok-4.5-high-loop"}
{"maker":null,       "modelId":"gpt-5.6-sol",       "text":"House unavailable", absence:true}
{"maker":null,       "modelId":null,                "text":"House unavailable", absence:true}
```

DR-165(2) is answered in V's own vocabulary: sol, Sonnet, fable and Opus are
each distinguishable at a glance. UI-02c's A-6 is resolved in the SHOW
direction — the recorded id is back in rendered text, and now on *seven*
surfaces rather than the one it had at HEAD.

**Typed absence unchanged, no id fabricated for an absent maker.** The
`maker === null` early return precedes composition; a recorded id present with
an absent house still yields exactly `House unavailable`. See A-3 for the one
unpinned degree of freedom here (contract-unreachable).

The third state (`maker === undefined`) is also unchanged, and quietly
improved: the three generation-history call sites
(`NodeDetailDrawer.tsx:297,323`, `DebateTree.tsx:215`) now render
`GPT · gpt-5.6-sol` — family plus exact id, honestly no house, because those
projections carry no maker.

---

## 2. The six surfaces — **PASS**, with a granularity finding

Every one of the eight call sites goes RED when dropped alone. Full-suite
confirmation on the individual sites, plus the split of *what* kills each:

| call site | render pin | source pin | full suite |
|---|---|---|---|
| `DebateTree.tsx:152` | **RED** 1/7 | RED | — |
| `DebateThread.tsx:179` | **RED** 1/7 | RED | — |
| `DebateOutline.tsx:63` | **RED** 1/7 | RED | — |
| `DebateSplit.tsx:126` (`focus.maker`) | **RED** 1/7 | RED | — |
| `DebateSplit.tsx:301` (`node.maker`) | GREEN 7/7 | RED | 1 failed |
| `DebateMap.tsx:163-166` | **RED** 1/7 | RED | — |
| `NodeDetailDrawer.tsx:202` | **RED** 1/7 | RED | 2 failed |
| `NodeDetailDrawer.tsx:290` | GREEN 7/7 | RED | 1 failed |

**Six of eight are rendered-behaviour pins — the preferred kind, and all six
surfaces carry at least one.** The packet's floor ("six `toContain` lines") was
cleared, not merely met: `tests/render/ui02d-model-identity.test.tsx` invokes
`DebateTree`, `DebateThread`, `DebateOutline`, `DebateSplit`, `DebateMap` and
`NodeDetailDrawer` for real and asserts both the identity text and
`data-maker="OpenAI"` in the emitted HTML.

The two exceptions are each the *second* call site of their surface, and
neither is reachable by the render fixture for a structural reason:
`DebateSplit.tsx:301` is the tree-column card, whose identity string is already
supplied by `:126` so `toContain` cannot distinguish them; `NodeDetailDrawer.tsx:290`
sits in generation history, which renders "Unlock actions to view generation
history." at `token={null}`. Both are pinned by source text only. See **A-2**.

---

## 3. Ratchet scoping (A-5) — **PASS**

I re-ran the exact adversarial transplant my rev2 lens executed against UI-02c
(duplicate `{label.text}` inside `ModelMetaLine`, replace `ModelBadge`'s with
`{modelId}`). Against rev2 it was GREEN 88/88. Now:

```text
FAIL tests/unit/v2ui-pages.test.ts > UI-02c B1 — both shared model renderers
     consume the tested house label > routes ModelMetaLine and ModelBadge
     through makerIdentityLabel
AssertionError: ModelMetaLine: expected [ '{label.text}', '{label.text}' ]
                to have a length of 1 but got 2
  539|     for (const [name, renderer] of [["ModelMetaLine", metaLine], ["Mod…

full suite: Tests 3 failed | 517 passed | 1 skipped (521)
```

`v2ui-pages.test.ts:537-542` scopes both the seam call and the `{label.text}`
render to each function body and requires exactly one of each. The `region()`
helper (`:29-35`) asserts both markers exist and that the end follows the
start, so a reordering or rename fails loudly rather than silently returning an
empty region — the failure mode that would have made the scoping cosmetic.
A-5 is closed.

---

## 4. A-7 aria-label — **PASS**

Both pills carry it (`ModelPresentation.tsx:31`, `:56`), and each is
independently load-bearing:

| mutation | render suite | full suite |
|---|---|---|
| remove **both** aria-labels | 1 failed / 6 passed | 2 failed |
| remove `ModelMetaLine`'s only | 1 failed / 6 passed | 1 failed |
| remove `ModelBadge`'s only | 1 failed / 6 passed | 1 failed |

Consistent with the house pattern: `DebateCanvas.tsx:382` (`Scoring
unavailable: …`), `:519`, `:523`, `:574` (`aria-label={badge.title}`) all put an
explanatory `aria-label` on a `<span>` alongside `title`. The absence pill now
matches the scoring pills exactly, which is the parity rev1's A-1 table asked
for. See **A-4** for a wording nit.

---

## 5. Collection — **PASS** (verified, not trusted)

The house has lost three runners to phantom collection this mission, so I ran
the *unfiltered* enumeration rather than the file-scoped one the handoff pasted:

```text
$ pnpm vitest list                       # NO file argument
520 test lines enumerated
grep -c ui02d-model-identity  →  7
render files enumerated:
  tests/render/load01-debate-page.test.tsx
  tests/render/ui02d-model-identity.test.tsx
  tests/render/ux01-new-debate-form.test.tsx
```

All seven UI-02d tests are collected by the default enforced config, and the
520 enumerated lines reconcile with the 520 passing tests. The other new
assertions live in `tests/unit/v2ui-pages.test.ts`, already enforced.

The node runner is alive too: `pnpm --dir apps/v2-ui test` →
`V2_UI_NODE_TESTS_DISCOVERED=1`, `# tests 27 / # pass 27 / # fail 0`.

---

## 6. Nothing regressed — **PASS**

Every gate re-executed in the clone, my own output:

```text
pnpm run typecheck                                        exit 0
pnpm --dir apps/v2-ui typecheck                           exit 0
pnpm vitest run                     74 files, 520 passed | 1 skipped
acceptance/vitest.config.ts          9 files,  35 passed
tests/integration/database.test.ts   1 file,   37 passed
pnpm run audit:architecture         { "edgeRowsChecked": 27, "violations": [] }
pnpm run audit:source               { "blocking": [] }
pnpm run audit:text-bytes           REPOSITORY_TEXT_CONTROL_BYTES=0
pnpm --dir apps/v2-ui test          27/27
```

- **Frozen `v3ScorePercentage`**: `apps/v2-ui/lib/v3/adapter.ts:313`, real-tree
  mtime `02:04:27` — before UI-02d's `12:24–12:32` working window. Its pins
  (`v2ui-data-layer.test.ts:302-308`, the tie-band determinism pair) are green.
- **NUL ratchets**: `audit:text-bytes` 0, `tests/unit/text-control-bytes.test.ts`
  green in the 74/520.
- **UX-01 / LOAD-01 surfaces byte-unchanged where unrelated**:
  `tests/render/ux01-new-debate-form.test.tsx` (`12:03:58`),
  `tests/render/load01-debate-page.test.tsx` (`08:16:52`),
  `apps/v2-ui/app/new/page.tsx` (`09:23:34`) all pre-date the UI-02d window.
  LOAD-01's `expect(html).toContain(label)` binds run-state labels
  (`Queued`/`Claimed`/`Running`), not identity text, so the seam change does not
  intersect it — the reason it needed no edit.
- **UI-02c's canvas pins** (`v2ui-pages.test.ts:284`, `:296`, MUT-C at `:296`)
  are intact; the canvas inherits the exact id for free through the shared seam.

---

## ADVISORY

### A-1 (substantive, out of declared scope). `DebateCanvas.tsx:344` is still an unpinned maker hop.

The ticket inherited the premise *"only `DebateCanvas` is pinned"* from my own
rev2 advisory. That premise is half true. The canvas has **two** node-maker
call sites and only one of them is load-bearing:

```text
mutation: drop maker={node.maker} from DebateCanvas.tsx:376  (nodeHeader card)
$ pnpm vitest run --reporter=dot --silent
Tests  1 failed | 519 passed | 1 skipped (521)                      ← pinned

mutation: drop maker={node.maker} from DebateCanvas.tsx:344  (state === "empty" card)
$ pnpm vitest run --reporter=dot --silent
Tests  520 passed | 1 skipped (521)                                 ← GREEN
```

`:344` is the conceded-position card — *"No strong argument found."* followed by
`OpenAI · GPT · gpt-5.6-sol conceded`. Drop the prop and it renders
`GPT · gpt-5.6-sol conceded`: the house silently vanishes from a card in a
two-maker debate, which is the exact user-visible defect this whole UI-02b/c/d
sequence was cut for. It survives because UI-01's pin is
`expect(canvas).toContain('<ModelMetaLine … maker={node.maker} />')` —
*presence, not count* (`v2ui-pages.test.ts:284`) — and MUT-C's region runs
`<div className="nodeHeader">` → `<ScoringErrorBoundary>`, which contains `:376`
alone (`:296`). Either assertion is satisfied by `:376` by itself.

**Why advisory and not blocking:** the ticket body scopes UI-02d to
"tree/thread/outline/split/map/drawer — 8 call sites" and explicitly excludes the
canvas as already-pinned; the canvas is UI-01's lane; UI-02d neither created
this nor touched `DebateCanvas.tsx` (real-tree mtime `00:21:11`, before its
window). Blocking a worker for a hole its packet excluded by name, on a premise
my own prior review supplied, is the review-cycle failure mode this mission has
already paid for twice.

**Why it should not be dropped:** A-4 was framed as "the last unpinned hop,"
and it is now the last unpinned hop *on the six surfaces V does not primarily
read*. Related and worth ruling on together: **`DebateCanvas` is rendered by no
test in the repository** — `grep -rln DebateCanvas tests/` returns only
`tests/unit/v2ui-pages.test.ts`, which reads it as source. It is the only one of
the seven surfaces with no rendered-behaviour pin at all, and it is the surface
V will be looking at during the DR-145 visual gate. Cost to close: one region
assertion for `:344`, or a `DebateCanvas` entry in
`tests/render/ui02d-model-identity.test.tsx` alongside the other six.

### A-2. The two source-text-only pins can fail for the wrong reason, and pass for the wrong one.

`DebateSplit.tsx:301` and `NodeDetailDrawer.tsx:290` are held by
`v2ui-pages.test.ts:565` and `:567` alone. Both probes executed:

```text
probe B1 — reformat split:301 across four lines; behaviour IDENTICAL
$ pnpm --dir apps/v2-ui typecheck                      exit 0
$ pnpm vitest run tests/render/ui02d-model-identity…   7 passed (7)
$ pnpm vitest run --reporter=dot --silent
Tests  1 failed | 519 passed | 1 skipped               ← FALSE RED on whitespace

probe C1 — drop the live prop at split:301, keep the exact byte sequence
           in a `//` comment at the top of the file
$ pnpm run typecheck                                   exit 0
$ pnpm --dir apps/v2-ui typecheck                      exit 0
$ pnpm vitest run --reporter=dot --silent
Tests  520 passed | 1 skipped (521)                    ← FALSE GREEN; the card
                                                         has lost its house
```

The regex counts a byte sequence anywhere in the file, including a comment, and
breaks on a prettier line-wrap that changes nothing. This is the same
adversarial class my rev2 rated advisory for A-5 — natural drift (delete the
prop) *is* caught, on both — and it is the established house `source()` idiom
across UI-01/UI-02a-c, so it is not UI-02d's invention. Closing it properly means
reaching those two call sites from the render layer: `:290` needs a fixture with
history unlocked, `:301` needs the split's two cards to carry distinguishable
identities (two makers in the fixture tree — which is, after all, the case the
whole ticket exists to protect).

### A-3. Typed absence with a recorded id is correct but unpinned.

The behaviour is right — `{maker: null, modelId: "gpt-5.6-sol"}` yields exactly
`House unavailable`, no id fabricated. But nothing holds it:

```text
mutation: absence branch returns `House unavailable · ${modelId}` when modelId !== null
$ pnpm vitest run --reporter=dot --silent
Tests  520 passed | 1 skipped (521)                    ← survives
```

The existing pin (`v2ui-data-layer.test.ts:199-203`) only covers
`{null, null}`. **Not a live hole**: `MakerLineageSchema` is nullable as a whole
with `maker: z.string().min(1)` inside, and `adapter.ts:138-144` derives both
`maker` and `active_generation` from that single object, so `maker === null`
implies `modelId === null` at the contract boundary. The same guard
(`model_id: z.string().min(1)`) makes the empty-id edge — which would render
`OpenAI · Model · ` with a dangling separator — equally unreachable. One line in
the existing pure-seam test would pin both if the orchestrator wants the seam
defended independently of its caller.

### A-4. Handoff wording: "accessible-name assertion" is an attribute assertion.

`ui02d-model-identity.test.tsx:122` matches the literal
`aria-label="No recorded house is available for this argument."` twice in the
emitted HTML. That is attribute presence, not a computed accessible name — and
per ARIA, `aria-label` on a role-less `<span>` (implicit `generic`) is not
guaranteed to be surfaced. The house does exactly this in four places already
(`DebateCanvas.tsx:382,519,523,574`), so A-7's "consistent with the house
pattern" is satisfied and this is parity rather than a new defect. Flagging only
so the handoff's "rendered accessible-name assertion" is not later read as
proof of screen-reader behaviour it does not measure.

---

## DR-163 — concurrent mutation observed in the shared tree

My clone was taken at `13:42:42`. During my review the real tree's
`apps/v2-ui/lib/makerIdentity.ts` (`13:44:29`),
`apps/v2-ui/components/DebateTree.tsx` (`13:44:49`) and
`apps/v2-ui/components/ModelPresentation.tsx` (`13:45:31`) were written — a
mutate-and-restore cycle by the concurrent lens, in the shared working tree,
which is precisely what DR-163 exists to prevent.

**No contamination of this review**: I measured only inside the clone, and at
close every one of the ten baseline files in the real tree is byte-identical to
my baseline, so the other lens restored correctly this time. Reporting it
because the law says the isolation is the orchestrator's to enforce at dispatch,
and one lens observing the other's restore is not a substitute for it.

---

## Bottom line

UI-02d does what its packet and V's ruling asked, and the evidence is
behavioural rather than textual on seven of eight call sites. The exact model id
is back in the rendered text on every surface, verbatim from the recorded
lineage and mutation-proven against both the family-string swap and the
family-hash derivation. The A-5 transplant is dead. A-7 is delivered on both
pills. Every gate reproduces the handoff's numbers exactly, and the handoff
overclaims nothing I could find beyond A-4's one phrase.

**Nothing blocking. Ship it.** A-1 deserves its own small ticket before V's
visual gate, since the card it protects is the one V will be reading.

— Opus 5 lens, `ui02d-opus-rev1`
