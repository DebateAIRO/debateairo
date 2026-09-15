# WORKER PACKET — lane/sealedrows · two sealed-row loose ends

You are a WORKER seat. Load `heartbeat-protocol` (router), then `heartbeat-worker`, then
`superpowers:using-superpowers`. Your floor: `test-driven-development`,
`verification-before-completion`, `systematic-debugging`, `receiving-code-review` on rework.

**Working directory (verified to exist):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-sealedrows/dialectical-engine`

Branch `lane/sealedrows`, base tip `7dda3cc0d3305c96e62dadb77f1eb941165d633a`. Provisioned
(`pnpm install --frozen-lockfile`, `pnpm run generate:contract`), porcelain clean at handover.

**rework rounds: max 3.** After round 3 it goes to a V DECISIONS PACKET row; round 4 does not exist.

## Two tickets, in this order

### A · F-S11-6 — the acceptance seeder is missing a row the preflight now requires (DO THIS FIRST)

`acceptance/runtime-policy.ts:206` calls `readEnvelopeFormulaInputs(pool,
ACCEPTANCE_REGISTER_VERSION)`. `ACCEPTANCE_REGISTER_VERSION` is `2`
(`acceptance/seed-register.ts:17`). The string `envelopeFormulaInputs` appears **zero times** in
`acceptance/seed-register.ts` — I counted it, do not take my word for it, count it again.

The row became required when T17B landed, and no gate caught it: typecheck proves the call
compiles, the cluster proves the code behaves, and neither can see that the function now demands
a row the environment must supply. `register.assert_required_rows`
(`migrations/0050_t16_algorithm_register_rows.sql:58`) RETURNS EARLY for a register version not
declared in `register.required_row_version`, so seeding passes and the failure lands at preflight
instead.

**OUTCOME REQUIRED:** the first V-approved acceptance run must not stop on a preflight refusal
for a missing `envelopeFormulaInputs` row. You choose the mechanism (D58). The dev register's
value is at `packages/register/src/algorithm-policy.ts:240-259` — read it there rather than
copying it from this packet.

**RED first.** A test that fails before your change because the row is absent, and passes after.
Verify by DELETING the row and watching the test go red — a test that passes both ways is not
evidence.

Consider, and state your conclusion either way: whether the general defect is worth closing —
*a shared reader gaining a dependency is invisible to every gate a lane runs*. If a mechanical
check can compare what the acceptance readers demand against what the acceptance seeder supplies,
say so and build it. If it cannot, say why. Do not build a check that only restates the one row.

### B · F-T9B-3 — a floored band names a trigger that did not fire

`deriveBandCeiling` (`packages/serve/src/index.ts:287`) handles `total === 0` — the empty basis
that follows a failed citation-tracing criterion — by taking the floor band from `bandOrder[0]`
and then selecting the row entry whose `ceilingBand` equals that floor.

On the shipped row (`acceptance/seed-register.ts:220-232` and the dev twin) the floor is
`CAPPED`, and the only entry naming `CAPPED` is `REASONING_CEILING`, whose trigger is
`minimumShares: { REASONING: 0.5 }`. That trigger cannot have fired: the basis is EMPTY, so no
share of anything reached 0.5. The record therefore states a cause that did not occur.

Every entry in the row carries ONE label serving as both trigger and outcome, so no selection
over the existing entries can fix this. The mission's slice map makes **S01/T16 the sole owner of
every new sealed row and schema**; this lane holds that authority for this ticket.

**OUTCOME REQUIRED:** a floored band states its own reason, with a trigger that actually fired,
and an undescribed floor still FAILS CLOSED (the existing `BAND_CEILING_FLOOR_UNDESCRIBED` must
keep firing when the row describes no floor). Both seeders — dev and acceptance — carry the new
entry, and the two register schemas admit it. You choose the mechanism.

**Do not weaken what already ships.** The current code is correct as far as it goes: band and
label are both row-derived and validated, row membership is enforced on this route, and the lift
path is truthful. Your change extends it; it does not relax it.

**MEASURED FACT you may rely on, and must re-verify:** the acceptance harness never fails citation
tracing, so production does not reach this route today. That is what makes this safe to do without
a live run. If your own measurement disagrees, STOP and say so.

## Contract

```yaml
allowed:
  - dialectical-engine/acceptance/seed-register.ts
  - dialectical-engine/acceptance/seed-register.test.ts
  - dialectical-engine/acceptance/runtime-policy.ts
  - dialectical-engine/acceptance/runtime-policy.test.ts
  - dialectical-engine/packages/register/src/algorithm-policy.ts
  - dialectical-engine/packages/register/src/engine-shape.ts
  - dialectical-engine/packages/serve/src/index.ts
  - dialectical-engine/tests/unit/**
  - dialectical-engine/tests/integration/t16-algorithm-register.test.ts
  - dialectical-engine/migrations/**            # new migration only; never edit a landed one
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/sealedrows/**
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows.md
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows-self.md
forbidden: all_others
```

You do NOT edit the board or any DECISIONS file — the orchestrator mirrors. You do not merge,
push, or mark yourself Done. Never mint, read, or pass a credential VALUE: if only a credential
can unblock you, mark BLOCKED `waiting_human` and stop.

## Evidence

Every gate run through `tools/gate-run.sh` (mission tools directory, absolute path
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/gate-run.sh`).
It stamps commit and tree, the provisioning block, porcelain before and after, raw output and
exit. A log without that header is not admissible.

Report suites as `passed/total`, name every failure, and say whether it predates you. Never claim
that nothing is caused by your diff.

## Output skeleton — exact headings

```
# SEALEDROWS — <round>
## What changed
## F-S11-6 · VERDICT / CONFIDENCE / STRONGEST COUNTER
## F-T9B-3 · VERDICT / CONFIDENCE / STRONGEST COUNTER
## RED evidence
## GREEN evidence
## Suites
## Not verified
## PREDICTIONS
```

Then file `agent-reports/sealedrows-self.md` BEFORE you claim FULLY DONE. A case file, not a
diary: name the CAUSE, price each finding in wall-clock and rounds, say what you NEARLY got
wrong, name dead ends, and say exactly where this packet was unclear.

Markers: `CLAIM` · `HEARTBEAT` · `BLOCKED` · `READY FOR PEER REVIEW` · `FULLY DONE`, each with its
`comments read through` cursor. Return control at a handoff or a genuine blocker.

---

# AMENDMENT 1 — 2026-09-04 · both blockers cleared, contract widened

Your round-1 report is ACCEPTED in full. You were BLOCKED, not reworked: **rework rounds spent
stays 0 of 3.** Both blockers were mine or V's, not yours.

- **PD-SEALEDROWS-1 is confirmed as an ORCHESTRATOR PACKET DEFECT.** You were right that F-T9B-3
  cannot be done inside the contract I gave you, and right to refuse the optional-fallback
  variant that would have fit it — buying compliance by leaving the untruthful record alive in
  dev is the defect, not a fix for it. The two files are added below.
- **PD-SEALEDROWS-2 accepted.** F-S11-6's premise was mine and it was wrong: I inferred "not
  supplied" from a zero string count without following the spread at `seed-register.ts:324`. The
  ticket is closed on your refutation. Your measurement stands as the record.
- **Your F-SEALEDROWS-A finding is confirmed independently** by the orchestrator running the
  extractor's own regex (0 matches, requires 2), and by D15 batch **b12** at tip `7dda3cc0`:
  `48 failed | 2152 passed | 3 skipped (2203)`, against b11's 23 at a tip three merges older.
  0 vanished, 25 new, of which 20 are yours. Two whole suites failed to LOAD.
- **Your prediction 2 was right and V has now ruled on it.**

## V RULING 2026-09-04 — what the conformance fingerprint covers

> **The conformance contract hash covers the EVALUATOR prompt alone.**

V's stated reason, in V's terms: the writer's prompt already carries its own separate fingerprint
(`composerContractHash`), so the checker's slot fingerprints the checker's prompt and nothing
else. One slot, one prompt, one fingerprint — and if either wording moves later, exactly one
fingerprint moves, so the record still says WHICH one changed. V explicitly declined both the
combined-hash option (it would count the writer's prompt twice) and retiring the slot (it would
make a silent edit to the reviewer's instructions indistinguishable from one to the writer's).

This settles the PRODUCT question only. **The mechanism is still yours (D58)** — how you match
the prompt, how you keep the match from silently returning zero again, and what the test pins.

## Order of work — A first, it gates the other two

### 1 · F-SEALEDROWS-A (new, blocking, high risk)

`acceptance/seed-register.ts:120-123` and `apps/runner/src/dev-deployment-register.ts:199-202`
carry the identical dead extractor.

**OUTCOME REQUIRED:** both deployment seeders build. The conformance fingerprint is computed from
the evaluator prompt per V's ruling above. **And a zero-match must never again pass as anything
but a loud failure** — the current code already throws on a wrong count, and it did throw; what
it could not do is prevent the count from silently going stale in the first place. If a
mechanical guard can tie the extractor to the prompt it claims to describe, build it; if it
cannot, say why.

All three copies change together — the two seeders and `acceptance/seed-register.test.ts`.
Repairing one deployment while the other stays dead is not a fix.

**RED first**, and the RED is already sitting in the tree: `buildAcceptanceRegisterRows()` and
`buildDevelopmentRunnerRegisterRows()` throw today. Capture both before you touch anything.

### 2 · F-T9B-3 (unchanged, now executable)

Your mechanism as filed in `agent-reports/sealedrows.md` — the new sealed `emptyBasisFloor`
member whose trigger is the empty basis itself, with `BAND_CEILING_FLOOR_UNDESCRIBED` still
firing on an undescribed floor. Both seeders, both schemas.

**Your correction to my "measured fact" is accepted and is the better reading:** `citationTracing`
is parsed from a live provider response, so the harness cannot force it true, and the route is
unexercised because no acceptance run has completed — which makes this more urgent once the
mission succeeds, not less. Carry that sentence into the report.

### 3 · F-SEALEDROWS-B (new, non-blocking, do it last)

Test fakes still answering the retired `{conforms,findings}` protocol. A fake answering a question
nobody asks makes its test green for a reason unrelated to what it claims. Ticket
`board/F-SEALEDROWS-B-retired-protocol-fakes.md` carries an orchestrator sweep of seven candidate
files — **it is a sweep, not a finding list.** Narrow it yourself; some are legitimate historical
fixtures and I have not separated them.

## Contract — ADDED (everything from the original packet still stands)

```yaml
allowed_additional:
  - dialectical-engine/apps/runner/src/dev-deployment-register.ts    # PD-SEALEDROWS-1: the gap you named
  - dialectical-engine/apps/runner/src/dev-runner-policy.ts          # PD-SEALEDROWS-1: the .strict() schema
  - dialectical-engine/tests/integration/dev-deployment-register.test.ts
  - dialectical-engine/tests/integration/t17-envelope-ledger.test.ts # READ ONLY — see below
  - dialectical-engine/acceptance/ceremony.test.ts
  - dialectical-engine/acceptance/mono-panel.test.ts
  - dialectical-engine/acceptance/panel-multi-maker.test.ts
  - dialectical-engine/acceptance/dual-maker-proof.test.ts
```

## NOT yours — do not fix these, and do not let them confuse your measurement

Two b12 failures in `tests/integration/t17-envelope-ledger.test.ts` fail with T9's OWN refusal —
`the synthesizer and evaluator role refs and the evaluator loop bound are sealed T16 register
rows (J8)` — and cite no `CONTRACT_TEXT_UNRESOLVED`. They are a separate cross-lane collision,
ticketed `F-T17-T9`, and **your fix will not turn them green.** Read them if useful; leave them
red and say so. Two more J7 warning-count failures in `t16-algorithm-register.test.ts` have no
established cause — if your work explains them, say so; if it does not, leave them named and
unattributed rather than absorbed.

`S3d rework4` timed out at 180000ms and belongs to the known-unstable family. Not evidence of
anything you did.

## Your TRAP is recorded

`stamp-check.sh` takes a PREFIX, not a glob; an expanded glob silently compares the first file
alone and prints `records compared: 1 · failures: 0`, which reads as a pass. Written into
`.hermes/TOOLING-TRAPS.md` with your reproduction, and noted as the plausible route by which the
T6 r4 provenance gap (F-T6B-1) went unnoticed. **Read `records compared: N` against the number of
records you expected, every time — including your own.**

## Evidence bar for this round

Same as the original packet, plus: after F-SEALEDROWS-A lands, run the two acceptance suites that
FAILED TO LOAD in b12 (`acceptance/mono-panel.test.ts`, `acceptance/panel-multi-maker.test.ts`)
and report them by name. A suite that could not load is not a passing suite, and the b12 count of
48 understates the damage by however many tests those two files contain.

Do NOT run the full D15 batch — that is the orchestrator's, on the integration worktree, after
your lane lands.

---

# AMENDMENT 2 — 2026-09-04 · codex r1 verdict CHANGES · this is REWORK ROUND 1 of 3

Verdict file: `agent-reports/sealedrows-codex-r1.md`. Read it in full before you touch anything,
then load `superpowers:receiving-code-review`.

**2 blocking product findings · 1 evidence finding · 3 packet defects, all three of which are
MINE and are admitted below.** Rework round 1 of 3. Your round-2 work was accepted on its merits;
these are defects in it, not a rejection of it.

## B1 · Your locator can fingerprint the WRONG prompt — the reviewer demonstrated it

`acceptance/seed-register.ts:135-152,169` and `apps/runner/src/dev-deployment-register.ts:213-230,247`.

Both use an **unanchored** `runnerSource.match(...)`, so the FIRST object carrying a `criteria`
member wins. Codex drove a synthetic source with an unrelated `criteria: z.object({ alpha:
z.boolean() })` and a prompt naming `alpha` placed BEFORE the real evaluator schema. The extractor
returned `Unrelated system prompt naming alpha.` **and exited 0.**

So the conformance slot can hash a non-evaluator prompt while looking healthy — which breaches V's
evaluator-only ruling silently. This is the same shape as the defect you fixed: a locator that can
succeed on the wrong thing is worse than one that fails loudly, and I told V your fix worked
before this was found.

**OUTCOME REQUIRED:** the extractor resolves to the evaluator's verdict schema specifically, and
an earlier unrelated `criteria` schema cannot win. Keep every refusal you already built —
zero-match, duplicate, parser-prompt drift. Add the adversarial case codex describes; a test that
does not place a decoy BEFORE the real one does not test this.

Mechanism is yours (D58). Codex suggests syntax-aware extraction or a uniquely bounded evaluator
declaration; you are not bound to either.

## B2 · `emptyBasisFloor` optional is the same defect class a THIRD time — make it required

`packages/serve/src/index.ts:281-289`, `acceptance/runtime-policy.ts:70-75`,
`apps/runner/src/dev-runner-policy.ts:73-80`.

Codex probed it directly: delete `wayOfKnowingCeiling.emptyBasisFloor` from real acceptance rows,
call `parseAcceptanceRuntimeRows`, and it returns **`acceptance-parser-accepts-missing-floor
true`**. A strict schema admits an incomplete sealed row and defers the refusal until an empty
basis happens to occur.

I asked this in AMENDMENT 1's question 5 and codex answered it plainly: **not the right call.**
Its reason is the one that settles it — *a read-only legacy fixture is not a product semantic and
cannot make a required sealed member optional.* The fixture constraint you cited is real; it is
an argument for versioning or adapting that historical read boundary, not for weakening the
active schema.

This mission has now produced this same shape three times: F-S11-6's shared reader, F-T17-T9's
`synthesisRolePolicy`, and this. **Optional-on-a-shared-settings-object is how every one of them
hid from the compiler.**

**OUTCOME REQUIRED:** the member is REQUIRED in `BandCeilingRegisterRow` and in both strict
deployment schemas; current fixtures carry a truthful entry; the historical read boundary is
versioned or adapted rather than the active schema relaxed. `BAND_CEILING_FLOOR_UNDESCRIBED` must
still be exercised — codex's suggestion is to construct an intentionally invalid row through
`unknown` or a test cast, which keeps the defensive unit alive without a permissive schema.

## E1 · Your mutation campaign has no admissible transcript

`agent-reports/sealedrows.md:162-183` against D24/D42. `logs/sealedrows/` holds your gate logs and
four probes and **no mutant transcript** — no applied mutation, no pre/applied/restored token
counts, no before/after hash, no failing assertion, no restore record.

Your m3 story is the most valuable thing in your round-2 report, and right now it is testimony.
D24/D42 make a hand-written outcome table testimony-grade by construction.

**Note what is NOT being asked.** Codex independently confirmed your replacement predicate is
statically sound: relabelling the development entry `REASONING_CEILING` necessarily fails
`f-t9b-3-empty-basis-floor.test.ts:150`, and the same predicate applies to both deployments. The
repair is to the campaign's PROVENANCE, not to the predicate. Do not weaken or replace it.

**OUTCOME REQUIRED:** re-run the claimed discriminating mutants through `tools/mutate.sh` from a
clean checkout and retain the generated transcripts — including m3's exact property assertion and
m5's evaluator-only assertion. Read `records compared: N` against the number you expected.

## MY packet defects — all three admitted, none of them yours

**P1 · My reviewer packet's diff constant was FALSE.** I wrote `221 insertions`; git reports
**527**. The missing 306 are your two added test files (105 + 201), uncounted because they were
untracked when the statistic was taken. I copied your number into a constant my own contract
says is "re-read from its source at packet-write time" — and did not re-read it. Corrected on the
record.

**P2 · My claim that I committed your work "without altering a byte" is not provable.** I captured
no precommit manifest covering tracked and untracked files. The nine-path set and the clean
porcelain are verifiable; byte identity is not. I should have stated only what I could show.

**P3 · I dispatched F-SEALEDROWS-B without the authority to finish it.** Of the four real
occurrences you narrowed to, two are outside your contract: `tests/integration/database.test.ts`
is not granted and `tests/integration/t17-envelope-ledger.test.ts` is read-only. You could not
have closed the class whatever you did — **your decision to narrow and file rather than write was
correct, and it was correct for a second reason I had not given you.** The ticket is re-scoped to
narrow-and-file, which you have already completed. Do NOT return to it this round.

## This round's scope

B1, B2, E1. Nothing else. F-SEALEDROWS-B is closed as narrow-and-file. F-T17-T9 is not yours.

Re-run your cluster three times and report identical numbers or explain the variance. Report every
suite `passed/total` with each failure named and whether it predates you.

---

# AMENDMENT 3 — 2026-09-04 · codex r2 CHANGES · REWORK ROUND 2 of 3

Verdict: `agent-reports/sealedrows-codex-r2.md`. **2 blocking · 1 evidence · ZERO new packet
defects** — codex judged my admission of the previous four complete. Read it in full first.

**One round remains after this one.** So this amendment grants every file the outcomes need. I
have dispatched outcomes past the edge of a contract three times in this lane; I am not doing it
a fourth.

## B1a · The balancer counts CHARACTERS, not SYNTAX — and a COMMENTED anchor can win

Codex probed it directly, both deployments:

- A `}` inside a string, line comment, regex literal or template literal within the
  `evaluatorVerdictSchema` declaration is counted as the closing brace. Result: false refusal.
- **Worse.** Rename the real declaration and leave behind a commented example —
  `// const evaluatorVerdictSchema = z.object({ criteria: z.object({ alpha: z.boolean() }) ... })`
  — followed by an unrelated prompt naming `alpha`. **The anchor regex matches the COMMENT.** Both
  extractors returned `Unrelated system prompt naming alpha.` with exit 0.

So the rename-refusal you built, which I verified and reported upward as durable, is
**CONDITIONAL** — it holds only when no commented-out declaration exists. I tested the rename in
isolation and drew a general conclusion from a single case. That error is mine, not yours.

**This is the third form of one defect: a locator that can succeed on the wrong thing.** Quoting
the prompt's words failed loudly. Matching the first `criteria` failed quietly. Balancing braces
over raw text fails quietly again, because text is not syntax.

**OUTCOME REQUIRED:** the conformance fingerprint cannot resolve to a non-evaluator prompt, and
lexical text that is not executable syntax — comments, strings, regexes, template literals —
cannot influence which prompt is chosen. Every existing loud refusal survives.

Codex names two routes and the mechanism is yours (D58), but **I recommend the second and the
contract below is written for it:**

> **Move the evaluator prompt to a NAMED EXPORT in `apps/runner/src/index.ts` and fingerprint the
> exported VALUE.** Both seeders import it. There is then no search, no anchor, no balancer, and
> no text to be confused by — the thing hashed IS the thing sent. It also collapses
> F-SEALEDROWS-C: one definition instead of three copies kept honest by a test.

The prompt TEXT does not change, so the fingerprint VALUE does not change and **V's ruling is
preserved exactly** — evaluator prompt alone. This is mechanism, not product.

If you take the AST route instead, say why, and add every case codex names: string, comment,
regex, template literal, commented-anchor-plus-rename, and decoy-order, **over both extractors.**

## B1b · Your negative tests exercise only ONE of the two extractors

`tests/unit/f-sealedrows-a-conformance-extractor.test.ts:87-102,133-152`. Every refusal case calls
the acceptance extractor. The development twin is exercised only on the real source and the
successful decoy source, so removing a development refusal — zero-match, parser drift, duplicate
prompt, absent or ambiguous anchor, no boolean criteria — leaves the suite GREEN.

That fails AMENDMENT 2's explicit requirement that each refusal have a test which fails when the
refusal is removed, and it overstates F-SEALEDROWS-C's claim that divergence is pinned by test.

**OUTCOME REQUIRED:** every success and refusal case runs against BOTH extractors, and each
development refusal, removed on its own, turns the focused suite red. Note that the recommended
B1a route makes this mostly moot by deleting the duplicate implementation — which is the better
answer to a duplication problem than testing both copies harder.

## E1 · The index is a prose table with a script beside it — the S08 r4 B1 shape

Codex ran your stated generator over your stated prefix:

```
python3 tools/mutant-index.py .../logs/sealedrows/r3-mut-
  transcripts=9 killed=7 survived=1 invalid=1 · two problems · exit 1
```

Its emitted format does not resemble the filed index; no expected manifest exists in
`logs/sealedrows`; the tool admits only `KILLED|SURVIVED`; and the NOT-RUN transcript has no
`EXIT =` line, yet the filed table says every verdict came from one and prints
`expectation check: ALL AS REQUIRED`.

**What is NOT impeached:** the eight applied runs are genuine `mutate.sh` artifacts, 7 killed and
1 surviving neighbour, and codex confirms retaining the aborted attempt was right.

**OUTCOME REQUIRED:** the filed index is reproducible by running a retained generator over the
retained transcripts, with a durable expected manifest, exit 0. Do not hand-append the NOT-RUN row
or the expectation verdict. **Preferred:** extend `tools/mutant-index.py` with an explicit
non-crediting NOT-RUN class and regenerate — your finding is a real gap in the mission tool, since
a driver classifying on exit status is exactly what D46/D50 exist to prevent, and the tool has no
class for a mutation that never ran.

## Contract — ADDED, and this time it reaches the outcomes

```yaml
allowed_additional:
  - dialectical-engine/apps/runner/src/index.ts               # B1a's exported constant AND F-SEALEDROWS-D's settings field
  - dialectical-engine/tests/integration/database.test.ts     # broken by the required member
  - dialectical-engine/tests/integration/t17-envelope-ledger.test.ts   # NO LONGER READ-ONLY
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutant-index.py
```

`apps/runner/src/index.ts` is the LARGEST file in the repository and the most collision-prone.
Touch only the evaluator prompt constant and the band-ceiling settings field. Anything else in it
is out of scope even though it is now writable.

## Also close F-SEALEDROWS-D, since you now hold every file

Codex judged the current versioning **not sound**: `BandCeilingRegisterRow.value.emptyBasisFloor`
is still optional at `packages/serve/src/index.ts:283-302`, `deriveBandCeiling` still accepts that
type at :335, and the runner still publishes it at `apps/runner/src/index.ts:1141-1145`.
`SealedBandCeilingRegisterRow` is a structural subtype used by two readers, with no version
discriminator and no historical adapter — so the active base type can still describe an incomplete
row.

The demonstrated defect stays closed; this is the type-level tail. Three files close it and you
hold all three.

## Not in scope

F-SEALEDROWS-B (narrow-and-file, complete). F-T17-T9 (different ticket, different lane).

Three cluster runs, identical numbers or explain the variance. Every suite `passed/total`, every
failure named, and whether it predates you.

---

# AMENDMENT 4 — 2026-09-04 · codex r3 CHANGES · REWORK ROUND 3 of 3 — THE LAST ONE

Verdict: `agent-reports/sealedrows-codex-r3.md`. **2 blocking · 0 non-blocking · 0 new packet
defects.** Read it in full first.

**This is the final worker round.** Round 4 is not authorized: a further CHANGES verdict goes to a
V DECISIONS PACKET row. If any part of this cannot be done inside your contract, say so and STOP
rather than approximating — an honest BLOCKED costs V one decision, a quiet approximation costs
the mission its record.

## What codex CONFIRMED closed — do not touch these

- **The dataflow property holds.** `EVALUATOR_CONTRACT_TEXT` is the sole definition; both seeders
  digest it; the only evaluator call sends it as its sole system message; and codex traced
  `buildSchemaRepairPacket` to confirm the repair path appends a USER message and never replaces
  or adds a system one. No second evaluator literal or call site exists.
- **No re-seed.** 339 bytes, sha256 `2364b1b548c0e5a4…`, both seeder artifacts equal to it and
  different from the composer hash.
- **F-SEALEDROWS-D is closed.** Required on the sole `BandCeilingRegisterRow`, both strict schemas
  require it, three fixtures truthful, the alias ABSENT rather than renamed.
- **The deleted locator-only refusals were correctly deleted** — zero-match, duplicate, anchor.
  There is no extractor and no twin, so those really are moot. Do not restore them.

## B1 · Your class guard is a blacklist, and one deleted refusal still had a job

**The bypass, demonstrated.** Reintroduce a source locator as
`digest(requireMatch(runner, /EVALUATOR_CONTRACT_TEXT\s*=\s*"([^"]+)"/, "conformance"))`, leaving
the now-unused import in place. It searches the runner source and can be redirected by a commented
declaration exactly as before — **and all seven focused tests stay green**, because the guard bans
only four spellings (`criteria: z.object`, `balancedObjectBody`, `evaluatorVerdictSchema`, and one
escaped literal prefix) and the current source happens to yield the same bytes.

A deny-list of spellings is the same mistake as a text search, one level up: it enumerates the
forms it knows.

**The coverage loss, which matters more.** Add a required boolean criterion to
`evaluatorVerdictSchema` without editing `EVALUATOR_CONTRACT_TEXT`. The suite stays green. But
providers follow the SENT prompt, which never mentions the new criterion, so every response omits
a member the parser now requires — and the content-repair path exhausts on a prompt that can never
satisfy its own schema.

**You and I both called B1b "moot by construction". Codex agrees for the locator refusals and
refutes it for this one.** Deleting the locator made the parser/prompt-drift check unreachable in
its old form; it did not make the invariant it protected untrue. I accepted "moot by construction"
without asking WHICH invariants each deleted test carried. That review was mine to do.

**OUTCOME REQUIRED, two parts:**

1. A POSITIVE assertion — the conformance hash initializers digest the imported identifier, and
   the evaluator system-message initializer uses that same identifier. Positive, not a deny-list:
   it must state what the code MUST be, so an unforeseen wrong form fails by default instead of
   passing because nobody predicted its spelling. Codex prefers a TypeScript AST check; the
   compiler API is already a dependency. Mechanism is yours (D58).
2. An executable schema/prompt agreement check derived from the DECLARED criterion keys, so adding
   or renaming a criterion without editing the prompt turns the suite red.

Do NOT restore the duplicated locators or their locator-only cases.

## E1 · v3 blesses D24 failures that v2 correctly rejected — and it is a SHARED tool

`tools/mutant-index.py:88-112` against `tools/mutate.sh:14,27-32`.

Run `mutate.sh` from a dirty tree: line 14 writes only
`ABORT: tree dirty before mutation (D24 ADDENDUM-2)` — no commit or tree stamp, no pre gate, no
applied gate, no restore gate, no test exit. In v3, ANY `ABORT:` with no parsed `GATE applied`
takes the early branch at line 100. With a manifest entry of `NOT-RUN` it increments `not_run`,
**skips every custody and missing-exit check**, prints `invalid=0` and `CLEAN`, and exits 0. An
apply failure at line 30 has the same shape.

**v2 rejected both as malformed. So v3 did not only add the intended class — it weakened an
existing one**, in a tool every lane in this mission uses. Your diagnosis of the gap was right and
the class was worth adding; the admission criteria are too broad.

**Your own tallies are NOT impeached** and codex says so explicitly: the single r3 NOT-RUN
transcript carries a stamp, `GATE pre = 2`, the exact token-collision refusal and no applied gate;
all eight r4 transcripts applied; both indexes reproduce byte-for-byte from v3 with exit 0.

**OUTCOME REQUIRED:** `NOT-RUN` is admitted ONLY for the proved pre-gate collision shape — a normal
stamp, a positive `GATE pre`, no applied gate, and the specific "NEW token already present"
refusal. Dirty-tree, apply-failure, truncated, unstamped and every other gate-less abort stay
`INVALID`. Add fixtures for the valid collision AND for each invalid pre-apply abort before this
version is used mission-wide. Retain v2 as you already have.

## F-SEALEDROWS-E — MY premise was wrong, and codex corrected it

I wrote that the architecture gate "was already failing, so it cannot say whether the edge is
admissible." That is false in a way that matters: `auditArchitecture` reads workspace dependencies
from 28 `package.json` files (`tools/orphan-audit/src/index.ts:9-63`). **It never scans
`acceptance/` source imports at all**, so it could not have adjudicated this edge green OR red. My
"known-red gate stops being a gate" framing was a real hazard attached to the wrong instance.

Codex judges the edge SOUND: `acceptance/` already imports `@debateai/runner` in `main.ts` and
`dual-maker-proof.ts`, the seeder already read the runner source, no package edge or cycle is
added, and the evaluator prompt is runner-owned behaviour — moving it to `packages/register` would
invert ownership to hide a sound dependency.

**One non-blocking tidiness point, and it is your call whether to take it this round:** use the
`@debateai/runner` package export rather than the relative path. Codex calls it tidier and
explicitly non-blocking. If taking it risks the two required fixes, leave it and say so.

## Contract

Unchanged from AMENDMENT 3 — you hold every file these outcomes need. The runner index stays
limited to the constant and the band-ceiling settings field.

Three cluster runs, identical numbers or explain the variance. Every suite `passed/total`, every
failure named, whether it predates you. And say plainly, at the top, whether anything in this
amendment could not be completed — this is the last round and an unstated gap becomes V's problem
without V being told it exists.

---

# AMENDMENT 5 — 2026-09-04 · V-AUTHORIZED POST-CAP ROUND · ONE FINDING ONLY

**The rework cap stands at 3 of 3 and is not being raised.** V ruled on
`v-packets/V-SEALEDROWS-1-runner-send-unenforced.md` and authorized ONE post-cap round scoped to
codex r4's B1 and nothing else. V's stated reason: this is what makes the lane's central claim
true rather than merely written down.

Verdict to read first: `agent-reports/sealedrows-codex-r4.md`.

## Closed by codex r4 — do not reopen, do not "improve"

- The **seeder** half is genuinely closed. The substitution test kills codex's own r3 bypass and
  protects both fingerprints behaviourally. It is the model for what B1 needs.
- The **prompt/parser agreement** check is closed. Codex verified add, rename and remove each turn
  it red, and traced the control flow to explain every result.
- **`mutant-index.py` v4** is correct for all six abort shapes and both real campaigns.
- The **sealed value has not moved** — no re-seed.
- Suites, precommit manifest, typecheck: all verified.

`F-SEALEDROWS-F` (abort-code coupling) and `F-SEALEDROWS-G` (schema export surface) are ticketed
follow-ups and are **NOT in this round.**

## The one finding · B1 — the runner-send check reads TEXT, so a COMMENT defeats it

`tests/unit/f-sealedrows-a-conformance-extractor.test.ts:76-80,97-124`, protecting the call at
`apps/runner/src/index.ts:4146-4169`.

**Codex's counterexample, with the current predicates evaluated against it — all five returned
true.** Keep the 339-byte prompt, bind it to a differently named local, re-export it as
`export { actualEvaluatorContractText as EVALUATOR_CONTRACT_TEXT }`, put the exact expected
fragments inside a COMMENT, and point the real evaluator packet at an unrelated identifier. The
value pin, the schema agreement check and both seeder dataflow tests stay green — the named export
still holds the real contract and the seeders still follow it. **The provider receives different
text.**

And it fails in the other direction too: a multiline `conformanceContractHash` initializer, an
aliased named import, reordered fields in the system-message object, and a one-line constant
definition are all CORRECT code that this test rejects. So it is a whitelist of one spelling with
both a false negative and four false positives.

**This is the fifth form of one defect, and the same lesson your own report already names: the
sentence was right and the implementation was a proxy for it.** The seeder half stopped being a
proxy when you tested the BEHAVIOUR. This half is still reading the code that builds the request
instead of watching the request.

**OUTCOME REQUIRED:** what the runner actually SENDS to the provider for the evaluator role is the
exported contract value, proven by observation rather than by inspecting source text. Codex names
the route — observe the evaluator request at the PROVIDER BOUNDARY and assert its sole (or first)
system message is that value.

It must also stop rejecting correct code: a formatting change, an aliased import, or a reordered
object literal must not fail it. **Explicitly forbidden: replacing this with another source
substring match or regex.** If you find yourself writing a pattern over source text, that is the
signal to stop.

Codex's alternative — a syntax-and-symbol-aware parse ignoring comments — remains open to you, but
note the AST route is NOT available (typescript 7.0.2, no `createSourceFile`; my premise in
AMENDMENT 4 was false and codex confirmed it). The behavioural route needs no parser.

Add both the comment-decoy/alias-export counterexample AND the harmless formatting and alias cases.

## Contract

Unchanged. You hold every file. The runner index stays limited to the constant, the band-ceiling
settings field, and the one `export` you already disclosed — do not widen it further; the schema
export surface is F-SEALEDROWS-G's business, not this round's.

## If it cannot be done

Say so and STOP. You have already been right twice about a route that did not exist, and V has now
spent a decision on this round — an honest BLOCKED is worth more than an approximation that makes
the same claim a fifth time.

Three cluster runs, identical numbers or explain the variance. Every suite `passed/total`, every
failure named, whether it predates you.

---

# AMENDMENT 6 — 2026-09-05 · SECOND V-AUTHORIZED POST-CAP ROUND · TEST-ONLY · RETRY PATH

V ruled on `v-packets/V-SEALEDROWS-2-repair-path-unobserved.md`: **one more round, test-only,
scoped to the evaluator RETRY path.** The cap stays at 3 of 3. Verdict to read first:
`agent-reports/sealedrows-codex-r5.md`.

## What codex found, verified by the orchestrator at the source

Your recorder wraps `ProviderGateway.call()` (`database.test.ts:604-618`) and forwards. It sees
the outer `ProviderCallRequest` once. But when a first reply fails the schema, the gateway builds
a REPAIR packet **inside** itself — `packages/providers/src/index.ts:433`,
`attemptPacket = request.buildRepairPacket(...)` — and sends `attemptPacket.messages` on the next
HTTP request. The recorder never sees it. Your fixture pins `conformanceBound.maxAttempts` at 1
and returns valid JSON first time, so the retry path never runs in the test.

**The shipped code is correct** — `buildSchemaRepairPacket` (`apps/runner/src/index.ts:1289`)
appends one user message to the original, so the constant stays first. Codex says so in writing.
This round is not a code fix. It is coverage of an existing path that the authorized outcome —
*what is SENT is the constant* — covers and your test does not.

## OUTCOME REQUIRED

Every evaluator attempt that reaches the wire — first attempt AND every repair attempt — leads
with `EVALUATOR_CONTRACT_TEXT`, proven by observing the wire, in a test that actually EXERCISES
the repair path.

Codex names the route and confirms it needs no production code: the integration provider double's
server callback (`startProviderDouble`, `database.test.ts:105-113`) **already receives every
inbound `/chat/completions` body.** Retain those bodies. Return schema-invalid evaluator content
on the first attempt and valid content on the second. Assert every retained evaluator body's
first message is the constant. Keep the initial-packet assertion if you like; it is not a
substitute.

A narrower acceptable composition, also codex's: invoke the captured evaluator `buildRepairPacket`
directly and assert its output, PLUS a provider-level proof that callback output becomes the next
wire body.

## Constraints

- **Test-only.** Zero production files. If you find the outcome needs a production change, STOP
  and say which line — do not make it.
- **Do not restore source-text predicates.**
- Codex noted your "exactly one system message" assertion is stronger than B1 requires
  (AMENDMENT 5 said sole OR first). Not a blocker; do not weaken it this round, but do not add
  more exact-shape constraints either. The durable invariant is *leads with the constant*.
- `maxAttempts` in the fixture must permit the retry you are proving — say what you set it to
  and why.
- Stall guard stands: scoped runs, logs, nothing over a few minutes in one call.

## One correction to my own record, not yours

My r5 packet said your test asserts "the contract hash travelling with it is the sealed one." It
asserts the fixture's synthetic `contract:conformance:test-layer` — proving the runner FORWARDS
the field, which is a real and useful check. The seeder tests prove the digest. I described one
as the other. Seventh packet defect, admitted on the board.

Three cluster runs, identical or explain. Every suite `passed/total`, failures named.

---

# AMENDMENT 7 — 2026-09-05 · THIRD V-AUTHORIZED POST-CAP ROUND · TEST-ONLY · THEN STOP

V ruled on `v-packets/V-SEALEDROWS-3-third-attempt-and-shape-pins.md`: **one more round, test-only,
scoped to codex r6's B1 and B2, and then this lane stops whatever the outcome.** The cap stays at
3 of 3. Verdict to read first: `agent-reports/sealedrows-codex-r6.md`.

This is the third exception on one lane. V's choice over my own recommendation (merge and carry
both legs into F-SEALEDROWS-I) was to finish the evaluator's guarantee here. Honour that by
finishing it — not by widening it.

## B1 · Two attempts tested; three permitted

Both sealed deployments carry `CONFORMANCE.maxAttempts: 3` (`acceptance/seed-register.ts:246-256`,
`dev-deployment-register.ts:35-41`). Your fixture overrides to 2, so the SECOND repair — the
callback applied to an already-repaired packet, and the third wire attempt — never exists in the
test. Codex's counterexample: a repair helper that preserves the constant on its first invocation
and returns a different leading contract on its second **passes your test**, because the second
invocation never happens.

**OUTCOME REQUIRED:** every attempt the sealed deployment can produce is observed on the wire and
asserted to lead with `EVALUATOR_CONTRACT_TEXT`. Codex's route, adopted: `maxAttempts: 3`,
script invalid → invalid → valid, require three evaluator wire bodies, apply the same loop
assertion to all three. A repair-only counterexample must change only the SECOND repair and die
at `attempt 2`.

## B2 · Delete the shape pins — they are what AMENDMENT 6 said not to add

`database.test.ts:4173-4187`. The `+1 message` delta at `:4187` and the assumption that the
evaluator payload is the FIRST user message at `:4176` both pin repair-packet SHAPE. A legitimate
future repair that appends two context messages, or places a repair message before the
serialised envelope, keeps the contract leading and still fails your test. Codex also notes
`expect(attempts).toHaveLength(N)` already prevents a vacuous single-attempt pass, so the delta was
redundant as well as over-constraining.

**OUTCOME REQUIRED:** delete the message-count delta; assert only the first message's role and
exact content on every retained attempt; identify the evaluator envelope by scanning ALL user
messages for the serialised `role: "EVALUATOR"`, never by position. The attempt count is the
vacuity guard. Nothing else about the packet's shape is asserted.

## Folded in because you are in the same file — F-SEALEDROWS-K (codex F1) and F3

**F1.** Your r7 mutant log invokes an unretained `/tmp/r7gate.py` and reports summaries — no
applied mutation, no token gates, no restore, no hashes. D24 testimony. **You repaired exactly
this class in r3** (E1 → generator output, `mutant-index.py` v3/v4) and it did not carry to the
next test you wrote. Re-capture both mutants — and the new `attempt 2` one — through
`tools/mutate.sh` with the D24 fields, or mark them CANNOT-ASSESS in the report. Do not report a
mutant as caught without a `mutate.sh` transcript this time.

**F3.** Your report dates AMENDMENT 6 as `2026-09-04`. It is `2026-09-05`. Correct only that date;
keep the r5 cursor dated `2026-09-04`.

**F2 is NOT yours this round** — the `5/5 solo` fact is annotated as unverified on F22; do not
re-run it.

## Constraints

Test-only, zero production files — verified by name filter before commit, as last round. No
source-text predicate. No new shape constraint of any kind. `maxAttempts: 3` and say so.

**Then stop.** Whatever codex r7 says, this lane does not get a fourth exception from me; it
goes to V as a merge-or-hold with the finding ticketed. Write your self-report accordingly: what
this lane cost, what it should have cost, and where the rounds went.

Stall guard stands. Three cluster runs; report the worst; name every failure and whether it
predates you.

---

# RECORD CORRECTION — 2026-09-05 (codex r7 F1 and F2-PACKET) · appended, nothing above rewritten

**F1.** AMENDMENT 6 and AMENDMENT 7 describe the second repair as "a repair applied to an
already-repaired packet." That is not the gateway's topology: `request.buildRepairPacket` closes
over the ORIGINAL packet and never receives `attemptPacket`, so each invocation rebuilds from the
captured base. The correct statement is *"the second invocation of the repair callback, producing
the third attempt from the captured base packet."* The test is correct and the stateful
second-invocation mutant remains the right discriminator; the mental model in my prose was wrong.

**F2-PACKET (reviewer packet r7).** "Nothing else about shape" was an overstatement: the r6 pins —
the `+1 message` delta and the first-user assumption — were deleted; the pre-existing sole-system
assertion, the outer-call cardinality check, and the contract-hash forwarding assertion remain,
and AMENDMENT 6 had itself said not to weaken the first of those. Orchestrator packet defect #9.
