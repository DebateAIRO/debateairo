# REV(S02) pass 2 — lens **product-truth** · seat `REV-S02-p2-product-truth` · ticket `t_37e841db`

**SKILLS LOADED:** `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` ·
`superpowers:verification-before-completion`

Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-p2-product/dialectical-engine`,
detached `88f8a01f`, `git status --porcelain | wc -l` = **0** at claim **and** at handoff. No git write of
any kind. Blind: the sibling `rev-s02-p2-correctness` worktree, its outputs and the S02 lane were never
opened; the `:3000` stack, `.local/**`, the live database on `127.0.0.1:55432` and V's desktop were never
touched; no dev server and no browser window was started. Range under review `9ef275aa..88f8a01f`.
Comments read through: 1.

---

## 1. Packet review (the packet is in my scope; its author cannot review it)

Every constant re-measured from my cwd at `88f8a01f`.

**Correct.** Head `88f8a01f` and base `9ef275aa` (`git rev-parse --short HEAD`) · comment cursor 1
(the ticket carried exactly one comment at claim) · "a `ui: no` slice — no `DONE.md` exists"
(`docs/missions/debate-tiers/slices/S02/` holds `DECISIONS/PLAN/PROGRESS/SPEC-v2/SPEC` only) · the
README's `664`-line product diff (`wc -l` = 664) and `7 files changed, 373 insertions(+), 41
deletions(-)` (my own `git diff --stat 9ef275aa..88f8a01f -- apps packages tests migrations` is
byte-identical to `diffstat.txt`) · the three commits in `commits.txt` · every input path resolves ·
the `allowed` list covers every deliverable this node owes (artifact, promoted probes, temporary
fixture under `tests/`, self-report) and nothing more.

**The trap the packet names is real and I hit the right side of it.** From my cwd,
`git diff --stat 07606035..c29741da -- docs/missions/debate-tiers` returns
`5 files changed, 56 insertions(+)`; the git-root-relative spelling
(`-- dialectical-engine/docs/missions/debate-tiers`) returns an **empty** diff. The packet's warning
is accurate and load-bearing.

**Defect N4 below** — the same `inputs` line asserts that this diff "is exactly what the seats under
review changed in the mission tree". They changed **nothing** there: `git diff --name-only
9ef275aa..88f8a01f` is seven code and test files and zero `docs/` files. The five mission files in
that range are the orchestrator's own records.

**Author `SKILLS LOADED` lines.** All three FIX handoffs open with a `SKILLS LOADED` line naming ten
paths each, above the `heartbeat-worker` floor (`test-driven-development`,
`verification-before-completion`, `systematic-debugging`, `receiving-code-review` all present);
the orchestrator states it verified them against the Codex rollout bodies, which I cannot reach from
a review worktree. No shortfall visible from here.

---

## 2. What I re-ran (verbatim, three runs each, worst run reported)

Commands exactly as `review-packages/S02-p1/cluster-map-PLAN-section-5.md` publishes them, from my
worktree root. Script: `/private/tmp/debate-tiers-REV-S02-p2-product-truth/clusters.sh`.

| Cluster | `Test Files` | `Tests` | rc | runs |
|---|---|---|---|---|
| C1 `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | `2 passed (2)` | `27 passed (27)` | 0 | 3/3 identical |
| C2 `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | `3 passed (3)` | `58 passed (58)` | 0 | 3/3 identical |
| C3 `pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | `1 failed \| 1 passed (2)` | `3 failed \| 6 passed (9)` | 1 | 3/3 identical |
| C4 `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts` | `4 passed (4)` | `42 passed (42)` | 0 | 3/3 identical |

Every number reproduces `reverify-88f8a01f.txt` exactly, **file counts pinned**, so no vitest filter
was silently dropped. Deltas against the pass-1 head: C1 `25 → 27` (+2, F1's two pre-0061 cases),
C2 `55 → 58` (+3, F2's three new cases), C3 and C4 unchanged.

C3's three failures, named and dated **pre-existing**, all in `tests/architecture/s14-contract.test.ts`
(`S14 / AC-59..61 / W19 — native UI contract`): "uses the generated contract client for both browser
and SSR with no V2 wire mirror" · "FX-ORPH-04 walks web consumers in both directions and rejects the
death-list inventory" · "carries the S04 orphan-audit wording fix and deterministic locale tiebreak".
`BASELINE.md` carries `s14-contract` RED at base at 2/5. **None of the three is this slice's**, and
this pass added none.

### The two promoted pass-1 probes of my lens, re-measured at `88f8a01f`

| probe | at `9ef275aa` (pass 1) | at `88f8a01f` (mine, today) |
|---|---|---|
| `REV-S02-p1-product-truth.refusal-face.test.ts` → `tests/unit/` | `1 passed (1)` / `5 passed (5)` | `1 passed (1)` / `5 passed (5)`, rc 0 |
| `REV-S02-p1-product-truth.r12-readback.test.ts` → `tests/integration/` | `1 passed (1)` / `4 passed (4)` | `1 passed (1)` / `4 passed (4)`, rc 0 |

Both temporary copies were deleted; `git status --porcelain` = 0 after each.

**The seven refusal shapes are byte-identical to pass 1** (charge 2.1, SPEC-v2 §2 steps 5–7 as far as
tests carry them):

```
TODAY free (sol+opus healthy)    422 ASK_PLAN_TIER_MODEL_UNAVAILABLE
  The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now
TODAY premium (sol+opus healthy) 422 ASK_PLAN_TIER_MODEL_UNAVAILABLE
  The premium plan needs grok-4.6, and it is not available right now
empty panel free                 422  … needs gpt-5.6-luna, claude-sonnet-5, … they are …
empty panel premium              422  … needs gpt-5.6-sol, claude-opus-5, grok-4.6, … they are …
free, one member present         422  … needs claude-sonnet-5, and it is …
free, other member present       422  … needs gpt-5.6-luna, and it is …
premium, one of three present    422  … needs gpt-5.6-sol, grok-4.6, and they are …
free complete                    202
premium complete                 202
=== ON-SCREEN AT /new, TODAY ===
FREE   : ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now
PREMIUM: ASK_PLAN_TIER_MODEL_UNAVAILABLE: The premium plan needs grok-4.6, and it is not available right now
=== R4 === free panelSize=[2] roster=2 · premium panelSize=[3] roster=3
=== R9 free panel from a six-member discovery === ["gpt-5.6-luna","claude-sonnet-5"]
```

**R12 / acceptance step 9, re-measured because F1 rewrote the write path** (charge 2.3) — all four
cells on embedded Postgres, through ask → `evaluateAskAdmission` → `startRun` → `SELECT plan_tier`:

```
server/free:    plan_tier=free     agent_count=2
server/premium: plan_tier=premium  agent_count=3
legacy/free:    plan_tier=free     agent_count=2
legacy/premium: plan_tier=premium  agent_count=3
=== R8 ON A REAL DATABASE === refusal=AskRefusal/ASK_PLAN_TIER_MODEL_UNAVAILABLE
core.run 4 -> 4 · question_liveness_event 4 -> 4
=== STEP 9, RUN VERBATIM ===
SELECT plan_tier FROM core.run WHERE run_id='38a035ce-1df5-4016-8986-717332cf6e81'  ->  free
```

F1 made **both** write paths conditional — the legacy `INSERT` drops the `plan_tier` column and
shifts every bind when `information_schema` says the column is absent
(`packages/db/src/index.ts:635-646` the probe, `:1138-1139` the flag, `:1269-1288` the offset INSERT),
and the server path strips `'planTier'` from the JSON payload when `pg_get_functiondef` does not
mention it (`:1198-1206`). **On a migrated database all four R12 cells still read back**, measured
above. R12 holds at this head.

---

## 3. My own probes and mutants (property · mutant · outcome · restore)

Every mutant lived only in my worktree, was restored **from a byte-captured copy taken at run time**
(`shasum -a 256` equal on every restore), and `git status --porcelain` was **0 entries** after each.
Harness: `/private/tmp/debate-tiers-REV-S02-p2-product-truth/mutant.sh`.

| # | property under test | mutant | outcome at `88f8a01f` |
|---|---|---|---|
| M2 (re-applied, charge 2.1) | the refusal names the missing models **when every member is missing** | name no model iff `missing.length === roster.length` | **CAUGHT** — C2 `1 failed \| 2 passed (3)` / `4 failed \| 54 passed (58)`; the four failures are exactly class members (a) `:140`, (b) `:187`, (c) `:199`, (d) `:154` |
| M6 (re-applied, charge 2.2) | R2 — no `if` on a tier name selects models | `let roster = PLAN_TIER_ROSTERS.premium; if (ask.plan_tier === "free") roster = PLAN_TIER_ROSTERS.free;` in `apps/api/src/index.ts` | **CAUGHT** — C3 `2 failed (2)` / `4 failed \| 5 passed (9)`, the new failure being `keeps plan-tier model selection out of if and case branches`. C2 stayed `58 passed (58)`, so the mutant is behaviour-preserving and only the architecture guard can see it |
| M14 (re-applied, charge 2.2) | an unrelated edit to a file S02 does not own must **not** turn the S02 guard red | one comment line inserted above `apps/ui/components/landing/cards.ts:27` | **ACCEPTED** (false positive gone) — C3 `1 failed \| 1 passed (2)` / `3 failed \| 6 passed (9)`, the three `s14-contract` failures only |
| MFP (charge 2.2, the false-positive half of N3) | copy that branches on a tier name but selects no models must **not** be condemned | `export function planTierLabel(planTier: string) { const label = planTier === "free" ? "Free plan" : "Premium plan"; if (planTier === "free") return …; return …; }` in `cards.ts` — both tier names, `===`, an `if` and a ternary | **ACCEPTED** — C3 at baseline. The predicate now binds a tier-aware branch to an actual `PLAN_TIER_ROSTERS` access |
| **M2b** (mine) | R7 — the refusal text contains **the tier name** for the single-missing shape | drop the tier name iff `missing.length === 1` | **SURVIVES** — C2 `3 passed (3)` / `58 passed (58)` → **N1** |
| M2c (mine, the control for M2b) | …and the missing model id for that shape | drop the model name iff `missing.length === 1` | **CAUGHT** — C2 `1 failed \| 2 passed (3)` / `1 failed \| 57 passed (58)` at `:164`. The honesty law's core **is** held for that shape |
| **MDUP** (mine) | R1/R2 — "one canonical declaration" per model id | a second declaration of **both** rosters (`LEGACY_FREE_MODELS`, `LEGACY_PREMIUM_MODELS`) added to `packages/contract/src/plan-tiers.ts` itself | **SURVIVES** — C3 at baseline → **N2** |
| MDUP2 (mine) | the same, in the other allow-listed file | a second `claude-opus-5` literal added to `apps/ui/components/landing/cards.ts` | **SURVIVES** — C3 at baseline → **N2** |

Promoted, runnable from any worktree (`WORKTREE=<root>` or argv), and **re-run from the promoted
copy** before this handoff (`M2b SURVIVES · MDUP SURVIVES · both restores byte-equal · dirty 0`):
`.hermes/reports/debate-tiers/probes/REV-S02-p2-product-truth--mutant-message-and-declaration.sh`.

### 3.1 The new code `ASK_PLAN_TIER_INVALID` — judged, with my own fixture

The dispatch comment puts F2's new refusal code in scope. I built a fixture that sends every
out-of-vocabulary tier a client could send through the **real** route with a **fully healthy**
five-model panel, so nothing but the tier vocabulary can refuse, and then through the **real**
contract client and the **real** `createDebate`. Promoted:
`.hermes/reports/debate-tiers/probes/REV-S02-p2-product-truth.invalid-tier-face.test.ts`
(`Test Files 1 passed (1)` / `Tests 3 passed (3)`, rc 0). Verbatim:

```
=== POST /v1/asks, full healthy panel, only the tier varies ===
gold           status=400 error=MALFORMED_REQUEST   message=<zod issue array: expected one of "free"|"premium">
constructor    status=400 error=MALFORMED_REQUEST   …
__proto__      status=400 error=MALFORMED_REQUEST   …
toString       status=400 error=MALFORMED_REQUEST   …
FREE (case)    status=400 error=MALFORMED_REQUEST   …
empty string   status=400 error=MALFORMED_REQUEST   …
number 1       status=400 error=MALFORMED_REQUEST   …
null           status=400 error=MALFORMED_REQUEST   …
missing key    status=400 error=MALFORMED_REQUEST   …
=== ON SCREEN AT /new ===
gold        : ASK_FIELD_REQUIRED: plan_tier must be free or premium.
constructor : ASK_FIELD_REQUIRED: plan_tier must be free or premium.
premium     : <no error thrown>
=== evaluateAskAdmission() called directly, full healthy panel ===
gold        : AskRefusal/ASK_PLAN_TIER_INVALID/The gold plan tier is invalid
constructor : AskRefusal/ASK_PLAN_TIER_INVALID/The constructor plan tier is invalid
__proto__   : AskRefusal/ASK_PLAN_TIER_INVALID/The __proto__ plan tier is invalid
premium     : <admitted>
```

**Judgement against SPEC-v2 R6/R15: not a defect, and not a V row.** R6 names
`ASK_PLAN_TIER_MODEL_UNAVAILABLE` for the *members-absent* condition and says nothing about a tier
outside the vocabulary; R15 is a floor ("a RED test exists for each of…"), not a ceiling. The new
code does not displace the old one — M2 shows all four R15 message tests still bind — and it sits
*before* the R3 filter, so R6's pinned order (roster check before `assertMakerAdmission`) is
untouched. It closes security N1 / correctness N5 (`t_d86b98ce`): the untyped `TypeError` is gone.
It also has **no product face**: `.strict()` enum parsing answers `400 MALFORMED_REQUEST` for every
shape a client can send, and `apps/ui/lib/api.ts:376` refuses before the request even leaves the
browser. Nothing for V to decide. What it does leave is a coverage asymmetry — **N3** below.

### 3.2 R9 sweep, re-measured place by place at `88f8a01f` (R9 demands the sweep be recorded)

The pass-1 sweep (`REV-S02-p1-product-truth.md` §3.4) is the baseline; line numbers moved under F1
and F2 and I re-read every place.

| # | place at `88f8a01f` | verdict |
|---|---|---|
| 1 | `apps/api/src/index.ts:1206` raw panel from `resolveDiscoveredPanel()` | source |
| 2 | `:1207-1213` the new out-of-vocabulary tier guard | refuses before any panel use; adds no member |
| 3 | `:1215-1217` `filteredPanel` = `roster.map(find).filter(defined)` | **the only choke point**; roster-ordered |
| 4 | `:1218-1220` `missing` | complement of 3 |
| 5 | `:1221-1228` refusal if any missing | before everything below |
| 6 | `:1229` `makers` | from filtered |
| 7 | `:1236` `registerRef` | from filtered |
| 8 | `:1248` `panelSize` | from filtered |
| 9 | `:1256` returned `discoveredPanel` | **is** `filteredPanel` |
| 10 | `:1312` destructured in `submit` | filtered |
| 11 | `:1334` into `startRun` | filtered |
| 12 | `packages/db/src/index.ts:1221` server (encrypted) write path | filtered |
| 13 | `:1265` legacy write path (bind list now offset by F1) | filtered |
| 14 | `:1566` read back onto the run | filtered |
| 15 | `apps/runner/src/index.ts:1366` the runner iterates `run.discoveredPanel` | filtered — **but row V-29 still stands** |

No fallback branch anywhere reintroduces a non-roster member, and neither FIX added one. The probe's
six-member discovery containing all five roster ids plus `some-other-model`, asked as `free`, still
returns exactly `["gpt-5.6-luna","claude-sonnet-5"]`. **R9 holds at admission at this head.**

### 3.3 Rows V-28 / V-29 — the defaults still bind (charge 2.4)

`git diff --name-only 9ef275aa..88f8a01f` is seven files and **neither** `packages/contract/src/client.ts`
(V-28's prefix) **nor** `apps/runner/src/index.ts` (V-29's claim-time shrink) is among them; the
explicit pathspec check returns 0 files. `client.ts:88-91` still composes `${serverCode}: ${serverMessage}`
and `runner/src/index.ts:1366-1421` still re-probes and drops. No FIX stepped outside its allowed
list into V's territory. Both rows are transcribed with binding defaults at
`docs/missions/debate-tiers/V-DECISIONS-PACKET.md:108-109`.

### 3.4 The surfaces this slice shares with the app shell, mounted once

- **The `/v1/asks` route + the real contract client + the real `createDebate`** — mounted twice
  (§2's refusal-face probe, §3.1's invalid-tier probe). Refusal text, on-screen text and status codes
  all measured, not read.
- **`RunRepository.startRun` on a real database**, both principals, both tiers (§2's R12 probe).
- **`apps/ui/components/LibraryComposer.tsx:29-37`** — the library's own "start" button calls
  `createDebate(topic, { max_depth: 3, branching: 2, max_tokens: 800 }, …)` with no tier fields at
  all; `apps/ui/lib/api.ts:374` throws on `risk_tier` first, the bare `catch {}` swallows it, and the
  user is silently routed to `/new?topic=`. **This pass changes nothing there** — the `plan_tier`
  guard at `api.ts:376` never runs, because the `risk_tier` guard above it always fires first. It is
  pre-existing and already recorded (REQ-REV-p1 B2, COMMON §6). Not a new finding; mounted and named
  so pass 3 does not re-derive it.
- **Both display modes:** `ui: no`, no UI surface is under review and every string measured here is
  mode-independent. The packet's §2 `verification` line carries a UI clause on a `ui: no` slice for
  the second pass running — see the self-report.

---

## 4. Findings

### The pass-1 blocking finding is CLOSED

**product B1 `t_cc661b9e` — the all-members-missing refusal message is unpinned.** Fixed, and I
verified it by re-applying the mutant that shipped green at pass 1, not by reading the patch. M2 now
fails exactly four tests, and they are exactly the four class members I enumerated at pass 1:
(a) `tests/unit/tiers-s02-admission.test.ts:140` all-members-missing Free · (b) `:187` empty panel ·
(c) `:199` the HTTP 422 face, now `expect(response.json()).toEqual({error, message})` rather than
`.error` alone · (d) `:154` all-members-missing **Premium**, the member that did not exist at pass 1.
All four pin the exact string, tier name and plural form. **No B finding at this pass.**

---

### N1 (non-blocking) — the single-missing-member refusal still does not pin the tier name, and that is the other shape V runs today

**Where.** `tests/unit/tiers-s02-admission.test.ts:164-173` ("names the one missing Premium roster
member in the tier-unavailable refusal") asserts `message: expect.stringContaining("grok-4.6")` and
nothing else. No test in any cluster pins the full text of the `missing.length === 1` shape.

**Against what.** SPEC-v2 R7 (`oracle/SPEC-v2-section-1-requirements.md:69-73`): the `422` body's
`<text>` "contains **the tier name** and the model id of EVERY missing roster member".

**Concrete failing outcome, measured.** Mutant M2b — the tier name emitted as `""` iff exactly one
member is missing — ships with **C2 `3 passed (3)` / `58 passed (58)`**. The build's Premium refusal
then reads `The  plan needs grok-4.6, and it is not available right now`, and on screen (with the
V-28 prefix) `ASK_PLAN_TIER_MODEL_UNAVAILABLE: The  plan needs grok-4.6, and it is not available
right now`. The control mutant M2c (drop the model id instead) **is** caught at `:164`, so the
honesty law's core — the missing model is named — is genuinely held; it is R7's tier-name half that
is not.

**Why non-blocking and not a re-raised B.** Acceptance step 6 asks only that the error "names every
missing member of that tier" and is satisfied by M2b's build; the honesty law is satisfied; the
asker's loss is the tier label they chose one screen earlier, not the fact they need. And the class
I handed F2 at pass 1 enumerated exactly four members, all of them plural-shape, and F2 swept all
four — this member is the residue of **my own** under-enumeration, not of their sweep. It is
ticketed and fixed on WHEN, not WHETHER.

**The CLASS and its remaining member.** *Refusal-message content is asserted for some panel shapes
and not others.* Members (a)–(d) closed at this pass; the remaining member is (e) the
single-missing-member shape (`missing.length === 1`), whose expected text is already measured:
`The premium plan needs grok-4.6, and it is not available right now` (§2). One `toMatchObject`
change at `:164`. **Ticket: yes, this pass.** Re-raised from pass-1 `t_cc661b9e`'s class.

### N2 (non-blocking) — the canonical-declaration guard no longer counts duplicates inside a file it already allows

**Where.** `tests/architecture/tiers-s02-rosters.test.ts:48-55` (`sourceFilesContaining`) and
`:184-202` (the `expectedFiles` map). F3 replaced the pass-1 line list with a **file set** per model
id, which closes pass-1 N4 (`t_f2da2b9a`) — M14 confirms it — and opens this.

**Concrete failing outcome, measured.** MDUP adds `LEGACY_FREE_MODELS` and `LEGACY_PREMIUM_MODELS`,
duplicating **both rosters verbatim**, to `packages/contract/src/plan-tiers.ts` itself; C3 stays at
its baseline `1 failed | 1 passed (2)` / `3 failed | 6 passed (9)` — the three `s14-contract`
failures only. MDUP2 adds a second `claude-opus-5` literal inside
`apps/ui/components/landing/cards.ts`; same result. At `9ef275aa` both would have failed, because the
guard pinned `["packages/contract/src/plan-tiers.ts:9"]` and would have seen two lines. **A test
named "keeps every roster model id in one canonical declaration" now passes a build with two
declarations of every roster member.** R1/R2's whole point — the roster is the one truth about who
argues — is what the guard's name claims to protect.

**Remedy shape.** Assert file set **and** occurrence count per model id (pass 1's N4 asked for the
file set "and the line only for `plan-tiers.ts`"; the line half was dropped with the rest). A count
is immune to the unrelated-edit line shift M14 exercises, so it re-closes this without reopening N4.
F3's own handoff already records the neighbouring gap ("equivalent alias roster declarations remain
the documented case-2 gap"). The built code has exactly one declaration, so nothing ships wrong
today. **Ticket: yes, this pass.**

### N3 (non-blocking) — the slice pins a 422 face no client can reach, and pins nothing for the 400 every client actually gets

**Where.** `tests/unit/tiers-s02-admission.test.ts:243-270` ("maps an invalid-tier boundary refusal
to the HTTP 422 face") builds an application whose `submit` **overwrites** the already-parsed tier
with `"gold"` internally, then asserts `422 { error: "ASK_PLAN_TIER_INVALID", message: "The gold plan
tier is invalid" }`. No test in `tests/unit/tiers-s02-admission.test.ts`,
`tiers-s02-wire.test.ts`, `tiers-s02-rosters.test.ts` or `tiers-s02-run-plan-tier.test.ts` mentions
`MALFORMED_REQUEST` (grep, 0 hits).

**Concrete failing outcome.** §3.1 measured it: every out-of-vocabulary tier a real client can send —
`gold`, `constructor`, `__proto__`, `toString`, `FREE`, `""`, `1`, `null`, key omitted — answers
**400 `MALFORMED_REQUEST`**, never 422. The suite therefore documents, in a test named after "the
HTTP face", a face the product does not have, while the face it does have is unguarded: a change that
loosened `AskRequestSchema`'s enum (or dropped `.strict()`) would move every one of those nine shapes
from 400 to a `422 ASK_PLAN_TIER_INVALID` with the caller's own string echoed back
(`The __proto__ plan tier is invalid`), and every cluster would stay green.

**Remedy shape.** One route-level case pinning `400 MALFORMED_REQUEST` for an out-of-vocabulary
`plan_tier`, and a name on the existing case that says it exercises the exported function boundary
rather than "the HTTP face". **Ticket: yes, this pass.**

### N4 (non-blocking, against the orchestrator) — the packet misattributes the mission-tree freeze diff to the seats under review

`.hermes/planning/debate-tiers/packets/REV-S02-p2-product-truth.md:10`, the `inputs` line, ends: the
freeze-pair diff "is exactly what the seats under review changed in the mission tree". The seats
under review changed **zero** files there — `git diff --name-only 9ef275aa..88f8a01f` is seven code
and test files — and the five files the freeze diff shows (`RESUME-HERE.md`,
`V-DECISIONS-PACKET.md`, `slices/S01/PROGRESS.md`, `slices/S02/DECISIONS.md`,
`slices/S02/PROGRESS.md`) are the orchestrator's own records. A reviewer who trusted the clause would
read orchestrator bookkeeping as the authored output of the work under review. The clause should read
"what the mission tree recorded while these seats ran". **Ticket: yes, this pass.**

### N5 (re-raise, ticketed) — the frozen SPEC's line citations have drifted further, under this pass's own FIX

Pass-1 N6 (`t_018d588c`) measured `packages/db/src/schema.ts:123` → `:124` and
`packages/db/src/index.ts:973-979` → `974-980`. At `88f8a01f`, `discoveredPanel` in `schema.ts` is
still `:124`, but `DiscoveredPanelMember` in `packages/db/src/index.ts` is now **`987-993`** — F1's
`planTierColumnIsApplied` helper (`:635-646`) pushed it another 13 lines. The SPEC is frozen, so this
remains a note for whoever hands V the oracle, not a rework; the widening is evidence for R14's own
rule that a line citation into an append-only file is checked at the moment it is used. **Existing
ticket `t_018d588c`; no new ticket.**

### N6 (re-raise, ticketed) — the landing page still shows a model no tier can field

`apps/ui/components/landing/cards.ts:29` still renders `Google · Gemini · gemini-3-ultra`, in neither
roster (`packages/contract/src/plan-tiers.ts:9-10`). Unchanged by this pass and outside its diff.
**Existing ticket `t_0e696ff8`; no new ticket.** V's call at TEST(S02).

---

## 5. UNVERIFIED — what this lens could not do, and why

- **Acceptance steps 1–4 and 8** (which models actually argue; restore-and-rerun). They need row
  **V-7** (V's own operation on `.local/dev-auth/api.env`) and a live stack. Unchanged from pass 1.
- **Step 5** (put a member out of reach) — nothing to do before V-7, as the oracle itself records.
- **Whether a `grok-4.6` discovery target exists at all** — pass-1 N5 (`t_cf4f7f56`), reconciled in
  COMMON §6 on 2026-09-12; `.local/**` remains no-touch and I did not read it.
- **Whether a run started against a database where migration 0061 is absent is a product risk.** F1's
  conditional write path means such a run starts and records **no** tier, with no signal — R11's
  stated purpose (billing) would silently have nothing to read. I did **not** raise it as a finding:
  migrations are applied by `apps/runner/src/migrate-cli.ts:6` and by the dev-auth data plane under a
  typed `DEV_AUTH_DATA_PLANE_MIGRATION_FAILED` step (`apps/runner/src/dev-auth-data-plane.ts:100`),
  so a missing 0061 is loud where it matters, and the pre-0061 path exists in practice only for the
  truncated-migration suites correctness B1 was about. Recorded so pass 3 does not re-derive it.
- **The three `s14-contract` failures' own cause.** Pre-existing, another mission's, not this slice's.
- **The FIX seats' `SKILLS LOADED` lines against their rollout bodies** — a Codex transcript is not
  reachable from a review worktree; the orchestrator states it verified them.
- **Both display modes** — `ui: no`; no UI surface, no `DONE.md`, and every string measured here is
  mode-independent.
- **The real dev database, the `:3000` stack, any browser.** Never touched. Every database assertion
  above is on the embedded Postgres that `tests/support/testDatabase.ts` starts per run on an
  OS-assigned port. I started one background shell (PID 19880, the cluster script) and it exited on
  its own; I killed nothing else and opened nothing on V's desktop.

---

## 6. Verdict — **PASS**, lens product-truth, pass 2 of 3

Zero blocking findings. Six non-blocking: **N1, N2, N3, N4** ticketed this pass; **N5, N6** re-raised
on their existing tickets.

The blocking finding of pass 1 is closed by measurement, not by assertion: the mutant that shipped
green at pass 1 now fails exactly the four members of its class, the pass-1 guard weaknesses N3 and
N4 are both closed with their false-positive halves confirmed gone, and the behaviour probes —
seven refusal shapes, R4, R8 on a real database, R9's fifteen-place sweep, R12's four cells — all
reproduce at this head after a FIX that rewrote both database write paths. What remains are three
guard-strength residues and a packet misattribution, none of which changes what the product does
today, and all of which are cheap single-line fixes for whoever picks them up.

---

## 7. Predictions about the other lens (falsifiable; written before any contact)

The correctness/tests lens holds the write-path finding (B1 `t_ca11cffb`), so its pass will live in
`packages/db/src/index.ts`, and I expect it to find something there that I cannot see from this
lens. My three specific predictions. **First:** they will attack F1's `planTierColumnApplied` guard
and notice it is `input.principal.kind === "legacy" && …` — the `information_schema` probe never runs
for a server principal, whose pre-0061 safety rests entirely on the
`pg_get_functiondef(...) LIKE '%''planTier''%'` string match inside the SQL. I predict they mutate
the function body's spelling (or run against a database where `core.create_encrypted_run` was
recreated with a differently-formatted body) and find the `LIKE` test fragile; I also predict they
observe that `planTierColumnIsApplied` queries `this.pool` while the row is inserted through
`admissionClient ?? this.provisionPool`, and ask whether those can ever be different databases. I
judge both real but non-blocking. **Second:** they will re-run the promoted
`pre-0061-schema` probe (76/76 at this head) and PASS B1, and they will find the `slice-probe`
still at `1 failed | 6 passed (7)` and correctly attribute it to its hard-coded pre-fix observation
(`TypeError` now `AskRefusal/ASK_PLAN_TIER_INVALID`) rather than to a regression — if they instead
read that failure as the slice's, we will disagree and the union will carry it. **Third:** they will
find N3's wire-guard widening (`tests/unit/tiers-s02-wire.test.ts:89-110`) over-broad rather than
under-broad — it now walks every `.ts` under `apps/` and `packages/` and excludes directories named
`test`/`tests`, which is a whole-repo scan hanging off one slice's cluster, and I predict they raise
its wall-clock or its blast radius as an N. What I predict **neither** of us reaches: the
`LibraryComposer` dead path (§3.4), because it is upstream of the slice and already ticketed, and the
duplicate-declaration hole (my N2), because it only shows up if you mutate the canonical file itself
rather than the consumers — the pass-1 mutants all lived in `apps/api`. If the correctness lens
returns REWORK, my guess is it is on the `LIKE` match, and I would check that first myself.

---

## 8. Rows for V (`V-ROW: NEW` — the orchestrator transcribes and numbers these; I never write DECISIONS.md)

**None from this pass.** The two product questions this lens raised are already V-28 and V-29 with
binding defaults (`V-DECISIONS-PACKET.md:108-109`), and no FIX touched either surface (§3.3). F2's
new `ASK_PLAN_TIER_INVALID` code is explicitly **not** a V row: it has no product face at all —
every out-of-vocabulary tier a client can send is answered `400 MALFORMED_REQUEST` by `.strict()`
parsing, and `apps/ui/lib/api.ts:376` refuses before the request leaves the browser (§3.1, measured).
There is nothing for V to decide about a code no asker can ever see; what it needs is the missing
route-level 400 case, which is N3 and belongs to the orchestrator's ticket queue, not to V's.
