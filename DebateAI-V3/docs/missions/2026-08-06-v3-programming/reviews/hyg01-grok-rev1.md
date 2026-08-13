# HYG-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_4a1f8654` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Goal packet:** `docs/missions/2026-08-06-v3-programming/goal-packets/HYG-01-codex-goal.md`  
**Spec source of truth:** kanban comment trail on `t_4a1f8654` (orchestrator folds from PRO-01, PANEL-01, UI-02a, DR-162-A, plus ticket body)  
**Handoff (inventory pointer / hypotheses only):** `docs/missions/2026-08-06-v3-programming/handoffs/HYG-01-codex-handoff.md`  
**Mode:** read-only review with **temporary live mutations fully restored**. Did not read any peer (Opus) HYG-01 verdict. No git branch/commit/push/reset.  
**Ticket law:** TESTS AND GUARDS ONLY — no product behaviour may change.

## Verdict

**APPROVED**

No **BLOCKING** findings. Every named high-leverage claim was re-proved by this lens on the real shipped surfaces:

1. The enforced M=2 depth-2 two-maker fixture is GREEN at baseline and goes RED under each of the four named runner mutations (then restored; baseline re-GREEN).
2. The previously dead 31KB `scoringResponse.test.mjs` suite now executes under `apps/v2-ui` `test` **and** is wrapped by an enforced root Vitest gate.
3. The tracked-text control-byte guard fails on a planted NUL (`0x00`) identifying path:offset:byte, then restores clean.
4. Drawer `not.toContain("base_score")` / `final_strength` and the header wiring ratchet kill their named variants under temporary mutation.

HYG-01-attributed non-test surfaces are either pure guards/tools/test-infra, docs/records, or behaviour-neutral extraction seams. Residual notes below are **ADVISORY** only.

---

## Scope inventory (judged from handoff + tree, not trusted)

| Path | Class | Product-behaviour change? |
|---|---|---|
| `tests/integration/database.test.ts` (M=2 fixture) | enforced test | no |
| `apps/v2-ui/scripts/run-node-tests.mjs` | test runner | no (infra) |
| `apps/v2-ui/lib/scoringResponse.test.mjs` | maintained Node suite (~30KB) | no |
| `tests/unit/v2ui-node-runner.test.ts` | root gate | no |
| `tools/check-text-control-bytes.ts` | audit tool | no (guard) |
| `tests/unit/text-control-bytes.test.ts` | unit ratchet | no |
| `package.json` `audit:text-bytes` | script wiring | no |
| `tests/unit/v2ui-pages.test.ts` | drawer + wiring ratchets | no |
| `apps/v2-ui/lib/debateHeaderOverflow.ts` (`readDebateHeaderGeometry`) | testability extraction | **no** (see §1b) |
| `apps/v2-ui/app/debate/[id]/DebatePageClient.tsx` (call site) | wiring to extraction | **no** (see §1b) |
| `tests/unit/pol03-pool-resilience.test.ts` | A1 skip/optional ratchet | no |
| `tests/integration/pol03-pool-resilience.test.ts` + `tests/support/testDatabase.ts` (`lc_messages=C`, `connectionString`) | A2 fixture/assert | no (test infra) |
| `handoffs/UI-02a-codex-handoff.md` correction | record | no |
| `acceptance/README.md` DR-159 credit | docs | no |
| `handoffs/HYG-01-*.md` | records | no |
| `apps/runner/src/index.ts` | **not** a final HYG-01 product edit | temporary mutations only; restored (sha256-checked) |

Working tree is multi-ticket dirty (PRO-01 / PANEL-01 / UI-01 / etc.). HYG-01 claims were isolated by **attribution + mutation proof**, not by trusting a single-ticket git range.

---

## 1. TESTS AND GUARDS ONLY — product hunk judgment

### 1a. Runner (`apps/runner/src/index.ts`)

**PASS — no permanent HYG-01 product change observed.**

- Handoff claims temporary mutation-proof edits only; this review re-applied and fully restored the four named mutations with pre/post `sha256` identity.
- The M=2 fixture exercises shipped expansion, depth resolution, envelope-terminal record preservation, and single-root serve **without modifying** those product paths for the GREEN baseline.
- Multi-ticket dirt on this file is prior mission work, outside HYG-01's TESTS AND GUARDS charter; not re-litigated here.

### 1b. Header geometry extraction

**PASS — behaviour-neutral extraction.**

Shipped seam (`debateHeaderOverflow.ts:64–100` + `DebatePageClient.tsx:760–769`):

```ts
const geometry = readDebateHeaderGeometry({ header, identity, claim, titleMeasure, controls },
  (element) => window.getComputedStyle(element));
const fit = measureDebateHeaderCollapse(geometry);
setHeaderActionsCollapsed(fit.collapse);
```

- Same DOM inputs, same `measureDebateHeaderCollapse` consumer, single collapse write.
- Extraction exists so wiring can be mutation-killed (duplicate write / bypass of `readDebateHeaderGeometry({`) without changing collapse math.
- Matches ticket item 4 / UI-01 A17: **TESTS ONLY**.

### 1c. Control-byte tool + package script

**PASS.** New scanner + `audit:text-bytes` CLI + unit ratchet. No runtime product path.

### 1d. Test-database locale pin

**PASS.** `postgresFlags` gains `-c lc_messages=C`; exposes `connectionString` for POL-03 child. Test infrastructure only.

### 1e. Docs / records

**PASS.**

- `acceptance/README.md`: ENV-01 ADV-6 closed — credits **DR-159** (not DR-138) for shipped run-envelope members.
- UI-02a handoff corrected to name the missing runner, not only compile constraints.
- DR-162-A N-genericity and POL-02 corrections recorded in the HYG-01 handoff (spot-checked against runner: closed `primary|secondary`, `buildCrossRootExchangePlan` two-leg shape, `unservedRoot = authoredNodes[1]`, `SERVED_ROOT_RULE = first-configured-provider`).

**No BLOCKING product-behaviour change under the TESTS AND GUARDS ONLY law.**

---

## 2. M=2 fixture — live mutation proofs

**Fixture:** `tests/integration/database.test.ts` —  
`runs a depth-2 two-maker tree and preserves the single-root disclosure at envelope terminal`

- Two local `startProviderDouble` queues (8 judgements each), envelope max 16, depth 2, agent_count 2.
- Asserts: 16 nodes; 4× `:r1:` and 8× `:r2:` JUDGE call sites; `UNSERVED-MAKER-POSITION` + `ENVELOPE_EXHAUSTED`; `served_root_rule: first-configured-provider`; zero PRESENT number slots.

### Baseline GREEN (this review)

```text
✓ runs a depth-2 two-maker tree and preserves the single-root disclosure at envelope terminal 277ms
Test Files  1 passed (1)
Tests       1 passed | 31 skipped (32)
```

Evidence: `{SCRATCH}/hyg01-m2-baseline.log` and post-suite restore `{SCRATCH}/hyg01-m2-baseline-restore.log`.

### Mutation table (each applied to shipped runner, observed RED, restored)

| # | Mutation (shipped site) | Observed RED | Assertion / error that kills | Evidence |
|---|---|---|---|---|
| A | Insert `if (leg.round > 1) break;` at start of expansion `for (const leg of …)` body (`index.ts` ~749) | **RED** | Fixture fails before node-count asserts: `COMPOSITION_CONTRACT_ERROR` (compose path opens because only depth-1 expansion is authored → budget not exhausted; remaining doubles are judgement-shaped) | `hyg01-mut-round-break.log` |
| B | `resolveExpansionDepth({ depth: 1 })` at depth-resolution call site (`index.ts:456`) | **RED** | Same class as A: `COMPOSITION_CONTRACT_ERROR` via truncated expansion | `hyg01-mut-depth1.log` |
| C | Replace `preserveEnvelopeTerminalConditionMarkRecords(conditionMarkRecords, […])` call site with assign-of-budget-records-only (`index.ts:964`) | **RED** | `CONDITION_MARK_RECORD_REQUIRED` — `UNSERVED-MAKER-POSITION has no typed persistence record` (`packages/serve/src/index.ts:796`) | `hyg01-mut-preserve.log` |
| D | Widen `servedNodes` to both roots (guard left in place) | **RED** | `FIXED_SINGLE_ROOT_SERVE_VIOLATED` — `DR-159 B2-A requires exactly one served root` (`index.ts` throw site) | `hyg01-mut-single-root.log` |

Post-suite: runner sha256 matched pristine; baseline re-run **GREEN**.

### Which assertion kills which mutation (precise)

| Mutation | Primary kill surface observed by this lens | Fixture's named structure asserts reachable? |
|---|---|---|
| A / B (depth truncation) | Failure at `executeWorkItem` via compose contract (budget remainder) | Node-count / `:r2:` asserts would also fail if compose were satisfied; current doubles make compose the first loud fail |
| C (preserve call site) | Typed serve-gate record requirement before projection asserts | Aligns with handoff: missing preserved unserved-maker record |
| D (two-root serve) | Typed `FIXED_SINGLE_ROOT_SERVE_VIOLATED` at construction+check | Aligns with handoff / fixture comment |

**Judgment: PASS** for the ticket's required live-mutation proofs. See ADVISORY-1 for the A/B failure-mode nuance.

---

## 3. Dead v2-ui runner — no phantom 31KB coverage

**Initial defect (ticket body):** `apps/v2-ui/package.json` declared `"test": "node scripts/run-node-tests.mjs"` while `scripts/` was missing → ~31KB `lib/scoringResponse.test.mjs` could never run.

**Shipped fix (this review):**

| Check | Result |
|---|---|
| `apps/v2-ui/scripts/run-node-tests.mjs` exists | yes — explicit maintained manifest `["lib/scoringResponse.test.mjs"]`, existence check, discovery receipt, `tsx` + `node --test` |
| `pnpm --dir apps/v2-ui test` | `V2_UI_NODE_TESTS_DISCOVERED=1` · **27 pass / 0 fail** |
| Root gate `tests/unit/v2ui-node-runner.test.ts` | spawns the same runner; **status 0** under root Vitest |
| Suite size | `scoringResponse.test.mjs` = **30398 bytes** (~31KB named in ticket) |

Evidence: `{SCRATCH}/hyg01-v2ui-node-tests.log`.

**Residual unmaintained `.mjs`:** ~49 other `*test*.mjs` / `*.source-test.mjs` files remain on disk under `apps/v2-ui/`. They are **not** in the maintained manifest and are **not** claimed by any package script. Plan criterion 4 is met: residual unmaintained files are not treated as coverage. See ADVISORY-2 (hygiene).

**Judgment: PASS** for the named 31KB suite. Phantom coverage of that suite is closed.

---

## 4. Control-byte / NUL guard

**Shipped scanner** (`tools/check-text-control-bytes.ts`):

- Enumerates `git ls-files -z`.
- Filters declared text extensions/names.
- Rejects every C0 byte except tab (`0x09`) / newline (`0x0a`), plus DEL (`0x7f`).
- Pure API: `findForbiddenControlBytes` / `scanTrackedTextSources`.
- CLI: prints `TRACKED_TEXT_CONTROL_BYTES=0` or `path:offset:0xNN` and exits 1.

**Unit baseline GREEN:** pure buffer plant rejects `{ offset: 3, byte: 0 }` among CR/C0/DEL; full-tree scan empty.

**Live plant (this review):** inserted raw `0x00` into tracked `acceptance/README.md`.

```text
$ pnpm run audit:text-bytes
acceptance/README.md:28:0x00
[ELIFECYCLE] Command failed with exit code 1.
```

Restore → `TRACKED_TEXT_CONTROL_BYTES=0`.

Evidence: `{SCRATCH}/hyg01-mut-nul.log`.

Enforcement path: unit suite imports the real tool module (so `pnpm test` has teeth); CLI script is also available as `audit:text-bytes`.

**Judgment: PASS.**

---

## 5. Ratchet upgrades — live kills

### 5a. Drawer raw-score exclusion (UI-02a)

Shipped: `NodeDetailDrawer.tsx` contains **zero** `base_score` / `final_strength` tokens; scores go through `v3NodeScoreDetails(v3)` (camelCase locals only).

Test: `expect(drawer).not.toContain("base_score")` / `.not.toContain("final_strength")` (`v2ui-pages.test.ts:222–223`).

| Planted variant | RED at |
|---|---|
| `{  v3.base_score.value }` (extra space) | `not.toContain("base_score")` |
| `{String(v3.base_score.value)}` | same |
| `{v3["base_score"].value}` | same |
| `const { base_score } = v3; … {base_score.value}` | same |
| `{v3.final_strength.value}` | `not.toContain("final_strength")` |

All restored to zero forbidden tokens.

Evidence: `{SCRATCH}/hyg01-mut-drawer.log`.

**Judgment: PASS** — the four ticket-named survivors of the old regex are dead.

### 5b. Header wiring ratchet (UI-01 A17)

Shipped asserts include:

- `client` contains `readDebateHeaderGeometry({`
- `setHeaderActionsCollapsed(fit.collapse);`
- exactly **one** `setHeaderActionsCollapsed(` inside the measurement `useLayoutEffect`

| Mutation | RED |
|---|---|
| Duplicate `setHeaderActionsCollapsed(false)` after correct setter | `expected length 1, received 2` |
| Bypass `readDebateHeaderGeometry` with hard-coded geometry | missing `readDebateHeaderGeometry({` |

Evidence: `{SCRATCH}/hyg01-mut-wiring.log`. Client restored.

**Judgment: PASS.**

### 5c. POL-03 A1 / A2 (spot-checked)

- A1: temporarily `describe.skip` on the integration suite → unit ratchet RED at `not.toMatch(/\b(?:it|test|describe)\.(?:skip|todo)\s*\(/)`. Restored.
- A2: fixture pins `lc_messages=C`; integration asserts `SHOW lc_messages` = `C`.

**Judgment: PASS** (supporting; not the mutation suite's primary bar).

---

## 6. Records (item 5) — presence only

| Record | Present? |
|---|---|
| DR-162-A N-genericity audit (handoff) | yes — closed role pair, cross-root two-leg plan, single unserved root, record prose shape |
| POL-02 sweep corrections (handoff) | yes — listed, no behaviour change claimed |
| ENV-01 ADV-6 README DR-159 credit | yes — `acceptance/README.md` |

**Judgment: PASS** for record-only scope.

---

## Findings summary

### BLOCKING

*(none)*

### ADVISORY

**ADVISORY-1 — M=2 depth-truncation kill mode is compose-first, not node-count-first.**  
Mutations A/B go RED via `COMPOSITION_CONTRACT_ERROR` because truncating expansion leaves budget headroom and the serve chain attempts compose against judgement doubles. The fixture's 16-node / `:r2:` asserts would also fail if that path were reached; today they are not the first fail. The kill is real and enforced. Optional hardening (future ticket, not HYG-01 rework): assert expansion structure before compose, or size the fixture budget so depth-truncation cannot enter compose with residual attempts.

**ADVISORY-2 — Residual unmaintained v2-ui `.mjs` corpus still on disk.**  
~49 non-manifest `*test*.mjs` / `*.source-test.mjs` files remain. The maintained runner is explicit (good — no silent glob), and this review does **not** treat them as coverage. Hygiene cleanup (delete or port) would reduce future "looks like coverage" confusion; not required for HYG-01 DONE under plan criterion 4.

**ADVISORY-3 — `FIXED_SINGLE_ROOT_SERVE_VIOLATED` is construction-coupled.**  
`servedNodes` is built as a one-element array then checked `length !== 1`. Pure deletion of the throw without widening construction is a no-op (fixture stays GREEN). The meaningful mutation is **widening the served set**, which this review proved RED. A future guard might assert at the selection/policy boundary rather than only after a hard-coded singleton construction — out of scope for TESTS AND GUARDS ONLY.

**ADVISORY-4 — `audit:text-bytes` is not folded into `pnpm run lint`.**  
It is enforced via the unit suite's `scanTrackedTextSources(process.cwd())` under root Vitest, plus the standalone script. Optional: add to lint/CI script list for discoverability. Not a hole in enforcement.

---

## Dual-diamond independence statement

- Spec read from kanban comments + goal packet end-to-end; handoff treated as hypothesis inventory only.
- Every central mutation claim re-run on shipped code; captures under review scratch.
- Temporary mutations fully restored (runner sha256; drawer/client/README diff-clean).
- Peer Opus verdict **not** read.
- No product behaviour left changed by this review.

---

## Verdict line

**APPROVED** — HYG-01 delivers the owned verification-hardening class (M=2 fixture with live mutation teeth, restored 31KB runner under a real gate, repo-wide control-byte guard, drawer/wiring/POL-03 ratchets, and the named records) without product-behaviour change under the TESTS AND GUARDS ONLY law.
