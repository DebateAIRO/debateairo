# Self-report — CODE-REV-S01-C3C4 (Claude Opus 5, mission `consent-ui`, blind per-cluster review, S01 C3+C4, round 1)

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:receiving-code-review`
(all six in THIS session, in that order, before any judgement — COMMON §10.9.)

Verdict: **PASS** with 8 N-findings and 5 packet/PLAN findings. Detail in
`docs/missions/consent-ui/reviews/CODE-REV-S01-C3C4-r1.md`. This file is the case file.

---

## 1. The headline: the code was strong and the GATES around it are the weak part

Fifteen mutants planted independently of the author's harness; every observable one was caught
by the shipped tests. The three that survived I proved **equivalent** (two redundant
enforcement points for the same property; breaking either alone changes nothing observable —
`A4`, which breaks both, is caught). Twenty-four design strings compared codepoint for
codepoint against strings I extracted mechanically from the design files: **zero mismatches.**

So the interesting failures are not in the diff. They are in what NOTHING IN THIS REPO CAN SEE:

**CAUSE 1 — `tests/**/*.tsx` is typechecked by no project.** Root `tsconfig.json` includes
`tests/**/*.ts` only; `apps/ui/tsconfig.json` is rooted at `apps/ui`, so a repo-root `.tsx`
test is outside both. Measured with `--listFiles`: `consent-bar.test.tsx`,
`consent-card.test.tsx`, `consent-storage.test.tsx` = **0 hits in both projects**. COMMON
§10.30 was written to close exactly this ("never sees a created component **or a `.tsx`
test**") and its remedy — the `apps/ui` arm — closes the component half only. Consequence,
measured: **deleting both `decisionFor` overloads leaves every gate green** (apps/ui tsc exit
0, root typecheck 0 outside the pin, C2+C4 suites `Tests 15 passed (15)`). A finding that took
a full reviewer round and a follow-up commit to fix has no regression guard at all.
**PRICE: this cost the fleet one review round already (N2), and it will cost another.**
**UPGRADE (one line):** add `"tests/**/*.tsx"` to the root `tsconfig.json` `include`, measure
the new baseline once, and pin it in `BASELINE.md`. Until then every `.tsx` test in this repo
is JavaScript wearing a type annotation.

**CAUSE 2 — a remedy whose witness is the compiler has no home in this harness.** COMMON
§10.10 ("a finding proved by a probe is discharged only by re-running that probe against the
fix") is unsatisfiable for a type-level remedy: vitest transpiles without checking, so the
round-1 probe's `P4` still fails at HEAD **and always will**. Both the author (their D3) and I
reached this independently. **UPGRADE:** amend §10.10 with one sentence — *"when the remedy is
a TYPE, the discharge is a compiler transcript plus a `@ts-expect-error` pin in a file the
project typechecks; the runtime probe's corresponding case is marked `TYPE-LEVEL — cannot
pass` in the verdict rather than re-run."* I measured that the pin works: removing the
overloads turns the directive into `error TS2578: Unused '@ts-expect-error' directive.`

## 2. What repeatedly cost tokens, in order of cost

**2.1 Design fidelity is unpinnable by construction, and I found the only three real defects by
hand (~35 min, the single largest block of my run).** jsdom computes no layout, so every
geometry number reaches V through a source-text assertion — and a source-text assertion can
only check numbers *someone wrote down*. The SPEC pins R09 and R15 generously but stops before
the button paddings, so `.consentPrimary`'s `padding: 10px 19px` is applied to a card control
the artboard draws at `10px 18px`, and a `border: 1px solid var(--ink)` is added that no
design primary has — **and no test in this mission could ever have caught either.** I caught
them by regex-extracting every `padding:`/`border:` pair out of `turn-10-cookie-consent.html`
and diffing. **UPGRADE, and it is cheap:** that extraction is 20 lines
(`code-rev-s01-c3c4-r1-extract-design-strings.mjs` generalises to attributes in an hour).
Ship it as a mission-level `design-diff` step run ONCE per artboard at requirements time,
and paste its output into the SPEC as the geometry table. Then geometry is transcribed from a
machine, not from a human reading a 15KB HTML file, and the reviewer diffs a table.

**2.2 Blindness rules cost me a wrong turn (~6 min).** COMMON §10.26 lets me read another
lens's RAW CAPTURES but not its CONCLUSIONS. `reviews/CODE-REV-S01-C1C2-r1.md` contains the N1/N2
whose fix I was charged with judging — so I had to reconstruct the finding from my packet's
paraphrase plus the probe file, and could not check whether the author's fix matched what was
actually asked. **UPGRADE:** when a packet charges a seat with judging a PRIOR verdict's
remedy, the orchestrator should extract that verdict's finding text into
`snapshots/findings/<finding-id>.md` and name it in the packet. A finding is a raw capture of
a defect; only the VERDICT is a conclusion. Right now the rule bans both.

**2.3 vitest's `include` does not reach a reviewer's scratch (~8 min).** `tests/**` only, so a
probe in `.review-scratch/` yields "No test files found" — the round-1 C1C2 reviewer hit this
too and left a comment in their probe telling the next seat to copy the file into `tests/`.
That instruction makes a reviewer write into the surface under review. **UPGRADE:** commit a
`vitest.review.config.ts` at the repo root whose only difference is
`include: [".review-scratch/**/*.test.ts?(x)"]`, and name it in COMMON §8. I rebuilt it from
scratch; so did the C1C2 reviewer; so will the next one. **This is the third seat to pay for
the same 25 lines.** (Mine is in the probes directory now.)

**2.4 The stale line number, again (~4 min).** The packet cites the R04 row-3 pin at
`consent-storage.test.tsx:170`; at the reviewed HEAD it is `:203`, because the very commit
under review inserted 33 lines above it. COMMON §10.24 already bans this for packets, and
§10.31 for docs. **It is not yet stated for the case that costs the most:** a citation into a
file *the reviewed commit itself edits* is stale by construction. **UPGRADE:** packets cite
such lines as `path:<line>@<commit>`, or cite the anchor text instead of the number.

## 3. Where THIS packet fought me, exactly

- **§4 gave me the author's five concerns as a list to "verify, not trust" — that was the single
  best thing in it.** Four of the five were true and one (concern 4's locked-switch item) was
  true-but-already-fixed; charging me to re-plant the author's own mutants is what proved the
  three survivors were equivalent rather than holes. Keep this section verbatim in every
  per-cluster review packet.
- **§2's probe list is 14 items in one paragraph.** I turned it into a checklist by hand and
  nearly dropped "registration request shape unchanged" (it was the 9th clause of a sentence).
  Make it a numbered list; the reviewer's verdict can then answer it index by index.
- **The packet's own §1 contradicts itself for the AUTHOR** (§2 orders token edits into two
  files §1's `forbidden` list names). It did not bite only because C3/C4 needed zero new
  tokens. **A packet self-contradiction that does not bite is still a coin-flip that landed
  well** — COMMON §10.6's self-contradiction charge exists for requirements seats and should
  bind the orchestrator's packets too.
- **"the other six tests are green"** in gate (3) is stale (t9 has 9 since C1). The
  orchestrator fixed `BASELINE.md` at 23:50 but the packet was never re-cut. **UPGRADE:**
  packets should not restate a baseline number at all — they should say "the delta against
  `BASELINE.md`", one indirection, always current.

## 4. What I NEARLY got wrong

- **I nearly filed the surviving locked-switch mutant as a hole.** Removing `flip`'s guard left
  every suite green and my first reading was "the lock is untested". It is not: `stateOf`
  hard-codes `true` for `essential`, so the mutation is unobservable. Only planting `A4` —
  BOTH enforcement points at once — showed the property is genuinely pinned. **The lesson is
  general: a surviving mutant is a hypothesis, not a finding.** Prove it is observable before
  you write it down. Cost: ~7 min, saved a false blocking finding.
- **I nearly reported 9 token-value mismatches.** My first diff compared `rgba(…,.1)` against
  JavaScript's `${0.1}` and called 4 of them defects on the strength of a leading zero.
  Normalising the alpha dropped it to 5, of which 4 are pre-existing tokens COMMON §7 itself
  sanctions. **A value diff must normalise before it accuses.**
- **I nearly missed that `--shadow-thumb` cannot simply be corrected**: it is consumed by
  `.ndSlider` at `globals.css:5106,5115`, another mission's surface. The remedy had to change.

## 5. Dead ends — do not re-derive these

- `git show <sha>:apps/ui/app/globals.css` fails inside a worktree whose git root is one level
  up; the path is `<sha>:./apps/ui/app/globals.css` (git tells you, but only after the error).
- `grep -c '=== consent-ui S01 ==='` returns **1**, not 2, at HEAD: the close marker reads
  `=== end consent-ui S01 ===` and does not contain the open marker's substring. `CMD-C3`'s
  `n_blocks -eq 1` is correct and discriminating (mutant L makes it 2).
- The tool shell's `grep` is **ugrep 7.8.4**, not BSD grep. Every term in `CMD-C2/C3/C4` is
  ASCII-anchored and returned the identical verdict under both — 3 script runs and 3 inline
  runs, all 0. COMMON §10.16's trap did not fire here; the commands are clean.
- A heredoc containing certain regex bodies is rejected by the Bash tool as "control
  characters"; write the file with the Write tool instead of fighting the quoting.

## 6. Toward the one-prompt machine

1. **Make the design machine-readable once, not human-readable N times.** Three seats have now
   read the same 15KB artboard HTML and transcribed numbers out of it by eye. One extraction
   script at requirements time turns every later "diff the geometry" charge into a table
   comparison. This is the highest-leverage change available to this mission.
2. **Close the `.tsx` typecheck hole before the next cluster.** It is one line of
   `tsconfig.json` and it converts a whole class of findings from "a reviewer might notice" to
   "the gate fails".
3. **Ship the reviewer's vitest config in the repo.** Three seats, same 25 lines, three times.
4. **Give the reviewer the prior finding text, not just the prior verdict's name.** Blindness
   should hide judgements, not evidence.
5. **A packet should never restate a number that lives in `BASELINE.md`.** Every stale count
   this mission has produced came from a packet quoting instead of pointing.

## 7. Evidence index

Probe kit at `.hermes/reports/consent-ui/probes/code-rev-s01-c3c4-r1-*` (19 files): my jsdom
design-fidelity probe and its stale-`initial` companion, the mechanical design-string
extractor and its JSON output, the token-value differ and its output, the type-level
`sig-probe` and its tsconfig, the mutant planter + runner + full output, the three cluster
commands as extracted from `PLAN.md`, and the with/without-block runs of the four other
stylesheet-reading suites.
