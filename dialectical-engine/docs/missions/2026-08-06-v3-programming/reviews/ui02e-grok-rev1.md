# UI-02e dual-diamond review — Grok lens (rev1)

**Ticket:** `t_c75654bd` (`review`) · **Board:** `debateai-v3`  
**Author claims (hypothesis only):** Codex handoff `handoffs/UI-02e-codex-handoff.md` / goal packet `goal-packets/UI-02e-codex-goal.md`  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev1)  
**Date:** 2026-08-13  
**Scope law:** TESTS ONLY — real `DebateCanvas` rendered pin under `tests/render/`; no product deliverable; dual diamond DR-153.

**Inputs verified against shipped source (not handoff trust):**  
`tests/render/ui02e-debate-canvas.test.tsx` (three real-render pins),  
`apps/v2-ui/components/DebateCanvas.tsx` (empty L344 + contentful L376 `ModelMetaLine maker={node.maker}`, L387 `V3ScoreBadges` JSX, local `V3ScoreBadges` ABSENT branch L548–557),  
`apps/v2-ui/components/ModelPresentation.tsx` (`ModelMetaLine` / `ModelBadge`),  
`apps/v2-ui/lib/v3/adapter.ts` (`v3ScorePercentage` / `v3ScoreAbsenceCopy` → `BASE`/`FINAL` / `NO SCORE`),  
`tests/support/v2uiFixtures.ts` (`buildFairShapedAnswer` → 0.62 / 0.41 / `OpenAI` / `gpt-5`),  
root `vitest.config.ts` `include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`,  
ticket body + comments, goal packet, Codex handoff + progress log.

**Mode:** read-only product tree except temporary serial mutation probes (five named ledger mutations). Each applied alone, observed RED, **fully restored** (byte-identical SHA `60a3b15e…71a14dad` pre/post). No git mutations, no board mutations. Did **not** read any peer Opus UI-02e verdict.

## Verdict

**APPROVED**

All packet gates hold on shipped source plus independent mutation / collection / scope evidence re-run this seat. The real `DebateCanvas` gate surface is rendered under the enforced root Vitest render layer; maker identity is load-bearing on **both** call sites (empty-state L344 and contentful L376); score badges (`BASE 62%` / `FINAL 41%` + `data-v3-score` attrs) are load-bearing; typed maker/score absence pills stay visible (two `House unavailable` + `NO SCORE` with explanation). Five named production mutations go RED when applied alone and GREEN after restore. UI-02e durable inventory is tests + mission handoff/progress only — no product file is this ticket’s deliverable. Residual notes below are **ADVISORY** only (ledger count imprecision on one mutation; shared dirty tree attribution).

---

## Decision table (gates)

| # | Gate | Result | Source / mutation proof |
|---|---|---|---|
| **1** | Maker identity on BOTH call sites (empty L344 + contentful L376) | **PASS** | Real render asserts exactly two `OpenAI · GPT · gpt-5` strings and two `data-maker="OpenAI"` attrs, plus empty-state text and contentful claim. This seat: drop `maker={node.maker}` empty-only → maker test **RED** (2→1), 1 failed / 2 passed. Drop contentful-only → maker test **RED** (2→1); also absence collateral RED (see A1). Both restored. |
| **2** | Score badges (`V3ScoreBadges` percentage text / attributes) | **PASS** | Render asserts `BASE 62%`, `FINAL 41%`, `data-v3-score="base_score"`, `data-v3-score="final_strength"`. Fixture numbers `0.62`/`0.41` via `v3ScorePercentage`. This seat: delete L387 `V3ScoreBadges` JSX → score test **RED** (missing `BASE 62%`) **and** absence **RED** (missing `NO SCORE`); 2 failed / 1 passed. Restored. |
| **3** | Typed-absence pills (maker + score) do not collapse to silence | **PASS** | Typed-absence card (`maker: null`, no generation, no V3 scores) requires two `>House unavailable</span>`, matching `aria-label`, `NO SCORE`, and explanation. This seat: suppress contentful `ModelMetaLine` when `maker === null` → absence **RED** (2→1 House unavailable); 1 failed / 2 passed. Silence ABSENT branch (`return null`) → absence **RED** (missing `NO SCORE`); 1 failed / 2 passed. Restored. |
| **4** | Assertion-to-mutation ledger load-bearing | **PASS** | All five named mutations kill focused suite; post-restore **3/3 GREEN**. Ledger maps hold directionally; MUT2 collateral count differs from handoff (A1) without weakening the dual-call-site pin. |
| **5** | `vitest list` collection under enforced `tests/render/` | **PASS** | Root include collects `tests/**/*.test.tsx`. This seat: `npx vitest list tests/render/ui02e-debate-canvas.test.tsx` enumerates all **three** named UI-02e tests. Focused run **3 passed / 3**. |
| **6** | Scope law — NO durable product change from UI-02e | **PASS** | Claimed inventory: `tests/render/ui02e-debate-canvas.test.tsx` + `handoffs/UI-02e-codex-handoff.md` + `handoffs/UI-02e-progress.log` (progress gitignored by `*.log`). Product `DebateCanvas.tsx` is dirty vs HEAD from **prior** mission lanes; UI-02e does not claim it. This seat’s probes restored byte-identical to pre-probe SHA. No product mutation described as required for the clone-isolated lens. |

---

### Gate 1 — dual maker call sites

Shipped JSX (both still present after UI-02e):

```tsx
// empty-state (~L342–347)
{generation || node.maker !== undefined ? (
  <div className="metaLine" style={{ marginTop: 5 }}>
    <ModelMetaLine modelId={generation?.model_id ?? null} maker={node.maker} />
    {generation ? " conceded" : null}
  </div>
) : null}

// contentful header (~L375–377)
{generation || node.maker !== undefined ? (
  <ModelMetaLine modelId={generation?.model_id ?? null} maker={node.maker} />
) : null}
```

Fixture: scored card + empty card both carry `maker: "OpenAI"` / `model_id: "gpt-5"` → identity `OpenAI · GPT · gpt-5` via the shared `makerIdentityLabel` seam (UI-02d). Cardinality assertion `toHaveLength(2)` is what makes **each** call site independently load-bearing — the historical hole (empty-only drop left the suite green) is closed.

| Mutation (this seat) | RED observation |
|---|---|
| Drop empty `maker={node.maker}` only | maker: expected 2 identities, got 1 · **1 failed / 2 passed** |
| Drop contentful `maker={node.maker}` only | maker: expected 2, got 1 **and** absence: House unavailable 2→1 · **2 failed / 1 passed** |

Handoff claimed contentful drop as 1 failed / 2 passed; independent re-probe sees stronger RED (see A1). Primary dual-site assertion still kills both drops.

### Gate 2 — V3 score badges

```tsx
{v3Scores ? (
  <V3ScoreBadges node={node} presentation={v3Scores} openNodeDetails={openNodeDetails} />
) : null}
// PRESENT branch paints badge.pillText + data-v3-score={badge.id}
```

| Check | Observation |
|---|---|
| Fixture numbers | `base_score: 0.62` → `BASE 62%`; `final_strength: 0.41` → `FINAL 41%` |
| Delete JSX site | score + absence RED (badges and NO SCORE both gone) |
| Formatter ownership | `v3ScorePercentage` / labeled badges in `adapter.ts` — pre-existing; not UI-02e product delta |

### Gate 3 — typed absence

Typed-absence card: `maker: null`, `active_generation: null`, no recorded V3 scores → contentful `ModelMetaLine` still mounts because `node.maker !== undefined` (null ≠ undefined), plus reviewer `ModelBadge` with null lineage, plus `V3ScoreBadges` ABSENT pill.

```tsx
// V3ScoreBadges ABSENT (~L548–557)
if (presentation.status === "ABSENT") {
  return (
    <span className="scoreBadge unavailable" …>
      {presentation.badge.pillText}  // "NO SCORE"
    </span>
  );
}
```

| Mutation | RED |
|---|---|
| Contentful condition requires non-null maker | absence: House unavailable 2→1 |
| ABSENT branch returns `null` | absence: missing `NO SCORE` |

### Gate 4 — ledger (this seat)

| Mutation | Assertion that killed it | Observed RED |
|---|---|---|
| Remove empty-state `maker={node.maker}` | Dual identity / `data-maker` cardinality | **1 failed / 2 passed** (maker) — matches handoff |
| Remove contentful `maker={node.maker}` | Dual identity / `data-maker` cardinality (+ absence collateral) | **2 failed / 1 passed** (maker + absence) — handoff said 1/3 |
| Delete `V3ScoreBadges` JSX | `BASE 62%` / `FINAL 41%` / attrs (+ `NO SCORE`) | **2 failed / 1 passed** — matches handoff |
| Suppress contentful `ModelMetaLine` when maker is `null` | Two `House unavailable` on absence card | **1 failed / 2 passed** — matches handoff |
| `return null` from ABSENT branch | `NO SCORE` + explanation | **1 failed / 2 passed** — matches handoff |

Post-restore:

```text
$ npx vitest run tests/render/ui02e-debate-canvas.test.tsx --reporter=verbose
Test Files  1 passed (1)
Tests       3 passed (3)
BYTE_IDENTICAL_RESTORE=yes
SHA=60a3b15ebdcc1f0999215dd54d7f765bb936d04f75e814d93178484571a14dad
```

### Gate 5 — collection

```text
$ npx vitest list tests/render/ui02e-debate-canvas.test.tsx
tests/render/ui02e-debate-canvas.test.tsx > UI-02e renders the real DebateCanvas gate surface > pins maker identity at both the empty-state and contentful-card call sites
tests/render/ui02e-debate-canvas.test.tsx > UI-02e renders the real DebateCanvas gate surface > pins V3 score badges as rendered percentage text
tests/render/ui02e-debate-canvas.test.tsx > UI-02e renders the real DebateCanvas gate surface > keeps typed maker and score absence visible instead of collapsing to silence
```

File lives under the enforced render root; not a dead runner.

### Gate 6 — scope / product dirt attribution

| Path | UI-02e ownership |
|---|---|
| `tests/render/ui02e-debate-canvas.test.tsx` | **Yes** — only executable change |
| `handoffs/UI-02e-codex-handoff.md` | **Yes** — evidence handoff |
| `handoffs/UI-02e-progress.log` | **Yes** — required log (gitignored `*.log`) |
| `apps/v2-ui/components/DebateCanvas.tsx` | **No** — dirty vs HEAD from prior lanes; final behavior has both maker props, V3ScoreBadges site, ABSENT pill; this seat left it byte-identical to pre-probe |
| Other `apps/v2-ui/**` dirt | **No** — prior lanes (UI-02a–d, UX, LOAD, XREV, …) |

**Clone-isolated lens:** no product mutation is required for UI-02e. Do not “fix” prior-lane `DebateCanvas` dirt under this ticket’s inventory.

---

## BLOCKING

_None._

---

## ADVISORY

### A1 — Contentful maker-drop RED is stronger than the handoff ledger count

**Where:** handoff MUT “Remove `maker={node.maker}` from the contentful-card call site” claims **1 failed / 2 passed**.  
**This seat:** same mutation → **2 failed / 1 passed** (maker cardinality **and** typed-absence House unavailable 2→1).  
**Why:** omitting the prop makes `maker` `undefined` on `ModelMetaLine`; `makerIdentityLabel` treats only `null` as typed absence, so the author pill no longer renders `House unavailable`.  
**Impact:** **not blocking** — the dual-site maker assertion still kills the mutation; collateral RED is stricter, not weaker. Optional handoff errata if V wants exact ledger parity.

### A2 — Shared heavily dirty mission tree

**Fact:** working tree carries extensive prior-lane product and test dirt. This review attributes only the UI-02e inventory and does **not** treat unrelated dirt as this ticket’s credit or defect. `DebateCanvas.tsx` M vs HEAD is **not** a UI-02e product deliverable.

### A3 — Progress log is gitignored

**Where:** `*.log` in `.gitignore` hides `UI-02e-progress.log` from `git status`. File exists on disk and is claimed by the handoff. Fine for mission process; clone-isolated seats should open the path directly rather than relying on git status alone.

### A4 — No source-floor pin for the two Canvas maker JSX strings

**Where:** UI-02d used `v2ui-pages.test.ts` exact-string floors on other surfaces; UI-02e relies purely on real-render cardinality.  
**Mitigation:** real render + dual independent call-site mutations already kill prop drops. Optional later ratchet: source `toContain` for both Canvas `maker={node.maker}` sites — **not** required for this ticket’s DONE.

---

## Author-claim cross-check (hypothesis → source)

| Claim | Verified? |
|---|---|
| Real `DebateCanvas` rendered under `tests/render/` | **Yes** — import + `renderToStaticMarkup` |
| Maker pin on empty **and** contentful call sites | **Yes** — L344 + L376 + dual mutations |
| Score badges percentage text + attrs | **Yes** — render asserts + JSX-delete RED |
| Typed maker + score absence visible | **Yes** — absence card + two silence mutations |
| Mutation ledger named and killed | **Yes** — five REDs this seat; MUT2 count advisory |
| `vitest list` enumerates all three tests | **Yes** — this seat |
| Focused GREEN 3/3 | **Yes** — pre and post restore |
| No final product-code change from UI-02e | **Yes** — inventory + restore SHA + prior-lane dirt attribution |
| Full gate matrix green (worker handoff) | **Not re-run** this seat; focused + mutations + collection + scope hold without full matrix |

---

## Corroborating runs this seat

```text
# Focused GREEN
npx vitest run tests/render/ui02e-debate-canvas.test.tsx --reporter=verbose
→ Test Files  1 passed · Tests  3 passed

# Collection
npx vitest list tests/render/ui02e-debate-canvas.test.tsx
→ 3 tests enumerated under tests/render/

# MUT1 empty maker prop drop
→ 1 failed | 2 passed (maker 2→1); restored

# MUT2 contentful maker prop drop
→ 2 failed | 1 passed (maker 2→1 + absence House 2→1); restored

# MUT3 delete V3ScoreBadges JSX
→ 2 failed | 1 passed (BASE 62% + NO SCORE); restored

# MUT4 suppress ModelMetaLine when maker is null
→ 1 failed | 2 passed (House unavailable 2→1); restored

# MUT5 ABSENT branch return null
→ 1 failed | 2 passed (missing NO SCORE); restored

# Post-restore
→ 3 passed; DebateCanvas byte-identical to pre-probe
```

Scratch captures: `{SCRATCH}/ui02e-focused.log`, `ui02e-list.log`, `ui02e-mutations.log`, `ui02e-mut{1..5}.log`, `ui02e-scope.log`.

Full root/acceptance/typecheck/architecture matrix was claimed green by the worker handoff; this seat re-ran focused suite + independent mutations + collection + scope attribution rather than the full orchestrator matrix. Source trace + mutations hold without that re-run.

**Product mutation for clone-isolated lens:** _none required._

---

**Comments read through:** ticket body + Codex `WORKER CLAIM` (2026-08-13 14:57) + Codex `READY FOR PEER REVIEW — UI-02e` (2026-08-13 15:03); goal packet; Codex handoff. Peer Opus unread.  
**READY FOR PEER REVIEW** — Grok UI-02e rev1 verdict filed (**APPROVED**).
