# Self-report — CODE-REV-S01-C1C2, round 1 (blind per-cluster code review, mission `consent-ui`)

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

**Seat:** CODE-REV-S01-C1C2 · reviewer · claude-opus-5, fresh blind session · ticket `t_c7a758f6`
**Under review:** CODE-S01-C1C2, `t_8d084df2`, `91a090ea` (C1) + `87b50e1e` (C2) on `slice/consent-s01`
**Worktree:** `.worktrees/rev-s01-c1c2/dialectical-engine`, detached at `87b50e1e`, porcelain 0 at entry and at exit
**Verdict:** PASS with five findings (0 blocking, 5 non-blocking)

## 0. The one-line verdict

The code is right; the *guard around it* is not. Both cluster commands are verdict 0 on the worst
of three runs in both shell environments, every constant re-derives from the design, and the
twelve strings deep-equal the design decoded. The five findings are all about the **predicate and
the perimeter**, not the implementation — and the sharpest one is that `CMD-C2` returns **verdict=0
with a live TS2322 sitting in the file the cluster exists to create**.

## 1. What worked — copy these verbatim

1. **The author's handoff was auditable line by line.** Every number in it (`Tests 2 failed | 7
   passed (9)`, hit list 1, 8 pinned diagnostics, 17/17, ADR terms 1 and 4, the four contrast
   ratios) reproduced *exactly* on my first attempt. Zero minutes lost reconciling. A handoff that
   survives a hostile re-run costs the author ~10 minutes and saves the reviewer an hour.
2. **The author disclosed its own two soft spots** (the typecheck hole, the `essential: false`
   judgement call) instead of burying them. Both turned out to be real, and both were already
   half-solved when I got there. **Disclosure is cheaper than detection — for the fleet, not just
   for the author.** The `essential: false` disclosure is what let the orchestrator rule *before*
   my session started, which is why my probe P3 is a one-line control rather than a round of argument.
3. **`COMMON.md` §10.16's dual-environment rule earned its keep in reverse:** I ran both commands
   from a `.sh` under `/bin/bash` *and* inline, and got identical verdicts, 6 runs per cluster. That
   is the first mission where the rule produced *no* discrepancy — which is itself the finding: the
   ASCII-anchoring discipline in `CMD-C1`/`CMD-C2` works. Stop re-litigating it.
4. **Re-deriving constants by EXECUTING the design instead of reading it.** I loaded
   `design-data.js` into a `new Function` and called the design's own `tint()` and `mkCat()`. That
   turned "do these ten values match?" from an eyeball diff into a machine comparison, and it
   caught the one thing an eyeball would have mis-filed: the design's `tint()` emits `0.28` and the
   SPEC mandates `.28`, so a naive string diff reports four DRIFTs that are not drifts. **Probe cost:
   ~8 minutes. It also validated `locked`/`defaultOn` against `mkCat`'s positional `(on, locked)`
   arguments, which no shipped test does.**

## 2. What cost tokens, with the price

| # | Cause | Price | Fix |
|---|---|---|---|
| 1 | **A reviewer probe cannot live in `.review-scratch/`.** My packet's `allowed` list names `.review-scratch/` as the place for scratch; `vitest.config.ts`'s `include` is `tests/**`, so the probe returned `No test files found, exiting with code 1`. | ~1 round-trip + one wasted vitest boot | The packet should say: *a probe that must be RUN goes to `tests/render/zz-<seat>-probe.test.tsx`, untracked, deleted before handoff; `.review-scratch/` is for files you only read.* Two clauses, zero ambiguity. |
| 2 | **Two `git diff --stat` pathspec misses.** The git root is one level above the repo root, so paths in `git diff --name-only` come back as `dialectical-engine/apps/...`, but a pathspec is resolved relative to `cwd`. My first no-touch check used `-- dialectical-engine/apps/api/` from *inside* `dialectical-engine/` and returned empty — **which reads exactly like "untouched".** | ~1 round-trip; nearly a false "verified" | Never verify a negative with a pathspec. `git diff --name-only <range>` with **no** pathspec, then `grep` the list. That is what I re-ran, and it is what §10.19's "prove it ran" law means for path filters. Appended to TOOLING-TRAPS. |
| 3 | **The PLAN is 1193 lines and the two clusters I own occupy 90 of them.** I spent a `grep -n` pass building a map before I could read anything. | ~1 round-trip | The review packet should carry the same `path:a-b` line ranges §10.5 already demands for product files — `PLAN.md:199-287` (steps) and `PLAN.md:653-700` (the two commands) would have replaced the map entirely. |
| 4 | **The SPEC is 784 lines and I read all of it**, because C1/C2 touch R01–R05, R08, R16, R21, R24, R25, R28 — nine requirements scattered across six sections. | the single largest read of the session | Not a defect. But the SPEC trace table at `PLAN.md:107-134` maps R-id → cluster and I found it *after* reading the SPEC. **Put the cluster's R-id list in the review packet's §1**, next to the commits. |

## 3. What I nearly got wrong

1. **I nearly filed the four token values as a DRIFT finding.** My derivation probe printed
   `DRIFT --ok-soft  design tint() T=rgba(62,122,78,0.28)  shipped css T=rgba(62,122,78,.28)` — four
   times. The design's JS template literal renders the number `.28` as `0.28`; SPEC R24 and PLAN
   S01-S01 both explicitly mandate the leading-dot form, and `.28 === 0.28`. **A string diff against
   a source that is executed, not read, will always disagree on numeric formatting.** I caught it
   because the probe printed both sides rather than a boolean. *Print both sides. Always.*
2. **I nearly accepted "the vitest arm catches type errors anyway."** My first blind-spot mutant
   (`decidedAt: Date.now()`) *was* caught — by the runtime ISO regex, not by any typecheck. Had I
   stopped there I would have reported the hole as theoretical. The second mutant — an exported
   helper nothing calls, which is exactly what C5's future wiring looks like — escaped **all three
   arms** and left `CMD-C2` at verdict=0. **One mutant is an anecdote; the second mutant is the finding.**
3. **I nearly rated the predicate gap (N1) as blocking.** It is a GDPR consent record and
   `readConsent()` accepts a malformed timestamp. What stopped me: nothing but this module writes
   the key (the ADR's own last consequence says so), so no product path reaches it, and every hook
   the frozen SPEC states is satisfied. **Blocking is about reachability, not about how bad the
   sentence sounds.**

## 4. Turning this into more of a one-prompt machine

1. **The single highest-leverage change: make every cluster command self-testing in the failure
   direction, automatically.** §10.16(c) already asks the author to *state* the mutant per term.
   Ask for one more thing that costs nothing: **a `--selftest` mode on each `CMD-Cn` script that
   applies its own declared mutants and asserts the verdict flips.** `CMD-C2` would have failed its
   own self-test at the typecheck term on day one, and the hole would have been a packet edit
   instead of two seats and a review round.
2. **A guard must never read the path it guards from the document that is wrong about the path.**
   The author found this and it deserves promotion to COMMON: `CMD-C2` does `cat <literal path>`,
   and `PLAN.md:1102` still names a *different*, unnumbered ADR file. A seat that took §DDD's name
   would have written `ADR-consent-storage-contract.md`, and `n_adrst` would have been 0 — caught,
   yes, but only by luck of which term failed. **Deliverable paths belong in exactly one place per
   mission, and every other mention is a pointer to it.**
3. **`COMMON.md` §10.30 is right and its scope is off by one cluster.** It installs the `apps/ui`
   typecheck arm "from C3 on". I measured C2 already affected. **Rule to generalise: when a finding
   installs a new arm, its scope is "every cluster whose deliverable the old arm could not see",
   computed by `tsc --listFiles`, never by cluster number.** One command decides it; a guessed
   number needs a correction later, which is what happened.
4. **Give the reviewer the author's `SKILLS LOADED` grep result, not the claim.** §10.9 makes the
   orchestrator grep the transcript body; `heartbeat-reviewer` §5 makes me check the line. I can
   check the line's *shape* (it is correct and both conditional floor skills are declared in
   §10.9's honest form) but I cannot see another seat's transcript. **Either hand the reviewer the
   grep output in the review packet, or stop asking the reviewer to verify it.** Today the duty is
   assigned to someone who structurally cannot discharge it, and the honest answer is `UNVERIFIED`.
5. **Blindness held, and it was cheap.** Separate worktree, no contact, no other lens's verdict
   read. The one thing that would have made it cheaper: the review packet naming the *baseline*
   figures it expects me to reproduce (`Tests 2 failed | 6 passed (8)` at base) so I do not have to
   go to `BASELINE.md` for them mid-run.

## 5. Dead ends — do not re-derive these

- **`.review-scratch/` cannot host a runnable test.** See §2.1. Use `tests/render/zz-*.test.tsx`.
- **`grep -c 'ADR-0021' docs/architecture/01-decisions/README.md` = 0 is not a bug in my grep.** The
  ADR register genuinely does not list the file. Confirmed by `ls` — 19 ADR files, 18 register rows.
- **The `--scrim`/z-index values are not pinned to the design by any shipped test**, and that is
  *declared* at `PLAN.md:1115` as S01-S01's known non-catch. I proved it (REV mutant C1-b: `--scrim`
  drifted to `.62` in CSS *and* map → `CMD-C1` verdict=0) and then verified the shipped values by
  hand against `turn-10-cookie-consent.html:49` and SPEC R08. **Do not re-file this as a finding —
  V acceptance steps 6 and 13 cover both behaviourally.**
- **The composite-contrast ratios are not the author's arithmetic.** I recomputed all four from
  scratch in Python with my own WCAG 2.2 implementation: 4.743 / 4.833 / 4.246 / 7.171, and the two
  composited surfaces `#EFECE7` / `#2A251F`. Exact to three decimals. Settled.
- **The new test file does not leak `debateai.consent`.** Run in both orderings against
  `auth-flow-integration.test.tsx` in one worker: `Test Files 2 passed (2)`, `Tests 23 passed (23)`
  both ways. Settled; do not re-measure.

## 6. Where THIS packet was unclear, exactly

1. **§2 orders me to "render the component in jsdom yourself with a throwaway test … and assert the
   SPEC's verbatim copy and both-mode token usage".** C1 and C2 create **no component** — C1 is CSS
   plus a test file, C2 is a `.ts` module plus a test file plus an ADR. The charge is copied from a
   generic per-cluster review template and is unsatisfiable for this cluster pair. Same for
   "a11y claims (roles, focus, Esc) probed, not read" — C1/C2 make no a11y claim. **I answered both
   as `NOT APPLICABLE — no component in C1/C2`, and substituted a jsdom probe of the token blocks
   plus my own SPEC-property suite.** A per-cluster packet should carry only the charges its cluster
   can answer; two unanswerable charges make a reviewer wonder what it missed.
2. **§2's "re-run the author's mutants" is expensive and mostly redundant.** The author ran 13
   (9 caught, 4 correctly not caught) with verbatim output. Re-running all 13 would have cost more
   than the review. I re-ran the two that carry load — the both-places-agreed value drift (C1-b) and
   the entry-point divergence, via my P-suite — and built four of my own instead. **Say "re-run the
   mutants whose result you would not predict, and add your own" rather than "re-run the mutants".**
3. **The packet's §4 gives me the ORCHESTRATOR RULING on the R03/R01 question and asks me to judge
   the implementation against it — good — but does not say who owns the SPEC edit if the answer is
   "yes, a V row".** I have written the row's text into the verdict; naming the owner would have
   saved a round-trip. (It is REQ-01's, via a `SPEC-v4`, or V's directly.)

## 7. The finding I did not expect

`CMD-C2` — the cluster's *only* verification command — returns **verdict=0** with
`lib/consent.ts(202,3): error TS2322: Type 'boolean' is not assignable to type 'string'` present in
the file the cluster exists to produce. Not a hypothesis: measured, both arms printed side by side,
in `probes/code-rev-s01-c1c2-r1-typecheck-blindspot.sh`.

The mechanism is subtle enough that it fooled a well-built guard: root `tsconfig.json` **excludes**
`apps/ui`, but `exclude` only prunes the `include` glob — it does not prune the *transitive import
graph*. So 17 `apps/ui/lib/*.ts` files are still pulled in by `tests/**/*.ts` importers, the arm
reports a healthy "0 diagnostics outside the pin", and the hole is invisible to inspection.
`apps/ui/lib/consent.ts` is not among the 17 **only because its sole importer is a `.tsx` file**,
and `include` takes `tests/**/*.ts`.

**Generalisation worth banking: a coverage claim about a typechecker is not readable off its config.
`tsc --listFiles | grep -c <deliverable>` is one command and it is the only honest answer.** Every
mission that has ever written "typecheck is green" without it has been guessing.

## 8. What I did not verify, stated so the next lens knows the gap

- **The author's `SKILLS LOADED` line against its transcript.** The line's shape is correct and both
  conditional floor skills carry §10.9's honest form. I cannot read another seat's transcript;
  §10.9 assigns that grep to the orchestrator. `UNVERIFIED` by me, by construction.
- **That the RED frames were WATCHED in the order claimed.** I verified each RED's *premise* is real
  (`tests/support/contrast.ts:3-5` does throw on `rgba(`; the module genuinely did not exist), but a
  commit history cannot prove the order of a live session.
- **Anything jsdom cannot compute:** stacking order for the five z-tokens, real-bundle module
  identity for the preference store, and whether a decision survives in React state after a refused
  write. All three are already routed to V acceptance (steps 13, 9-10) and named in the PLAN.

## 9. Cost

Wall clock ~55 minutes. 12 cluster-command runs (3 script + 3 inline per cluster), 4 mutants of my
own, 1 seven-case probe suite, 2 leakage runs, 1 independent contrast recomputation, 1 design-execution
derivation. Two round-trips lost to §2's items 1 and 2. Zero rework of my own findings.
