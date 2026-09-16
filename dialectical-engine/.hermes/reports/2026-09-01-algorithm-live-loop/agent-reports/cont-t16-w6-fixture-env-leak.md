READY FOR PEER REVIEW · comments read through: w4-2026-09-03

# Self-report — cont-t16-w6-fixture-env-leak · BUILD(CONT-T16) · W6 (SECURITY)

seat `cont-t16-w6-fixture-env-leak` · node BUILD(CONT-T16), pass 1 of 3 · model claude-opus-5
branch `mission/2026-09-16-algorithm-live-loop-continuation` · base `f0f9eeb2` · code tip `8913b9a4`
worktree `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

---

## 1. The murder — cause, not symptom

**The victim** is `ledger.raw_artifact`. **The weapon** is one expression, `environment: process.env`,
written six times across the acceptance tree. **The motive is the part that matters**: every one of
those six sites was written by someone testing *environment isolation*. The fixtures echo their
environment *because* the relay suites assert the child got only the keys the adapter admits. The
echo is the instrument of a security test. Serialising the whole environment made the instrument
maximally informative — and that is exactly why nobody questioned it.

**The cause is not carelessness. It is that the safest-looking version of a probe is the one that
returns everything.** A probe that returns everything cannot be wrong about what to return, so it
never has to be justified; the justification is what would have surfaced the leak. An allow-list
forces the author to write down *why each key is here*, and that sentence is the audit.

**Why it survived.** The content is opaque to every gate the mission runs. `tsc` sees a
`NodeJS.ProcessEnv` flowing into `JSON.stringify` — legal. The relay suites parse the echo and assert
a subset of it — green. Lint never reads runtime values. The only thing that can see this defect is
an assertion about what the fixture *emits*, and none existed. **A defect whose entire signature is a
runtime value is invisible to a static gate stack, however thorough.** That is the reusable finding,
not "somebody wrote `process.env`".

**Blast radius, measured.** The claude and grok adapters admit real maker credentials to the child on
purpose (`claude-relay.ts:142`, `grok-relay.ts:88`). In `claude-relay.test.ts`'s exact-set test those
keys are overwritten with sentinels, so that path was never the leak. The leak is every *other* run of
those fixtures — the F26 preflight-parity test (`claude-relay.test.ts:471-497`) sets no sentinels at
all — where the operator's real key reaches the child, is serialised into the model content, and is
persisted. V's rotation is the right operational half; the code half is now an allow-list, and the
residual is stated in §5.

## 2. What repeatedly cost tokens

Priced by what I actually spent, worst first.

| Cost | What happened | Price |
|---|---|---|
| **Reading to find the write surface** | The packet named the four members and their lines, and all four were correct — but I still had to read five consumer suites at ~80 lines each to derive the allow-lists, because *nobody had written down which assertion justifies which key*. | ~6 file reads, the single largest block of the task |
| **Re-measuring line citations after my own edit** | I wrote `:416-422` into a comment, then added 15 lines above it, and the citation was stale before I finished the sentence. Caught it only because I re-ran the grep. | 2 extra greps + 1 edit |
| **Attribution of a pre-existing red** | `adversarial-corpus.test.ts` DELIM-01 fails at base. Proving that took a full ablation: extract four base blobs, overwrite, run, restore, verify four md5s. | 1 extra 8s suite run + 6 file ops |
| **A failure oracle that matched a test's NAME** | My own log summariser printed 40 "failures" for a 1-failure run, because `runtime-policy.test.ts`'s describe block is literally named `T9 × F33 …`. | one confusing read, no rework |
| **Brief/packet divergence** | The brief names `acceptance/fake-claude-cli.mjs` (wrong directory), omits the third and fourth members, and gates on `runtime-policy.test.ts`, which is not a consumer of any fixture. The packet had corrected all of it; I ran both command sets to be sure. | 1 extra suite run |

**The single biggest lever is the first row.** Three seats before me (W4 at `:1239`, CONT-T14 at
`:5257`) rediscovered that `pnpm run typecheck` cannot see `acceptance/`; I was handed that as a named
fact and it cost me nothing. **The same treatment applied to assertion→key provenance would have cost
this ticket a fraction of what it cost.** See §6.

## 3. What I nearly got wrong

1. **I nearly narrowed the allow-lists to the PRESENT-asserted keys only.** That is the reading a
   careful engineer reaches from "echo only the variables the tests actually assert on" — and it
   would have silently voided eight absence assertions (`claude-relay.test.ts:241-243`,
   `grok-relay.test.ts:212-217`, `hermes-relay.test.ts:67,71,72`). Every one would still have been
   *green*, because a key the fixture can no longer emit is trivially undefined. **A security fix
   that turns eight negative assertions into tautologies is worse than the leak**, because the leak
   is known and the tautology is not. The packet named this trap explicitly and that is the single
   most valuable sentence in it.
2. **I nearly wrote the fourth member's canary against a re-typed copy of the inline script.** It is
   not importable, so copying is the obvious move — and it would have tested my copy forever after
   (`:2051`). Reading the region out of the test's own source and running it is barely harder, and
   the M1 mutant proved the harness actually reaches the product's script.
3. **I nearly shipped a probe that could pass vacuously.** If the source extractor returns nothing,
   the script is empty, the output is empty, and "no canary in the output" is *true*. The positive
   control — an admitted key must come back with its exact value, in the same assertion pair — is
   what makes that impossible. I added it deliberately; I did not think of it first.
4. **I nearly reported the class as four members** because the packet said four and the packet had
   already been right twice (the ticket said two). It is six. The sweep, not the authority, settled it.

## 4. Dead ends — do not re-derive these

- **`pnpm run typecheck` says nothing about this ticket.** Measured 0 diagnostics at base *and* at
  tip, with the entire diff under `acceptance/`. Only `pnpm exec tsc -p acceptance/tsconfig.json
  --noEmit` can speak. Third recorded instance (`:1239`, `:5257`).
- **`new Function` / `eval` is not needed to extract the inline fixture.** Its literals are
  double-quoted TS strings, hence already valid JSON: regex + `JSON.parse` per literal.
- **Restoring a mutant with `git checkout --` would have destroyed uncommitted work** in the same
  file — all four members were dirty simultaneously. Backup-copy + `md5 -q` + `git status --porcelain`
  after every restore, per `:4854` and `:4982`. Used six times, zero incidents.
- **`numTotalTestSuites` is still not the file count.** Measured on this ticket's own five-file gate:
  `numTotalTestSuites` 15, `testResults.length` 5. Confirms `:4972` a second time on a different run.

## 5. Findings I did not fix (out of contract)

- `acceptance/model-shim.test.ts:102` — **fifth member of the class, same severity.** An inline probe
  script serialising `process.env` into the shim's model content, with absence assertions at
  `:148-152` that will decay exactly as described in §3.1 when it is fixed. Outside my write surface.
- `acceptance/relay-core.test.ts:303` — **sixth member, lower severity.** Writes
  `{argv, environment: process.env}` to a file under `mkdtemp`, not to model content, so it does not
  reach `ledger.raw_artifact`. Still the same shape and still a real-key sink on disk.
- **The exact-set assertions lost reach** (`claude-relay.test.ts:227-240`, `grok-relay.test.ts:201-211`,
  `adversarial-corpus.test.ts:429-438`): they can now only catch a wrongly-admitted key that the
  fixture *names*. Proposed remedy, deliberately not taken here because it is a new emission with its
  own reader duty: echo the full key-NAME list beside the projected values. Names are not credentials.
- **Residual leak the allow-list cannot remove:** `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`
  *must* stay in the claude fixture's list, because `claude-relay.test.ts:230-231` asserts their exact
  values. Any suite that runs that fixture without overriding them — the F26 parity test at
  `:471-497` does not — still echoes the operator's real value. This is precisely the half V's key
  rotation owns, and it is now the *only* remaining path rather than the whole environment.
- **Pre-existing red, dated at base by ablation:** `adversarial-corpus.test.ts` DELIM-01 — the review
  packet omits the `author_maker` field the test pins (`:288-301`). Identical failure and identical
  counts at `f0f9eeb2` with all four members reverted. Not mine; not ticketed to me.

## 6. Upgrades — how this becomes a one-prompt machine

Ordered by leverage per unit of effort.

1. **Ship a `WHO-JUSTIFIES-THIS-KEY` table, not just `WHO-READS-THIS-STRING`.** The reader sweep tells
   me *who breaks*; it does not tell me *which assertion earns a key its place*. That mapping is the
   entire content of this ticket and it existed nowhere — I rebuilt it from five suites. Any double
   that projects a collection (env keys, header names, column lists, mark vocabularies) should carry
   the citation inline, next to the key, the way the four fixtures now do. Then the next seat's work
   is a diff, not an excavation.
2. **Make "a remedy that narrows an emission must sweep the negative assertions" a standing law.**
   §3.1 is not specific to environments: it fires for any change that shrinks what a double can emit.
   Today it depends on a packet author remembering to warn. It should be a checklist line next to
   `heartbeat-worker` §2's refutation duty, because it is the same failure — an assertion that pins
   nothing, arrived at from the opposite direction.
3. **Give every seat the class sweep as a COMMAND, and make the packet's member count a prediction it
   must verify.** My packet said "a fifth is a finding", which is exactly right and is why I found two.
   Generalise it: every packet that names a class states the sweep command and the expected count, and
   the seat reports `measured N, packet said M`. Cheap, mechanical, and it catches the ticket→packet
   drift that happened twice on this very ticket (2 → 4 → 6).
4. **Standardise the run-logger.** Every seat writes its own, and mine had a real oracle bug within
   ten minutes (§2, row 4). One `tools/` script that logs full output, prints `rc`, the `Tests`/`Test
   Files` lines and anchored failure names, and reads the file count from `testResults.length`, would
   retire four separate trap families (`:2462`, `:4370`, `:4843`, `:4972`, `:5243`) at once and stop
   each seat re-implementing the same four bugs.
5. **Put a base-verdict snapshot in the packet.** I spent a full ablation proving DELIM-01 is
   pre-existing. The orchestrator can measure the mission's baseline suite verdicts *once* and hand
   every seat the list of known reds with their dates. Every seat that touches `acceptance/` is
   currently paying for that measurement independently.
6. **Let a security ticket state the emission it is protecting, not just the file.** W6's ticket named
   two files; the class was six sites. A ticket phrased as *"no test double may serialise an
   unbounded key/value collection into model content"* would have been sweepable on day one and
   would still be sweepable tomorrow, whereas a file list rots the moment a fixture moves.

## 7. Where the packet was unclear or wrong

- **Correct and load-bearing:** the four member paths and lines; the `authEnvironmentKeys` citation at
  `relay-core.ts:69,81-84`; the absence-assertion warning (§3.1); the `acceptance/tsconfig.json`
  typecheck; `testResults.length`; "a fifth is a finding".
- **Wrong in the brief, already corrected by the packet:** `acceptance/fake-claude-cli.mjs` and
  `acceptance/fake-grok-cli.mjs` do not exist at those paths — both live under
  `acceptance/test-fixtures/`. The brief also lists only two members and gates Step 3 on
  `acceptance/runtime-policy.test.ts`, which reads no fixture (it exists; I ran it; 24/25 with the
  same pre-existing DELIM-01 red).
- **Under-specified, cost me a decision I had to justify alone:** the packet calls
  `dual-maker-proof.test.ts` one of "the five consumer suites whose ABSENCE assertions keep their keys
  inside the allow-list". It references `fake-claude-cli.mjs` at `:21` but contains **no** assertion on
  `environment` at all — `grep -n 'environment' acceptance/dual-maker-proof.test.ts` is empty. It is a
  consumer of the fixture, not a reader of the echo, and it contributed no key to any allow-list.
- **Path ambiguity:** `INSTRUCTIONS.md` distinguishes `agent-reports/<seat>.md` (report, marker on
  line 1) from `agent-reports/<seat>-self.md` (self-report). My packet names the first path as the
  self-report and grants no second path. I wrote the self-report there, with a marker on line 1, to
  satisfy both readings.

## 8. Verification, in one place

RED at base: 4 failed (4), all four members, `AssertionError: expected 'canary-9c1e' to be undefined`.
GREEN at tip `8913b9a4`: 4 passed (4), three runs, worst run 4/4.
Mutants: 4 kills (whole-environment restored, one per member, each killing exactly its own case) ·
1 kill (claude allow-list widened by the canary key) · 1 correct non-kill (claude allow-list widened
by a key absent from the probe environment — 4 passed).
Neighbours at tip: `Test Files 1 failed | 4 passed (5)`, `Tests 1 failed | 57 passed (58)`,
`testResults.length` 5. The single failure is DELIM-01, dated pre-existing at `f0f9eeb2` by ablation.
Typecheck: root 0 at base and at tip (and blind to the diff); `acceptance/tsconfig.json` 0 at base and
at tip. Full frames and the per-key justification table are in the SDD report,
`.superpowers/sdd/2026-09-16-algorithm-live-loop-continuation/task-16-report.md`.

**No credential value was read, echoed or reproduced at any point. Every secret-shaped string in this
report and in every frame I pasted is the canary `canary-9c1e`, which I created. The child
environments in the new test are constructed literally, not inherited, so no ambient value could
enter a failure frame.**

---

# Fix round 1 — the same murder, two rooms further in

commits `d6817a8c` (F1/F2) · `f9860eee` (F3) · `6417171a` (F4) · `fd83b25b` (T11 collateral)
base for this round `52e2cbf2` · gate 8 files, 87/87, three runs

## 1. What the first round got wrong, stated plainly

**I closed two-thirds of a class and called the remaining third a finding.** That was inside my
contract and it was the correct move for the contract I had — but it is worth being precise about
what it cost: the orchestrator had to spend a review round handing back scope I had already
identified, described and priced. F1 and F2 were in my own §5 with file:line. The remedy was
obvious. The only thing standing between the finding and the fix was a write surface.

**More seriously: I filed F3 and F4 as "concerns" when they were defects.** F3 said the exact-set
assertions had lost reach — I even proposed the remedy (emit the key names) and declined to build it
because it was a new emission outside my surface. F4 said the residual credential echo was
"precisely the half V's key rotation owns". Both framings are technically true and both are wrong in
the way that matters: **a security fix that leaves the original leak reachable is not finished, and a
fix that converts eight live assertions into a narrower instrument has a debt to pay before it ships,
not after.** The coordinator adopted both of my own proposals as outcomes. I had the answers and
filed them as someone else's problem.

The thing to learn is not "be braver about scope". It is: **when the remedy you are declining is one
you can already describe in a sentence, that is a signal the packet is under-scoped, and the honest
move is to say so in the handoff as a packet defect** — which I did not do. I listed them as
findings under my own work, which reads as "known limitation" rather than "this ticket is not done".

## 2. What this round cost, priced

| Cost | Cause | Price |
|---|---|---|
| **Re-measuring citations four times** | Every insert shifts every line number below it, and I write `file:line` citations into comments as documentation. Four edit passes over eight files meant four rounds of re-grep-and-correct. | ~6 measurement greps + 4 correction passes — the single largest overhead of the round |
| **An unanchored `perl` pattern** | Patching two indent depths with two patterns; the 6-space pattern matched the tail of the 8-space line it had just patched, duplicating a field inside one type literal. Caught by reading the grep output, not by a gate. | one debug cycle, no rework |
| **`grep -c` returning 0 killed my verification chain** | `:2150`, firing on the SUCCESS condition — the mode-change count was 0, which is what was required, and the `&&` chain died exactly because the answer was good. | one re-run |
| **A weak first RED** | `toContain(undefined)` described the matcher, not the missing emission. Re-ran RED with a labelled assertion. | one extra RED run, and it was worth it |
| **Reader discovery by running, not by reading** | For F4 I did not enumerate the five value-pinning assertions by hand; I changed the producer and let the suites name them. | ~10 s of suite time, and it was the CHEAPEST step of the round |

That last row is the one to generalise. See §4.

## 3. What I nearly got wrong this round

1. **I nearly pinned an exact key-name set in `hermes-relay.test.ts` and `relay-core.test.ts`.** Both
   suites inherit `HOME`/`PATH`/`TMPDIR`/`LANG` from the operator's shell — the trap the DB-01
   comment in `adversarial-corpus.test.ts` already records from the other direction. An exact set
   there passes on my shell and fails on a colleague's. Refusing the COMPLEMENT is host-independent
   and still catches a leak. Two of six assertions had to be a different shape than the other four,
   and noticing that was the difference between a gate and a flake.
2. **I nearly digested `HERMES_HOME`.** An early draft of the credential pattern used substring
   matching. `HERMES_HOME` contains no credential word, but a sloppier list (`HOME` → no, but
   `AUTH` as a substring catches `SSH_AUTH_SOCK` either way) makes it easy to drift into matching
   paths. `hermes-relay.test.ts` `lstat`s that value — digesting it would have turned a real
   filesystem assertion into a comparison of two hashes that both exist. Segment-anchoring is not a
   style choice; it is what keeps paths readable.
3. **I nearly let the relay-core member carry the credential rule silently as dead code.** It has no
   credential-shaped key today, so the rule never fires. Writing "F4 is vacuous here and that is a
   measurement, not an omission" into the test is what stops the next reader deleting it as unused.

## 4. Upgrades — sharper than round 0's, because this round tested them

1. **Let the SUITES enumerate the readers.** Round 0's `WHO-READS-THIS-STRING` is a grep, and it is
   good at names. It is bad at semantics: it cannot tell "reads the field" from "pins the field's
   value". For F4 I changed the producer first and read the five failures. That found the exact
   five, with zero false positives, in ten seconds — and it is the only method that cannot miss one.
   **Proposal: for any change to what a double EMITS, the reader sweep is "mutate the producer, run
   the widest suite, list the failures", and the grep is the cross-check, not the primary.** It would
   have caught the Task 11 collateral (§5) at the time, because that suite fails the moment the field
   is removed — nobody ran it.
2. **Citations in comments need a line-free form.** I wrote ~20 `file:line` citations this round and
   re-measured them four times. Every one of them is a measurement with an expiry (`:5045`). A
   citation by TEST NAME or by a stable anchor string (`— see the SECRET-01 exact-set assertion`)
   costs nothing to maintain and never rots. **Proposal: cite by name; use a line number only when
   nothing nameable exists.** I would have saved the largest single cost of this round.
3. **Ship the run-logger as a tool.** I fixed my own `×`-oracle bug from round 0 in this round's copy
   of the script — and then hit `:2150` in a hand-written chain ten minutes later. Both are solved
   problems with recorded traps; both cost me time anyway, because every seat writes this scaffolding
   fresh. One `tools/gate.sh` retires five trap families permanently.
4. **A fix round should get the finding's OWNER, not just its text.** This round's brief was
   excellent in one specific way: it converted each of my findings into an OUTCOME and left the
   mechanism to me. That is the right contract and it is why the round was fast. The thing that would
   make it faster still is the previous round handing over the write surface the finding implies —
   F1/F2 needed two files I had named, at lines I had named.

## 5. The Task 11 collateral — the part that should worry someone

DELIM-01 was red since `abb6b21b` (W7 / V-BLIND-CONTEXT), not since this mission's base. I reported
it as "pre-existing at `f0f9eeb2`", which was literally true — I measured it by ablation — and which
**hid the real fact**: a mission commit broke a suite and nobody noticed for five days.

Why nobody noticed: Task 11's reader sweep found the tests that call the Judge directly.
`adversarial-corpus.test.ts` reads the same review packet through a CLI fixture and a local HTTP
relay, so a grep over Judge call sites cannot see it. **The field `author_maker` appears in that
file, and a grep for the literal WOULD have found it** — the sweep was scoped to callers, not to the
string. That is the same generating condition as W6 itself: a class scoped by the wrong axis.

And the honest self-criticism: I had the evidence in hand. I ran the ablation, saw an identical red
at base, and stopped — because "pre-existing" discharged my duty. The question I did not ask is
*when did this start*, which is one `git log -S` away and would have named `abb6b21b` in seconds.
**"Not mine" is a much weaker claim than "here is whose it is", and it costs about a minute to
upgrade.**

## 6. Where this round's brief was exactly right, and where it was not

- **Right, and worth copying:** every finding restated as an OUTCOME with the mechanism left to me;
  the contract additions naming the files rather than the edits; "if a suggested step proves
  impossible, reach the outcome another way and report it" — which I needed, see below; the explicit
  verification ORDER, which caught that both typechecks are 0 before any edit and so the post-edit 0
  means something.
- **One suggested step was impossible as written.** The brief says to extend the canary suite with
  a case per new member, "the relay-core one reads its file back, so the probe asserts on the file's
  content". Reading the file back is exactly right and that is what the case does. But reaching the
  file requires RUNNING that member's script, and that script is a TEMPLATE LITERAL with a path
  interpolated into it — the double-quote regex Task 16 used cannot read it, and neither can any
  quote-aware regex. Outcome reached another way: the extractor now evaluates the array region with
  its free identifiers bound, which handles all three inline shapes uniformly. Recorded in
  TOOLING-TRAPS.
- **One number in the brief needed re-measuring, not correcting:** the F3 assertion sites are given
  as `claude-relay.test.ts:227-240`, `grok-relay.test.ts:201-211`,
  `adversarial-corpus.test.ts:429-438`. All three were correct at `52e2cbf2` and all three moved as
  soon as I edited above them. That is not a defect in the brief; it is the citation-rot problem in
  §4.2, arriving from the other side.

## 7. Verification

RED frames, all four findings, each measured before its fix:
  F1/F2 — `Tests 2 failed | 4 passed (6)`, the two new members, `expected 'canary-9c1e' to be undefined`
  F3    — `Tests 6 failed (6)`, every member, `member must emit environmentKeyNames (F3): expected undefined to be an instance of Array`
  F4    — `Tests 5 failed | 1 passed (6)`, `<KEY> must be emitted as a digest, never its value (F4): expected 'canary-c8e1' to be 'sha256:17be29202c5ecfde'`; the one pass is relay-core, where the rule is vacuous
  T11   — `AssertionError: expected { …(2) } to deeply equal { …(2) }`, the `author_maker` field
Mutants: 3 of 3 killed, two of them at BOTH layers (canary suite and the restored consumer reach).
Gate: three runs, `testResults.length` 8, 87 passed / 0 failed each time. Worst run 87/87.
Typechecks: root 0 and `acceptance/tsconfig.json` 0, before any edit and after the last commit.
Class sweep: `grep -rn 'environment: process.env' acceptance` → zero hits. The class is CLOSED.
`git diff --summary 52e2cbf2..HEAD | grep -c "mode change"` → 0. Tree clean.

**No credential value was read, echoed or reproduced. The three canaries — `canary-9c1e`,
`canary-b7d3`, `canary-c8e1` — are strings I minted, and they are the only secret-shaped strings in
this report or in any frame I pasted. Every child environment in the canary suite is built
literally, so no ambient value can enter a failure frame.**
