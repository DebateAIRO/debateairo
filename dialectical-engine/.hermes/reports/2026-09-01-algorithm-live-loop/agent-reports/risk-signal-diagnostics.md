WORKER RISK-SIGNAL-DIAGNOSTICS — READY FOR PEER REVIEW · tip d1b29b5b610d621612a715ae2772fde7a32ee28b · comments read through: risk-signal-diagnostics-2026-09-07
SKILLS LOADED: heartbeat (loader), heartbeat-protocol (read as markdown from the lane worktree — the Skill tool listing in this Agent seat offers `heartbeat` only), heartbeat-worker (read as markdown at `.claude/skills/heartbeat-worker/SKILL.md`, as the packet's `skills` line anticipates), superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:systematic-debugging. `superpowers:receiving-code-review` not loaded: this is round 0 and no review has been received. `superpowers:using-superpowers` not loaded — it is not in this seat's Skill listing; I went to the router and the role contract directly. That is a shortfall against the router's "load it first" line and I state it rather than claim it (§3b).

Lane `lane/risk-signal-diagnostics`, base `70647e7e5a1513b1f5210c25d63e7ac14e6383a3`, tip `d1b29b5b610d621612a715ae2772fde7a32ee28b`, two commits, tree clean. Provisioning log line 4 reads `PROVISIONED OK commit=70647e7e5a1513b1f5210c25d63e7ac14e6383a3` and equals the base the packet names. **STRENGTH: entailed**, read from the file and from `git rev-parse`.

## RED

Four captures, three of them deliberately preserved at the base commit (they cannot exist at the tip — they are pre-fix by construction). All paths below are under `logs/risk-signal-diagnostics/`.

**F-RISK-IDENTITY-LOG — `03-red-formatter.log`, 4 failed / 4.** Taken against the formatter *moved verbatim* out of `main.ts` (see The fix). The runner's own words:

```
AssertionError: output is not the fixed two-field shape: "name=argon2id-audit:v1:aaaa…aaaa
code=AAAA…AAAA message=INSERT INTO identity.\"user\" (email) VALUES ('subject@example.test')
dbai_sess_PLACEHOLDERTOKENVALUE0000000000000000": expected null not to be null
```

The planted digest, ciphertext, SQL fragment and token are all present in the formatted line. Both scope-unresolved cases also fail, `Received: "name=TypeError code=(none) message=LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED"`.

**F-AUTH-RISK-POISONED-CATCH — two frames, and the first one is not admissible.**

- `04-red-poison-category.log`, 3 failed / 7, message `TypeError: authenticationRiskSignalPoisonCategory is not a function`. That proves the reader is absent. It does **not** demonstrate the collapse the ticket exists to fix, so I did not keep it as the RED of record. It is filed because it happened, not because it counts.
- `05-red-poison-collapsed.log`, 3 failed / 7, is the RED of record. It was taken with the read-side inspector present and `poisoned()` plus the catch at `:212` still the original collapsed pair (the log's own header prints `grep -n "poisoned():never\|}catch{poisoned"` to show that). The frames read `expected null to be 'context-decrypt'`, `expected null to be 'context-parse'`, and `expected null not to be null` — the defect in the runner's words. The four preservation/control assertions in the same file were already green at RED and are named as controls below, not as new pins.

**A fourth RED, found by the refutation duty and not by the packet.** With the fix in place and the suite green, I applied the exact mechanism codex ruled out — replacing the `REASONS` lookup with `/^[A-Z][A-Z0-9_]{2,63}$/u.test(error.message) ? error.message : UNRECOGNIZED` — and the test **survived, 4 passed / 4**. Every constant-shaped probe in my corpus was longer than that regex's 64-character bound, so the corpus could not tell an explicit map from a shape test. I added a short `SCREAMING_SNAKE` synthetic secret and a named case, and the same mutant now kills 3 of 5 (`11-mut-A2-shape-rule.log`). Commit `d1b29b5b` is that repair. **STRENGTH: entailed**, from the two transcripts.

## The fix

Diff against base: 6 files, +479 / −21.

| file | what changed |
|---|---|
| `apps/api/src/risk-signal-identity.ts` | new, 121 lines |
| `apps/api/src/main.ts` | −16 / +1: the formatter deleted, one import added |
| `packages/db/src/auth-risk.ts` | +48 / −7: category constants, the reader, `poisoned()`, the catch |
| `tests/unit/risk-signal-identity.test.ts` | new, 171 lines |
| `tests/unit/p2-auth-risk.test.ts` | +123, appended; the three P2-08 cases untouched |
| `.hermes/TOOLING-TRAPS.md` | +20, appended |

**F-RISK-IDENTITY-LOG.** The formatter was lifted out of `main.ts` first, byte-identically: the 711-byte block at lines 58–72 was extracted with `sed`, the only edit was prefixing `export `, and a round-trip diff after stripping that keyword printed `verbatim: True`. `main.ts`'s two consumers at what are now lines 176 and 227 are **unchanged** — they never named the module, only the function, so the whole `main.ts` delta is the deleted block plus `import { riskSignalFailureIdentity } from "./risk-signal-identity.js";`. The packet allowed the consumers to change their import; they did not need to.

Then the behaviour changed. The old function bounded *which* fields could reach the log and forwarded their *contents* verbatim. What is bounded now is the output alphabet: the function returns exactly `reason=<r> category=<c>`, and every `r` and `c` it can produce is a string literal declared in that module. The caught value is used only as a lookup key into three frozen maps — nineteen application reason constants keyed by `message`, ten system codes keyed by `code`, eleven error classes keyed by `name` — whose **values are the module's own literals**, so even on a hit the string that reaches the log is not the caught object's string. A miss in either lookup becomes `unrecognized-error`; a thrown non-`Error` becomes `reason=unrecognized-error category=not-an-error`. No substring, regex capture or case transform of the caught value appears anywhere in the module. **STRENGTH: entailed** over the whole input domain — not from the corpus, which is finite, but from the source: the two `return` expressions contain only map lookups and the fallback literal.

The map keys were derived from a grep, not chosen (`02-sweep.log`): the two service constants, the six from `auth-risk.ts`, the `CryptoInputError` code union plus `CRYPTO_AUTHENTICATION_FAILED` and `KEK_UNRESOLVED`, and the four `Argon2FailureCode` values. Two disclosed judgement calls. (1) I listed the whole `CryptoInputError` union rather than only the members reachable today, because the union is that type's closed contract and a subset would silently degrade a re-routed rejection to the fallback. (2) PostgreSQL SQLSTATE is deliberately *absent* from the code map: five characters of a ~200-member vocabulary would be a value derived from the error, and the class map already answers "the database rejected this" (`pg`'s `DatabaseError` sets `name` to the wire message type, so an ordinary query rejection arrives as `"error"` — read from `pg-protocol@1.15.0/dist/messages.js:36-41`, not assumed).

**F-AUTH-RISK-POISONED-CATCH.** `poisoned()` gains one parameter, `category`, defaulting to `"signal-shape"`, and throws `new TypeError("AUTH_RISK_SIGNAL_POISONED", { cause: category })`. The public classification is untouched: still a `TypeError`, still that exact message. The single `}catch{poisoned();}` around both stages became two catches — `decrypt` alone with `poisoned("context-decrypt")`, then `JSON.parse` of the resulting buffer with `poisoned("context-parse")`. The category is read back through a new exported `authenticationRiskSignalPoisonCategory(error)`, which returns the cause only when it is one of three frozen constants and `null` otherwise, so no caller has to reach into `cause` and decide what is safe to print.

**The default parameter is a contract decision, and I want it reviewed.** The packet's `allowed` line reads `packages/db/src/auth-risk.ts (the poisoned helper and the catch at :212; nothing else)`. A *required* parameter would have been the better design — a future call site cannot then be silently mislabelled — but it forces edits at the helper's three other call sites (lines 50, 54 and 82 of the original file, all shape/validation rejections inside `evaluateAuthenticationRiskSignals`), which are neither the helper nor the catch. I took the reading that keeps the diff inside the contract and named the trade-off here rather than widening the contract myself. If the reviewer prefers the required parameter, it is a three-token change.

**A second contract-edge disclosure.** `packages/db/src/index.ts` re-exports `auth-risk.ts` through an explicit named list, and that file is readonly for this lane, so the new poison-category surface is not reachable through `@debateai/db`. The test imports it from `../../packages/db/src/auth-risk.js` instead. That is the established convention in this suite — 57 of the files under `tests/unit/` import a `packages/` or `apps/` source directly, `tests/unit/api-provider-discovery.test.ts` among them, but it does mean the repository and `evaluateAuthenticationRiskSignals` arrive in that one test file from two module instances. Nothing in the file compares identities across them — only strings — so it is sound; a reviewer should still see it stated.

**The class sweep** (`02-sweep.log`), with a verdict per member, because a reported finding is a sample of a class.

*Class A — a formatter that turns a caught error into log text and forwards the caught content.* Five members in `apps/`, and **four of them are outside this lane's contract**:

| member | verdict |
|---|---|
| `apps/api/src/main.ts:64` | AFFECTED — fixed this round |
| `apps/api/src/index.ts:80` `apiOperationalErrorDiagnostic` | **AFFECTED, unfixed.** It *is* the uppercase-message regex codex rejected: `/^[A-Z][A-Z0-9_]{2,63}$/u.test(record.message)` returns `record.message`, and `DEPENDENCY_${record.code}` forwards a constant-shaped code. Its output is logged at `index.ts:480` on every ≥500 response. Out of contract (`forbidden: all_others`). Needs a ticket. |
| `apps/runner/src/index.ts:4416` `runnerTerminalFailureReason` | **AFFECTED, unfixed** — the identical regex pair, same shape. Out of contract. Needs a ticket. |
| `apps/runner/src/dev-auth-stack.ts:83` `developmentAuthStackErrorCode` | AFFECTED but narrower: forwards `current.message` only when it matches `^DEV_[A-Z0-9_]+$`, on a development-only stack. Lower tier. Out of contract. |
| `apps/ui/lib/v3/tokenUnlock.ts:77` → `classifyTokenUnlockFailure:30` | AFFECTED: the `UNCLASSIFIED` branch interpolates `error.message` into an operator-facing string. Out of contract. |

**STRENGTH: entailed** for each shape, read from the source. **undetermined** for whether any of them discloses a real secret in production today — I reproduced no disclosure, and neither did codex.

*Class B — a `catch` in `packages/db/src` that discards its cause.* Seven members:

| member | verdict |
|---|---|
| `auth-risk.ts:212` | AFFECTED — fixed this round |
| `index.ts:1282` and `:1289` | **The closest sibling, unfixed.** A failed `ROLLBACK` and a failed `destroyRunKey` collapse into one `rollbackIncomplete` boolean — two distinct failures, one indistinguishable outcome, exactly my defect's shape. Out of contract. Needs a ticket. |
| `account-erasure.ts:746`, `:761`, `:966` | Lower tier: each discards the cause but maps to a *typed, enumerated* outcome (`INVALID_EVIDENCE`) per batch item, so no two public classifications are conflated. Diagnostic loss only. |
| `index.ts:1095` | Lowest tier: replaces a local validation throw with a specific `TypedDomainError("RUN_LEGACY_ASKER_INVALID")`. The discarded cause is this module's own. |

**STRENGTH: entailed** for the shapes; **consistent-with** for the tiering, which is my judgement of severity, not a measurement.

## Mutants

Four transcripts, all through `tools/mutate.sh` v3, all stamped `d1b29b5b`, every one reporting `RESULT: ok — … hashes=match porcelain=empty`.

| # | mutant | target | expectation | observed |
|---|---|---|---|---|
| A | `reason=${reasonOf(error)}` → `reason=${error.message}` — the formatter forwards `message` verbatim again | `risk-signal-identity.ts` | must KILL | **4 failed / 5**, `10-mut-A-message-verbatim.log` |
| A2 | the `REASONS` map lookup → `/^[A-Z][A-Z0-9_]{2,63}$/u.test(message) ? message : UNRECOGNIZED` — the rejected shape rule | `risk-signal-identity.ts` | must KILL | **3 failed / 5**, `11-mut-A2-shape-rule.log`. Before commit `d1b29b5b` this same mutant SURVIVED 4/4. |
| B | the two catches → the original single `}catch{poisoned();}` around both stages | `auth-risk.ts` | must KILL | **3 failed / 7**, `12-mut-B-collapsed-catch.log`. Exactly the three category tests; the four preservation controls stayed green, which is the point — the public classification is not what the mutant changes. |
| C | `AUTHENTICATION_RISK_SIGNAL_POISON_CATEGORIES` → `AUTH_RISK_SIGNAL_POISON_STAGE_SET`, all three occurrences (`MUT_EXPECT=3`) | `auth-risk.ts` | must SURVIVE | **12 passed / 12**, `13-mut-C-neighbour-rename-survives.log`. The tests pin the category *values*, not the identifier's spelling. |

Six further mutants were probed by hand before the campaign to look for gaps, restored with `git checkout -- <file>` and each confirmed clean; their results are in this report only, not filed as transcripts, because they were exploration and not evidence: category returns `error.name` verbatim → 5 failed/5; the reason fallback returns `error.message` → 4 failed/5; the non-`Error` branch returns `String(error)` → 2 failed/5; `poisoned("context-parse")` → `poisoned("context-decrypt")` (partial collapse) → 2 failed/7; `cause` carries an `Error` instead of a constant → 3 failed/7; and a no-op control → 5 passed/5. **STRENGTH: entailed** for the four filed transcripts; **consistent-with** for the six hand probes, which have no filed record.

## Gates

Every record at tip `d1b29b5b610d621612a715ae2772fde7a32ee28b` unless the row says otherwise. All source, test and `TOOLING-TRAPS` changes were committed before any of these were taken (D64 ADDENDUM 5).

| run | passed/total | failures named | artifact |
|---|---|---|---|
| unit cluster ×3, run 1 | 19/19 (4 files) | none | `08-unit-x3-1.log` |
| unit cluster ×3, run 2 | 19/19 (4 files) | none | `08-unit-x3-2.log` |
| unit cluster ×3, run 3 | 19/19 (4 files) | none | `08-unit-x3-3.log` |
| — of which `risk-signal-identity.test.ts` | 5/5 | none | counted in run 3 |
| — of which `p2-auth-risk.test.ts` | 7/7 | none | counted in run 3 |
| — of which `sessions-risk-signal.test.ts` | 2/2 | none | counted in run 3 |
| — of which `p2-recovery-start.test.ts` | 5/5 | none | counted in run 3 |
| `tests/integration/session-database.test.ts` ×1 | 11/11 | none | `09-integration-session-database.log`, exit 0, 21.5 s |
| `pnpm typecheck` at the lane tip | 8 diagnostic lines, exit 1 | all 8 in `tests/unit/s14-ui.test.ts` | `07-typecheck-lane.log` |
| `pnpm typecheck` at the untouched base (baseline) | 8 diagnostic lines, exit 1 | same 8 | `06-typecheck-untouched.log`, stamped `70647e7e` |

Worst run is the verdict and the three unit runs are identical, so the cluster verdict is 19/19. The two typecheck diagnostic sets, sorted, are **byte-identical**: `diff` empty, both `sha256 58eb15faf42f2396f87ffdeeeac5ac3a2ca418d799ba0f79aef3cd66f35b38ab`. The eight lines are the inherited `s14-ui` ones the packet names; none is mine. **STRENGTH: entailed**, from the two files and the hash.

The baseline was taken by detaching the lane worktree to `70647e7e`, running `pnpm typecheck`, and returning to the branch; `git status --porcelain` was empty before and after and `git rev-parse HEAD` was re-read on return. No worktree was created and no other branch was touched.

## Stamp check

```
bash tools/stamp-check.sh .worktrees/lane-risk-signal-diagnostics <mission>/logs/risk-signal-diagnostics/
TIP=d1b29b5b610d621612a715ae2772fde7a32ee28b
records compared: 15 · failures: 6      (exit 1)
```

All six flagged records stamp the base `70647e7e` and are **deliberately preserved**, named here as the packet requires:

1. `01-provision.log` — the orchestrator's provisioning record, written at the base before this seat existed.
2. `02-sweep.log` — the class sweep. Its content is a description of the *untouched* tree; re-taking it at the tip would change the answers and destroy the evidence.
3. `03-red-formatter.log`, `04-red-poison-category.log`, `05-red-poison-collapsed.log` — RED captures, pre-fix by construction.
4. `06-typecheck-untouched.log` — the untouched-lane typecheck baseline the packet explicitly asks to save.

The other nine records — `07`, `08-unit-x3-{1,2,3}`, `09`, and mutants `10`–`13` — all stamp the tip. **STRENGTH: entailed**, from the comparator's own output.

## Not verified

- **No production disclosure was reproduced, for either ticket.** I planted synthetic content and proved it does not survive the formatter. I did not establish that any real token, hash, ciphertext or row value reaches these logs today through the live dependency graph. This is hardening. **STRENGTH: undetermined** for actual disclosure — the same position codex took in F2, and nothing this round moved it.
- The reachability of each map key was established by **grep over throw sites**, not by executing each path. `AUTH_RISK_SIGNAL_POISONED`, `AUTH_RISK_SIGNAL_SCAN_SATURATED`, `AUTH_RISK_SIGNAL_CROSS_ACCOUNT` and `AUTH_RISK_SIGNAL_SCOPE_UNRESOLVED` are thrown on the evaluator path, which is not today routed to `onRiskSignalFailure`; I listed them anyway as fixed constants of the same subsystem. **STRENGTH: consistent-with** for their reachability at this observer.
- `pg`'s `DatabaseError` name being `"error"` is read from the installed `pg-protocol@1.15.0` source, **not** from a live rejection. No PostgreSQL error was routed through the formatter at runtime. **STRENGTH: entailed** for the source, **consistent-with** for runtime behaviour.
- The extraction from `main.ts` is proven behaviour-preserving by byte-identity plus `tsc`. It is **not** proven by a behavioural test: no test imports `main.ts` (it calls `loadApiEnvironment()` at import), so no inherited control exercises the composition root's wiring. The two `console.error` call sites are covered by typecheck only.
- The unit cluster ran three times; the integration suite ran **once at the tip** as the packet specifies, and once more at the intermediate commit `f6bd66cc` (11/11 both times, the second overwritten by the tip capture). One run is not a flake study.
- The six hand-probed mutants have no filed transcript.
- No run of the full suite, no lint, no `merge-tree`, no push, no merge. I did not read, mint or pass any credential value.

## Self-charges

- **I wrote a RED that proved nothing and nearly filed it.** `04-red-poison-category.log` fails with `authenticationRiskSignalPoisonCategory is not a function` — a missing symbol, not the collapse. Caught before the handoff; cost one extra capture, roughly four minutes. Filed as a tooling trap.
- **My first corpus could not distinguish the mechanism the ticket is about.** The regex rule codex explicitly rejected survived my test suite 4/4, because every constant-shaped probe I had written was too long for the bound such a rule carries. I found it only because §2 requires building the mutant. Had I trusted the green suite, I would have shipped a test that pins "no raw prose in the log" while leaving "an explicit map, not a shape test" — the actual instruction — unpinned. Cost: one extra commit and a full re-take of five gate records, about eight minutes.
- **I chose contract-tightness over the better design** on the `poisoned()` default parameter and am asking the reviewer to rule, rather than deciding for them. Stated above, not buried.
- I did not load `superpowers:using-superpowers`; it is not offered in this seat's Skill listing and I went to the router directly instead.

WORK: ready — both tickets are green with a bounded output alphabet and two distinguished poison categories, the typecheck is byte-identical to the untouched baseline, and the four filed mutants land as required; the reviewer is asked to rule on the `poisoned()` default parameter and to ticket the six unfixed class members named above.
