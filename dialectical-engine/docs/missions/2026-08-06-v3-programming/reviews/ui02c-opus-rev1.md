# UI-02c — Opus 5 lens, rev1

**Board:** `debateai-v3` · **Ticket:** `t_0829cf81` · **Diamond:** dual (DR-153)
**Lens:** Opus 5 · **Mode:** READ-ONLY except this file. No git, no board, no
service, no product-data write.
**Gates:** not re-run wholesale (orchestrator verified independently). I ran
only what my findings required, and every mutation was restored and
md5-verified against its pre-mutation hash.

## VERDICT: `BLOCKING` — 1 blocking finding

A2 and A5 are closed, honestly and reproducibly. A1 is **implemented but not
guarded**: the one line where the house actually reaches the reader has no test
that can fail. This ticket exists because advisory drift and unfalsifiable
checks are the mission's two most expensive defect classes; A5 was cut
specifically to punish "a check that cannot fail for the reason its author
believed." A1 shipped with that exact hole in it.

The fix is small (one pure-function extraction plus two assertions). I am not
disputing the implementation — I am disputing that anything protects it.

---

## B1 — BLOCKING. The house is rendered, and nothing can notice if it stops.

**Where the house reaches the reader:** exactly two lines.

- `apps/v2-ui/components/ModelPresentation.tsx:25` (`ModelMetaLine` — canvas,
  thread, outline, split, map, drawer)
- `apps/v2-ui/components/ModelPresentation.tsx:42` (`ModelBadge` — tree)

Both compose `` `${maker} · ${…}` ``. That composition **is** deliverable A1.
Delete it from both lines — leaving every attribute, every prop, every import,
the `"House unavailable"` literal and `modelColor(identity)` intact — and the
render reverts precisely to the defect the ticket was cut for: a two-maker
debate rendering mono-model.

**Mutation run (md5-verified restore to `34dc7d89804be2dcdbd12db4d887b51b`):**

```text
mutation: :25 → {maker === null ? "House unavailable" : model?.name ?? modelId}
          :42 → {maker === null ? "House unavailable" : modelId}

$ node --test apps/v2-ui/lib/debateStatusPresentation.source-test.mjs
# tests 3 · # pass 3 · # fail 0

$ pnpm vitest run tests/unit/v2ui-pages.test.ts tests/unit/v2ui-data-layer.test.ts \
                 tests/unit/s14-ui.test.ts tests/unit/contract.test.ts
Test Files  4 passed (4)      Tests  102 passed (102)

$ pnpm vitest run --reporter=dot --silent
Test Files  65 passed (65)    Tests  461 passed (461)     [16:23, pre-contamination]
```

Every gate the handoff cites stays green while the ticket's whole point is
gone. This is A5's defect class, delivered inside A1.

**The coverage stops exactly one hop short — and I proved both sides of it.**
The two adjacent hops *are* mutation-killed:

- adapter: `maker: contractNode.maker_lineage?.maker ?? null` →
  `maker: null` ⇒ `tests/unit/v2ui-data-layer.test.ts:171` fails **and**
  `debateStatusPresentation.source-test.mjs:53` fails (3 tests, 1 fail).
- consumer wiring: dropping `maker={node.maker}` and the maker key from
  `modelColorStyle` in `apps/v2-ui/components/DebateTree.tsx:116,152` ⇒ caught.

So maker survives the resolver, survives the adapter, survives the prop — and
then the last transformation, the one a human actually reads, is unpinned. The
source pins that exist assert *plumbing* (`maker=`, `maker:
contractNode.maker_lineage?.maker ?? null`, `House unavailable`,
`modelColor(identity)`); none asserts that the maker appears in the output.

**Compounding: no fixture anywhere exercises the ticket's own concrete case.**
`tests/support/v2uiFixtures.ts:44-67` gives one node `{maker:"OpenAI",
model_id:"gpt-5"}` and one `maker_lineage: null`. The named defect — *two nodes,
identical `model_id`, different makers* (the acceptance ceremony's
`OpenAI`/`Anthropic` doubles both answering `test-layer/model`) — has no fixture
and no assertion in the V2 layer. The DB-level proof exists
(`acceptance/ceremony.test.ts:377`), but it stops at the ledger; it never
reaches the projection V will look at.

### Concrete close (small, and fits this repo's constraints)

There is no jsdom/testing-library in the repo (`vitest.config.ts` includes only
`tests/**/*.test.ts`, node environment), so JSX cannot be rendered under test —
which is presumably why this landed as source pins. The way out is a pure seam:

1. Extract the label into `apps/v2-ui/lib/` — e.g.
   `makerIdentityLabel({ maker, modelId }): { text: string; absence: boolean }`
   — and have both `ModelMetaLine` and `ModelBadge` render its `text`.
2. Add to `tests/unit/v2ui-data-layer.test.ts` (node env, no new deps):
   - same `model_id`, makers `"OpenAI"` vs `"Anthropic"` ⇒ the two labels
     **differ** and each contains its own maker. (Kills B1.)
   - `maker: null` ⇒ `text === "House unavailable"`, `absence === true`.
     (Kills silence.)
3. Add the same-model/different-maker node pair to
   `tests/support/v2uiFixtures.ts` so the ticket's named case is a fixture, not
   a memory.

That converts A1 from "true today" into "cannot silently stop being true."

---

## What I verified and accept

### A2 — the renames are honest, pinned, and genuinely generated ✅

The worker **renamed and dropped**, which is the right call:

- `provider` (the hardcoded transport literal) → `transport`, mapped once at
  `packages/serve/src/index.ts:123` (`transport: recorded.provider`) from the
  raw ledger column, which correctly stays named `provider`.
- `model_version` (byte-identical-to-`model_id`-or-null) is **not served**.
  `MakerLineageSchema` is now `{maker, model_id, transport, provider_ref}`,
  `.strict()` (`packages/contract/src/index.ts:262-267`).

Pins updated and real:

- `tests/integration/database.test.ts:968-973` — the ticket's `835-837` pins,
  displaced by other lanes' uncommitted inserts, now assert `transport:
  "openai-compatible-http"` with no `model_version`.
- `tests/unit/contract.test.ts:88-96` — strictness is behaviourally tested:
  omitting `maker_lineage` throws, empty `maker` throws, and adding the legacy
  `provider` member throws.

**Generation is genuine, not hand-edited.** I re-ran `pnpm run
generate:contract`; all three artifacts came back byte-identical
(`field-inventory.json d7b11cad…`, `openapi.json 151c310e…`, `client.ts
21067df9…`), and `packages/contract/generated/` is untracked.

**No consumer left on the old names.** `maker_lineage` has exactly six code
references (`packages/contract/src/index.ts:277`,
`packages/serve/src/index.ts:113,1690`, `apps/v2-ui/lib/v3/adapter.ts:137-143`,
the source pin, and the tests/fixtures above). `web/` never read it. Root and
`apps/v2-ui` `tsc --noEmit` both exit 0 (re-run 16:32).

### A5 — the mutation-proofing claim reproduces exactly ✅

I re-ran it myself. Deleted only `recorded.provider === null ||`
(`packages/serve/src/index.ts:117`):

```text
$ pnpm vitest run tests/unit/s14-ui.test.ts -t 'relays a complete ledger identity …'
FAIL  UI-02b — recorded per-node maker lineage
AssertionError: expected { maker: 'maker:test-layer', …(3) } to be null
Received: { maker:'maker:test-layer', model_id:'model:test-layer',
            provider_ref:'provider:test-layer', transport: null }
  ❯ tests/unit/s14-ui.test.ts:179:70
Test Files  1 failed (1)   Tests  1 failed | 13 skipped (14)
```

Restored → `md5 94bd48ea5f0a432a91a9ae86655fbde8` (identical to pre-mutation)
→ 1 passed. The handoff's transcript is accurate down to the projection shape.
`tests/unit/s14-ui.test.ts:177-180` guards all four members individually, so
each is independently mutation-killed. **A5 is closed.**

### Typed absence exists and never fabricates a house ✅ (styling: see A-1)

`maker_lineage === null` ⇒ `maker: null` **and** `active_generation: null`
(`adapter.ts:137-143`). All seven surfaces gate on `generation || node.maker
!== undefined`, so for a V3 node — where `maker` is always defined as
`string | null` — the absent case still renders, and renders the visible typed
string `House unavailable` with `data-maker-absence="true"`. Never silence.
Never an inferred house. `undefined` (legacy V2 only) keeps the old path.

### Nothing regressed in the ratcheted surfaces ✅

- **Adapter control bytes: 0.** Byte scan of `apps/v2-ui/lib/v3/adapter.ts`:
  0 control bytes, 0 NULs, 25623 bytes. Ratchet
  `tests/unit/v2ui-pages.test.ts:224-226` green.
- **Frozen formatter untouched.** UI-02c's entire adapter footprint is the
  7-line hunk at `adapter.ts:137-143`. `v3ScorePercentage` /
  `labeledNumberBadge` (DR-154(4), UI-02a lane) are unmodified by this ticket,
  and the no-reformatting pins at `tests/unit/v2ui-pages.test.ts:211-217`
  (`formatScorePercent`/`toFixed`/`Math.round`/`* 100` forbidden in the V3
  badge block) are green.
- **UI-01 rev4 wiring green**, including the two pins the worker rewrote
  (`tests/unit/v2ui-pages.test.ts:274-292`). The rewrite is **stronger** at the
  wiring level than what it replaced: MUT-C now demands `maker={node.maker}`
  *inside* the contentful node header, not merely `modelMeta(...)` somewhere.
  Rewriting another lane's mutation-kill pins is a move that must be
  disclosed, and the handoff discloses it (line 102). Honest.
- **Audits:** `audit:architecture` `{edgeRowsChecked: 27, violations: []}`;
  `audit:source` `{blocking: []}`.

### Dirty-tree attribution is honest ✅

Spot-checked against `git diff` on the claimed files. The adapter diff vs HEAD
is dominated by other lanes (`v3ScorePercentage`, `modelLedgerIdentityKey`,
`riskTier`); UI-02c's share is the 7 lines at `137-143`, exactly as claimed.
`ModelPresentation.tsx`'s diff is wholly UI-02c. The whole `UI-01 DR-146
rework` describe block in `v2ui-pages.test.ts` is another lane's uncommitted
work, into which UI-02c edited two assertions — disclosed. Handoff line 112's
scope claim holds everywhere I could check it.

One omission worth naming, not as dishonesty but because it *is* advisory A-1:
the file inventory contains no CSS file, and indeed UI-02c added none.

---

## ADVISORY

**A-1 (closest to blocking — an explicit packet DELIVER only half-met). The
typed absence is visible but is not "consistent with the sibling scoring
work."** Compare:

| | scoring absence | maker absence |
|---|---|---|
| render | `DebateCanvas.tsx:531-540` | `ModelPresentation.tsx:23-26,38-42` |
| visual marking | `className="scoreBadge unavailable"` → `globals.css:1653-1657` (muted text, strong border) | `data-maker-absence="true"` → **no CSS rule exists** |
| explains itself | `title` + `aria-label` carrying the reason | none |
| identity affordance | none | **a solid identity dot**, `modelColor("maker-absent")` = `#2f6f5f` |

The third row is the substantive one: the absent-house line paints the very
affordance that encodes house identity everywhere else, in a normal palette
colour, next to the words "House unavailable". The text is honest; the dot
argues with it. Suggest: suppress or neutralise the dot when `maker === null`,
add a `title` on the same footing as the scoring pill's, and give
`[data-maker-absence="true"]` the `unavailable` treatment.

**A-2. `modelColor` cannot carry the house on its own — it collides.**
`ModelPresentation.tsx:4-9` is a 7-bucket character-sum hash. This repo's own
depth-2 two-maker integration fixture uses makers `"Primary test maker"` and
`"Secondary test maker"` (`tests/integration/database.test.ts:821-828`) — both
hash to `#6f5d9a`. Production's `OpenAI` (`#7a4d1d`) vs `Anthropic` (`#8062b5`)
happen to differ, and the *text* always distinguishes, so nothing is wrong
today — but "at a glance" is the colour channel, and it is luck again, not
design. A fixed maker→colour map with a typed fallback would close it.

**A-3. The model half of the meta line is still inferred from the model-id
string.** `ModelMetaLine:25` renders `` `${maker} · ${modelMeta(modelId).name}`
``, and `modelMeta`/`modelKey` (`apps/v2-ui/lib/models.ts:26-33`) derive the
family from substrings of the id and append `·local`. So a house serving an
aliased id can render `OpenAI · Claude`, and the exact recorded `model_id`
never appears on six of the seven surfaces (only `ModelBadge` in the tree shows
it verbatim). This is pre-existing V2 vocabulary that DR-145 forbade forking,
so I do not fault the choice — but a recorded fact now sits beside an inferred
one with the same typographic weight (DR-115 tension). Consider rendering the
recorded `model_id` and keeping the family name only for the dot.

**A-4. Dead read left behind by A2.** `model_version` is still declared on the
resolver input (`packages/serve/src/index.ts:110`) and still `SELECT`ed
(`:1609`) while nothing reads it. Harmless, but this mission audits exactly
this shape.

**A-5. `transport` and `provider_ref` are now served-without-consumer** — the
narrowed remainder of the original A1. Acceptable (V asked for the house), but
note that no gate can see it: `packages/contract/src/generate.ts:8-13` records
only top-level resource keys, so `field-inventory.json` lists `maker_lineage`
and nothing beneath it. Corollary: **"contract generation was run" carries no
evidence for A2** — the rename produces zero diff in any generated artifact.
The real pins are `contract.test.ts:88-96` and `database.test.ts:968-973`, and
they are good ones.

**A-6. `GenerationPresentation` widens a type for every consumer, not just
V3.** `apps/v2-ui/lib/types.ts:31-35` makes every non-`model_id` field of
`Generation` optional, and `active_generation` (`:89`) plus `ClaimGeneration`
(`:781`) now use it. Typecheck passes, but legacy V2 paths that could
previously rely on `active_generation.argument` being present now type against
`string | undefined`. `DebateNode.maker` (`:90-91`) already carries the house
independently; a narrower seam would avoid weakening the shared type.

---

## ENVIRONMENT — the tree moved underneath this review (orchestrator action)

A **second Codex worker is writing this same working tree right now**: PID
27297, `HYG-01`, ticket `t_4a1f8654`, started 16:19. During my review it
created `tests/unit/v2ui-node-runner.test.ts` (16:26, untracked) and
`apps/v2-ui/scripts/run-node-tests.mjs` (16:27), and touched
`apps/runner/src/index.ts` (16:25) and `tests/integration/database.test.ts`
(16:24).

Consequences the orchestrator should know:

1. **The root suite baseline has already moved.** 65 files / 461 tests at
   16:23 → 66 files / 463 tests by 16:30. UI-02c's cited gate numbers are no
   longer this tree's numbers.
2. **I observed the root suite red twice** in that window, e.g.
   `tests/integration/database.test.ts > … > runs a depth-2 two-maker tree and
   preserves the single-root disclosure at envelope terminal` →
   `TypedDomainError: UNSERVED-MAKER-POSITION has no typed persistence record`
   (`packages/serve/src/index.ts:796`). **Not attributable to UI-02c** — no
   UI-02c file participates in that path, and the most likely cause is a
   partially-applied concurrent edit. It reproduces neither in isolation
   (2 clean runs) nor consistently. Flagging it because it lands on the
   multi-maker disclosure path this whole arc depends on: worth one confirming
   run after HYG-01 lands.
3. My B1 evidence is unaffected: the MUT-HOUSE full-suite run was at 16:23,
   before the first HYG-01 file appeared, and the focused/`node --test`
   evidence depends only on files I md5-verified.

## Restoration receipt

All four mutated files restored and hash-matched to their pre-mutation state:

```text
097361a3fb4f4ddc98261b21e7a45b02  apps/v2-ui/lib/v3/adapter.ts
34dc7d89804be2dcdbd12db4d887b51b  apps/v2-ui/components/ModelPresentation.tsx
ec87bde900474ee765d8f98cceb10f59  apps/v2-ui/components/DebateTree.tsx
94bd48ea5f0a432a91a9ae86655fbde8  packages/serve/src/index.ts
```

Post-restore: `node --test` 3/3, focused vitest 102/102 (16:34).

## What would flip this to APPROVED

B1 only. Extract the label to a pure function, assert same-model/different-maker
produces two different labels that each name their own house, assert
`maker: null` produces the typed-absence text, and add the same-model pair to
the fixtures. A-1 is cheap enough that I would take it in the same pass, since
V's gate on this ticket is a visual one.
