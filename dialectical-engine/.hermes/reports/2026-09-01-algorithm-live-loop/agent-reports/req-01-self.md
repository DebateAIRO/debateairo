# REQ-01 self-report — the murder case

Seat REQ-01 (requirements loop, Opus 5). Answering router §3 verbatim: *what can be done
better, what we must upgrade, what repeatedly costed us tokens, how we make the coding
more efficient, how we turn this into a one-prompt machine even better.*

A case file, not a diary. Causes, prices, near-misses, dead ends.

---

## C1 · The generator and the verifier disagreed about what "a span" is — and both were mine

**CAUSE.** I wrote the slice generator with `span(a,b).rstrip("\n")` for per-task quotes
and `span(a,b)` (no rstrip) for the four global quotes. Then I wrote the byte-diff verifier
with a third convention. 20/22 blocks matched; 2 "DRIFT" hits were pure trailing-newline
disagreement between two functions I wrote ten minutes apart.

**PRICE.** One generate + one verify + two edits + one regenerate + one re-verify ≈ 6 tool
calls, ~8 minutes. Cheap here. Not cheap next time: my ticket's `verification` field says
*"orchestrator byte-diff of quoted spans vs goal-prompt.md."* If the orchestrator's diff
uses a different trailing-newline convention than my generator did, it reports DRIFT on a
byte-identical artifact and charges me a rework round for a newline.

**UPGRADE (highest value in this report).** Ship the verifier *with* the artifact, as a
mission tool both seats run unchanged. I wrote a working one this session
(`<scratchpad>/gen_slices.py` carries the generator; the verifier ran inline) but **did not
install it under `tools/` because `tools/**` is not in my `allowed` list** — writing it
would have crossed my file contract for convenience. The orchestrator should lift it into
`tools/verify-zero-drift.py` and make it the definition of the byte-diff gate. That
converts a human review step into a green/red command, permanently.

## C2 · zsh does not word-split — and it nearly cost a false BLOCKING finding

**CAUSE.** I probed seven line ranges with `for r in "452 455" …; do set -- $r; awk -v a=$1
-v b=$2 …`. In bash that works. **zsh does not word-split unquoted parameters**, so `$1`
became the whole string `"452 455"`, `$2` was empty, and all seven awk ranges matched
nothing. The command printed seven headers and zero lines.

**WHAT I NEARLY GOT WRONG — the expensive one.** Empty output from an anchor probe reads
exactly like *"this anchor does not exist."* Those seven ranges are T9's six legacy quality
gates plus the `protectedCoreVerified` guard. Filing "seven of T9's anchors are stale
against dev@1c9578a" would have been a BLOCKING finding against the largest slice in the
mission, aimed at a frozen goal, requiring a V decision round to retract. On re-run with
python3 all seven are **byte-exact**. The near-miss was one incurious moment wide.

**UPGRADE.** Two rules, both mechanical: (1) never probe multiple file ranges through shell
word-splitting — `python3` heredoc, always; (2) an anchor probe that returns *nothing* is a
**tooling failure until proven otherwise**, never evidence of absence. Absence of evidence
gets re-run with a different tool before it becomes a finding. This belongs in
`.hermes/TOOLING-TRAPS.md` beside the other zsh entries.

## C3 · The packet and the role contract name different roots for the same files

**CAUSE.** `heartbeat-requirements` §1/§2 says the compass and slices live at
`docs/missions/<mission>/…`. My packet resolves all relative paths from
`.hermes/reports/2026-09-01-algorithm-live-loop/`, and the ticket's `allowed` list spells
out `.hermes/…/INSTRUCTIONS.md` and `.hermes/…/slices/**`. Both are "law" by different
routes. I followed the packet, because the ticket's `allowed` list *is* the file contract
and router §1 ranks the mission's own artifacts above the role adapter's illustration.

**PRICE.** ~2 minutes of adjudication, zero rework — for me. For a seat that resolved it
the other way: 53 files written outside its contract, a blown file contract, and a full
re-file. That is a ~40-minute loss sitting one reading away.

**UPGRADE.** One sentence in `heartbeat-requirements`: *"Your packet's `allowed` list fixes
the paths. §1–§2 name the FILES and their content law, not their root."* Removes the whole
class permanently, costs one line.

## C4 · The compass blew its own hard cap because I wrote prose before counting

**CAUSE.** 102 lines against a hard cap of 100. I drafted for quality and measured after.

**PRICE.** Three edits, ~3 minutes. Small and *perfectly recurring* — this cap will be hit
by every requirements seat forever, because the cap is mechanical and drafting is not.

**UPGRADE.** Make the constraint self-enforcing rather than remembered: the contract should
carry a per-section line budget (authority 12 · roster 10 · slice index 18 · TOC 10 · laws
14 · markers 6), or the seat should `wc -l` after each section instead of at the end.

## C5 · What repeatedly costs tokens: the goal's structure gets re-derived by hand, every time

**CAUSE.** There is no machine-readable index of the goal's section boundaries. The
slice-map computed slice→line-range by hand. I then re-derived per-task sub-ranges for the
four multi-task slices (S02, S04, S06, S08) by eye, checking header positions line by line
— before concluding the split should be machine-computed from `### T` headers, which is
what I shipped. The hand pass was wasted work that a stranger will repeat.

**PRICE.** ~10 minutes of my budget, and it recurs in every packet the orchestrator writes:
each one re-cites line ranges that nobody generated from the file.

**UPGRADE — the one-prompt-machine item.** Emit `goal-index.json` ONCE (task id → header
line, body range, DoD range, cited `file:line` anchors), generated from the goal, hashed
alongside it. Then the slice-map, every packet, every SPEC, and the byte-diff gate all cite
one generated source instead of four hand counts. Anchor spot-verification becomes a loop
over the extracted anchor list rather than a judgement call about which five to check —
I verified 22 because I chose them; a generated list makes the coverage total and the
number non-arbitrary.

## C6 · Dead ends — recorded so nobody re-derives them

- **The slice-map's "Non-goals 321–332" is NOT an off-by-one.** The goal has 331
  newline-terminated lines; `split("\n")` yields a 332nd empty element. The same convention
  explains every trailing-blank slice boundary (79, 96, 128, 143 …). I had this half-written
  as a finding before checking. Do not re-file it.
- **`packages/graph/src/index.ts:423` holds a second `strengthSource: "EVIDENCE_VERIFIER"`
  literal** that T5's anchor list does not cite by line. It is covered by T5's phrase
  *"measured-update path in packages/graph"*. Not a finding.
- **The goal's `s04.ts:224-336` span starts at `runJudgePanel` (224), not `measureDispersion`
  (268)** — a deliberate superset, since T3 wires `runJudgePanel` too. Not a finding.
- **S1-1's original "form becomes a 1–5 selector" does not contradict T1.** The Stop-1
  correction supersedes it: the live form is already compliant and legacy `web/`'s fate is
  out of scope. Checked, closed.
- **T7's leverage discrepancy is real and IS filed (F1)** — but note for whoever picks it
  up: `grep -c "isRoot\|rootNode" packages/propagation/src/index.ts` returns **0**. The
  propagation package has no notion of "root" at all, so the recorded field *cannot* be
  root-scoped. Do not go looking for a root-scoped variant; it does not exist.

## C7 · What went right, and should be copied

Generating the SPECs instead of transcribing them by hand made zero-drift a **property of
construction rather than of diligence**. 22 verbatim blocks, 18 task headers, four global
spans — all byte-identical on a fresh verifier run, and re-provable in one command. A
human transcribing 331 lines of frozen spec across 13 directories would drift somewhere,
and the drift would be invisible until a worker built the wrong thing. **For any zero-drift
transcription task, the seat should generate and verify, never type.** This is the single
practice most worth promoting into `heartbeat-requirements`.

Corollary that made the findings sharper: because transcription was free, the whole ~60
minute budget went into the contradiction check, which is where the two BLOCKING findings
came from. Cheap mechanics buy expensive judgement.

## C8 · Where the packet was unclear — exactly

1. **§2 "Deliverables" lists `INSTRUCTIONS.md` with a parenthetical content list but does
   not say where the four global goal spans go.** The slice-map says *"quoted once in
   INSTRUCTIONS.md or S12"* — but quoting all four (Scope law 5 + Global DoD 14 +
   confirm-items 25 + Non-goals 11 = 55 lines) into a 100-line compass would consume it and
   violate *"pointers, never content."* I put all four in `S12-closure/SPEC.md` and left
   pointers in the compass. **Recorded here as a judgement call the reviewer should check**,
   not as a silent choice.
2. **§2 asks for PLAN.md content via the slice-map's "lane skeleton" while
   `heartbeat-requirements` §2 says PLAN is "FILLED by the architecture seat" — and R7-1
   elects no architecture seat.** Nobody is named to author PLAN steps. I scaffolded the
   five lane stages plus a SPEC→DoD trace whose every row is a *verbatim machine-split
   substring* of the goal's own DoD, and left the evidence column to the worker. That is
   structuring, not authoring, so it stays inside D7 — but the gap is real: **if the goal's
   DoD clauses are not enough of a plan for a lane, no seat currently owns writing more.**
3. **§4 says "~60 minutes of work; whichever binds first" without saying whether the
   contradiction check or the transcription yields first** if time runs short. I sequenced
   transcription first (mechanical, generated, fast) and spent the remainder on the check.
   Worth making explicit: for a zero-drift seat the *check* is the scarce output, since the
   transcription is machine-cheap.

---

## Ranked upgrades

| # | upgrade | cost | what it stops |
|---|---|---|---|
| 1 | `tools/verify-zero-drift.py` shared by REQ seat and orchestrator | ~30 min once | rework rounds charged for newline conventions (C1) |
| 2 | Generate `goal-index.json` from the goal; cite it everywhere | ~30 min once | four hand-counted line-range passes per mission (C5) |
| 3 | "An empty anchor probe is a tooling failure until proven otherwise" → `TOOLING-TRAPS.md` | 2 lines | false BLOCKING findings against a frozen goal (C2) |
| 4 | "Your packet's `allowed` list fixes the paths" → `heartbeat-requirements` | 1 line | 53 files misfiled outside contract (C3) |
| 5 | "Generate and verify, never type" → `heartbeat-requirements` | 3 lines | invisible transcription drift (C7) |
| 6 | Per-section line budget for the compass | 6 lines | the 100-line cap being discovered after drafting (C4) |
| 7 | Name an owner for PLAN steps when no architecture loop is elected | 1 ruling | an unowned artifact (C8.2) |
