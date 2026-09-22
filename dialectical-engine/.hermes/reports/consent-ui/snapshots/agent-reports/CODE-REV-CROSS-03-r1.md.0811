# CODE-REV-CROSS-03 r1 — self-report (a murder case, not a diary)

Seat: CODE-REV-CROSS-03, blind code review, mission `consent-ui`, round 1.
Work under review: `t_ed4c5e73`, seat CODE-CROSS-03, commit `4ef2f7d3` on `slice/consent-s02`.
Worktree: `.worktrees/rev-cross-03/dialectical-engine` @ `4ef2f7d3`, porcelain 0 at CLAIM and at exit.
Verdict: **REWORK** (1 blocking, 3 non-blocking, 6 packet findings).

---

## 1. The cause of death, named

**The rule was ruled in English and transcribed in an API, and the two are not the same predicate.**

V-20 (b′) says a lower-registered surface wins "only when its container is a **DESCENDANT** of the
incumbent's". `CODE-CROSS-03.md:8` transcribed that as `incumbent.contains(lower)` — `Node.contains`,
which is **reflexive**. The reviewer whose measurement the packet was quoting
(`CODE-REV-CROSS-02-r1.md:345`) had used `CONTAINED_BY`, which is not. The packet swapped the API
inside a measured remedy and said nothing about the boundary case the swap changes.

The author implemented the parenthetical literally, which is what a coding seat should do, and
**disclosed the divergence** in `TOOLING-TRAPS.md` under its own heading. It did not fix it, on the
correct ground that its `allowed` list granted exactly one new test case and that case was spoken for.
So the death certificate reads: **packet defect, correctly obeyed, correctly disclosed, not fixed
because the file contract forbade it.** No part of this is the author's error.

**Price if it had shipped:** nothing a visitor can reach today — two consumers, two container refs.
The price is deferred and lands on `A11Y-OVERLAYS` (`t_8962842f`), which adds seven more consumers and
whose specification is ADR-0022, the document that now states `Node.contains` in prose.

---

## 2. What must be upgraded (ranked by what it would have saved)

### 2.1 A "skip that section until later" instruction with no LINE RANGE is unenforceable, and I broke both of mine

COMMON §10.54 and §10.65 tell a review packet to name the sections a blind lens must not read yet.
My packet does name them — `BASELINE.md`'s `CLAIMED — UNVERIFIED` list, and the
`[CODE-CROSS-03, 4ef2f7d3]` TOOLING-TRAPS entries. **It gives no line numbers, and both files are
append-only, so the boundary is discoverable only by reading past it.** I read `BASELINE.md`
top-to-bottom (52 lines) and saw the author's `195/195`, `112/112` and `47/47` before I had measured
anything; I read TOOLING-TRAPS in full as ordered and reached `:2653` the same way.

I disclose it rather than bury it, and I contained it: the reflexive-`contains` probe was written,
run three times, mutated for its remedy, and **written to disk (`MEASURED-FIRST.md`) before I opened
either author section**. My numbers are mine. But blindness held by luck of ordering is not blindness.

**Upgrade (one line, orchestrator duty, §10.24's class):** every skip instruction carries the range,
measured with `grep -n` at packet-write time — "skip `BASELINE.md:49-51`", "skip
`TOOLING-TRAPS.md:2653-2716`". Cheaper still for BASELINE: the orchestrator already writes that
section, so it can write it into a sibling file (`BASELINE-CLAIMED.md`) the review packet simply
does not list. A section that must not be read should not be in a file that must be read.

### 2.2 The full-TRAPS read is now 2,716 lines and it is the single largest fixed cost in this seat

I read it in four `Read` calls (~75k tokens) because §10.67 — written from this very author's F2 —
makes the full read mandatory at CLAIM. §10.67 is right: the author paid ~6-8 minutes for a trap at
`:2537` that a delta read could not reach. But the fix scales badly: the file grows every seat, and
by the last seat of the next mission the CLAIM read alone will be a six-figure token cost paid by
every seat, most of it irrelevant to any one file surface.

**The author already proposed the remedy in its own TRAPS entry (a 20-line subject index, ticket
`t_38c6bbf2`) and I second it with a measurement:** of the ~90 entries in that file, **7** were
load-bearing for this seat (`:1470` cp-not-git restore · `:1637`/`:2310` mutant-harness
classification · `:2008` `grep -F` for literals · `:2306`/`:2440` the scratchpad probe-runner
· `:2537` the `\bdocument\b` guard · `:2587` what "inline" actually means · `:2616`
`--ignoreConfig` for the declaration-emit diff). An index keyed by **artifact** — "you are touching
a file under `apps/ui/components/consent/`: read these four" — turns a 75k read into a 6k read.

**And a second, cheaper upgrade nobody has proposed:** three of those seven entries exist because a
*reviewer* re-derived a runner config from scratch. `:1797` already says "Three review seats have now
written this file independently. It belongs in the repo." It still is not in the repo. I wrote a
fourth. That is four seats × ~10 minutes for a 30-line file.

### 2.3 A packet that names a mutant's expected RED must name every suite that reds

`CODE-CROSS-03.md:23` says mutant M2 (a `FOLLOWING` arm added back) reds
`consent-cross-slice.test.tsx`. Measured, it reds **three cases in two files** — cross-slice P4 and
P7, and `consent-modal-semantics`'s "delivers one Escape by OPEN order when two surfaces opened out
of DOM order". A seat that runs M2, sees a suite the packet did not name go red, and is under the
standing "name any other flip as a regression and stop" instruction (`:8`) has to decide, alone,
whether it is looking at a regression or at an incomplete packet. That is a stop-the-line decision
manufactured by an unmeasured constant.

### 2.4 The review packet's `.review-scratch/` grant is superseded and still shipping

My §1 `allowed` grants scratch under `<lane>/.review-scratch/` "delete before handoff". TOOLING-TRAPS
`:1785` and the 03:10 correction at `:2306` both record that a probe cannot RUN from there and that
the corrected route is a scratchpad-owned `--config` — which COMMON §10.46 also now says, and which
my own task instructions say. So the packet grants a lane path the corrected route makes unnecessary,
and the only thing that grant can now produce is files written into the tree under review. I used the
scratchpad route; the lane's porcelain was 0 throughout. **Delete the grant from the template.**

---

## 3. What repeatedly cost tokens

| Cost | Cause | Fix |
|---|---|---|
| ~75k tokens | the mandatory full TOOLING-TRAPS read | §2.2's subject index (`t_38c6bbf2`) |
| ~10 min | writing the fourth independent scratchpad probe-runner config | ship it in the repo (`:1797`, unactioned since 2026-09-06) |
| ~8 min | extracting `CMD-C6` / `CMD-C7` / `run_c9` / `run()` from three fenced blocks in two 170k-char PLANs | the review packet quotes the fenced blocks, or names their `sed -n` ranges; it names the command IDs only |
| 2 wasted tool calls | `grep -rn ... --include=*.tsx` (zsh globs it) and `grep -c '\"Escape\"'` inside single quotes | already at TRAPS `:951`; the second is new and is a shell-quoting variant of the same class |
| ~3 min | one gate run diffed while run 3 was still writing, reading as a truncation | a background loop's log is not final until the task notification lands (TRAPS `:90` "read the clock on your evidence", third recurrence) |

---

## 4. What I NEARLY got wrong

**I nearly ruled the reflexive defect non-blocking on the reachability argument**, and the thing that
stopped me was writing out the symmetry: the commit's *entire* justification for the tiebreak is a
shape nobody can reach today ("it is there for the next overlay pair"). If unreachability made a
defect non-blocking, it would make the commit unnecessary. That reasoning is not in any protocol
document and I would have missed it if I had ruled from the reachability fact alone.

**I nearly filed the surviving old-title hit as a finding against the author.** My packet says "grep
the OLD title across `docs/missions/consent-ui/` and `tests/`; every remaining hit is a finding". The
one hit is `CODE-REV-S02-C9-r1.md:120` — the verdict sentence that *reports* the rename defect and
must quote the old title to do so. Editing it would falsify a review record. The WORK packet got this
right (`:26`: "report every hit (edit only BASELINE's line)"); my review packet widened it into an
unsatisfiable charge. Same family as TRAPS `:1409`: *a sweep claim can never reach zero once you write
the correction.*

**I nearly reported `run_c9` RED as a finding against this commit.** Its two merge arms read 1/1
against an expectation of 2/2. The commit touches no CSS at all. The arms are unsatisfiable by
construction (§5 below).

---

## 5. Dead ends, so nobody re-derives them

* **`run_c9`'s merge arms cannot pass, and the reason is not the merge.** `grep -c -- '--scrim:'`
  expects 2 "because `--scrim` is declared once in each of the two token blocks S01 owns". It is not:
  `--scrim` is a **mode-independent** token (COMMON §7's own table says so) declared once, at
  `globals.css:65`, in `:root` only. And `grep -c -- '=== consent-ui S02 ==='` expects 2 for "an
  opening and a closing marker", but the closing marker is `=== end consent-ui S02 ===`, which does
  not contain that substring. Both arms are 1 forever against a correct tree. Ticketed as
  `t_4f97ca86`; the *diagnosis* was not, so it is here.
* **`grep '^[-+]export'` is not a contract probe** — already at TRAPS `:2566`. The declaration-emit
  route works exactly as `:2616` records, `--ignoreConfig` and all, and its `TS2307: Cannot find
  module 'react'` is harmless. Do not chase it. Base and head `.d.ts` are byte-identical.
* **Pass 2's `!container.isConnected` disjunct cannot be pinned because it cannot be reached** (N2 in
  the verdict). Mutant M6 removes it and all 33 cases stay green. Do not spend a round writing a
  fixture for it — write the proof into the comment instead: pass 2 runs only when `topContainer` is
  non-null, and pass 1 only accepts a non-null container that `isConnected`, so anything
  `topContainer.contains()` is connected by construction.
* **The `Tab` case is a real discriminator, not a weakened one.** `outer-2` is still rendered, and
  mutant M1 reds that case — I checked because a change from `outer-2` to `close-inner` looks like a
  test being relaxed to fit the code, and it is not.

---

## 6. Where THIS packet was unclear, exactly

1. **§4, "RULE ON THIS"** is the best-written charge I have been given in this mission — it names the
   mechanism, the probe shape ("two surfaces registered on the same container element"), the two
   candidate remedies, and demands an explicit tier. Nothing to fix. It is the model.
2. **§4's residue line** — "grep the OLD title …; every remaining hit is a finding" — is unsatisfiable
   (§4 above). It should read: "every hit OUTSIDE a review verdict is a finding; a verdict quoting the
   old title to report the rename is the record and stays."
3. **§1's `.review-scratch/` grant** is superseded (§2.4).
4. **§4's skip instructions carry no line ranges** (§2.1).
5. **§4 orders the gates "×3 `.sh` under `/bin/bash` AND inline"** without pointing at TRAPS `:2587`,
   which records that `zsh script.sh` is *not* the inline arm — the inline arm is the guard's own
   terms typed into the tool call, where `grep` is the ugrep shim. A seat that runs the script twice
   under two shells reports two arms and has tested one. I did it the `:2587` way; the packet does not
   say to.
6. **§4 names `CMD-C6`, `CMD-C7` and `run_c9` by ID only.** They live in two PLANs of 172k and 100k+
   characters. A `sed -n` range beside each ID costs the orchestrator one command and saves every
   review seat a hunt (COMMON §10.5's class, applied to commands rather than to product files).

---

## 7. Toward the one-prompt machine

**The single highest-leverage change I can name from this seat:** *the mission's rules are already
strong enough that the expensive failures now come from TRANSCRIPTION between documents, not from
anyone's judgement.* Three of my six packet findings are transcription defects — an API swapped for a
prose word (`contains` for "descendant"), a suite list truncated (M2), an instruction widened until
it cannot be satisfied (the old-title grep). None required expertise to catch; all three required
somebody to run the thing.

So the machine-shaped fix is not another rule. It is a **pre-dispatch packet linter** that mechanically
checks the four properties this mission keeps re-learning by hand:

1. every `path:line` in the packet resolves and the cited text contains the quoted token
   (§10.24 — already law, still unmechanized, and it held for both of my packets this round);
2. every constant the packet states (`wc -l`, file counts, commit stats) is re-derived at dispatch —
   my packet's `942` and `2716` were both right, so the check is cheap and would have proved it;
3. every mutant the packet names is RUN at packet-write time and its full red set recorded — this
   alone kills defect P3;
4. every "skip until later" names a measured line range — this alone kills §2.1.

Items 2 and 3 are what turn a review packet from a set of instructions into a set of **predictions
that have already been falsified once**. The orchestrator writes those packets from the same
measurements the seat will take; running them first costs one command each and removes the class that
produced four of this round's six packet findings.

**And the one thing I would keep unchanged:** §10.52's appendix rule. Opening the author's numbers
after my own were on disk is the reason this verdict has an independent measurement of the same
mechanism the author disclosed, instead of a nod at their disclosure. It cost nothing and it is the
difference between a review and a countersignature.
