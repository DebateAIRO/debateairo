# Self-report — seat ARCH-REV-S03 · node ARCH-REV(S03) pass 3 of 3 (SCOPED, THE CAP) · ticket `t_3fe3198c` · 2026-09-13

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict filed: **PASS (pass 3 of 3)** with six non-blocking findings and **no V row**.
Artifact: `docs/missions/debate-tiers/reviews/ARCH-REV-S03-p3.md`.
**I ran no vitest/pnpm command in the lane** — BUILD(S03-C1) and BUILD(S03-C2) are live there. Product
lines read with `git show 9a000c37:./<path>`. No git writes, no stack, no provider.

---

## 1. The finding of this pass, and why it is the most interesting of the three

**The remedy for B1-p2 does not detect B1-p2.** I proved it with the mutant run the packet mandated —
and I would not have found it otherwise, because everything else about the remedy is correct.

I copied PLAN.md to a scratch file, restored S10's Revision-2 Files line with its parenthetical
(`Modify: \`package.json\` (the repository root's), \`tests/architecture/dev-deployment-register.test.ts\``),
and ran the re-issued `surfaces.mjs` against it. The exact defect of pass 2 is back — the marker-walk
stops at the parenthetical and the declared write is dropped. The completeness assertion's verdict:

```
   path-shaped tokens seen in a Files paragraph : 123
   of those, CAPTURED as declared writes        : 77      (was 78)
   of those, CLASSIFIED as citations (reviewed) : 46      (was 45)
   UNCLASSIFIED (must be 0)                     : 0
PASS: every path-shaped token in a Files paragraph is captured or classified; surfaces disjoint.
```

**Exit 0. PASS.** The dropped write did not become unclassified — it fell into the citation table and
was waved through. The mechanism is one line: `const cited = new Set(CITATIONS.get('S'+n))`. The table
is keyed `(step → paths)`, and Revision 3's S10 *legitimately cites* that path in prose ("never in
`dev-deployment-register.test.ts`, which C3 owns"). So the path is permanently immune to
drop-detection **in that step** — and S10 is the very step B1-p2 was about.

The seat rejected a global allow-list precisely because it could wave a genuine write through, and
reached for a step-keyed table to avoid that. The step-keyed table has the same hole, one scope down.
**That is the cause worth naming: a classification keyed on identity (step, path) cannot express a
rule about ROLE (cited in prose vs declared on a marker line), and the defect being guarded is exactly
a role confusion.** My own `p3-marker-writes.mjs` — which checks the role, not the identity — catches
the mutant in one line of output.

I want to be exact about the blast radius, because it would be easy to overstate: **Revision 3's
content is correct.** I verified it independently of the seat's script (78 declaration-line path tokens,
zero dropped declared writes; the only two flags are `apps/*` and `packages/*`, which are
`pnpm-workspace.yaml` globs my heuristic swept in and which are genuine citations). The columns are
18/5/24/5 and disjoint. What is broken is the *regression guard*, not the plan. That is why this is an
N and not a V row: BUILD is not blocked, and V has nothing to rule on.

**The upgrade:** when you build a checker for a defect, the last step is to re-introduce the defect and
watch the checker fail. The seat re-ran my detector (`p2-dropped-paths.mjs`) against the *fixed* plan and
saw a clean result, which proves the fix, not the checker. Nobody ran the checker against the *broken*
plan. **Recommendation: make "a new assertion ships with a failing fixture" a law of this fleet** — the
same RED-before-GREEN rule the worker contract already applies to product code, applied to verification
code. It costs one scratch copy and one run, and it is the only thing that separates a guard from a
decoration.

## 2. What cost tokens, and what saved them

1. **My own heuristic produced two false positives and I nearly reported them.** `p3-marker-writes.mjs`
   flagged `apps/*` and `packages/*` in S1. Both are glob patterns quoted from `pnpm-workspace.yaml`,
   not writes. I checked them against the file at base (`git show 9a000c37:./pnpm-workspace.yaml` →
   `"apps/*"`, `"packages/*"` at :2-3) before writing a word. This is the third pass running in which my
   own tooling produced a confident wrong answer — range expansion (p1), a regex that matched nothing
   (p2), and now two false positives (p3). The pattern is stable enough to be a law: **my tools are as
   likely to be wrong as the document, and the cheap discriminator is always to read the underlying file
   at base.**
2. **The seat's own account of its false-positive problem is the best paragraph in this whole mission**
   and I want it preserved: its first path predicate flagged 80 tokens, ~70 of them phantoms
   (`yaml@2.9.0`, `gpt-5.6-luna`, `rosters!.free`, a regex), and it observed that *"a checker that cries
   wolf 70 times trains its reader to skip it — which is how the original defect survived."* That is the
   real mechanism behind all three of this slice's blocking findings, stated better than I stated it.
3. **What saved tokens: the packet forbade the four cluster runs and told me how to derive the one
   number that changed.** C1's new base is my own pass-2 measurement minus one suite. I confirmed it three
   ways — my `p2-c1.log` (3 files / 8 tests), `git show` of the removed suite (3 `it(` cases), so 2 files
   / 5 tests — and the seat's `c-base-rev3.log` agrees. **Roughly seven minutes of embedded-postgres
   runs replaced by arithmetic over evidence I already had**, with no loss of rigour and no race against
   two live BUILD seats. This is the single most reusable efficiency lesson of the three passes: a
   reviewer's old measurements are a resource, and a packet that knows what they contain can spend them
   instead of re-taking them.

## 3. What I nearly got wrong

**I nearly called N2-p3 a blocking finding, which at this pass would have meant a V row.** S1's
Done-when — *"after `pnpm install`, `git status --porcelain` lists exactly the paths in `S03-C1`'s
column and no others"* — is genuinely unsatisfiable: C1 and C2 share one worktree and C2's files sit
beside C1's while both run. "A criterion unsatisfiable at its boundary" is literally on my blocking list,
and the temptation to apply the rule mechanically was strong.

But a V row exists to ask V something only V can answer. This is a wording bug whose fix the packet
itself already wrote (*"…lists no path outside C1's column that was clean before the install"*).
Escalating it would have spent V's attention on an engineering detail and delayed a running seat by a
review cycle instead of unblocking it with one ticket comment. **Tiering is not rule-application; it is
asking who actually needs to decide.** I have argued this in both previous self-reports and I still
nearly got it wrong under the pressure of "this is the cap".

## 4. Dead ends — do not re-derive

- **The ten candidates are all genuine citations.** I judged each against the sentence it sits in and
  agree with the seat on all ten. My pass-3 prediction of "one or two MORE declared writes" is a clean
  **MISS**, and worth recording as one: the instrument could not have settled it anyway, since a path
  cited in the same step is invisible to it (§1).
- **C1's arithmetic is right** and agrees three independent ways (§2.3). Do not re-run it.
- **The four frozen anchors held exactly** — S1 98, S14 279, S16 309, S17 330, S18 363 — so the running
  BUILD packets' Revision-2 anchors still resolve. The seat achieved this by compressing the Revision 2
  header block by exactly the 19 lines Revision 3 adds. That is a genuinely clever piece of work and the
  technique (treat the header as a fixed-height region when downstream packets cite line anchors) is
  worth keeping.
- **S28 is still sound and still untouched.** Three passes, three reviewers' worth of attention invited
  by the plan's own nomination, and it has never been the problem.

## 5. Toward the one-prompt machine

1. **A new assertion ships with a failing fixture** (§1). This is the pass-3 lesson and it generalises
   past this mission: verification code needs RED-before-GREEN exactly as product code does. Had the
   seat run its own assertion against the broken plan, this pass would have had zero findings of
   substance.
2. **Classify by role, not by identity.** Every one of this slice's surface defects — pass-2's B1 and
   pass-3's N1 — is a path whose *role* (declared write vs prose citation) was confused. A derivation
   that records the role can express the rule; a table of names cannot.
3. **Spend the reviewer's old measurements** (§2.3). The packet did this once and saved seven minutes of
   database spin-up in a lane that could not have tolerated the race. It should be standard: a scoped
   re-review packet should say which prior measurements are still valid and what arithmetic turns them
   into this pass's numbers.
4. **The three passes, in one line each, because the shape is the lesson.** Pass 1: three blocking
   findings, all available by opening a cited file or diffing two lists the plan already printed. Pass 2:
   one blocking finding, available by diffing the cluster commands against the derived surfaces. Pass 3:
   one non-blocking but structural finding, available *only* by running the new guard against the old
   defect. **The findings got harder to reach as the plan got better, and the instrument that found each
   one was mechanical every time.** The machine that writes plans should carry all three instruments —
   `plan-check.sh` for citations, `surfaces.mjs` with role-aware completeness for file contracts, and a
   mutant harness for every guard — and run them before a reviewer is ever dispatched. On this evidence
   that would have caught seven of the eight findings across three passes, leaving the reviewer the one
   thing worth a reviewer: *should a `model:` edit publish a new register version?*

## 6. Prices

| Item | Cost |
|---|---|
| wall-clock, CLAIM → verdict | ~20 min (p1 ~35, p2 ~25 — the scoping compounds) |
| cluster commands run | **zero** — forbidden, and correctly so; C1's changed number derived by arithmetic from my own pass-2 logs |
| the mutant run that produced this pass's finding | one scratch copy, one script invocation, ~1 minute |
| my two false positives | caught by reading the file at base before writing |
| findings | 0 blocking, 6 non-blocking, 0 V rows; 2 packet defects recorded (not re-litigated, per charge 1) |
| probes kept | 6 new files prefixed `p3-`, including the mutant plan and `p3-marker-writes.mjs` (the role-aware check) |
| predictions scored | 1 hit, 1 miss, 1 answered-but-the-guarantee-does-not-hold |
