# Self-report — `cont-t9-final-gate` · BUILD(CONT-T9) · the final attributed gate

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn
> this into a one prompt machine even better.

Code tip the gates were taken at: **`66645613`** (`fix(ux01): shim useRef in the walker's react mock`).
Full-suite gate of record taken at **`99a35da3`**, a docs-only commit whose code content is identical to
`66645613`. Base: `696e5880`. Node 26.5.0 against a declared 22.23.1.

**The four-count, from `full-99a35da3.json`:** test failures **143** · suite-load failures **0** · skips
**0** · unhandled errors **1** · passed/total **5049/5192** · files **32 failed / 419**. Against the
measurement of record's `170 / 1 / None / 1`, the continuation closed 27 rows and the suite-load failure.

Every number below is measured, not recalled.

---

## 1. The body: 122 render reds, and the cause of record was wrong about both halves

The measurement of record split `tests/render` into `100 × env:toolchain (consistent-with)` and
`7 × env:module-resolution (consistent-with)`, and the task brief turned the second one into an
**instruction to edit `vitest.config.ts`**. Both halves were hypotheses. One was right for the wrong
reason and one was simply wrong — and the wrong one came with a prescribed remedy.

**Half one — the 100 `localStorage` rows. Verdict upheld, STRENGTH raised to `entailed`, in two greps.**
The record had already cleared jsdom (it supplies `window.localStorage`). What nobody did was read the
runner. `vitest/dist/chunks/index.DC7d2Pf8.js:243-248`:

    if (k in global) return keysArray.includes(k);

A key already on `globalThis` is copied from the jsdom window **only** if it is in vitest's explicit
list — and `localStorage` occurs nowhere in that file (`grep '"localStorage"'` → rc=1). Node 26.5.0
declares the key and leaves it `undefined`. So jsdom's real object is filtered out and Node's
`undefined` survives. Two greps and one probe, against a verdict that had sat at `consistent-with`
through an entire measurement pass.

**Half two — the 7 null-dispatcher rows. Verdict REFUTED.** The record said "two React copies"; the
brief said to fix the `react`/`react-dom` alias. One command settles it:

    ls -d node_modules/.pnpm/react@*   →   node_modules/.pnpm/react@19.2.8   (exactly one)
    ls -l apps/ui/node_modules/react   →   symlink into that same directory

There is one React. No alias can reach this, and I changed none. The real cause is in the test:
`ux01-new-debate-form.test.tsx` walks the page by **invoking function components directly**
(`evaluateElementTree:86-88`), so it replaces React's hooks with a slot shim — `useState` and
`useEffect` only. The merge mounted `<SupportWidget />` (`^2`-only, three `useRef`s) into
`apps/ui/app/new/page.tsx`. Called outside a renderer with the real `useRef`, the dispatcher is null.

**The prices.** Diagnosis: ~6 minutes, 1 render run, 4 greps. Had I executed the brief literally, the
output would have been a config edit that fixes nothing, three runs proving it fixes nothing, and a
seat arguing with its own packet. The brief's own words — *"if `SupportWidget` imports React through a
path the alias does not cover, the fix is the alias"* — encode a conditional the seat is invited to
skip.

**The lesson, and it is the expensive one: a brief must never carry the remedy for a row whose STRENGTH
is below `entailed`.** A prescribed fix reads as a decision already taken. Every seat downstream pays
to re-open it, and the seat that does not re-open it ships the wrong change.

---

## 2. What I nearly got wrong — twice, in the same direction

**(a) I nearly filed 10 false merge-debt rows.** Six rows (`pda-s02` ×4, `load01` ×2) read files the
merge resolved toward `^2`; four more (`t3-library`) fail on counts that read exactly like a
regression. Three-hash provenance *supports* "merge-caused regression against the first parent" for
all ten. It does not prove it. Two cheap steps refuted all ten:

- **Ablation.** `PublicDebatePageClient.tsx` and `DebatePageGate.tsx` each differ from `^1` by exactly
  one thing — a fragment wrap adding `<SupportWidget />`. I restored `^1`'s blob and re-ran: all six
  rows stayed red (`4 failed | 2 passed (6)`, `2 failed | 8 passed (10)`). The merge is not the cause.
- **Grep the selector.** `t3-library` pins `[data-library-row]`. That attribute occurs **zero** times in
  `apps/ui` at HEAD, and `git grep -c` exits 1 on `5e617776^1` *and* `5e617776^2`. It never existed.

Cost of being right: ~4 minutes and two 2-second runs. Cost of being wrong: ten fabricated merge-debt
rows in the mission's closing document, and a downstream seat sent to repair `apps/ui` against them.

**(b) I nearly reported "100 rows are environment; they go green on Node 22".** I removed the
environment defect instead of predicting its removal — `NODE_OPTIONS=--localstorage-file=<scratch>`,
a pure measurement, no repo edit, no install:

    tests/render   115 failed | 219 passed   →   19 failed | 315 passed

96 rows were environment. **4 were real, independent failures the `TypeError` had been masking** — all
in `t1-canvas`, all reading blobs identical on both parents. A row that throws in setup never reaches
its assertion, so its verdict is *unknown*, not green. **Repairing the host will raise this suite's red
count by 4.** That sentence is the single most useful thing in this report for whoever runs the
Node 22 re-measure, and the confident version of it would have been false.

---

## 2b. The most expensive single defect: the brief's gate command silently produced no JSON

**Price: one wasted 45-minute full-suite run — the single largest cost of this seat.**

The brief's Step 5 dictates `pnpm test -- --reporter=default --reporter=json --outputFile=<path>`.
On pnpm 11.20.0 the bare `--` is forwarded **literally**, and vitest reads the three flags as positional
filename filters:

    $ vitest run -- --reporter=default --reporter=json --outputFile=/…/full-66645613.json

The suite ran all 419 files for 44.7 minutes, printed a correct-looking summary, exited, and **wrote no
JSON at all** — while the packet requires the four-count to come *from the JSON, never recalled*. Every
symptom of success was present; the instrument was absent. This is the same generating condition as the
mission's whole `multi-path vitest run` trap family: *the command was never run against an input designed
to make it lie.*

Two compounding mistakes were mine, and both are worth recording:

- **I wrote report files into the tree while the gate was running.** `tests/unit/text-control-bytes.test.ts`
  scans *"cached or untracked repository text sources"*. A gate taken over a tree the seat is still
  editing is not a gate. The re-run was taken on a committed, clean, untouched tree.
- **I did not prove the instrument before spending 45 minutes on it.** The fix — drop the `--` — takes
  **one second to verify on one test file**, and I only did that the second time. The mission already
  has a trap named *Prove the instrument can still say YES before reporting eight NOs*; this is the same
  law applied to a reporter rather than to an audit.

> **Upgrade #0, and the cheapest one here: any long gate must first be run in a one-file smoke form and
> its artifact asserted to exist.** `[ -s "$OUTFILE" ] || fail` after a 2-second probe would have saved
> 45 minutes. Better still, fix the recorded command: `pnpm test --reporter=… --outputFile=…`, no `--`.

## 3. What repeatedly cost tokens

**(i) Attribution was re-derived per seat instead of computed once per merge.** I re-measured blob
hashes for `DebateCanvas.tsx` and `DebateMap.tsx` that BUILD(CONT-T3) had already measured and
recorded. The fix is mechanical and should have existed on day one: three `git ls-tree -r <rev> -- <dir>`
calls plus ~20 lines of classification gave me *every* file in `apps/ui` — 182 of them — bucketed as
`identical | HEAD==^1 | HEAD==^2 | ^2-only | merge's-own-edit`, in one command. It bounded the merge's
blast radius from 182 files to **30**, and after that every attribution in the zone was a lookup.

> **Upgrade #1: make that a committed artifact.** Run it once at merge time for every zone, commit
> `merge-blast-radius.tsv`, and let every seat read it. It is ~30 lines and it deletes the single most
> repeated unit of work in this mission.

**(ii) Verdicts travel as prose, so they cannot be re-checked cheaply.** The measurement of record is
excellent reading and a poor instrument: every row is a paragraph, and a paragraph cannot be re-run.
Its `vitest.config.ts:7-8` citation had drifted to `:9-10` by the time I read it — a stale constant
that no tooling could catch because it lives in a sentence.

> **Upgrade #2: every verdict row carries a re-runnable EVIDENCE COMMAND and its expected output.**
> A verdict without one is a rumour. `git rev-parse <p1>:<path> <p2>:<path> HEAD:<path>` is the whole
> instrument for provenance; `git grep -c <selector> <rev> -- <dir>` is the whole instrument for absence.

**(iii) Compound shell commands were refused by the worktree guard and had to be re-issued
one-at-a-time.** Several `for`-loops over `git rev-parse` and one `git show | grep` pipeline were
rejected as "too complex to verify", costing round trips. Writing results to files and classifying in
`node` is both faster and immune to it — that is how the blast-radius tool ended up shaped.

**(iv) Renamed test titles silently break title-keyed ledgers.** Four titles were renamed by earlier
tasks, so title-keyed rows of the measurement of record no longer match. I was warned in the dispatch;
a seat that was not warned would have mis-joined them.

> **Upgrade #3: key rows by `file::index` or a stable id, never by the human title.**

---

## 4. Dead ends — recorded so nobody re-derives them

- **The `vitest.config.ts` react/react-dom alias is not the dispatcher cause.** One React in the store.
  Do not touch the alias; the fix is a hook shim in the one test that mocks `react`.
- **jsdom is not the `localStorage` culprit.** It supplies the object. The runner filters it out.
- **`PublicAnswerDisclosure.tsx` is defined and mounted nowhere** — on both parents and at HEAD. Rows
  that want its copy are pre-existing, not merge debt.
- **`author_pseudonym` has no render site on the public debate page** — only `DebatesBuffer.tsx:110`.
- **The `lockWaiters` class has exactly two live members**, not more: `s7-authorization-database.ts:940`
  and `memory-database.ts:219`. Every other `lockWaiters` hit under `tests/` is a fixture literal.
- **The hook-mock class has exactly one member.** `ux01-new-debate-form.test.tsx` is the only test under
  `tests/render` or `tests/unit` that calls `vi.mock("react")`. The sweep is complete at one.

---

## 5. Where the packet and brief were wrong or unclear

1. **Stale line citation.** The record (and the brief through it) cites `vitest.config.ts:7-8` for the
   react alias. Lines 7-8 are `next/navigation` and `@`; the react aliases are at **`:9-10`**.
2. **Wrong path in the read-surface.** The packet names `apps/ui/components/SupportWidget.tsx`. The file
   is `apps/ui/components/support/SupportWidget.tsx`.
3. **A remedy attached to a `consistent-with` verdict** (Step 2, the alias). See §1.
4. **No branch for "merge-caused, but the fix needs a ruling".** Step 3 says `merge-caused → fix`.
   `t9-landing` is merge-caused and `entailed` — `^1` has `return <LandingPage />;`, `^2` and HEAD have
   `return <><LandingPage /><SupportWidget /></>;`. Both available fixes are product decisions:
   delete a shipped widget from the landing route, or loosen a shape oracle. The mission's
   `DECISIONS.md` carries **no** ruling on the widget's surfaces. I declined to settle an open
   product question inside the gate I exist to take, and drafted a ticket instead. **The brief needs a
   third outcome:** `merge-caused → fix` | `pre-existing → ticket` | **`merge-caused, remedy contested →
   ticket + named decision owner`**.
5. **`timeout` is not installed on this host** (carried in the dispatch, not the packet). Worth promoting
   into the packet template, next to the `pnpm`/Node facts.

---

## 6. How to make it closer to a one-prompt machine

1. **Preflight the declared toolchain and fail loudly.** Every gate log in this mission carries
   `Unsupported engine: wanted 22.23.1 (current v26.5.0)` as a `[WARN]`, and 100 reds plus 4 masked
   reds followed from exactly that. A warning nobody is obliged to read is not a control. Make the
   gate runner refuse, or stamp `ENGINE MISMATCH` on every count it emits so no verdict can be quoted
   without it.
2. **Standing rule: remove the environment defect, then re-measure, before any `env:` attribution.**
   It is the only way to learn what the defect was hiding. Here it was hiding 4 real reds.
3. **Ship the blast-radius artifact** (§3(i)). One command, committed, read by everyone.
4. **Evidence commands, not prose verdicts** (§3(ii)).
5. **Forbid remedies in briefs below `entailed`** (§1).
6. **Make ablation a named, first-class step** next to three-hash provenance. Hashes narrow *which file*;
   ablation decides *whether that file matters*. It cost seconds here and overturned ten rows.
7. **One cheap habit worth institutionalising:** when an assertion fails on a *selector* or a *symbol*,
   grep it across both parents before reading a single diff. Absence on both is `entailed` pre-existing
   in one command, and three of my six row-families ended there.

---

## 7. Honest shortfalls

- The two RSS gates are recorded as `env:host-load`, **not** re-measured on Node 22.23.1 — installing a
  runtime was out of contract. Their bounds are untouched.
- `memory-database` and `s7-authorization-database` are `env:host-load` at **`consistent-with`**, not
  `entailed`: both are bounded wall-clock polls (150 ms / 100 ms) over `pg_stat_activity` that measured
  1 against `>= 2`. I did not re-run them under a quiet host, so the timing hypothesis stands untested.
- I ran three short render probes (~10 s of CPU total) while the full suite was running. Load-sensitive
  rows in that window carry that caveat; it is disclosed rather than hidden.
- I did not re-open the record's already-attributed rows, with one exception I name as a finding:
  `s8-publication-contract` › *ships the deliberate controls and public-only reader* is recorded as
  merge-caused, but `PublicAnswerDisclosure` is mounted on **neither** parent. That attribution deserves
  a re-check by whoever owns it; it is outside my assigned set and I did not fix it.

Full attribution table, RED/GREEN frames, the mutant table, the four-count and the KNOWN REDS block:
`/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/.superpowers/sdd/2026-09-16-algorithm-live-loop-continuation/task-9-report.md`

---

## 8. Addendum — fix round 1 (FINDING F1), gate tip `78e89ea4`

I closed my first pass with one red name and no owner: `tests/unit/v2ui-node-runner.test.ts` ›
*executes the maintained 31KB scoring-response behavioral suite*, filed **UNATTRIBUTED** because the
measurement of record listed it green and it was not among my assigned 21. The coordinator pushed it
back under D64 ADDENDUM 8. That was correct, and the reflex I got wrong is worth naming precisely:

> **A row that is red at the tip and green in the baseline is this branch's by default.** "It is not in
> my assigned set" is a statement about the packet, not about the code. The whole diagnosis took about
> four minutes; declining to spend them cost a review round.

**Cause.** Commit `58ba1376` (BUILD(CONT-T3)) changed `.libTab { font-weight: 700 → 600 }` in
`apps/ui/app/globals.css` — correctly, because `tests/unit/pda-s03-keyboard-accessibility.test.ts:193`
pins `"600"` as the ruled value. But the same constant was independently pinned at `700` by
`apps/ui/components/debateReferenceDesign.source-test.mjs:71`, a **node** source test that the root
vitest gate only reaches through a spawned subprocess. Fixing one oracle broke the other.

**Two upgrades come out of this, and both are cheap:**

1. **A constant pinned by more than one oracle needs one named source.** Nothing connected
   `pda-s03`'s `"600"` to the source test's `700`; they are different runners, different assertion
   libraries, different directories, and the only thing they share is a CSS property. A seat fixing
   one cannot discover the other by reading its own cluster. The cure is a grep-able registry of
   cross-oracle constants, or at minimum a comment at each pin naming its sibling — which is what I
   left behind at the site I fixed.
2. **A nested-runner gate must name the inner failure in its own message.** The vitest row's entire
   evidence was `expected { status: 1, … } to match object { status: 0 … }` — the inner runner's
   stdout and stderr were captured into the assertion object and then *omitted from the printed diff*
   ("2 matching properties omitted"). The failing test's name, file and regex were all present and all
   invisible. Every reader of that gate line has to re-run the subprocess by hand to learn anything.
   **Assert on the inner runner's parsed failure list, not on its exit status** — or at minimum print
   `result.stdout` on failure. Priced: one manual re-run per person who ever meets this row.

**What the fix was, and was not.** `700 → 600` in the source test, with the ruling cited in place. It
is not a weakening: the regex still pins an exact weight, and the two oracles now agree on one value.
The mutant check was exactly this — restoring `700` turns the row RED again, so the assertion still
catches the thing it exists to catch.

**Method note worth keeping.** `git bisect run` confirmed `58ba1376` in six steps of two seconds each,
but the direct evidence was cheaper and arrived first: the source test's blob is `26bf5d13` at **both**
ends of the range (so the test never moved), and `git log -- apps/ui/app/globals.css` returns exactly
one commit in the range. **When a row flips inside a branch, compare the test's blob at both ends
before bisecting** — if the test is unchanged, the cause is in what it reads, and `git log -- <that
file>` often names it outright.

**Gate at `78e89ea4`:** 142 test failures / 0 suite-load failures / 0 skips / 1 unhandled error;
5050/5192 passed; 31 of 419 files. The failing-file diff against the previous gate is a single line —
`v2ui-node-runner` removed — so nothing else moved. **No red name is left without an owner.**
