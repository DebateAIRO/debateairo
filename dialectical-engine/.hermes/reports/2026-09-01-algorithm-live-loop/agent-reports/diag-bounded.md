WORKER DIAG-BOUNDED — REWORK READY FOR REVIEW · tip d797d8052c10bd095373f238d4c456064be77fe1 · comments read through: diag-bounded-r1b-2026-09-07
SKILLS LOADED: heartbeat (loader), heartbeat-protocol, heartbeat-worker, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:receiving-code-review

Lane `lane/diag-bounded`, worktree `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-bounded`,
tip `d797d8052c10bd095373f238d4c456064be77fe1`, three commits on `d5b4f7f568aceec55a9cfca72b62473e7ee26c19`
(r0 `d6d0f69c` 7 files · r1 `47479453` 5 files · r2 `d797d805` 5 files). Working tree clean at the tip and
after every mutant. `01-provision.log` ends `PROVISIONED OK commit=d5b4f7f568aceec55a9cfca72b62473e7ee26c19`.
F1 is closed and was not reopened; the rollback work is unchanged since r0.

## Rework round 2 — codex r1b F2, F3, C1, C2

Both findings are correct. I verified each against source before changing anything, and both trace to the
same root cause in my own method: **I checked my generated lists mechanically (shape, count, a
negative-membership probe) and never checked a single entry semantically.** Shape checks cannot tell a
code from a verdict, and a sweep that looks for one syntactic form cannot see a second one.

### F2 — three non-code literals admitted

`MATCHED_EXISTING`, `PROWESS_RANK` and `UNASSESSABLE` were in both maps (API `:333`, `:397`, `:523`;
runner `:4669`, `:4733`, `:4859`). None is a domain code. Read from `packages/evaluator/src/index.ts`:

| value | what it actually is |
|---|---|
| `MATCHED_EXISTING` | an admission `decision` value (`:883`, `:958`, `:1249`), tested by `includes` at `:1317` and `:1594` |
| `PROWESS_RANK` | a member of the `phaseOrder` tuple type at `:2334` and its value at `:2699` |
| `UNASSESSABLE` | an allowed verdict in `addonGradeSchema`'s `z.enum` at `:366` |

**Cause.** My r1 "loop resolution" for `requireNonblank` was
`\[[^\[\]]*,\s*"([A-Z][A-Z0-9_]*)"\]` applied to the whole file — any two-element array anywhere. It
matched a `z.enum`, an `includes` list and a phase-order tuple. The real loop is five tuple pairs inside
`validateAdmissionIdentity` (`:1019–1026`), and it is the ONLY loop. The resolution is now anchored to
that function's text and to the `[input.x, "CODE"]` shape. My r1 report also claimed "22 call sites" for
the direct form; the correct count is **12**, matching codex's syntax-tree count exactly.

All three are removed, and both formatter tests now assert each one is REFUSED, independently of any
generated list. Mutant h re-admits `MATCHED_EXISTING` and the rejection control fails.

### F3 — two declared subclass codes missing

`PROVIDER_CALL_FAILED` and `PROVIDER_CONTENT_UNACCEPTED` are declared by the only two classes in the tree
that extend `TypedDomainError`: `ProviderCallFailedError` (`packages/providers/src/index.ts:52`, `super(…)`
at `:62`) and `ProviderContentUnacceptedError` (`:68`, `super(…)` at `:78`), both thrown by the provider
gateway at `:491` and `:499`. My sweep looked only for `new TypedDomainError(` and never visits `super(`,
so real provider failures degraded to `UNRECOGNIZED_DOMAIN_ERROR` where the pre-lane formatter preserved
them. Codex is right that the class-name map cannot cover for this: these objects satisfy
`instanceof TypedDomainError`, so the typed lookup answers first and never reaches `name`.

The membership audit now includes subclass `super()` declarations as a third producer form. I swept for
`class \w+ extends TypedDomainError` across the whole scope: **exactly two exist**, both above, both now
admitted with citations. Each formatter test carries a control built from the REAL class asserting the
code survives while the raw fields do not — `ProviderContentUnacceptedError` passes `lastParseError` as
its `super` message, so the control feeds a parse error containing a fake key and asserts the diagnostic
contains neither it nor the artifact ref. Mutant i drops `PROVIDER_CALL_FAILED` and that control fails.

### The test-design charge — the half that mattered most

Both r1 tests took their positive-control lists **from the implementation**, so they affirmed whatever the
map contained, including the three bad members. Fixed: `EXPECTED_DOMAIN_CODES` (398) and
`EXPECTED_FAILURE_CONSTANTS` (215) are generated from the PRODUCER CITATIONS, committed in
`tests/unit/api-operational-error.test.ts`, and both maps are compared against them **in both directions**
— so a wrong member and a missing member each turn a test red. The runner test reads those arrays out of
the API test's source text rather than importing them, because importing a test module registers its
suites a second time.

**I applied this to the message list as well, which codex did not charge.** It had the identical
tautology, and fixing only the instance that was named is the failure mode the router's §2.2 exists to
prevent. That is why the API test grew by 689 lines.

### C1 — producer-source revision

The r1 artifact named base `d5b4f7f5` but carried r0-tip line numbers, which are wrong precisely for the
two files this change edits. `r2-03-domain-code-citations.log` is **regenerated at the base**, every line
read with `git show <base>:<path>`: 90 files, **420** literal-argument constructor calls, **2** subclass
`super()` declarations, **13** variable-argument calls resolved to their callers. **520 citation rows for
398 unique codes.** Codex's eight verified spot-checks land on the same lines (evaluator `:1021`,
providers `:62`/`:78`, register `:194`/`:414`, settlement `:267`, db `:68`).

### C2 — attribution, corrected

My r1 report said mutants f/g established the typed token and SQL-fragment rejections, and a/d the
name-derived rejection. Both are wrong: each test stops at its FIRST failing assertion, so a transcript
establishes only that one.

| property | what actually establishes it |
|---|---|
| unknown typed code (`DIAG_REVIEW_SENTINEL`) refused | mutants **f** (API) and **g** (runner) — their stopping frame |
| digest-shaped `message` refused | mutants **a** (API) and **d** (runner) — their stopping frame |
| credential-shaped and SQL-fragment typed codes refused | the **passing complete tests**, plus the static lookup boundary: the branch returns a map value or the fixed fallback, so no input-derived text can leave it |
| credential in `code`, SQL fragment in `message`, secret in `name` refused | the **passing complete tests** and the same static boundary |
| non-code literals refused | mutant **h** |
| declared subclass code preserved | mutant **i** |

## RED

**Round 2** — `05-red-r2.log`, at `47479453`, tests written, maps not yet corrected: **4 failed | 11
passed (15)**. All four are F2/F3, one pair per formatter, and each stops at its first failing assertion:

    AssertionError: expected 'MATCHED_EXISTING' to be 'UNRECOGNIZED_DOMAIN_ERROR'
    AssertionError: expected 'UNRECOGNIZED_DOMAIN_ERROR' to be 'PROVIDER_CALL_FAILED'
    AssertionError: expected 'RUNNER_EXECUTION_FAILED:MATCHED_EXIST…' to be 'RUNNER_EXECUTION_FAILED:UNRECOGNIZED_…'
    AssertionError: expected 'RUNNER_EXECUTION_FAILED:UNRECOGNIZED_…' to be 'RUNNER_EXECUTION_FAILED:PROVIDER_CALL…'

**Round 1** — `04-red-r1.log`, at `d6d0f69c`: **2 failed | 11 passed (13)**, both the sentinel passthrough,
one per formatter. The declared-code controls that precede it passed under the old code too, because a
passthrough also returns declared codes unchanged; they are not RED evidence and I do not present them as
such.

**Round 0** — `03-red.log`, at `d5b4f7f5`: **11 failed | 4 passed (15)**. The only two `not to contain`
frames in that file are the credential-in-`code` leak, one per formatter:

    AssertionError: expected 'DEPENDENCY_AKIAIOSFODNN7EXAMPLE' not to contain 'AKIAIOSFODNN7EXAMPLE'
    AssertionError: expected 'RUNNER_EXECUTION_FAILED:DEPENDENCY_AK…' not to contain 'AKIAIOSFODNN7EXAMPLE'

`grep -c "DEADBEEFCAFEBABE" 03-red.log` returns **0**: the digest property is not evidenced by this file.

## The allow-lists

Read from `apps/api/src/index.ts` at this commit: **215** message constants, **398** domain codes
(overlapping the message list in **5** names), **20** Node/libuv codes, **43** SQLSTATE classes, **32**
class keys yielding **25** distinct outputs, **2** fallbacks — a closed output alphabet of **698**
distinct strings, matching codex's corrected projection. The twin block is **916** lines, byte-identical
in both files.

**Domain codes — 398.** Swept at base over `packages/**`, `apps/api/src/**` and
`apps/runner/src/index.ts`, three producer forms (above). Citations: `r2-03-domain-code-citations.log`.

**Message constants — 215**, unchanged since r0: 137 unique TypeScript literals and 79 unique PostgreSQL
`RAISE EXCEPTION … MESSAGE='CONST'` literals in `migrations/`, overlapping at
`MFA_RECOVERY_CODE_SET_INVALID`. Citations: `r0-03-allow-list-citations.log`.

**What membership means.** Evidence that a literal is DECLARED at that file and line — not that it
propagates to a formatter. Codex demonstrated producers that do not: `PROVIDER_PROBE_RESPONSE_INVALID` is
consumed at `provider-probe.ts:115`, `PSEUDONYM_ALLOCATION_EXHAUSTED` is replaced at
`registration.ts:1437`, and `callSynthesisRole` (`apps/runner/src/index.ts:1313–1321`) deliberately
replaces both provider codes with other typed codes on its own path. The lists over-approximate in the
safe direction: an entry that never arrives is inert, because a hit returns the block's own literal.

**SQLSTATE — 43 classes**, the published appendix enumerated whole, keyed by the two-character class only.
**Error classes — 32 keys**, from the classes that set `this.name`, the built-ins, `ZodError` and `pg`'s
`"error"` wire name.

## The fix

One **916-line** block, byte-identical in both formatters, holding five maps, two fallbacks and
`operationalDiagnosticOf`. Lookup order: typed domain code, then message, then code (Node map, then
SQLSTATE class), then class name, then fallback. Every returned value is a literal declared in the block;
the caught value is only ever a lookup key. Duplicated because the contract forbids a shared module;
codex has ruled the design acceptable for landing with `F-DIAG-SHARED-MODULE` as follow-up, and I created
none. The duplication is pinned by the byte-identity test (mutant e).

Rollback categories are unchanged since r0 and `packages/db/src/index.ts` is untouched in r1 and r2. The
partition, in codex's form: commit attempted → `COMMIT_OUTCOME_AMBIGUOUS`; rollback only →
`ROLLBACK_FAILED`; key destroy only → `CONTENT_KEY_DESTROY_FAILED`; both → the combined category; neither
→ the initiating error is rethrown unchanged, which is not a category.

## Mutants

Nine total. Seven re-run or newly built at this tip; **b and c are cited from round 1** because their
target, `packages/db/src/index.ts`, is byte-identical since `47479453` (`git diff --stat 47479453 --`
lists only the two `index.ts` files). All transcripts end `RESULT: ok`, hashes match, porcelain empty.

| # | mutation | target | expected | observed at `d797d805` |
|---|---|---|---|---|
| f | typed-code passthrough restored | api index.ts | RED | 1 failed \| 6 skipped — `expected 'DIAG_REVIEW_SENTINEL' to be 'UNRECOGNIZED_DOMAIN_ERROR'` |
| g | typed-code passthrough restored | runner index.ts | RED | 1 failed \| 7 skipped — same, prefixed |
| a | message-shape passthrough restored | api index.ts | RED | 1 failed \| 6 skipped — digest-in-message frame |
| d | message-shape passthrough restored | runner index.ts | RED | 1 failed \| 7 skipped — digest-in-message frame, prefixed |
| e | one allow-list entry drifted in one copy | runner index.ts | RED | 1 failed \| 6 skipped — twin comparison |
| **h** | **non-code literal re-admitted** (`MAKER_INVENTORY_UNSATISFIED` → `MATCHED_EXISTING`) | api index.ts | RED | 1 failed \| 6 skipped — `expected 'MATCHED_EXISTING' to be 'UNRECOGNIZED_DOMAIN_ERROR'` |
| **i** | **declared subclass code dropped** (`PROVIDER_CALL_FAILED` renamed) | runner index.ts | RED | 1 failed \| 7 skipped — `expected 'RUNNER_EXECUTION_FAILED:UNRECOGNIZED_…' to be '…:PROVIDER_CALL…'` |
| b | rollback categories collapsed | packages/db | RED | cited from `r1-08`, target unchanged |
| c | category identifier renamed consistently (`MUT_EXPECT=6`) | packages/db | SURVIVE | cited from `r1-09`, target unchanged |

h and i are new this round and exist because F2 and F3 are new assertions: an assertion with no mutant
pins nothing. Codex's qualification of c stands — it renames the boolean and the object KEY, not the
emitted literal, so it shows independence from implementation identifiers, not vocabulary invariance.

## Gates

Three runs each, worst run is the verdict. All at `d797d805`, porcelain 0, project-local runner, exit read
unpiped from the vitest process.

| gate | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `tests/unit/api-operational-error.test.ts` | 7/7, exit 0 | 7/7, exit 0 | 7/7, exit 0 | **7/7 pass** |
| `tests/unit/dev-runner-reconciliation.test.ts` | 8/8, exit 0 | 8/8, exit 0 | 8/8, exit 0 | **8/8 pass** |
| `tests/unit/run-rollback-categories.test.ts` | 4/4, exit 0 | 4/4, exit 0 | 4/4, exit 0 | **4/4 pass** |
| `tests/integration/s6-content-encryption-database.test.ts` | 48/48, exit 0 | — | — | **48/48 pass** (×1) |
| `pnpm typecheck` | 8 `error TS`, exit 1 | — | — | **baseline-equivalent** |

Zero failures, zero flakes. Typecheck is baseline-EQUIVALENT, not green: the ordered `error TS` lines are
byte-identical to `02-typecheck-baseline.log`, SHA-256
`50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120` for both — the same digest codex
recorded. s6 uses the suite's embedded PostgreSQL; no external database was touched.

## Stamp check

    TIP=d797d8052c10bd095373f238d4c456064be77fe1
    records compared: 11 · failures: 0
    OK: every record stamps the filed tip                       [prefix logs/diag-bounded/r2-]

    TIP=d797d8052c10bd095373f238d4c456064be77fe1
    records compared: 38 · failures: 27                         [prefix logs/diag-bounded/]

All 27 are correctly-stamped history: `01-provision.log`, `02-typecheck-baseline.log` and `03-red.log` at
the base; `04-red-r1.log` at `d6d0f69c` and `05-red-r2.log` at `47479453`, because a RED capture
necessarily predates the fix it motivates; the two codex verdict snapshots; and the 9 `r0-` and 11 `r1-`
records at the tips they measured. Re-stamping any would be fabrication.

## Not verified

- Runtime propagation of any admitted constant or code to a formatter. STRENGTH: **undetermined**; codex
  showed several producers whose values are consumed or replaced first. The lists are declared-literal
  evidence, over-approximating in the safe direction.
- Reachability of `ROLLBACK_AND_CONTENT_KEY_DESTROY_FAILED`. STRENGTH: **undetermined**; codex and I
  independently concluded it is unreachable under the current cipher contract. No behavioural test, and I
  claim none.
- Any production disclosure claim. STRENGTH: **undetermined**.
- Hostile getters, proxies, or mutated built-ins on the caught value: out of scope, untested.
- No validation on the declared Node 22.23.1; this host is v25.7.0, identically at base and tip.
- Mutants b and c were not re-executed this round; their target file is byte-identical and their r1
  transcripts stand. STRENGTH: **entailed** for the file identity, **consistent-with** for the inference
  that re-execution would reproduce them.

## Findings outside my contract — named, not fixed

1. `packages/judgement/src/s04.ts:245` writes a raw caught `error.message` into a panel note's `reason`,
   beside an already-bounded `failureKind`. Same class; forbidden file.
2. `packages/kernel/src/index.ts:388` types `TypedDomainError.code` as `string`. This lane closes the
   BRANCH; `F-KERNEL-TYPED-CODE-STRING` is queued to close the TYPE.
3. `apps/runner/package.json` omits `@debateai/valuation`, which `apps/runner/src/index.ts:73` imports;
   it resolves by workspace hoisting. It declares nothing for `@debateai/evaluator`, which is not
   imported — stale in both directions.
4. Ticket `F-DIAG-OPERATIONAL-REGEX` cites the api call site as `:480`; it is `:485` at base.

## Self-charges

- **The root cause of both F2 and F3 is one habit: I validated generated lists mechanically and never
  semantically.** Shape, count and a negative-membership probe all passed on a list containing a grade
  verdict and a phase-order member, because none of those checks can tell a code from a non-code. And a
  sweep for one syntactic form cannot report what a second form would have found. Reading twenty entries
  and asking "is this a code, and where is it thrown?" would have caught F2 in a minute.
- I reported "22 call sites" for `requireNonblank` where 12 is right. The number came from the same
  over-matching regex as the defect, so the defect and its inflated evidence had a single source and
  looked mutually corroborating.
- My r1 mutant attribution asserted properties the transcripts do not establish. A transcript proves the
  assertion it stops at, and nothing after it.
- I broke both source files this round with a splice that matched the `[` of `readonly string[]` instead
  of the array literal, and spent four minutes on a parse error that pointed 50 lines away from the
  damage. Recorded in TOOLING-TRAPS with the count-assertion that turns it into a one-line failure.

WORK: ready — F2 and F3 are closed at tip d797d805 with 398 declared domain codes including both subclass declarations, explicit rejection controls for the three non-code literals, real-subclass preservation controls, expected membership generated from the citations and checked in both directions, two new mutants pinning F2 and F3, the citation artifact regenerated at the revision it names, and the mutant attribution corrected.
