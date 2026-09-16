READY FOR PEER REVIEW · comments read through: n/a (no Hermes board in this continuation; the SDD ledger is the board)

# cont-t7-depth-law — self-report (BUILD(CONT-T7), pass 1, Claude Opus 5)

Answering, verbatim, the question every seat answers:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

Base `56c91618` · fix commit `03f9edf4` · branch `mission/2026-09-16-algorithm-live-loop-continuation`.

---

## 0. The verdict, in one line

**The brief described a merge regression. The measurement found a false-positive class plus a
self-inflicted regression committed onto this very branch ~2 hours before I was dispatched.**
Three of the four sites the oracle named are crypto version bytes, not depth. The fourth is a
sentence of prose written by `dcd2f89c` (BUILD(CONT-T6), 06:11 today) inside a commit message that
cites the very oracle it broke.

---

## 1. Findings — cause, not symptom; each priced

### F1 · The brief's count and its attribution were both wrong at my base. COST: nearly a shipped defect.
The brief (and gate row 25/26 of the measurement of record) predicted **3 duplicate definitions +
3 extra depth-bound sites, "introduced by the second parent's files"**. Measured at `56c91618`:
**4 duplicates, 5 total sites (4 extra + the owner)**, and only **3** of them come from `^2`.

- **CAUSE:** the brief was authored from the gate snapshot `gates-96e3c91c.md`, taken at the merge.
  Tasks 1–8 then landed on this branch and one of them (`dcd2f89c`) added a 4th site. Nothing
  re-measured the row between the snapshot and the dispatch.
- **PRICE:** ~0 for me, because my dispatch carried the sentence *"the value you MEASURE is the
  truth and a mismatch is a finding, not an error of yours"*. Without that sentence the cheapest
  path was to trust "three" and either stop at three or force a fourth into the same story.
- **UPGRADE:** every count in a packet gets `(measured at <sha>)` appended at authoring time, and
  any count older than the seat's base is re-measured before it is quoted as a requirement.

### F2 · The packet's remedy was only correct for a site that actually carries a depth. COST: one averted false fix.
The packet says *"re-route each duplicate and extra site to `EXPANSION_DEPTH_MAX`"*. Applied
literally to `apps/api/src/support/keys.ts:444`, that turns
`Buffer.concat([Buffer.from([1]), nonce, …])` — the **version byte of an AES-GCM envelope** — into
`Buffer.from([EXPANSION_DEPTH_MAX])`, which writes byte `5` into every wrapped support DEK and
breaks `parseWrappedEnvelope`'s `bytes[0] !== 1` guard. That is a production data-format break
dressed as compliance with a ruling.

- **CAUSE:** the remedy was derived from the RULING ("every other site imports it") instead of from
  the ORACLE (which reports two independent arms, only one of which is about a ceiling).
- **WHAT SAVED IT:** the packet's own hedge — *"read how the oracle classifies a site before
  choosing the mechanism"*. That clause is the single highest-value sentence in the packet.
- **UPGRADE:** for an oracle-driven ticket, a packet names the classifier (`duplicateBoundSites`,
  `tests/support/depthOracle.ts:1257`) and forbids a remedy chosen before it is read. It should not
  name the remedy at all.

### F3 · D71's boundary duty is unsatisfiable at all four sites, and satisfying it would have been fabrication.
"One test proving depth 5 is admitted and depth 6 rejected AT THAT SITE" presumes the site carries
a depth. None of these four does: three are envelope version bytes, one is a doc comment. A test
asserting "depth 5 admitted at `keys.ts:456`" would pass forever and pin nothing — the exact defect
`heartbeat-worker` §2 was written to prevent ("an assertion that pins the mutant you were shown is
not a pin of the property").

- **Discharged instead by:** citation to the three existing boundary rows at the single source
  (`tests/unit/s1-1-depth-contract.test.ts:181`, `:267`, `:285`) plus a killed mutant per site.
- **UPGRADE:** make D71 conditional — *"for each re-routed site that carries a value, …; for a site
  that does not, cite the row that pins it and kill a mutant there."*

### F4 · A sibling task on this branch broke the oracle it was reasoning about. COST: this task's 4th site.
`dcd2f89c` un-exported `DIGEST_EMPHASIS_OBJECTION_COUNT` and wrote a doc comment explaining why.
Its commit message says widening the carrier exemption *"would falsify the narrowness property
s1-1-depth-contract pins"* — correct reasoning — and the comment it wrote one line below restates
the bound as **"(T1's 1-5 depth bound)"**, which is precisely what the oracle's ceiling arm matches
on a raw physical line, comment or not.

- **CAUSE:** the seat reasoned ABOUT the oracle and never RAN it. Its gate list covered the suites
  its code touched, not the suite its PROSE touched.
- **PRICE:** ~15 minutes of this task, and a permanent asterisk on the row's "merge-caused" verdict.
- **UPGRADE (cheapest high-value change in this report):** `pnpm exec vitest run
  tests/unit/s1-1-depth-contract.test.ts` costs **3.0 s**. Any commit that touches a path listed in
  `tests/support/shipped-corpus.manifest.txt` should run it. That is a pre-commit hook, not a
  process.

### F5 · The brief's neighbour command cannot run on this host — and its failure is indistinguishable from a red suite.
`pnpm exec vitest run tests/unit/t1-*.test.ts tests/unit/register-s09.test.ts`. There is **no file
matching `tests/unit/t1-*.test.ts`** in this tree (it holds `t10-`, `t11-`, `t12-`, `t15-`, `t17-`;
the only literal `t1-` file is `tests/architecture/t1-argon2-worker-contract.test.ts`). zsh aborts
at glob expansion: `(eval):1: no matches found: tests/unit/t1-*.test.ts`, **rc=1, and the log file
is never created** because the runner never starts.

- **NEW VARIANT of the multi-path family** (TOOLING-TRAPS :2462, :4441): the recorded variants all
  assume vitest RAN and silently dropped a path. Here nothing ran, and `rc=1` reads exactly like a
  failing suite to any script that classifies on exit status.
- **PRICE:** ~2 minutes. **UPGRADE:** packets carry no unexpanded globs; every multi-path command
  `[ -f ]`-checks each path first and asserts `Test Files N (N)`. My runner does both by
  construction and is in the scratchpad for reuse.

---

## 2. What I nearly got wrong (the near-misses are the report)

1. **I nearly re-routed a crypto version byte to a depth constant** (F2). The only thing between me
   and that commit was reading `duplicateBoundSites` before touching a file. **Reading the
   instrument is cheaper than re-reading the ticket, always.**
2. **I nearly wrote the test file the `allowed` list pre-authorised.** `tests/unit/
   s1-1-depth-boundaries.test.ts (new)` reads like an instruction; it is a *permission*. Under time
   pressure an `allowed` entry becomes a checklist item and a seat manufactures content for it.
   **UPGRADE: split `allowed` into MUST-WRITE and MAY-WRITE.**
3. **I nearly reverted the mutants with a reverse regex.** `keys.ts`'s own new doc comment contains
   the literal text `Buffer.from([1])`, so `s/Buffer\.from\(\[1\]\)/…/` lands in the COMMENT first
   (TOOLING-TRAPS :4595, recorded by T5, and it would have bitten here). Restoring from a
   byte-identical backup with an `md5` equality check is the only safe revert.
4. **I nearly reported "the oracle flags every numeric array in shipped code."** It does not.
   Neighbour mutant N1 (`const PROBE_NEIGHBOUR_DETERMINABLE = [1];`) is **green**. The arm reports
   an occurrence whose value the evaluator cannot DECIDE; `[1]` alone is decidable and classed
   OTHER. A reader who takes the row's name ("duplicate definition of the ruled ceiling") at face
   value will mispredict this every time.

---

## 3. Dead ends — do not re-derive these

- **`Buffer.of(1)`** also removes the array literal (probe case G: 0 sites) but routes through
  `%TypedArray%.of`, i.e. the deprecated `Buffer` constructor. Rejected. Naming the element is
  strictly better and needs no runtime reasoning.
- **Extending the oracle's exemption list is not available to this seat.** The allow-list is
  `OWNING_DECLARATION` (`tests/unit/s1-1-depth-contract.test.ts:331`), inside the forbidden zone.
  The only lever a worker has is the shipped code. That is the design working, and it means the
  remedy for a FALSE positive and a TRUE positive is the same edit — worth knowing before you go
  looking for a config knob.
- **`git stash`** was never an option for the typecheck base-vs-after measurement (shared stash
  stack). Backup-to-scratch → `git checkout --` → measure → restore → verify `md5` is the pattern,
  and it is ~10 s.

---

## 4. What repeatedly cost tokens here

| what | measured | verdict |
|---|---|---|
| Reading enough of a 2 166-line test + a 1 259-line oracle to classify a site | 4 targeted greps + 5 `sed` windows | **irreducible and worth it** — it is what prevented F2 |
| Running the gate | 2.96–3.30 s per run (vitest's own Duration line), 11 s1-1 runs | **free**; the runs were never the cost |
| Re-deriving a prose summary of a diff the machine already printed exactly | the whole of F1 | **avoidable** — paste the assertion diff into the packet |
| Debugging | **zero** | the first action after RED was a probe against the oracle's own module, not a hypothesis |

**The single technique that made this cheap:** importing the oracle straight from the scratchpad —
`await import("file://…/tests/support/depthOracle.ts")` under `node` (Node 26 type-stripping). The
module's own `import ts from "typescript-classic"` resolves from ITS directory, so no config, no
`tsx`, no repo write. One 2-second run answered eight classification questions (probe cases A–H)
that would otherwise have cost eight 3-second suite runs plus eight diff reads — and it sidesteps
TOOLING-TRAPS :907 (the root `typescript` package has no compiler API) entirely.

---

## 5. Toward a one-prompt machine — five concrete changes

1. **Ship the oracle probe as a repo tool** (`tools/oracle-probe.mjs`), taking a path or a source
   string and printing the sites. Every "would the oracle flag this?" question becomes 2 s and one
   line, and the answer is the instrument's, not a re-implementation of it.
2. **Packets carry the failing assertion's OWN OUTPUT, never a prose summary.** "three duplicate
   definitions … introduced by the second parent's files" is a lossy retelling of a diff that is
   exact, machine-readable and 12 lines long. Every defect in F1/F2/F3 is downstream of that
   lossiness.
3. **Re-measure at the seat's base.** A mission that dispatches from a snapshot must either
   re-run the row at dispatch time or stamp the count `(measured at <sha>)` so the seat knows to.
4. **One cheap whole-tree oracle on every commit of a mission branch.** F4 cost a whole finding and
   would have cost its author 3 seconds.
5. **Type the `allowed` list.** MUST-WRITE vs MAY-WRITE. Three of the six entries in my packet were
   permissions; two of them I correctly did not exercise, and both were tempting.

---

## 6. Where the packet was unclear or wrong (verbatim, so it can be fixed)

- `§2 allowed` predicts the sites are *"expected under `apps/api/src/support/**`,
  `apps/observation-agent/src/**` or wherever the second parent added them"*. **One of the four is
  under `packages/serve/` and is a FIRST-parent file.** The instruction to derive the list from the
  diff is what made the packet survive its own prediction.
- `§3` *"re-route each duplicate and extra site to `EXPANSION_DEPTH_MAX`"* — wrong for 4 of 4 sites
  (F2). Its own next clause is the repair.
- `§3` *"record the oracle's verdict for each of the ~153 added files (admitted / withheld)"* —
  the oracle has no per-file verdict API; its corpus row is one aggregate assertion over a list it
  names by path. I took the verdict per file with the oracle's own `parseModule` from the
  scratchpad. **Result: 153/153 admitted, 0 withheld, 0 unparsable** — so the "a file it cannot
  parse is a finding" branch never fired. A packet should say which function produces the verdict.
- `§3` boundary duty (D71) — unsatisfiable here (F3).
- The brief's Step 4 command — unrunnable here (F5).
- **Correct and load-bearing:** "derive, never hand-edit a count". The manifest was regenerated by
  `SHIPPED_CORPUS_MANIFEST_UPDATE=1`, and its 153 added lines are byte-identical to the `added` set
  the failing assertion printed (`diff` exit 0). That check is worth making standard: **re-derive,
  then prove the derivation equals what the failure named.**

---

## 7. Residual risk I am handing forward

- `apps/api/src/support/keys.ts` still reads/declares the version byte with bare literals at
  `:217`, `:235`, `:237`, `:415` and `:472` (post-fix line numbers; `bytes[0] !== 1`,
  `version: 1`, `envelope.version !== 1`). They are not oracle sites
  (no array literal, no depth) and re-routing them is an adjacent refactor I was not charged with,
  but the producers are now named and the parsers are not. **Out-of-contract finding, named not
  fixed.**
- The three keys.ts rows are a **false-positive class**, and the class is "any shipped numeric array
  literal consumed by a call the evaluator does not model". I swept the 153 added files with the
  oracle's own emitter: exactly one file (keys.ts) holds a member. The class is closed for the
  merge's additions; it is **open** for any future shipped file, and the remedy will always be to
  name the element.
