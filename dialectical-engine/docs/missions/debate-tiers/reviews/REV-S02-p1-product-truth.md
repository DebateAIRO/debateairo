# REV(S02) pass 1 — lens **product-truth** · seat `REV-S02-p1-product-truth` · ticket `t_cb78a63d`

**SKILLS LOADED:** `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` ·
`superpowers:verification-before-completion`

Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-p1-product/dialectical-engine`,
detached `9ef275aa`, `git status --porcelain` = 0 entries at claim **and** at handoff. No git write of
any kind. Blind: no sibling lens worktree, output or verdict was opened; the S02 lane was never entered.
Comments read through: 1.

---

## 1. Packet review (the packet is in my scope; its author cannot review it)

Checked mechanically at `9ef275aa`.

**Correct.** All seventeen `path:line` citations in the packet and `probes.md` land on the text they
quote: `apps/api/src/index.ts` `:300` `markAskRefusal(...): never`, `:516` `: askRefusal ? 422 : 500;`,
`:1207` `const roster = PLAN_TIER_ROSTERS[ask.plan_tier];`, `:1216` `"ASK_PLAN_TIER_MODEL_UNAVAILABLE",`,
`:1241` `panelSize: filteredPanel.length`, `:1305`, `:1310`, `:1325` `planTier: ask.plan_tier,`;
`packages/db/src/index.ts` `:848`, `:1196`, `:1239`, `:1253`; `apps/api/src/provider-discovery.ts:143`;
`apps/ui/app/new/page.tsx:162, :182`; `packages/critique/src/index.ts:334`. Base commits, head, the
two diff ranges and "no `DONE.md` exists" (`docs/missions/debate-tiers/slices/S02/` holds
`DECISIONS/PLAN/PROGRESS/SPEC-v2/SPEC` only) are all as stated. The comment cursor (1) matched.

**The review package is honest about its own scope.** The diffs are pathspec-filtered
(`-- apps packages tests migrations`); I checked that the filter hides nothing:
`git diff --name-only 3bf54957..HEAD` returns exactly the six files the filtered diff shows, and
`git merge-base --is-ancestor` confirms both `3bf54957` and `d2a58e9a` are ancestors of the head.

**Defects** — N5 and N6 below (one against COMMON §6 / the oracle, one against the frozen SPEC's
line citations). Two contract defects that cost a reader time but change no verdict are recorded in
my self-report §6: §2's `verification` line carries a UI clause on a `ui: no` slice, and §1's
`inputs` line carries a planning-review instruction (`git diff --stat -- docs/missions/debate-tiers`)
that does not bear on a code slice's verdict.

**Author `SKILLS LOADED` lines** are not in this lens's reach — I read no BUILD seat's handoff except
the C1 board export, and only to locate the R12 command (acceptance step 9 makes that mandatory).
The correctness lens owns that check.

---

## 2. What I re-ran (verbatim, three runs each, worst run reported)

Commands exactly as `cluster-map-PLAN-section-5.md` publishes them, from the worktree root.

| Cluster | `Test Files` | `Tests` | rc | runs |
|---|---|---|---|---|
| C1 `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | `2 passed (2)` | `25 passed (25)` | 0 | 3/3 identical |
| C2 `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | `3 passed (3)` | `55 passed (55)` | 0 | 3/3 identical |
| C3 `pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | `1 failed \| 1 passed (2)` | `3 failed \| 6 passed (9)` | 1 | 3/3 identical |
| C4 `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts` | `4 passed (4)` | `42 passed (42)` | 0 | 3/3 identical |

Every number reproduces the orchestrator's `reverify-9ef275aa.txt` exactly. **File counts pinned**, so
no vitest filter was silently dropped.

C3's three failures, named and dated **pre-existing**, all in `tests/architecture/s14-contract.test.ts`
(`S14 / AC-59..61 / W19 — native UI contract`): "uses the generated contract client for both browser
and SSR with no V2 wire mirror" · "FX-ORPH-04 walks web consumers in both directions and rejects the
death-list inventory" · "carries the S04 orphan-audit wording fix and deterministic locale tiebreak".
`BASELINE.md` carries `s14-contract` RED at base at 2/5; the slice's delta is **+1 file, +4 passing
tests, no new failure**. **None of the three is the slice's.**

---

## 3. My own probes and mutants

Both fixtures are promoted, with provenance headers and zero hard-coded absolute paths, to
`.hermes/reports/debate-tiers/probes/REV-S02-p1-product-truth.refusal-face.test.ts` and
`.hermes/reports/debate-tiers/probes/REV-S02-p1-product-truth.r12-readback.test.ts`.
Temporary copies under `tests/` were deleted; the worktree is byte-clean.

### 3.1 The 422 face, every tier × panel shape (charge 2)

Built from the CLAIM (R6/R7/R9/R10), not from the author's tests: my own `AskRequest`, my own panels,
through the real route with `buildApi(...).inject(...)`. Output verbatim:

```
TODAY free (sol+opus healthy)        422  ASK_PLAN_TIER_MODEL_UNAVAILABLE
  The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now
TODAY premium (sol+opus healthy)     422  ASK_PLAN_TIER_MODEL_UNAVAILABLE
  The premium plan needs grok-4.6, and it is not available right now
empty panel free                     422  ASK_PLAN_TIER_MODEL_UNAVAILABLE
  The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now
empty panel premium                  422  ASK_PLAN_TIER_MODEL_UNAVAILABLE
  The premium plan needs gpt-5.6-sol, claude-opus-5, grok-4.6, and they are not available right now
free, one member present             422  ASK_PLAN_TIER_MODEL_UNAVAILABLE
  The free plan needs claude-sonnet-5, and it is not available right now
free, other member present           422  ASK_PLAN_TIER_MODEL_UNAVAILABLE
  The free plan needs gpt-5.6-luna, and it is not available right now
premium, one of three present        422  ASK_PLAN_TIER_MODEL_UNAVAILABLE
  The premium plan needs gpt-5.6-sol, grok-4.6, and they are not available right now
free complete                        202
premium complete                     202
```

**R7 holds in all seven refusal shapes**: the tier name and every missing roster member, spelled
exactly as `packages/contract/src/plan-tiers.ts:9-10` spells them, with no member named that is not
missing. **The honesty law is satisfied by the code as built.**

### 3.2 What V reads on the form today (charge 2, acceptance step 6)

Through the **real** `createDebate` (`apps/ui/lib/api.ts:367`) → the **real** `createContractClient`
→ the real route, i.e. the exact value `/new` assigns at `page.tsx:162` and renders at `:182`:

```
FREE   : ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now
PREMIUM: ASK_PLAN_TIER_MODEL_UNAVAILABLE: The premium plan needs grok-4.6, and it is not available right now
```

**Answer to the charge: yes, the refusal text tells V the truth** — both missing Free models are
named, and `grok-4.6` is named for Premium — **but it reaches the asker with the internal error code
welded to the front** (`packages/contract/src/client.ts:88-91`). See N1.

### 3.3 R4's equality (charge 2) — measured

`panelSize` passed to `resolveEnvelopeBasis` (`apps/api/src/index.ts:1241`) against a panel
deliberately larger and differently ordered than the roster: `free → [2]` (roster 2),
`premium → [3]` (roster 3). **R4 holds.**

### 3.4 R9 sweep — place by place (R9 demands the sweep be recorded)

Every place the panel is built or consumed, swept at `9ef275aa`:

| # | place | verdict |
|---|---|---|
| 1 | `apps/api/src/index.ts:1206` raw panel from `resolveDiscoveredPanel()` | source |
| 2 | `:1208-1210` `filteredPanel` = `roster.map(find).filter(defined)` | **the only choke point**; roster-ordered |
| 3 | `:1211-1213` `missing` | complement of 2 |
| 4 | `:1214-1221` refusal if any missing | before everything below |
| 5 | `:1222` `makers` | from filtered |
| 6 | `:1229` `registerRef` | from filtered |
| 7 | `:1241` `panelSize` | from filtered |
| 8 | `:1249` returned `discoveredPanel` | **is** `filteredPanel` |
| 9 | `:1305` destructured in `submit` | filtered |
| 10 | `:1327` into `startRun` | filtered |
| 11 | `packages/db/src/index.ts:1198` server write path | filtered |
| 12 | `:1240` legacy write path | filtered |
| 13 | `:1535` read back onto the run | filtered |
| 14 | `apps/runner/src/index.ts:1366` the runner iterates `run.discoveredPanel` | filtered — **but see N2** |

No fallback branch anywhere reintroduces a non-roster member. Probe: a six-member discovery
containing all five roster ids plus `some-other-model`, asked as `free`, returns exactly
`["gpt-5.6-luna","claude-sonnet-5"]`. **R9 holds at admission.**

### 3.5 R12 / acceptance step 9 — end to end on the embedded database (charge 2, probe 7)

C1 exercises `RunRepository.startRun` directly; C4 **mocks** `startRun`. Nobody runs
ask → `evaluateAskAdmission` → `startRun` → `SELECT plan_tier`. I built that, on embedded Postgres,
for **all four cells** (probe 7 asks both tiers × both paths; C1 covers two):

```
server/free:    plan_tier=free     agent_count=2
server/premium: plan_tier=premium  agent_count=3
legacy/free:    plan_tier=free     agent_count=2
legacy/premium: plan_tier=premium  agent_count=3
SELECT plan_tier FROM core.run WHERE run_id='97809cc4-…'  ->  free
```

`agent_count` equals the roster size in every cell — R4's persisted consequence, measured, not argued.
**R12 holds, including the two cells C1 does not cover.** The read-back command acceptance step 9
requires is present in the package at
`review-packages/S02-p1/board/BUILD-S02-C1.t_422678f3.txt:279`, so step 9 is runnable.

### 3.6 R8 on a real database

Refused Premium ask (today's fleet shape) against embedded Postgres: `core.run` 4 → 4,
`core.question_liveness_event` 4 → 4, refusal `AskRefusal / ASK_PLAN_TIER_MODEL_UNAVAILABLE`.
**No run row, no liveness row.** (C2's case 8 asserts `connectCalls === 0` against a stub; this is
the same claim against a real database.)

### 3.7 Mutants — property · mutant · outcome · restore

Every mutant lived only in my worktree, was restored from a byte-captured copy (`shasum -a 256`
matched on every restore), and `git status --porcelain` was empty after each.

| # | property | mutant | outcome |
|---|---|---|---|
| M1 | the refusal names the missing models | message → `The ${tier} plan is not available right now` | **caught** — C2 `2 failed \| 53 passed (55)`; both catchers are **Premium-only** (`:153`, `:165`) |
| M2 | …**when every member is missing** | name no model **iff** `missing.length === roster.length` | **SURVIVES** — C2 `3 passed (3)` / `55 passed (55)`, C3 at baseline, C4 `42 passed (42)` → **B1** |
| M4 | R6's pinned order (acceptance step 7) | roster check moved **after** `assertMakerAdmission` | **caught** — C2 `3 failed \| 52 passed (55)` (`:140`, `:176`, `:187`). R6's order is genuinely pinned. |
| M5 | R2 — rosters are data | tier ternary with duplicated model literals in `apps/api` | **caught**, by "keeps every roster model id in one canonical declaration" (`:89`) — *not* by the branch guard |
| M6 | R2 — no `if` on a tier name selects models | `let roster = PLAN_TIER_ROSTERS.premium; if (ask.plan_tier === "free") roster = PLAN_TIER_ROSTERS.free;` | **SURVIVES** — `tiers-s02-rosters.test.ts` fully green → **N3** |

Post-restore re-verification at the restored head: C2 `3 passed (3)` / `55 passed (55)`,
C3 `1 failed | 1 passed (2)` / `3 failed | 6 passed (9)`, C4 `4 passed (4)` / `42 passed (42)`.

---

## 4. Findings

### B1 (BLOCKING) — the all-members-missing refusal message is unpinned, and that is today's only runnable case

**Where.** `tests/unit/tiers-s02-admission.test.ts:140` ("refuses Free admission with the
tier-unavailable code when every roster member is missing"), `:176` ("refuses an empty panel with the
tier-unavailable code before maker or envelope errors"), `:187` ("maps a real tier-unavailable
admission refusal to the HTTP 422 face"). All three assert the **code**; **none asserts the message**.

**Against what.** `oracle/SPEC-v2-section-1-requirements.md` R15, lines 133-137, in its own words:
"an ask whose tier leaves the filtered panel EMPTY answers `422` with `error:
"ASK_PLAN_TIER_MODEL_UNAVAILABLE"` **and a message naming every roster member of that tier**, and the
test asserts the code is **not** `MAKER_INVENTORY_UNSATISFIED`." The code half and the
not-MAKER_INVENTORY half are built. The message half is not.

**Concrete failing outcome.** Mutant M2 — a build whose Free refusal reads "The free plan is not
available right now" and names neither model — ships with **C2 55/55 green, C3 at baseline, C4 42/42
green**. Every message assertion in the slice (`:153`, `:165`) is Premium-only, so the Free branch has
no guard at all.

**Why it is blocking and not cosmetic.** `/new` preselects Free (`apps/ui/app/new/page.tsx:77`), and
on today's fleet the Free filter is empty, so **every ask V starts today** takes exactly this branch.
Acceptance step 6 requires the on-screen error to name `gpt-5.6-luna` **and** `claude-sonnet-5`; the
honesty law (`INSTRUCTIONS.md`: "an unavailable model is named in a refusal, never substituted, never
silently dropped") has its flagship case here. The behaviour is correct today — §3.1 proves it — but
nothing holds it correct, on the one path the product actually takes.

**Classification (charge 4): a REWORK item under SPEC-v2**, not a V row. R15 is frozen SPEC text that
the slice does not meet; nothing new needs deciding.

**The CLASS, and its members** (a finding is a sample; fix the class): *refusal-message content is
asserted for some tiers and not others.* Members, to be fixed and swept mechanically —
(a) all-members-missing, Free, at the admission face (`:140`);
(b) all-members-missing, empty panel (`:176`);
(c) the HTTP 422 face (`:187`) — asserts `response.json().error` only, never `.message`;
(d) all-members-missing, **Premium** (empty panel, `premium`) — no test exists in any cluster.
§3.1 gives the expected string for every one of the four.

---

### N1 (non-blocking) — V reads the internal error code; R10's "unchanged" is false as built

`packages/contract/src/client.ts:88-91` composes `${serverCode}: ${serverMessage}`, so the string
`/new` renders (`page.tsx:162,182`) is
`ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not
available right now`. SPEC-v2 R10 states the message "reaches the browser unchanged" — measured false.
Acceptance step 6 is still satisfied (the members are named), and S02 adds no UI code, so this is
**not** a REWORK item: **V row 1** below. Ticket: yes, this pass.

### N2 (non-blocking) — the tier governs admission, not what actually argues; the runner may still shrink the panel

`apps/runner/src/index.ts:1366-1414`: at claim time every panel member that fails re-probe is pushed
to `absentAtClaim` and `continue`d; the run proceeds whenever `configuredMakers.length >= 1`
(`:1415-1421`). A Premium run admitted with three models can therefore deliver **two, or one** —
with no refusal anywhere — which is acceptance steps 2 and 4 ("exactly two / exactly three distinct
models argue") failing on a live stack while every S02 test is green. It is **not** an R9 violation:
R9 governs *starting* a run, and the shrink happens after. Nor is it silent — it is recorded as a
condition mark `CLAIM_PANEL_REVISED:<provider_ref>=<failureCode>` (`:2117-2118`, `:2130-2136`) — but
it is keyed by **`provider_ref`, not the model id** the tier promised, so the honesty law's "named"
is served by a string V never chose. SPEC-v2 carries no requirement here → **V row 2**. Ticket: yes.

### N3 (non-blocking) — the R2 branch guard misses an `if` on the tier name

`tests/architecture/tiers-s02-rosters.test.ts:109` ("keeps plan-tier model selection out of if and
case branches") fires only on a line that contains **both** `free` **and** `premium` **and** `===` or
`case ` (`:66-70`). Mutant M6 —
`let roster = PLAN_TIER_ROSTERS.premium; if (ask.plan_tier === "free") roster = PLAN_TIER_ROSTERS.free;`
— is exactly what R2 forbids ("No `if` on a tier name selects models anywhere else") and leaves the
suite fully green: neither line names both tiers, and no model literal is duplicated so `:89` does not
fire either. The matching is also case-sensitive, so `PREMIUM_MODELS` does not count as `premium`.
The built code does not violate R2; the **guard** is weaker than the requirement it carries. Related
residue already ticketed: `t_2e74f402` (the case-3 predicate worded twice). Ticket: yes.

### N4 (non-blocking) — a roster guard pinned to absolute line numbers in a file S02 does not own

`tests/architecture/tiers-s02-rosters.test.ts:89-105` asserts the exact strings
`apps/ui/components/landing/cards.ts:28` and `:27`. Any unrelated edit to the landing page shifts
those lines and turns the S02 roster guard red with a failure that names neither S02 nor the real
cause. `TOOLING-TRAPS` "Variant 6: an acceptance pinned to ABSOLUTE LINE NUMBERS" is this class.
Remedy shape: assert the **file set** per model id, and the line only for `plan-tiers.ts`.
Ticket: yes.

### N5 (non-blocking, against the orchestrator) — two authorities disagree about the `grok-4.6` target

`COMMON §6` row "the fleet today" says "**No** `gpt-5.6-luna`, `claude-sonnet-5` **or `grok-4.6`**
target exists"; the oracle's Precondition A says "`grok-4.6`'s bridge answers
`CLI_HANDSHAKE_UNAVAILABLE`" — i.e. the target exists and is unhealthy. Both readings produce the
same Premium refusal naming `grok-4.6` (§3.1, rows 2 and 7), so no verdict changes. I cannot settle
which is true: `.local/**` is this mission's no-touch surface and I did not read it. **UNVERIFIED**,
and the two texts should be reconciled to one owner before V's test point. Ticket: yes.

### N6 (non-blocking) — the frozen SPEC's line citations drifted under C1

`oracle/SPEC-v2-section-1-requirements.md` R4 cites `packages/db/src/schema.ts:123` for the persisted
`discovered_panel`; at `9ef275aa` `:123` is `agentCount` and `discoveredPanel` is `:124`, because C1
inserted `planTier` at `:121`. R3 cites `packages/db/src/index.ts:973-979` for `model_id`; the
`DiscoveredPanelMember` interface is `974-980`. R14's own note already states the rule ("a line
citation into an append-only file is checked at the moment it is used"); the SPEC is frozen, so this
is a note for whoever hands V the oracle, not a rework. Ticket: yes.

### N7 (non-blocking) — the landing page shows a model no tier can field

`apps/ui/components/landing/cards.ts:29` renders `Google · Gemini · gemini-3-ultra` in the sample
exchange cards. `gemini-3-ultra` is in neither roster (`plan-tiers.ts:9-10`) and my own sweep of the
five roster ids finds no other declaration. S02 is the slice that makes the roster the truth about
who argues, which puts the marketing surface one step further out of step with it. It is copy, it is
outside the slice's diff, and SPEC-v2 says nothing about it — **V's call if she wants it**, recorded
here so it is not lost. Ticket: yes.

---

## 5. UNVERIFIED — what this lens could not do, and why

- **Acceptance steps 1–4 and 8** (which models actually argue; restore-and-rerun). They need row V-7
  (V's own operation on `.local/dev-auth/api.env`) and a live stack. Per my packet these are
  UNVERIFIED lines, not findings. What I *can* say statically: the persisted, filtered panel is what
  the runner iterates (`apps/runner/src/index.ts:1366`), so the mechanism that would make steps 2 and
  4 pass is wired — subject to N2.
- **Step 5** (put a member out of reach) — nothing to do before V-7, as the oracle itself records.
- **Whether a `grok-4.6` discovery target exists at all** — N5; `.local/**` is no-touch.
- **Both display modes.** `ui: no`; no UI surface is under review and the refusal text is
  mode-independent.
- **The real dev database.** Never touched; every database assertion above is on the embedded
  Postgres that `tests/support/testDatabase.ts` starts per run on an OS-assigned port. I started no
  listener and took no port beyond that; nothing was listening on `:3000`, `:3001`, `:8790`–`:8793`
  or `:55432` at my handoff that I put there.

---

## 6. Verdict — **REWORK**, lens product-truth, pass 1 of 3

One blocking finding: **B1**. Seven non-blocking: **N1–N7**, each ticketed this pass.

The slice's *behaviour* is the best-evidenced part of it — I attacked R4, R6's order, R7, R8, R9 and
R12 with my own fixtures and four mutants and could refute none of them, and the R12 path is now
verified end to end on a real database in two cells nobody had run. The rework is not about what the
code does; it is about the one property the suite leaves unheld, on the one path every ask takes
today.

---

## 7. Predictions about the other lenses (falsifiable; written before any contact)

I expect **correctness/tests** to land on the same hole from the opposite side and to call it
differently: they will run the R15 seven-test census, find seven test names, and — if they check
names rather than assertions — mark R15 satisfied and PASS. If they mutate, they will find M2 as I
did, and their verdict will agree; if they only read, we will disagree and the union will carry it.
I predict they raise N3 and N4 as their own (the `tierBranchLines` predicate and the absolute line
pins are squarely theirs), and that they also flag the `evaluator-database.test.ts` fixture rename
(`model:product-a` → `gpt-5.6-luna`) as a possible vacuous assertion — I judge it necessary rather
than vacuous, since the panel is now filtered, and I expect that to be a live disagreement.
I expect **security/data-safety** to PASS on the refusal path itself: probe 4's hunt for a 500 comes
up empty — `markAskRefusal` is `: never` (`:300`) and the empty-panel case returns 422, which I
measured — and probe 5's no-lease claim I confirmed against a real database (§3.6). Their finding, if
they have one, will be probe 6's client-asserted `plan_tier`, which is already row **V-20**, so it
should be folded rather than re-opened. The thing I would check first if I were them, and which I
could not reach from this lens, is whether `PLAN_TIER_ROSTERS[ask.plan_tier]` can be reached with a
`plan_tier` that survived `.strict()` parsing but is not in the enum — my probes only ever sent valid
tiers. Finally, I predict **neither** lens reaches N2 (the runner's claim-time shrink): it is two
files outside the diff and three hops past the slice boundary, and both of their charges point
inward.

---

## 8. Rows for V (`V-ROW: NEW` — the orchestrator transcribes and numbers these; I never write DECISIONS.md)

`V-ROW: NEW` · S02 `t_e4b4ab3a` · **The tier refusal reaches the asker with the internal error code
welded to the front.** Measured at the real route through the real client and the real `createDebate`:
`/new` renders `ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan needs gpt-5.6-luna, claude-sonnet-5,
and they are not available right now`. The prefix is `packages/contract/src/client.ts:88-91`, which
composes `${serverCode}: ${serverMessage}` for every non-2xx the app shows; SPEC-v2 R10 states the
message reaches the browser "unchanged", which is false as built. Acceptance step 6 is satisfied
either way — the members are named — and step 7 reads the code in devtools, where it belongs.
Recommended default: leave it for S02 and route the copy change to its own slice, because the prefix
is shared by every error surface in the app and stripping it here would either special-case one code
or change the error contract every page depends on. Smallest yes/no for V: "Should the tier refusal
reach the asker without the `ASK_PLAN_TIER_MODEL_UNAVAILABLE:` prefix?" · VERDICT leave it, route it /
CONFIDENCE medium / STRONGEST COUNTER: this is the sentence the entire tier feature says to a paying
user on the very first ask they make today, and it opens with a constant no user can act on — if V
wants it clean, the honest fix is a one-line display rule at `page.tsx:162` that shows
`exc.serverMessage` when present, which touches one file and no contract.

`V-ROW: NEW` · S02 `t_e4b4ab3a` · **The tier decides who is admitted, not who actually argues — the
runner may still deliver a shorter panel, and it names the provider rather than the model.** S02
refuses an ask whose roster is incomplete at admission, but `apps/runner/src/index.ts:1366-1421`
re-probes each pinned member when it claims the work item and drops the absent ones, proceeding
whenever one maker survives. A Premium run admitted with three models can therefore answer with two
or one, with no refusal and every S02 suite green — which is acceptance steps 2 and 4 failing on a
live stack. It is recorded, not silent: condition mark
`CLAIM_PANEL_REVISED:<provider_ref>=<failureCode>` (`:2117-2118`, `:2130-2136`) — but keyed by
`provider_ref`, so the model the tier promised is never named, which is the one thing the honesty law
asks for by name. R9 is not violated (it governs *starting* a run) and SPEC-v2 carries no requirement
here. Recommended default: leave the runner alone in S02 and open a slice that (a) names the model id
in the claim-time mark and (b) decides whether a tier run may serve a shortened panel at all.
Smallest yes/no for V: "May a Premium run that loses a model after it starts still answer with the
models that are left?" · VERDICT leave it, open the slice / CONFIDENCE medium / STRONGEST COUNTER:
the whole point of the tier is a promise about which models see your question, and a promise enforced
only at admission is a promise kept only until the first probe fails — if V rules that a tier run must
never shrink, the runner needs a typed terminal failure and the panel-revision path becomes a refusal,
which is a slice of its own and not a step here.
