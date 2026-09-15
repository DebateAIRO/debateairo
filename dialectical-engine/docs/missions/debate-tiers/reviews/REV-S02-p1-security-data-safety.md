# REV(S02) pass 1 — lens security/data-safety — mission `debate-tiers`, ticket `t_2061ade7`

SKILLS LOADED: `superpowers:using-superpowers` · `dialectical-engine:heartbeat-protocol` ·
`dialectical-engine:heartbeat-reviewer` · `superpowers:verification-before-completion`
(the two heartbeat skills are the repo-scoped installs of the names the packet gives — the files
under `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`
and `…/heartbeat-reviewer/SKILL.md`, which is the copy COMMON §1 makes authoritative).

- seat: `REV-S02-p1-security-data-safety` · pass **1 of 3** · blind
- worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-p1-security/dialectical-engine`,
  detached at `9ef275aa`, `git status --porcelain` = **0** at claim and **0** at handoff
- verdict for THIS lens: **PASS** with two non-blocking findings (N1, N2) and one packet finding (N3)
- comments read through: 1

---

## 1. The packet review (charge: the packet is in my scope; a defect is a finding against the orchestrator)

Everything the packet and `probes.md` quote was checked against its source at `9ef275aa`.

| Packet / probe claim | Checked | Result |
|---|---|---|
| cwd + `detached HEAD at 9ef275aa (= the slice/tiers-s02 head)` | `git rev-parse --short HEAD` = `9ef275aa`; `git rev-parse --short slice/tiers-s02` = `9ef275aa` | correct |
| base `3bf54957` for C2/C3/C4, `7f89f7b7` for C1 | `git merge-base --is-ancestor 3bf54957 HEAD` → yes; `… d2a58e9a HEAD` → yes | correct |
| `comment cursor at dispatch: 1` | the ticket carried exactly 1 comment | correct |
| skills list, role floor | matches `heartbeat-protocol` §1 reviewer floor | correct |
| `allowed` vs the deliverables demanded | artifact + probes + self-report all inside it; the ticket comment is a board action, not a file | correct |
| probe 4 `apps/api/src/index.ts:300 markAskRefusal` / `:516 : askRefusal ? 422 : 500;` / `:1216` | `sed -n` at each line | correct |
| probe 5 `:1305 evaluateAskAdmission` / `:1310 withOwnerAskAdmissionLease` | `sed -n` | correct |
| probe 2 `:1207 const roster = PLAN_TIER_ROSTERS[ask.plan_tier];`, `provider-discovery.ts:143` | `sed -n` | correct |
| probe 2 / probe 7 `packages/db/src/index.ts:848, :1196, :1239, :1253` | `sed -n` | correct |
| probe 1 `tests/unit/api.test.ts:35 rosterPanel(`, `:164 it("marks only maker…`; charge 2 `:269` the S01 CLAIM | `sed -n` | correct |
| probe 2 / row V-19 `migrations/0040_account_erasure.sql:4317` as the `agent_count` derivation | `sed -n 4317p` = `jsonb_array_length(p_run->'discoveredPanel')` — true of **0040**, but 0040's `core.create_encrypted_run` was **superseded by `migrations/0061_plan_tier_on_run.sql`** in C1; the live derivation is `0061:68` | **N3** below |

No other packet defect. The packet's reading floor is honest: every file it names was needed, and it
named nothing I did not use.

## 2. What I re-ran (verbatim, twice each; the file count pinned per TOOLING-TRAPS "A multi-path `vitest run` SILENTLY DROPS paths")

`cwd` = my worktree. `pnpm exec vitest run …`, no reporter flag.

| Cluster | Command (verbatim) | run 1 | run 2 | orchestrator's `reverify-9ef275aa.txt` |
|---|---|---|---|---|
| C1 | `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | rc=0 · `Test Files 2 passed (2)` · `Tests 25 passed (25)` | identical | same |
| C2 | `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | rc=0 · `Test Files 3 passed (3)` · `Tests 55 passed (55)` | identical | same |
| C3 | `pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | rc=1 · `Test Files 1 failed \| 1 passed (2)` · `Tests 3 failed \| 6 passed (9)` | identical | same |
| C4 | `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts` | rc=0 · `Test Files 4 passed (4)` · `Tests 42 passed (42)` | identical | same |

**Every failure, named and dated.** The three C3 failures are all in `tests/architecture/s14-contract.test.ts`:
`uses the generated contract client for both browser and SSR with no V2 wire mirror` ·
`FX-ORPH-04 walks web consumers in both directions and rejects the death-list inventory` ·
`carries the S04 orphan-audit wording fix and deterministic locale tiebreak`.
`BASELINE.md` records this file at `rc=1 · Tests 3 failed | 2 passed (5)` for the `tiers-s02` lane, so
all three are **pre-existing, inherited from another mission, not the slice's**. The delta S02 owns is
`tiers-s02-rosters.test.ts` +1 file / +4 passing. No suite the slice touches is RED because of S02.

## 3. My own probes and mutants

Promoted, runnable from ANY worktree (`WORKTREE=…` or argv, no hard-coded root), under
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/probes/`:
`REV-S02-p1-security-data-safety--run.sh` · `--probe-a-http-shapes.test.ts` ·
`--probe-b-db-paths.test.ts` · `--mutant-evaluator-vacuity.sh` · five `--evidence-*.log`.
The temporary copies in `tests/` were deleted; the worktree is byte-clean.

### 3.1 Probe A — the 422 face for every input shape, at the real HTTP boundary (charge 2.1, probe 4)

`buildApi(...).inject({ POST /v1/asks })` with a real session, 20 shapes. Measured verbatim:

| Shape | Status / body |
|---|---|
| free, **empty panel** | `422 ASK_PLAN_TIER_MODEL_UNAVAILABLE :: The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now` |
| free, panel holds only the premium models | same 422, same message |
| premium, one member missing | `422 … :: The premium plan needs grok-4.6, and it is not available right now` |
| premium, two members missing | `422 … :: The premium plan needs claude-opus-5, grok-4.6, and they are not available right now` |
| `plan_tier` = `gold` / absent / `null` / `["free"]` / `{free:1}` / `FREE` / `" free "` / `__proto__` / `constructor` / `toString` | **all `400 MALFORMED_REQUEST`** |
| extra key `plan_tier_override` | `400 MALFORMED_REQUEST` (`unrecognized_keys`) |
| panel member with `model_id: null` / no `model_id` | `422 ASK_PLAN_TIER_MODEL_UNAVAILABLE` (treated as absent — correct) |
| panel entry that is `null` / `undefined` | `500 INTERNAL_ERROR`, body message suppressed to `INTERNAL_ERROR` |
| free, full roster | `202` |

**R6's pinned order is built.** The empty-filtered-panel case answers
`ASK_PLAN_TIER_MODEL_UNAVAILABLE`, never `MAKER_INVENTORY_UNSATISFIED` — the exact failure SPEC-v2 §2
step 7 says FAILS acceptance. I did not read the author's assertion for this; I built it from the
CLAIM and injected it at the route.

The two `500`s are **not the slice's**: at the base the same expression
`discoveredPanel.map((member) => member.maker)` dereferences a `null` entry identically (the C2 diff
line `-  const makers = Object.freeze([...new Set(discoveredPanel.map(…))])` is the proof), and the
production `resolveDiscoveredPanel` cannot emit one — `apps/api/src/provider-discovery.ts:143-153`
builds each member inside a `flatMap` from a non-null record. Not a finding.

### 3.2 Probe A — the exported function boundary (charge 2.1, second half)

`evaluateAskAdmission` is exported from `@debateai/api`. Called with a `plan_tier` the route would
have rejected:

| `ask.plan_tier` | `PLAN_TIER_ROSTERS[plan_tier]` | outcome |
|---|---|---|
| `gold` | `undefined` | `TypeError: Cannot read properties of undefined (reading 'map')` |
| `__proto__` | `[object Object]` | `TypeError: roster.map is not a function` |
| `constructor`, `toString`, `valueOf`, `hasOwnProperty` | `[object Function]` | `TypeError: roster.map is not a function` |

An untyped `TypeError` is not a `TypedDomainError`, so `markAskRefusal`
(`apps/api/src/index.ts:300-302`) rethrows it unchanged and the route's error face
(`:514-517`) gives `500 INTERNAL_ERROR`. See **N1**.

### 3.3 Probe A — R8 rebuilt with MY fixture (charge 2.2, probe 5)

The author's case 8 asserts `connectCalls === 0` on one pool plus a regex over collected SQL. I
exceeded it: four separately instrumented pools (primary, provision, server-lease facade,
legacy-lease facade), a counting dispatcher, and a **total** statement count rather than a regex.

```
R8-OWN = {"thrownName":"AskRefusal","thrownCode":"ASK_PLAN_TIER_MODEL_UNAVAILABLE",
          "connects":0,"dispatched":0,"queryCount":0,"queries":[]}
```

Zero connections, zero statements of any kind, zero dispatches. The refusal is raised at
`apps/api/src/index.ts:1215-1220`, inside `evaluateAskAdmission` (`:1305`), before
`withOwnerAskAdmissionLease` (`:1310`) — the owner lease is never taken.

### 3.4 Probe B — R8 against a REAL database, and both write paths (charges 2.2, 2.5, 2.6; probes 2, 7)

Embedded Postgres per run, real migrations, real `PostgresAskApplication.submit`, read back with SQL.

```
R8-DB       = {"code":"ASK_PLAN_TIER_MODEL_UNAVAILABLE",
               "before":{"n":"3","liveness":"3","work":"3","own":"2"},
               "after" :{"n":"3","liveness":"3","work":"3","own":"2"}}
LEGACY-ROW  = {"plan_tier":"free","agent_count":2,"panel":["gpt-5.6-luna","claude-sonnet-5"]}
SERVER-ROW  = {"plan_tier":"premium","agent_count":3,
               "panel":["gpt-5.6-sol","claude-opus-5","grok-4.6"],
               "question_line":"⟦DEBATEAI:CIPHERTEXT:V1⟧","ask_contract":{"v":1,"ciphertext":true}}
DUPLICATE-ROW = {"agent_count":3,
               "panel":["gpt-5.6-sol@provider:sol-A","claude-opus-5@provider:opus-A","grok-4.6@provider:grok-A"]}
```

- **R8 on real tables:** `core.run`, `core.question_liveness_event`, `core.work_item` and
  `core.run_ownership_event` counts are byte-identical across a refused ask. No row anywhere.
- **The persisted panel and `agent_count` follow the filter on BOTH write paths.** The LEGACY case fed
  a six-member panel — both premium models, `grok-4.6`, `model:evaluator-local` and both free models,
  deliberately out of roster order — and the plaintext `INSERT`
  (`packages/db/src/index.ts:1245-1256`) stored exactly the two free ids **in roster order** with
  `agent_count = 2`. The SERVER case went through `core.create_encrypted_run`
  (`migrations/0061_plan_tier_on_run.sql:62-79`) and stored the three premium ids with
  `agent_count = 3`. Nothing outside the roster reached either row.
- **R11 holds through the real RPC:** `plan_tier` reads back as plaintext `premium` while
  `question_line` is the ciphertext sentinel and `ask_contract` is `{"ciphertext":true,"v":1}`. The
  tier is readable by billing without decrypting run content — which is the whole reason row V-11
  chose the column.
- **V-19 (two providers, one model id) is built as ruled.** With every roster id served twice, the
  persisted panel holds exactly one member per id, the **first** one, and `agent_count` equals the
  roster size — not six. Nothing is double-billed and no duplicate provider is persisted. The
  ordering is deterministic, not a race: `apps/api/src/provider-discovery.ts:131-153` maps over
  `input.targets` and `Promise.all` preserves **input** order regardless of which probe resolves
  first, so "first match" means "the first *configured* target serving that id", stable across runs.
- `core.run`'s `run_panel_count_identity` (`migrations/0022_dr181_discovery.sql:26-31`,
  `agent_count = jsonb_array_length(discovered_panel)`) held for every row the probe created.

### 3.5 Mutant — is the evaluator-isolation test still a test? (charge 2.8)

`git status --porcelain` was **0** before, and **0** after restore; both files were restored from a
`shasum`-verified capture, not from a literal (`ORIG-*` hashes re-matched exactly).

| Cell | Mutation | Measured |
|---|---|---|
| **A** | head (S02 filter present) + `evaluator-database.test.ts:1359` also probes `EVALUATOR_PROVIDER_REF`, i.e. the evaluator **leaks** into the discovered panel | rc=0 · `Tests 1 passed \| 20 skipped (21)` — **the test still passes** |
| **B** | same leak **+** `apps/api/src/index.ts:1249` reverted to the pre-S02 `discoveredPanel,` | rc=1 · `AssertionError: expected true to be false` — the test catches it |

The assertion in question is `evaluator-database.test.ts:1458-1460` (`FR-0.6 AC5`): the persisted
panel must contain no member from the evaluator provider or maker. After S02 it can never contain
one, because `model:evaluator-local` is not in either roster and the filter drops it — so the
assertion is satisfied by the filter and no longer by the isolation mechanism it was written to
guard. See **N2**. (I did NOT conclude this by reading the C2 diff and reasoning; cell B is the
control that proves the assertion was sensitive before the filter existed.)

## 4. R9 swept place by place (SPEC-v2 R9 names this as a reviewer duty)

Every site where the panel is built or could be altered, `grep -rn 'discoveredPanel\|filteredPanel'`:

| Site | What it does | Substitution or shrinking possible? |
|---|---|---|
| `apps/api/src/index.ts:1206` | `resolveDiscoveredPanel()` — the raw panel, the ONLY source of members | no |
| `:1208-1210` | `roster.map(find).filter(!== undefined)` | members can only come from the raw panel; matched on `model_id` equality — **no substitution path exists** |
| `:1211-1213` | `missing` computed from the filtered panel | — |
| `:1215-1220` | refusal if `missing.length > 0` | **closes shrinking**: a partly-available roster never starts a run |
| `:1222`, `:1229` | `makers`, `registerRef` from `filteredPanel` | read-only |
| `:1232` | `assertMakerAdmission` | throws or returns; never mutates the panel |
| `:1241` | `panelSize: filteredPanel.length` | read-only |
| `:1249` | returns `discoveredPanel: filteredPanel` | the only return |
| `:1305` → `:1327` | destructured and handed to `startRun` | no branch, no fallback, no `??` between them |
| `packages/db/src/index.ts:1198` | encrypted RPC payload `discoveredPanel: input.discoveredPanel` | verbatim |
| `:1240` / `:1253` | plaintext `INSERT`; `agent_count` = `jsonb_array_length` of the SAME value | cannot diverge from the panel |
| `migrations/0061…:68, 74` | RPC; `agent_count` = `jsonb_array_length(p_run->'discoveredPanel')` | cannot diverge |
| `:1491`, `:1535` | read-back projection for the runner | read-only; an explicit column list that does not include `plan_tier` |

No fallback branch, no default, no second assignment. **R9 holds.**

## 5. The strict ask schema at the edge (charge 2.4)

`AskRequestSchema` (`packages/contract/src/index.ts:108-120`) is `.strict()` and `plan_tier` is
`PlanTierSchema` = `z.enum(["free","premium"])` (`packages/contract/src/plan-tiers.ts:3`). The S01
CLAIM at `tests/unit/api.test.ts:269` is intact and unweakened by C2's re-fixture; I did not rely on
it — my own matrix (§3.1) exercises **14** malformed shapes against the real route and every one is
`400 MALFORMED_REQUEST`. The C2 re-fixture changed `admissionSettings`' default panel, which that
case does not use (it builds its own `fixtureApplication()`).

One observation, not a finding: a `400` body carries the serialized Zod issue list, which echoes the
field path and the enum's allowed values (`"Invalid option: expected one of \"free\"|\"premium\""`).
That is the pre-existing shape of every malformed request on this API
(`apps/api/src/index.ts:282-287, 531-534`), it predates S02, it discloses only the public contract,
and no submitted value is echoed back.

## 6. What the refusal message discloses (charge 2.3)

```
{"error":"ASK_PLAN_TIER_MODEL_UNAVAILABLE",
 "message":"The premium plan needs claude-opus-5, grok-4.6, and they are not available right now"}
```
Asserted absent from the message, against a panel deliberately seeded with bait values
(`probe_evidence_ref: "probe-evidence:<tag>:SECRET-LOOKING-REF"`): `provider:`, `maker:`,
`probe-evidence:`, `SECRET-LOOKING-REF`, `probed_at`, and **the ids of the members that ARE present**.
Present: the tier name and every missing roster id, spelled as the roster spells them. That is
exactly R7 and nothing more. The message reaches the browser as `"<CODE>: <message>"`
(`packages/contract/src/client.ts:88-91` → `apps/ui/app/new/page.tsx:162, 182`); the code is a typed
vocabulary token, not a secret. No disclosure finding.

Note for the record, not a finding: a `free` caller who asserts `plan_tier:"premium"` learns the
premium roster. Two of those three ids are already public marketing copy
(`apps/ui/components/landing/cards.ts:27-28`) and the UI renders both rosters to every visitor
(`apps/ui/app/new/page.tsx:200`), so the refusal discloses nothing the landing page does not.

## 7. Client-asserted `plan_tier` and untouched gauges (charge 2.7, probe 6) — V ROW, and it is not a new one

Swept: `grep -rniE "entitlement|subscription|billing|plan_tier|planTier"` over `apps/` and
`packages/` returns **no server-side check of any kind** on who may assert which tier. `plan_tier` is
read in exactly two production places — `apps/api/src/index.ts:1207` (which roster) and `:1325`
(what is persisted) — and `PostgresAskApplication.submit` has exactly one production caller
(`apps/api/src/index.ts:908`), whose only gate is the enum. So a client-asserted field now both
**selects which models run** and **becomes the billing record**, with the Free gauge lock enforced
only in the browser (`apps/ui/app/new/page.tsx:251-392`).

This is a **V ROW, not a REWORK**, and **both halves are already open with binding defaults** —
I checked before opening anything:

- the entitlement half is **row V-6** ("Payment gating… None for now: any signed-in user may pick
  Premium; the run records its tier so billing can bind later");
- the gauge half is **row V-20** (server-side revalidation of Free gauges, routed to a REQ-FIX(S02)
  SPEC-v3 amendment).

I am opening **no new row** for either; a third row on the same surface would be noise. What S02 adds
is evidence, not a new question: before S02 an over-asserted tier changed nothing server-side
(V-22's own evidence: "`plan_tier` is consumed by nothing server-side and persisted nowhere"); at
`9ef275aa` it changes the panel and writes the durable tier. If V rules V-6 the other way later, the
enforcement point is `evaluateAskAdmission` and nothing else — the sweep above is the list.

**One durable contradiction worth V's eye at TEST(S02), also already a row.** S02 writes
`plan_tier='premium'` into the same `core.run` row that carries
`tier_provenance_ref='machine:plan-tier-free'` whenever the asker did not hand-edit the risk tier
(`apps/ui/app/new/defaults.tsx:74`). Row **V-21** already opened that string as a falsehood on S01's
side; S02 makes it self-contradictory **within one row of the table billing is meant to read**. This
strengthens V-21's recommended default and its WHEN (a FIX(S01) before MERGE(S01)); it is not a new
row and not an S02 REWORK item, because SPEC-v2 does not name `tier_provenance_ref`.

## 8. Findings

### N1 (non-blocking) — `PLAN_TIER_ROSTERS[ask.plan_tier]` is an unguarded prototype-chain lookup at an exported boundary

`apps/api/src/index.ts:1207`. `PLAN_TIER_ROSTERS` (`packages/contract/src/plan-tiers.ts:8-11`) is a
frozen **object literal**, so it inherits `Object.prototype`. Concrete inputs → wrong outcome:
`evaluateAskAdmission(settings, { …ask, plan_tier: "constructor" })` → `roster` is `Object` →
`TypeError: roster.map is not a function` → not a `TypedDomainError` → `markAskRefusal`
(`:300-302`) rethrows → `500 INTERNAL_ERROR`, measured (§3.2) for `constructor`, `toString`,
`valueOf`, `hasOwnProperty`, `__proto__` and `gold`.

**Not reachable through the product today** — every one of those shapes is `400 MALFORMED_REQUEST`
at the route (§3.1), and `evaluateAskAdmission` has exactly one production caller. That is why this
is N and not B. It is still a finding because the only thing between a public exported function and
a 500 is a Zod schema in a different package, and the function's own signature (`ask: AskRequest`)
advertises a guarantee it does not check.

**The class, swept:** unguarded bracket lookups into a tier/roster-keyed record. Members found:
`apps/api/src/index.ts:1207` (this one) and `apps/ui/app/new/page.tsx:200`
(`PLAN_TIER_ROSTERS[option.value]`, where `option.value` comes from a literal tuple — safe).
`apps/ui/lib/api.ts:375-376` already guards with `PLAN_TIERS_SET.has(...)`, which is the shape the
remedy should take. Remedy by shape, not by confidence: the key set is **fixed and closed**, so the
projection is an allow-list — `Object.hasOwn(PLAN_TIER_ROSTERS, tier)` or
`Object.create(null)`/`Map`, plus a typed refusal for the miss. Ticket, same day.

*Possible duplicate:* `.hermes/reports/debate-tiers/probes/REV-S01-p1-security--probe-b-proto.test.ts`
exists from the S01 security lens (I did not open it — outside my reading floor). If that pass
already ticketed this class, the orchestrator should merge rather than open a second ticket.

### N2 (non-blocking) — the S02 filter makes the FR-0.6 AC5 evaluator-isolation assertion vacuous

`tests/integration/evaluator-database.test.ts:1458-1460`, enabled by the C2 re-seed at `:1446-1447`
(`model:product-a` → `gpt-5.6-luna`, `model:product-b` → `claude-sonnet-5`).

Concrete inputs → wrong outcome: simulate the evaluator leaking into the discovered panel (cell A,
§3.5) and the test **passes**. The same leak with S02's panel filter removed (cell B) **fails**. The
assertion therefore no longer refutes the thing it guards — `model:evaluator-local` is outside both
rosters, so the filter removes it whether or not evaluator isolation works. The re-seed was necessary
(without it a `plan_tier:"free"` ask is refused outright), so this is not a criticism of the re-seed;
the power loss comes from asserting isolation on the **persisted** panel, which is now filtered.

**Not blocking**: product behaviour is not worse — the evaluator is now excluded by two independent
mechanisms instead of one — and no SPEC-v2 requirement names this test. It is a finding because a
regression guard that cannot fail is a silent cap in the sense TOOLING-TRAPS
("Silent caps are how a gate reports coverage it never had"), and the next person to break evaluator
isolation will ship it green.

**The class, swept:** assertions about panel membership that now read the *filtered* panel. Members:
`tests/integration/evaluator-database.test.ts:1458-1460` (this one, vacuous) ·
`:1456-1457` (`panelBytes` / `agentCount` equality across evaluator-healthy vs evaluator-absent —
still meaningful, both sides are computed from the same filtered panel and a divergence would still
show) · `tests/unit/tiers-s02-admission.test.ts:115-118, 132-136, 279-288` (assert the filter itself;
by construction, not vacuous). Remedy shape: assert isolation where it is enforced — on
`resolveDiscoveredPanel()`'s own output — rather than on the row S02 now filters. Ticket, same day.

### N3 (non-blocking, against the orchestrator's packet) — `probes.md` and row V-19 cite a superseded SQL definition

`.hermes/reports/debate-tiers/review-packages/S02-p1/probes.md:4` and
`docs/missions/debate-tiers/V-DECISIONS-PACKET.md` row V-19 both name
`migrations/0040_account_erasure.sql:4317` as the place `agent_count` is derived on the encrypted
path. That line is real, but C1 replaced that function: `migrations/0061_plan_tier_on_run.sql:13`
is `CREATE OR REPLACE FUNCTION core.create_encrypted_run`, and the live derivation at `9ef275aa` is
**`migrations/0061_plan_tier_on_run.sql:68`**. Concrete failing outcome: a FIX seat sent to that
citation patches dead SQL and its test still passes, because the database runs 0061. One-line
correction; ticket, same day. (I verified the live path rather than the citation: the SERVER row in
§3.4 went through 0061 and produced `agent_count = 3`.)

## 9. What I did NOT verify (UNVERIFIED)

- **Acceptance steps 1–4 and 8–9.** Precondition A (row V-7) is unmet — `gpt-5.6-luna`,
  `claude-sonnet-5` and `grok-4.6` are not configured discovery targets, and `.local/**` is this
  mission's no-touch surface. Steps 5–7 I exercised at the HTTP boundary rather than in a browser;
  the browser pass is V's.
- **The live `:3000` stack.** Nothing was started or stopped. `listener-baseline.txt` recorded no
  listener on `:3000`, `:3001`, `:8790`–`:8793` or `:55432` at 11:07:13; the same seven ports had no
  listener at my handoff. Every Postgres I used was vitest's embedded instance, stopped in `afterAll`.
- **Whether N1's class was already ticketed by the S01 security lens** — I did not open that lens's
  artifact or probe (reading floor).
- **Timing / concurrency.** I did not probe two simultaneous asks racing the admission lease; the
  refusal path takes no lease at all (§3.3), so there is nothing for it to race, but a *successful*
  premium ask under concurrency is the correctness lens's parameter to exceed, not mine.
- **`pnpm typecheck` (R14).** Not re-run: it is RED at base from three other missions
  (`BASELINE.md`, 23 files), the slice adds no type surface my lens turns on, and the delta belongs
  to the correctness lens.

## 10. Verdict

**PASS — pass 1 of 3, lens security/data-safety.**

What carries the PASS, and how: R6's pinned refusal order proven at the real route with my own
fixture, including the empty-panel case SPEC-v2 §2 step 7 says must FAIL if built wrong (§3.1) · R8
proven twice, once with four instrumented pools and once against a real migrated database with
before/after row counts on four tables (§3.3, §3.4) · the filtered panel proven to be what is
persisted and what is billed on **both** write paths, including through `core.create_encrypted_run`
(§3.4) · R11's plaintext-beside-ciphertext read-back proven through the real RPC (§3.4) · V-19's
de-duplication proven deterministic at its source (§3.4) · R9 swept site by site with no substitution
or shrinking path (§4) · the refusal message proven to disclose the tier and the missing ids and
nothing else, against bait values (§6) · the strict schema proven at the edge over 14 malformed
shapes (§5). N1, N2 and N3 are non-blocking: none of them makes a product outcome wrong at
`9ef275aa`, and per the mission's law each is ticketed the same day regardless.

## 11. Predictions about the other two lenses (falsifiable; written before any contact)

I expect **correctness/tests** to land on probe 1 and find that C2's re-fixture of
`tests/unit/api.test.ts` cost the `admissionSettings` default its *generality*: every admission case
in that file now runs against a roster-complete Free panel, so any case that used to exercise a
mixed or oversized panel is testing a narrower world, and the `resolveDiscoveredPanel` override
added to the envelope-throw block at `api.test.ts:189` is redundant with the new default — cosmetic,
but the kind of thing that reads as a lost assertion. I also expect it to attack
`tests/architecture/tiers-s02-rosters.test.ts:90-102`, which pins model ids to **absolute line
numbers** (`plan-tiers.ts:9`, `cards.ts:27`/`:28`) — TOOLING-TRAPS variant 6; one unrelated line
added to `apps/ui/components/landing/cards.ts` turns that guard into a false RED, and I would check
that first. I predict it will *not* find a correctness defect in the filter itself, because the
mutant space there is small and C2's own case 6 already pins the ordering. For **product-truth** I
predict the fight is over the message and R12: the string is `"The free plan needs gpt-5.6-luna,
claude-sonnet-5, and they are not available right now"`, which the client renders prefixed with the
raw code (`ASK_PLAN_TIER_MODEL_UNAVAILABLE: …`) — machine vocabulary in front of a sentence written
for a person, and a comma-joined list rather than "and" between the last two; that is copy, so it is
V's, and I expect it to become a row rather than a REWORK item. I also predict product-truth will
find that **no production code reads `plan_tier` back** (`SELECT`ed nowhere; the projection at
`packages/db/src/index.ts:1514` lists columns explicitly and omits it), so R12's read-back command
exists only as raw SQL in a seat's handoff — which is exactly what R12 allows, but is the step most
likely to be scored UNVERIFIED if the orchestrator's relay into `PROGRESS.md` did not happen. Where
I am most likely to be *wrong*: if either lens mounted `/new` against the real compiled page they may
have found a gauge or copy defect I never looked at, since `ui: no` kept me off that surface entirely.

## 12. Row for V

None. Every product question my lens reached is already an open row with a binding default — **V-6**
(entitlement / paywall), **V-20** (server-side Free gauge revalidation), **V-19** (duplicate model
id, built as ruled and verified here), **V-11** and **V-16** (the column and its nullability, both
verified here), **V-15** (the maker-span half, built as ruled), **V-21** (`machine:plan-tier-free` on
a Premium row — strengthened by §7's evidence), **V-7** (fleet config, which is what keeps acceptance
steps 1–4 and 8–9 UNVERIFIED). Opening another row would duplicate a decision V has already been
handed.
