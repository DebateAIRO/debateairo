# Self-report — CODE-REV-S02-C3C4, round 1 (mission `consent-ui`)

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

Seat: blind per-cluster code review of CODE-S02-C3C4 (`t_126a42a2`), commits `0928c38c` (C3)
and `fb44696d` (C4). Worktree `.worktrees/rev-s02-c3c4/dialectical-engine`, detached at
`fb44696d`, `git status --porcelain` = 0 at CLAIM and 0 at exit.

---

## 1. The cause, not the symptom

**The most expensive thing in this cluster set was not a defect in the code. It was that the
one line of code the packet singled out for scrutiny — the B1 settled-value guard — is a
correct fix to half of a two-half problem, and NOTHING in the mission's artefacts models the
other half.** The author wrote the guard exactly as ordered, declared honestly that C4 cannot
prove it, and moved on. The PLAN's C7 row lists "the acknowledgement setting the DOM but not
the R17 mirror, so `Create account` never enables" as a mutant C7 must catch — and that mutant
is not a hypothetical a C7 seat might introduce. **It is the measured, unavoidable behaviour of
the code as shipped**, the moment any C7 handler calls `preventDefault()` on a click at that
input. React's `inputValueTracking` records the in-flight `true` during the cancelled click;
jsdom then reverts the DOM to `false`; the tracker and the DOM are now desynchronised, and the
NEXT genuine click fires no `onChange` at all.

Cost of finding it: ~25 minutes and three probe files. Cost of NOT finding it: a C7 seat would
have written its row handler, watched `Create account` never enable, and spent a full rework
round debugging its own handler — which is not where the bug is.

**Upgrade:** when a requirements or architecture seat pins an implementation shape (R17 pinned
uncontrolled-inputs + `onChange` mirror, and it was right to), the probe that proved the shape
must also be run **against the NEXT cluster's forces**, not only against the current one.
REQ-REV-01's `b2-idiom-matrix.mjs` measured four idioms against a component with no
`preventDefault` anywhere. One more row — "and now cancel the click, as C7 must" — would have
surfaced this three seats earlier, before any code was written.

## 2. What repeatedly cost tokens

**2.1 · `vitest.config.ts`'s `include` does not cover a reviewer's scratch directory. (~8 min,
1 dead run.)** `pnpm exec vitest run .review-scratch/rev-probes.test.tsx` returns
`No test files found, exiting with code 1` — indistinguishable, at a glance, from the RED a
missing module produces (COMMON §10.17's exact classification problem, from the other side).
Every reviewer seat in this mission that builds its own jsdom probe will hit this and re-derive
the same 24-line config file. **Upgrade: ship `.hermes/probe/vitest.probe.config.ts` in the
repo, aliases already wired, and name it in COMMON §8 beside the harness facts.** The packet
tells a reviewer to "render the component in jsdom yourself with a throwaway test in
`.review-scratch/`" — an instruction the repo's own configuration silently refuses.

**2.2 · Reading 2224 lines of PLAN to find two cluster commands. (~15 min.)** The commands live
at `PLAN.md:1471-1472` inside a wide markdown table, and the `run()` function they depend on
lives 90 lines earlier at `:1377`. **Upgrade: the coding/review packet should carry the two
cluster commands and the `run()` body VERBATIM.** The packet already carries constants
verbatim; the command is a constant. This is the single highest-leverage change for the
one-prompt machine: a reviewer's first executable action should be possible from the packet
alone, before any doc read.

**2.3 · The author's `Tests 27 passed (27)` does not reproduce at the delivered HEAD.** It is
correct at `0928c38c` (I reproduced it, §N2 of the verdict) and becomes 28 at `fb44696d`,
because C4 adds a case to a file C3's command also runs — the chain rule (N7) working exactly
as designed. I spent ~10 minutes deciding whether I had found a fabrication or an artefact.
**Upgrade: a three-run table states the commit it was measured at. One column.** Where a
handoff carries two clusters and the later one edits a file the earlier one runs, it also
states the earlier command's number AT THE FINAL HEAD.

## 3. What I nearly got wrong

**I nearly filed the surviving `disabled={true}` mutant as a blocking finding.** It survives
both cluster commands — all four C4 cases expect `disabled === true`, so the cluster has no
positive control. It looks damning until you read `PLAN.md:1472`, which declares it in those
words, explains why (cases 4/5 moved to C7 with the modal), and names the two steps that catch
it there. I verified the declaration is accurate rather than trusting it. **A reviewer who greps
for cluster commands and never reads the cluster ROW files a false blocker here** — and the
row is 400 characters of table cell, easy to skip.

**I nearly claimed the dropped `type="button"` hazard as measured.** It is not: jsdom does not
implement form submission from a button activation, so my probe showed `register called times =
0` under BOTH the intact and the mutated component. The behaviour is the HTML standard's, not
something this harness can demonstrate. I filed the attribute assertion as the remedy and said
so. **This is the trap COMMON §10.16 warns about in a different costume: a guard that returns
the same answer for good and bad input proves nothing, and a jsdom probe that cannot reach the
behaviour is exactly that guard.**

## 4. Dead ends — do not re-derive

1. **`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked").set.call(node, v)`
   — the classic "React native setter" trick — DOES NOT re-sync React 19.2.8's tracker.**
   Measured (`rev-recovery.test.tsx` R3): the tracker hooks the *instance* descriptor, so
   calling the *prototype* setter bypasses the very thing you are trying to update. The trick
   works for `value` on inputs React does not track; it is wrong here.
2. **A synthesised `.click()` from an acknowledgement handler does not recover either** (R2).
3. **The one thing that DOES work is the boring one: plain assignment `input.checked = false`**
   (R1), because it goes THROUGH React's instance setter. One line, no library, no ref gymnastics.
4. **`grep -v '^?? .review-scratch'`** does not filter git's porcelain line for an untracked
   directory — git prints `?? .review-scratch/` with a trailing slash and, in this repo's
   worktree layout, prefixed `dialectical-engine/`. Match on `review-scratch` unanchored.

## 5. Where THIS packet fought me

**5.1 · It is accurate.** Every constant I checked resolved: base `91877847`, HEAD `fb44696d`,
the two commit shas, the 578-line review package, the dispatch packet and its at-dispatch
snapshot (byte-identical — §10.32 working), the allowed list against the deliverables. Zero
packet defects. That is worth saying plainly, because it is the first packet in my reading of
this mission's ledger with none.

**5.2 · The one gap: the mission docs are not in the review worktree.** The packet says "run
every command from" the detached worktree, and the reading list is absolute paths into the MAIN
tree — correct, but the worktree at `fb44696d` has no `docs/missions/consent-ui/` at all, so
the first relative `ls` returns `No such file or directory` and costs a beat of doubt about
whether the worktree is wrong. **One sentence in the packet — "the mission docs live only in
the main tree; read them by absolute path, run commands in the lane" — closes it.**

**5.3 · Charge §4 asks "whether C7's row handler will be able to rely on it" — and that is the
best line in the packet.** It is a forward-looking, falsifiable question that no cluster command
could answer and that the author, correctly scoped to C3/C4, had no mandate to ask. It produced
the only finding in this review that will save a round. **Upgrade: every per-cluster review
packet should carry one such "will the NEXT cluster be able to rely on X" charge**, named by
the orchestrator from the PLAN's next-cluster mutant list. It is cheap to write and it is where
the blind lens earns its cost.

## 6. Toward the one-prompt machine

1. **Ship the probe harness, do not describe it.** `.hermes/probe/vitest.probe.config.ts` plus
   a 30-line `mutate.py` (plant → run → hard-revert → assert porcelain). The author wrote one,
   I wrote one, the C1C2 seats wrote ones. Four seats, four harnesses, one behaviour. The
   author's §F5 says the same thing from the worker's side — two independent seats converging
   on the same missing tool is the signal to build it.
2. **Put the cluster command in the packet, verbatim.** See §2.2.
3. **Make the "next cluster" charge standard.** See §5.3.
4. **A pinned implementation shape carries a forward probe.** See §1.
5. **Three-run tables carry their commit.** See §2.3.

## 7. Prices

| Item | Wall clock | Retries |
|---|---|---|
| Reading (COMMON, packets, SPEC §R01-R21, PLAN cluster rows, design extracts, diff) | ~35 min | 0 |
| Cluster commands ×3, both shells | ~9 min | 0 |
| Probe kit authoring + the scratch-config dead run | ~30 min | 1 |
| Root-causing P10b (tracker desync) + the four recovery hypotheses | ~25 min | 0 |
| 11-mutant campaign, both cluster commands each | ~22 min | 0 |
| Green-at-base, F4 dating, standing gates, C3-at-its-own-commit | ~14 min | 0 |
| Writing | ~20 min | 0 |

No `BLOCKED`. No sub-delegation. No git write outside in-scratch probes, all hard-reverted;
`git status --porcelain` empty at exit.
