SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, user-testing-validator, agent-browser, verification-before-completion, TOOLING-TRAPS.md

comments read through: ticket `t_cb2dd94d` events only (created/linked/promoted; no prior comments)

# QA-01 — final QA · mission `public-debate-access` · ticket `t_cb2dd94d`

**Seat:** QA-01 (Grok) · **Posture:** REFUTE · **Runtime:** `https://localhost:3000` (self-signed, `curl -sk`) + API `http://127.0.0.1:8790` · **No server stop/restart/swap/port change.**

**Overall verdict: BLOCKED**

Blocked on two V-owned preconditions the packet itself names, not on a greenwashed skip. Anonymous S03 surface checks that do not need a session or a fresh publication were run and largely hold. The mission's sharpest item (tree-bearing anonymous projection + S04-C4 sample) was **genuinely unrun**.

---

## Preconditions observed at start (2026-08-30)

| Check | Result |
|---|---|
| Publications in DB (`GET /v1/public/debates?offset=0&limit=50`) | **total: 1** — only `d89b38a4-f188-4840-94bd-a2dece92f275` |
| That publication's anonymous payload | **no** `tree_included`, **no** `nodes`/`edges` |
| Live HTML disclosure | *"This publication predates argument-tree publishing; only the answer summary is available."* |
| Fresh V-published tree-bearing debate | **ABSENT** |
| Session cookie for signed-in probes | **ABSENT** (packet + V ruling: do not register/authenticate/manufacture a session) |

Evidence dir: `.hermes/reports/public-debate-access/qa-evidence/`

---

## Against V's three sentences

### 1. "Your Debates, Public Debates buttons are present, and accessible"

**Present — VERIFIED (anonymous).** Both labels appear as real `<a href="/?tab=…">` anchors on every anonymous home variant probed. `role="tab"` = 0, `aria-selected` = 0, `aria-current="page"` on the active control only. Matches the REV-05 / Bad-ARIA reversal.

**Accessible — PARTIAL.**

| S03-C1-5 item | Result |
|---|---|
| (1) Screen reader announces `aria-current="page"` comprehensibly | **UNVERIFIED** — no AT session in this environment. Markup is present; announcement quality not observed. |
| (2) Visible `:focus-visible` styling | **VERIFIED** — served CSS has `a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`. Playwright keyboard focus on a `.tab` measured `outline: oklch(0.6 0.04 70) solid 2px`. See `qa-evidence/focus-probe.json`. |
| (3) Tab order vs composer / sign-in | **VERIFIED for anonymous** — order is brand → Account → + New debate → Settings → Log in → Create account → Your Debates → Public Debates → list item. Logged-out home has **no** claim textarea (sign-in gate instead). Sensible. |

**N1 (NON-BLOCKING, product):** `.tab` / `.tabActive` have **zero CSS rules** anywhere under `apps/ui` (grep of all `.css` + served `layout.css`). Playwright computed styles for active vs inactive tabs are identical (same color, weight, background, border). Sighted users get **no visual current-page cue**; only `aria-current` distinguishes them. Screenshots: `chrome-tab-public.png`, `chrome-tab-yours.png`. Reproduction: open `/?tab=public` and `/?tab=yours` side by side — labels swap `aria-current` but look the same.

Keyboard Enter on "Your Debates" navigates to `/?tab=yours`, shows the in-panel hint, and keeps public links at 0 (`interaction-probe.json`).

### 2. "clicking either will show the user their debates/the public debates"

**Anonymous matrix — VERIFIED (enumerate, not sample):**

| URL | Your/Public labels | `/public/debate/` links | Notes |
|---|---|---|---|
| `/` (no tab) | present; Public active | ≥1 | default → public |
| `/?tab=public` | Public `aria-current=page` | ≥1 | |
| `/?tab=yours` | Yours current | **0** | hint: *"Sign in or create an account above to see your debates."* |
| `/?tab=garbage` | Public active | ≥1 | falls through to public default |
| `/?tab=` | Public active | ≥1 | |

**S03-C3-3 direction 1** (logged-out `?tab=yours` must not show public links): **PASS** — count 0.

**S03-C3-3 direction 2** (logged-in `?tab=public` must not show `href="/debate/"`): **GENUINELY UNRUN.** Exact PLAN command needs `--cookie`. Packet + V ruling forbid manufacturing a session. Architecture still routes this to QA; that conflict is disclosed in the packet and confirmed here — not silently closed.

Signed-in half of criterion 2 is therefore **not observed**.

### 3. "public debates can be accessed just the same as the user's own debates"

**Reachable anonymously — VERIFIED.** Deep link `GET /public/debate/d89b38a4-…` → 200, verdict SUPPORTED, reversal point, Published-answer-limitations disclosure, Honesty drawer opens (`role="dialog"`), Export data-URI present.

**Mutation affordances on legacy page — ABSENT (verified live):** Challenge / Unpublish / PublicationControl / Regenerate text counts = 0 in page body. Owner markers (`REDACTED_OWNER_ONLY`, `replay_handle`, `provenance_ref`, `owner_ref`, `user_id`, `ledger:`) = 0 in HTML, API JSON, and export payload.

**Argument tree / reading modes — GENUINELY UNRUN on production data.** View switcher (Thread/Split/Tree/Map) and `[aria-label="Published argument tree"]` are absent, correctly, because `tree_included` is absent. **Did not infer** tree redaction or read-parity from the legacy publication.

**Parity vs owner view — UNRUN** for the tree path (needs fresh pub + optionally owner session). On the legacy surface, anonymous readers get summary + Honesty + Export + Scoring diagnostics button; they do not get an argument tree. Criterion 3's "just the same" is **not satisfied** by the only live publication, and that is a data-vintage fact, not a fresh S02 regression proof.

**Latent note (hypothesis until tree exists):** `NodeDetailDrawer` always renders a **disabled** "↻ Regenerate" button even when `onChallenge` is omitted (`NodeDetailDrawer.tsx:264-272`). Public client passes `token={null}` and no `onChallenge`, so Challenge is gated off — but Regenerate still appears once a tree node drawer opens. Not observed live (no tree). Treat as a follow-up probe on the fresh publication, not as a current blocking leak.

---

## Anonymous exposure / S04-C4

### Legacy payload (what could be checked)

Anonymous API `GET http://127.0.0.1:8790/v1/public/debates/<id>` and UI proxy `/api/v1/public/debates/<id>` return the same 685-byte summary envelope: `public_ref`, `author_pseudonym`, `question`, `published_at`, `answer.{terminal,verdict,…}` — **no nodes, no edges, no tree_included, no provenance/provider/ledger fields.** Export payload matches. Honesty drawer states cost/memory/ledger are *not* in the snapshot.

This pins **summary-path** cleanliness for this one legacy row. It does **not** pin the recursive redactor against engine-produced nodes.

### S04-C4-1 checklist status (QA)

| Item | Status |
|---|---|
| 2 `disagreement` | Closed upstream (nulled); not re-sampled as an open question |
| 3 / 3b `provenance_ref` / `provider_ref` / abstention register fields | **CLASSIFICATION settled in S01; IMPLEMENTATION SAMPLE UNRUN** — no tree-bearing publication |
| 3c / 3d | Closed upstream |

### S04-C4-2 verdict label

**None of the three allowed labels is honest yet.**

- `SAFE_UNDER_CURRENT_RULES` — would launder an unobserved tree path.
- `BLOCKED_NEEDS_REDACTION_OR_POLICY` — implies a redaction/policy defect; none was observed on live tree data because there is no live tree data.
- `RISK_ACCEPTED_BY_V` — V's call, not QA's invention.

**S04-C4 remains open for mission close** until V publishes a fresh debate with `tree_included === true` and QA re-runs the sample. Recorded in `docs/missions/public-debate-access/slices/S04/DECISIONS.md`. Open board row `t_3e217eab` already names the fixed-point/redactor-on-production gap.

---

## Findings

### B1 — BLOCKING (precondition) — fresh tree-bearing publication missing

- **Inputs:** list API total=1; detail JSON lacks `tree_included`/`nodes`; HTML legacy note present.
- **Wrong outcome if ignored:** closing criterion 3 / S04-C4 / redactor-on-production from fixtures or the legacy row.
- **Evidence:** `qa-evidence/api-debate-*.json`, `chrome-debate.png`, list API dump in this report.
- **Owner:** V publish (packet law). QA must re-enter after publish — do not infer.

### B2 — BLOCKING (precondition / packet conflict) — S03-C3-3 direction 2 unrun under no-auth ruling

- PLAN command requires a real session cookie.
- Packet + V: do not authenticate.
- **Result:** signed-in mutual exclusion unobserved.
- **Owner:** V (provide a session *or* waive/reassign the probe) / Router (align PLAN vs standing ruling).

### N1 — NON-BLOCKING — `.tab` / `.tabActive` have no CSS; active tab invisible to sighted users

- **File:** `apps/ui/app/page.tsx` (classes applied) vs `apps/ui/**/*.css` (no rules).
- **Inputs → wrong outcome:** select either tab → `aria-current` flips, visual style unchanged.
- **Evidence:** `qa-evidence/focus-probe.json` (`tabs[].color/fontWeight/backgroundColor` identical); screenshots.
- **Fix class:** add real `.tab` / `.tabActive` (or equivalent) styles so current page is visible, not only announced.

### N2 — NON-BLOCKING (latent / hypothesis) — disabled Regenerate in public node drawer

- Source-only until a tree exists. Confirm on fresh publication whether a disabled mutation control counts as an "affordance" under criterion 3 / REV06-B2 spirit.

---

## Packet review (orchestrator artifact)

- Packet correctly restored Architecture-routed QA items after `t_bdef8274` — those items were exercised.
- Packet correctly forbids inventing a session and forbids inferring the tree from the legacy row — followed.
- Residual defect: Architecture still assigns S03-C3-3 dir2 to QA with a cookie command while V forbids QA auth. That is a **route conflict**, not a worker miss. Say so rather than "fix" it by logging in.

---

## What was verified vs not

**Verified live (anonymous):** tab presence + markup; focus-visible; tab order; tab matrix incl. garbage/default; C3-3 dir1; deep link; legacy summary + Honesty/Export; mutation markers absent on legacy; API/export clean of owner keys on legacy.

**Not verified:** tree render in any reading mode; redactor vs engine nodes; `provider_ref`/`provenance_ref` sample match to S01 table; owner↔anonymous parity on a tree-bearing debate; S03-C3-3 dir2; screen-reader announcement quality; signed-in criterion 2.

---

## Predictions (for the next seat / Router)

1. When V publishes, the first failure mode to hunt is a *value* leak under an allowed key (`maker_lineage.provider_ref` shaped like a user/token, or a `provenance_ref` that is not exactly `REDACTED_OWNER_ONLY`), not a missing key name.
2. N1 (invisible active tab) will be filed as polish and then surprise an a11y pass that only checked `aria-current`.
3. Direction 2 will stay green-by-source until someone runs it with a real cookie — same class as every UNVERIFIED-BY-RUNTIME row this mission already paid for.

---

## Self-report (case file)

**Cause that dominated this seat:** the sharpest QA work was gated on a human publish step that had not happened, while the packet correctly forbade the seat from doing that step itself. Cost: the entire tree/redactor/S04-C4 sample path returned as BLOCKED rather than PASS/FAIL on product truth. That is cheaper than a false SAFE, and it is exactly the fixture-vs-production lesson the mission already recorded — now applied to *data vintage*, not only to test fixtures.

**What repeatedly cost tokens:** (1) discovering the API is on `:8790` / `/api` proxy rather than `:3000/v1` bare paths; (2) `agent-browser` not on PATH — fell back to Chrome headless + temporary `playwright-core`; (3) zsh `for path in …` clobbering `PATH` (tied array) so `curl` vanished inside loops — paid once, fixed by renaming the loop variable.

**Near-miss:** almost treating Honesty/Export presence on the legacy page as criterion-3 parity. They are read affordances on a summary-only publication; they do not stand in for the argument tree.

**Dead end:** inventing a session to finish dir2 — forbidden by the packet; would have invalidated the standing ruling.

**Packet clarity:** strong on "V publishes; you verify" and "do not infer from legacy." Weak on reconciling that with Architecture's cookie command for dir2 — the conflict is disclosed, but still burns a QA cycle to re-state.

**Upgrade:** Router should not mark QA ready until either (a) the fresh publication exists and is linked in the packet, or (b) the packet's BLOCKED-without-it outcome is the explicit expected first return. Shipping QA against a known-empty precondition guarantees a BLOCKED that looks like progress.

READY FOR ROUTER
