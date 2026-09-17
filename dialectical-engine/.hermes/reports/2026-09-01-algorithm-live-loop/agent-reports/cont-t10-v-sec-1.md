READY FOR HERMES STAGE REVIEW · comments read through: none (no Hermes board in this continuation; the SDD ledger is the board)

# cont-t10-v-sec-1 — BUILD(CONT-T10), fold-lane FL-1 (V-SEC-1) — self-report

Seat `cont-t10-v-sec-1`, node BUILD(CONT-T10), pass 1 of 3, Opus 5.
Base `a30c549f` (verified before any change) → tip `0190e944`.
Branch `mission/2026-09-16-algorithm-live-loop-continuation`, worktree
`.claude/worktrees/algo-loop-2026-09-16/dialectical-engine`. 2026-09-16.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

---

## 1. The case, in one paragraph

The victim was supposed to be `packages/serve/src/index.ts`. Every document in the
chain — D26, the V-DECISIONS-PACKET row, the task brief — said the same thing: a
patch written on 2026-09-02 against `b5a6b6eb` had to be **ported by hand** onto a
serve file that six later lanes had rewritten, because its three regions had moved.
D26 went furthest: *"the fold is a PORT onto the post-W8 serve file … not a git am."*

That is not what happened. Measured, the `answer_form` site set is **identical** at
the patch base and at this branch's pre-merge tip — the same four roles (INSERT
column, projection row type, projection SELECT, projection return), just 880 lines
lower. `git merge --no-ff` was clean, and the product reconcile was a **no-op**.

The real defect was one line away from where everybody was looking, in the handoff's
**own test fixture**: T9 had added four required fields to `ServeGateResult`, so the
merged tree gained a `TS2739`. The suite never saw it — **vitest transpiles and does
not typecheck**. Three green runs, 90/90, over a tree that did not compile.

**Cause, named:** the fold's risk was located by *narrative* (which lanes rewrote
which file) instead of by *measurement* (which symbols each side actually binds).
Narrative pointed at the product; measurement pointed at a test's type.

## 2. What must be upgraded

**U1 — A fold gate is the suite PLUS the compiler, both read against a measured base.**
This is the single highest-value change here. The brief listed `pnpm run typecheck`
as a step, but *after* the GREEN step, i.e. as a formality after the verdict was
already taken. Had I stopped at "90/90 three times", I would have handed up a fold
that does not compile, with three honest green transcripts attached. Make the
typecheck **the first gate after a merge**, not the last.

**U2 — Baselines cost 30 seconds and settle arguments that otherwise cost a round.**
`git checkout --quiet <base>` in the seat's OWN worktree, run, checkout back,
`git status --porcelain` empty on both sides. No new worktree, no stash (the stash
stack is shared here and popping it is a live hazard). I used it three times:
typecheck (0 → 1 → 0), `audit:source` (byte-identical), `audit:architecture`
(byte-identical). Every "pre-existing, not mine" claim in my handoff is a **diff of
two logs**, not an argument. A packet should say *"baseline it this way"* once,
instead of each seat inventing a way to be sure or, worse, asserting.

**U3 — Record the KILL LAYER of every mutant, not just RED/GREEN.**
Mutant M1 (write-site carrier bypass) did not fail the assertion it was built for.
It failed **inside PostgreSQL**: `core.enforce_content_ciphertext()` raised
`CONTENT_PLAINTEXT_WRITE_FORBIDDEN` at the INSERT, so the plaintext row never
existed. Both outcomes print `Tests 1 failed | 1 passed`. A mutant index that stores
only the verdict cannot distinguish *"the application preserved the invariant"* from
*"the application broke it and a trigger saved us."* Here it is good news — real
defence in depth — but the transcript alone does not say so.

**U4 — Diff the SITE SET, not the file.** "T9 rewrote that file" and "T9 moved the
sites your patch binds" are different claims. `git show <base>:./<path> | grep -n
<symbol>` against `grep -n <symbol> <path>` answers the second in one call and would
have retired three documents' worth of porting anxiety at the very start of the lane.

**U5 — Numbers in briefs are timestamps.** The brief said `0062` three times; `0062`
had been taken by `obs_view_owner_column_floor` since the brief was written, so the
measured slot was `0063`. This was cheap **only because the original author designed
it to be**: the migration's number is load-bearing for nothing, and both tests locate
the file by suffix regex. That is the pattern to generalise — a handoff artifact
should carry no constant its own consumer must guess right.

## 3. What repeatedly cost tokens

| Cost | Price | Cause |
|---|---|---|
| `git show 40d1e3a3 -- dialectical-engine/packages/serve/src/index.ts` returned **empty** | 1 call + the pause to be sure "empty" ≠ "the commit did not touch it" | The packet quoted a **git-root-relative** pathspec for a command run from `dialectical-engine/`. Already trap `:873`; this time the wrong rooting was *inside the packet*. |
| `ls vitest*.ts vitest*.mts` | 1 call | zsh aborts the WHOLE command on a non-matching glob. Fifth family member in this file. |
| A `sed -n "$(grep …)"` one-liner | 1 call, refused by the harness | Worktree isolation refuses a command whose argument is computed at runtime where an option may stand. Two plain calls are cheaper than one clever one. |
| Re-running the six-file gate | 3 runs × ~6.5 s | I took the gate, *then* edited the test file for U1. Trap `:4924` says a gate over a tree you are still editing is not a gate — correct and obeyed, but it was avoidable by running typecheck before the first gate (U1 again). |

Nothing here is expensive in isolation. The pattern is: **every one of them is a
known entry in `TOOLING-TRAPS.md` that a seat re-pays because the index is read as
headings and the bullet is only read after the burn.**

## 4. What I nearly got wrong

**(a) I wrote a claim into a commit message before measuring it.** The reconcile
commit body says *"audit:source unchanged"* — and at the moment I wrote it, I had run
`audit:source` on the tip only. The baseline came **after** the commit. It matched
byte for byte, so the sentence is true, but it was true by luck for about ninety
seconds. `verification-before-completion` is usually taught against the final
handoff; a **commit message is a completion claim too**, and it is the one that
outlives the session. I disclose it here rather than quietly re-ordering the story.

**(b) I nearly read `2.00s` as a broken run.** RED and GREEN both reported ~2 s for a
suite the peer had timed at 9.7 s on real embedded PostgreSQL, and my first instinct
was "this did not really run" (trap `:201`). I checked the log instead of the summary
line: real `initdb` output, a real `to_jsonb(answer)` row with real UUIDs, and a real
`CONTENT_PLAINTEXT_WRITE_FORBIDDEN` from `pl_exec.c` later on. The runs are real; the
peer's number was taken on a different machine. **A duration that surprises you is a
prompt to read the log, not to re-run.**

**(c) I nearly "fixed" the drizzle mirror.** D26's open point (3) says in as many
words that *"FL-1 adds them"* — the two carrier columns missing from
`packages/db/src/schema.ts`. My packet's `allowed` list is exhaustive and does not
contain that file. **The packet wins over the ruling it implements**; I named it as a
finding and did not touch it. This is a genuine conflict between two authorities and
the next packet should resolve it explicitly rather than leave it to a seat's nerve.

## 5. Dead ends, so nobody re-derives them

- **`git show <sha> -- dialectical-engine/<path>` from `dialectical-engine/`.** Empty
  output, exit 0. Use the cwd-relative pathspec, or `<sha>:./<path>`.
- **Looking for a new persisted copy of the served statement in T9's work.** There is
  none. `serve.synthesis_round` (migration `0057_t09_synthesis_round.sql`) stores
  artifact refs and call-site keys only — the first draft that stored the transcript
  was removed in review, and the migration's own header says why. The synthesis
  loop's text reaches disk through exactly two carriers, both now encrypted.
- **Looking for a second writer of `serve.answer`.** `INSERT INTO serve.answer` has
  one site repo-wide. `UPDATE serve.answer` at runtime: none (only historical DML in
  `0007_s05_rework.sql`, which applies long before the guard exists). Every reader
  outside `packages/serve/src/index.ts` goes through `readAnswerProjection`.
- **`grep` alternation.** Both `\|` and `-E` work on this host's `grep` for this
  pattern; the ugrep BRE trap did **not** bite here. Do not "fix" a packet's `\|`
  blind — check, because the two binaries differ (`:4380`, `:4383`).

## 6. Where the packet was unclear or wrong

1. **`0062` vs `0063`** — brief Steps 2, 5 and the Files list. Predicted; measured
   otherwise. Handled as the packet instructs (measurement wins), recorded as a
   finding. *Not* a defect I absorbed.
2. **Git-root-relative pathspec in the packet's own read command** (§1 inputs).
   Returns empty from the stated cwd.
3. **"Commit the merge, the rename and the reconcile as separate commits"** presumes
   the reconcile is a code change. It could legitimately have been a proof with no
   diff — the packet should say what to do when a mandated commit has nothing to
   commit. (It turned out to have one, for a reason nobody predicted.)
4. **The `allowed` list vs D26 open point (3)** — see §4(c). Unresolved by design or
   by oversight; either way the next packet should say which.
5. **`ls node_modules/.bin/vitest` / `ls packages/contract/generated/`** — good,
   cheap preconditions. Keep these in every packet. They cost two seconds and they
   are the difference between a real RED and a broken harness.

## 7. Toward the one-prompt machine

The three changes that would have let this lane run unattended, in order of value:

1. **A `fold` verb with a fixed, measured recipe.** This lane is a *category*, not a
   one-off: take a dated patch from a peer branch, land it on a moved tree, prove it
   still means what it meant. The recipe is short and it does not need a human:
   `RED (their test, our code)` → `merge` → `diff the site set, both revisions` →
   `typecheck against a measured base` → `suite ×3` → `mutant per site class, kill
   layer recorded` → `audits diffed against base`. Every step is a command with a
   pass/fail oracle. The judgement calls in this lane were all *within* those steps.
2. **Make every gate self-baselining.** A gate that prints only the tip's number
   forces a human (or a round) to answer "was that already broken?". A gate that
   prints `base=0 tip=0` answers it in the artifact. Cost: one checkout, ~30 s.
   This alone removes most of what "pre-existing failure" arguments cost this repo.
3. **Let the packet carry the trap BULLETS, not the heading index.** The reading
   floor makes a seat grep headings and read bullets on demand — which in practice
   means reading them *after* paying for the trap. The orchestrator already knows
   this lane is `merge` + `migration` + `vitest`; pasting those four bullets into the
   packet costs ~40 lines and would have saved three of the four costs in §3.

One thing to keep exactly as it is: **the refutation duty**. The four mutants are the
only reason I can say the tests pin the *property* and not the *text* — N1 (a pure
rename across six sites) stayed GREEN, and the s6 architecture test, which pins source
text, would have caught it. Two instruments, two different jobs, both intact. Without
the neighbour mutant that sentence would have been a hope.
