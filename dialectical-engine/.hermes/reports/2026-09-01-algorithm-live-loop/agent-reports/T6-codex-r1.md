CODEX REVIEW T6 r1 — CHANGES · comments read through: t06-r1-2026-09-01

# T6 Codex peer review — whole lane r1+r2

VERDICT: **REWORK** — 3 blocking findings, 1 non-blocking finding. The next worker
round is rework 2 of 3; every finding below requires a routed fix.

Reviewed base `7433be75ef2da9ccca452c067fdac4cded07dece`, worker tip
`11a3499f816d94bb8450379dd46d23431ff22f90`, the nine-file `+802/-42` diff, worker
report and self-report, goal-v4 lines 160–168, J14/D16, the T6 dispatch packet, and the
T6 board ticket. Static only, as dispatched.

## Findings

### B1 — the XOR makes cardinality strict but still permits fabricated reasons

**Files/lines:** `migrations/0053_t06_review_outcome_disclosure.sql:29-40`,
`packages/contract/src/index.ts:516,528-537`, `packages/serve/src/index.ts:819-825,864-893`,
`apps/runner/src/index.ts:861-892`, `tests/integration/database.test.ts:2512-2521,2569-2588`.

**Concrete failure:** the fixture first proves its hidden node has a successful stored
`cannot-assess` review (`database.test.ts:2512-2521`). The database probe then uses that same
`hiddenNodeId` and expects `terminal_transport_outcome='FAILED', review_outcome=NULL` to be
accepted (`:2569-2580`). That accepted row says a successful review died in transport. It is
the fabrication the design says is unspellable.

M9 rejects only one encoding of the lie: naming both `FAILED` and `cannot-assess`. The writer,
contract, and CHECK enforce "one non-null field", but none ties the selected branch to the
actual `ledger.node_review` row. Two more false states remain legal:

- A class-H/D record with `reviewOutcome: "agree"` or `"dispute"`, no transport outcome,
  passes the contract enum, writer XOR, and SQL CHECK even though both outcomes seed judged
  standing.
- A class-H/D record with `terminalTransportOutcome: "FAILED"`, no review outcome, passes for
  a node whose review actually landed. The new DDL test affirmatively demonstrates this arm.

Catch-up compounds the problem: `disclosureFields` accepts either shape by nullness alone, and
`unjudgedDisclosure` treats *any* non-null review outcome as `cannot-assess`, emitting prose
that the review "returned cannot-assess" even for stored `agree`/`dispute`.

**Required fix:** make the reason a truth-bound discriminated branch. At minimum, the review
branch must admit only `cannot-assess` at contract, writer, catch-up, and SQL layers. To support
the report's stronger "names the stored outcome" claim, persist a node-review reference (or
equivalent database-enforced provenance) and verify subject/outcome identity; otherwise the
transport-only accepted arm remains a writable lie. Add negative probes for `agree`,
`dispute`, a transport reason on the successful-review node, and catch-up of each malformed
shape. M8/M9 remain useful but are not sufficient.

### B2 — the dispatched upstream report fails its marker/SHA integrity contract

**Files/lines:** `packets/t06-codex-r1.md:12-14`, `packets/t06-teeth.md:34-45`,
`agent-reports/t06-teeth.md:1-2,501-504`.

**Concrete failure:** the review packet asserts that `t06-teeth.md` has the marker on line 1
and a plain-shasum SHA on line 2. The artifact is 504 lines, starts with `# T6 TEETH r1` plus a
blank line, contains no `report sha256` or reproducing command anywhere, and places the current
r2 marker at line 504. A marker/SHA consumer therefore reads a heading and blank value and
cannot authenticate or even machine-select the current handoff.

The dispatch packet is internally inconsistent too: it requires the `# T6 TEETH r1` heading,
says the marker is first, and says the marker is last. This is a packet defect against the
orchestrator as well as an unmet worker handoff requirement.

**Required fix:** issue one unambiguous marker/hash scheme, lint it before dispatch, and file a
rework artifact that conforms. Do not describe the marker/SHA as present until the literal
line check and reproducing hash command agree.

### B3 — the claimed grep-based mutant restores have no filed transcripts

**Files/lines:** `agent-reports/t06-teeth.md:442-447`,
`agent-reports/t06-teeth-self.md:169-192,269-277`, and the four
`logs/t06/r2-mutant-M{8,9,11,10-neighbour}.log` artifacts.

**Concrete failure:** the report says every r2 mutant restore was verified by grepping an
introduced token, and the self-report says that grep is "in the log." A search across the
entire T6 log directory found no file containing `grep`, `git status`, `porcelain`, `restore`,
or `restored`. Each mutant artifact ends at the Vitest duration line; none records a restore
command, token, count, or post-restore content hash. The requested two-transcript spot-check is
therefore CANNOT-ASSESS.

The final worktree is clean, and the distinct M11-fail → M10-pass sequence is indirect evidence
that at least that restore occurred. Neither proves the report's stronger per-mutant grep claim,
especially after this round's documented loss of uncommitted files behind clean porcelain.

**Required fix:** rerun the relevant mutants or otherwise produce admissible evidence, with
one transcript per mutant containing apply token, observed discriminating result, restore,
post-restore token grep, and final content hash. Correct the report's "in the log" claim if no
such historical artifact exists.

### N1 — the cannot-assess class-D twin has no production-seam discriminating arm

**Files/lines:** `apps/runner/src/index.ts:2599-2628,2729-2745`,
`tests/integration/t06-review-teeth-database.test.ts:178-195`,
`tests/integration/database.test.ts:2422-2623`, `agent-reports/t06-teeth.md:456-461`.

**Concrete failure:** the direct standing test proves a cannot-assess node can become class D,
and the production test proves a cannot-assess class-H record/catch-up path. No production test
observes a `DERIVED-STANDING-UNREVIEWED` record whose reason branch is `review_outcome`, so a
mutant that filters review-outcome disclosures out of `classDReviewRecords` leaves all new J14
production assertions and the existing transport-only class-D tests green while restoring the
class-D silence F-T6-4 says was fixed.

**Required fix:** add one production-seam cannot-assess class-D arm asserting mark, record,
`review_outcome='cannot-assess'`, null transport outcome, positive basis count, inclusion in
the served number, and catch-up readability. Demonstrate that removing only this route turns
the arm red.

## Packet audit

- The reviewer packet's base, tip, board round, absolute paths, writable files, and nine-file
  diff resolve and agree with the tree. Its allowed list covers both mandatory reviewer files.
- The worker packet's absolute working directory exists. Its base and quoted `s04.ts`
  `applyDeclaredDisagreement` seam resolve.
- PD-1 is real and already adjudicated by J14: the `:408-417` judgement anchor was stale while
  the named symbol/site was correct. No duplicate product finding is opened here.
- The report marker/SHA description is false and is B2.

## Static verification and refutation

**Core r1.** `readReviewedNodeIds` now positively enumerates `agree` and `dispute`; the separate
`readDisputedNodeIds` feeds `applyDeclaredDisagreement` after reviews land. The all-agree arm
returns unchanged, and the evaluator profiler file has no diff. The recorded RED→GREEN summaries
are, verbatim:

```text
      Tests  3 failed | 1 passed (4)
      Tests  4 passed (4)
      Tests  1 failed | 65 skipped (66)
      Tests  1 passed | 65 skipped (66)
```

The standing consequence claim is statically correct: a transport-dead review contributes no
row, while a landed `cannot-assess` row is excluded from the reviewed seed set; both therefore
enter the same `projectJudgedStanding` class sets. The runner merges both disclosure sources
before class-H/class-D selection. This differs from PANEL-PARTIAL, where surviving versus zero
panel voices changes the consequence, not just its reason.

**J14 RED split.** `r2-red-both.log` contains two independent frames rather than one
short-circuited assertion:

```text
 FAIL  tests/integration/database.test.ts > apps/runner — legal command lifecycle > T6/J14 discloses the cannot-assess hidden route with the review outcome in place of a transport outcome
 FAIL  tests/integration/database.test.ts > apps/runner — legal command lifecycle > T6/J14 the review-catch-up lane reads the cannot-assess disclosure instead of stopping on it
      Tests  2 failed | 66 skipped (68)
```

The later focused green evidence has three successful runs (`r2-green1`, `r2-green2`,
`r2-green4`); `r2-green3` failed on the admitted wrong answer-version FK and is not counted as
green evidence. M8 and M9 each produced `2 failed | 66 skipped (68)` at the writer guard. B1
explains the fabrication classes those mutants miss.

**Migration validation.** The new CHECK is added without `NOT VALID`; PostgreSQL therefore
validates legacy rows while adding it and aborts on any row naming neither reason. That is an
adequate loud validation treatment. Actual deployed legacy contents were not inspected because
this seat is static-only.

**Untouched guards.** `git diff --quiet 7433be7..HEAD` returned exit 0 independently for the
evaluator file, kernel file, and both UI surface directories. Therefore `CONDITION_MARKS`, its
positional tail, evaluator-profiler vocabulary, and UI label switches are untouched; the
one-line `ui-census` change only completes the widened strict record fixture.

**D16.** The recorded base/HEAD artifacts are byte-identical by SHA-256:

```text
6729556094431e66e106dbe8c340436ed2b15bdaf6bd0593e45559108c26f1e9  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t06/r2-d16-ui-head.log
6729556094431e66e106dbe8c340436ed2b15bdaf6bd0593e45559108c26f1e9  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t06/r2-d16-ui-base.log
7692c06ab0582cb9f020d3fcc53338d9ab7d3cb72ac2287b72ea37b6a3075670  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t06/r2-d16-web-head.log
7692c06ab0582cb9f020d3fcc53338d9ab7d3cb72ac2287b72ea37b6a3075670  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t06/r2-d16-web-base.log
```

Each pair contains only its stated `layout.tsx(3,8) TS2882` globals.css error.

**Zone and ruling citations.** Sorting each zone log's six `FAIL` lines produced the same hash
three times:

```text
5be90ae494d87011507c2d8fee0858df73e27e95d077aa737be4b667fbd076d2  -
5be90ae494d87011507c2d8fee0858df73e27e95d077aa737be4b667fbd076d2  -
5be90ae494d87011507c2d8fee0858df73e27e95d077aa737be4b667fbd076d2  -
```

Each log reports `6 failed | 205 passed (211)`. J14 explicitly classifies the lifecycle failure
as row 9, so the report's row-9 citation is accurate. F-T6-5 accurately describes the current
two-array seam and immediate merge; it is an architectural note, not a present behavior bug.

## Not verified

Per packet, I ran no tests, builds, typechecks, migrations, or provider/database calls. I did
not validate the live legacy-row population, rerun the full suite, reclassify the six zone
failures against base, or recover nonexistent mutant-restore transcripts. Those gaps are not
silently promoted to evidence.

## PREDICTIONS

Other lenses will likely approve the XOR after checking only its four nullness combinations,
miss that the accepted transport-only probe already lies about the fixture's successful review,
and treat copying the three-value outcome vocabulary as compliance with the do-not-tidy guard.
I predict at least one lens will independently flag the missing class-D production arm, while
most will trust the narrative grep-restoration claim without finding an actual transcript; the
first checks I would compare are their treatment of `database.test.ts:2580`, whether they demand
reason-to-ledger provenance, and whether they noticed the marker/SHA constant is false.
