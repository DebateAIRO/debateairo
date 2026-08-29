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
