# ARCH-REV(S03) — pass 3 of 3 (SCOPED, THE CAP) · blind re-review of `PLAN(S03)` Revision 3 · seat ARCH-REV-S03 · ticket `t_3fe3198c`

**Verdict: PASS (pass 3 of 3).** Zero blocking findings, six non-blocking (N1-p3 … N6-p3), two packet
defects recorded. **B1-p2 is closed in content by all four remedies.** `## 9. Rows for V` is **empty**:
nothing here needs V's ruling.

**The two answers the packet demands (charge 7):**
- **(i) `S03-C3` CAN start on Revision 3 the moment BUILD(S03-C1) lands**, and `S03-C4` after C1 + C3.
  One clause should ride into C3's packet with it (N5-p3).
- **(ii) Revision 3 DOES change what a running seat must build — for C1, in three places; for C2, in
  none.** Because the BUILD packets were cut at the same freeze as Revision 3 (`b6ecee09`), a seat
  launched at this dispatch already reads Revision 3, so the only live item is **N2-p3**, an
  unsatisfiable Done-when clause in S1 that needs an immediate ticket comment to BUILD(S03-C1). Details
  in §7.

- Reviewed at main-tree freeze `b6ecee09` (record `9b8dc138..b6ecee09`). **I ran no `vitest`/`pnpm`
  command in the lane**: BUILD(S03-C1) `t_77c0cb5f` and BUILD(S03-C2) `t_6a2ba493` are live there.
  At my CLAIM the lane read `9a000c37`, 0 dirty, `git log 9a000c37..HEAD` empty — the seats had not yet
  written — and I treated it as live regardless. Product lines read `git show 9a000c37:./<path>`.
- New probes (`p3-` prefix): `p3-surfaces-myrun.log` · `p3-mutant/PLAN.md` + `p3-mutant-run.log` ·
  `p3-marker-writes.mjs` + `.log` · `p3-trace2.log` · `p3-sweep.log`.

---

## 1. Charge 1 — the ARCH-FIX packet, the counts, the anchors

| Claim | Measured | Verdict |
|---|---|---|
| PLAN.md 1239 lines | `wc -l` → **1239** | OK |
| the seat's self-report 143 | `wc -l ARCH-FIX-S03-p3.md` → **143** | OK |
| DECISIONS 570 | `wc -l` → **573** | see N6-p3 — `570` is the last line of the pass-3 rulings, not the file length |
| SPEC-v3.md untouched | `git diff 76ccb043 -- …/SPEC-v3.md` → **empty** | OK |
| the seat wrote only PLAN.md, DECISIONS.md, its self-report, its scratch dir | `git diff --stat 9b8dc138..b6ecee09` → those three; the BUILD packets, launch scripts, `watchdog.paths`, LEDGER, COMMON and this packet are the orchestrator's | OK — `allowed` respected |
| **the four frozen anchors + S18** | **S1 98 ✓ · S14 279 ✓ · S16 309 ✓ · S17 330 ✓ · S18 363 ✓** (and `## 2.` 859, `## 7.` 1190, S10 221, S21 462, S23 552) | **OK — the running BUILD packets' Revision-2 anchors still resolve** |

The line-count constraint held by compressing the Revision 2 header block by exactly the 19 lines
Revision 3 adds — treating the header as a fixed-height region. The technique is sound and worth keeping.
**Revision 2's record is recoverable**: DECISIONS `:433` carries its rulings (pass 2, `t_f14aab0f`) and
`:504` the pass-3 block, and the Revision 3 line points a reader there and to that pass's handoff — but
the plan *alone* no longer lists which steps Revision 2 changed (N6-p3).

The two packet defects the seat raised against the orchestrator (the header-vs-anchors conflict; "S18
moved" presupposing contiguity) are **recorded, not re-litigated**, as charged.

## 2. Charge 6 — no cluster command was run, and the one changed number is derived

C2, C3 and C4's commands are unchanged at Revision 3; **C1's changed** (it dropped
`tests/architecture/dev-deployment-register.test.ts`). I derived its new base from my own pass-2
measurements rather than running anything, and it agrees **three independent ways**:

| Source | Value |
|---|---|
| my pass-2 `p2-c1.log` (C1 at Revision 2) | `Test Files 3 passed (3)` · `Tests 8 passed (8)` |
| the removed suite, counted at base (`git show 9a000c37:./tests/architecture/dev-deployment-register.test.ts \| grep -c '  it('`) | **3** cases in **1** file |
| arithmetic | 3 − 1 = **2 files**, 8 − 3 = **5 tests** |
| the plan's C1 row and the seat's `c-base-rev3.log` | `Test Files 2 passed (2)` · `Tests 5 passed (5)` · rc=0 |

**Agreed, zero disagreements.** No `vitest` ran in the lane this pass. Nothing is UNVERIFIED as a result:
the only number that moved is the one above, and it is derivable exactly.

## 3. Charge 2 — B1-p2's closure, remedy by remedy

**(a) `surfaces.mjs`, re-run by me on Revision 3:** exit 0, and byte-identical to the seat's `surfaces.log`.

```
S03-C1 (18 paths)  S03-C2 (5)  S03-C3 (24)  S03-C4 (5)
path-shaped tokens seen in a Files paragraph : 123
  CAPTURED as declared writes                : 78
  CLASSIFIED as citations (reviewed)         : 45
  UNCLASSIFIED (must be 0)                   : 0
none — every file sits in exactly one cluster            PASS
```

`123 = 78 + 45 + 0` ✓, counts 18/5/24/5 ✓, disjoint ✓. **The mutant run is N1-p3 — §6.**

**The ten candidates, judged one by one.** I agree with the seat on **all ten**; every one is prose, and
I read the sentence each sits in:

| # | Step | Path | The sentence | My judgement |
|---|---|---|---|---|
| 1 | S7 | `packages/db` | ADR-0024 §3's pattern "already blessed for `packages/db`" | citation ✓ |
| 2 | S8 | `../generated/plan-tier-rosters.js` | an import specifier, not a repo path | citation ✓ |
| 3 | S12 | `config/` | "a `config/` directory does not exist today" | citation ✓ |
| 4 | S12 | `tests/architecture/model-config-no-secret.test.ts` | "Done when: … passes" — S6 creates it, same cluster | citation ✓ |
| 5 | S17 | `apps/api` | "`apps/api` must not import … from `apps/runner`" | citation ✓ |
| 6 | S17 | `apps/runner` | the same sentence | citation ✓ |
| 7 | S21 | `package.json` | the three CLIs' suites "assert only their `package.json` script string" — the seat notes capturing it would have raised a false C1/C3 clash, which is right | citation ✓ |
| 8 | S27 | `.local/` | the key file's directory, read at run time, never written by a seat | citation ✓ |
| 9 | S32 | `apps/runner/src/dev-provider-panel.ts` | "went to five slots in `6a05a0d0`" | citation ✓ |
| 10 | S33 | `tests/integration/dev-api-environment.test.ts` | "every suite importing it (…)" — C3's via S28 anyway | citation ✓ |

**Can the step-keyed table wave a genuine write through?** **YES — measured, not argued. See N1-p3 (§6).**
The seat rejected a global allow-list for exactly this reason and the step-keyed table has the same hole
one scope down.

**(b) S10 `:221-232`.** Its Files line is now `Modify: \`package.json\`, \`tests/architecture/tier01-roster.test.ts\` (the first is the repo root's)` — re-punctuated on its own line, walk no longer stops, and
`tier01-roster.test.ts` is C1-owned via S9. The ordering case survives intact: *"a source-text assertion
that `generate:contract`'s value has `generate-plan-tier-rosters` at a lower index than
`packages/contract/src/generate.ts`"* ✓. **Does C1's row state `tier01-roster` 1/1 → 2/2? NO — it does
not, and that is N3-p3.**

**(c) S21 `:462-551`.** `tests/architecture/dev-deployment-register.test.ts` is in its Files line
(`:468`) with the `:14` update named and quoted correctly against the lane. That updated `:14` is also
N2-p2's measurement that `dev-deployment-register-cli.ts` passes its new argument ✓. The ONE source-text
case over all four CLIs is placed in `tests/architecture/dev-real-provider-only.test.ts` — **C3-owned
(S34) and in C3's command**, both measured ✓. **Its expected text for the fourth CLI is wrong — N4-p3.**

**(d) The single writer.** `grep` over `## 1. Steps` for `tests/architecture/dev-deployment-register.test.ts`:
**exactly one `Files —` line names it — S21's, at `:468`.** S10's remaining mention (`:228`) is prose
("never in `dev-deployment-register.test.ts`, which C3 owns"). The other hits (`:554`, `:756`, `:771`)
are `tests/**integration**/dev-deployment-register.test.ts` — a different file. **Single writer settled:
C3.** ✓

## 4. Charge 3 — the N-p2 folds

| Fold | Check | Verdict |
|---|---|---|
| **N1-p2** | S21's criterion drives the module-private predicate through `assembleDevelopmentApiEnvironment` (`:409`) and asserts the outcome (`DEV_API_ENVIRONMENT_DRIFT` + a byte-identical file). The module's three exports (`:29`, `:73`, `:409`) are re-measured and correct, so no export is widened ✓. §7's `S21 (Rev 3)` row now distinguishes "ignores its parameter" from "keeps a module-level DEFAULT" and names the source-text case for the latter ✓ | retired — **but see N5-p3** |
| **N2-p2** | the updated `:14`, plus the four-CLI case | retired (N4-p3 refines it) |
| **N3-p2** | C3's row `:874` names the AFTER set by title — exactly the two `register-support-publication` titles, `dev-provider-panel`'s gone — and states the criterion a BUILD seat can apply: *"A seat reading `3 failed` after C3 is RED, whichever title remains: if (1) survives, S32 is unfinished; if a `register-support-publication` title count rises, S23's digest sweep is unfinished."* | **retired, and it is applicable as written** |
| **N4-p2** | C3's row: nine in the command, eight in the surface, `dev-runner-provider-set.test.ts` run-but-not-written with the reason; C2's row the same for `provider.test.ts` | retired |
| **N6-p2** | S1 declares `pnpm-lock.yaml` (tracked — `git ls-files` ✓); `pnpm-workspace.yaml` correctly NOT written — I read it at base: `:2` `"apps/*"`, `:3` `"packages/*"`, so the new package is already globbed ✓ | **the declaration is right; the Done-when clause is not — N2-p3** |

**Is N1-p2's outcome reachable, or does the first predicate absorb it?** Reachable — but **only if the
case holds every other `api.env` key equal**. Walking the `:493` chain: `publishExactFile` compares bytes
(`:268`), then the closure runs `isExactProviderRuntimeRefresh` **first**; that predicate compares every
key except the two JSON ones, so if the case lets `REGISTER_VERSION` (or any other key) differ, it
returns `false` for **both** the honest build and the ignores-its-parameter build, all four predicates
fail, `DEV_API_ENVIRONMENT_DRIFT` is thrown for the wrong reason and the case passes vacuously. Held
equal, the ignoring build parses the outgoing targets against the static set, succeeds, returns `true`,
reuses the file, and the case fails as intended. **S21's text does not state the equal-keys condition —
N5-p3.** S28 names this exact trap for itself; S21's new case needs the mirror clause.

## 5. Charges 4 & 5 — predictions scored, trace, sweep, banned words

**My pass-3 predictions:**
1. *"If ARCH-FIX fixes only the C3 row and not `surfaces.mjs`, the fix will silently revert."* —
   **Answered: the script WAS fixed**, and it is what produces the column, so no revert. But the
   guarantee I wanted from that fix does not hold (N1-p3), in a form I did not predict.
2. *"The assertion will probably surface one or two MORE declared writes."* — **MISS.** Zero new declared
   writes; ten candidates, all genuine citations, and I independently agree with all ten. Worth recording
   as a clean miss — and the instrument could not have settled it anyway, since a path cited in the same
   step is invisible to it (§6).
3. *"S28 remains sound and keeps attracting attention it does not need."* — **HIT**; untouched this
   revision, unchanged in the diff.

**Trace on Revision 3** (`trace2.mjs`, mine): **R1..R33 33/33 · S1..S36 36/36 declared and
reverse-traced · true orphans none · the same 32 asymmetries**, unchanged. **Citations** (`sweep.mjs`):
95 checked, **OUT OF RANGE = 0** — N1's class has not crept back with the new S21 lines. **Banned words:
zero** in any step or criterion (the five hits are the law's own statement at `:34-36`) and **zero** in
the pass-3 rulings `:504-570`. **§7's rows for S10 and S21 refute rather than restate** — the
`S21 (Rev 3)` row is the sharpest in the table, naming precisely what its case does *not* catch.

## 6. Non-blocking findings

**N1-p3 — the completeness assertion does not detect the defect it was built for.** (`surfaces.mjs`, the
`CITATIONS` table at `:28`, consumed at `:141` `const cited = new Set(CITATIONS.get('S'+n))`.)
I ran the mandated mutant: a scratch copy of PLAN.md with S10's Revision-2 parenthetical restored. The
marker-walk drops `tests/architecture/dev-deployment-register.test.ts` exactly as it did at pass 2, and
the assertion reports:

```
   CAPTURED as declared writes        : 77      (was 78)
   CLASSIFIED as citations (reviewed) : 46      (was 45)
   UNCLASSIFIED (must be 0)           : 0
PASS   — exit 0
```

The dropped write did not become unclassified: it fell into the citation table, because Revision 3's S10
*legitimately cites* that path in prose. **A path cited in a step's prose is permanently immune to
drop-detection in that step, and S10 is exactly such a step.** The table is keyed on identity
`(step, path)`; the rule it needs to express is about ROLE (declared on a marker line vs cited in prose).
The seat rejected a global allow-list for this very reason; the step-keyed table has the same hole one
scope down. My `p3-marker-writes.mjs` checks the role and catches the mutant in one line.
**Blast radius: none today.** I verified Revision 3's content independently of the seat's script — 78
declaration-line path tokens, zero dropped declared writes (the two flags, `apps/*` and `packages/*`,
are `pnpm-workspace.yaml` globs and genuine citations). **Fix before the next Files-line edit**, and until
then the script's `PASS` is not evidence about completeness. Not a V row: no product question.

**N2-p3 — LIVE: S1's Done-when is unsatisfiable while C1 and C2 share the lane.** (`PLAN.md:98-109`.)
*"after `pnpm install`, `git status --porcelain` lists exactly the paths in `S03-C1`'s column and no
others."* BUILD(S03-C1) and BUILD(S03-C2) are running **in the same worktree on the same branch**, so
C2's files (`packages/providers/src/index.ts`, `apps/api/src/provider-discovery.ts` and its two new
suites) sit in that porcelain output and cannot be removed by C1. A C1 seat can never satisfy the clause
as written. The packet already carries the one-clause fix: **"…lists no path outside `S03-C1`'s column
that was clean before the install."** **This needs an immediate ticket comment to `t_77c0cb5f`, not a V
row and not a review cycle** — it is the one sentence of Revision 3 a running seat is currently blocked by.

**N3-p3 — S10's relocation takes `tier01-roster.test.ts` to 2/2, and three places still say 1/1.**
S10 (`:227-229`) adds *"a NEW case in that same C1-owned suite"*. But §5's verification row (`:1054`)
reads `| tests/architecture/tier01-roster.test.ts | 1/1 | **1/1**, ids and expectations per S9 |`;
S9 (`:216`) says it *"**stays 1/1**"*; and **frozen SPEC-v3 R27 says "Stays 1/1."** R27 permits a delta
only if *"the delta is named here"* — and it is named nowhere. A BUILD seat will produce 2/2 and a REV
lens reading §5 will score it a regression. Fix: §5's row → **2/2**, S9's sentence reconciled, and the
delta named explicitly against R27 so the frozen table's expectation is not silently contradicted.

**N4-p3 — the four-CLI case mis-describes its fourth member.** S21 (`:482-483`) adds one case asserting
*"each of the four CLI sources contains its **two-argument** call text"*. Measured at base:
`dev-provider-set-publish-cli.ts:18` is `const providerPanel = developmentConfiguredProviderPanel();` — a
**zero**-argument call to a **different function**, which S21 takes to `developmentConfiguredProviderPanel(config)`,
i.e. **one** argument (S23 separately gives that CLI `planTierRosters` through
`publishDevelopmentDeploymentRegisterProviderSet({…})`). So for one of its four members the expected
assertion text is both unnamed and mis-described, and two seats would write two different strings.

**N5-p3 — S21's N1-p2 case can pass for the wrong reason.** (`:517-524`; analysis in §4.) The case must
state that the outgoing and incoming environments **agree on every key except
`PROVIDER_DISCOVERY_TARGETS_JSON`**; otherwise `isExactProviderRuntimeRefresh` refuses on
`REGISTER_VERSION` first and the drift is observed for the wrong reason, so the case no longer
distinguishes the honest build from the one that ignores its new parameter. **This clause should ride
into C3's BUILD packet** (see §7(i)).

**N6-p3 — two record-keeping residues.** DECISIONS.md measures **573** lines where the handoff says 570
(570 is the last line of the pass-3 ruling block, not the file length) — a label, not an error. And the
compressed Revision 2 header means the plan *alone* no longer lists which steps Revision 2 changed; it is
recoverable from DECISIONS `:433-503` and that pass's handoff, and the Revision 3 line says so, but a
reader with only the file loses it.

## 7. Charge 7 — the two rulings, explicitly

**(i) `S03-C3` can start on Revision 3 the moment BUILD(S03-C1) lands.** Its surface is settled and
disjoint (24 paths, single writer for the contested file), its command and base verdict are unchanged and
independently confirmed at pass 2 (`3 failed | 67 passed (70)`), its AFTER set is named by title, and its
dependency (`S03-C1`, for `loadModelConfig`) is the only thing it waits on. **`S03-C4` after C1 + C3**, as
its row states. Two clauses should be folded into C3's packet rather than discovered by its seat: **N5-p3**
(the equal-keys condition on S21's drift case) and **N4-p3** (the fourth CLI's assertion text).

**(ii) Revision 3 changes what BUILD(S03-C1) must build, in three places; BUILD(S03-C2), in none.**
Diffing `e0230656..b6ecee09` over PLAN.md, the changes inside S1–S17 and the C1/C2 rows are:

| Sentence a running C1 seat must re-read | Where |
|---|---|
| S1's Files line — `Modify: pnpm-lock.yaml` is now a **declared write**, and root `package.json` is no longer S1's (S10 owns it); `pnpm-workspace.yaml` is measured NOT written | `:99-103` |
| S1's Done-when — the new `pnpm install` / `git status --porcelain` clause | `:105-109` — **and it is unsatisfiable as written: N2-p3** |
| S10's Files line and its ordering case — the case now goes in `tests/architecture/tier01-roster.test.ts`, **never** in `dev-deployment-register.test.ts`, which is C3's | `:222`, `:227-229` |
| C1's row — command dropped a suite; base verdict `2 files / 5 tests`; column **18 paths** | `:872` |

**S14, S16, S17 and C2's row are byte-unchanged**, so BUILD(S03-C2) has nothing to re-read. Because both
BUILD packets were cut at freeze `b6ecee09` — the same commit as Revision 3 — a seat launched at this
dispatch already reads these, so nothing above is a surprise to them **except N2-p3**, which is a defect
of Revision 3 itself and needs the one-clause correction now.

## 8. What I verified and did not find

The remedies are correct where it counts, and I attacked each: the single writer is settled and grepped;
the `:14` assertion text is quoted correctly against the lane; the four-CLI case lands in a C3-owned file
that C3's command runs; `pnpm-workspace.yaml:2-3` really does glob `packages/*`, so not writing it is
right; the anchors held so the live packets still resolve; the trace, the citations and the banned-word
scan are all clean; and C1's changed base number is exact. I found **no** step two seats would build
differently on the product, **no** trace gap, and **no** cluster command blind to its own mutant.

## 9. Rows for V

**None.** Every finding above has an engineering answer with a known fix and no contested product
question. Escalating any of them would spend V's attention on work the orchestrator can fold in a
comment — and N2-p3 in particular needs a ticket comment *now*, which is faster than any ruling.

## 10. Predictions

If anything bites this slice after here, I predict it is **N2-p3 reaching BUILD(S03-C1) before the fold
does** — it is the only finding with a live seat standing on it. Second, I expect **N3-p3's 1/1 vs 2/2**
to be discovered at `REV(S03)` as a "regression" in `tier01-roster.test.ts` and to cost a round-trip
unless §5's row is corrected first. Third, I expect the next plan in this fleet to re-introduce N1-p3's
class in a new guard, because the lesson is counter-intuitive: a checker is not evidence until it has been
watched failing.
