# DR-174 REVISED plan — Grok (DR-171) authorization verdict

**Seat:** DR-171 authorizing lens (Grok). **Subject:** `reviews/dr174-architecture-plan.md` §§1–14 + binding **Revision after V's rulings (DR-174-A)**. **Law:** `decisions-ledger.md` DR-174 (1300–1314) and DR-174-A (1316–1341). **Discipline:** read-only; sole real-tree write is this file; no stack control; no runs; no dependence on concurrent BUG-04 uncommitted test state.

---

## Law (what the plan must serve)

- **DR-174:** on attempt-bound exhaustion → hold 10 minutes → one final retry → then prune/serve with marks; DR-165(3) holds (unjudged never serves as opinion); 10 min is a register row.
- **DR-174-A:** (1) max **two** holds per run, then straight to serve-with-marks; (2) **transport only**; (3) root = THE QUESTION (undying); dead maker-position is open V row; (4) **HIDDEN not pruned** — hide unjudgeable / low-score; never-authored cannot be shown; low-score threshold unruled (`— none stated`).

Revision wins on conflict with §§1–14. Verified against the live tree below.

---

## Verify items (packet 1–8) — live evidence

### 1. Cooldown seam + claim-TTL

| Claim | Result | Evidence |
|---|---|---|
| `authorPosition` is the wrap seam for JUDGE authoring | **Partial — binding condition** | Funnel exists at `apps/runner/src/index.ts:702-830` (`judge()` then `withGraphWrite`/`addNode`). Callers through it: secondary position `:832-847`, expansion legs `:872-882`, cross-root `:894-912`. |
| **Every** JUDGE authoring call crosses that funnel | **REFUTED as absolute** | Primary maker-position call is **outside** the funnel: direct `this.#judge.judge({ callSiteKey: "JUDGE", … })` at `:607-615`, node write `:633-655`, then seeds `authoredNodes` at `:689-700`. Plan §3.1 softens with "or the identical `Judge.judge` shape" but the **ruling** names only `authorPosition`. Incident site `JUDGE:critic:root0:r5:p17` **is** on the funnel (expansion). Maker-position cooldown/final-retry still needs an explicit wrap of the primary path (or lift primary into the helper). |
| One work-item / one `execute()` | **Confirmed** | Expansion loop is sequential over the plan (`:851+`); whole multi-maker tree lives in one `execute()` invocation (plan §3.0 reading holds). |
| Claim TTL covers two holds | **Confirmed with room** | `claimMs = longestDeadline × maximumRunAttempts` (`acceptance/main.ts:186-196`). JUDGE `deadlineMs: 180_000` (`acceptance/seed-register.ts:165`); max envelope member `780` at depth 5 (`:185-186`) → claim ≈ 39 h. Two holds: `2 × (600_000 + 180_000) + 180_000 = 1_740_000` ms ≈ 29 min ≪ claim. Current `assertClaimCoversCall` only checks `claimMs ≥ deadlineMs + marginMs` (`packages/battery/src/index.ts:214-225`); plan's expanded inequality is a real guard, not yet shipped. |
| Hold does not itself breach the claim | **Holds under live numbers** | Hold is wall-clock inside the claimed `execute()`; no re-claim mid-hold required for the happy design. Reaper still scaffold (`apps/scheduler` not re-checked as blocking; plan flags it). |

**Verdict on item 1:** Seam choice (runner lifecycle, not gateway) is sound. Ticket **must** apply `withCooldownRetry` to **primary** maker-position authoring as well as `authorPosition`, or the DIE-LOUD maker-position branch still dies without DR-174's hold+final retry.

---

### 2. Final retry with zero providers change

| Claim | Result | Evidence |
|---|---|---|
| `remaining = maxAttempts − ledgerConsumed` | **Confirmed** | `createPostgresProviderGateway` `apps/runner/src/index.ts:1469-1499`: `countModelAttempts` then `remaining = request.bound.maxAttempts - consumed`; if `remaining <= 0` → `CALL_BUDGET_EXHAUSTED`; else `http.call({ … bound: { maxAttempts: remaining } })`. |
| Count is per `callSiteKey`, no outcome filter | **Confirmed** | `packages/ledger/src/index.ts:501-514` — `action_kind = 'MODEL_CALL'` only; no outcome filter; no time term. Held wall-clock cannot create ledger rows without a call. |
| Re-issue same key with bound `3+1` → exactly one further ledgered attempt | **Arithmetic holds** | After 3 consumed, `maxAttempts: 4` ⇒ `remaining = 1`. Same `callSiteKey` required so `findExhaustedModelAttempt`'s `GROUP BY call_site_key` (`:470-495`) still sees the chain. No `packages/providers` control-flow change needed for this math. |
| `ProviderCallFailedError` is thin today | **Confirmed** | `packages/providers/src/index.ts:46-55` — only `cause: unknown` (+ code). Plan's structured fields are additive honesty, not required for the remaining math itself. |

**Verdict on item 2:** Plan claim stands. T10 is the right mutation pin.

---

### 3. Hidden frame — affordances + DR-165(3) exclude-not-reparent

| Claim | Result | Evidence |
|---|---|---|
| "Show set-aside paths" checkbox | **Confirmed** | `apps/v2-ui/components/DebateCanvas.tsx:141-152` label **"Show set-aside paths"**; drives `visibleRoot` at `:108`. |
| `withoutSetAsidePaths` recursive | **Confirmed** | `:47-52` filters `isSetAsidePath` children and maps recursively. Predicate `:38-45` (`path_status === "abandoned"` or `stopping_status ∈ {abandon, abandoned}`). |
| Drawer "never deleted" | **Confirmed** | `NodeDetailDrawer.tsx:215` — *"preserved here for reference — abandoned paths are never deleted"*. |
| Default checkbox state | **Note (not a refute of existence)** | `useState(true)` at `DebateCanvas.tsx:99` — set-aside paths are **shown by default** today. DR-174-A "hidden by default" may require default flip and/or projection that marks H/L as set-aside with default off; plan R.6 maps reasons onto `isSetAsidePath` fields but does not explicitly bind default=false. **Coder condition** if product intent is hide-by-default. |
| Snapshot rebuild seam `:978-1000` | **Confirmed as rebuild site; exclusion not present yet** | Today: materialise snapshot `:971`; if arrows exist, freeze-copy with `operatorResolutions` only (`:978-1000`); then `evaluate(snapshot)` `:1002`. **No** hidden-subtree exclusion yet — that is planned work at this seam. Propagation stays pure if runner feeds a smaller graph. |
| Do not reuse `snapshotWithoutNode` re-parenting | **Confirmed hazard** | `packages/propagation/src/index.ts:506-512` re-parents children of the removed node onto its parent — correct for sensitivity (`:607`), **forbidden** for class-H exclusion (would fabricate structure). Plan R.4.3 / T28 correctly forbids reuse. |
| UI synthesis of question-as-root | **Confirmed** | `apps/v2-ui/lib/v3/adapter.ts:188-206` builds ROOT from `answer.question_line`; maker positions as `rootChildren`. Engine still writes maker positions with `parentNodeId: null` (`apps/runner/src/index.ts:638-639`, `:841`). V's root vocabulary correction is already true in UI presentation. |

**Verdict on item 3:** Affordance citations real. DR-165(3) two-act design (hide in UI + exclude whole subtree from evaluated snapshot, never re-parent) is **architecturally supported** by the existing rebuild site and by not touching `packages/propagation`; it is **not** already implemented. T27/T28/T33 are load-bearing.

---

### 4. Class N honesty

| Claim | Result | Evidence |
|---|---|---|
| `core.node` append-only | **Confirmed** | `migrations/0000_s00.sql:305-306` — `REVOKE UPDATE, DELETE ON … core.node … FROM PUBLIC, debateai_runtime`; reject-mutation triggers follow. |
| Nodes written only post-return | **Confirmed** | `authorPosition`: `selectedMaker.judge.judge` at `:732-741` **before** `withGraphWrite`/`addNode` at `:759-797`. Primary path same order (`:607-655`). Dead authoring call ⇒ no node row. |
| Never-authored cannot hide/show | **Confirmed as store fact** | Nothing to toggle; disclosure is mark-only (plan class N). |
| Mark-name tension fairly presented | **Confirmed fair** | R.4.4 proposes `HIDDEN-UNJUDGEABLE-UNAUTHORED` vs alternative `UNAUTHORED-BRANCH-HALTED` under **VROW-2-R** — not smoothed over; chip text says nothing was written. |

**Verdict on item 4:** Honest. No smuggled ability to "show" unauthored material.

---

### 5. Two latent defects

| Claim | Result | Evidence |
|---|---|---|
| Sparse `authoredNodes` → XREV `TypeError` | **Confirmed live hazard** | `const authoredNodes: AuthoredDebateNode[] = […]` `:689`; index assign `authoredNodes[1] = …` `:833`; `authoredNodes[leg.childIndex] = …` `:872`; XREV `for (const authoredNode of authoredNodes)` `:925`. A hole yields `undefined` and property access throws untyped. Dense `Map` / filter is a real correctness fix. Expansion plan uses dense child indices with `parentIndex < childIndex` by construction (`buildMultiMakerExpansionPlan` `:365-385`). |
| Pre-flight kills whole work item for one exhausted site | **Confirmed** | Loop `:577-591` over judge/composer/conformance bounds → `findExhaustedModelAttempt` → `failFromExhaustedAttempt`. That method sets `state = 'FAILED'`, `terminal_reason = 'CALL_BUDGET_EXHAUSTED'` (`packages/battery/src/index.ts:372-389`). `findExhaustedModelAttempt` groups by `call_site_key` with `HAVING count(*) >= maxAttempts` (`packages/ledger/src/index.ts:470-495`) — **any** site at ruled max fails the item. Must-fix scope (cooldown-aware effective bound + hand to hide/halt path except maker-position policy) is honest. |

**Verdict on item 5:** Both defects real; must-fix scoping honest (not drive-by cleanup theatre).

---

### 6. Register rows / no invented numbers / 0.35 null-guard

| Claim | Result | Evidence |
|---|---|---|
| `runDeathPolicy` numbers | **Plan-only; no invented values beyond V** | Plan R.5: `cooldown_ms 600_000` (DR-174), `final_retry_attempts 1` (DR-174), `max_cooldown_holds_per_run 2` (DR-174-A), `applies_to TRANSPORT_EXHAUSTION` (DR-174-A). **Not seeded yet** — `acceptance/seed-register.ts` has `acceptanceOrganCostBounds` / `runCostEnvelope` but no `runDeathPolicy` row today. Correct: plan proposes seed, does not pretend it exists. |
| `hiddenNodeScoreThreshold` | **`— none stated`** | Plan R.5 / VROW-7; no literal invented for the ruled threshold. |
| Hardcoded `0.35` + null-guard | **Confirmed** | `apps/v2-ui/lib/debateTreeUtils.ts:116-122`: `threshold = 0.35`; `if (strength == null) return false`. Comment cites coordinator `verdict.py` unsupported band — still an undeclared served-surface literal. Grep of `tests/**` found **no** assertion pinning `isLowStrengthNode` / this default (only unrelated `0.35` numeric fixtures). Plan retires default via required register argument (T30/T31). |

**Verdict on item 6:** No invented DR-174 numbers. 0.35 finding accurate; null-guard must survive.

---

### 7. V-row hygiene

| Row | Status in revised plan | Decided by plan? |
|---|---|---|
| **VROW-4-R** dead maker position (DIE-LOUD vs SERVE-SURVIVING) | Both branches specified; architecture offers DIE-LOUD until mono-maker ruling | **No** — open |
| **VROW-2-R** mark names (incl. class-N tension) | Three members proposed; alternative for N offered | **No** — V mints |
| **VROW-7** threshold value + shape | Shape (a) offered; number `— none stated` | **No** |
| **VROW-6-R** retire `NODE_REVIEW_UNAVAILABLE` | Shipped refusal **exists** at `apps/runner/src/index.ts:955-958`; plan replaces with hide-and-exclude; confirmation row kept because it retires a shipped refusal | **No** — one-word V confirmation; not smuggled as already-law |
| **VROW-5** confidence band cap | Lever exists; no basis; mark discloses today | **No** |

Closed by DR-174-A (not by this plan inventing): VROW-1 cap=2, VROW-3 transport only, old prune vocabulary withdrawn.

**Verdict on item 7:** Hygiene holds. None of the open rows are decided in the plan body.

---

### 8. Mutation obligations T25–T33 (esp. T27)

| # | Falsifiable as stated? | What it kills |
|---:|---|---|
| T25 | Yes | Dropping hold cap; per-site vs per-run counter |
| T26 | Yes | In-memory-only hold counter |
| **T27** | **Yes — critical** | Hidden-in-UI but still in `strengths`/`arrowOrder`/fingerprint (**DR-165(3) breach**); or delete-from-store (impossible under grants, still must prove store retention) |
| T28 | Yes | Reusing `snapshotWithoutNode` re-parent |
| T29 | Yes | Reveal without disclosed-as-unjudged presentation |
| T30 | Yes | Missing score treated as low |
| T31 | Yes | Restoring `= 0.35` default |
| T32 | Yes | Conflating H/L/N mark/record shapes |
| T33 | Yes | Number over full graph merely labelled hidden |

T1–T24 stand under renamed vocabulary / maker-position wording. Obligations are mutation-proof in the P1 sense: each names a concrete wrong implementation.

**Verdict on item 8:** Acceptable as ticket test law. T27 is correctly elevated as the DR-165(3) breach detector.

---

## Refuted / softened claims (summary)

1. **Absolute "single path" through `authorPosition`:** primary `JUDGE` authoring bypasses it (`:607-615`). Incident expansion path is covered; full DR-174 lifecycle is not until the primary path is wrapped too.
2. **Snapshot rebuild already excludes hidden subtrees:** false — `:978-1000` only attaches operator resolutions. Seam exists; behaviour is future work.
3. **Register rows already live:** false — policy is plan-proposed, not in `seed-register.ts` yet (expected for a plan).
4. **`showSetAsidePaths` already equals "hidden by default":** default is `true` (show). Product default may need ticket binding.

None of these refute the **revised architecture direction** (cooldown in runner; final retry via existing remaining math; conceal not delete; exclude-from-number without re-parent; register-sourced numbers; open V rows).

---

## Binding conditions for the coder ticket

1. **Primary maker-position authoring** (`callSiteKey: "JUDGE"` at `:607-615`) **must** enter the same `withCooldownRetry` / death-policy path as `authorPosition`, or an equivalent helper — not only the 702–830 funnel. Secondary already goes through `authorPosition`.
2. **Hold counter** is per-run from durable `COOLDOWN_HOLD` events (T25/T26); third exhaustion neither waits nor retries.
3. **Class H evaluation path:** exclude whole subtree from evaluated snapshot **without** `snapshotWithoutNode` re-parenting; prove with T27/T28/T33. Store rows untouched.
4. **Do not retire `NODE_REVIEW_UNAVAILABLE` until VROW-6-R is affirmed** (plan already keeps the confirmation row). Envelope re-raises at `:948-952` stay untouched.
5. **VROW-4-R unbound → implement DIE-LOUD for dead maker-position** after cooldown+final-retry (architecture's offered default), without coding SERVE-SURVIVING as if mono-maker re-derivation were already law.
6. **No default threshold literal:** remove `threshold = 0.35`; require register-sourced argument; keep `strength == null → false` (T30/T31). Class L behaviour that needs a number **blocks** on VROW-7 if the ticket tries to ship hiding without a ruled value — mark/record machinery may still land with threshold unruled and L inert.
7. **Class N mark:** ship only the V-minted name (VROW-2-R); do not invent a fourth vocabulary path.
8. **UI default:** if shipping "hidden by default" for honesty classes, bind checkbox/default presentation explicitly (today default shows set-aside paths).
9. **Pre-flight** (`:577-591`) becomes cooldown-aware against effective bound and must not `failFromExhaustedAttempt` the whole item for a non–maker-position halt after successful post-cooldown recovery (T11/T12).
10. **Migration** next free id after `0020_prov01_machine_default.sql` is `0021_…` as planned; CHECK/column shape per plan; no `providers` attempt-loop sleep.

---

## Authorization decision

The revised plan is consistent with DR-174 / DR-174-A, correctly relocates from prune-as-removal to hide/exclude, keeps propagation pure, reuses real UI affordances, refuses invented threshold numbers, and pins the DR-165(3) breach with falsifiable tests. Residual gaps are ticket-binding (primary path wrap, UI default, V-row gates), not architecture refusal grounds.

AUTHORIZATION: GRANTED with the binding conditions above
