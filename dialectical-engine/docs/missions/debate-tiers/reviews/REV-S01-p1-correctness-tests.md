# REV(S01) pass 1 — lens **correctness/tests** · mission `debate-tiers` · ticket `t_df524f91`

Seat `REV-S01-p1-correctness-tests` · model claude-opus-5 · blind, own detached worktree
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine`
at `f6c147cc` (= `slice/tiers-s01` head), base `7f89f7b7`, 0 dirty at CLAIM and 0 dirty at handoff.
Read: the packet, `COMMON.md`, the review package `S01-p1/` (README first), `DONE.md:1-167`,
`design/S01/README.md:1-33` + the 14 artboards, `SPEC-v2.md:232-268`, and — for the R7 ruling a
finding turned on — `SPEC-v2.md:60-100`. No other lens's packet or output was opened.

## VERDICT — **PASS** for the correctness/tests lens, pass 1 of 3

No blocking finding. Six non-blocking findings (N1–N6), two of them packet defects against the
orchestrator. Every N is ticketed per law 3.2 — the tier sets WHEN, never WHETHER.

---

## 1. What I verified, and how

### 1.1 Every cluster command, re-run by me, three runs

Run from my own worktree through the shared runner
(`.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh`), post-C5 pairs
(`tier01-new-plan-tier.test.tsx:21:0`, `tier01-style-contract.test.ts:8:0`).

| run | started | C1 | C2 | C3 | C4 | `generate:contract` | dirty after |
|---|---|---|---|---|---|---|---|
| 1 | 03:46:44 | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN | rc 0, dirty-after 0 | 0 |
| 2 | 03:47:54 | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN | rc 0, dirty-after 0 | 0 |
| 3 | 03:48:46 | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN | rc 0, dirty-after 0 | 0 |

Worst run wins: **GREEN**. Every one of the 34 suite invocations hit its declared pair in all three
runs (checked mechanically, 0 mismatches). The `passed/total` values reproduce the orchestrator's
`reverify-f6c147cc.log` exactly, including the eight pre-existing failures the pairs carry
(`s7-authorization-contract` 5\|1, `s8-publication-contract` 4\|1, `s14-contract` 2\|3,
`v2ui-pages` 36\|5, `ux01-new-debate-form` 1\|7, `sup-04-mounts` 0\|2, `t9-mode-tokens` 7\|2,
`t3-library` 11\|4, `role-token-map` 46\|3, `pda-s03-keyboard-accessibility` 3\|2) — all dated
pre-existing at base by `BASELINE.md`, none caused by this diff.

Logs: `/private/tmp/debate-tiers-REV-S01-p1-correctness-tests/run{1,2,3}-summary.txt` and
`run{1,2,3}-C{1..4}.log`.

### 1.2 Refutation — my own mutants against the C5 M-line matrix (probe 3)

`oracle/M-line-matrix-from-C5-READY.txt` is a CLAIM. The C5 seat's own refutation list covers
M2–M7, M11, M12 and mutates **tokens** only; it never mutates the product for M8, M9, M10, M13,
M14 or M15. I mutated the product itself, one mutant at a time, restoring the exact original bytes
after each and re-measuring `git status --porcelain` (CLEAN after every one; empty at the end).

| # | mutant | suite | result | predicted |
|---|---|---|---|---|
| 1 | `page.tsx` — drop `disabled={planTier === "free"}` from the Risk-tier row | `tier01-new-plan-tier` | **4 failed / 17 passed** RED | RED |
| 2 | `plan-tiers.ts` — swap Premium roster order (`opus` before `sol`) | `tier01-new-plan-tier` | **1 failed / 20 passed** RED | RED |
| 3 | `page.tsx` — `setDepth(2)` → `setDepth(3)` in `choosePlanTier` | `tier01-new-plan-tier` | **2 failed / 19 passed** RED | RED |
| 4 | `globals.css` — lock `opacity: 0.45` → `0.5` | `tier01-style-contract` | **1 failed / 7 passed** RED | RED |
| 5 | `globals.css` — chamber `--line-strong` **value** → `rgba(255,0,0,.99)` | `tier01-style-contract` | **8 passed** GREEN | GREEN (vacuity) |
| 6 | `globals.css` — `--m-grok` **value** `#5F6670` → `#00FF00` | `tier01-style-contract` | **8 passed** GREEN | GREEN (vacuity) |

Mutants 1–4 prove the lock, the roster order, the pinned Free values and the ratified dim value are
genuinely pinned. Mutants 5–6 are the basis of **N1**.
Transcript: `/private/tmp/debate-tiers-REV-S01-p1-correctness-tests/mutants-output.txt`.

### 1.3 The rendered page, real compiled CSS, both modes (the packet's UI duty)

My own stub API (`SessionSchema` / `AskAcceptedSchema`, logging every request body verbatim) on
`127.0.0.1:8794` and the UI dev server from **my** worktree on `127.0.0.1:8795`; measured in my own
tab in the harness browser pane with `getComputedStyle`. Both processes killed and the tab closed
before this handoff; V's `:3000`, `:8790`, `127.0.0.1:55432` and `.local/**` were never addressed.

**Every M-line in `DONE.md` §3 matches the artboards, in both modes.** Measured, not read:

- **M1** `role="radiogroup"`, `aria-label="Plan tier"`, `display: grid`,
  `grid-template-columns: 239.5px 239.5px` (= `repeat(2, minmax(0,1fr))`), `gap: 10px`,
  `margin-top: 20px`; DOM order `h1` → `.ndTier` → `.ndTopicBezel`; the bezel keeps its own
  `margin-top: 20px`; `previousElementSibling` of `.ndTier` is `null` — no visible label above it.
- **M2/M3** chosen `rgba(41,38,31,0.2)` / unchosen `rgba(41,38,31,0.1)` border; backgrounds
  `rgb(239,233,224)` = `#EFE9E0` and `rgb(253,251,246)` = `#FDFBF6`; radius 12px, padding 13px 14px,
  row-gap 9px, cursor pointer. Chamber: `rgba(242,234,217,0.18)` / `rgba(242,234,217,0.09)`,
  `rgb(34,29,23)` = `#221D17` and `rgb(24,20,16)` = `#181410`.
- **M4/M5** chosen pill `rgb(41,38,31)`/`rgb(249,246,241)` weight 700, unchosen transparent /
  `rgb(110,103,92)` weight 600, both 4px 12px · 999px · 10.5px. Chamber `rgb(242,234,217)` /
  `rgb(20,17,14)` and `rgb(156,144,122)`.
- **M6** 11.5px, `rgb(85,81,71)` = `#555147` (Chamber `rgb(181,168,143)` = `#B5A88F`); the two
  promise strings byte-exact.
- **M7** row `flex`/`wrap`/`10px`; ids at 10.5px weight 500, `rgb(110,103,92)` (Chamber
  `rgb(156,144,122)`), **font-family resolves to `"JetBrains Mono", …`** — `--font-mono-src` is
  supplied by `layout.tsx:24`, so the `var()` chain does not collapse; dots 7×7 at 50% radius,
  `rgb(180,85,45)` `#B4552D`, `rgb(138,99,201)` `#8A63C9`, `rgb(95,102,112)` `#5F6670`, **identical
  in both modes**; order `gpt-5.6-luna, claude-sonnet-5` / `gpt-5.6-sol, claude-opus-5, grok-4.6`.
  (`display: inline-flex` computes to `flex` because the element is a flex item — CSS blockification,
  not a deviation.)
- **M8 — the lock, counted in the browser against the artboards:**

  | screen | artboard | `opacity: 0.45` in the artboard | measured in the browser |
  |---|---|---|---|
  | Free, collapsed, empty question | 3 / 4 | 10 | **10** (9 locks + `Start run`) |
  | Free, panel open, empty question | 9 / 10 | 15 | **15** (14 locks + `Start run`) |
  | Free, panel open, question typed | 13 / 14 | 14 | **14**, `Start run` live at opacity 1 |
  | Premium | 5–6 / 11–12 | 0 | **0** locks (only `Start run` while empty) |

  **Probe 6 answered:** the lock reaches the `.ndSelect` **outer** box — both outer boxes measure
  `opacity: 0.45; cursor: not-allowed` via `:has(select:disabled)` in the real browser, while the
  native `<select>` itself sits at `opacity: 0` (MOCK-S01 F1). jsdom cannot see this; the render
  suite only asserts `.ndSelect select:disabled`, so this was unverified until now.
- **M8's "and nothing else"** — I diffed 16 computed properties of all 14 controls plus both
  `.ndSelect` boxes, locked vs unlocked. Only `opacity` and `cursor` change on 12 of them. The four
  range sliders also change `border-top-color`/`border-bottom-color`
  (`rgba(118,118,118,0.3)` locked vs `rgb(41,38,31)` unlocked — Chrome's UA `:disabled` rule), **but
  `border-*-width` is `0px` and `border-*-style` is `none` in BOTH states, on the box, the
  `::-webkit-slider-thumb` and the `::-webkit-slider-runnable-track`.** The colour is never painted.
  I raised this as a candidate finding and then refuted it: M8 holds.
- **M11/M12** `Start run` `opacity .45; cursor not-allowed` only while the question is empty, in both
  tiers; `⚙ OPTIONS` toggle at opacity 1 and operable in Free; the panel keeps its dashed 1px
  `rgba(41,38,31,0.2)` frame at opacity .88. **M14** chrome unchanged (the diff touches `globals.css`
  in exactly one delimited block). **M13** no colour literal in that block, and the block is the only
  `globals.css` change in the diff. **M15** pill and promise in `Plus Jakarta Sans`, ids in
  `JetBrains Mono`, at 10.5/11.5px.

### 1.4 The state machine and the wire — SPEC-v2 §2 steps 7–12, in a browser

| step | expected | measured |
|---|---|---|
| 7 | question typed, `Start run` available | typed; `startDisabled: false` |
| 8 | Premium unlocks; set high-stakes / high / depth 4 / both steering lines / scrutiny deep | all six applied |
| 9 | Free again → step-4 values return and re-lock; **question unchanged** | `standard / low / 2 / "" / "" / standard`, panel still open, question identical, Free wording back |
| 10 | Premium again shows what step 9 left; step-8 values **not** restored | `standard / low / 2 / "" / ""` — nothing restored |
| 11 | `POST /v1/asks` body carries `"plan_tier":"free"`, 202 | body verbatim below; 202, app pushed to `/debate/…` |
| 12 | same with `"plan_tier":"premium"`, 202 | body verbatim below; 202 |

```
POST /v1/asks :: {"question_line":"Remote work should be the default for knowledge workers.","plan_tier":"free","risk_tier":"standard","tier_source":"MACHINE_DEFAULT","tier_provenance_ref":"machine:plan-tier-free","composition_budget_tier":"low","depth_params":{"depth":2},"decision_scope":"personal","as_of":"2026-09-10T00:56:33.765Z","steering_presets":[],"steering_annotations":[]}
POST /v1/asks :: {"question_line":"Remote work should be the default for knowledge workers.","plan_tier":"premium","risk_tier":"standard","tier_source":"MACHINE_DEFAULT","tier_provenance_ref":"machine:plan-tier-free","composition_budget_tier":"low","depth_params":{"depth":2},"decision_scope":"personal","as_of":"2026-09-10T00:56:59.446Z","steering_presets":[],"steering_annotations":[]}
```

### 1.5 Candidates I raised and then refuted (recorded so nobody re-derives them)

1. **`tier_provenance_ref: "machine:plan-tier-free"` on a PREMIUM ask.** It is persisted
   (`packages/db/src/schema.ts:119`, written at `packages/db/src/index.ts:1244`) and rendered to the
   asker (`apps/ui/components/AnswerHonestyDrawer.tsx:86`), and the second wire capture above shows a
   Premium ask carrying it. **Not a finding:** SPEC-v2 R7 (`SPEC-v2.md:71-95`, added at REQ-REV pass 2
   as finding B3) rules this explicitly — *"The rule is on the mechanism, not on the tier: a value
   still standing from the Free lock when Premium is chosen (R8) is still a machine default and still
   carries `machine:plan-tier-free`."* The words the drawer renders for `MACHINE_DEFAULT` are put out
   of scope by R7 and already belong to row **V-14**. `resolveEffectiveRiskTier`
   (`packages/register/src/index.ts:424-455`) accepts any non-empty ref, so there is no 400 risk.
2. **The render suite makes `readSession` reject** (`tier01-new-plan-tier.test.tsx:60`), so the
   session-defaults effect never runs in any of the 21 cases. I checked whether a *successful*
   session could overwrite the Free-pinned gauges: it cannot — the effect writes only
   `decisionScope` and `asOf` (`page.tsx:103-115`).
3. **The M8 slider border-colour delta** — refuted in §1.3.
4. **`--font-mono` collapsing to an invalid value** if `--font-mono-src` were undefined — refuted:
   `layout.tsx:21-24` supplies it and the browser resolves JetBrains Mono.

### 1.6 Packet review (my first duty)

Every constant the packet quotes verifies: ticket `t_df524f91`, comment cursor 1 at dispatch (1
comment), HEAD `f6c147cc` detached with 0 dirty, base `7f89f7b7`, `DONE.md` is exactly 167 lines,
`design/S01/README.md` exactly 33, 14 `.dc.html` artboards + `canvas.json`, `SPEC-v2.md:232-268` is
exactly §2 steps 1–12, and the "no resume transport" claim is true of this harness. The five BUILD
seats' `SKILLS LOADED` lines each carry the full worker floor (`using-superpowers`,
`heartbeat-protocol`, `heartbeat-worker`, `test-driven-development`, `verification-before-completion`,
`systematic-debugging`) — no shortfall, no fabrication to report. Two defects: **N5**, **N6**.

---

## 2. Findings

### N1 (non-blocking) — the M2–M7 style assertions pin token **presence**, not `DONE.md`'s measured values

`tests/unit/tier01-style-contract.test.ts:153-189` (six tests) via `modeTokenPresence` at `:21-28`,
and the mapping claimed in `oracle/M-line-matrix-from-C5-READY.txt` ("M2 → … → style", …).
`modeTokenPresence` returns `[boolean, boolean]` — whether the token *name* is declared in `:root`
and in `html[data-mode="chamber"]`. `DONE.md` M2–M7 state *values*
(`--line-strong` = `rgba(41,38,31,.20)` / `rgba(242,234,217,.18)`, `--m-grok` = `#5F6670`, …).

Concrete inputs → wrong outcome: with chamber `--line-strong` set to `rgba(255,0,0,.99)` the suite
reports **8 passed**; with `--m-grok` set to `#00FF00` it reports **8 passed** (§1.2, mutants 5–6).
A red border on the chosen tier in Chamber, or a green Grok dot, leaves C4 and C5 fully green.

Class and members: every `modeTokenPresence` call — 6 tests, 12 token names (`--line-strong`,
`--shell`, `--line`, `--core`, `--ink`, `--bg`, `--muted`, `--text-2`, `--text-3`, `--m-gpt`,
`--m-claude`, `--m-grok`). Remedy shape: assert the value per mode, not the name. **I measured all
12 values in the rendered page in both modes and every one matches `DONE.md` (§1.3), so the product
is correct today — this sets WHEN, not WHETHER.** This is the finding I came closest to tiering as
blocking; I did not, because no delivered behaviour is wrong and the oracle is met.

### N2 (non-blocking) — `#maxTokens` is asserted at a value the real browser never holds

`tests/render/tier01-new-plan-tier.test.tsx:346` asserts
`document.querySelector('#maxTokens').value === "800"`. In Chrome the same expression is **`"768"`**:
the input is `min=128 max=4000 step=128`, so 800 is off the step ladder and the browser sanitizes the
value down to 768 (`valueAsNumber: 768`, attribute `value="800"`). jsdom does not implement range
step-sanitization, so the assertion is green in the harness and would be red in a browser.

No user-visible defect and `DONE.md` M10 passes by looking: the row's visible text reads
`Max tokens Per generated argument 800` and the fill `--nd-pct: 17.355…%` is computed from the React
value 800; `maxTokens` is a V2 knob and is not on the ask. The bounds are **pre-existing at base** —
this slice only added `disabled=` to that row — but the assertion is new here. Class: assertions on
`input[type=range].value` in jsdom where the value is off the step ladder; sole member today is
`maxTokens` (`treeDepth`, `branchingWidth`, `concurrency` are step-1 and their asserted values are
valid).

### N3 (non-blocking) — the page's local `modelIdentity` deviates from the ratified class vocabulary and diverges from `modelMeta` off-roster

`apps/ui/app/new/page.tsx:65-70` (`modelIdentity`) feeding `modelColor(…)` at `:208-212`. The
orchestrator's binding class-vocabulary ruling (cluster map §"shared class vocabulary") says the dot
takes *"its colour by the id's family through `modelKey`, `apps/ui/lib/models.ts`"*. The built page
instead maps id → maker with three case-sensitive `startsWith` prefixes. Measured (probe, §3):
for all five rostered ids the two agree exactly, so nothing is wrong on screen today; they diverge
for `openai-o3`, `sol-gpt-5`, `GPT-5.6-SOL`, `claude_opus`, `grok/4.6`, `gemini-3` — the page yields
`var(--m-default)` (grey) where `modelMeta(id).dot` yields the correct family colour, because
`modelKey` lowercases and uses `includes`. This is live risk, not hypothetical: row **V-7** records
that none of the five roster ids is a configured discovery target, so the roster will change.
One-line remedy: `modelMeta(modelId).dot`. (This is the probe-1 fold `DECISIONS.md` F2 asked the
correctness lens to settle: it is duplication **and** a behavioural narrowing.)

### N4 (non-blocking) — two new unguarded region readers of the class ticket `t_1e4fccc1` tracks

`tests/unit/tier01-style-contract.test.ts:11-16` (`declarationsIn`) and `:73-78` (`declarations`).
Both `return ""` when the selector is absent and both do
`slice(bodyStart, source.indexOf("}", bodyStart))` with the `-1` case unguarded — the ARCH-S01 F2 /
F11_F4 shape, added in the same slice that repaired one member of it at
`tests/unit/v2ui-pages.test.ts:83`. I checked all six call sites and none is vacuous today:
`carries()` runs `every()` over a non-empty list, `declarations(lockSelector)` and the two
`declarationsIn` uses feed exact `toBe`/`toEqual`, and `modeTokenPresence` turns an empty region into
`[false,false]`. So the guard is missing but no assertion is currently hollow — it is the
construction, not a live hole. Belongs on `t_1e4fccc1` as two more members.

### N5 (non-blocking, **packet defect against the orchestrator**) — the lens gloss names all three lenses

`packets/REV-S01-p1-correctness-tests.md:20`: *"Your lens is correctness-tests (correctness/tests ·
security/data-safety · product-truth)"*. The parenthetical is the reviewer contract's enumeration of
**all three** parallel lenses, pasted into this seat's own lens line. §1 and the ticket title say
`correctness/tests` alone. A blind seat reading §3 literally either triples its scope — three lenses'
work, three times the tokens, in a seat that must not read the other two — or drops its own. Remedy:
the gloss should name only this seat's lens.

### N6 (non-blocking, **packet defect against the orchestrator**) — the file contract forbids the refutation duty the same packet orders

`packets/REV-S01-p1-correctness-tests.md:15-16` gives an exhaustive `allowed` list and then
*"forbidden: everything else — in particular the slice's files"*. But `:17` and `:20` order
"probe, never read … refute", and `probes.md:5` (probe 3) says in as many words: *"choose M-lines,
**mutate the product in YOUR worktree**, watch the named assertion go RED, restore"*. Mutating the
product means writing the slice's files. Nothing in the packet reconciles the two; only the dispatch
prompt did ("temporary mutants for refutation are reverted before you hand off"). A seat with only
the packet must either skip probe 3 — losing the single highest-value reviewer technique — or breach
its contract. Remedy: the `allowed` list should carry the temporary-mutant exception with its
restore-and-verify obligation, as the dispatch prompt states it.

---

## 3. Recorded facts that are not findings

- **The plan tier is client-asserted, and a forged `premium` is accepted today.** Probe:
  `createDebate` with a complete config and `plan_tier: "premium"` returns **NO REFUSAL**; the API
  answers **202** for `premium` with no entitlement check (`tests/unit/api.test.ts:251-288`, re-run by
  me). This is **not** a finding at S01: SPEC-v2 §3 puts entitlement out of scope, S02 prices the
  tier, and S01 claims no enforcement anywhere — which is exactly the condition probe 4 sets. It is
  on the record here so S02's gate does not have to rediscover it.
- **Probe 5 answered — no production path is newly broken.** The two `createDebate` callers in the
  whole app are `app/new/page.tsx:166` (carries the tier) and `components/LibraryComposer.tsx:29`
  (config `{max_depth, branching, max_tokens}`). The Library path throws
  `ASK_FIELD_REQUIRED: risk_tier must be supplied explicitly…` — the **risk_tier** guard, which sits
  before the new one (`apps/ui/lib/api.ts:373-376`) and already refused this call at base. S01 adds no
  regression there; the `catch {}` → `/new?topic=` fallback is unchanged. The new guard is reachable
  and correct: a config complete but for the tier throws
  `ASK_FIELD_REQUIRED: plan_tier must be supplied explicitly…`, and `plan_tier: "gold"` throws
  `ASK_FIELD_REQUIRED: plan_tier must be free or premium.`
- **Probe 2 answered — the repaired guard is non-vacuous.** `region()`
  (`tests/unit/v2ui-pages.test.ts:28-34`) asserts `startIndex >= 0` and `endIndex > startIndex`
  before slicing, so a vanished anchor fails loudly instead of yielding an empty region that satisfies
  every `not.toContain`. The new render suite's own copy of the same read
  (`tier01-new-plan-tier.test.tsx:275-284`) carries the same two guards inline.
- **Cross-surface mount.** The four locked class families (`.ndSegItem`, `.ndSlider`,
  `.ndSteerInput`, `.ndSelect`) are rendered by exactly one file in the app —
  `apps/ui/app/new/page.tsx` — and `globals.css` carried no `:disabled` rule for them before this
  slice, so the new global lock rule cannot reach another screen. The genuinely shared surfaces are
  `AskRequestSchema` (exercised at the API edge: 202 free, 202 premium, 400 MALFORMED_REQUEST for
  `gold` and for absent) and `createDebate` (both callers, above).
- **The oracle's own numbers check out.** `DONE.md` M8 claims artboard 3 has exactly 10 occurrences
  of `opacity: 0.45` and artboard 13 exactly 14. Counted in the files: 10 and 14 (and 15 on artboards
  9/10, 0 on the Premium boards). The browser reproduces all four counts.

## 4. UNVERIFIED

- **Acceptance itself.** QA is V personally (`S01-46`); I ran SPEC §2 steps 7–12 against **my own**
  stub API and **my own** dev server, not the `:3000` merge candidate. Steps 1–6 I exercised
  programmatically, not by eye.
- **Keyboard, hover, focus and transitions** between the two options — `DONE.md` §5 says the artboards
  draw none of it, so there is no oracle to measure against; I did not test arrow-key movement inside
  the `radiogroup`, which `role="radiogroup"` would normally imply.
- **Firefox / Safari.** `:has(select:disabled)` and the range-input sanitization of N2 were measured
  in the harness's Chromium only. `.ndSlider::-moz-range-*` rules exist at `globals.css:6039-6062`
  but no Gecko engine was available to me.
- **`:3000`.** The mission facts and `dev-stack.md` (written 03:40) record V's https stack on `:3000`
  as pid 74445. At my teardown (04:0x) `:3000` has no listener and pid 74445 is gone; `:8790` and the
  three CLI bridges `:8791-:8793` are also not listening. I cannot say what its state was at my CLAIM
  because I did not measure it then. My only kill commands were `pkill -f "stub-api.mjs"`,
  `pkill -f "PORT=8795"` (an env assignment, which is not in a process's argv, so it matched nothing)
  and two port-scoped `lsof -t` kills for 8794/8795 — none of which can reach a process on 3000.
  Flagging it rather than assuming.
- **A cross-lane side effect I caused, reported against myself.** My teardown included
  `pkill -f "stub-api.mjs"`. `dev-stack.md` hands all three lenses the same recipe and at least one
  other lens named its stub identically (a `node stub-api.mjs` not mine is running now, pid 52297).
  If a parallel lens's stub was up at 04:04 when I fired that command, I killed it; I cannot prove
  otherwise. The security lens's dev server (`:8797`) was alive at 04:05 and gone at 04:07 — after
  my port-scoped kills, which cannot reach it, but I am not using that to clear the pkill. The
  product-truth lens's server (`:8851`) is up and untouched. **Operational fix for the fleet, worth
  a `TOOLING-TRAPS.md` heading: kill by port, never `pkill -f` a filename every seat shares.**

## 5. Predictions about the other two lenses (blind — I read neither)

I expect **security/data-safety** to land on the forgeable `plan_tier` (§3, first bullet) and to have
to decide, as I did, that SPEC-v2 §3 and the S02 hand-off make it a recorded fact rather than a
finding; if that lens tiers it blocking, the disagreement is about scope, not about the measurement,
and V's row for S02 pricing settles it. I also expect it to look at `PLAN_TIERS_SET` sitting before
`requireToken` in `createDebate` and to conclude, correctly, that the ordering leaks nothing — the
throw text is a client-side constant. I expect **product-truth** to measure the artboards and agree
on M1–M15, and I predict its likeliest miss is M8's "and nothing else" clause: a lens that stops at
the computed `border-color` delta on the four sliders (§1.3) will call it a colour change and file a
blocking finding, when `border-width: 0` / `border-style: none` in both states means it is never
painted — the refutation needs the pseudo-element measurement, not the box. Conversely, the thing I
most expect **both** other lenses to miss is N1: it is invisible unless you mutate a token's *value*
and watch the suite stay green, and neither the security nor the product-truth reading of
`DONE.md` naturally produces that mutant. If either lens reports a *product* defect against
`DONE.md` §3 that I marked matching, re-measure with the real compiled CSS before believing it —
five of the fifteen M-lines cannot be judged in jsdom at all.

---

Probes promoted to `.hermes/reports/debate-tiers/probes/`:
`REV-S01-p1-correctness-tests-clusters.sh`, `-mutants.py`, `-probe.test.ts`, `-stub-api.mjs`,
`-evidence.txt`.
