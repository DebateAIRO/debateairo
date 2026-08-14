# BUG-01 — Opus 5 lens verdict (rev1)

**Ticket:** `t_fcd509b0` — BUG-01, board `debateai-v3`. **Lens:** Opus 5 (mutation testing + live-behaviour verification), dual diamond. Grok lens ran in parallel; no coordination.
**Under review:** `docs/missions/2026-08-06-v3-programming/handoffs/BUG-01-codex-handoff.md`
**Contract:** `reviews/bug01-architecture-plan.md` as authorized by `reviews/bug01-plan-grok-verdict.md` — binding conditions 1–5.
**Delta reviewed:** `git diff 2c61198` at the parent git root `/Users/vladmihaimiron/Documents/DebateAIRO`. HEAD is `2c61198`; the working tree contains exactly 7 modified files (3 source, 4 test) plus 3 untracked mission documents.

## Isolation (DR-163)

All mutation and test-with-mutation work ran in `cp -Rc` clone `/private/tmp/bug01-opus-clone`. The real tree was read-only throughout except for this one verdict file. Standing stack (PG 55432, API 8790, UI 3000) never queried, restarted, or mutated; integration tests use embedded PostgreSQL 18.4 on an ephemeral reserved port (`tests/support/testDatabase.ts` → `reservePort()`). No git-mutating command was run.

Clone parity before mutation:

```text
$ diff <(cd /Users/.../DebateAIRO && git diff 2c61198) <(cd /private/tmp/bug01-opus-clone && git diff 2c61198)
DIFFS IDENTICAL
```

Restore verification after the whole mutation campaign — md5 of every file touched by any mutation, clone vs. real tree:

```text
OK   apps/runner/src/index.ts
OK   packages/judgement/src/index.ts
OK   packages/providers/src/index.ts
OK   packages/judgement/src/s04.ts
OK   packages/kernel/src/index.ts
OK   packages/budget/src/index.ts
OK   packages/ledger/src/index.ts
OK   packages/battery/src/terminal.ts
OK   packages/providers/package.json
OK   tests/unit/provider.test.ts
OK   tests/unit/judgement.test.ts
OK   tests/integration/database.test.ts
OK   tests/architecture/scaffold.test.ts
```

Every mutation was applied by exact-anchor replacement (harness refuses any anchor whose occurrence count is not 1), the named test command run, then the file restored from a pristine pre-mutation copy with an md5 equality check. All 38 mutation runs reported `restored=true`.

---

## 1. Baseline gates in the clone — real output

```text
$ pnpm vitest list | wc -l
543

$ pnpm typecheck
$ tsc --noEmit
TYPECHECK_EXIT=0

$ pnpm lint
$ pnpm run audit:architecture && pnpm run audit:source
$ tsx tools/orphan-audit/src/cli.ts architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
$ tsx tools/orphan-audit/src/cli.ts source
{
  "blocking": []
}

$ pnpm test
 Test Files  76 passed (76)
      Tests  543 passed | 1 skipped (544)
   Start at  20:56:49
   Duration  29.58s (transform 795ms, setup 0ms, import 5.35s, tests 18.38s, environment 4ms)

$ pnpm vitest run tests/architecture
 Test Files  14 passed (14)
      Tests  51 passed (51)
   Duration  2.25s
```

Every handoff gate figure reproduces exactly: 543 collected, 543 passed + 1 skipped, 76 files, 27 edge rows, zero violations, zero blocking source audits, typecheck clean.

Enforced collection (P2) independently confirmed — all fifteen ledger rows are inside the enforced `tests/**/*.test.ts` include:

```text
tests/integration/database.test.ts > BUG-01 content-rejection retry accounting > T11/T13 charges every rejected attempt while terminal execution counts only the accepted attempt
tests/integration/database.test.ts > BUG-01 content-rejection retry accounting > T12 exposes the last rejected artifact to the redelivery exhaustion check
tests/architecture/scaffold.test.ts > ... > BUG-01 T14 keeps the ruled ledger outcome vocabulary unchanged
tests/architecture/scaffold.test.ts > ... > matches all 27 dependency-edge rows and structural rules 1–5
tests/unit/provider.test.ts > ... > BUG-01 T1/T2 retries declared schema rejection and ledgers FAILED before OK with artifact links
tests/unit/provider.test.ts > ... > BUG-01 T3 exhausts the declared content bound with the last structured parse error
tests/unit/provider.test.ts > ... > BUG-01 T5/T6 hashes each repair packet but preserves contract identity and resends identically without a builder
tests/unit/provider.test.ts > ... > persists the raw real HTTP response unconditionally before ledgering the attempt
tests/unit/judgement.test.ts > ... > BUG-01 T7/T10 declares the incident extra key and bogus claim_type as retryable schema failures
tests/unit/judgement.test.ts > ... > BUG-01 T8 translates provider exhaustion to the unchanged judge code and exposes a machine-error-only repair packet
tests/unit/judgement.test.ts > ... > BUG-01 T9 translates review exhaustion to the unchanged node-review code
```

---

## 2. Mutation ledger re-run — T1 through T15

Every row of the handoff's ledger names a mutation. Each was applied for real, the named test run, and the file restored.

| Row | Mutation applied | Expected red | Observed |
|---|---|---|---|
| T1 | delete the content-rejection `continue` (return attempt 1) | T1/T2 | **RED (killed)** — `Tests 1 failed \| 6 passed (7)` |
| T2a | rejected-attempt ledger row keeps a dishonest `outcome: "OK"` | T1/T2 | **RED (killed)** — `expect.objectContaining({ outcome: "FAILED", rawArtifactRef: …` |
| T2b | drop `rawArtifactRef` on the rejected ledger row (`null`) | T1/T2 | **RED (killed)** |
| T3a | drop the typed carrier; exhaust with the bare transport error | T3 | **RED (killed)** — `expected ProviderCallFailedError … to match object { lastParseError: "error:rejected-2", lastParseStatus: "SCHEMA_FAILED" }` |
| T3b | first-error carrier instead of last | T3 | **RED (killed)** — `- "lastParseError": "error:rejected-2" / + "lastParseError": "error:rejected-1"` |
| T3c | early throw (`break`) instead of spending the full bound | T3 (+T1/T2, T5/T6) | **RED (killed)** — `Tests 4 failed \| 3 passed (7)` |
| **T4-primary** | let the absent-predicate `UNPARSED` fallback trigger retries | T4 (`persists the raw real HTTP response unconditionally…`, `maxAttempts: 3`) | **RED (killed)** — `ProviderContentUnacceptedError … { attempts: 3, lastParseStatus: 'UNPARSED', lastParseError: null }` |
| **T4-fallback-vocab** | absent-predicate fallback reports `PARSE_FAILED` instead of `UNPARSED` | T4 | **RED (killed)** — `+ "artifact:PARSE_FAILED"` |
| T5a | hoist `inputHash` out of the attempt loop | T5/T6 | **RED (killed)** — `expected 'b4834574…' not to be 'b4834574…'` |
| T5b | vary `contract_hash` per attempt | T5/T6 | **RED (killed)** — `expected [ Array(2) ] to deeply equal [ 'contract:fixed', 'contract:fixed' ]` |
| T6a | gateway authors its own repair prose when no builder is supplied | T5/T6 | **RED (killed)** — bodies[1] ≠ bodies[0] |
| **T7** | widen the strict nested `evidence` schema to `.passthrough()` | T7/T10 | **RED (killed)** — nested `notes_absent` no longer `SCHEMA_FAILED` |
| **T8a** | rename the judge terminal code after exhaustion | T8 | **RED (killed)** — `- "code": "JUDGE_SCHEMA_FAILURE"` |
| **T8b** | carry a first/other error instead of the last parse error | T8 | **RED (killed)** |
| **T8c** | interpolate rejected raw model content into the judge repair packet | T8 | **RED (killed)** — `expected '{"messages":…' not to contain 'raw model content must not be interpo…'` |
| **T8d** | salvage after exhaustion (swap the terminal code for a salvage code) | T7/T10 + T8 | **RED (killed)** — `Tests 2 failed \| 7 passed (9)` |
| T9 | fix judge only; leave XREV review exhaustion untyped | T9 | **RED (killed)** — `expected ProviderContentUnacceptedError … to match object { code: "NODE_REVIEW_SCHEMA_FAILURE" }` |
| T10 | restore `z.unknown()` for `claim_type` | T7/T10 | **RED (killed)** — second classification degrades to `parseError: null` |
| **T13** | terminal `judge_calls` counts `FAILED` attempts as executed checks | T11/T13 (real PG) | **RED (killed)** |
| T11a | `budget.countRunModelAttempts` filters `outcome = 'OK'` (retries free) | T11/T13 (real PG) | **RED (killed)** |
| T11b | `ledger.countModelAttempts` filters `outcome = 'OK'` | T11/T13 (real PG) | **RED (killed)** |
| T12 | hide `FAILED` attempts from grouped exhaustion | T12 (real PG) | **RED (killed)** |
| T14 | mint a retry-specific ledger outcome (`CONTENT_REJECTED`) | T14 | **RED (killed)** — `Tests 1 failed \| 50 passed (51)` |
| T15 | add a new dependency edge (`providers -> budget`) | T15 (27-edge audit) | **RED (killed)** — `expect(report.violations).toEqual([])` fails |

**Result: 24/24 named-row mutations killed. Every row of the T1–T15 ledger is honest — each named check can and does fail for its believed reason.** The priority rows called out in the review brief (T4, T2, T7, T8, T13, T5) are all among the killed set, T4 by two independent mutations.

### One equivalent mutant (not a defect)

| Mutation | Observed |
|---|---|
| T4-guard-only: delete the `request.classifyContent !== undefined` conjunct from the retry condition | **GREEN (survived)** — `Tests 7 passed (7)` |

This is an *equivalent* mutant, not a hole. With no caller predicate, `classifiedContent.parseStatus` can only be `PARSED` or `UNPARSED` (`contentParseStatus` at `packages/providers/src/index.ts:166-173` returns exactly those two; the `content === null` branch returns `UNPARSED`; the `catch` that mints `SCHEMA_FAILED` is only reachable when `request.classifyContent` itself throws). The guard is therefore unreachable-as-a-difference and cannot change behaviour. The real T4 protection is the fallback *vocabulary*, and that is pinned — `T4-fallback-vocab` goes red. The redundant guard is correct defence-in-depth. No finding.

---

## 3. Beyond-ledger hunt — mutations the ledger does not name

Sixteen further mutations, each run against the **full 543-test suite** unless noted.

| # | Mutation | Observed | Finding |
|---|---|---|---|
| H2 | skip the raw artifact write for rejected attempts | **RED (killed)** | — |
| H5 | a caller with `maxAttempts: 1` retries anyway (`Math.max(maxAttempts, 2)`) | **RED (killed)** | — |
| H1 | gateway discards an **accepted first attempt** and re-fires the model | **GREEN (survived)** — `Tests 543 passed \| 1 skipped (544)` | A-3 |
| H3 | gateway hands the repair builder an empty `rawText` | **GREEN (survived)** | A-4 |
| H6 | keep the content rejection after a later transport failure (drop `lastContentRejection = null` in the catch) | **GREEN (survived)** | A-7 |
| H7 | remove the `if (!ledgerRecorded)` double-ledger guard | **GREEN (survived)** | A-8 |
| H10 | revert transport exhaustion to a plain `Error("PROVIDER_CALL_FAILED")` | **GREEN (survived)** | A-5 |
| H15 | remove the declared **conformance** `classifyContent` predicate | **GREEN (survived)** | A-1 |
| H15b | remove the declared **post-compose-R9** `classifyContent` predicate | **GREEN (survived)** | A-1 |
| H16 | change the **composer** organ failure code after content exhaustion | **GREEN (survived)** | A-2 |
| H17 | change the **conformance** organ failure code after content exhaustion | **GREEN (survived)** | A-2 |
| T7b | outer `judgeArtifactSchema.strict()` → `.strip()` | **GREEN (survived)** — full suite | A-10 |

---

## 4. Live-behaviour verification

The handoff honestly declares (P3) that no malformed response was injected into a live acceptance run and that the standing stack was untouched. I did not touch it either. I added an independent live-behaviour layer: the **real** `OpenAICompatibleProviderGateway` driven against a **real** local `node:http` server, in a scratch probe file created in the clone and deleted afterwards (clone status re-verified identical to the real tree after deletion). Real output:

```text
$ pnpm vitest run tests/unit/zz-opus-probe.test.ts
 ✓ P1 an accepted FIRST attempt with a declared predicate fires exactly one HTTP call and one OK ledger row 19ms
 ✓ P2 maxAttempts:1 with a declared predicate and a rejection makes exactly ONE attempt 5ms
 ✓ P3 full-bound exhaustion without a builder resends byte-identical bodies and ledgers every attempt FAILED 7ms
 ✓ P4 the gateway hands the caller's repair builder the REJECTED raw model content 4ms
 ✓ P5 a THROWING caller predicate is treated as a content rejection and burns the whole bound 7ms
 ✓ P6 a content rejection followed by a transport failure downgrades to the untyped transport carrier 3ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

What these establish against the shipped code:

- **P1** — the shipped gateway does **not** re-fire an accepted attempt: exactly 1 HTTP body, 1 raw artifact, ledger `["OK"]`, at `maxAttempts: 3` with a declared predicate. H1 is a test-coverage gap, **not** a code defect.
- **P2** — binding condition 3 holds at the boundary: `maxAttempts: 1` + declared predicate + rejection ⇒ exactly one HTTP call, one `FAILED` row, `PROVIDER_CONTENT_UNACCEPTED` with `attempts: 1`. No nested loop, no borrowed attempt.
- **P3** — exhaustion with no builder resends **byte-identical** bodies (`new Set(bodies).size === 1`), writes 3 artifacts and 3 `FAILED` ledger rows, and carries the **last** parse error. The §7.1 "every attempt is a ledger row" law holds through the new path.
- **P4** — confirms the gateway really does pass the rejected model content to the caller's builder (finding A-4).
- **P5** — a *throwing* caller predicate is classified `SCHEMA_FAILED` and burns the whole bound (finding A-6).
- **P6** — a content rejection followed by a transport failure loses the typed content carrier (finding A-7).

The real-PostgreSQL production seam was exercised repeatedly, not merely re-read: T11a/T11b/T12/T13 each drove `tests/integration/database.test.ts` against real embedded PostgreSQL under mutation and each went red.

---

## 5. Binding-conditions audit (Grok authorization, conditions 1–5)

**Condition 1 — retry only on a caller-declared predicate; absent predicate byte-identical one-shot.** **HOLDS.** T4-primary and T4-fallback-vocab both red; probe P1/P2/P3. The absent-predicate test now runs at `maxAttempts: 3` and pins the exact call sequence `["outside-transaction", "artifact:UNPARSED", "ledger:OK"]` — a single artifact and a single ledger row.

**Condition 2 — exhaustion still terminal-fails with the same typed organ codes carrying the last `parse_error`; no salvage/strip/fabricate/default.** **HOLDS for judge and review** (T8a, T8b, T8d, T9 all red; `JUDGE_SCHEMA_FAILURE` and `NODE_REVIEW_SCHEMA_FAILURE` preserved with `error.lastParseError`). **Correct by inspection but unpinned for the three runner organs** — see finding A-2. No salvage, default, or fabricated τ appears anywhere in the diff; `callWithContentContract` rethrows or translates, never returns.

**Condition 3 — bound is existing `CallBound.maxAttempts` only; no new source literal.** **HOLDS.** Scan of every added non-test source line for numeric literals yields exactly two hits, neither a bound: a `// TERM-01 rework 2 (S04 …)` comment and `responseJson.choices[0]!.message.content` (an array index). The retry consumes the same `for (let attempt = 1; attempt <= request.bound.maxAttempts; …)` loop; H5 (forcing a floor of 2) is killed; probe P2 confirms `maxAttempts: 1` means one attempt. No repair sub-bound literal was invented.

**Condition 4 — no schema widening, no DDL/kernel vocabulary change, no new dependency edge, no stack process control.** **HOLDS.**
- Evidence stays `{quality, relevance}` strict at `packages/judgement/src/s04.ts:95` — T7 (`.passthrough()`) is red.
- `LEDGER_OUTCOMES` unchanged — T14 red on adding a member. No migration file appears in the diff; `FAILED` was already a DDL CHECK member.
- No new edge: `providers → kernel` is pre-declared at `tools/orphan-audit/src/index.ts:18` (`["providers", "packages/providers", ["kernel", "register", "ledger"]]`) and `@debateai/kernel` was already in `packages/providers/package.json`. The new `TypedDomainError` import crosses no new boundary. T15 (a genuinely new edge) is red, and the live audit reports `edgeRowsChecked: 27, violations: []`.
- `claim_type` was *tightened* (`z.unknown()` → `z.enum(CLAIM_TYPES)`), the opposite of widening. Caveat A-10 concerns the outer object's strictness, which is unchanged in the shipped code but unguarded.
- No stack process control anywhere in the diff; none performed by this review.

**Condition 5 — coder ticket carries the findings list including the five-site correction and the bonus honesty work.** **HOLDS.** The tree has exactly five production gateway call sites and the handoff never claims six:

```text
packages/judgement/src/index.ts:127      (Judge.judge)
packages/judgement/src/index.ts:206      (Judge.review)
apps/runner/src/index.ts:1187            (composer)
apps/runner/src/index.ts:1238            (conformance)
apps/runner/src/index.ts:1260            (post-compose R9)
```

(`apps/runner/src/index.ts:238` is the internal call inside the `callWithContentContract` helper, not a sixth site.) Bonus finding A (ledger `OK` while artifact `SCHEMA_FAILED`) is repaired and pinned by T2a/T13; bonus finding B (predicates at composer/conformance/R9) is implemented at all three, pinned at one — A-1.

---

## 6. F1-class sweep on the new tests

| Check | Result |
|---|---|
| Assertions satisfiable by import lines alone | **None.** Every BUG-01 test drives behaviour. T14 pins a constant's *value*, which is exactly what its row claims ("the ruled six members"), and it is killed by T14. |
| Source-text pins where behaviour pins were claimed | **None.** `grep -n "readFile\|readFileSync" tests/unit/provider.test.ts tests/unit/judgement.test.ts` returns no hits. The integration and provider tests assert observed SQL rows, HTTP bodies, and callback sequences. |
| Predicate-only tests | **T7/T10 is predicate-only** — the fake provider invokes `request.classifyContent?.(...)` directly and never runs the gateway. This matches its ledger claim exactly (a claim about the predicate's verdict), and the gateway's *use* of that verdict is pinned separately by T1/T3 through the real gateway. T8/T9 likewise pin only the carrier→organ-code translation, which is their stated claim. Acceptable, but no single test carries judge exhaustion end-to-end through the real gateway; T12 does the gateway half against real PostgreSQL. Noted, not a defect. |
| Self-witnessing guards | **None found.** T8's `not.toContain` is non-vacuous: T8c flips it red, and an absent builder would make `repairText` the value `undefined` and fail the preceding `toContain`. T5/T6's `bodies[1] === bodies[0]` is non-vacuous: T6a flips it red. T7/T10's `toEqual([objectContaining, objectContaining])` fails if the predicate is absent (array of `undefined`). |
| Vacuous-on-absence assertions | None; every one of the above was empirically flipped red by at least one mutation. |

---

## 7. Findings

### BLOCKING — none

No mutation named in the T1–T15 ledger survived. No binding condition is violated. No assertion was found that cannot fail for its believed reason. The defining defect class of this run does not appear in this delta.

### Advisory

**A-1 (coverage, binding condition 5).** The declared `classifyContent` predicates at the **conformance** (`apps/runner/src/index.ts:1247`) and **post-compose-R9** (`:1269`) call sites can each be deleted with all 543 tests green (H15, H15b). Only the composer predicate is pinned, by the amended TERM-01 integration test. Binding condition 5 and plan §3.4 required predicates at all three. The code is correct; the guard is missing. Suggested repair: extend the contract-aware provider double in `tests/integration/database.test.ts` to reject the first conformance and first R9 body, and assert `FAILED/SCHEMA_FAILED` then `OK/PARSED` rows for `CONFORMANCE:%` and `POST_COMPOSE_R9:%` the same way the composer rows are already asserted.

**A-2 (unpinned handoff claim, binding condition 2).** The handoff asserts "runner composer/conformance/R9 preserve their existing contract-error codes". That is **true by inspection** — `callWithContentContract` throws `new TypedDomainError(organFailureCode, error.lastParseError)` with the literals `COMPOSITION_CONTRACT_ERROR` / `CONFORMANCE_CONTRACT_ERROR` / `POST_COMPOSE_R9_CONTRACT_ERROR` — but **no test can fail for that reason**: H16 and H17 both survive the full suite. The claim is verified-by-reading only; state it that way rather than as tested.

**A-3 (coverage).** Nothing pins "an accepted attempt returns immediately". A gateway that discards an accepted first attempt and re-fires the model survives all 543 tests (H1). The shipped code is correct (probe P1), and the surviving mutant is an *insertion* rather than an omission, so this is weaker evidence of risk than A-1. Still worth a one-line guard: assert exactly one HTTP body when the first attempt is accepted with a declared predicate at `maxAttempts: 3`.

**A-4 (DR-115 foot-gun).** `RejectedProviderContent.rawText` is populated by the gateway with the rejected model content (probe P4) and is **unused by all five production builders** and pinned by nothing — setting it to `""` survives the full suite (H3). T8 pins only that the *judge* builder ignores it. The field's sole function today is to make it one keystroke easier for a future caller to violate the "no rejected model content in the repair packet" law. Recommend either removing the field or adding a gateway-level guard/test.

**A-5 (undisclosed behaviour change, benign).** `ProviderCallFailedError` now extends `TypedDomainError`, where transport exhaustion previously threw a plain `Error`. Consequence: `runnerTerminalFailureReason` (`apps/runner/src/index.ts:1428`) and `acceptanceFailureReason` (`acceptance/main.ts:72`) now emit `RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED` / `ACCEPTANCE_EXECUTION_FAILED:PROVIDER_CALL_FAILED` where they previously emitted `…:UNEXPECTED_ERROR`. Reverting to a plain `Error` leaves all 543 tests green (H10), so this is entirely unpinned and undeclared in the handoff. Assessed **benign**: the terminal string is passed through verbatim by the UI (`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:151`), no closed vocabulary consumes it, and `apps/api`'s `markAskRefusal` sits only on the ask-admission path, not on any provider call — so no transport failure is reclassified as an ask refusal. It is strictly more honest than before. It should nonetheless have been declared, since it changes a terminal string on a path outside the authorized seam.

**A-6 (undocumented semantics).** A caller `classifyContent` that **throws** is caught at `packages/providers/src/index.ts:240-245`, labelled `SCHEMA_FAILED`, and now burns the entire attempt bound as content rejections — 3 real HTTP calls and 3 charged `FAILED` rows for a bug in the caller's predicate (probe P5). The `catch` pre-dates BUG-01, but it only became retry-triggering in this delta. Unpinned and undeclared. A crashing predicate is a caller defect, not model misbehaviour, and arguably deserves a hard typed failure rather than three charged model calls.

**A-7 (unpinned policy).** `lastContentRejection = null` in the transport `catch` (`:328`) means a content rejection followed by a later transport failure discards the typed content carrier and throws `PROVIDER_CALL_FAILED`, losing the last parse error (probe P6). Removing the reset — the opposite policy — also survives the full suite (H6). Either policy passes; neither is pinned or documented. Worth one deliberate ruling plus a test.

**A-8 (unpinned guard).** The `if (!ledgerRecorded)` double-ledger guard (`:330`) is unpinned (H7). It matters only when `buildRepairPacket` throws, which would otherwise write two ledger rows for one attempt — a §7.1 violation.

**A-9 (informational).** The `request.classifyContent !== undefined` conjunct in the retry condition is an equivalent mutant (see §2). Correct defence-in-depth; no action needed.

**A-10 (unguarded strictness).** The **outer** `judgeArtifactSchema` `.strict()` can be changed to `.strip()` with all 543 tests green (T7b). The incident case (`evidence.notes_absent`) is nested and its `.strict()` **is** pinned (T7 red), so the ledger row T7 is honest. But top-level unknown-key rejection on the judge artifact — a silent-coercion vector of exactly the class binding condition 4 forbids — has no guard. Cheap fix: extend the T7/T10 test with a third classification carrying a bogus top-level key.

### Unverifiable (stated, not approved on faith)

| Item | Why |
|---|---|
| The handoff's RED command output (`Tests 4 failed \| 3 passed (7)` before implementation) | Requires the pre-implementation tree; HEAD is `2c61198` and the working tree is post-implementation. Not reconstructed, and no conclusion rests on it — the mutation campaign is stronger evidence of the same property. |
| `pnpm generate:contract` zero-drift claim | Not re-run; contract generation writes into the tree and the delta contains no generated contract file. Independently, `pnpm lint` and the 14-file architecture suite are green. |
| Live re-fire of a real model schema failure against the standing stack | Forbidden by the ticket and by DR-115; the handoff declares the same limit honestly. Substituted with real-HTTP + real-PostgreSQL execution of the production gateway and runner composer call site. |

---

## 8. Assessment

The delta implements exactly the authorized seam and nothing else: 3 source files, 4 test files, no migration, no kernel vocabulary, no new edge, no new literal, no stack contact. The mutation ledger is honest in full — all 24 mutations derived from rows T1–T15 kill their named tests, including every priority row in the review brief, with T4 killed twice by independent mutations. The four accounting/exhaustion rows are proved against real embedded PostgreSQL through the production gateway and the production composer call site, not against a stub. The F1-class sweep found no self-witnessing, import-satisfiable, or source-text-substituted assertion; the two predicate-only tests match their stated claims exactly and their gateway-side counterparts are pinned elsewhere.

The advisories are coverage and disclosure gaps around the edges of a correct implementation, not defects in it — every survivor was checked against the shipped behaviour by live probe (P1–P6) and the shipped behaviour is right in each case. A-1 and A-2 are the two worth carrying into a follow-up: two of the three caller-side predicate declarations that binding condition 5 required, and the runner organ-code translation that binding condition 2 required, are correct by reading but cannot fail for their believed reason. Neither rises to blocking, because neither is a *false* claim — the handoff's ledger never asserts a test for them.

**VERDICT: APPROVED**
