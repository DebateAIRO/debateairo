# LIVE VERIFICATION — S03, against the running application

**2026-08-30, after V authorised merging S03 (commit `f1168c6` on `dev`, unpushed).**

This is the **first time in this mission that anything was verified against a running app.** Every
prior probe was recorded UNVERIFIED-BY-RUNTIME because `:3000` served the main checkout while the
code lived in a worktree. Merging dissolved that, exactly as V's Row 8 reasoning anticipated —
the dev server recompiled and served the merged code with no restart and no server swap.

## Probes, run against `https://localhost:3000`

| Probe | Before merge | After merge | Required |
|---|---|---|---|
| `"Public Debates"` present | **0** | **1** | ≥1 |
| `"Your Debates"` present | — | **1** | ≥1 |
| `?tab=yours` shows `/public/debate/` links | **1** | **0** | **0** |
| `?tab=public` shows `/public/debate/` links | — | **1** | ≥1 |
| anonymous `?tab=yours` in-panel hint | — | **4 matches** | present |

The third row is the one that matters: **`S03-C3-3` direction 1**, the negative probe architecture
added after the coding seat argued that a positive probe cannot prove mutual exclusion — *"it
already passes when both lists are always stacked."* It read `1` for the entire mission. It now
reads `0`. Mutual exclusion is **observed**, not inferred.

## Rendered markup, as an anonymous visitor receives it

    <a class="tab" href="/?tab=yours">Your Debates
    <a aria-current="page" class="tab tabActive" href="/?tab=public">Public Debates

`role="tab"`: **0**. `aria-selected`: **0**. The Bad ARIA that REV-05 cited WAI-ARIA APG and Using
ARIA Rule 1 against is genuinely gone from the served HTML, not merely from the source.

## What this discharges

- **`S03-C3-3` direction 1** — was UNVERIFIED-BY-RUNTIME → **VERIFIED**.
- **`S03-C1-3`** anonymous label probes — was UNVERIFIED-BY-RUNTIME → **VERIFIED**.
- **REV05-N1** in-panel hint for logged-out Your Debates → **VERIFIED live**.

## What remains unverified, stated rather than glossed

- **`S03-C3-3` direction 2** — the logged-in mirror (`?tab=public` must not show the user's own
  debates). Needs a real signed-in session cookie. Still **UNVERIFIED-BY-ARCHITECTURE**, and it is
  QA's, with the exact command already recorded in the PLAN.
- **V's criterion 3** — *"public debates can be accessed just the same as the user's own debates"* —
  is **not** satisfied by this merge. Clicking through lands on the pre-S02 detail page: verdict,
  badges, residual objections, reversal point, and **no argument tree**. S02 supplies that and is in
  review.

## Status against V's acceptance criteria

1. **"Your Debates, Public Debates buttons are present, and accessible"** — **OBSERVED.**
2. **"clicking either will show the user their debates/the public debates"** — **OBSERVED** for the
   anonymous direction; the signed-in direction is QA's.
3. **"public debates can be accessed just the same as the user's own debates"** — **partially**:
   reachable and readable, but not yet at parity. Awaiting S02.

---

## End-to-end anonymous journey — run 2026-08-30, no session cookie

Nobody had done this. Not a fixture, not a render test — the real app, a real published debate.

1. `GET /?tab=public` → yields `/public/debate/d89b38a4-f188-4840-94bd-a2dece92f275`
2. `GET` that path with **no session** → **46,243 bytes** returned

**What the anonymous reader receives:** the question, `Public debate · by <pseudonym>`, verdict
**SUPPORTED**, and the reversal point with real content — *"The conclusion could change if stronger
contrary evidence appears."* Badges and Residual objections do not render, and that is **correct,
not a defect**: both are conditional on `.length > 0` and this debate has neither.

**Mutation controls — all absent, verified live:**
`PublicationControl`, `Challenge`, `Regenerate`, `Unpublish`, `recordInvestigation` — **0 each.**

**Owner-only markers — all absent, verified live:**
`REDACTED_OWNER_ONLY`, `replay_handle`, `cost_envelope`, `ledger:`, `provenance_ref` — **0 each.**

**Why this matters more than the unit evidence.** S01's two blocking leaks were invisible to
fixtures because *a fixture that cannot fail against production pins nothing.* This is the first
time the read-only-and-no-leaks property has been checked against **production data through the
real serving path**, rather than against a constructed envelope. It holds.

**What it does NOT establish:** parity. This is the pre-S02 detail page — no argument tree, no
honesty drawer, no export. Criterion 3 is *accessible*, not yet *"just the same"*.
