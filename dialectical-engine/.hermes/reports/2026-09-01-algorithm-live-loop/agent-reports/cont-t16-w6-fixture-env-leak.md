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
