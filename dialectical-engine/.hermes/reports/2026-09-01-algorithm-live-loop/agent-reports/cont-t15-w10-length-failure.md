READY FOR HERMES STAGE REVIEW · comments read through: token-audit-2026-09-03

# Self-report — cont-t15-w10-length-failure · BUILD(CONT-T15) · ticket W10

Seat: `cont-t15-w10-length-failure` (Claude Opus 5, 1M context) · mission
`2026-09-01-algorithm-live-loop` (continuation of 2026-09-16) · base `90610345` ·
branch `mission/2026-09-16-algorithm-live-loop-continuation` · tip `359a3e84`.

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How
> can we turn this into a one prompt machine even better.

---

## 0 · The body on the floor

Three charges, three commits, sixteen new assertions, eleven mutants (eight killed, three
neighbours correctly ignored), zero rework rounds, six packet issues, one contract gap I could
not close, seven findings I did not fix. No suggested step proved impossible; one proved
*forbidden by a law the packet did not mention*, and that is the interesting one.

The ticket was already an unusually good murder case when it reached me: `audits/
token-budget-reasoning.md` had done the pathology (`finish_reason` appears nowhere; a
truncation is filed as bad JSON; the repair path makes attempt 2 strictly worse). **That audit
is the single largest reason this seat cost what it cost and not three times more.** Keep
writing them. Everything below is about the gap between "the audit knows" and "the code
changed".

---

## 1 · CAUSE, not symptom — the five things that actually cost tokens

### 1.1 The packet's write contract was drawn around the DEFECT, not around the FIX

**Cause.** `allowed` listed `apps/runner/src/index.ts` "(… and the synthesis-role cost-row
reads)" — i.e. the packet expected me to point the runner's two synthesis call sites at the new
sealed bounds. That is impossible inside the contract, and it takes ~15 minutes of reading to
find out why:

- the two reads are `this.settings.composerBound` / `conformanceBound`
  (`apps/runner/src/index.ts:4098`, `:4170`);
- `WalkingSkeletonSettings` is built in `apps/runner/src/main.ts:74-76,138`, from
  `apps/runner/src/dev-runner-policy.ts:276`, which constructs `RunnerSynthesisRolePolicy`
  field by field;
- **neither file is in `allowed`**, and a required new field on that policy is a TS2739 in five
  files outside the contract (`dev-runner-policy.ts`, `tests/integration/database.test.ts:236`,
  `dev-deployment-register.test.ts:634,761`, `t17-envelope-ledger.test.ts:464`).

**Price:** ~20 minutes and ~25k tokens of read-and-reason, ending in a decision NOT to write
code. I minted the rows and reported the gap; the runner still borrows the retired organs'
bounds at runtime.

**The trap I nearly fell into, and it is the expensive one.** The available escape was an
OPTIONAL field with `?? this.settings.composerBound`. It compiles, it touches only files I own,
it looks like the charge was delivered — and because no deployment can populate it (main.ts is
forbidden), *the runtime behaviour would be unchanged*. A no-op wearing a fix's costume, green
on every gate, invisible to review. **Every "make it optional so the other files still compile"
instinct is this shape.** The rule I would write into the worker contract: *an optional field
whose only producer is outside your contract is a no-op — say so instead of shipping it.*

**UPGRADE (highest value in this report).** A packet's `allowed` list must be derived by walking
the DATA PATH of each charge to its producer, not by naming the file where the defect is
visible. Concretely, for any charge of the form "X should read Y instead of Z", the contract
must contain every file on the chain `Y → … → X`, or the charge must be restated as "mint Y"
and say so. This is mechanisable: `grep -rn '<the settings field>' apps packages` at packet-
authoring time would have printed the five constructors in one second.

### 1.2 A law the packet did not name, enforced by a regex that cannot see the house style

`pnpm run audit:source` gained one row the moment I exported three constants. The law
(`tools/orphan-audit/src/index.ts:694`) refuses an exported numeric source literal. Its regex is
`/export\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*-?\d+(?:\.\d+)?\s*[;\n]/`.

I exported `= 180_000;`, `= 2_048;` and `= 3;`. **It caught exactly one.** `\d+` stops at `180`,
and `_000;` is not `\s*[;\n]`, so the two constants written in this repo's own numeric-separator
style are invisible to the law that plainly covers them.

The dangerous direction is not the false negative — it is that *the obvious way to clear the row
it did report is to reshape the literal*. Writing `3` as `3_0` would have made the audit green
and the law unenforceable in the file that most needs it. I removed the exports instead (they
are module-private; this file IS the register carrier the law points at).

**Price:** one full `audit:source` cycle plus the fix, ~10 minutes. **Cheap only because the
packet made me diff against a BASE capture.** Without `base-audit-source-01.log` I would have
seen `rc=1` with three familiar `obs-capture` rows and called it pre-existing.

**UPGRADE:** (a) fix the regex to accept `_` separators — it is a one-character class; (b)
every packet whose write surface includes `packages/**` or `apps/**` should name the
source-purity law by file:line the way it names TOOLING-TRAPS headings. Filed as findings F5/F6.
Appended to `.hermes/TOOLING-TRAPS.md` as a new entry.

### 1.3 The read-surface grep named a file that does not contain the symbol

Packet §1: *"the cost-row reads for the retired COMPOSER/CONFORMANCE organs … (`grep -rn
'COMPOSER\|CONFORMANCE' packages/register/src/algorithm-policy.ts | head`)"*. Both alternatives
return **nothing**: those rows live in `apps/runner/src/dev-deployment-register.ts:50-52`
(`DEVELOPMENT_ORGAN_COST_BOUNDS`) and are consumed at `packages/register/src/index.ts:438`.

This is the third recorded instance of the family (`TOOLING-TRAPS.md:5212` — "the packet's own
grep can name the wrong FILE"; `:5045` — "a site COUNT has an expiry"). I only caught it in one
read because that trap told me to run each alternative of an OR'd grep SEPARATELY. **Reading
the traps index paid for itself inside five minutes.**

**Price:** ~5 minutes; would have been 30+ without the trap.

**UPGRADE:** packet authoring should EXECUTE every grep it embeds and paste the first line of
output into the packet. A grep that returns nothing at authoring time is a defect caught for
free; the same grep in a seat's hands costs a reading pass and a confidence hit on the whole
packet.

### 1.4 The charge "record it as LENGTH_EXCEEDED" collides with a sealed DB constraint

`raw_artifact.parse_status` is `CHECK (parse_status IN ('PARSED','UNPARSED','PARSE_FAILED',
'SCHEMA_FAILED'))` (`migrations/0004_s04.sql:14-21`) and the erasure-redaction constraint pins
each status to its `parse_error` text (`migrations/0040_account_erasure.sql:338-340`). Making
`LENGTH_EXCEEDED` a fourth-and-a-half column value needs a migration — and my contract grants
exactly ONE, named `_synthesis_role_cost_rows.sql`. Smuggling a `parse_status` widening into a
migration named after cost rows would be dishonest, and the blast radius reaches
`packages/ledger`, `packages/judgement` and `apps/observation-agent`, none of them mine.

So the status is typed at the refusal (`ProviderContentRejectionStatus`,
`ProviderContentUnacceptedError.lastParseStatus`) and durable in the artifact's UNCONSTRAINED
`metadata.finish_reason`. **This is the right engineering answer, not only the in-contract one:**
had I widened the column, a real truncation in production would have hit a CHECK violation at
persist time — i.e. the first live length failure would crash the recorder instead of being
recorded. Worth stating plainly because a reviewer reading "never PARSE_FAILED" against
`parse_status` will think I under-delivered.

**Price:** ~10 minutes of migration reading. **Unavoidable and well spent.**

**UPGRADE:** when a charge says "record X as a new status", the packet should say which of the
three layers it means — the typed refusal, the persisted column, or the metadata — because they
have three different costs and only one of them is free.

### 1.5 Three clusters, one test file, one gate — the sequencing tax

Each cluster's gate is the WHOLE `w10-length-failure.test.ts`. If I had written all three RED
blocks up front (the literal reading of "RED first per cluster … each failing on the base"),
cluster C1 could never have been committed green: C2's and C3's assertions would still be red at
C1's tip. I wrote the file in three stages instead — RED for the cluster, implement, green,
commit, three runs — which satisfies both laws exactly.

**Price:** near zero once seen; it is a 10-second decision that would have cost an hour of
"why is my gate red at my own commit" if taken literally.

**UPGRADE:** say it in the packet: *when several clusters share one gate file, the file grows
one block per cluster; the base-RED evidence for a cluster is captured when that block is
written, not all at once.*

---

## 2 · What repeatedly cost tokens (ranked, with the fix)

| # | Cost centre | Tokens (est.) | Fix |
|---|---|---|---|
| 1 | Establishing the contract boundary of a charge (§1.1) | ~25k | Packet authoring walks the data path (§1.1 UPGRADE) |
| 2 | Re-deriving "who reads this collection" by hand | ~12k | A `tools/who-reads.sh <literal>` that runs the three greps the law already mandates and prints EXACT-pin hits only |
| 3 | Reading `packages/providers/src/index.ts` and `algorithm-policy.ts` in slices to find one function | ~8k | Packets already give line ranges; give them for the WRITE surface too, not just the read surface |
| 4 | Full `Bash` output of one integration gate (~2,800 lines) reaching my context | ~6k per run | Already solved by the packet's "log first, print rc + failures + summary" rule — this is the single best rule in the packet and it should be a HOUSE default, not a per-packet instruction |
| 5 | Mutant apply/restore round-trips (7 × ~2 min) | ~7k | A `tools/mutate-inline.sh <file> <old> <new>` that backs up byte-identically, runs the gate, restores and prints `git status` in ONE call. I hand-rolled this three times in python heredocs |

**The zero-cost win nobody is claiming:** the `run.sh` wrapper the packet mandated (full output
to a log, print only `rc`, failing case names and the `Test Files`/`Tests` lines) cut roughly
**80k tokens** across ~30 runs in this seat alone. It should live in `tools/`, not be re-typed
by every seat into its own scratchpad.

---

## 3 · What I nearly got wrong

1. **The no-op optional field** (§1.1). Closest call in the seat. Green gates, zero behaviour
   change, and it would have read as delivered.
2. **Clearing the `audit:source` row by reshaping the literal** (§1.2). I was one keystroke from
   `3_0`.
3. **Trusting the packet's grep** (§1.3). If both alternatives had been ORed into one command and
   I had skimmed the output, I would have concluded the cost rows live in the register package
   and designed the whole of C3 around the wrong file.
4. **Asserting `finish_reason` only on the STRICT parse.** My first sketch read it off
   `responseSchema.parse(decoded)`, which throws before the artifact is persisted when the
   response is malformed — the exact case where you most want to know why it stopped. The
   lenient reader (`observedFinishReason`) exists for that reason. No test covers
   "strict-parse-fails AND finish_reason present"; named as finding F7.
5. **Reading the manifest count from the test instead of the source.** `toHaveLength(15)` is in
   MY allowed surface "to add the two rows"; it would have been easy to change 15→17 and never
   check that `ALGORITHM_REGISTER_ROW_KEYS` is derived, not literal. It is derived.

---

## 4 · Dead ends — do not re-derive these

- **A new `synthesisCost` register family.** Costs a new reader, and a reader is only reachable
  at boot if re-exported from `packages/register/src/index.ts` — an explicit export list that is
  usually outside a seat's contract. Putting the rows in the EXISTING `synthesisRoles` family
  gets the loud startup failure for free (`dev-runner-policy.ts:203` already calls
  `readSynthesisRoleControls`). Appended to TOOLING-TRAPS.
- **Widening `raw_artifact.parse_status`** (§1.4). Blocked by two constraints, three packages and
  a migration name.
- **Making `judgeDeadlineMs` a REQUIRED input to `buildAlgorithmRegisterRows`.**
  `acceptance/seed-register.ts:98` is the second caller and is not in contract; required breaks
  it, and the acceptance project is invisible to `pnpm run typecheck` (`TOOLING-TRAPS.md:1239`,
  `:5257`), so it would have failed at ACCEPTANCE RUN time, not at compile time. Optional with a
  `max(floor, judge)` fold is both in-contract and stronger.
- **Importing the new symbols from `@debateai/register`.** The barrel's export list is explicit
  and not in contract. The house pattern is already there:
  `tests/integration/t16-algorithm-register.test.ts:64` imports
  `packages/register/src/algorithm-policy.js` directly.

---

## 5 · Where the packet was unclear (verbatim, so it can be fixed)

1. `allowed` includes "the synthesis-role cost-row reads" in `apps/runner/src/index.ts` but not
   `main.ts`/`dev-runner-policy.ts`. **Contract gap, not a wording problem** (§1.1).
2. The read-surface grep names the wrong file (§1.3).
3. "recorded as `LENGTH_EXCEEDED` (its own status)" does not say WHICH layer (§1.4).
4. "`tokenCeiling` (stays 2048)" is in `forbidden`. I read it as the sealed ROW value, and it is
   untouched. My C2 escalation raises the per-attempt `max_tokens` AFTER a measured truncation
   (2048 → 4096 → 6144, linear, bounded by `maxAttempts`). A reviewer could read the forbidden
   line as "the request's max_tokens stays 2048 always", which would make the ticket's own
   remedy ("retry the same prompt with a raised ceiling") unimplementable. **Disclosed here
   because it is the one constant I chose that a reviewer might contest.**
5. The three-clusters-one-gate sequencing is not addressed (§1.5).
6. `pnpm run audit:source` is described as "unchanged (paste)" without naming its base state.
   `rc=1` with three `packages/obs-capture/install/*` rows IS the base. A seat that assumes
   `audit:source` is green at base will spend a pass hunting three findings that are not theirs.

---

## 6 · The one-prompt machine — what would have removed a human from this loop entirely

This ticket is close to fully automatable. The gaps, in order of value:

1. **Data-path-derived contracts (§1.1).** Until `allowed` is computed from the charge rather
   than authored from the defect, every seat spends its first 20% discovering what it may not
   do. This is the single biggest lever and it is mechanical.
2. **Executable packets.** Every grep, count and path in the packet should be RUN at authoring
   time and pasted with its output. Three of my six packet issues (§5.2, §5.6, and the migration
   number — which was correct) are "a claim that was true when written, or never true". A packet
   that carries its own measurements cannot rot silently.
3. **House tooling for the two rules every packet restates.** `run.sh` (log-first gate runner)
   and a mutant harness. Both are re-invented per seat, in scratch, slightly differently. Two
   scripts in `tools/` remove ~15% of every coding seat's tokens and a whole class of
   "my measurement was broken" transcripts.
4. **The law index.** TOOLING-TRAPS is indexed by heading and that works. `tools/orphan-audit`'s
   rules are NOT indexed anywhere, so they are discovered by tripping them. A one-page
   `docs/laws.md` listing each audit rule with its file:line and one sentence would have saved
   §1.2 entirely.
5. **A "no-op detector" in review.** The failure mode of an over-tight contract is a change that
   compiles, passes and does nothing (§1.1). A reviewer heuristic — *for each charge, name the
   line of PRODUCTION code whose behaviour differs, and the test that would fail if it did not*
   — catches it mechanically. I applied it to myself here; it is why C3 is reported as "rows
   minted, consumption blocked" instead of "done".

**What is already working and should not be touched:** the audit-before-ticket pattern; the
three-run worst-wins law (it caught nothing here, which is the point — 9/9 green is evidence,
not luck); RED-first per cluster; the refutation duty, which is the reason I know my seven
assertions pin the property and not the demo (two neighbours stayed green, and the D71 boundary
killed M3 unprompted).

---

## 7 · Findings (also in the handoff, with file:line)

- **F1** `packages/judgement/src/index.ts:503` — `error.lastParseStatus === "PARSE_FAILED" ?
  "PARSE_FAILURE" : "SCHEMA_FAILURE"`. A judge length failure now reaches the else-branch and is
  recorded as a SCHEMA failure. Not blocking (no judge fixture truncates today); it re-creates
  the exact confusion W10 exists to remove, one layer up.
- **F2 (class, 2 more members)** the same finish-reason blindness in the other completion call
  sites: `packages/evaluator/src/public-aggregate-provider.ts:95-140` (fixed `max_tokens`,
  appending `repairPacket`, truncation → `CONSUMER_PROVIDER_FAILED`, retried identically) and
  `apps/api/src/support/model.ts:188-215` (no `max_tokens` at all, `finish_reason` ignored, a
  truncated completion is accepted as content). `packages/providers/src/provider-probe.ts:75`
  uses `max_tokens: 8` where truncation is expected — immaterial.
- **F3** `apps/runner/src/index.ts:4098,4170` — the synthesizer and evaluator still pass
  `composerBound`/`conformanceBound` at runtime. The sealed rows exist and are read; the wiring
  needs `main.ts` + `dev-runner-policy.ts` (§1.1).
- **F4** stale prose after the manifest grew 15→17: `acceptance/seed-register.ts:21,364`,
  `acceptance/dual-maker-proof.test.ts:114`, `tests/integration/t16-algorithm-register.test.ts:408`
  all say "fifteen". Out of contract except the last, which I left alone for the same reason.
- **F5** `tools/orphan-audit/src/index.ts:694` — the source-purity regex misses numeric
  separators (§1.2).
- **F6** `tools/orphan-audit/src/index.ts:697` — the finding names the FILE, never the symbol, so
  a seat with three new exports cannot tell which one tripped it without bisecting.
- **F7** no test covers "strict response-schema parse fails AND `finish_reason` is present" —
  the case `observedFinishReason` exists for (§3.4).

---

## 8 · Numbers

| | |
|---|---|
| Commits | 3 (`a3a8736a`, `3398a24b`, `359a3e84`) |
| Files written | 7, all inside `allowed` |
| New assertions | 16 (3 C1, 4 C2, 9 C3) |
| Mutants | 11 — 8 killed (M1, M2, M3 · M5, M6 · M8, M9, M10), 3 neighbours correctly survived (M4, M7, M11) |
| Cluster gates | C1 3/3 green, C2 3/3 green, C3 3/3 green (`Test Files 6 passed (6)`; JSON `testResults.length` = 6; 115 tests) |
| `pnpm run typecheck` | 0 diagnostics at base and at tip |
| `pnpm exec tsc -p acceptance/tsconfig.json` | 0 diagnostics at tip |
| `pnpm run audit:source` | byte-identical to base (rc=1, same 3 pre-existing rows) |
| Rework rounds | 0 |
| Wall clock | ~55 minutes |

---

# Fix round 1 — the case reopened

Round 1 of 5, base `f427fd9f`, tip `777f03b3`. Four commits (F3, F7, F1/F2 member C, and a
typecheck follow-up). The orchestrator charged all six of my packet issues to itself and used
issue (1) — the contract drawn around the defect instead of the fix — as this round's reason.
**Section 1.1 of the pass-1 report was the right call and it was also the expensive one: the
work it deferred cost a whole extra round.** That is the single most useful number in this file.

## 1 · What the round proved about the pass-1 decision

I refused to ship an optional settings field with no in-contract producer, called it a no-op, and
reported the gap. Round 1 granted the missing files and the fix took **~25 minutes**: a required
field, one line in `dev-runner-policy`, four read sites, five fixtures. `main.ts` — granted — was
not needed at all, because it already forwards the policy whole.

So the true cost of the pass-1 contract gap was: ~20 minutes discovering it, a full extra dispatch,
and a second full verification pass (~35 minutes of gate time). **Roughly 2 hours and ~120k tokens
to deliver 25 minutes of code.** The refusal was still correct — shipping the no-op would have cost
more, later, with a green board — but the price of an under-drawn `allowed` list is now measured,
not argued.

**UPGRADE, restated with the number attached:** derive `allowed` by walking the data path of each
charge to its producer. One `grep -rn '<the settings field>' apps packages` at packet-authoring
time would have printed the five constructors in one second and saved the round.

## 2 · The three self-inflicted regressions, and what each one teaches

I was green on the cluster gate and RED on the suite. The first full `database.test.ts` run
reported **25 failures**. All three causes were mine.

### 2.1 A new call bound is a CLAIM-GUARD change (25 failures)
I gave the two roles distinct bounds so the recorded-bound assertion could tell them apart, and
picked `deadlineMs` as the discriminator. The claim requirement is
`holds * (cooldown + deadline) + deadline + margin`, and that file runs `maxCooldownHoldsPerRun: 2`
with `cooldownMs: 600_000` — so **every extra millisecond of deadline costs three against the
claim**, and +4_000ms needed +12_000ms nobody had budgeted.
**Price:** one full suite run (~5 min) plus the diagnosis. **Cure:** discriminate on a field that
is not in the claim arithmetic, and pin the deadline's participation in ONE dedicated test.
**What I nearly got wrong:** raising `claimMs` in the fixture. It would have gone green and
silently changed the timing envelope of 25 unrelated scenarios.

### 2.2 A guard that dereferences a REQUIRED field pre-empts the refusal that owns its absence
One test casts `synthesisRolePolicy` away on purpose to pin the RUNTIME gate behind the required
type. My claim read dereferenced it ~80 lines earlier, so the named
`SYNTHESIS_ROLE_CONTROLS_UNRESOLVED` became `Cannot read properties of undefined`. The refusal was
still there and still correct — it had simply become unreachable.
**Cure:** optional-chain and fold to a value that cannot change the verdict (`?? 0` in a
`Math.max`), naming the refusal that owns the case in the comment. **Not** a silent default: a
deferral to the gate that reports it properly.
**Generalisable:** before adding a read of a required-typed field, grep for a runtime gate on that
same field.

### 2.3 Raising a RETIRED organ's bound drives nothing once the role has its own
Two fixtures raised `conformanceBound.maxAttempts` / `composerBound.maxAttempts` to force repair
attempts. After the rewiring those budgets moved, the roles spent one attempt, and the runs died on
the first schema failure with **Zod frames naming product fields** (`objection`, `criteria`,
`segments`). That reads as "your product change broke the schema"; it was a fixture that had
quietly stopped provisioning. Same family as TOOLING-TRAPS `:5136` (a fixture defect wearing the
product's costume), from a new direction: the fixture did not break, it stopped MATTERING.

## 3 · The finding that was not what it was filed as

F7 arrived as "add the missing test case, cheap". I wrote it, and **it passed on arrival**. The
honest move at that moment is the whole lesson: a test written for a missing case that passes is
either coverage or a weak predicate, and you cannot tell without strengthening it. Naming the
status in the assertion turned it red — `PROVIDER_CALL_FAILED` where `LENGTH_EXCEEDED` was owed. It
was a missing BEHAVIOUR.
**Price:** ~10 minutes. **Value:** a real defect one layer in from C1's, which would otherwise have
shipped behind a green test that "covered" it.
**UPGRADE:** when a "missing case" test passes on arrival, do not file it as coverage. Strengthen
the assertion until it names the outcome the ticket owes, then re-run.

## 4 · What made the class sweep cheap, for once

The round handed me a decision RULE instead of a verdict ("sealed vocabulary → ticket; not sealed →
fix"). Applying it took three greps and produced three defensible answers, one of them a fix. That
is the cheapest review instruction I have received in this mission: **a rule I can apply costs a
fraction of a list of members I have to adjudicate**, and it makes the report mechanically
checkable — the reviewer re-runs my greps rather than re-arguing my judgement.
The measurement that decided member C: `SUPPORT_MODEL_` appears **0** times in
`KNOWN_DOMAIN_CODES`, **0** in `apps/api/src/index.ts`, **0** in the generated membership test and
**0** in `migrations/`. One command, three tickets' worth of scope settled.

## 5 · What still cost tokens in this round

| # | cost centre | price | fix |
|---|---|---|---|
| 1 | Full `tests/integration/database.test.ts` runs (4 of them) | ~20 min wall, ~10k tokens of summaries | The `-t` filter for iteration is right, but it cannot see the 25 collateral failures. **A fast pre-flight that runs only the scenarios sharing the changed fixture** would have caught 2.1 in seconds |
| 2 | Splitting one test file across two commits (F7 / member C) | ~10 min of park-and-restore | `git add -p` is unavailable non-interactively; a `tools/` helper that stages a named `describe` block would pay for itself |
| 3 | Re-deriving the reader set for a new emission | ~6k tokens | still the `tools/who-reads.sh` I asked for in pass 1 |
| 4 | vitest's typecheck blindness, again | one round-trip | the fixture ran green while missing a REQUIRED field; only `pnpm run typecheck` saw it. **Run typecheck immediately after the first GREEN, not at the end** |

## 6 · The one-prompt machine, refined by this round

Pass 1 said: derive contracts from the data path, make packets executable, put the two house
scripts in `tools/`, index the laws, add a no-op detector. This round adds two:

6. **Give seats a decision RULE, not a finding list, whenever the finding is a class.** §4 above:
   it collapsed three members into three greps and made the answer auditable.
7. **A fix round must budget for the blast radius of its own fix.** Every one of my three
   regressions was a fixture that depended on a value I moved. The packet that grants a required
   field should also say: *the compile errors are your reader list; run the FULL suite of every
   file they name before you claim the cluster.* I ran the full suite because the round's
   verification order told me to — had it not, three green cluster gates would have shipped 25
   broken scenarios.

**Still true and still working:** RED-first per finding, the refutation duty (M13's frame —
`PROVIDER_CALL_FAILED` where `CLAIM_BOUND_MISMATCH` was owed — is exactly the evidence that the
claim no longer covered the call), three-run worst-wins, and log-first gate runs.

## 7 · Numbers for this round

| | |
|---|---|
| Commits | 4 (`4ca14051`, `c45342ee`, `af895e4a`, `777f03b3`) |
| Findings addressed | F3 (fixed), F7 (fixed — and reclassified), F1/F2 (1 of 3 fixed, 2 ticketed with their seals named) |
| New assertions | 6 (2 F3, 2 F7, 2 member C) |
| Mutants | 4 — all killed (M12, M13, M14, M15) |
| Self-inflicted regressions found and fixed | 3 (25 + 2 failing scenarios) |
| Gate | 13 files, 282/282, three runs, `testResults.length` = 13 each; worst run green |
| `audit:source` | byte-identical to the pass-1 base |
| Both typechecks | 0 before any edit, 0 after |
| `mode change` count in the round's diff | 0 |
| Wall clock | ~50 minutes |
