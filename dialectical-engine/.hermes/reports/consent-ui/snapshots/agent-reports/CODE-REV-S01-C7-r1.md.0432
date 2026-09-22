# CODE-REV-S01-C7 r1 — self-report (Claude Opus 5, mission `consent-ui`, blind per-cluster review of S01-C7 + the C6 follow-up + the ADR index)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

Seat: CODE-REV-S01-C7, reviewer, fresh blind session, round 1 of max 3.
Subject: `89f653ff`, `810cfaef`, `4ddc350c` on `slice/consent-s01`; base `97859c58`, HEAD `4ddc350c`.
Worktree: `.worktrees/rev-s01-c7/dialectical-engine`, detached at `4ddc350c`, porcelain 0 on entry and on exit.
Verdict: **PASS**, 4 non-blocking findings, 3 packet findings, 0 blocking.
Probe kit promoted to `.hermes/reports/consent-ui/probes/code-rev-s01-c7-r1-*` (4 files).

---

## 1. The body — in order of what it would have cost

### 1.1 The §10.40 zsh trap bit ME, in the direction of falsely REFUTING the author's F1

Measuring F1 (the `n_s02c` moving-ref defect) I wrote, inline in the tool shell:

```
P="apps/ui/components/consent/modalSemantics.ts apps/ui/…/PrivacyPolicyModal.tsx …"
git log --oneline "$ref"..HEAD -- $P | grep -c …
```

zsh does not word-split an unquoted `$P`, so git received **one** pathspec — the four paths joined
by spaces, a file that does not exist — and every ref in my sweep printed `0`. The table read:

```
n_s02c(44744d8d) = 0
n_s02c(e8bf0658) = 0        <- FALSE
n_s02c(slice/consent-s02) = 0   <- FALSE
```

That is a **plausible answer that contradicts the author's finding**. Had I pasted it, I would have
filed "F1 not reproducible — the arm reads 0 against every ref" as a finding against a seat whose
measurement was correct, and the PLAN defect would have been closed as phantom. The tell was that
the number I *expected* to be 1 (the arm the command itself had just printed as 1, three lines
earlier in the same session) came back 0 — an internal contradiction inside my own transcript.

**CAUSE:** COMMON §10.21 already says "§10.16 binds every grep that COUNTS, not only acceptance
commands". I read it, and still typed the probe inline because it was "just a git log". The rule is
not about greps: it is about **every measurement whose output is a number**.
**PRICE:** one round-trip (~2 min), and a near-miss on a false finding against another seat.
**FIX (one line for COMMON §10.40):** *a probe that COUNTS runs from a `.sh` under `/bin/bash` with
an ARRAY pathspec — inline zsh is for commands whose output you read, never for commands you count.*

### 1.2 The author's own TOOLING-TRAPS entry paid for itself inside one hour

My harness asserts each mutation anchor is UNIQUE before planting, and asserts the file's md5 CHANGED
afterwards — I wrote both because of the entry the author appended at `TOOLING-TRAPS.md:2310`
("a mutant harness that ABORTS prints the UNMUTATED suite result"). It fired immediately: my MX4
anchor `export function` occurs **4×** in `modalSemantics.ts`, and Python's `str.replace` would have
planted four mutants silently. The assert aborted, I re-anchored on `"use client";`, and the frame I
pasted describes the mutant I named.

This is the cleanest evidence I have seen that the trap file is load-bearing rather than ceremonial:
an entry written at 03:2x prevented a wrong reading at 03:5x, in a different seat, on a different
file. **Upgrade:** the trap file needs a *dedupe* pass, not more entries — see finding N4 (macOS
`cat -A` is now recorded twice, `:1046` and `:2364`, in a 2408-line file every seat reads FIRST).

### 1.3 Running mutants against the CLUSTER command is 4× the cost of running them against the CASE

`CMD-C7` takes ~9 s (six render files + `t9` + `pnpm typecheck`). The guard file alone takes ~2 s.
Twenty-one mutants × 7 s saved ≈ 2.5 min of wall clock and a third of the output tokens, with no loss
of evidence: the mutant's evidence is the failing CASE's frame, and the cluster command adds only
arms that cannot move under a source mutation (`n_blocks`, the `t9` hit list, the typecheck pin).
**Rule worth adding to `heartbeat-reviewer` §2:** *the GATE is run ×3 as the command the plan names;
each MUTANT is run against the smallest file that carries the case, and the gate is re-run once at
the end.* The PLAN wording "run `CMD-C7` after each" costs every seat the same 4×.

### 1.4 The finding belongs to the artifact that CAUSED it, not the one you found it in

Two of my four findings (N1, N3) are holes in guards the author transcribed **verbatim under
COMMON §10.43**. My first draft had them as findings against the seat. They are PLAN findings: the
seat was ordered not to paraphrase, and the wording is the defect. This is the same shape as the
author's own F2, arriving one layer out — and it is worth a standing sentence in `heartbeat-reviewer`
§3: *before numbering a finding, name the artifact whose text produced it; a seat that obeyed a
verbatim-transcription order is never the addressee.*

### 1.5 What I nearly got wrong

- I nearly reported the second arm of S01-S45 as unverifiable, because both the PLAN (`:570`) and the
  test's own comment say "UNVERIFIED by mutation from S01". That is true **for S01** and false for
  **me**: my worktree is detached and disposable, so mutating `modalSemantics.ts` costs nothing.
  It failed the other way in 3 s (M45b). A reviewer inherits none of the author's file contract, and
  should read every "cannot be mutated from here" as "mutate it from here".
- I nearly accepted "the ref moved" as F1's mechanism. The measured predicate is sharper and it
  changes the fix: the arm reads 0 **iff the ref is an ANCESTOR of HEAD** — see §2.

## 2. Dead ends, so nobody re-derives them

- **Reasoning about git's merge simplification to explain `n_s02c`.** I spent two paragraphs of
  thought on why `44744d8d..HEAD` drops the merge and `e8bf0658..HEAD` keeps it. A six-line ref
  sweep answered it: `n_s02c` is 0 for every ref that is an ancestor of HEAD and 1 for every ref that
  is not. Run the sweep; do not reason about revision walks.
- **`cat -A`** is not available on macOS (the author's entry is right, and it was already at `:1046`).
- **`${PIPESTATUS[0]}`** is empty in zsh (it is `$pipestatus[1]`); an exit-code capture written that
  way prints `exit=` and reads as "no output", not as "wrong shell".

## 3. What repeatedly costs tokens in this harness

1. **Relative pointers to mission docs.** My packet cited the dispatch snapshot as
   `snapshots/packets/CODE-S01-C7.md.at-dispatch`; that path does not exist under the packets
   directory (it is under `.hermes/reports/consent-ui/`). COMMON §10.45 exists **because this
   already happened once** (CODE-S01-C6 F4) and the packet still shipped a relative one. A packet
   linter that rejects any non-absolute mission-doc path would close the class for good.
2. **Reading a 22 KB handoff plus a 4.6 KB correction to recover four words.** The correction is
   exemplary, but the cost is structural: board comments are immutable, so a corrupted post is paid
   for twice by every downstream reader. COMMON §2's CLI block should carry the `"$(cat file)"` rule
   in its own sentence (the author's recommendation 0 — I second it, measured from the consumer side).
3. **Counts restated across artifacts.** The self-report was "215 lines" in the handoff and 253 at
   exit; TOOLING-TRAPS was "2306 → 2367, four entries" in the handoff and "2306 → 2408, five" in the
   final note. Both are honest write-as-you-go drift, and both forced me to re-measure. **A count
   stated in a handoff should name the moment it was taken, or be replaced by the command.**

## 4. How to make this more of a one-prompt machine

1. **Cross-check every `accept:` line against the mutant named beside it, on paper, at plan-review
   time.** The author's F2 is a blocking defect that survived a full ARCH review and its own blind
   re-review, and costs seconds to detect. This is the single highest-yield check I have seen in
   this mission.
2. **A guard whose acceptance is a LITERAL TOKEN LIST publishes its known evasions.** Measured here:
   `.focus({ preventScroll: true })` and a computed event name both walk through S01-S45 (N1).
   Not a defect of the guard — a defect of reading a token list as if it were the property.
3. **A guard TERM may not reference a ref another lane can advance** (F1, generalized): the term is
   satisfiable only while the ref is an ancestor of HEAD, which no seat controls.
4. **Reviewers get a one-line mutation harness in the mission's probe directory.** Mine is promoted
   as `code-rev-s01-c7-r1-mutants.py`: 22 named mutants, anchor-uniqueness assert, md5-changed
   assert, `cp` snapshot/restore, `diff -q`, `git status --porcelain` after each. The next reviewer
   should copy it and add rows, not rewrite it — the harness is where the traps live.

## 5. Where THIS packet was unclear, exactly

- **§1's snapshot pointer is relative** (finding P1) — cost one directory hunt.
- **"re-run CMD-C7 ×3 and CMD-C6 ×3 … AND inline"** does not say whether the three-run rule means 3
  per arm or 3 total. I ran 3 per arm (6 each, 12 runs). Say "three per arm".
- **"the S01-S45 second arm"** is named in §4 as something I must plant, while both the PLAN and the
  test call it unverifiable-from-S01. The packet is right and the tension is real; one clause
  ("your worktree is detached, so S02's file is yours to mutate") would remove the hesitation.
- **The neighbour list says "confirm at least three"** of six. Confirming all six cost 12 s. A floor
  that low invites sampling where sampling is not needed.

## 6. What I could NOT verify

- The dev-stack half of S01-R26/R27 (both modes live, `prefers-reduced-motion` honoured by a real
  browser). jsdom sees the stylesheet as bytes; V's acceptance steps are the only oracle.
- That the author's TWELVE runs happened as tabulated. I re-ran twelve of my own; identical figures
  are consistent with the claim, not proof of it.
- Anything about slice S02 beyond the two files S01's guards read.
