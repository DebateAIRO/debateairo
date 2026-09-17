# Self-report — seat REV-S02-p1-correctness-tests · node REV(S02) pass 1, lens correctness/tests · ticket `t_edf20575` · mission `debate-tiers`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Wall clock 11:14 → 11:42 EEST, 2026-09-12. Verdict REWORK: B1 (35 pre-existing green cases turned
RED), B2 (a pre-existing acceptance test left unable to fail), seven N findings.

---

## 1. The cause of death, named

**Four green clusters, three green re-verifications and a green typecheck delta all agreed — and
the slice is red.** The cause is not a careless seat. Every BUILD seat did exactly what its packet
said, ran its command three times, and reported honestly. The cause is structural:

> **A cluster's "one command" is a list of FILES, and the mission has no rule that derives that list
> from the BLAST RADIUS of the change.** It is derived from the change's *subject* (asks, tiers,
> rosters) instead.

S02-C1 changed `RunRepository.startRun` — the single function through which every run in this
codebase is written. Its cluster command names two suites. SPEC R13 widens that to "every suite that
constructs an ask literal and every suite naming `evaluateAskAdmission`, `resolveDiscoveredPanel` or
`panelSize`". Both formulations reason about **asks**. The three suites that broke
(`s6-content-encryption-database` 31 cases, `s9-dev-token-retirement-database` 3,
`s7-authorization-database` 1) never mention an ask: they call `startRun` directly against a
deliberately TRUNCATED migration set. No grep in the SPEC, the PLAN, or any of the four BUILD
packets could have found them, because none of them greps for the thing that actually changed.

The one-line upgrade that would have caught it, at zero seat cost:

> **A cluster that edits an exported symbol must run every suite that references that symbol.**
> `/usr/bin/grep -rln '\.startRun(' tests` answers in 200 ms and names all five suites, three of
> which are the failures. Make it the R13 rule: *enumerate by the SYMBOLS the diff touches, not by
> the mission's subject matter.* The orchestrator can compute it mechanically from the diff at GATE
> time and refuse to assemble a review package until those suites are measured.

The second cause, sitting underneath: **`BASELINE.md` covers only suites a SPEC already named.** Its
own rule says so ("Every suite a SPEC names has a row above"). So a suite outside the SPEC's
vocabulary has no base measurement, and a reviewer who finds it red cannot date it without doing
what I did — reverting production and re-running. That revert cost me two batteries and about four
minutes of wall clock; a `BASELINE-full.md` produced once per lane (`pnpm exec vitest run tests/`
overnight, `passed/total` per file) would have turned a 4-minute forensic exercise into a diff.

---

## 2. What repeatedly cost tokens

**(a) Reading board exports to find one line.** `review-packages/S02-p1/board/*.txt` is 61 KB of
ticket comments. I needed four things from it: the C2 R9 sweep (comment 8), the R12 read-back
command, the C3 guard rationale, and the C4 packet defect. I paid for three full-file reads to get
them. *Upgrade:* the package should carry `board/EXTRACTS.md` — for each cluster, the READY handoff's
lines 4–7 and any comment the packet's charges name by number, with the raw export kept beside it for
anyone who wants more. The charges already name the comments (`comment 8 on t_1675b61f`); extracting
them is mechanical.

**(b) Re-deriving line numbers three times.** PLAN.md's numbers were measured at `7f89f7b7`, the
packets re-grepped them at `3bf54957`, C4 moved `apps/api/src/index.ts` by one line after C2 measured
it, and I re-measured all of them again. Four measurements of the same anchors across four nodes.
*Upgrade:* stop citing product line numbers in durable documents. Cite `path` + the distinctive text
(`grep -n 'const roster = PLAN_TIER_ROSTERS'`), which survives every rebase. Three of this mission's
seven residue tickets (`t_ce7452ba`, `t_1e99444c`, and half of `t_2e74f402`) are line-number drift.
My N2 finding is the same disease inside a test: the C3 guard asserts
`apps/ui/components/landing/cards.ts:28` and goes RED if anyone adds a comment to that file.

**(c) The `git` pathspec trap, again.** From inside `dialectical-engine/`, `git ls-tree HEAD
dialectical-engine/web/` returns EMPTY rather than erroring. It is in TOOLING-TRAPS (2026-09-01) and
my packet did not list it among the traps for this node. See §4.

**(d) Running the four cluster commands three times each.** Twelve runs, ~90 s of wall clock, to
reproduce numbers the orchestrator had already published and which came out byte-identical. The value
was real (it is what makes §2.1 of my artifact evidence rather than a citation), but three runs of a
deterministic unit suite buys almost nothing; the three-run rule earns its keep on the integration
suites with an embedded Postgres, which are where flakiness actually lives (and where I found one:
`s7-authorization-database > locks every matching run …` fails identically at head AND with
production reverted — a lock-waiter race). *Upgrade:* three runs for suites that touch a database or
a port; one run plus the file-count assertion for pure unit suites.

---

## 3. What I nearly got wrong

**I nearly reported `scaffold.test.ts` as "pre-existing because `web/` is untracked" on the strength
of an empty `git ls-tree`** — which was empty because of the pathspec trap, not because the file was
absent. `web/next.config.mjs` is tracked at both base and head. The conclusion happened to be right,
for the wrong reason, and I only found out because I re-ran the same command cwd-relative while
chasing the freeze-commit range in my packet. If the answer had gone the other way I would have
dated one of S02's own failures as inherited. **Rule I would add to TOOLING-TRAPS:** an empty
`git ls-tree`/`git diff --stat` is never evidence of absence until the same pathspec has been proved
on a KNOWN hit — the same "prove your grep on a known hit" rule this mission already has for `grep`,
applied to `git`.

**I nearly rated B2 as non-blocking.** The property (no evaluator in the persisted panel) still
holds, so "nothing is broken" is seductive. What decided it: the slice EDITED that test, the packet
put the file in C2's `allowed` list, and the handoff reported the edit as a green repair without
noticing the discriminator died. A test that can no longer fail is a deleted test that still costs
20 seconds per run.

**I nearly missed B1 entirely.** My charge list is about asks, rosters, filters and the wire. I went
looking for the three suites only because the C2 packet mentioned in passing that
`tests/support/discoveredPanel.ts` "is imported by 24 test files" — that number is what made me sweep
the fixture's consumers, and the sweep is what led to `startRun`'s consumers. **A number in a packet
that nobody is asked to act on was the only thread to the worst finding of the pass.** That is luck,
not method, and §1's upgrade is how to stop relying on it.

---

## 4. Where THIS packet was unclear, exactly

1. **`packets/REV-S02-p1-correctness-tests.md:10`**, the `inputs` line: *"the freeze commits
   (COMMON §6 row `freeze commits`; `git diff --stat <previous>..<latest> -- docs/missions/debate-tiers`
   is exactly what the seat under review changed)"*. COMMON §6's row gives **no commit pair for S02**
   — it says "the HEAD each DISPATCHED comment stamps". The command cannot be parameterised, and its
   pathspec is the trap in §3. Filed as N7. *Fix:* the packet should carry the literal pair
   (`git diff --stat 75227acf..4d55828d -- docs/missions/debate-tiers`, cwd-relative) or drop the line.
2. **Charge 3's trap list omits the one trap I hit.** It names five traps, all of them relevant, and
   not the `git` pathspec one, which is the only one that changed an answer for me. Trap lists should
   be derived from the node's ACTIONS (this node reads git ranges → include the git traps), not from
   a general sense of what bites seats.
3. **Charge 2 is nine duties in one paragraph of prose.** I had to decompose it into a checklist
   before I could work, and re-read it twice to confirm I had answered all nine. Numbering the
   sub-duties (2a…2i) would cost one line and remove a whole class of "the seat answered eight of
   nine" failures. My artifact §6 exists purely to prove I answered all of them — a section the
   packet's own shape forced me to write.
4. **Nothing in the packet says what to do when a finding lands outside the cluster commands.** B1's
   suites are in no command, in no BASELINE row, and named by no requirement. The `verification` line
   says "every cluster command re-run by you" — a seat reading it narrowly stops there and finds
   nothing. *Fix:* add to every REV packet: *"the cluster commands are the floor; a lens owes one
   sweep of every suite that references a symbol the diff changed, and the grep that produced it."*

---

## 5. Toward the one-prompt machine

Three changes, in the order I would make them:

1. **Derive the gate from the diff, not from the prose.** At GATE(S) the orchestrator already has the
   patch. Extract the exported symbols it touches, `grep -rln` each across `tests/`, and make the
   union the review package's mandatory suite list — measured at base and at head, in the package.
   This pass's B1 is a 200 ms grep away, and so is every future member of the class. It also removes
   the human judgement that produced R13's ask-shaped enumeration.
2. **A full baseline per lane, once.** One overnight `vitest run tests/` per lane, `passed/total` per
   file, committed as `BASELINE-full.md`. Then "is this red mine?" is a lookup instead of a revert
   experiment, and the `pre-existing` label stops being an assertion a reviewer has to earn.
3. **Make mutants the unit of evidence, not the three-run table.** The three-run tables in this slice
   agreed with each other twelve times out of twelve and told me nothing. The mutants told me
   everything: five of my twenty found a real gap, and the two that found B1/B2 were reverts, not
   clever mutants. A packet that asks for "one mutant per assertion, and one revert per changed
   production file, with the suite list from change 1" would have produced this verdict from the
   BUILD seats themselves, before a reviewer was ever dispatched — which is the actual definition of
   a one-prompt machine here.

**Dead ends, so nobody re-derives them.** (a) `tests/integration/register-version-boundaries.test.ts`
looks like a member of the admission class (it builds a `PostgresAskApplication` with
`resolveDiscoveredPanel: async () => []`) and is not — it never calls `submit`; 6/6 green.
(b) `tests/integration/register-support-publication.test.ts` truncates migrations at `< "0055…"` and
looks like a B1 member; it never writes a run on the truncated database; green.
(c) `tests/architecture/scaffold.test.ts`'s two failures are pre-existing and are NOT about `web/`
being untracked — see §3. (d) The C3 guard's `packages/contract/src/plan-tiers.ts` exclusion is
dead code: line 6 (`PLAN_TIERS = Object.freeze(["free", "premium"])`) names both tiers but carries no
`===` or `case`, so the predicate would not have fired on that file anyway.

**Process notes.** No process of mine outlived this session (every vitest run was foreground or a
`nohup`'d zsh script that exited; PIDs recorded in `/private/tmp/debate-tiers-REV-S02-p1-correctness-tests/*.pid`;
nothing listened on any port — every integration suite reserves its own embedded-Postgres port from
the OS). No `pkill`. No git write of any kind. No pane or tab opened. The worktree ends at
`git status --porcelain` = 0 lines. Blindness held: I never opened another lens's worktree or output —
an `ls` of the shared `probes/` directory showed the security lens's filenames, which I did not read,
and I have said so in my verdict rather than pretending it did not happen.
