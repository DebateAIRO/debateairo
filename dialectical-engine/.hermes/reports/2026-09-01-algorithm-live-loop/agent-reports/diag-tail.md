WORKER DIAG-TAIL — READY FOR PEER REVIEW · tip a440ec6fad48bc8e8774358e58c5b34fb10d9644 · comments read through: diag-tail-2026-09-07
SKILLS LOADED: heartbeat (loader), heartbeat-protocol, heartbeat-worker, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:systematic-debugging

Filed 2026-09-07 21:11 CEST (from `date`). Lane `lane/diag-tail`, worktree
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-tail`,
base `7ab208f22af6af1c7535a2dcd111e9af7e56c7de`, tip `a440ec6fad48bc8e8774358e58c5b34fb10d9644`,
porcelain empty at the tip. `heartbeat-worker` loaded through the Skill tool without refusal —
the packet's markdown fallback was not needed.

Four commits, none pushed, no merge, no worktree created, no branch touched but this one:

```
a440ec6f docs(traps): a shape-legal synthetic copied from a sibling test can be illegal for your regex
308f1f03 test(diag-tail): make the CLI shape-rule row actually shape-legal
e21245b9 fix(diag-tail): one wrap in the TLS front door, a vocabulary for the dev API CLI, retention as policy
0d04bdd4 test(diag-tail): RED for the TLS double wrap, the dev API CLI shape rule, and the auth-risk retention loop
```

`git diff --stat 7ab208f2..HEAD` — 8 files, 424 insertions, 7 deletions, every path inside the
packet's `allowed` list (entailed; read from `git diff --stat` at the tip):

```
.hermes/TOOLING-TRAPS.md                        |  26 ++
apps/runner/src/dev-api-environment-cli.ts      |  11 +-
apps/runner/src/dev-api-environment.ts          |  53 ++
deploy/dev-auth/tls-front-door.mjs              |  13 +-
packages/db/src/auth-risk.ts                    |  10 +-
tests/unit/dev-api-environment-cli.test.ts      | 138 ++
tests/unit/dev-auth-stack.test.ts               | 119 ++
tests/unit/p2-auth-risk.test.ts                 |  61 ++
```

---

## RED

Taken through `gate-run.sh` at `0d04bdd4` — the tests-only commit, before any source change.
Reported here by name, outside the final-head stamp scope, per the records block.

| record | gate | exit | result | the failure |
|---|---|---|---|---|
| `logs/diag-tail/10-red-tls-double-wrap.log` | `pnpm exec vitest run tests/unit/dev-auth-stack.test.ts` | 1 | `2 failed \| 23 passed (25)` | `expected { …(1) } to be Error: DEV_TLS_CERTIFICATE_INVALID` · `expected { cause: Error: DEV_TLS_LISTEN_FAILED } to be Error: DEV_TLS_LISTEN_FAILED` |
| `logs/diag-tail/11-red-dev-api-cli.log` | `pnpm exec vitest run tests/unit/dev-api-environment-cli.test.ts` | 1 | `7 failed (7)` | `developmentApiEnvironmentErrorCode is not a function` — the classifier did not exist |
| `logs/diag-tail/12-red-auth-risk-retention.log` | `pnpm exec vitest run tests/unit/p2-auth-risk.test.ts` | 1 | `2 failed \| 16 passed (18)` | `Error: EXPECTED_A_POISONED_REJECTION` · `expected 'signal-shape' to be 'policy-shape'` |

The second TLS frame prints the defect literally: the caught error's `cause` was
`{ cause: Error: DEV_TLS_LISTEN_FAILED }`, a plain object, not the Error. **STRENGTH: entailed**
by the record (the value is in the assertion text).

`EXPECTED_A_POISONED_REJECTION` is the packet's "that case passes today — show it": an empty
signal list with `retentionMs = 0` returned a summary and threw nothing.
**STRENGTH: entailed** by the record.

Failure lines were read from the `❯ file:line` markers, not from the shared error text
(the vitest-dedup trap already in `.hermes/TOOLING-TRAPS.md`).

---

## The code sets

### The DEV_API_ENVIRONMENT_* set admitted for the CLI — 13 codes, one producer

Landed as `DEVELOPMENT_API_ENVIRONMENT_ERROR_CODES` in `apps/runner/src/dev-api-environment.ts`
(the file that throws them), written out a second time and INDEPENDENTLY in
`tests/unit/dev-api-environment-cli.test.ts:21-38`, so a widened or narrowed source set reddens
the first row rather than silently redefining "known". Every line below was read by
`grep -noE '"DEV_API_ENVIRONMENT_[A-Z_]+"'` over `apps/`, `packages/` and `deploy/` at the tip;
the number is that code's FIRST throw.

| code | producer · first throw |
|---|---|
| `DEV_API_ENVIRONMENT_OWNER_UNVERIFIED` | `apps/runner/src/dev-api-environment.ts:75` |
| `DEV_API_ENVIRONMENT_CUSTODY_ROOT_INVALID` | `:91` |
| `DEV_API_ENVIRONMENT_CREDENTIAL_CUSTODY_INVALID` | `:101` (also `:111`) |
| `DEV_API_ENVIRONMENT_SECRET_CUSTODY_INVALID` | `:124` (also `:133`) |
| `DEV_API_ENVIRONMENT_CREDENTIAL_FILE_INVALID` | `:142` (also `:146`, `:156`) |
| `DEV_API_ENVIRONMENT_DATABASE_CREDENTIAL_INVALID` | `:174` (also `:186`) |
| `DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID` | `:196` (also `:208`, `:212`, `:215`) |
| `DEV_API_ENVIRONMENT_DEFINITION_INVALID` | `:223` |
| `DEV_API_ENVIRONMENT_CONCURRENT_LOCKED` | `:250` |
| `DEV_API_ENVIRONMENT_DRIFT` | `:257` |
| `DEV_API_ENVIRONMENT_PUBLISH_FAILED` | `:288` |
| `DEV_API_ENVIRONMENT_CREDENTIAL_REQUIRED` | `:344` |
| `DEV_API_ENVIRONMENT_HISTORICAL_REGISTER_SOURCE_INVALID` | `:408` |

The other two producers the CLI calls throw NO code in this vocabulary — checked, not assumed:

- `loadDevelopmentProviderPanelFromEnvironment` — `apps/runner/src/dev-provider-panel.ts` throws
  `DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID` (`:77`, `:82`), `DEV_CLI_PROVIDER_PANEL_TARGET_INVALID`
  (`:89`), `DEV_CLI_PROVIDER_PANEL_REQUIRED` (`:129`). None matches the removed regex either, so
  these already reached the fallback; a test row keeps that true.
- `loadDevelopmentCommandEnvironment` — `packages/register/src/runtime-environment.ts:36` is a zod
  `.strict().parse`; the only bespoke throw on that path is `RuntimeKekUnresolvedError`
  (`:27`, message `KEK_UNRESOLVED`). Not in this vocabulary.

`DEV_API_ENVIRONMENT_FAILED` is the CLI's own fallback, not a producer code; it stays a module
constant and is asserted in the test as a literal. The 13 above are exactly the 13 the landed
joiner already lists at `apps/runner/src/dev-auth-stack.ts:131-143` — **STRENGTH: entailed**, the
two lists were compared as sorted sets and are equal. That file is READONLY here and was not
touched; the set is defined locally instead of imported, because `dev-auth-stack.ts:9` already
imports `dev-api-environment.ts` and the reverse import would close a cycle.

### The wrap sites swept

`grep -rn 'new DevTlsFrontDoorError'` over `*.ts`, `*.mjs`, `*.js` at the tip: **15 constructions,
all in one file** (`deploy/dev-auth/tls-front-door.mjs`). `DevTlsFrontDoorError` is referenced by
exactly two files repo-wide — that one and `apps/runner/src/dev-auth-stack.ts`, which only imports
sibling functions and never constructs it.

Of the 15, exactly **two took a second argument**, and both were the defect. Both are inside the
granted file and both are fixed:

| site (pre-fix → at tip) | code | before | after |
|---|---|---|---|
| `:263` → `:272` | `DEV_TLS_FRONT_DOOR_CLEANUP_FAILED` | `{ cause: error }` | `error` |
| `:288` → `:297` | `DEV_TLS_FRONT_DOOR_START_FAILED` | `{ cause: error }` | `error` |

The other 13 pass a code alone and are unaffected — in PRE-FIX numbering `:61`, `:72`, `:77`,
`:109`, `:114`, `:127`, `:177`, `:241`, `:272`, `:275`, `:279`, `:295`, `:309`.
`grep -rn 'DevTlsFrontDoorError(.*{ cause'` at the tip returns nothing.
**STRENGTH: entailed** — the sweep is a grep over the whole tree, not over a named lead.

Packet defect, minor: the packet cites the cleanup throw at `:262`; it was at `:263` at the base
(the ticket body has `:263` correctly). Named, not absorbed.

---

## The fix

### 1 · F-DEV-TLS-DOUBLE-WRAP — the two call sites, not the constructor

The packet asked which of the two, and why. **The call sites.** The constructor is correct as
written and three independent things say so:

- its DECLARED contract takes the cause raw — `constructor(code: string, cause?: unknown)`,
  `deploy/dev-auth/tls-front-door.d.mts:40`;
- its sibling `DevelopmentAuthStackError` (`apps/runner/src/dev-auth-stack.ts:77-78`) has the
  byte-identical body and is called with a bare `error` at `:323`, `:337` and `:423`;
- the landed joiner's own doc comment (`dev-auth-stack.ts:97-99`) cites this constructor as the
  reason a producer's code literal appears verbatim in `current.message`.

Two of fifteen call sites deviated. Changing the constructor instead would have made those two
right and the other thirteen — plus the declaration and the sibling class — wrong.
**STRENGTH: entailed** for the three facts; **consistent-with** for the conclusion that this is the
cheaper repair, which is a judgement.

A doc comment on the constructor now states the single-wrap rule and names the consequence, so the
next caller has the reason in front of them. Mutant C (below) is the observer for the alternative
"fix" of removing the wrap.

### 2 · F-DIAG-DEV-API-CLI — a vocabulary, and the decision moved out of the CLI

`developmentApiEnvironmentErrorCode(error: unknown): string` in `apps/runner/src/dev-api-environment.ts`:
`error instanceof TypeError` is preserved from the old rule, then ONE read of `message` into a
snapshot, then set membership on that snapshot, else the fixed `DEV_API_ENVIRONMENT_FAILED`. The
single-read rule is the joiner's (`dev-auth-stack.ts:300-305`, codex r1 F3) and mutant F is its
observer. `apps/runner/src/dev-api-environment-cli.ts` keeps the call and nothing else.

Printed contract, byte-identical for every known code: the success line
`DEV_API_ENVIRONMENT_READY=${receipt.keyCount}:${receipt.reused ? "REUSED" : "CREATED"}` is
untouched, and the failure path still prints one code line and sets `process.exitCode = 1`. The
ONLY behaviour change is that a code-SHAPED message absent from the set now prints the fallback
instead of itself. **STRENGTH: entailed** — the 13-row pass-through test plus the source observer.

### 3 · F-AUTH-RISK-RETENTION-LOOP — retention is policy

`packages/db/src/auth-risk.ts`: the disjunct `||!Number.isInteger(retentionMs)||retentionMs<1` is
gone from the per-signal condition, and `if(!Number.isInteger(retentionMs)||retentionMs<1)
poisoned("policy-shape");` sits once before the loop. The per-signal
`expiresAt − observedAt === retentionMs` agreement check stays in the loop — that is a property of
a signal, and a neighbouring test row holds it there.

**Placement, disclosed as a chosen constant.** I put the new check AFTER the `maxSignals` check,
after the `AUTH_RISK_SIGNAL_SCAN_SATURATED` throw and after the `evaluatedAt` check — immediately
before the loop — rather than beside the other policy argument at the top. Beside `maxSignals`
reads better, but it would change a public message: an input that is BOTH saturated and carrying a
bad retention throws `AUTH_RISK_SIGNAL_SCAN_SATURATED` today and would have become
`AUTH_RISK_SIGNAL_POISONED`. The packet requires the public message unchanged, so placement before
the loop is the position at which exactly the two cases the ticket names move and nothing else
does. **STRENGTH: entailed** for "no other outcome moves" — every earlier throw is unconditionally
before the new check, and the loop is unreachable without passing it.

No new category constant was needed: `policy-shape` was already in the bounded set
(`auth-risk.ts:50`), landed by lane/dev-health for `maxSignals` at `:95`.

---

## Mutants

Nine, all through `tools/mutate.sh` v3 at the final tip, NEW file names, each restored inside its
own transcript (`RESULT: ok` on all nine — `pre=0`, applied == `MUT_EXPECT`, `restored=0`,
`hashes=match`, `porcelain=empty`). Each kill is attributed by the `❯ file:line` marker, never by
the shared error text.

| record `logs/diag-tail/r3-mutant-…` | mutation | cmd exit | result | the assertion it kills |
|---|---|---|---|---|
| `a-tls-start-double-wrap-restored` | `:297` back to `{ cause: error }` | 1 | `1 failed \| 24 skipped (25)` | `dev-auth-stack.test.ts:447` — the START chain and its `cause toBe inner` |
| `b-tls-cleanup-double-wrap-restored` | `:272` back to `{ cause: error }` | 1 | `1 failed \| 24 skipped (25)` | `dev-auth-stack.test.ts:474` — the CLEANUP chain |
| `c-constructor-stops-wrapping` | `super(code, …{ cause })` → `super(code)` | 1 | `2 failed \| 1 passed \| 22 skipped (25)` | `:447` and `:474` — the "fix by removing the wrap" route; the pass-through neighbour stays green |
| `d-cli-shape-rule-restored` | set membership → `/^DEV_API_ENVIRONMENT_[A-Z_]+$/u` | 1 | `1 failed \| 6 skipped (7)` | `dev-api-environment-cli.test.ts:70` — the sensitive-message row |
| `e-retention-back-in-loop` | pre-loop check → `signals.length>0 && … poisoned("signal-shape")` | 1 | `2 failed \| 2 passed \| 14 skipped (18)` | `p2-auth-risk.test.ts:423` (empty list) and `:437` (mislabel); both neighbours stay green |
| `f-cli-second-read-emitted` | return `error.message` instead of the snapshot | 1 | `1 failed \| 6 skipped (7)` | `dev-api-environment-cli.test.ts:115` — read-once |
| `g-cli-vocabulary-narrowed` | drop `DEV_API_ENVIRONMENT_DRIFT` from the set | 1 | `3 failed \| 4 passed (7)` | `:58` set equality, `:63` pass-through, `:116` read-once |
| `h-cli-keeps-its-own-shape-rule` | put the old shape rule back in the CLI file | 1 | `1 failed \| 6 skipped (7)` | `:127` — the CLI source observer |
| `i-neighbour-consistent-rename-survives` | rename the private `DEVELOPMENT_API_ENVIRONMENT_FAILED` (×3) | 0 | `7 passed (7)` | **survives, as intended** — a behaviour-preserving rename |

Mutant `e` is scoped to the layer of the property: the loop-vs-policy distinction is a RUNTIME
property of the evaluator, and the mutant restores the old runtime behaviour exactly (empty list →
unchecked, non-empty → `signal-shape`) rather than merely deleting the check.

**One mutant found a defect in my own test and I report it as a finding against myself.**
At the earlier tip `e21245b9`, the shape-rule mutant SURVIVED (`EXIT = 0`, `1 passed`). Root cause,
measured not guessed: the removed CLI rule is `/^DEV_API_ENVIRONMENT_[A-Z_]+$/u`, whose class has
no digits, while the joiner's rule is `/^DEV_[A-Z0-9_]+$/u`. I had copied the corpus's established
synthetic shape `…PW_42…` from `dev-auth-stack.test.ts`, so my synthetic never matched the rule the
row existed to pin: it reached the fallback under the shape rule and under the vocabulary alike,
and the row's own comment claimed the opposite. Fixed at `308f1f03` with a digit-free synthetic
verified against the rule (`node -e '…test("…")'` → `true`), the guard tokens moved to
`PASSWORD_LEAKED`, and the measurement recorded in the test's comment and in
`.hermes/TOOLING-TRAPS.md`. The suite was green and the RED capture was red for the right reason
throughout — only the mutant saw it.

---

## Gates

All at tip `a440ec6f`, tree clean before and after every run, emitted by `gate-run.sh` v3 with the
TOOL named (`pnpm exec vitest` / `pnpm exec tsc`), never a package script. Exit codes read from the
records' own `EXIT =` lines. Three runs each where the packet asks for three; worst run is the
verdict and all three agreed.

| record `logs/diag-tail/r3-…` | command | exit | passed/total |
|---|---|---|---|
| `gate-dev-auth-stack-run1/2/3` | `pnpm exec vitest run tests/unit/dev-auth-stack.test.ts` | 0 · 0 · 0 | 25/25 ×3 |
| `gate-dev-api-cli-run1/2/3` | `pnpm exec vitest run tests/unit/dev-api-environment-cli.test.ts` | 0 · 0 · 0 | 7/7 ×3 |
| `gate-p2-auth-risk-run1/2/3` | `pnpm exec vitest run tests/unit/p2-auth-risk.test.ts` | 0 · 0 · 0 | 18/18 ×3 |
| `gate-int-tls-front-door` | `pnpm exec vitest run tests/integration/dev-tls-front-door.test.ts` | 0 | 3/3 |
| `gate-int-dev-api-environment` | `pnpm exec vitest run tests/integration/dev-api-environment.test.ts` | 0 | 9/9 |
| `gate-int-tls-readiness` | `pnpm exec vitest run tests/integration/dev-tls-readiness.test.ts` | 0 | 5/5 |
| `typecheck-run1/2/3` | `pnpm exec tsc --noEmit -p tsconfig.json` | 1 · 1 · 1 | 8 diagnostics ×3 |
| `gate-extra-session-database` | `pnpm exec vitest run tests/integration/session-database.test.ts` | 0 | 11/11 |
| `gate-extra-wider-sweep` | `pnpm exec vitest run` ×7 files (below) | 1 | 1027/1028, one pre-existing |

`gate-int-tls-readiness` is an extra I added: that suite is the direct cover for
`startAttestedDevTlsFrontDoor` and the packet's FACTS name it. Its file is READONLY and unmodified.

**Typecheck identity — established, not asserted.** The compiler is `typescript@7.0.2`
(the shipped one; recorded in each record's PROVISIONING block, entry
`node_modules/.pnpm/typescript@7.0.2/…/bin/tsc`, sha256 `2219f428a7e5…`), the same identity the
orchestrator's baseline records carry. I extracted the `<<<OUTPUT … OUTPUT>>>` span from all three
baseline records and all three tip records and hashed them: **all six share sha256
`50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`**, and `diff` of each tip span
against the baseline span is empty. Exit 1 with 8 diagnostics is the base's known-red state, every
one of them in `tests/unit/s14-ui.test.ts` from the absent `web/` tree. **STRENGTH: entailed** —
byte identity, not a count match.

**Wider sweep, one pre-existing failure, not mine.** Beyond the gate list I ran, and recorded at
`logs/diag-tail/r3-gate-extra-wider-sweep.log`, every other suite that names a changed module:
`tests/unit/risk-signal-identity.test.ts`, `tests/architecture/dev-tls-front-door.test.ts`,
`dev-local-auth-topology-spec.test.ts`, `dev-real-provider-only.test.ts`,
`dev-auth-data-plane.test.ts`, `tests/integration/dev-api-process.test.ts` and
`tests/unit/s1-1-depth-contract.test.ts`: `1 failed | 1027 passed (1028)`. The one failure is
`s1-1-depth-contract.test.ts > … reports no T1-owned architecture or source-rule violation`,
`ENOENT … web/package.json`, thrown from `tools/orphan-audit/src/index.ts:52`.

Pre-existing and environmental, shown mechanically rather than claimed: `web/` has exactly ONE
tracked file at this commit (`web/next.config.mjs`, `git ls-files web | wc -l` = 1) and no
`package.json`; and `git diff --stat 7ab208f2..HEAD -- web tools/orphan-audit tests/unit/s1-1-depth-contract.test.ts`
is EMPTY — my diff touches none of the three. It is the same missing-`web/`-tree condition that
produces the 8 baseline typecheck diagnostics. **STRENGTH: entailed** for "not caused by this diff";
**undetermined** for whether it is red on every other lane, which I did not measure. Not in my gate
list and out of my contract to fix — named here for ticketing.

---

## Stamp check

```
TIP=a440ec6fad48bc8e8774358e58c5b34fb10d9644  (resolved with git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-tail/dialectical-engine rev-parse HEAD)
records compared: 26 · failures: 0
OK: every record stamps the filed tip
```

Scoped to the final-head prefix `logs/diag-tail/r3-` — 17 gate records and 9 mutant transcripts.
Saved verbatim at `logs/diag-tail/r3-stamp-check-OUT.txt` (the comparator excludes `*stamp-check*`
from its own population, so it is not self-counted).

Reported separately by name, outside that scope, as the records block directs:
`logs/diag-tail/01-provision.log` (provisioning, orchestrator's, ends `PROVISIONED OK
commit=7ab208f22af6af1c7535a2dcd111e9af7e56c7de`) · `logs/diag-tail/baseline/00-typecheck-base-run{1,2,3}.log`
(baselines, orchestrator's, stamped `7ab208f2`) · `logs/diag-tail/1{0,1,2}-red-*.log` (RED, stamped
`0d04bdd4`).

**Superseded record sets, left on disk under their own names rather than deleted, so the re-takes
are auditable:** `r1-*` (22 files, stamped `e21245b9` — superseded by the test fix) and `r2-*`
(24 files, stamped `308f1f03` — superseded by the TOOLING-TRAPS commit). Neither is offered as
evidence; both would fail a stamp check against the filed tip, correctly.

---

## Not verified

- **The full test suite.** I ran the three gate suites ×3, three integration suites, the seven
  wider suites and `session-database` — 1,163 test cases across 14 files, all recorded. I did NOT
  run the whole corpus. **STRENGTH: undetermined** for any suite I did not name.
- **Whether the `s1-1-depth-contract.test.ts` failure is red on other lanes or on dev.** I proved
  my diff does not cause it; I did not measure its status elsewhere.
- **Callers that rely on the old `signal-shape` label for a bad retention.**
  `evaluateAuthenticationRiskSignals` has exactly three call sites —
  `packages/db/src/auth-risk.ts:253`, `:276` and its export through
  `packages/db/src/index.ts:1573` — and both internal sites pass the repository's stored
  `this.retentionMs`. `tests/integration/session-database.test.ts` was run and is 11/11
  (`logs/diag-tail/r3-gate-extra-session-database.log`); it turned out not to import `auth-risk` at
  all — the grep that suggested it was matching a string literal at `:577`. **STRENGTH:
  undetermined** for the runtime behaviour of any out-of-repository caller that supplies an
  out-of-shape retention today and branches on the `signal-shape` label.
- **`deploy/dev-auth/tls-front-door.mjs` is not typechecked.** `tsconfig.json` `include` has no
  `deploy/**` entry, so the compiler sees that file only through
  `deploy/dev-auth/tls-front-door.d.mts`. The `.d.mts` is unchanged and my edit does not alter the
  signature it declares, but no type-level observer covers the `.mjs` body. The runtime mutants
  (a, b, c) are the observers instead.
- **The programmatic compiler question does not arise here.** No in-test contract check was added
  this round; the existing `typescript-classic` (`npm:typescript@5.9.3`) probe in
  `p2-auth-risk.test.ts` was neither modified nor relied upon. The gate compiler is the shipped
  `typescript@7.0.2`.

## Unexpected findings — named, not fixed

1. **The F-DIAG-DEV-API-CLI ticket names a site my packet does not grant.** The ticket's
   2026-09-07 18:54 correction says it "covers the CLI site and `:163`", meaning
   `apps/runner/src/dev-deployment-register.ts:163`:
   ``throw new TypeError(`DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED:${override}`)`` — `override`
   is an unbounded environment string (`DEBATEAI_DEV_SYNTHESIZER_ROLE_REF` /
   `DEBATEAI_DEV_EVALUATOR_ROLE_REF`, `packages/register/src/runtime-environment.ts:49-51`). My
   packet's `allowed` list does not contain that file, and its `readonly` list explicitly places
   `apps/runner/src/dev-*.ts (producers)` out of reach. **I did not touch it.** The ticket cannot be
   closed on my work alone — it needs either a contract amendment or a second seat.
   Verified present at the tip by grep. **STRENGTH: entailed.**
2. **That code is absent from the joiner's vocabulary.** `grep -c
   'DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED' apps/runner/src/dev-auth-stack.ts` = 0, while the
   near-neighbours `DEV_ALGORITHM_REGISTER_FAMILY_MAP_UNRESOLVED` and
   `DEV_ALGORITHM_REGISTER_ROLE_REFS_UNRESOLVED` are listed at `:190-191`. The colon form puts it
   outside the joiner's grammar today, so nothing is leaking through that path — but the omission
   is worth a line on whoever owns finding 1. **STRENGTH: entailed** for the counts;
   **consistent-with** for the reading that it is intentional.
3. **Packet line drift**: cleanup throw cited at `:262`, actually `:263` at the base. Trivial, but
   the records block makes every quoted constant verifiable-or-defect, so it is named.

## Self-charges

1. **I copied a synthetic constant instead of measuring it, and shipped a row that pinned
   nothing.** One line of `node -e` before writing the assertion would have caught it. Cost: a full
   re-take of every final-head gate and mutant record. Detail in Mutants above.
2. **I appended to `TOOLING-TRAPS.md` after taking the record set, not before.** A trap append is a
   tracked edit; it moved the tip and invalidated 24 freshly-stamped records. The records block
   says "commit EVERYTHING of the round … BEFORE taking any gate record" and I read it, staged the
   source and tests, and still left the trap file for last. Cost: a second full re-take. Both costs
   are now written into the traps file as an ordering rule.
3. **I first wrote "did not run" where "run it" cost one command.** The `auth-risk` consumer
   sweep was disclosed as a gap in the first draft of this report instead of being closed; running
   it took one gate record and also showed my premise was wrong — `session-database.test.ts` does
   not import `auth-risk`, the grep was matching a string literal. Disclosing a gap is not a
   substitute for measuring when measuring is cheap, and a file list from a loose grep is a lead,
   not a fact.

WORK: ready — three tickets fixed RED-first behind nine mutants (eight kills, one intended
survivor), 17 gate records at tip a440ec6f (14 green, 3 typecheck byte-identical to the baseline,
1 carrying only a pre-existing failure proved not to be mine), stamp check clean over 26 records,
with one out-of-contract site named for F-DIAG-DEV-API-CLI that this seat could not close.
