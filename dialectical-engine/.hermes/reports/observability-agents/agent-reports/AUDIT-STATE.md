# AUDIT-STATE — self-report (case file), mission `observability-agents`, ticket `t_0d8634a7`

**SKILLS LOADED:** superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging (loaded before ruling on the six suite failures, as the packet requires).

V's question, verbatim: *treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.*

Seat: Fable 5.1 subagent, verification role, 2026-09-01 23:40 → ~00:05 (+0300), ~25 minutes wall-clock, roughly 300k input tokens, one board CLAIM, one handoff, zero product edits, zero git writes. Deliverable: `docs/missions/observability-agents/requirements/fixagent-state-audit.md` + four logs + this file + two TOOLING-TRAPS entries.

## 1. The body: what the audit actually found, in one paragraph

The predecessor mission is not "stalled on RP-0" in the shape the notes describe. Its whole L2 lane and half of L3 were merged into `dev` on 2026-08-28 (`3e91cf42`, `1c9578a2`) with **no board record of either merge**, one commit (S02 exhaustive-1 `5f0bd546`) merged with **no review verdict at all**, and the L3 merge **silently discarded** the S06 seat's `index.ts` hunks while keeping its test and its installer import — so `dev` has carried four permanently red S06 tests and a live fatal-boundary installer in the production runner entrypoint for four days. Separately, S04's zone-integrity test pins `apps/api/src/index.ts` to a frozen SHA another mission legitimately moved on 08-23, so it has been red on `dev` since the moment it was merged. Neither red was caused by anything in this mission, and neither was known to the board.

## 2. Causes, not symptoms — priced

| # | cause | what it cost | evidence |
|---|---|---|---|
| C1 | **Merges happen off-board.** V's "submit-everything" order (08-28) produced three merges in two minutes; the board has zero comments about any of them. The board is supposed to be the state (heartbeat-protocol §2.4); for the 08-28 merges it is not even a log. | Every later reader (intake, my packet, the notes in charge G) reasoned from stale premises: "lane-3 carries uncommitted work", "S05 closed", "bindings absent". The intake alone contains three false statements traceable to this. Price: my charges E and G exist only because of it (~40 minutes of a seat), and the false S06 picture would have produced a wrong slice cut. | `git log --merges e8d99d33..dev`; 11 obs tickets, 0 merge comments |
| C2 | **A conflict resolution took one parent wholesale.** `1c9578a2` resolved `apps/runner/src/index.ts` to `dev`'s copy; nobody checked that the lane's hunks survived. | 4 red tests on every `pnpm test` since 08-28; a BLOCKED slice's installer live in the runner entrypoint; S06 must be re-cut instead of reworked in place. | `git diff --numstat 3e91cf42 1c9578a2 -- …/index.ts` → nothing; vs `e8d99d33` → 166+/115− |
| C3 | **A test pinned a foreign file to a fixed SHA.** `obs-l2-s04-zone.test.ts:33` hard-codes `29f370e0…` where the ruling says "the lane's merge-base"; mutant fixtures replace literal text of the same file. | Red on `dev` forever after 08-23's accounts commit; the fail-closed guard now cries wolf, which is how a real boundary breach will be ignored. One review round to root-cause once it is picked up; I spent ~6 minutes because the error string was truncated by vitest (`slice=S0…`) and I had to go to the resolver source. | `grep -c '      ip: request.ip,'` → 1 at `29f370e`, 0 on `dev` |
| C4 | **Packet constants rot faster than a seat can be dispatched.** HEAD and dirty count changed within ten minutes of packet-write because another mission was committing concurrently. | Zero product cost thanks to the orchestrator's HEARTBEAT (#1) six minutes after my CLAIM — the right correction at the right time. But every seat that does not re-pin at CLAIM would have written 111 into its receipts. | my CLAIM vs HEARTBEAT #1 |
| C5 | **The ruled recipe and the zone rule collide.** Charge F requires the frozen 115-file scope; COMMON §3 forbids direct zone reads; eight in-scope paths are zone by COMMON's own list. | ~5 minutes of deliberation, one extra control run, one packet finding. Cheap — but a less careful seat either skips the charge or reads zone files without saying so. | `fixagent-state-audit.md` §F |

## 3. What repeatedly cost tokens (this seat)

1. **Reading four large documents in full because the packet said so**: VerticalSlices (91 KB), S02 card (54 KB), TOOLING-TRAPS (62 KB), the 363-line demo log, plus 223 board comments in slices — ≈110k tokens before the first probe. Of VerticalSlices I used §0, §1 (S01–S07) and the §3 lane table; of the S02 card §2–§4 and §11.3. **Upgrade:** packets should cite section spans (`§1 S01–S07, §3 table`) and say "skim the rest", and the intake should carry the 12-ticket status/last-comment table so a verification seat starts from it instead of rebuilding it.
2. **The tree moving under the seat** forced three re-pins (HEAD, porcelain, "did obs surfaces change") — ≈10k tokens. **Upgrade:** freeze `dev` for the dispatch window or give seats a commit to `git worktree`-less read against (`git show <sha>:path` everywhere), which is what I did for the file-existence sweep.
3. **Two paid-for traps paid again** (≈15k tokens, two rounds): zsh no-word-split into vitest ("No test files found" would have been filed as RED by a naive classifier), and a git pathspec double-prefix that returned an empty diff reading as "unchanged". Both were already in TOOLING-TRAPS; I had read the file minutes earlier. **Upgrade:** the two tells are mechanical — a `filter:` line echoing several paths, and a `--numstat` empty for a file `--name-only` just listed. A wrapper that refuses `vitest run` with a single argument containing whitespace, and a `git` alias that warns when a pathspec starts with the cwd's own top-level directory, would remove both for every future seat.
4. **vitest 4.1.10 output shapes**: no per-file summary lines exist (my `^ (✓|❯) tests/… (N tests)` grep matched nothing across three runs); per-file pass/fail has to be derived from `FAIL`/`×` lines. BSD `awk` has no `strftime`. Dead ends, ≈3k tokens; recorded here so nobody re-derives them.

## 4. What I nearly got wrong

- **"dev did not move under lane-3."** My first per-file diff used `--name-only` paths from the git root while my cwd was `dialectical-engine/`; git matched nothing and printed nothing, and I read nothing as "no delta". Caught because a sibling probe (`git show HEAD:./…| grep`) contradicted it in the same batch. One correct command later the file showed 166+/115−. This would have been a false verdict on charge E.
- **Filing the BROKEN suite run as RED.** Exit 1 in the same second as start; the log said `No test files found`. The TOOLING-TRAPS rule "prove the command RAN" is the only reason it was classified correctly.
- **Reading the recovery/MFA mounts into the ruled block.** `grep` showed eight `/v1/auth/*` mounts after `if (options.registration …)` and I briefly framed B2 as "the block grew to eight" — the guards at `:771` and `:783` show they are sibling blocks, and the failure is ZI-2's pin, not ZI-1's shape. Checked before writing; the wrong framing would have sent V a zone-boundary alarm that does not exist.

## 5. Dead ends (do not re-derive)

- The `scope_file_list` pinned hash `63c7ebb2…` is over paths **with** the `dialectical-engine/` prefix as `files()` emits them; §11.3 displays them stripped, and the stripped list hashes to `70681725…`. "Repo-root-relative" means the `DebateAIRO` git root.
- The S02 card has **no §4.3**. The RP-0 one-liner is `L2-ADDENDUM-PLAN.md:514-543` and the ticket's comment #0.
- `hermes … show --json` returns comments with keys `author, body, created_at`; the Router posts as `default`, Codex as `codex` or `codex@gpt-5.6-sol`, the orchestrator of this mission as `claude-router`.
- The test database is **embedded-postgres in a mkdtemp dir** (`tests/support/testDatabase.ts:85-111`), not the product container; running the S01 integration test touches nothing on `:55432`.

## 6. Where THIS packet was unclear, exactly

- §3 charge F: "the card's one-liner … §4.3" — wrong document (see dead ends). Also "post it labelled …" leaves open whether the label goes on the board comment, the report, or both (I did both).
- §3 charge F vs COMMON §3: no instruction on the zone-blob question; I ran faithfully, disclosed, and controlled. Say which is wanted.
- §3 charge B: "and whether it predates today (git blame the assertion)" — blame dates the assertion, not the failure; I reported both, but the packet should ask for the commit where the premise broke, which is the useful number.
- §4 heading "dev @ 8d38185c" fixed by the packet while §1 tells me the tree may move — I kept the heading and disambiguated in line 1; say "heading carries the packet's commit, first line carries the measured one" so seats do not have to invent the convention.
- §5: "`git status --porcelain | wc -l` before and after your session (must be equal, or explain the delta to the file)" — impossible when other actors write to the tree during the session (4 → 12 without me touching anything). Ask for the **attributed list** instead of the count.

## 7. One-prompt-machine upgrades, ranked by leverage

1. **Post-merge lane-hunk guard (closes C2 for good):** after any lane merge, `git diff <merge>^2 <merge> -- <lane-owned files>` must be empty for lane-owned regions; otherwise the merge is re-done before anyone reads it as landed. Ten lines of shell; would have prevented four days of red.
2. **Merge = board comment, mechanically:** a post-merge hook that posts `MERGED <sha> parents <a> <b>` to every ticket named in the merged commits' messages. Closes C1 at zero human cost.
3. **Ban fixed SHAs in tests against non-owned files:** pre-dispatch gate greps `tests/**` for 40-hex literals used as a git ref; each must be justified in the PLAN or replaced by "merge-base with the integration target". Closes C3's class.
4. **Constants re-pinned at CLAIM by contract:** every packet's first charge is "print `git rev-parse --short HEAD`, `git status --porcelain | wc -l`, compare to the packet, post the delta in CLAIM". The orchestrator's HEARTBEAT did this manually tonight; make it the seat's duty so it never depends on the orchestrator watching.
5. **Intake ships the receipts table:** a verification seat should receive the 12-ticket status/last-comment/last-commit table as input and spend its time probing, not transcribing. Half of charge A was transcription.
6. **Classify every command BROKEN/GREEN/RED with the signature list before reading a number** — already law in TOOLING-TRAPS; tonight it saved one false RED. Make the vitest wrapper do it so it does not depend on the seat remembering.
