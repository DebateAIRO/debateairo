REWORK READY FOR REVIEW — T9B rework 1/3 · comments read through: s07-codex-r4-2026-09-03
report sha256: db49fb6b1c81cf09f27c5b5b3c5c57a94b3250514bab3ce0f4488c3316d15866

# S07 — T9 synthesis serve chain · filing r5 (rework 3 of 3, the last lawful round)

Lane `lane/s07` @ **9a3a5f60** (base `e040b1ee`, 12 commits). Tree clean.
`git diff --summary e040b1ee..HEAD | grep -c "mode change"` = **0**.
No live provider call from this seat.

Codex r3: 2 blocking, both accepted, both closed. The third finding was the
orchestrator's own and needs nothing from me beyond not repeating the phrase —
provider-role equality, artifact identity and producer identity are three
different things, and I will not conflate them again.

## `tools/stamp-check.sh` (D41), run against this round's prefix

```
TIP=9a3a5f6074fd42da56b74674e1e2f45406ff436d  (resolved with git -C .worktrees/lane-s07)
records compared: 9 · failures: 0
OK: every record stamps the filed tip
```
First run reported `NO-STAMP … r5f-head-failures.txt` — a derived failure-name
list I had written under the gate prefix. It is not a gate record and should not
have claimed to be one; renamed to `r5-derived-head-failures.txt`, and the nine
records above are gates only.

## B1 — the retained carrier is gone

You were right, and so was the doubt I filed against myself. I kept that column
by arguing my way to it, and the argument had two holes: the frozen SPEC asks for
recorded-request **assertions** and loop-round **records**, never for the request
to be persisted; and the column could not have proved what I kept it for, because
**the same in-memory object fed the provider packet and the row** — evidence the
object existed, never that it was the request as sent.

Removed: the `synthesizer_request` column, `content_ciphertext`,
`content_attestation`, the reproduced `core.enforce_content_ciphertext` branch,
the trigger, the `CONTENT_CARRIERS` entry, and the decrypt in the reader.
`serve.synthesis_round` is **not a content carrier** — it holds no debate content
at all — and the encryption suite is back to **14** carriers in both its lists.

Kept, as ruled: the **ownership-aware leased reader** (`core.run_is_owned_by`,
the same predicate the projection uses, under `withRunContentLease` — the rows
point *at* content carriers, so a resolver must not race an erasure), and the
durable structural and reference fields. A test asserts the table has none of
`synthesizer_request`, `candidate_statement`, `evaluator_request`,
`evaluator_verdict`, `round_objection`, `content_ciphertext`,
`content_attestation`.

The verbatim-objection claim now lives only where the SPEC puts it: on the
**recorded request** at the provider seam (`tests/unit/t09-synthesis.test.ts`).

## B2 — references bound to producers, not to runs

"Same run" was never a producer binding: a JUDGE artifact from the same run
satisfied it as both the candidate and the verdict reference. Each reference is
now resolved **before the answer commits** through the ledger entry that recorded
it — `run_id`, `subject_item_id` (this work item), `action_kind='MODEL_CALL'`,
`outcome='OK'`, and the **call-site key stored beside it** — and the call site
must name the round, so a round-1 pairing cannot be filed as round 2. The
call-site keys are persisted so a reader re-runs the same join.

The oracle joins `serve.synthesis_round → serve.answer → ledger.ledger_entry` on
that pairing and expects all four producers (2 rounds × 2 roles), rather than on
run identity. The negative arm exercises **a same-run wrong-producer reference**
(a real JUDGE artifact under a synthesis call site), plus the wrong-round case.

## Evidence — every gate stamped at 9a3a5f60

| gate | result |
|---|---|
| cluster S07-C1 ×3 (worst wins) | **63/63 · 63/63 · 63/63** |
| `tests/unit` + `tests/architecture` | 13 failed / **1347** — **SET-EQUAL to base**: 0 new, 0 vanished |
| `tests/integration/database.test.ts` | 1 failed / **82** — the pre-existing lifecycle failure |
| `tests/integration/s6-content-encryption-database.test.ts` | **48/48** |
| root `pnpm run typecheck` | **exit 0, 0 errors** |
| `tsc -p apps/ui/tsconfig.json` (D16) | 1 error — pre-existing `layout.tsx:3 TS2882` |
| `tsc -p web/tsconfig.json` (D14) | 1 error — pre-existing `layout.tsx:3 TS2882` |

### Refutation — and the mutant that survived twice

| # | property | mutation | result |
|---|---|---|---|
| R5M1 | the binding is to the PRODUCER (B2) | degrade it to run identity | **RED** |
| R5M2 | the call site must name the round (B2) | drop the round binding | **RED** |
| R5M3 | the reader is ownership-scoped (B1) | drop the ownership predicate | **RED** |
| R5N1 | **neighbour — must NOT be caught** | reword the round-binding error | **GREEN** ✔ |

**R5M2 survived twice before it died, and both survivals were my test's fault.**
First there was no arm for it at all. Then the arm I added was refused by the
*work-item* binding rather than the round binding, so it never reached the guard
— a test that passed for the wrong reason and would have let the guard rot. It
now shares the work item its ledger entries name, leaving the round check as the
only thing that can refuse. Nineteen mutants across five campaigns; gates
`pre=0 → applied=1 → restored=0` throughout; zero surviving tokens; porcelain
clean after every restore.

## V-ROW DRAFTS — nothing is left open that I could close

**V-S07-1 — the round guard's reachability is narrow.** `endsWith(":<round>")`
is a string check over a call-site convention the runner owns; serve does not
parse the key structurally. **Decision:** accept as-is, or require a typed
call-site vocabulary shared by runner and serve. **Recommendation:** accept —
the ledger pairing already carries the weight, and the round check is the
cheap second lock. **Default if V is silent:** accept as-is.

**V-S07-2 — `readSynthesisRounds` answers a non-owner with `[]`.** It matches the
projection reader's shape, but silence is not the only honest answer to an
unauthorized read. **Decision:** keep `[]`, or return a typed refusal.
**Recommendation:** keep `[]` for consistency with the sibling reader; change both
together or neither. **Default:** keep `[]`.

**V-S07-3 — migration 0057 was rewritten in place three times.** Lawful (never
merged, never run outside this lane), but the mission's registry discipline is
append-only in spirit. **Decision:** accept the rewritten 0057, or require the
final shape as a fresh number. **Recommendation:** accept — a stacked fix-up
chain for an unshipped migration is worse for the reader. **Default:** accept.

**V-S07-4 — two content commits in r4 and three in r5**, against D27's
"commit once, then gate". Each was a mutant-driven fix I judged better to make
than to defer, and every gate was re-run at the final tip with the comparator
clean. **Decision:** accept, or treat as a D27 violation. **Recommendation:**
accept; the rule's purpose (no record naming a stale tip) is satisfied.
**Default:** accept.

## Registry and residue

- Migration **0057** is S07's, uncontested (J26 a).
- **W12b**: this relation's `core.install_truncate_guard` call is a DEV-SYNC item
  per D25.
- Open and not mine: the T17/S09 envelope call-site term, and
  `core.read_terminal_recorded_facts` counting `COMPOSER:%` (five battery
  predicates), which needs its own migration.

## Bounds

No push, no merge, no board or DECISIONS edit, no slice file touched (D11). J22
unchanged. Rework rounds spent: **3 of 3 — no lawful round remains.**

---

# T9B — post-cap correction lane · r1 (rework 0/3) · BLOCKED at STEP 0

`SKILLS LOADED: heartbeat, heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers,
superpowers:test-driven-development, superpowers:systematic-debugging,
superpowers:verification-before-completion`

Filed 2026-09-03 by the T9B worker seat (session `opus-s07-w7b`). The r5 filing above is
UNTOUCHED except for line 1 and line 2; its marker was
`REWORK READY FOR REVIEW — S07 r5 (rework 3/3) · comments read through: s07-codex-r3-2026-09-02`
and its line-2-excluded digest was
`2e3d3e497a4f63cc84888f51accd82a8078ec7c674233f764d2eeb6a35a64254`. A pre-edit copy is at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s07/s07-synthesis-BEFORE-T9B.md.bak`.

**No product code was written this round.** The packet's STEP 0 ordered the integration merge
before any code, and its §6 stop condition fired inside that merge. What follows is the
finding, the evidence, and the state I left behind.

## Lane state, verified, unchanged from the packet's declaration

```text
HEAD      9a3a5f6074fd42da56b74674e1e2f45406ff436d
tree      5698df1e09e69af168cbd68687775f44ee32b95b
porcelain (empty)
```

The merge was performed, fully resolved, measured, and then **aborted**, so the lane tip is
byte-for-byte what the packet declared. I did not commit the merge: committing a tree that
fails `typecheck` would hand every later seat and gate a broken baseline for lane/s07.

## F-T9B-BLOCK (BLOCKING) — the merge collides with a LANDED S08 assertion

**Verdict: the merge cannot be completed without a product decision that is V's, not mine.**

### What was done

`git merge --no-commit --no-ff 19bbb4c4` into `lane/s07` @ `9a3a5f60`. Git reported **six**
conflicted paths, all six resolved by reading both sides:

| path | conflict | resolution |
|---|---|---|
| `tests/unit/dr174-resilience.test.ts` | `CONDITION_MARKS` count pin 36 vs 33 | **37**, counted from the merged array |
| `tests/unit/s14-ui.test.ts` | same pin | **37**, same source |
| `tests/unit/obs-l2-s02-registry.test.ts` | `CONDITION_MARK_SEVERITY` pin | **37**, same source |
| `apps/runner/src/dev-runner-policy.ts` | 3 hunks, each side adds distinct members | union — `panelPolicy` + `stoppingPolicy` + `synthesisRolePolicy` all kept |
| `apps/runner/src/main.ts` | each side adds a distinct entry-point wiring | union — `claimTimeProbe` and `synthesisRolePolicy` both kept |
| `packages/serve/src/index.ts` | 3 hunks, one of them substantive | see below |

**The count pin is 37 because I counted it, not because I added the comments up.** lane/s07
pins 36, integration pins 33, and 32 marks are shared; T9 mints four
(`SYNTHESIS-OBJECTION-STANDING`, `DIGEST-COMPRESSED`, `DIGEST-CANNOT-EXIST`,
`PROTECTED-CORE-GUARD-RETIRED`) and T7 mints one (`BRANCH-FROZEN-LOW-LEVERAGE`), so both
mints survive at 37. My first counter said 33 and was WRONG: its regex `[A-Z0-9-]+` silently
dropped the four underscore marks (`ENVELOPE_EXHAUSTED`, `LEVERAGE_UNRESOLVED`,
`AMBIGUOUS_ATTRIBUTION`, `NOT_SAMPLED`). That is a D56 instance in my own tooling — a counter
that could not fail for the reason it existed. The corrected counter was then self-tested
against a file with one mark deleted (printed 35, not 36) and against a file with no array
(refused, exit 2). Neither pin was loosened: both sides stated an exact number and 37 is the
exact number at the merged tree.

### The collision

`tests/unit/t12-t13-band-basis.test.ts` — introduced by `5940b058` *"T12+T13 (S08): band
basis and honest downgrade read the CITED node set"*, landed on `mission/2026-09-01-algorithm-live-loop`,
**absent from lane/s07** — is written against a `ServeGateDependencies` shape that T9 replaced.

Measured, not inferred:

```text
lane/s07 @ 9a3a5f60, clean, alone   : pnpm run typecheck  EXIT = 0
resolved merge, all 6 hunks closed  : pnpm run typecheck  EXIT = 1, 12 errors
every one of the 12 errors is in ONE file: tests/unit/t12-t13-band-basis.test.ts
```

Gate records (emitted by `tools/gate-run.sh` v3, D45/D49/D52):
- `…/logs/s07/t9b-typecheck-lane-tip-premerge.log` — exit 0, porcelain clean
- `…/logs/s07/t9b-merge-blocked-typecheck.log` — exit 1, the 12 errors verbatim

The cause, read off both trees with `git show` rather than from a diff narrative: T9 removed
`measureCompositionBundle`, `compose`, `selectSample`, `conform` and `postComposeR9` from
`ServeGateDependencies` and replaced them with `synthesize` + `evaluate`, and removed
`maxRecompose` from `ServeGateInput`. S08's file uses all six.

### The class sweep — one of them irreducible

*(N1 correction: the arm count previously stated here was derived by pattern-matching
the source at the resolved-merge tree, where the file did not compile and no suite
could count it. The enumeration below is what I inspected arm by arm; it is not a
vitest count and is no longer presented as one.)*

Router §2.2: the compiler named a file; the CLASS is *S08 assertions written against the
retired chain API*. Generated per arm, not sampled:

| arms | status |
|---|---|
| 11 (`T12 mono-maker`, all `F30` describes) | **unaffected** — they call `applyPanelDegradedBandStepDown` and friends directly, no chain |
| 8 (`L146, L165, L181, L219, L245, L257, L290, L307`) | reference retired MEMBERS but no retired CONCEPT; each needs its `compose` override expressed as a `synthesize` override. I did not port them, so whether each ports cleanly is **CANNOT-ASSESS** — I am not going to assert portability I did not compile |
| **1 (`L200`)** | **irreducible.** The property itself is unreachable at T9's chain |

**L200 is `it("excludes the citations of a segment conformance never verified")`.** It drives
`selectSample: () => false` so one segment lands `state: "NOT_SAMPLED"` and asserts its
citations stay out of the band basis. At the merged tree that state has **no producer**: the
sole construction site of `conformance` mints `state: "JUDGED" as const,` for every segment
(unique at `packages/serve/src/index.ts:758 @9a3a5f60`), so the filter the assertion depends
on, `.filter((judgement) => judgement.state !== "NOT_SAMPLED")` (unique at `:808`), can never
exclude anything. That is traced from the two call sites, not inferred from the diff. T9 is
explicit that this is intended — `coverageMode` is hard-set `"EXHAUSTIVE"` and the header says
*"the coverage is exhaustive by construction — there is no sample any more."*

So S08's assertion is not stale, and T9's design is not wrong. They are incompatible, and
choosing between them is a product decision. I did not delete it, weaken it, or rewrite it.

## F-T9B-1 (BLOCKING, product) — the merge opens a hole S08 predicted in writing

Independent of the test file. On integration, a non-conforming set is refused before the band
is ever computed:

```text
19bbb4c4 packages/serve/src/index.ts:543
  if (!conformance.every((judgement) => judgement.conforms)) {
    trace.push("COMPONENTS_ONLY_DEFECT");
    return componentsOnly(input, trace, segments, conformance, coverageMode);
  }
```

On `lane/s07` that guard **does not exist** — grepped both trees; T9 retired the conformance
gate into an evaluator objection criterion, and the loop deliberately SERVES a standing
objection rather than withholding the answer. So at the merged tree, when
`finalCriteria.citationTracing` is false every judgement carries `conforms: false`, the
`state`-only filter admits all of them, and those citations enter the confidence band.

S08 wrote the warning itself, thirty lines above its own filter:

> *"Whoever moves either piece must move both — dropping that guard silently widens this set."*

T9 moved one piece. This is a confidence band computed over citations that failed tracing —
a silent degradation, which the Scope law forbids. It is **not** covered by my charge and I
did not fix it.

## F-T9B-2 (evidence) — codex B2 is WIDER than the four R5 records

The packet told me the four R5 records are inadmissible and *"the 15 previously accepted
mutants stand"*. Running the mission's own derivation tool over the raw transcripts
(`tools/mutant-index.py` v2, D46/D50) says the D42 defect is not confined to R5:

```text
python3 tools/mutant-index.py .../logs/s07/mut-
→ all 30 mut-*.run.log transcripts: "malformed custody gates ?/?/?" and "carries no EXIT line"
```

Read directly, `mut-M1.run.log` — one of the fifteen — opens on bare `vitest` output. It has
no `commit=` stamp, no `<<<OLD`/`TOKEN>>>` markers, no `GATE pre/applied/restored`, no
`sha BEFORE`/`sha AFTER`, no `HASHES MATCH`, no closing porcelain and no `EXIT` line. None of
the thirty was emitted by `tools/mutate.sh`.

**Before citing that tool I proved it can say otherwise** (D56): a hand-built well-formed
transcript fed to the same command returns `GATES 0/1/0 · OUTCOME ASSERTION · CLEAN: every
transcript well-formed`. The refusal is real, not a broken parser.

I am **not** overturning the acceptance of the fifteen: D42 was ruled 2026-09-02 18:09 and
those campaigns predate it, so "accepted" was a grandfathering judgement and that judgement is
not mine to revisit. But it means the record correction my packet asked for is ambiguous, and
I will not resolve it silently — see below.

## Record correction — stated as a question, because the packet's term is undefined

The packet: *"The report's 'nineteen mutants across five campaigns' is not established. Correct
it to what the admissible evidence supports."*

I could not derive nineteen from the artifacts. `logs/s07/` holds **30** `mut-*.run.log` files:
r1 `M1–M9` + `N1`, r2 `R2M1–R2M6` + `R2N1`, r3 `R3M1–R3M3` + `R3N1`, r4 `R4M1–R4M3` + `R4N1`,
r5 `R5M1–R5M3` + `R5N1` — 24 mutants and 6 neighbour arms. Neither 30, 24 nor 19 − 4 = 15
falls out of the file set, so I cannot tell which population "nineteen" counted.

Two readings of "admissible", giving two different corrections:
- **D42-conformant** → **zero**; every transcript fails the emitter contract.
- **accepted when filed** → **15 across four campaigns**, r5's excluded.

I have therefore left the sentence at line 94 **unedited** and flagged it here rather than
writing a number I cannot derive. Substituting a plausible one would be the exact defect D34
and D51 exist to stop. This needs one line from the judge or V.

## What I CONFIRMED about my actual charge, before stopping

Read at the resolved merge, so it is current rather than inherited from r4:

- `{ ref: round.candidateRef, callSiteKey: round.candidateCallSiteKey, role: "SYNTHESIZER" },`
  (unique at `packages/serve/src/index.ts:1886 @9a3a5f60`) builds the two-element array whose
  `role` is the only thing distinguishing the pairs.
- `role` is then read at exactly two sites in the block, both inside template literals
  (`:1894`, `:1911`) — error text, never a predicate. The ledger query at `:1897–1906` binds
  `bound.callSiteKey` and `bound.ref` **as supplied**.
- The only structural check is `if (!bound.callSiteKey.endsWith(\`:${String(round.round)}\`)) {`
  (unique at `:1891`), which a real key `COMPOSER:SYNTHESIZER:INITIAL:1` passes in BOTH
  positions.

Codex B1 reproduces exactly: one legitimate round-1 synthesizer artifact submitted as both
candidate and verdict passes both suffix checks and resolves the same valid ledger row twice.
**The defect is real and still open.** I did not fix it, because RED-before-GREEN needs a tree
I can hand over, and the tree is undecided.

## Citations are searches, not line numbers (D53/D55)

Every anchor above was proven to resolve to exactly one site:
`…/logs/s07/t9b-cite-check-resolved-merge.log` — 7 anchors, `unique=7 problems=0`.
`cite-check.py`'s own refusal arm was exercised first:
`…/logs/s07/t9b-cite-check-D56-refusal-arm.log` — an over-broad anchor (211 sites) and an
absent one, both refused, exit 1.

## Artifacts, by absolute path

```text
/…/logs/s07/t9b-typecheck-lane-tip-premerge.log        gate: lane alone, EXIT 0
/…/logs/s07/t9b-merge-blocked-typecheck.log            gate: resolved merge, EXIT 1, 12 errors
/…/logs/s07/t9b-merge-resolution.patch                 the full 6-conflict resolution, stamped, 242132 bytes
                                                       sha256 944b5566c64549c4e2d6d07c59032c1adc783b6853f0029858dc339b3b110205
/…/logs/s07/t9b-cite-check-resolved-merge.log          7/7 anchors unique
/…/logs/s07/t9b-cite-check-D56-refusal-arm.log         the checker refusing
/…/logs/s07/s07-synthesis-BEFORE-T9B.md.bak            this report before my edit,
                                                       sha256 ab3a484cace84a652b1ca89fb6101b8d12eff2fa67edb64f6eaf5e22c264c18e
```

`/…/` = `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`

The resolution patch exists so the six conflicts are not re-derived by whoever resumes. It is
**not** a merge to apply as-is: it produces the failing tree above by construction.

## Suites

`pnpm run typecheck` only, twice, both through `gate-run.sh`, reported above with their own
exits. **No cluster suite, no RED arm, no GREEN arm, no mutation campaign was run this round** —
all of them would have measured a tip that cannot be the merged tip, which is the stale-
provenance defect D27, D41 and D53 were each written for. Nothing is reported as passing.

## What V is being asked to decide

1. **F-T9B-BLOCK** — S08's `L200` assertion versus T9's exhaustive-coverage design. Retire the
   assertion with a reason on the record, or restore a reachable notion of "unverified segment"
   to T9's chain. Either is a product change; neither is inside T9's scope.
2. **F-T9B-1** — whether a failing `citationTracing` may contribute its citations to the
   confidence band. S08's chain said no. T9's chain currently says yes by omission.
3. **F-T9B-2 / the record correction** — which population "admissible" names, so the mutant
   sentence can be corrected to a derived number instead of a chosen one.

Once (1) is ruled, the merge completes from the saved patch, and B1 and B2 proceed at the
merged tip in one round. The B1 fix itself is unblocked in design — the shared builder has an
obvious home beside the existing binding loop — and nothing in this finding touches it.

---

# T9B r1 continued — V ruled 2026-09-03; three of four items DONE, one BLOCKED

Lane `lane/s07` @ **6a0491f0**, tree clean. Base `9a3a5f60`, five commits:
`905261e6` merge · `5c286e33` port+retirement · `93c0b14e` B1 fix ·
`d755d962` the equality arm · `6a0491f0` B2 arm rebuild.

## 1. The merge — DONE

`19bbb4c4` merged at `905261e6` with both parents. All six conflicts resolved as
filed; the saved patch was used rather than re-deriving them. The `CONDITION_MARKS`
pin is **37**, counted from the merged array (32 shared + T9's four + T7's one).

The merge commit deliberately does **not** typecheck, and says so in its own message:
S08's `tests/unit/t12-t13-band-basis.test.ts` collides there, and `5c286e33` repairs it.
Recording the collision where it happens beat hiding it inside the repair.

## 2. The port and the ONE retirement — DONE

**Eight arms PORTED, not retired, and all eight pass with their property intact.** The
candidate now arrives through `synthesize` and the criteria through `evaluate`, so each
arm's `compose: async () => [...]` override became a `segments: () => [...]` script hook;
`ServeGateInput` lost `maxRecompose`/`strangerSampleRate` and gained the digest inputs,
served root, code label and sealed role controls. **None of the eight turned out to pin a
retired CONCEPT rather than retired member names, so no second V row is owed.**

**One assertion retired, on the record**, at
`tests/unit/t12-t13-band-basis.test.ts` — anchor
`   * RETIRED ON THE RECORD — V ruling, 2026-09-03 (T9B lane, finding F-T9B-1).`
The site names the ruling, states that `NOT_SAMPLED` has no producer on this chain, and
points at where its safety property was supposed to go. **S08's cited-set filter stays in
`packages/serve`**, deliberately untidied, per the ruling.

  `t12-t13-band-basis.test.ts`: **19 passed (19)** — vitest's own count.
  *(N1 correction, 2026-09-03: this line previously added "was 20 before the
  retirement". That figure was INFERRED — 19 plus the one I retired — not measured,
  and it is not obtainable: the file does not compile against this lane's chain at
  S08's tip, so no suite ever reported it. Source-pattern counts are not a
  substitute here; a regex over `it(` also matches the retired assertion's name
  quoted inside the retirement comment, and mine did. Only vitest's count is used
  now, and only at tips where the file runs.)*

## 3. The citationTracing guard — BLOCKED, and this one is not a judgement call

**I implemented exactly what was ordered, ran it, and it breaks two landed assertions.**
Evidence, not argument: `logs/s07/t9b-citationtracing-guard-COLLISION.log`.

```text
× T9 crash classes — the ONLY four ways COMPONENTS_ONLY still exists >
    names a terminal, a trace token and a mark for every enumerated class
  → expected [ 'CITATION_TRACING_FAILED', …(4) ] to deeply equal [ 'DIGEST_CANNOT_EXIST', …(3) ]

× T9 DoD row 2 — no NON-CRASH path returns COMPONENTS_ONLY >
    serves rather than components-only: citation tracing objected (former conformance gate)
  → expected 'CITATION_TRACING_FAILED' to be null
```

The second arm is anchored at
`      name: "citation tracing objected (former conformance gate)",` and it is not
incidental — it is the frozen goal's own DoD row, transcribed. The goal
(sha256 `78238eeb…`, verified this session) says, at the lines T9 implements:

- `conformance ≤2 (:521-524) → evaluator-objection criterion (citation tracing: every load-bearing claim traces to a digest node)`
- `COMPONENTS_ONLY survives ONLY for the enumerated set: transport death, no-artifact, digest-cannot-exist, and envelope exhaustion`
- `no non-crash path returns COMPONENTS_ONLY`

So the ordered guard re-terminalises the exact gate the frozen goal re-routes, and adds a
fifth member to a set the goal closes at four. The ruling's own boundary — *"not licence to
weaken, relax, rename or delete any other landed assertion"* — and its first instruction
cannot both be satisfied. **The guard is reverted; the tree carries none of it** (33/33 in
`t09-synthesis.test.ts` restored, porcelain empty).

**What I did NOT do:** pick one half of the ruling and quietly serve it. V outranks the
frozen goal and may override it — but the ruling reads as though the goal's enumeration was
not in view, and an override made without sight of what it overrides is worth one line of
confirmation before it becomes code.

**Cheapest paths, for whoever rules:**
1. Confirm the override: add `CITATION_TRACING_FAILED` as a fifth crash class, update the
   exact-set pin from four names to five, and correct the DoD row and the two prose claims
   that say COMPONENTS_ONLY has exactly four causes and none is a quality judgement. The
   diff is ready in the collision log.
2. Get the safety property WITHOUT a new terminal: let `conforms` become a real axis of
   S08's cited-set filter, so untraced segments contribute no citations to the band while
   the statement still serves with its standing objection. This satisfies the ruling's
   stated concern verbatim — *"must not have its citations counted into the confidence
   band"* — and leaves the goal's enumeration untouched. It needs its own arm, because with
   every segment untraced the existing empty-basis throw fires instead.

I did not choose between these.

## 4. B1 — the role is a PREDICATE now. DONE, RED→GREEN

`synthesisCallSiteKey(binding)` in `packages/serve/src/synthesis.ts` is the ONE place the
two key formats exist; the runner builds its keys from it, and persistence derives the
EXPECTED key from the typed role, `round.synthesizerRequest.stage` and `round.round`,
requires equality, and resolves the ledger entry **by the derived key**. No stored round
column — every input was already on the round record.

  RED  `logs/s07/t9b-B1-RED-wrong-role-arms.log` — exit 1. The evaluator artifact offered
       as the candidate **RESOLVED and committed an answer**: codex B1 reproduced live.
  GREEN `logs/s07/t9b-B1-GREEN-wrong-role-arms.log` — exit 0.

Four negative arms plus a positive one, so they cannot pass against a predicate that
refuses everything: evaluator-as-candidate · synthesizer-as-verdict · one artifact and key
for both roles (codex's exact counterexample) · **and the ambidextrous arm below**.

**The fourth arm exists because a mutant told me my own check was doing nothing.** B1M1
neutralised the equality predicate and SURVIVED: every wrong-role arm was already refused
by the ledger lookup, which resolves by the *derived* key. Equality only acts when one
artifact is recorded at BOTH role call sites — which the wrong-round fixture above
literally builds. That arm was added, and B1M1 then died on it. D37's "the mutant you
expect to be redundant is the one carrying information", and D56 applied to my own code.

## 5. B2 — both wrong-cause mutants rebuilt. DONE

`tests/support/settledRun.ts` gained `persistTerminalAnswer`: the production writer
`ServeRepository.persist` with **no** work-item settle after it. Both the new arms and the
two pre-existing ones now run on an **activation-free** run, because `createRun`'s full
battery makes the TERMINAL progress event trip `core.reject_terminal_with_wait`
(23514 `WAIT_DRAIN_REQUIRED`).

**This bit me exactly as it bit R5M2, and I am recording that rather than smoothing it.**
My first campaign pass rebuilt only my own arms; B1M2 and B1M3 then died on
`WAIT_DRAIN_REQUIRED` — the identical wrong-cause death codex named — because the *older*
arms they kill still used the battery fixture. `mutant-index.py` reported that campaign
**CLEAN**, because it classifies assertion-frame-vs-throw, not whether the assertion that
fired is the one credited. **The index proves FORM; only reading the kill line proves
CREDIT.** After rebuilding both older arms, every mutant dies on `promise resolved …
instead of rejecting` and no `WAIT_DRAIN_REQUIRED`, `23514` or `42P18` appears anywhere in
the campaign (grepped; the grep is in the filing trail).

Campaign, derived by `tools/mutant-index.py` v2 against a manifest written first —
`logs/s07/t9b-MUTANT-CAMPAIGN-INDEX.log`, manifest `logs/s07/t9b-mutant-manifest.txt`:

| mutant | target | outcome | killed by |
|---|---|---|---|
| B1M1 | the role-equality predicate | KILLED | the ambidextrous-artifact arm, `database.test.ts:5332` |
| B1M2 | the ledger producer resolution | KILLED | the same-run wrong-producer arm, `:5137` |
| B1M3 | the round inside the derived key | KILLED | the wrong-round arm, `:5171` |
| B1N1 | NEIGHBOUR — error prose only | **SURVIVED**, as required | — (arms match on `code`) |

```text
TALLY: transcripts=4  killed=3  survived=1  invalid=0
CLEAN: every transcript well-formed, every outcome matches the manifest
```

Its refusal arm was exercised before I cited it (D56): flipping B1N1's manifest entry to
KILLED makes the same command print `expected KILLED, observed SURVIVED` and exit 1.

## 6. Suites — three runs each, worst run is the verdict

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `typecheck` | exit 0 | exit 0 | exit 0 | **PASS** |
| `tests/integration/database.test.ts` | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | **1 failed / 84** |
| T9 unit + arch cluster | 82 passed (82) | 82 passed (82) | 82 passed (82) | **82/82** |

The single database failure is
`apps/runner — legal command lifecycle > claims, judges through the HTTP gateway,
propagates, serves, and settles`, byte-identical across all three runs. **PRE-EXISTING and
not mine**, verified rather than asserted: it fails identically at parent commit `5c286e33`
with this work stashed, and it is the failure the r5 filing already named. I make no
blanket claim about anything else.

## 7. Records

All 9 final gate records and all 4 mutant transcripts stamp the filed tip:
`stamp-check.sh` → `records compared: 9 · failures: 0` and `records compared: 4 · failures: 0`.
All 8 citation anchors resolve to exactly one site — `logs/s07/t9b-FINAL-cite-check.log`,
`unique=8 problems=0`, each carrying its `@6a0491f0`.

New artifacts, all under
`/Users/stefan.nour/…/2026-09-01-algorithm-live-loop/logs/s07/`:
`t9b-citationtracing-guard-COLLISION.log` · `t9b-B1-RED-wrong-role-arms.log` ·
`t9b-B1-GREEN-wrong-role-arms.log` · `t9b-mut-B1M1..B1M3,B1N1.run.log` ·
`t9b-mutant-manifest.txt` · `t9b-MUTANT-CAMPAIGN-INDEX.log` ·
`t9b-FINAL-{typecheck,database,t9cluster}-run{1,2,3}.log` · `t9b-FINAL-cite-check.log`

## 8. Still owed to V

- **The citationTracing guard** (§3) — the one blocking item, with two costed paths.
- **F-T9B-2 / the record correction** — unchanged from the earlier filing and still on the
  V packet: `logs/s07` holds 30 transcripts, 24 mutants and 6 neighbours, and "nineteen"
  is not derivable from them. The four transcripts THIS lane added are D42-conformant.

---

# T9B r1 — F-T9B-1 taken as OPTION 2 · SUPERSEDED SECTION

> **SUPERSEDED IN FULL by V's third mechanism and then by the rework-1 correction.** The
> heading's "all four items done" was true of that pass only. Option 2 made an exhausted
> citation-tracing objection FATAL through S08's empty-basis guard; goal-v4 requires that
> run to serve. Read the rework-1 section at the end of this file for current behaviour.
> Kept, not deleted: its RED log and mutant transcripts are the evidence for the finding
> that produced the next ruling.

Lane @ **29649564**, clean. Seven first-parent commits from `9a3a5f60`; the two added
here are `884a4ad8` (the filter) and `29649564` (the two serve-s05 re-pins).

**§3 above is superseded on its verdict, not on its evidence.** The collision it recorded
is real and the guard it measured is still not in the tree; what changed is the chosen
remedy. Option 1 — a fifth crash class — remains untaken, because it is a goal override
and therefore V's alone; its measured diff stays in
`logs/s07/t9b-citationtracing-guard-COLLISION.log`.

## The changed filter

`packages/serve/src/index.ts`, anchor
`      .filter((judgement) => judgement.state !== "NOT_SAMPLED" && judgement.conforms)`.

`conforms` is a live axis of S08's cited-set filter now. Under this chain every judgement
carries the same `finalCriteria.citationTracing`, so a failed criterion leaves no verified
segment, the cited set is empty, and **S08's existing empty-basis guard refuses** — the
case S08 wrote it for. Untraced citations reach no confidence band.

Both of S08's axes are live again, reached through T9's one criterion instead of three
sampled states. The `state` axis stays and is still vacuous here; it is not tidied.

**No fifth crash class, and both goal sentences still hold**: `COMPONENTS_ONLY` keeps
exactly its four enumerated classes, and no non-crash path returns it. The refusal is a
`TypedDomainError`.

## RED and GREEN

  RED   `logs/s07/t9b-F1-RED-citation-tracing-band.log` — exit 1. The chain **SERVED**:
        `"terminal": "DOWNGRADED"`, `"standingObjection": "Claim 2 traces to no digest
        node."`, with the untraced citations counted into the basis.
  GREEN `logs/s07/t9b-FINAL-t9cluster-run{1,2,3}.log` — 83/83 three times.

## The all-untraced arm

`tests/unit/t12-t13-band-basis.test.ts`, anchor
`  it("refuses to band a statement whose citation tracing FAILED", async () => {`.
It asserts the refusal by code **and** that `recorded.bases` is empty — the ceiling is
never consulted, so no untraced citation reaches a basis even transiently. The second
assertion is the one that would catch a fix that refused *after* banding.

## THREE landed T9 assertions changed behaviour, all re-pinned on the record

This is wider than the one arm the ruling anticipated, and I am stating it rather than
letting it be discovered:

| where | was | now |
|---|---|---|
| `t09-synthesis.test.ts` — former conformance gate | sat in `nonCrashArms`, asserted it SERVES | lifted out, its own arm, pins the loud refusal **and** that no crash class was added |
| `serve-s05.test.ts` — `servedDespiteUntracedCitation` | asserted SERVED | subject kept on a serving objection; the untraced case re-pinned as a refusal |
| `serve-s05.test.ts` — the exhausted-loop case | objected on `citationTracing`, asserted SERVED | objects on `noOverstatement`, still asserts SERVED with its standing objection |

The `unsatisfied()` helper in `serve-s05.test.ts` had hardcoded `citationTracing: false`
and was used as a *generic* "the loop is objecting" fixture. That criterion is no longer
generic, so the helper is parameterised and defaults to `noOverstatement`. Nothing was
deleted: every arm keeps its own subject, and the untraced case is asserted explicitly
wherever it used to be asserted implicitly.

**The residual tension, flagged not resolved.** goal-v4 disposes of the conformance gate as
*"→ evaluator-objection criterion"*. Under option 2 a citation-tracing objection is fatal to
the answer, which is a stronger outcome than the word "criterion" suggests — it is simply
not fatal *through* `COMPONENTS_ONLY`. The goal's two literal sentences hold and its
DoD row still has its test; whether the disposition's spirit does is worth one line from
V. Neighbouring criteria are unaffected: fairness, restatement, overstatement and label
agreement all still serve with their standing objection, pinned by the four surviving
`nonCrashArms` and by the three-unsatisfied-rounds arm.

## Campaign, re-run at the filed tip

`logs/s07/t9b-MUTANT-CAMPAIGN-INDEX.log`, manifest `logs/s07/t9b-mutant-manifest.txt`:

| mutant | target | outcome | killed by |
|---|---|---|---|
| B1M1 | role-equality predicate | KILLED | the ambidextrous-artifact arm |
| B1M2 | ledger producer resolution | KILLED | the same-run wrong-producer arm |
| B1M3 | the round inside the derived key | KILLED | the wrong-round arm |
| B1N1 | NEIGHBOUR — error prose only | SURVIVED, as required | — |
| **F1M1** | **revert the `conforms` axis** | **KILLED** | all three re-pinned arms: `t12-t13-band-basis:354`, `t09-synthesis:773`, `serve-s05:223` |
| **F1N1** | **NEIGHBOUR — drop the VACUOUS `state` axis** | **SURVIVED**, as required | — proves the arms pin `conforms`, not `state` |

```text
TALLY: transcripts=6  killed=4  survived=2  invalid=0
CLEAN: every transcript well-formed, every outcome matches the manifest
```

**One tooling trap, mine, recorded because it nearly corrupted this campaign.** Re-running
it through a shell helper word-split `-t producer` into vitest's *file* filter list;
vitest then found no test files, exited 1, and `mutant-index` scored two neighbours as
KILLED — it refused the manifest, which is how I caught it. `--testNamePattern=producer`
is unambiguous and is what the filed transcripts use. A mutant campaign whose command
silently stops selecting tests reports every mutant dead.

## Suites — three runs each, worst run is the verdict

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `typecheck` | exit 0 | exit 0 | exit 0 | **PASS** |
| T9 unit + arch cluster | 83 passed (83) | 83 passed (83) | 83 passed (83) | **83/83** |
| `tests/integration/database.test.ts` | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | **1 failed / 84** |

The single database failure is `apps/runner — legal command lifecycle > claims, judges
through the HTTP gateway, propagates, serves, and settles`, identical across all three
runs, **pre-existing**, verified earlier by running it at a parent commit with this work
stashed. I make no blanket claim about anything else.

## Records at the filed tip

`stamp-check.sh` → final gates `records compared: 10 · failures: 0`; mutants
`records compared: 6 · failures: 0`. `cite-check.py` → `TOTAL 10 unique=10 problems=0`,
every anchor carrying `@29649564`.

## Still owed to V — one item, unchanged

**F-T9B-2 / the record correction.** `logs/s07` holds 30 transcripts, 24 mutants and 6
neighbours; "nineteen across five campaigns" is not derivable from them, and "admissible"
has two defensible readings because D42 postdates the campaigns it would judge. The six
transcripts THIS lane added are D42-conformant. Unchanged and on the V packet.

---

# T9B r1 — F-T9B-1 settled on V's THIRD mechanism. Nothing owed but the record correction

Lane @ **19fb7570**, clean. Nine first-parent commits from `9a3a5f60`; three added here:
`9fdf4b6a` (the ruled mechanism), the `.resolves` tightening, and the arm restorations.

**§§3 and the option-2 section above are superseded on their verdicts, not their evidence.**
Both mechanisms I was handed invented a way to END the answer — a fifth crash class, then a
hard refusal — and goal-v4 forbids both, because a run that reaches its round bound with the
evaluator still objecting **serves regardless**, carrying the objection as a visible mark.
The ruled mechanism uses the ladder the engine already has.

## What the chain does now

`packages/serve/src/index.ts`, anchors `  const citationTracingFailed = !finalCriteria.citationTracing;`
and `  const basisIsEmpty = WAYS_OF_KNOWING.every((way) => basis[way] === 0);`.

> **SUPERSEDED, twice, and corrected below — do not read the four bullets that follow as
> current.** N1 sweep, rework 1: the terminal claim is superseded by B2 (this case does NOT
> route through T13's limb; the two causes are separated), and the band claim is superseded by
> V's floor ruling (a value, not an absence). Both are described correctly in the rework-1
> section at the end of this file. They are kept because the evidence in this section — the
> RED log and the mutant kills — was taken against them.

- The run **SERVES**. `SYNTHESIS-OBJECTION-STANDING` is emitted exactly as before.
- ~~The terminal is DOWNGRADED — T13's honest downgrade, which S08 already built.~~
  Superseded: the terminal is DOWNGRADED, but by its OWN branch, not T13's REASONING-only
  limb, which requires a hypothesis and a research plan.
- `conforms` stays a live axis, so **no untraced citation reaches the basis**.
- ~~The basis is therefore empty; `deriveBandCeiling` refuses an empty basis by design, so no
  ceiling is derived and no band is claimed.~~ Superseded: the basis is empty, and
  `deriveBandCeiling` reports the register row's FLOOR band with the record built from the
  row entry naming it. Nothing is banded on rejected evidence, and nothing is left absent.
- The **label is untouched**. Confirm-item 3 rules that a standing round-3 objection does not
  move it, and it is code-derived from the propagated numbers before synthesis, acyclically.

No new terminal, no fifth crash class, the four-class enumeration unchanged, no goal
override. One additive live-trace token, `BAND_CEILING_UNBANDED`; nothing pins that
vocabulary as a closed set (checked — only `RETIRED_GATE_TRACE`, a different read
vocabulary, is asserted on, and only with `toContain`).

## RED and GREEN

  RED   `logs/s07/t9b-F1v3-RED-serve-mark-downgrade.log` — exit 1, the chain **REFUSED**:
        `Serialized Error: { code: 'SERVED_STATEMENT_CITES_NO_VERIFIED_NODE' }`.
  GREEN `logs/s07/t9b-FINAL-t9cluster-run{1,2,3}.log` — 83/83, three times.

## The all-untraced arm

`tests/unit/t12-t13-band-basis.test.ts`, anchor
`  it("serves an exhausted citation-tracing objection DOWNGRADED and marked, banding nothing", async () => {`.

It asserts through `.resolves.toMatchObject` rather than awaiting first — deliberately, and
D43 is the reason: the whole property is that this run does **not** end the answer, so a
regression makes the chain throw, and awaiting would surface that as an unhandled rejection
with no assertion frame. The mutant would then die of the system being loud instead of of
the assertion that owns the invariant. Measured both ways: before the change F1M2 and F1M3
were classified `THREW`; after it, `ASSERTION`.

It drives the **real `deriveBandCeiling`**, not a permissive double — a double returning
NOT_CAPPED would happily band an empty basis that production refuses (D35's shape). F1M3's
kill line proves the real one is in the path:
`promise rejected "TypedDomainError: No load-bearing node co… { code: …`.

And it carries a **contrast pair**: the same nodes and the same segments run with the
evaluator satisfied put both citations in the basis (`{ LOOKED_UP: 1, RAN: 0, REASONING: 1 }`).
Without it, "the basis contains no untraced citation" would be asserted against a basis that
was never computed — vacuous, D56's own shape.

## The three re-pins, reversed

I restored **both test files to their landed form at `6a0491f0` first**, then re-checked each
arm against the ruling rather than against my code.

| arm | outcome |
|---|---|
| `t09-synthesis` — former conformance gate | **back VERBATIM** into `nonCrashArms`, passing. DOWNGRADED satisfies "not COMPONENTS_ONLY". It had only ever been changed to accommodate the throw. |
| `serve-s05` — `servedDespiteUntracedCitation` | landed subject and citation-tracing objection **restored**; asserted terminal is DOWNGRADED, and the candidate supplies hypothesis + plan |
| `serve-s05` — the exhausted-loop case | same |

The `unsatisfied` helper's parameterisation is **reverted**; it hardcodes
`citationTracing: false` again, exactly as landed.

Two changes remain in those serve-s05 arms and **both are the ruling, not accommodation**:
the terminal is DOWNGRADED rather than SERVED, and the candidate has two segments because
the downgrade FORM requires a hypothesis and a research plan while the file's default
candidate has one. That second point is the one thing in this ruling I would flag for a
reader: **routing the all-untraced case into the downgrade limb inherits that limb's
two-segment precondition**, so a synthesizer that returns a single segment on a
tracing-failed round raises `COMPOSITION_CONTRACT_ERROR`. The synthesizer's own prompt asks
for two segments whenever the cited nodes rest on reasoning alone, so the production path is
consistent; I am naming it because it is a precondition the ruling did not have to consider
and a reviewer should see it stated rather than discover it.

## Campaign at the filed tip — eight mutants

`logs/s07/t9b-MUTANT-CAMPAIGN-INDEX.log`, manifest written first:

| mutant | target | outcome | first failing frame |
|---|---|---|---|
| B1M1 | role-equality predicate | KILLED | ambidextrous-artifact arm |
| B1M2 | ledger producer resolution | KILLED | same-run wrong-producer arm |
| B1M3 | the round inside the derived key | KILLED | wrong-round arm |
| B1N1 | NEIGHBOUR — error prose only | SURVIVED | — |
| F1M1 | revert the `conforms` axis | KILLED | `expected { terminal: 'SERVED', …} to match object { terminal: 'DOWNGRADED'…}` |
| F1M2 | regress the serve to the option-2 refusal | KILLED | `promise rejected "…A served statement must cite at least one conformance-verified node"` |
| F1M3 | band anyway on an empty basis | KILLED | `promise rejected "…No load-bearing node contributes to the ceiling"` |
| F1N1 | NEIGHBOUR — drop the VACUOUS `state` axis | SURVIVED | — proves the arms pin `conforms`, not `state` |

```text
TALLY: transcripts=8  killed=6  survived=2  invalid=0
CLEAN: every transcript well-formed, every outcome matches the manifest
```

**A tooling trap that cost me two false campaigns, root cause now known.** Twice a batch
reported every mutant KILLED including the neighbours, with `No test files found, exiting
with code 1` in each transcript. The cause is not vitest: **this shell is zsh, which does
not word-split unquoted parameter expansions**, so `$U` holding three paths — and earlier
`$4` holding `… -t producer` — arrived as ONE argument, a filter matching nothing. Passing
the paths literally fixes it. Both times the expected manifest is what caught it; a campaign
whose command silently stops selecting tests reports a perfect sweep.

## Suites — three runs each, worst run is the verdict

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `typecheck` | exit 0 | exit 0 | exit 0 | **PASS** |
| T9 unit + arch cluster | 83 passed (83) | 83 passed (83) | 83 passed (83) | **83/83** |
| `tests/integration/database.test.ts` | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | **1 failed / 84** |

The one database failure is `apps/runner — legal command lifecycle > claims, judges through
the HTTP gateway, propagates, serves, and settles`, identical across all three runs,
**pre-existing** — verified earlier by running it at a parent commit with this work stashed.
No blanket claim is made about anything else.

## Records

`stamp-check.sh` → final gates and all 8 mutant transcripts: `OK: every record stamps the
filed tip`. `cite-check.py` → `TOTAL 10 unique=10 problems=0`, every anchor at `@19fb7570`.

## Owed to V — one item

**F-T9B-2 / the record correction**, unchanged. `logs/s07` holds 30 pre-existing transcripts
(24 mutants, 6 neighbours); "nineteen across five campaigns" is not derivable from them, and
"admissible" has two defensible readings because D42 postdates the campaigns it would judge.
The **eight** transcripts this lane produced are D42-conformant and D43-credited.

---

# T9B r1 — the ratified outcome, implemented. B1, B2 and N1 closed

Lane @ **03308b0f**, clean. Ten first-parent commits from `9a3a5f60`.

**Superseding note.** The section above reported no band at all. V declined that: a consumer
must see a **value**, not an absence. Every earlier verdict in this filing is superseded on
its verdict and kept for its evidence.

## B1 — the band reports its FLOOR

`packages/serve/src/index.ts`, anchor `    const floorBand = bandOrder[0]!;`.

`deriveBandCeiling` used to throw `BAND_CEILING_BASIS_EMPTY` on an empty basis. It now returns
the **floor**: `bandOrder[0]` read from the **register row**, never a literal in this package
— DECISIONS J1 rules that a consumer carries no band value of its own, and the engine
vocabulary happens to be `ENGINE_BAND_ORDER = ["CAPPED", "FULL"]` in
`packages/register/src/engine-shape.ts`. The ceiling record carries the row's provenance and
the empty basis it was derived from. `kind` follows `validateBandCeilingDecision`'s own
invariant rather than being asserted, so a candidate already at the floor reports NOT_CAPPED
and stays there. The chain's "unbanded" skip and its trace token are gone: **the ceiling is
derived on every served path**.

## B2 — the two empty-cited-set causes no longer share a path

Anchor `  if (citationTracingFailed) {`.

`citedNodes.every(REASONING)` is vacuously true on an empty set, so "no verified cited node
because tracing failed" fell into T13's REASONING-only limb — right about the terminal, wrong
about the **form**, because that limb requires a hypothesis AND a research plan.

**My earlier flag was wrong in the direction the reviewer named.** I wrote that production was
consistent "because the prompt asks for two segments when cited nodes rest on reasoning
alone". My own re-pinned fixture cites a LOOKED_UP node, so one segment is squarely within the
contract, and that run crashed with `COMPOSITION_CONTRACT_ERROR` before any served result
carrying the mark existed. Serving after the round bound now works at **any segment count**:
the tracing-failed arm serves whatever was composed. Splitting one segment into a hypothesis
and a plan it does not contain would be fabrication, so the form is the composed statement
itself; the DOWNGRADED terminal, the standing-objection mark and the floor band are what say
the answer is weak and why.

The **label is untouched** — confirm-item 3 and the frozen S06 spec forbid a post-synthesis
objection reaching back into a pre-synthesis, code-derived value.

## RED and GREEN

  RED `logs/s07/t9b-F1v4-RED-floor-band-any-segment-count.log` — **two** failures, one per
      defect: the band was `null` where a floor was owed, and the one-segment run
      `promise rejected "TypedDomainError: A reasoning answer requ…" instead of resolving`.
  GREEN 85/85 on the T9 cluster, three runs.

Three arms carry it: the floor-band arm (with the contrast pair that keeps "no untraced
citation in the basis" falsifiable), the **any-segment-count** arm, and a **regression** arm
pinning that a genuinely reasoning-only VERIFIED cited set with one segment still raises
`COMPOSITION_CONTRACT_ERROR`.

## serve-s05 restored, again from the artifact

Restored to its landed form at `6a0491f0`, then re-checked. **The two-segment accommodation
is gone** — those arms run on the file's landed single-segment candidate. Two changes remain
and both are the ruling:

- the asserted terminal is DOWNGRADED;
- the file's `applyBandCeiling` double now **prints the basis it was handed**. It returned a
  fixed basis that was never read before, because the chain skipped the call whenever the
  basis was empty. `validateBandCeilingDecision` rightly refuses a decision reporting a basis
  it was not derived from — a real defect in the double, surfaced by deriving on every path.

## Campaign at the filed tip — ten mutants

| mutant | target | outcome |
|---|---|---|
| B1M1 · B1M2 · B1M3 | role equality · ledger resolution · round in the derived key | KILLED |
| B1N1 | NEIGHBOUR, error prose only | SURVIVED |
| F1M1 | revert the `conforms` axis | KILLED |
| F1M2 | bypass the tracing-failed split | KILLED |
| **F1M4** | **the floor band becomes an absence — V's rejected option** | KILLED |
| **F1M5** | **collapse the two causes back onto one path** | KILLED |
| **F1M6** | **drop the two-segment precondition** | KILLED, by the regression arm |
| F1N1 | NEIGHBOUR, drop the VACUOUS `state` axis | SURVIVED |

```text
TALLY: transcripts=10  killed=8  survived=2  invalid=0
CLEAN: every transcript well-formed, every outcome matches the manifest
```

F1M6 is the one that proves the regression arm is not decorative: it fails
`expected TypeError: Cannot read properties of unde… to match object { code: 'COMPOSITION…'`.

## N1 — the unreproducible figure, corrected at both sites

The report said the band-basis file was "**19 passed (19)**, was 20 before the retirement".
The 19 is vitest's. **The 20 was inferred — 19 plus the one I retired — and it is not
obtainable**, because the file does not compile against this lane's chain at S08's tip, so no
suite ever counted it. Corrected in place at line ~424, and the class-sweep arm count at line
~226 corrected the same way: it was pattern-matched from source at a tree where the file did
not compile.

Stated plainly because it is the same defect class in my own tooling: a regex over `it(`
**also matches the retired assertion's name quoted inside the retirement comment**, and mine
did — it reported 20 for a file vitest counts as 22. Only vitest's count is used now, and
only at tips where the file runs.

## Suites — three runs each, worst run is the verdict

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `typecheck` | exit 0 | exit 0 | exit 0 | **PASS** |
| T9 unit + arch cluster | 85 passed (85) | 85 passed (85) | 85 passed (85) | **85/85** |
| `tests/integration/database.test.ts` | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | **1 failed / 84** |

The one database failure is `apps/runner — legal command lifecycle > claims, judges through
the HTTP gateway, propagates, serves, and settles`, identical across all three runs and
**pre-existing** — verified earlier by running it at a parent commit with this work stashed.

## Records

`stamp-check.sh` → final gates and all 10 mutant transcripts: `OK: every record stamps the
filed tip`. `cite-check.py` → `TOTAL 12 unique=12 problems=0`, every anchor at `@03308b0f`.

## Owed to V — one item

**F-T9B-2 / the record correction**, unchanged: `logs/s07` holds 30 pre-existing transcripts
and "nineteen across five campaigns" is not derivable from them. The **ten** transcripts this
lane produced are D42-conformant and D43-credited.

---

# T9B rework 1 of 3 — codex r3's blocking finding closed; one residue FILED, not taken

Lane @ **79f10701**, clean. Eleven first-parent commits from `9a3a5f60`.
Marker below reads **rework 1/3**: the reviewer routed this to V, but the ticket and my own
marker both read `rework 0/3`, so rounds remain and this is a worker round.

## The finding, and why it was right

The band VALUE was correct — `bandOrder[0]`, `CAPPED` on the shipped row. The RECORD beside
it was not. I took `defaultCeiling`, ignored its `ceilingBand`, and copied its label and lift
path. On the shipped row those describe a different decision:

```text
defaultCeiling : label DEFAULT_CEILING · ceilingBand FULL   · liftPath "retain-band"
cuts[0]        : label REASONING_CEILING · ceilingBand CAPPED · liftPath "gather-evidence-to-lift"
```

So a floored answer persisted `confidenceBand: CAPPED` beside a record named
`DEFAULT_CEILING` whose lift path said the band had been **retained**. It had been lowered.

## The fix

The entry is **selected from the row by the band it actually names** — cuts first,
`defaultCeiling` last — and the record is built from that entry. Anchor
`      .find((entry) => entry.ceilingBand === floorBand);`.

**Both row-membership obligations are honoured, and one of them by construction:**

- the **label** is checked against `ceilingLabels`, exactly as the ordinary derivation does.
  Skipping it on this route alone would accept an inconsistent sealed row that every other
  route rejects, because `devRunnerPolicySchema` only checks these strings are non-empty.
- the **band** half has no separate check, deliberately. The entry is *found* by
  `ceilingBand === bandOrder[0]`, so an `includes` afterwards could never fail. I wrote that
  check, saw it could not refuse, and removed it — a check that cannot fail for the reason it
  exists is not a check (D56). This is the fourth D56 instance in my own work this lane, and
  the first I caught before it shipped.

**Fails closed:** a row with no entry naming its own floor band raises
`BAND_CEILING_FLOOR_UNDESCRIBED` rather than inventing a label.

**Both refusals are exercised**, because a check nobody has seen refuse is not known to be
one: a floor entry carrying a label absent from `ceilingLabels`, and a row where no entry
names the floor band.

**The tests now pin the WHOLE ceiling record** — label, liftPath, basis, registerRowKey,
registerVersion, sourceRef — not just the band. Pinning the band alone is precisely what let
the mismatched record reach review.

  RED `logs/s07/t9b-r1-RED-ceiling-record-misdescribes.log`:
```text
-     "label": "TEST_REASONING_CEILING",
-     "liftPath": "test-layer:gather-evidence-to-lift",
+     "label": "TEST_DEFAULT_CEILING",
+     "liftPath": "test-layer:retain-band",
```

## F-T9B-3 — the residue, filed and NOT taken

On the shipped row the only entry naming the floor is `REASONING_CEILING`. Its band and lift
path are both right for this case; its **name** describes a reasoning-share trigger that did
not fire, because the basis is empty rather than reasoning-heavy. **The row conflates an
entry's trigger with its outcome**, so no selection over the existing entries can be truthful
about the reason — I checked both, and both misdescribe.

Curing it needs an explicit empty-basis entry in the sealed row. That is a register-shape
change: an optional field would move `packages/serve` (type), `apps/runner/dev-runner-policy`
(schema), `apps/runner/dev-deployment-register` (seed) and, if ever required rather than
optional, `acceptance/runtime-policy` and `acceptance/seed-register` — **two schemas and two
seeders**. The mission's slice map makes **S01/T16 sole owner of every new sealed row, schema
and migration**, and my ticket forbids widening T9's scope. So it is filed rather than taken.

What ships instead is strictly better than what was found and honest about its limit: the
outright contradiction is gone (no "retain-band" beside a lowered band), the lift path is
truthful and actionable, the band and label are both row-derived and validated, and the
remaining imprecision is named in the code at the site.

*(Measured, not assumed: the acceptance harness never sets `citationTracing` false, so it
never reaches this route — which is why an optional field would leave it untouched.)*

## N1 sweep — superseded mechanisms removed

Source comments describing the two superseded mechanisms are corrected: the
"`deriveBandCeiling` refuses an empty basis by design … NO BAND IS CLAIMED" paragraph in the
band-basis arm, and the "there is no unbanded path" note in the chain. The campaign manifest's
per-mutant descriptions are rewritten, and the obsolete `F1M3` transcript — whose target
(`basisIsEmpty`) no longer exists — is removed rather than left to rot. Re-swept: no source
file still names a superseded mechanism.

## Campaign at the filed tip — twelve mutants

| mutant | target | outcome |
|---|---|---|
| B1M1 · B1M2 · B1M3 | role equality · ledger resolution · round in the derived key | KILLED |
| F1M1 · F1M2 | the `conforms` axis · the tracing-failed split | KILLED |
| F1M4 · F1M5 · F1M6 | the floor band · the two-cause split · the two-segment precondition | KILLED |
| **F1M7** | **build the floor record from the entry that does NOT name the floor band — the exact r3 defect** | KILLED |
| **F1M8** | **drop the label-membership validation on the floor route** | KILLED, by the new refusal arm |
| B1N1 · F1N1 | NEIGHBOURS — error prose only · drop the VACUOUS `state` axis | SURVIVED, as required |

```text
TALLY: transcripts=12  killed=10  survived=2  invalid=0
CLEAN: every transcript well-formed, every outcome matches the manifest
```

## Suites — three runs each, worst run is the verdict

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `typecheck` | exit 0 | exit 0 | exit 0 | **PASS** |
| T9 unit + arch cluster | 87 passed (87) | 87 passed (87) | 87 passed (87) | **87/87** |
| `tests/integration/database.test.ts` | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | **1 failed / 84** |

The one database failure is `apps/runner — legal command lifecycle > claims, judges through
the HTTP gateway, propagates, serves, and settles`, identical across all three runs and
pre-existing — verified earlier at a parent commit with this work stashed.

## Records

`stamp-check.sh` → final gates and all 12 mutant transcripts: `OK: every record stamps the
filed tip`. `cite-check.py` → `TOTAL 13 unique=13 problems=0`, every anchor at `@79f10701`.

## Owed to V — two items, both filed

- **F-T9B-3** — the sealed ceiling row cannot describe an empty-basis floor; needs an S01/T16
  row entry. Above.
- **F-T9B-2** — the pre-existing mutant-count correction, unchanged. The **twelve** transcripts
  this lane produced are D42-conformant and D43-credited.

---

# T9B rework 1 — codex r4's two record corrections. No product change

Lane @ **b0591d9b**, clean. Twelve first-parent commits from `9a3a5f60`.
**No product code, no schema, no mechanism changed in this round** — the only `.ts` edits are
comments, and every gate and mutant was re-taken at the new tip because the tree hash moved.

## N2 — the deleted transcript is restored, byte-exact

Removing `F1M3` from the *current* manifest and glob was right: its target
(`const basisIsEmpty = …`) no longer exists, so it cannot be re-run and would have made the
index unreproducible. **Deleting the standalone transcript was wrong**, and the rule is one I
had already seen applied twice on this mission — T3C moved 22 superseded records rather than
deleting them, S08 kept its whole pre-merge set. Capture-before-destroy applies to a seat's
own obsolete evidence, and my cumulative filing still credits F1M3.

Recovered from the reviewer-visible launch log, which had captured the file verbatim:

```text
sed -n '9322,9479p' logs/s07/codex-t9b2-launch.log > <the restored transcript>
```

**The recovery is byte-exact, not a paraphrase**: the launch log records the original as
`158 18393` (lines, bytes) on the line above the captured content, and the restored file
measures 158 lines and 18393 bytes. All eight custody lines survive — `GATE pre/applied/restored`,
`sha BEFORE/AFTER`, `HASHES MATCH`, `EXIT`, closing porcelain.

Filed as, deliberately outside the current prefix:

```text
logs/s07/SUPERSEDED-2026-09-03-at-19fb7570--mut-F1M3.run.log          (the transcript, untouched)
logs/s07/SUPERSEDED-2026-09-03-at-19fb7570--mut-F1M3.provenance.txt   (why it exists, how to check it)
```

The filename carries the tip it was originally filed at, `19fb7570`. **The transcript's own
bytes are not annotated** — a header would have broken the byte-exact match and touched a
`mutate.sh`-emitted record, so the provenance lives in a sidecar carrying its sha256. Verified
that neither current tool picks it up: `stamp-check.sh` still reports `records compared: 12`,
and `mutant-index.py` still reports 12 transcripts and `CLEAN`.

## N1 — the sweep, done properly, with the command

My earlier sweep matched only band-vocabulary phrases (`unbanded`, `no band claimed`) and so
could not see mechanism claims. The command actually used this time:

```text
PAT='empty-basis guard (refuses|below)|refuses loudly|loud refusal|hard refusal|
     T13.s (own )?honest downgrade|hypothesis \+ research plan|no band is claimed|
     refuses an empty basis by design'
grep -rnE "$PAT" --include='*.ts' packages/ apps/ tests/ acceptance/
grep -nE  "$PAT" agent-reports/s07-synthesis.md agent-reports/s07-synthesis-self.md
```

Three sites, one per surface, all corrected:

| surface | what it still said | now |
|---|---|---|
| `packages/serve/src/index.ts` | a failed tracing criterion "empties the cited set and the empty-basis guard below **refuses loudly**" | that case is separated at `citationTracingFailed`, serves, and reports the floor band; the guard's own input — citing nothing while tracing SUCCEEDED — is named |
| `tests/unit/t12-t13-band-basis.test.ts` | the terminal is "**T13's own honest downgrade**" | the ladder's floor, explicitly NOT T13's REASONING-only limb, since collapsing the two is the B2 defect |
| the filing | the option-2 section's four "what the chain does now" bullets, written as current | two struck through with inline corrections, plus a heading banner marking the section superseded |

**One hit examined and deliberately left**: `packages/serve/src/index.ts` line ~834 names
"T13's honest downgrade" inside S08's own comment about which set decides the FORM. That limb
exists and still governs a VERIFIED reasoning-only cited set, so the sentence is true. Checked
rather than pattern-matched away.

Re-swept after the edits: no source or test file still describes a superseded mechanism, and
the only remaining matches in the filing are struck-through text and the sweep's own
description of what it removed.

## Suites and records at the filed tip

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `typecheck` | exit 0 | exit 0 | exit 0 | **PASS** |
| T9 unit + arch cluster | 87 passed (87) | 87 passed (87) | 87 passed (87) | **87/87** |
| `tests/integration/database.test.ts` | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | **1 failed / 84** |

The one failure is `apps/runner — legal command lifecycle > claims, judges through the HTTP
gateway, propagates, serves, and settles`, identical across all three runs and pre-existing —
verified earlier at a parent commit with this work stashed.

Campaign re-run at this tip: `transcripts=12 killed=10 survived=2 invalid=0`, `CLEAN`, both
neighbours surviving. `stamp-check.sh` → gates and all 12 transcripts `OK: every record stamps
the filed tip`. `cite-check.py` → `TOTAL 13 unique=13 problems=0` at `@b0591d9b`.

## Owed to V — two filed findings, no open work

- **F-T9B-3** — the sealed ceiling row cannot describe an empty-basis floor. Needs an S01/T16
  row entry; not T9's to take.
- **F-T9B-2** — the pre-existing mutant-count correction, unchanged.

---

# T9B — merge of integration 58c4715e. BLOCKED on a cross-lane collision

Lane @ **e9b46023** (merge commit, parents `b0591d9b` + `58c4715e`), clean.
**I am stopping here rather than resolving it.** The merge breaks a landed T9 assertion, and
the only two ways to make it green are to weaken that assertion or to revert a landed S09
line. Both are forbidden to me; the choice is V's.

## F-T9B-4 (BLOCKING) — the envelope terminal is re-coupled to restatement status

The frozen goal, verified this session (sha256 `78238eeb…`), goal lines 248–251:

> R9 restatement … → evaluator-objection criterion. The envelope terminal's
> protectedCoreVerified guard … keyed on R9's gate-hood and is KNOWINGLY RETIRED with it:
> **the envelope terminal fires on HARD_STOP whenever no served statement exists yet,
> independent of restatement status**

S09's T17B added a restatement condition to the envelope-exhausted catch in the runner —
anchor `        if (exhausted.kind !== "HARD_STOP" || servedRoot.restatementStatus !== "PASS") throw error;`.
With it, an exhausted envelope whose restatement FAILED no longer takes the envelope terminal;
it rethrows, and the run dies inside the budget guard instead of producing the disclosed
components-only answer.

**Measured, three runs, at the merged tip:**

```text
tests/integration/database.test.ts   2 failed | 82 passed (84)   ×3, identical
  × apps/runner — legal command lifecycle > F4 persists the retired-guard disclosure as a
    visible mark when the envelope stops a FAILED restatement
    TypedDomainError: Run … exhausted its pinned computed structural ceiling
      ❯ BudgetRepository.assertModelAttemptAllowed packages/budget/src/index.ts:408:13
  × apps/runner — legal command lifecycle > claims, judges … serves, and settles   (PRE-EXISTING)
```

**Cause isolated, not inferred** — `logs/s07/t9b-DIAGNOSTIC-f4-cause-isolation.run.log`, a
custody-clean `tools/mutate.sh` transcript. Removing exactly `|| servedRoot.restatementStatus
!== "PASS"` and nothing else:

```text
✓ F4 persists the retired-guard disclosure as a visible mark when the envelope stops a FAILED restatement
  Tests  1 passed | 83 skipped (84)      EXIT = 0      HASHES MATCH
```

So the collision is that one clause, and it is between two landed lanes:

| | |
|---|---|
| **T9 (this lane)** | F4 retires the protected-core guard *with* R9, per goal 248–251. Landed assertions in `t09-synthesis.test.ts` (`createEnvelopeExhaustedResult` with `protectedCoreRestatement: "FAIL"`) and in `database.test.ts` (the F4 lifecycle arm now failing). |
| **S09/T17B (landed, judge PASS, merged at 152ed7ed)** | the catch must not mint an envelope terminal for a run whose restatement failed. |

**Neither is weakened by me.** I did not touch my F4 assertion and I did not revert S09's line.
I searched `DECISIONS.md` for a ruling reconciling them — `T17B`, `restatementStatus`,
`protectedCore`, `retired guard`, `F4` — and found none: the T17B verdict records zero blocking
findings and does not mention the retired guard, so this collision was not seen by either
review.

**The conflict was positional, which is why nothing caught it earlier.** My lane never touched
that region since `19bbb4c4`; git conflicted on line position and I resolved as theirs, which
was right for the text and is exactly how two correct changes become one wrong behaviour.

### Two resolutions, costed, not chosen

1. **The goal clause governs** → drop `|| servedRoot.restatementStatus !== "PASS"` from the
   catch. F4 passes (proved above). Cost: S09's stated intent at that site is lost, and their
   sibling site — the post-serve `finalEnvelopeDecision` block, which carried
   `restatementStatus === "PASS"` *before* T17B — would still disagree with the goal, so the
   inconsistency moves rather than closes.
2. **S09's boundary governs** → the goal clause is overridden and T9's F4 assertions are
   retired on the record. Cost: a frozen-goal override, which is V's alone, and F4's
   `PROTECTED-CORE-GUARD-RETIRED` mark becomes unreachable on the runner path — it would then
   be minted by no production route, which is worth checking before choosing.

I have not implemented either.

## What the merge itself did, and the read-point audit

One conflict, resolved as theirs (my lane had no competing change). Then, per the two cautions
— overlap is not the measure, and a shared reader can gain a required row no gate sees:

- `tests/support/discoveredPanel.ts` — `fixtureStructuralCeiling`, which **both** of my new
  database fixtures call for `envelopeBasis`, gained required members. My fixtures call the
  helper rather than hand-building the object, so they inherit them. **This is the coupling
  that would have bitten**: the file is not one I edit, so a file-overlap check would have
  passed over it.
- `readEnvelopeFormulaInputs` — a genuinely new required sealed row on a shared policy reader.
  Read only by `acceptance/runtime-policy.ts`, **not** by `dev-runner-policy.ts` which my
  lane's runner path uses; and the row is seeded through T16's own `ENVELOPE_FORMULA_ROW_KEYS`
  in `algorithm-policy.ts`, not the acceptance or dev seeders I first grepped and found empty.
  Checked to the seeding site rather than concluded from the empty grep.
- `evaluateEnvelope` gained `pendingModelAttempts` defaulting to 0, so existing callers keep
  J28's comparison.
- `pnpm-lock.yaml` and `packages/contract` unchanged → neither `pnpm install --frozen-lockfile`
  nor `generate:contract` is triggered. `package.json` gained one script (`eval:roles`).

## Gates at the merged tip — three runs each

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `typecheck` | exit 0 | exit 0 | exit 0 | **PASS** |
| T9 unit + arch cluster | 87 passed (87) | 87 passed (87) | 87 passed (87) | **87/87** |
| `tests/integration/database.test.ts` | 2 failed \| 82 passed (84) | 2 failed \| 82 passed (84) | 2 failed \| 82 passed (84) | **2 failed / 84 — one NEW** |

Of the two database failures, `claims, judges through the HTTP gateway…` is the pre-existing
one this lane has reported throughout; **`F4 persists the retired-guard disclosure…` is new at
this merge** and is F-T9B-4.

## Records

Gates and the diagnostic stamp the merged tip: `stamp-check.sh` → `records compared: 10 ·
failures: 0` and the diagnostic `OK`. `cite-check.py` → `TOTAL 15 unique=15 problems=0` at
`@e9b46023`.

**The 12 mutant transcripts still stamp `b0591d9b`, deliberately.** Either resolution above
changes the tip, so re-running the campaign now would produce evidence at a tip that cannot be
final — the stale-provenance waste D27, D41 and D53 each rule against. They are re-taken once
F-T9B-4 is ruled, and that is the only work this lane has left.

## Owed to V — three findings, no open work in my hands

- **F-T9B-4** — above. Blocking; gates the merge-out and therefore the closing run.
- **F-T9B-3** — the sealed ceiling row cannot describe an empty-basis floor (S01/T16 owns it).
- **F-T9B-2** — the pre-existing mutant-count correction.

---

# T9B — F-T9B-4 RETRACTED. The merge is repaired; the lane is clean

Lane @ **6a57a998**, clean. Fourteen first-parent commits from `9a3a5f60`.

## F-T9B-4 was mine, not a collision

**Retracted in full. It needs no ruling and there is nothing for V.** I filed it as a
contradiction between T9's F4 and S09's T17B. It was neither: the conjunct is pre-existing,
my own lane had deleted it as F4's charge, and my own merge resolution put it back.

Counted from the blobs — `restatementStatus !== "PASS"` in `apps/runner/src/index.ts`:

```text
1c9578a   (mission baseline)   1     PRE-EXISTING, from an August reorganization
19bbb4c4  (merge-base)         1
58c4715e  (integration)        1     T17B did NOT add it
b0591d9b  (my pre-merge tip)   0     MY LANE DELETED IT — F4, goal 248-251
e9b46023  (my merge)           1     my resolution reinstated it
```

My own diff `19bbb4c4..b0591d9b` carries the deletion at the line the conflict covered. So my
merge-commit sentence *"my lane had no competing change"* was false.

**Why I missed it, because the shape is worth keeping.** T17B genuinely rewrote that block for
its J28 boundary, so git raised a REAL conflict and the incoming side looked authored and
deliberate — it was. **I had a DELETION, and a deletion is the hardest change to defend in a
merge: its evidence is absence.** You read the incoming hunk, it is correct on its own terms,
and nothing on screen stands for the line you had removed. Taking theirs is safe only when your
side changed nothing, and confirming that means reading your own diff rather than your memory
of it. This is the mirror of "a clean auto-merge is the case to check" — a real conflict
resolved without checking my own side.

## The repair

Both changes are orthogonal and both stand. T17B's `evaluateEnvelope(1)` — "may this run spend
ANOTHER attempt?" — is kept verbatim; F4 removes a guard from the answer:

```ts
if (exhausted.kind !== "HARD_STOP") throw error;
```

with a comment at the site naming goal 248–251 and why the two are independent.

## Class sweep — a reported instance is a sample

Counted per tip rather than eyeballed, because the finding named one line and the class is
"F4 deletions the merge reinstated":

| symbol | my tip | merged | after repair |
|---|---|---|---|
| `restatementStatus !== "PASS"` (the guard) | 0 | 1 | **0** |
| `restatementStatus === "PASS"` (my F4 **disclosure** ternary, not a guard) | 2 | 2 | 2 |
| `protectedCoreVerified` | 0 | 0 | 0 — stays retired |
| `conformanceBound` / `conformanceContractHash` / `conformanceRawArtifactRefs` / `buildRepairPacket` | 4/3/5/2 | 4/3/5/2 | unchanged |

**My first sweep was the unreliable one and I checked it rather than filing from it.** A crude
substring pass reported 11 reinstated lines; 10 were artifacts of matching short generic lines
(`providerRef: primaryMaker.providerRef,`, `const packet: PromptPacket = { messages: [`)
anywhere in a 4,000-line file. The line-level diff of my tip against the merged tip, restricted
to these symbols, returns **exactly one** line. One real member.

## Gates at the repaired tip — three runs each

| cluster | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `typecheck` | exit 0 | exit 0 | exit 0 | **PASS** |
| T9 unit + arch cluster | 87 passed (87) | 87 passed (87) | 87 passed (87) | **87/87** |
| `tests/integration/database.test.ts` | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | 1 failed \| 83 passed (84) | **1 failed / 84** |

The count is back to one, and **F4 passes**. The remaining failure is
`apps/runner — legal command lifecycle > claims, judges through the HTTP gateway, propagates,
serves, and settles`, identical across all three runs and pre-existing — the same one this lane
has reported throughout, verified earlier at a parent commit with this work stashed.

## Campaign and records, all re-taken at the repaired tip

```text
TALLY: transcripts=12  killed=10  survived=2  invalid=0
CLEAN: every transcript well-formed, every outcome matches the manifest
```

Both neighbours survived. `stamp-check.sh` → gates and all 12 transcripts `OK: every record
stamps the filed tip`. `cite-check.py` → `TOTAL 15 unique=15 problems=0` at `@6a57a998`.

Holding the transcripts through the blocked round was right: they would have been filed at
`e9b46023`, a tip that could not be final.

## Owed to V — two findings, both filed, no open work

- **F-T9B-3** — the sealed ceiling row cannot describe an empty-basis floor; S01/T16 owns it.
- **F-T9B-2** — the pre-existing mutant-count correction.

**F-T9B-4 is withdrawn.**
