WORKER DIAG-CLASS-A — REWORK READY FOR REVIEW · tip 12e054d9da29ea17d0d18fb9dc67d185856c1893 · comments read through: diag-class-a-r1b-2026-09-07
SKILLS LOADED: heartbeat (loader, via the Skill tool), heartbeat-protocol and heartbeat-worker (read as markdown from the lane's .claude/skills — a role contract is not invocable in this seat), superpowers:using-superpowers, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:receiving-code-review (loaded before this round's first action, as in round 1).

Rework round **2 of max 3** — the last before V — against codex r1b = CHANGES (2 required). Four commits on `lane/diag-class-a` from base `1fc2dece`: `e86c850e` (round 0), `d8319a0a` (F1/F2/F3), `f5236484` (traps), `12e054d9` (this round). Cumulative diff: 7 files, 828 insertions, 7 deletions. `tokenUnlock.ts` remains untouched since round 0. F2's four codes, F3 and F4 are cleared and were not reopened.

## Rework round 2

Both findings were verified against source before implementing; both are correct. **Tests were written before the implementation this round**, as the amendment required.

### F1 remainder — the membership vocabulary was still externally mutable · `packages/judgement/src/s04.ts`

Confirmed at source: `PANEL_MEMBER_FAILURE_KINDS` (`:338`) is **exported and never frozen**. `as const` is a type-level assertion; `const declared: readonly string[] = PANEL_MEMBER_FAILURE_KINDS` **aliases, it does not copy**. So round 1 closed the alphabet over that array's *current contents*, and a caller who pushes into the export widens the reason alphabet. The snapshot discipline was right; its vocabulary was not.

`CANONICAL_MEMBER_FAILURE_KINDS` is now the helper's own `Set`, built from its own object literal and unreachable from any exported binding. The seven public spellings, the note shape, the failure-kind list and the `failureKind:` expression are unchanged, and the one-read discipline is kept.

**Drift between the private vocabulary and the declared union is a compile error in both directions** — and this is measured, not asserted. The literal carries `satisfies Record<PanelMemberFailureKind, 0>`. On this repo's **tsc 7.0.2**:

| form | missing a member | extra member |
|---|---|---|
| `{…} as Record<Kind, 0>` | **no diagnostic at all** | — |
| `const x: Record<Kind, 0> = {…}` | TS2741 | TS2353 |
| `{…} satisfies Record<Kind, 0>` | TS2741 | TS2353 |

My first draft used `as` and carried a comment promising a guarantee the code did not provide. I caught it by probing the compiler rather than trusting the idiom, switched to `satisfies`, and then **broke the guard on purpose** in the real file — deleting `UNCONFIGURED_FAMILY` from the private literal produced `packages/judgement/src/s04.ts(283,3): error TS2741` — before restoring. A guard nobody has watched fire is a comment, not a guard.

**RED before the implementation:** `31-red-r2.log`, **1 failed / 24**, exit 1 — `expected 'SYNTHETIC_INJECTED_KIND' to be 'UNCLASSIFIED_MEMBER_ERROR'` at `judgement-s04.test.ts:415`. The injected kind was admitted verbatim.

Two new cases:

- **(a) mutation of the exported vocabulary.** Push a synthetic kind into the export, reject with a `PanelMemberFailure` carrying it, require the fallback. The export is restored in a `finally` and the restoration is asserted, so no later test inherits a widened vocabulary.
- **(b) the successful-membership branch under a changing accessor.** Codex was right that round 1's version proved less than its title claimed: the unchanged note construction reads `failureKind` **first** for its own field, so the helper's read was the second — an invalid value — and the test only showed refusal. The accessor now returns `PARSE_FAILURE`, then `TIMEOUT`, then synthetic text, and the test pins `failureKind === "PARSE_FAILURE"`, `reason === "TIMEOUT"` and **`reads` exactly `["PARSE_FAILURE", "TIMEOUT"]`**. That observes the helper's successful branch emitting precisely the value it validated, and proves it never reads again.
- Valid-kind and fallback controls retained.

### F2 remainder — two template inputs were misclassified · audit log and report

Codex is right, and the error is that I did not finish applying my own rule. Verified at source:

| site | resolution | round-1 label | **correct label** |
|---|---|---|---|
| `override`, `dev-deployment-register.ts:163` | the local `resolve` arrow, fed from `source.DEBATEAI_DEV_SYNTHESIZER_ROLE_REF` / `..._EVALUATOR_ROLE_REF` (`:168-169`) — arbitrary unconfigured environment strings | unbounded | **unbounded** ✓ |
| `label`, `dev-deployment-register.ts:189` | `requireMatch` (`:187`) is module-**private**, not exported, with exactly two literal callers: `"judge"` (`:202`) and `"composer"` (`:203-207`) | unbounded | **BOUNDED — two messages** |
| `service`, `validate-compose-postgres.mjs:8` | `serviceBlock` (`:5`) is module-**private**, with exactly two literal callers: `"postgres"` (`:15`) and `"hatchet-lite"` (`:16`) | unbounded | **BOUNDED — two messages** |

**All three remain EXCLUDED, and the exclusion never depended on being free input — it rests on grammar.** A colon is outside `[A-Z0-9_]`, so none of the three ever matched the joiner's historical shape rule and none joins today. The audit log demonstrates this by running the unchanged regex against all five concrete messages. **The 152-entry set is unchanged.** The free-input follow-up attribution for `label` and `service` is withdrawn from my findings below; the orchestrator corrects the ticket it filed from that claim.

The six sites are now described as **error-construction candidates** — template literals reaching an `Error` constructor or a `code`/`failureCode` field — not as every DEV-bearing interpolation in the tree. Codex's independent TypeScript-parser walk of all 53 `TemplateExpression`s confirms the six are complete for error constructions in the inspected tree; the other DEV-bearing templates are success messages and newline wrappers around an already-selected code, which add nothing to the joiner's **input** vocabulary. Neither method proves future, multiline or indirect constructions cannot exist, and the audit says so.

**Part B now files and runs the actual generating script.** Round 1 printed a derivation summary where it claimed to print the generating command. `logs/diag-class-a/audit-tools/derive-dev-set.py` (sha256 `37b54f928fb219ea2bb075cbb1d1b2105f2dd87670f73972bdebc04600562d5e`) is now filed beside the audit; Part B prints its sha256, **invokes that exact file**, prints its output and then its full source, so the procedure and the numbers cannot disagree. It reads the producer side from **base blobs via `git show`**, so the committed allow-list can never enter its own derivation. It exits 0 only when both set differences are empty.

Also corrected: the `superseded-r0/` manifest's stale line claiming the parent records stamp `d8319a0a`.

## The alphabets

Producer audit at the delivered tip: `20-producer-audit.log`. Every expected list in every test is written out independently in the test file, never imported from the code under test.

**1 — `s04.ts`, the note's `reason` · 11 values.** 7 sealed kinds + `PROVIDER_CALL_FAILED` / `PROVIDER_CONTENT_UNACCEPTED` (`packages/providers/src/index.ts:53,:69`) + `UNCLASSIFIED_MEMBER_ERROR` + the pre-existing `FX-HR-H6`. Membership is now enforced against the helper's **private** store; the seven spellings are identical to the export's, and drift is a compile error. Sink: `apps/runner/src/index.ts:2695-2699` → persisted, read back at `tests/integration/database.test.ts:3845-3849`.

**2 — `tokenUnlock.ts` · 1 value.** Cleared in r1 and untouched since round 0; codex re-confirmed the classified suffix is byte-identical to base (sha256 `fbe07cde03114cf4e15ff51156f831344c6cb7ef7f594632b7e07cbe54666e69`).

**3 — `dev-auth-stack.ts` · 152 codes + `DEV_UNRECOGNIZED`.** 145 base-blob literals + 3 component-exit + 4 TLS probe. Checked both directions by the filed script: both differences empty.

## Gates

Three runs each at the delivered tip, exit codes read unpiped, every record taken after this round's commit.

| gate | run 1 | run 2 | run 3 | verdict | artifact |
|---|---|---|---|---|---|
| `tests/unit/judgement-s04.test.ts` | 24/24 exit 0 | 24/24 exit 0 | 24/24 exit 0 | **PASS** | `10-gate-judgement-s04.log` |
| `tests/unit/dev-auth-stack.test.ts` | 22/22 exit 0 | 22/22 exit 0 | 22/22 exit 0 | **PASS** | `11-gate-dev-auth-stack.log` |
| `tests/unit/v2ui-data-layer.test.ts` | 59/59 exit 0 | 59/59 exit 0 | 59/59 exit 0 | **PASS** | `12-gate-v2ui-data-layer.log` |
| `pnpm typecheck` | 8 diag, exit 1 | 8 diag, exit 1 | 8 diag, exit 1 | **PASS — identity holds** | `13-gate-typecheck.log` |
| neighbours (`pol01-policy`, `t03-judge-panel`, `t17-envelope`) | 56/56 exit 0 | — | — | PASS | **`28-gate-neighbours-at-tip.log`** (newly filed — codex noted the r1 claim had no saved transcript) |
| wider `tests/unit` | 17 failed / 2324 passed (2341), exit 1 | — | — | pre-existing set unchanged | `25-wider-unit-suite-at-tip.log` |

Typecheck exits 1 at the base too; the gate is **identity**, and all three runs hash to `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`, equal to the untouched-lane baseline.

The wider run's 2324 passed is 2314 (base) + 10 added tests across the three rounds. The failing-name set hashes to `81d0fb09f5da90c6d5a6f674ecbab83b38bc71c975b5f225943e8522f351f0d7` — identical to the untouched base, `diff` exit 0. Stated narrowly, as codex requires: what is demonstrated is that the set of failing test **names** is unchanged; it is not a proof that no regression hides inside an already-failing test. The corpus-count row (`s1-1-depth-contract.test.ts:377`, 233 vs 232) is `F-ORACLE-CORPUS-COUNT` and fails identically at base.

## Mutants

Eleven transcripts, all at the delivered tip, all written to **new `-r2` file names** rather than re-run in place (F-TOOL-MUTATE-3). Every transcript: `pre=0`, `applied` = declared `MUT_EXPECT`, `restored=0`, `hashes=match`, `porcelain=empty`, `RESULT: ok`.

| # | log | mutation | expected | `cmd_exit` | verdict |
|---|---|---|---|---|---|
| **J** | `26-…-private-vocabulary-replaced-by-export-r2` | **F1 remainder**: membership read through the exported array again | KILL | **1** | **KILLED** |
| **K** | `27-…-canonical-vocabulary-widened-r2` | **F1 remainder**: widen the PRIVATE vocabulary instead | KILL | **1** | **KILLED** |
| A | `14-…-s04-passthrough-restored-r2` | reason ← raw `error.message` | KILL | **1** | **KILLED** |
| G | `22-…-s04-membership-check-removed-r2` | drop the runtime membership check | KILL | **1** | **KILLED** |
| B | `15-…-tokenunlock-passthrough-restored-r2` | fixed sentence ← the `(${detail})` template | KILL | **1** | **KILLED** |
| C | `16-…-devauth-shape-rule-restored-r2` | set membership ← the bare regex | KILL | **1** | **KILLED** |
| H | `23-…-devauth-double-read-restored-r2` | emit `current.message` after validating the snapshot | KILL | **1** | **KILLED** |
| I | `24-…-devauth-tls-probe-codes-dropped-r2` | remove all four TLS probe entries | KILL | **1** | **KILLED** |
| D | `17-…-s04-neighbour-rename-survives-r2` | consistent rename, 2 anchors | SURVIVE | **0** | **SURVIVED** |
| E | `18-…-devauth-neighbour-rename-survives-r2` | consistent rename, 2 anchors | SURVIVE | **0** | **SURVIVED** |
| F | `19-…-tokenunlock-neighbour-rename-survives-r2` | consistent parameter rename | SURVIVE | **0** | **SURVIVED** |

**J and K together are the pair the finding needs.** J proves the test discriminates on *which storage* is consulted; K proves it also discriminates on *what that storage contains* — a test that only caught J could be satisfied by any private store, including a wrong one. The round-1 transcripts are archived at `logs/diag-class-a/superseded-r1/` with a manifest and per-file sha256, outside the comparator's population.

## Stamp check

`tools/stamp-check.sh <lane> <logs/diag-class-a/>` at the delivered tip, `21-stamp-check.log`:

```
TIP=12e054d9da29ea17d0d18fb9dc67d185856c1893
records compared: 28 · failures: 10
```
exit 1. **The 18 delivery records — `10`–`20`, `22`–`28` — all stamp the tip; zero flagged.** The 10 flagged are named here and every one is correct by design:

| record(s) | why it does not stamp the tip |
|---|---|
| `01-provision.log` | the orchestrator's provisioning record |
| `02-sweep-dev-codes.log` | the pre-fix producer sweep, superseded by `20` |
| `03-typecheck-baseline.log` | the UNTOUCHED-lane baseline the identity gate compares against |
| `04`, `05`, `06-red-*.log` | the round-0 RED frames |
| `30-red-r1.log` | the round-1 RED frame, taken before the round-1 commit |
| `31-red-r2.log` | **this round's** RED frame, taken before this round's commit — the evidence that the tests preceded the implementation |
| `codex-r1-verdict…`, `codex-r1b-verdict…` | the **reviewer's** frozen verdicts; not worker records and unstamped by nature |

## Findings

**1 · `DevTlsFrontDoorError` double-wraps its cause at `:263` and `:288`.** Already filed as `board/F-DEV-TLS-DOUBLE-WRAP.md`; not duplicated. The `:263` cleanup site should be added to that ticket's scope.

**2 · One DEV-shaped message with a free interpolated tail:** `dev-deployment-register.ts:163` (`override`, an unconfigured environment string). **Withdrawn from this finding: `dev-deployment-register.ts:189` and `validate-compose-postgres.mjs:8`** — both are bounded to two literal messages each and were misclassified in round 1. Only the first belongs with codex's P3 (`dev-api-environment-cli.ts:13-16`).

**3 · `failureKind` keeps its legacy unchecked path** (`s04.ts:305`, runner `:2650`, `:2698`) — excluded by the packet, so a forged kind still reaches that field even though it can no longer reach `reason`. This lane does not sanitise the whole note.

**4 · Two sealed kinds have no producer** (`CONSTRUCTION_ERROR`, `UNCONFIGURED_FAMILY`). No ticket needed; recorded so the "every admitted value has a producer" check is not surprising.

**5 · Node version skew, from codex's Not-verified:** the saved runner reports Node v25.7.0 while package metadata asks for 22.23.1. Not caused by this lane and not investigated by me; flagged because every gate in this report ran under it.

## Not verified

- No integration suite, live database, provider call, TLS listener or browser flow was run. That `reason` reaches a database row rests on reading `apps/runner/src/index.ts:2695-2699` and the integration test's expectations. STRENGTH: **consistent-with**.
- F1 is a **contract** repair. No production writer to the exported array was found by codex or by me; the test constructs the mutation synthetically. No observed production disclosure is claimed. STRENGTH: **entailed statically**, not measured live.
- The four TLS probe codes are established by tracing builders and call sites, not by inducing a live probe failure.
- The six error-construction candidates are complete for the inspected tree by two independent methods (my grep, codex's parser walk); neither proves future, multiline or indirect constructions cannot exist.
- The unchanged failing-name set does not prove no regression hides inside an already-failing test.
- Never pushed, never merged; no branch other than `lane/diag-class-a` touched; no board or DECISIONS file edited; no credential value read, minted or written. Every file in all four commits is inside `allowed`.

## Self-charges

- I did not finish applying my own rule. The audit's stated method is "resolve each interpolated variable to its call sites"; I resolved `errorCode` properly and then labelled `label` and `service` unbounded without opening `requireMatch` or `serviceBlock` — both two-caller private functions, a thirty-second check. The rule was right and I stopped early, which produced a false follow-up finding the orchestrator had to file.
- I wrote `as Record<…>` where I meant a compile-time guarantee, and drafted a comment claiming the guarantee. `as` silences the check. I caught it only because I decided to probe the compiler before writing the claim — which is the practice that should have produced the code in the first place, not rescued it.
- Round 1's accessor test had a title stronger than its discriminator. I asserted membership in a list where I should have asserted the exact value and the exact read sequence; the weaker assertion hid that the helper's successful branch was never exercised under a changing accessor.

WORK: ready — the S04 membership vocabulary is now private, exhaustive against the declared union by a `satisfies` guard proven to fire, and pinned by two mutants (wrong storage, wrong contents); the two misclassified template inputs are corrected to bounded with their exclusion re-grounded on grammar; and Part B now runs a filed script rather than describing one.
