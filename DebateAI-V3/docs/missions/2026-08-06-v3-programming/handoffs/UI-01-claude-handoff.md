# UI-01 — V2's debate UI, whole, serving V3's real data (claude-worker handoff)

Ticket `t_5f35d086` · board `debateai-v3` · roster DR-140 (Claude codes, Grok
reviews) · ruling DR-145 (S14 visual gate REJECTED; restore V2's surface).

**Session note (continuity):** this ticket was worked across two worker
sessions. The first (Fable-5) was terminated mid-task by an API quota limit;
V granted a WORKER CONTINUITY OVERRIDE and ruled continuation on Opus 5. The
second session re-ran the whole reported baseline before touching anything
(the reported 31/31 was actually 35/35 — four live-event tests had landed
after the last log line) and then finished the page wiring and verification.
Nothing was taken on trust.

---

## 1. What this delivers

`apps/v2-ui` is the served app. Its 21 components and its 3,301-line
`app/globals.css` are untouched design authority; only the DATA ACCESS beneath
them was replaced, plus two additive honesty surfaces V2 has no home for.

The restored workspace renders FAIR-01's real run against the standing
acceptance stack: two nodes, one attack edge, the defeater drawn as V2's CON
card, and V3's honesty (condition marks, ledger digest, cost envelope, replay
handles) intact.

### Exact run command

```bash
# standing acceptance stack must be up: DB 55432 / API 8790 / shim 8791
cd /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
pnpm --filter dialectical-engine-v2ui dev      # serves :3000
# or via the harness: .claude/launch.json config "v3-ui" (repointed at apps/v2-ui)
```

`apps/v2-ui/.env.local`:
```
NEXT_PUBLIC_API_BASE=/api
DIALECTICAL_API_BASE=http://127.0.0.1:8790
```

Live URL proven this session:
`http://localhost:3000/debate/ccef6817-05bb-436d-8c5e-a79c051c010b`
(answer of run `8d2b4e5a-c55c-46c4-bb10-8d59f21f28fb`, token `v-dev`).

---

## 2. Inventory — every file this ticket touched

Everything else under `apps/v2-ui` is byte-identical to V's copy (verifiable by
mtime: V's copy landed at 12:31 local, every UI-01 write is 13:01 or later).

| File | New? | What changed |
|---|---|---|
| `package.json` | — | renamed `dialectical-engine-v2ui` (name collided with `web`), `type: module`, `@debateai/contract` + `@debateai/kernel` workspace deps |
| `next.config.mjs` | — | `transpilePackages` for contract+kernel, webpack `extensionAlias` so `.js` specifiers resolve to `.ts` |
| `.env.local` | new | same-origin `/api`, server-only upstream base |
| `app/api/[...path]/route.ts` | — | ported ACC-01 rev-3 proxy: faithful method/path/query/body/token forwarding, SSE-safe body passthrough, loud `DIALECTICAL_API_BASE_REQUIRED` |
| `app/api/[...path]/route.test.mjs`, `app/api/proxyHeaders.source-test.mjs` | — | V2 fixtures retargeted; the ENFORCED copies live in root vitest (see §4) |
| `lib/serverApi.ts` | — | SSR reads on the contract client; `USER_TOKEN_COOKIE` per the S14-proven name; upstream base REQUIRED (no silent default) |
| `lib/api.ts` | — | browser reads on the contract client; same-origin guard; ask builder; typed absences; loud rejections for V2-only mutations |
| `lib/v3/adapter.ts` | new | AC-59 adapter: generated contract types → V2 view models |
| `lib/v3/labels.ts` | new | all 23 condition marks, abstention kinds, freshness summary |
| `lib/v3/liveEvents.ts` | new | V3 run-event stream → V2's live vocabulary |
| `lib/scoringStatusCopy.ts` | — | **one additive branch** (see §6 defect 1) |
| `app/page.tsx` | — | library reads the asker-scoped answer index |
| `app/debate/[id]/page.tsx` | — | SSR reads answer-or-run projection with the identity cookie |
| `app/debate/[id]/DebatePageGate.tsx` | new | wraps the workspace in V2's own `AuthGate` (S05 needs an identity) |
| `app/debate/[id]/DebatePageClient.tsx` | — | data-access swap only (see §3) |
| `app/new/page.tsx` | — | the seven V3 ask fields + submit gate |
| `app/settings/page.tsx` | — | deployment projection, read-only, money as typed absence |
| `app/admin/workers/page.tsx` | — | fleet via deployment; tallies gated on a successful read (see §6 defect 2) |
| `components/AnswerHonestyDrawer.tsx` | new | additive; the S14 honesty surface re-housed in V2's drawer design |
| `components/NodeDetailDrawer.tsx` | — | one additive `<section>`; V2's own markup untouched |

Root repo: `tests/support/v2uiFixtures.ts` + five enforced suites (§4);
`.claude/launch.json` repointed from `web` to `apps/v2-ui` so :3000 serves the
restored app.

---

## 3. Component-by-component survival

**Kept whole, never opened (20 components + globals.css + layout.tsx):**
`ArgumentFocusView`, `AuthGate`, `ChallengePopover`, `DebateCanvas`,
`DebateMap`, `DebateOutline`, `DebateSplit`, `DebateThread`, `DebateTree`,
`DebateWorkspaceDrawer`, `GuideModal`, `InvestigationDrawer`,
`LibraryComposer`, `ModelPresentation`, `RecommendedInvestigations`,
`ScoringErrorBoundary`, `SynthesisPanel`, `Toast`, `TopBar`, `VerdictBanner`;
plus `lib/debatePresentation.ts`, `debateTreeUtils.ts`, `format.ts`,
`models.ts`, `recommendation.ts`, `scoringFormat.ts`, `scoringResponse.ts`,
`scrutiny.ts`, `scrutinyDepth.ts`, `types.ts`, `observability/*`.

**Minimally changed, with reason:**

| Component | Change | Why it was unavoidable |
|---|---|---|
| `DebatePageClient` | data access only: `getDebate` → `getDebateBundle`; V2's coordinator `EventSource` → `contractClient.streamEvents` | EventSource cannot carry `x-user-dev-token`, and every V3 read is asker-scoped (S05). V3 event names differ entirely, so the translation is a pure module (`lib/v3/liveEvents.ts`) feeding V2's existing handlers. |
| `DebatePageClient` | `exportUrl` (`/export.md`) → `exportHref` (answer + ledger + live honesty JSON) | V3 serves no markdown export resource. Refusing to fabricate one, the export is the S14 shape. |
| `DebatePageClient` | added `◈ Honesty` button + `AnswerHonestyDrawer` mount | The ticket's non-regression law: V3's honesty must remain visible somewhere. Occupies roughly V2's own `◫ Workspace` slot (which this run does not populate). **Header cost measured — see Q2.** |
| `DebatePageClient` | `structured` verdict mode also when `strongestPro` is blank | V3 supplies no strongest-pro/strongest-con projections. Without this the panel shows two stance cards stuck on "Pending" forever — a fabricated promise. Falls back to V2's own verdict-led mode. |
| `DebatePageClient` | live composition prose used as the synthesis fallback | V3 streams plain prose, never V2's JSON envelope; the JSON field probes find nothing and would show blank. |
| `NodeDetailDrawer` | one additive `<section className="drawerScoringRationale" aria-label="V3 node honesty">`, one optional `v3?: ContractNode` prop | V2's drawer has no slot for way-of-knowing, labeled base/final strength, replay handles, stranger-restatement status, defeater refs, judge disagreement, per-node marks. Nothing existing was altered or removed. |
| `lib/scoringStatusCopy.ts` | one additive branch delegating to `v3ScoringStatusLabel` | DR-115 defect found live — see §6. Every non-V3 reason keeps V2's original copy verbatim, including the `"Scoring check failed: Model unavailable"` case V2's own test asserts. |
| `app/settings/page.tsx` | rewritten body, V2 vocabulary kept (`modelTable`/`modelRow`/`roleChips`/`capInput`-slot/`cardRow`/`miniCard`/`fieldGroup`) | V2's settings resource does not exist in V3; the page now reports the deployment model ledger. Write affordances removed rather than offered-and-refused (deployment config is register-governed). |
| `app/new/page.tsx` | seven ask fields in a V2 `optionsPanel`; submit gate extended; V2-only knobs no longer packed into the ask | The V3 ask REQUIRES those seven explicitly. Previous session left the state declared but unbound, so every submit was a guaranteed `ASK_FIELD_REQUIRED`. |
| `app/admin/workers/page.tsx` | tallies + roster count + empty state gated on a successful read | DR-115 defect found live — see §6. |

**Nothing was dropped.** Canvas, thread, split, tree, map, outline, focus view,
synthesis panel, challenge popover, investigation drawer, workspace drawer,
guide and toasts all mount unchanged.

---

## 4. TDD — RED before GREEN, real output

Proxy tests sit in the ENFORCED root vitest suite, per the rev-3 advisory that
`node --test` with a `[...]` path glob silently runs zero tests and exits 0.

**Suites:** `tests/unit/v2ui-proxy.test.ts`, `v2ui-data-layer.test.ts`,
`v2ui-ownership.test.ts`, `v2ui-live-events.test.ts`, `v2ui-pages.test.ts`
→ **52 passed (5 files)**.

### RED 1 — settings projection (this session)

```
 × tests/unit/v2ui-data-layer.test.ts > ... > projects the deployment model ledger onto V2's settings view, with typed absence for money 3ms
   → expected undefined to be 7 // Object.is equality
 × tests/unit/v2ui-data-layer.test.ts > ... > keeps a model visible twice when the ledger routes two different versions of it 0ms
   → Cannot read properties of undefined (reading 'map')

 Test Files  1 failed (1)
      Tests  2 failed | 24 passed (26)
```

### RED 2 — `/new` never collected the required ask fields

```
 ❯ tests/unit/v2ui-pages.test.ts:39:21
     expect(newPage).toMatch(new RegExp(`value=\{${field.state}\}`));

 FAIL  ... > gates the submit button on every required ask field, not just the topic
AssertionError: expected 'const ready = topic.trim().length > 6…' to contain 'riskTier'

 Test Files  1 failed (1)
      Tests  8 failed | 4 passed (12)
```

### GREEN — after implementation

```
 Test Files  5 passed (5)
      Tests  52 passed (52)
```

S05 ownership, through the real route + real client + scoped stub upstream:

```
 ✓ tests/unit/v2ui-ownership.test.ts > S05 ownership through the restored V2 data layer > serves the owner their own debate (200 path) 14ms
 ✓ tests/unit/v2ui-ownership.test.ts > S05 ownership through the restored V2 data layer > refuses a foreign asker with NOT_FOUND on both the answer and run projections (404 path) 4ms
 ✓ tests/unit/v2ui-ownership.test.ts > S05 ownership through the restored V2 data layer > refuses an anonymous read with SESSION_REQUIRED (401 path) 3ms
```

---

## 5. Gates

```
===== ROOT TYPECHECK =====
ROOT TYPECHECK: PASS
===== v2-ui TYPECHECK =====
V2UI TYPECHECK: PASS

===== FULL VITEST =====
 Test Files  57 passed (57)
      Tests  376 passed (376)
   Duration  19.53s

===== AUDIT architecture =====
{ "edgeRowsChecked": 27, "violations": [] }
===== AUDIT source =====
{ "blocking": [] }

===== V2-UI BUILD =====
Route (app)                                 Size  First Load JS
┌ ƒ /                                      852 B         136 kB
├ ○ /_not-found                            988 B         103 kB
├ ○ /admin/workers                       2.24 kB         134 kB
├ ƒ /api/[...path]                         120 B         102 kB
├ ƒ /debate/[id]                         34.7 kB         170 kB
├ ○ /icon.svg                                0 B            0 B
├ ○ /new                                 3.29 kB         135 kB
└ ○ /settings                            2.49 kB         134 kB
```

The root `pnpm run build` (contract + typecheck + `web`) is also green; `web/`
is untouched and still builds, per "do not delete web/".

One `orphan-audit orphans` advisory is pre-existing and unrelated
(`FX-ORPH-06`, dead-cost indictment lane wired as advisory).

---

## 6. Two DR-115 defects found LIVE and fixed

Both were found by reading the running app's DOM, not by a failing test; the
DOM readout below is the RED evidence, and each is now covered by a test.

### Defect 1 — a typed absence reported as a failed check

V2's copy prefixed EVERY `unavailable` reason with "Scoring check failed",
asserting a check V3 never runs, and dumped the full 200-character reason into
the top bar:

```json
"statuses": [
 "Scoring check failed: V3 serves judge-informed strength on the answer graph itself (base score and final strength per node, visible in the Honesty drawer); the V2 per-node scoring endpoint does not exist in V3.",
 "Model-assisted reasoning aid, not a truth verdict."
]
```

Fix: the rule lives in the V3 layer (`v3ScoringStatusLabel` in
`lib/v3/adapter.ts`) and `formatScoringStatusCopy` consults it before its
failure branch. V2's failure copy is untouched for reasons that ARE failures.
After:

```json
"statuses": ["Components-only serve: prose withheld", "Scoring unavailable", "Model-assisted reasoning aid, not a truth verdict."]
```

Side benefit: the debate title reclaimed width — `claimW` 231→327px, `titleW`
107→194px at 1600px. The full reason still shows in the scoring-insights strip.

### Defect 2 — counting a fleet we could not read

`/admin/workers` printed `Online 0 / Degraded 0 / Offline 0 / Capabilities 0`,
`0 total` and "No workers registered." — five statements of fact — directly
beside a loud `NO_TYPED_FLEET_SOURCE` refusal to supply that fact. Now:

```json
{"tiles":["Online—","Degraded—","Offline—","Capabilities—","Refreshed—"],
 "count":"— total",
 "empty":"The fleet roster could not be read; worker count is unknown.",
 "error":"NO_TYPED_FLEET_SOURCE: the deployment declares no typed fleet source (NO_TYPED_F…"}
```

### Defect 3 — the proxy route did not typecheck under the root program

`route.ts` passed `body: undefined` for bodyless methods, which
`exactOptionalPropertyTypes` rejects. The two init shapes are now built
separately. (Latent: the previous session's "root typecheck GREEN" predated
the proxy test that pulls the route into the root program.)

---

## 7. Honesty-surface survival vs S14

S14's inventory is `web/app/debate/[id]/DebatePageClient.tsx` +
`DebateWorkspaceDrawer` + `VerdictBanner` + `NodeDetailDrawer`. Every row below
was checked LIVE against FAIR-01, not just in source.

| S14 surface | Restored where | Live evidence |
|---|---|---|
| Export answer + honesty + ledger | Honesty drawer → Export; top-bar `↓ Export` | `download="ccef6817-…-v1.json"`, href 37,424 chars |
| Refresh current state | V2's own replay/refresh + stream-driven refresh | — |
| risk tier · staleness · run/serve phase | Honesty drawer → Answer state | `Risk tier standard · ASKER · acceptance:cli-default`; `freshness FRESH`; `Live stream: run terminal · serve idle` |
| Verdict / unavailable / confidence band / band ceiling | Honesty drawer → Verdict | `Verdict unavailable · serve-gate:COMPONENTS_ONLY_DEFECT` |
| COMPONENTS_ONLY notice | Honesty drawer + SynthesisPanel verdict | "Components only: composed prose was not cleared to serve…" |
| Composed text / "What is true" | SynthesisPanel (V2's own) | rendered |
| Value hinges + reversal point | Honesty drawer → Value hinges / What would reverse this | section present |
| Graph (nodes + edges + live lifecycle) | **V2's DebateCanvas** | ROOT_CLAIM + REASONING + CON defeater, attack edge drawn |
| Live graph connections (placeholder edges) | Honesty drawer → Graph edges | `attack 708ac112… → 3b4c2b13… NODE placeholder strength unknown · NO_JUDGEMENT_OR_MAGNITUDE` |
| Cycle refusals | Honesty drawer → Cycle refusals | conditional; none in this run |
| Investigate deeper (gaps, prompts, verbatim input, record) | Honesty drawer → Investigate deeper | conditional; none in this run |
| Freshness + conformance | Honesty drawer → Answer state / Per-item freshness | `CONFORMANCE FAIL`; `All 2 graph items: FRESH` |
| **All 23 condition marks** incl. OWED-CHECK-UNEXECUTED, UNRESOLVED-TYPE-FALLBACK | `lib/v3/labels.ts` (exhaustive over `CONDITION_MARKS`, test-enforced) | chips rendered: `Defect: components-only answer`, `Owed check not executed at completion`, `Question type unresolved; fallback served` + per-record DR-139(4) lines |
| Named condition-mark records | Honesty drawer → Condition marks | `DR-139(4): Q10 is ACTIVE at run completion and its owed check has no recorded execution` (×N) |
| Abstention kinds | Honesty drawer → Abstention; NodeDetailDrawer | conditional; none in this run |
| Cost envelope | Honesty drawer → Cost envelope | `WITHIN · 2 model attempts consumed · budget tier low · Protected core: NEVER_SKIPPABLE · Basis {source_ref acceptance:DR-138:V-approved …}` |
| Numbers + replay handles | Honesty drawer → Numbers and replay | `0.93 · 1fe8a547-… · replay replay:8d2b4e5a-…:3b4c2b13-…` |
| Authorized inspection ("show me why") | Honesty drawer → Authorized inspection | `Handle: inspection:ccef6817-…` |
| Execution ledger digest | Honesty drawer → Execution ledger digest | `Handle: ledger:8d2b4e5a-…`, `12 executed ledger entries`, work items with ERROR/MISSING_COMPLETED_ITEM |
| Memory disclosure + unlink | Honesty drawer → Builds on a previous answer | section present |
| Per-node honesty (base/final strength, restatement, defeaters, disagreement) | NodeDetailDrawer → V3 honesty | `BASE SCORE 0.93`, `FINAL STRENGTH 0.93`, `STRANGER RESTATEMENT PASS`, `DEFEATERS 708ac112-…`, `JUDGE DISAGREEMENT {"kind":"NOT_MEASURED","reason":"SINGLE_JUDGE_WALKING_SKE…` |

**No honesty regression.** The restored drawer additionally surfaces badges,
residual objections, shadow suppressions, per-edge strength slots, register
row keys/versions and full ledger entries, which S14 did not show.

---

## 8. Deferrals (acknowledged, not hidden)

1. **V2 controls the V3 ask cannot carry** — depth mode, depth of scrutiny,
   branching width, concurrency, max tokens, role overrides. They remain on
   screen (design authority) with an on-screen line naming them as not sent.
   Only tree depth reaches `depth_params.depth`. Wiring any of them needs a
   ruled mapping, not an invented one.
2. **`steering_presets` / `steering_annotations`** are real optional ask
   fields with no V2 control; they go out empty. A "Steering" field is a small
   additive follow-up if V wants it.
3. **V2-only mutations** — `regenerateNode`, `nodeGenerations`,
   `submitScoringFeedback`, adaptive-depth approval, `saveSettings` — all
   reject loudly with a named `V3_HAS_NO_*` error. Their V2 buttons still
   render (e.g. `↻ Regenerate` in the node drawer) and surface the refusal
   rather than fabricating success. Hiding them is a design call for V.
4. **`app/**/*.source-test.mjs` and `lib/*.test.mjs`** (V2's own dormant
   fixtures) are not executed: `package.json`'s `test` script points at
   `scripts/run-node-tests.mjs`, which V's snapshot does not include. The
   UI-01 assertions all live in the enforced root vitest suite instead.
5. **Root `pnpm run build` still builds `web`, not `apps/v2-ui`.** Left alone
   deliberately — which app ships is V's call, and `web/` must not be deleted
   yet. `.claude/launch.json` now serves `apps/v2-ui` on :3000.
6. DR-121 unchanged: no Docker, no Hatchet.

---

## QUESTIONS FOR V

**Q1 — the copied UI is one V2 commit behind on the canvas viewport.**
`apps/v2-ui` predates `a97a515 feat(web): add hard-pinch canvas viewport`, so
`CanvasViewport.tsx` and `lib/canvasViewport.ts` are ABSENT from it, and its
`DebateCanvas.tsx` differs from the repo-root V2 by 117 diff lines. DR-145
named "canvas + viewport" among the surfaces that must survive. I did NOT
import them: they are not drop-in compatible with the older canvas, and
pulling files from a different snapshot would redesign the component you made
authoritative. **Do you want the newer V2 snapshot re-copied, or is the copy
in the tree the intended design?** (Its `globals.css` matches no commit in this
repo's history, so it came from outside this repo — worth knowing which
snapshot is canonical before Grok reviews the surface.)

**Q2 — the debate top bar is over-subscribed at 1280px.**
Measured at 1280×800 with the full action set: `.debateTopActions` = 910px,
leaving the debate title `claimW` = 34px (effectively invisible). Hiding the
`◈ Honesty` button alone restores it to 127px. At 1600px the title gets 194px.
This is mostly V2's own flex behaviour — `.debateTopActions` refuses to shrink
below its buttons' min-content while `.debateTopClaim` has `min-width: 0` — and
V's snapshot has no responsive overflow menu (the newer V2 in Q1 does: it added
`.debateOverflow`, which V's copy's CSS does not define). I did not redesign
your header. **Options: (a) leave as is, (b) move Honesty into a `⋯` overflow,
(c) re-copy the newer V2 top bar per Q1.**

**Q3 — the acceptance deployment routes no models.**
`/settings` honestly renders "This deployment routes no models." because
`deployment.model_ledger` is empty, and `/admin/workers` refuses with
`NO_TYPED_FLEET_SOURCE`. Both are correct typed absences, but they mean the
settings screen shows V no maker lineage at all. **Should the acceptance seed
carry model-ledger rows (which would also make DR-137's honest maker count
visible in the UI), or is an empty ledger the intended acceptance state?**

**Q4 — V2 affordances with no V3 counterpart** (deferral 3). Keep them visible
and loudly refusing, or hide them until V3 grows the resource?

---

## Next

`sqlite3 … UPDATE tasks SET status='review'` + comment
`READY FOR PEER REVIEW — UI-01`. Grok reviews (DR-140); then the orchestrator's
browser check and V's eye — this is also the S14 visual-gate retake (DR-145).

---

# ADDENDUM — rework round 1 (Grok rev-1 BLOCKING, same-session law)

Review: `reviews/grok-ui01-rev1.md` — CHANGES REQUESTED, one BLOCKING finding.
Grok's read was correct; the finding is fixed below. Advisories 2–5 were
directed as carry-forwards and are **not** touched this round.

## The finding, restated honestly

S14 gated the export affordance on the answer **and** the execution-ledger
digest (`web/app/debate/[id]/DebatePageClient.tsx:109`:
`answer === null || ledgerDigest === null ? null : …`). The restored surface
gated on the answer alone, which produced three overclaims at once:

1. `DebatePageClient.tsx:713-726` — `exportHref` non-null whenever
   `answer !== null`, so the affordance appeared with
   `execution_ledger_digest: null` in the payload.
2. `DebatePageClient.tsx:1166` — the toast always said
   `"Exported answer + honesty + ledger"` regardless of what was in the file.
3. `AnswerHonestyDrawer.tsx:476` — the copy promised the export "becomes
   available once the ledger digest loads", but `:467` only checked
   `exportHref !== null`, so that sentence never actually governed anything.

This is the honesty-regression class the ticket forbids: the label is part of
the honesty surface, not decoration. It is also a *deeper* bug than the export
gate alone — the drawer sentence is false in a second way, because a digest
read that **refused** will never load, and the copy promised a load anyway.

## Reproduce first — RED

Two RED suites, both against the shipped tree.

**RED (a) — the decision did not exist** (`tests/unit/v2ui-export.test.ts`):

```
 ❯ tests/unit/v2ui-export.test.ts:3:1
      3| import { buildAnswerExport } from "../../apps/v2-ui/lib/v3/answerExpor…
       | ^
Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }

 Test Files  1 failed (1)
      Tests  no tests
```

**RED (b) — the shipped surfaces overclaimed** (`tests/unit/v2ui-pages.test.ts`):

```
 × v2-ui export never claims a ledger it does not carry (S14 dual gate) > builds the export through one decision that both surfaces share 5ms
 × v2-ui export never claims a ledger it does not carry (S14 dual gate) > hangs the top-bar Export affordance and its toast off that decision 4ms
 × v2-ui export never claims a ledger it does not carry (S14 dual gate) > never hardcodes the '+ ledger' claim in either surface's label 2ms
   → DebatePageClient hardcodes the ledger claim: expected [ Array(1) ] to deeply equal []
 × v2-ui export never claims a ledger it does not carry (S14 dual gate) > states WHY the export is missing instead of always blaming a pending load 1ms
   → expected '"use client";\n\nimport type { Answer…' not to contain 'Export becomes available once the led…'

 Test Files  1 failed (1)
      Tests  4 failed | 14 passed (18)
```

## The fix — one decision, two consumers

New `apps/v2-ui/lib/v3/answerExport.ts` (pure, root-testable) holds S14's dual
gate as a single typed result:

| State | Result | What the user sees |
|---|---|---|
| no answer | `{ available: false, reason: "NO_SERVED_ANSWER" }` | no affordance; "Nothing to export yet: no answer has been served for this run." |
| answer, digest still loading | `{ available: false, reason: "LEDGER_DIGEST_PENDING" }` | no affordance; "Export withheld until the execution-ledger digest has been read; it is still loading." |
| answer, digest read refused | `{ available: false, reason: "LEDGER_DIGEST_UNREADABLE" }` | no affordance; "Export withheld: the execution-ledger digest could not be read (`<code>`). An export without it would not carry the executed ledger this download names." |
| answer + digest | `{ available: true, href, filename, label, toast }` | affordance, and only now the "+ ledger" claim |

`DebatePageClient` and `AnswerHonestyDrawer` both read that one result — the
affordance, its `download` name, its toast and the explanatory copy all come
from it. The claim string exists in exactly one place (`EXPORT_LABEL` /
`EXPORT_TOAST`), so the button and the bytes cannot drift apart again. The
`exportHref: string | null` prop became `answerExport: AnswerExport`.

Rejected alternative: re-adding `|| ledgerDigest === null` to the memo and
leaving the two copy strings hand-maintained. That restores the gate but not
the reason the copy drifted — the drawer sentence would still be false on a
refused read.

## GREEN

```
 ✓ tests/unit/v2ui-export.test.ts > UI-01 export decision — S14's dual gate, restored once > withholds the export while the ledger digest has not arrived 1ms
 ✓ tests/unit/v2ui-export.test.ts > UI-01 export decision — S14's dual gate, restored once > says the export will never arrive when the digest read refused 0ms
 ✓ tests/unit/v2ui-export.test.ts > UI-01 export decision — S14's dual gate, restored once > withholds the export when no answer has been served yet 0ms
 ✓ tests/unit/v2ui-export.test.ts > UI-01 export decision — S14's dual gate, restored once > offers the export — and only then claims the ledger — once both are present 1ms
 ✓ tests/unit/v2ui-export.test.ts > UI-01 export decision — S14's dual gate, restored once > keeps the S14 payload shape byte-comparable for the answer and digest 0ms

 Test Files  2 passed (2)
      Tests  23 passed (23)          # v2ui-pages (18) + v2ui-export (5)
```

Grep proof that the claim has one home:

```
$ grep -n "answer + honesty + ledger\|ledger digest loads" DebatePageClient.tsx AnswerHonestyDrawer.tsx
NONE — both surfaces read the decision
$ grep -n "EXPORT_LABEL\|EXPORT_TOAST" apps/v2-ui/lib/v3/answerExport.ts
43:const EXPORT_LABEL = "Export answer + honesty + ledger";
44:const EXPORT_TOAST = "Exported answer + honesty + ledger";
```

## Gates re-run (rework round 1)

```
===== ROOT TYPECHECK =====
ROOT TYPECHECK: PASS
===== v2-ui TYPECHECK =====
V2UI TYPECHECK: PASS
===== FULL VITEST =====
 Test Files  58 passed (58)
      Tests  385 passed (385)
   Duration  19.66s
===== AUDIT architecture =====
{ "edgeRowsChecked": 27, "violations": [] }
===== AUDIT source =====
{ "blocking": [] }
===== V2-UI BUILD =====
├ ƒ /debate/[id]                         34.9 kB         170 kB   (7/7 routes)
```

(One test file and 9 tests up from rev-1's 57/376: the new export suite.)

A root-typecheck catch worth recording: the first version of the digest test
fixture invented `answer_ref` and `status: "COMPLETED"`. The contract rejected
it (`Type '"COMPLETED"' is not assignable to type '"ERROR" | "PENDING" | "READY"'`),
so the fixture is now shaped from the **real** acceptance digest for run
`8d2b4e5a` — an invented fixture would have been the same class of defect the
ticket is about.

## Live re-verification

`http://localhost:3000/debate/ccef6817-05bb-436d-8c5e-a79c051c010b`, FAIR-01,
digest present:

```json
{"drawerExport": "Export↓ Export answer + honesty + ledger",
 "drawerDownload": "ccef6817-05bb-436d-8c5e-a79c051c010b-v1.json",
 "topBarExport": [{"txt":"↓ Export","title":"Export answer + honesty + ledger",
                   "dl":"ccef6817-05bb-436d-8c5e-a79c051c010b-v1.json"}],
 "payloadKeys": ["answer","execution_ledger_digest","live_honesty"],
 "digestEntries": 12}
```

The claim is now true of the bytes: 12 real ledger entries in the payload.

**Stated plainly:** the three WITHHELD states are proven by the behavioural
suite, not live. In the acceptance stack the digest always resolves, and the
loading window closes faster than the browser tool can sample it; I did not
manufacture a fake failure to produce a screenshot. If the reviewer wants a
live withheld capture, blocking `/api/v1/answers/*/ledger-digest` at the proxy
would produce the `LEDGER_DIGEST_UNREADABLE` copy — say the word and I will do
it rather than leave it asserted.

## Carry-forwards NOT touched this round (per the directive)

Grok advisories 2–5, unchanged and still open: fleet per-field typed absence
when the roster is `AVAILABLE` (`adapter.ts` `capabilities: []` /
`last_seen: ""` / `current_job_id: null`); V2-only mutations visible-but-
refused (= Q4 for V); root build still shipping `web/` (V's cutover call);
dormant `apps/v2-ui` `node --test` fixtures.

## Run instructions — stale `.next` cache (orchestrator note)

**If :3000 renders a black screen with a webpack error like
`Cannot find module './vendor-chunks/…'`, that is a STALE
`apps/v2-ui/.next` cache built before the dependency rewiring — not a code
defect.** Clear it and restart:

```bash
rm -rf DebateAI-V3/apps/v2-ui/.next
pnpm --filter dialectical-engine-v2ui dev
```

The orchestrator hit exactly this, cleared it, and the page then rendered V2's
Tree canvas correctly (ROOT CLAIM → REASONING → CON with the attack edge,
Synthesis panel, Honesty/Replay/Export chrome).
