# Self-report — ORCHESTRATOR (Claude-Router, Fable 5.1), mission `consent-ui` — a murder case, not a diary
Written 2026-09-07 08:25 while the three Grok element gates run; the closing section is appended when they return.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## 1. The victim, the weapon, the cause
**The victim is wall-clock.** From V's one prompt (2026-09-06 ~17:00) to the Grok gates (08:13 next morning) is ~15 h for two UI elements and one sign-up gate — about 6 h of it is the REQ/ARCH loops (three rounds each, by law), ~9 h the coding loop: 14 clusters, 17 blind reviews, 3 reworks, 3 cross-slice clusters, ~11M subagent tokens.
**The weapon, priced:** the ORCHESTRATOR'S PACKETS. Forty-four COMMON §10 amendments (§10.30–10.73) were written in one coding loop, every one of them a class-fix for a packet defect the reviewers filed against me. Two of the three blocking findings that cost rework rounds were mine (CROSS-01's unsatisfiable mechanism wording — caught by the seat before shipping; CROSS-03's reflexive `Node.contains` — shipped, caught by the reviewer, one rework round = ~55 min and ~800k tokens). Reviewers spent, by their own accounts, 10–20 % of each round re-deriving constants my packets got wrong (a `:61` for a `:56`; "comment-only" for a range with code in it; a probe cited as an oracle that only logged).
**The cause, named:** packets were written from MEMORY OF TOOL OUTPUT instead of from measurement at write time, and the template carried no checklist that forced the measurement. Every §10 amendment is the same sentence in a different costume: "measure the constant where it lives, at the moment you cite it".

## 2. What repeatedly cost tokens (each with its price)
1. **Cited lines lifted from earlier tool output** (§10.24 ×5 recurrences): ~10 min per review round of re-derivation, plus one P-finding each. Fix: the packet writer runs `grep -n` for EVERY `file:line` in the packet in the same Bash call that writes it, and pastes the grep output into a `## 0. MEASURED TRUTH` block (done from CROSS-02 on; the defect rate dropped from ~4 per packet to ~1).
2. **Anchoring the blind lens** (§10.52 → §10.54 → §10.65 → §10.69 → §10.73 — FIVE rounds to close one class): the author's figures reached the reviewer through the packet, then through BASELINE, then through V rows, then through TOOLING-TRAPS, then through the review package itself. Price: every review's independence was in doubt until the r2 CROSS-03 reviewer wrote its numbers to disk BEFORE opening anything of the author's. Fix that finally held: measure → write → then open; claims in a sibling file no packet lists; skips named as prose classes, not byte ranges.
3. **Count predictions and "flip" narratives** (§10.42, §10.62): three rounds where a seat had to choose between the packet's count and its own measurement. Fix: a packet names WHAT a case set discriminates and says "measure".
4. **The nine-cluster blind spot** — no test mounted both slices in one document until a reviewer built one (C9 r1 B1, the `/sign-up` Escape defect). Price: three cross-slice clusters (CROSS-02/03 + rework) ≈ 3 h. Fix: §10.53 — every merge cluster carries a cross-slice mount. This should be in the PLAN template, not COMMON.
5. **Rulings V could not see fast enough**: V-20 got THREE addenda in one night (document order → open order → strict containment). Each was correct at the time and undone by the next measurement. Cost: two extra review rounds. Lesson: when a reviewer offers a measured rival rule, take the measured rule, not the prose one — I took the prose ("open order, no containment arm") and paid for the containment arm twice.
6. **zsh** (§10.40, twice): `$VAR` not word-split; `set -- $row` not split. Price: two failed CLI batches, one "unknown task" trio. Fix: `k()` function + `${=row}`; and READ the CLI reply line.
7. **The TOOLING-TRAPS file** (2,880 lines): seats stopped reading it in full (§10.60/66/67 — my "read past line N" displaced the full read; a seat then hit a trap 114 lines above N). Fix: full read at CLAIM + delta at handoff, and an INDEX (ticketed `t_38c6bbf2`).

## 3. What I nearly got wrong
- **Nearly shipped the Grok gate on a head with a known-false product comment** (`CookieConsent.tsx:192-198` after CROSS-02). Caught by asking "is it truly done?" against V's own wording; CROSS-03 was the answer.
- **Nearly accepted "P4 RED at BASE" as the oracle** without reading the probe — the case logged instead of asserting. Charged to me (§10.59); the seat caught it.
- **Nearly re-armed the watchdog late**: it exited on the 20-min stagnation law at 08:02 (the r2 reviewer was silent while measuring); re-armed 08:12. A quiet reviewer is not a hung reviewer — the watchdog should read the review worktree's mtime, not only the board.
- **Nearly lost the S02-S69 acceptance in an `UNVERIFIED`**: every seat reported the dev stack serves the main tree; I researched the recipe (`V-TEST-POINT.md`) instead of letting V discover it at the test point.

## 4. Dead ends (so nobody re-derives them)
- `styledDocument()` cannot host a React mount (own detached JSDOM) — inject `globals.css` as a `<style>` into the test's document instead.
- `grep '^[-+]export'` is blind to a member added inside an exported type — use a declaration-emit diff.
- A `.review-scratch/` directory inside the tree under review cannot run a probe and only invites files into the review — scratchpad `--config` only.
- `hermes kanban show` human output cannot be counted by grep (audit log lines share the shape) — `show --json | len(comments)`.
- `Node.contains` is reflexive; `CONTAINED_BY` is not — the rule's word was "descendant".
- The `run_c9` merge arms are unsatisfiable by construction (`--scrim` is mode-independent; the end marker does not contain the open-marker literal) — evaluate the PROPERTY; PLAN residue `t_4f97ca86`.
- Two dev stacks cannot coexist (every port fixed); the custody tree must be COPIED, never regenerated (shared DB).

## 5. Where my packets were unclear — exactly
CODE-CROSS-01.md §2.1/§2.2/§2.4 (mutually unsatisfiable mechanism); CODE-CROSS-02.md:9 ("P6 flips by design" — false), :23 (a logging case as oracle), :19 ("comment-only" over code); CODE-CROSS-03.md:8 (`Node.contains` for "descendant"), :6 (TRAPS delta-read displacing the full read), :23 (one suite named for a mutant that reds three cases); CODE-CROSS-03-REWORK-R1.md:21 (a Tab assertion that cannot discriminate), :26 (a count beside "do not predict"); CODE-REV-CROSS-03-R1.md:27 (a sweep that can never reach zero); CODE-REV-CROSS-03-R2.md (skip ranges that the review package itself delivers). Each has its §10 line.

## 6. What must be upgraded (the one-prompt machine)
1. **The packet template becomes a CHECKLIST that executes**: a script that takes the packet, extracts every `path:line`, runs `grep -n`, and refuses the dispatch on any mismatch; extracts every probe cited as an oracle and prints its `expect(` lines; prints the TRAPS line count; verifies the allowed list names every ticket in §4. Half the §10 amendments become code.
2. **Reviewer independence by construction, not by instruction**: the reviewer's worktree gets a COPY of the mission docs with the author's sections stripped by a script (BASELINE-CLAIMED, DECISIONS rows dated for the seat, TRAPS entries under the seat's heading, the handoff comment) — the reviewer cannot read what is not there. Then the appendix step re-attaches them.
3. **Integration is a cluster type with its own PLAN template**: a merge cluster's command mounts every slice's surfaces in one document and exercises each shared mechanism across the boundary (Esc stack, focus return, scrim, z-ladder agreement). B1 would have been an ARCH-round finding.
4. **Measured rivals beat prose rulings**: when a reviewer implements and measures an alternative, the next packet transcribes the measured code (the primitive included), not a re-wording of it (§10.68).
5. **V's rulings batch, not stream**: the V DECISIONS PACKET grew 22 rows; at closure they fold into ONE SPEC-v4 authorization with the defaults taken, so V rules once. A row per night is the right cadence for V; a row per finding is not.
6. **Watchdog reads worktree mtimes and the review-package Read, not only the board**: a reviewer measuring for 25 minutes is the normal silent case.
7. **Grok seats get the same appendix discipline**: their packets carry no author figure (done for this mission's three).

## 7. What went right, and should be kept
Three-run verification with a commit column caught every "it passed once"; blind reviewers in detached worktrees with their OWN fixtures found every real defect (the stranded flag, the false contrast figure, the tracker resync, the cross-slice Escape, the unsatisfiable precedence, the reflexive predicate); the measured-truth-first packet shape (from CROSS-02 on) cut packet defects per round from ~4 to ~1; every finding got a ticket the same day (zero lost residue); the ledger was written at every seat exit; every `SKILLS LOADED` line was verified against the transcript body (0 fabrications in 31 seats).

## 8. Closing (08:40) — the gate
All three Grok gates PASSED at round 1 with zero blocking findings; their N-findings were packet defects (mine: a verdict glob that matched nothing ×3, no TRAPS count, another element's facts copied into a probe list — §10.75), one environment trap (`FORCE_COLOR`, §10.76), one SPEC wording (R24), and one honesty defect in the DESIGN's own copy (V-23). The Grok seats read the skill BODIES (verified in their transcripts). Price of the whole QA gate: 22 minutes wall-clock, three seats in parallel. The lesson that survives the night: the harness's defect rate lives in the packets, and the packets can be checked by a script before dispatch — that script is the next upgrade.
