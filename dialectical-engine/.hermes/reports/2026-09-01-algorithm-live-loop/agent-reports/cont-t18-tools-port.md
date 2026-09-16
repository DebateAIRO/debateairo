READY FOR PEER REVIEW · comments read through: closing-run-2026-09-08

# BUILD(CONT-T18) — cont-t18-tools-port · self-report (case file)

Seat: `cont-t18-tools-port`, Opus 5, mission `2026-09-01-algorithm-live-loop` (continuation of
2026-09-16). Ticket = plan Task 18. Base `6cdc14b21b78b6286dc4e68e21cf95ff14043d1d` →
`commit=414fb019c8db4b815a54fcf2261256d9bf3e6d4d`. Worktree
`.claude/worktrees/algo-loop-2026-09-16`. Pass 1 of 3, rework round 0.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

---

## 1. The victim, and who actually killed it

Nine occurrences of one operator's absolute home across seven of the mission's tool files. The
obvious story is "someone hard-coded a path". That story is wrong in the way that matters.

**The real cause is that these tools had no way to be wrong out loud.** Three facts, each measured
today, compose into it:

1. **No gate ever looked.** The mission runs `board-lint`, `packet-lint`, `stamp-check`,
   `gate-run`, `mutate`, `mutant-index` — six tools whose job is to catch a record that lies. None
   of them looks at the tools themselves. A constant naming a machine is exactly the kind of thing a
   three-line grep catches forever, and nobody wrote the three lines.
2. **The one cheap probe cannot reach the defect.** `closing-run.sh`'s credential gate is the first
   executable statement; the first *use* of `$R` is four lines later. So a credential-less dry run —
   the only run of this tool anyone is allowed to do without spending money — stops **before** the
   laptop path is ever touched. I measured both arms at base: unset → exit 1 at the usage line;
   invalid → exit 2 at the 43-character check. Neither prints a laptop path. **The tool is
   structured so that the first thing which can prove it works is a paid ceremony.**
3. **The wrong-path defect was wider than the string being greped for.** The same script set
   `ACCEPTANCE_CODEX_BINARY="$HOME/.local/bin/codex"`. `$HOME` looks portable, so it survives every
   search for `stefan.nour` — and it is **wrong on this host**: `~/.local/bin/codex` does not exist
   here, codex is at `/opt/homebrew/bin/codex`. A grep for one operator's name would have left a
   live defect standing and reported GREEN.

**Cause to fix, not symptom:** the mission has a rule that every *record* is linted and no rule that
any *tool* is. The tools are the instruments every record is measured with, and they were the only
unmeasured thing in the room. This is the same shape as CONT-T17's finding one ticket earlier —
there, a degradation was recorded only where the record did not survive; here, a host coupling lived
only where no gate could see it. **Both are "we recorded/encoded it" answers that dissolve on the
question "in what, and what reads that?"**

## 2. What nearly went wrong here — three near misses, in cost order

**(a) A mutant that silently did not apply, and read exactly like a passing gate.** The refutation
for the D18 credential check used
`perl -0pi -e "s{\Qprintf '%s' \"$ACCEPTANCE_SERVICE_CREDENTIAL\" | … \E}{true || }"`. `\Q…\E`
quotes regex metacharacters; it does **not** stop perl interpolating `$ACCEPTANCE_SERVICE_CREDENTIAL`,
which was undefined, so the pattern could never match. **`perl -0pi` exits 0 when nothing matched**,
so the mutation step "succeeded", the file was untouched, and the probe returned **exit 2 — the same
value as green**. Had I read only the verdict I would have written "the bypass mutant is not caught"
(a false finding against my own gate) or, worse, "refutation-tested" over a mutant that never
existed. That is a fabrication under router §3.6.
*Caught by:* printing the target line after mutating, out of habit. *Price:* one diagnostic script,
three tool calls, ~4 minutes. *Price had I not:* a refutation claim that is false, discovered — if
ever — by the next person who trusts the credential gate.
*Fix applied:* M2 was redone in Python with `assert old in text` before and `assert new in text and
old not in text` after, so a mutation that does not land aborts instead of measuring.

**(b) "It touched nothing" was true of `git status` and false of the disk.** The bypass mutant let
`closing-run.sh` run three lines further than green ever does — and `mkdir -p "$OUTDIR"` sits
**before** the dirty-tree refusal, not after it. The refused run therefore created an empty
`.hermes/reports/<mission>/logs/closing-run/`. `git status --porcelain` showed nothing, three times,
because `dialectical-engine/.gitignore:13` ignores `logs/`. Every porcelain bracket in this mission's
tooling (`:1724`, D45/D49) is blind to an ignored path.
*Caught by:* a filesystem assertion (`[ -d "$OUTDIR" ]`) I had put in the gate for an unrelated
reason. It went RED on the first consolidated run. *Price:* one RED gate run plus the cleanup.
*Price had I not:* an empty `logs/closing-run/` sitting in the tree, indistinguishable from a
ceremony that started and died — the most misleading possible artifact in this mission.

**(c) Treating "7 files" as a mechanical sweep.** Two of the seven are `.v1-superseded` archives.
The brief's own GREEN command is `grep -c 'stefan.nour' tools/*.sh`, and that glob **does not match**
`d15-suite.sh.v1-superseded`. So the file list and the gate disagree about the same two files, in
silence: port them and the gate cannot tell; skip them and the gate still says GREEN. I ported them
(the file list is explicit and they are in `allowed`), labelled each with a header saying what was
changed and that nothing else was, and I am flagging the disagreement here rather than letting a
reviewer discover that the GREEN proves less than it looks like it proves.

## 3. Dead ends — do not re-derive these

- **Do not expect `tools/<x>.sh` to execute.** `git ls-files -s tools/` is `100644` for all 26 files.
  `tools/packet-lint.sh <packet>` exits **126**, which is neither 0 nor the tool's own 1, so a gate
  that reads "non-zero means the lint failed" reports a failure that never ran. Use `bash tools/…`
  and `python3 tools/…`. `$0`-relative resolution still works under `bash tools/x.sh`.
- **Do not try to make the fully-unset credential arm exit 2.** Bash's `${VAR:?msg}` exits **1**, by
  the shell, not by the script; and the credential gate is D18 byte-for-byte. The `2` belongs to the
  43-character check. The packet and brief both say "exits 2" without naming the arm — the honest
  answer is two arms, 1 and 2, and I preserved both.
- **Do not go looking for the laptop path in the dry run's output.** The packet predicts the tool
  "names a laptop path before or after its usage check". Measured, at base, three times: it does not.
  The credential gate precedes every use of `$R`.
- **`git rev-parse --show-toplevel` inside a linked worktree is the WORKTREE root, not the main
  checkout** (`TOOLING-TRAPS:191`). For `post-merge.sh` / `post-r7-merge.sh`, whose lanes live at
  `<root>/.worktrees/<lane>`, that is the correct anchor only when the tool is run from the checkout
  that owns `.worktrees/`. I documented that in each tool's header rather than inventing a
  `--git-common-dir` resolution the packet did not ask for.

## 4. What repeatedly cost tokens on this seat

1. **The knowledge base outgrew its own index.** `TOOLING-TRAPS.md` is 5,576 lines, and the
   *heading index alone* — which the reading floor says to read instead of the body — is ~9 KB of
   output. The discipline is right and the index is now itself a large read. **Upgrade: generate
   `TOOLING-TRAPS.INDEX.md` (heading + 5-word gist + keywords), or split by topic, so a seat greps a
   small file instead of printing 200 headings.** This cost is paid by every seat, every mission.
2. **The harness refused compound shell twice.** A heredoc that writes a script and then runs it in
   the same command is rejected by this worktree's sandbox ("too complex to verify"). Every probe had
   to be Write-then-`bash <path>`. Two calls lost the first time, zero after. **Upgrade: one line in
   the packet's verification section — "write probes with the Write tool, run them as `bash <abs
   path>`" — and no seat pays it again.** It compounds with the existing "log first, print rc and
   summary" rule, which is the same shape.
3. **A hand-maintained allow-list in my own gate went stale mid-task.** My porcelain check listed the
   allowed paths as a regex; the moment I appended to `TOOLING-TRAPS.md` — a file that *is* in my
   `allowed` — the gate went RED for the wrong reason. One wasted run. **Upgrade: the gate's allowed
   surface should be derived from the packet's `allowed` list, not restated by the seat.** The packet
   already contains it in machine-readable form; every seat retypes it and every seat can mistype it.

## 5. What to upgrade — ranked by leverage

1. **Add a host-independence gate to the mission's own tool set, and run it where `board-lint` runs.**
   Roughly: `grep -rnE '/Users/[a-z._-]+/|\$HOME/[^"]*/bin/' tools/` → exit 1 on any hit. Three lines.
   It would have caught this defect on the day it was written instead of after a paid ceremony
   debated on two of three makers. **This is the single highest-leverage item in this report:** the
   cost of the defect was one closing run plus this whole task; the cost of the gate is three lines.
2. **Give `closing-run.sh` a `--dry-run` that resolves everything and exits 0 without spawning.**
   Today the only free probe stops at the credential gate, so *no* amount of dry-running exercises
   root resolution, binary discovery, or the log header — the three things most likely to be wrong on
   a new host. A dry run that printed the header and stopped would have made this entire task a
   thirty-second check. **A tool whose first real test is a paid run is not testable.**
3. **Make the readiness table a build artifact, not a document.** Every value in it is derivable:
   the eight keys by reflecting `ceremonyEnvironmentSchema.shape`, the three binaries by `command -v`,
   the four-count row from the last attribution, the Grok/Docker state by stat-ing
   `/var/run/docker.sock`. The *previous* readiness table proves the point — it still names
   `/Users/stefan.nour/.local/bin/claude` and the placeholder `<the grok binary's absolute path once
   installed>`. A transcribed table is stale the day the host changes; a printed one cannot be.
4. **Mutation steps must assert they landed.** Mechanical, cheap, and this is the second time the
   family has bitten this mission (`TOOLING-TRAPS:2997`). Any mutate/revert helper should refuse to
   measure a file whose hash did not change.
5. **"Touched nothing" must be asserted against the filesystem for ignored paths.** The porcelain
   bracket is load-bearing across this mission and it cannot see `logs/`, `node_modules/`,
   `__pycache__/`. Any tool that writes under an ignored path needs its own existence assertion.

## 6. Toward a one-prompt machine

- **The generalisable law from this ticket: every constant that names the outside world needs a gate,
  and the gate belongs beside the constant.** Paths, ports, binaries, sockets, home directories. The
  mission already believes this about records (stamps, lints, set-equality). It does not yet believe
  it about tools, and tools are what produce records.
- **Prefer derivation to transcription, everywhere.** Three of this task's four deliverables were
  "copy a value from one document to another" — env keys, binary paths, gate counts. Each copy is a
  place a future host diverges silently. A one-prompt machine is one where the prompt says *where the
  truth is*, and the tooling reads it. That is also the cheapest thing to review: a reviewer can
  re-run a generator; they cannot re-run a transcription.
- **A packet's predicted values are the machine's best free tests — if seats are told to measure them.**
  My packet predicted four things that were wrong or imprecise (§7). Each mismatch took under a
  minute to find and each is a real improvement to the record. The rule "every value it predicts is a
  MEASUREMENT, a mismatch is a finding, never your error" is the single best sentence in this packet
  and it should be in every packet.
- **Structure work so the cheap probe touches the risky code.** This is (2) above generalised: the
  order of guards inside a script decides whether it is testable at all. Credential gate first is
  right for safety and wrong for testability; both are satisfiable by a resolve-and-exit mode.

## 7. Where the packet was unclear or wrong

| # | the packet/brief said | measured | verdict |
|---|---|---|---|
| 1 | the dry run "names a laptop path before or after its usage check" | neither arm prints one, at base, three runs — the credential gate precedes every use of `$R` | **wrong**; the defect is unreachable from the only permitted probe, which is itself the finding |
| 2 | "the credential-less dry run … must exit 2 at its usage check" | two arms: unset → **1** (bash `${VAR:?}`), invalid → **2** (the 43-char check) | **imprecise**; preserved both byte-for-byte per the "D18 behaviour byte-for-byte" clause |
| 3 | "the 24 files under `tools/` and `tools/staging/`" | `ls -1 tools/` = 24 **entries** (23 files + `staging/`); 26 regular files in the tree; **7** carry the root, all 7 directly under `tools/`, staging carries none | **ambiguous**; the "7 of 24" ratio holds on entries |
| 4 | GREEN is `grep -c 'stefan.nour'` 0 across `tools/*.sh` and `tools/*.py`, over a file list of 7 | those globs do **not** match `*.sh.v1-superseded` / `*.py.v1-superseded` — 2 of the 7 named files are outside the stated GREEN | **inconsistent**; ported all 7 and added a wider sweep (0 occurrences anywhere under `tools/`) so the gate covers what the file list names |
| 5 | named fact: acceptance/ is typechecked at base and tip | this task changed **no** file under `acceptance/`; the write surface excludes it | **not owed**, stated rather than silently skipped |
| 6 | this host's CLIs "claude 2.1.216, grok 1.0.30, codex 0.144.6" | all three **confirmed without executing anything** — two from symlink targets, codex from `@openai/codex/package.json` | **correct**, and the versions are obtainable without violating the no-CLI rule, which is worth putting in the next packet |

## 8. Findings for the board (named, not fixed)

- **`tools/` file modes** — all 26 files are `100644`. Every documented `tools/<x>.sh …` invocation
  exits 126. Class-wide; same family as `TOOLING-TRAPS:1477` (OneDrive exec-bit flips get committed).
- **`tools/d15-classify.py:39-45`** — when `INT` does not resolve, the `merge-base --is-ancestor`
  probe fails and **no** closed name is ever subtracted, so the classifier silently over-reports
  stable-red. Pre-existing (the unreachable laptop path had the identical effect). The port makes
  `INT` resolvable on this host; making the failure **loud** is a behaviour change beyond a path, so
  it is named here, not done.
- **`tools/closing-run.sh:20`** — `mkdir -p "$OUTDIR"` precedes the clean-tree refusal, so a run
  refused for a dirty tree still creates `logs/closing-run/`. Cheap fix: move the `mkdir` after the
  refusal. Out of contract (not a path).
- **`tools/closing-run.sh:23`** — the log header still reports `claude/codex/grok --version` by bare
  PATH lookup, not `"$CLAUDE_BIN" --version`, so the header can name a different binary's version
  than the run uses. In-file but I could not test the change: verifying it requires executing the
  real CLIs, which this seat is forbidden to do. Named.
- **`acceptance/claude-relay.ts:29`, `acceptance/grok-relay.ts:13`** — the compiled-in defaults are
  still `/Users/vladmihaimiron/…`, neither of which exists on this host. D10 makes them overridable,
  not correct. Named by CONT-T17 as well; still standing after two tickets. The readiness packet
  works around it by setting both keys explicitly.
- **No mission tool gates the mission's tools** — the class behind this whole ticket. See §5.1.

---

## Fix round 1 — addendum to the case file

Round 1 of 5 on the orchestrator's review of `6cdc14b2..d47452e1`. Commits `c83c2f54` (F1),
`02d812a4` (F2), plus this docs commit. Full evidence in the SDD report's `## Fix round 1`.

### The thing I got wrong was a boundary, and I had already seen it

F1 reverts the two `*-superseded` archives I ported. I am not surprised by the finding — I wrote it
myself as round-0 concern §9.3, and even measured that the brief's own GREEN glob (`tools/*.sh`)
does not match them. **I had the evidence, I named the tension, and then I resolved it the wrong
way: toward the explicit file list rather than toward what the files are.**

That is worth being precise about, because "flag it and proceed" felt like the disciplined move and
it was the cheaper half of the discipline. The packet says a defect is reported, never absorbed. I
reported it *and* absorbed it. The rule I was missing:

> **A mechanical sweep defined by a grep is defined over file CONTENT. A write contract has to be
> defined over file ROLE.** `grep -l` cannot tell a tool from a record. Before editing anything whose
> name says `superseded`, `archive`, `.orig` or `-v1`, ask what would be false about that file
> afterwards — and if the answer is "it would describe a machine it never ran on", that is not a
> judgement call, it is a stop.

*Price:* one revert, one traps entry, one round. *Price had nobody caught it:* two archives in the
mission's permanent record silently claiming provenance they do not have — the exact failure class
this mission's stamping and set-equality rules exist to prevent, arriving through a portability
sweep instead of through a log.

*What I nearly got wrong in the fix itself:* proving a revert with `git diff <base> -- <path>`, which
is empty **and exit 0 when the pathspec matches nothing** (`TOOLING-TRAPS:1447`). An empty diff would
have "proved" the revert even if I had fat-fingered the path. Proved it by blob hash
(`git rev-parse <base>:./<path>` vs `git hash-object`) **and** showed a non-empty control diff
against `d47452e1`, so the pathspec is demonstrably resolving. Cost: three extra lines of gate.

### F2 — the stream was wrong, and the place it was wrong is the place it matters

The readiness packet told the operator to expect `RELAY DEGRADED xAI SANDBOX-PROFILE-UNAVAILABLE` on
**stderr**. It is `process.stdout.write` (`acceptance/grok-relay.ts:199-201`), and the code's own
comment two lines up says so: "Loud on the ceremony's own stdout".

The instructive part is *why the error was survivable and therefore invisible*: `closing-run.sh`
captures with `>> "$LOG" 2>&1`, so both streams land in one file and no log would ever have exposed
the mistake. It would only bite an operator watching a live terminal or filtering one stream — the
one reader who cannot check the source. **A fact that only a human consumer depends on is a fact no
gate will ever catch; those sentences need a citation at the moment they are written, not a review.**
I wrote `grok-relay.ts:87`, `:102` and `:24` for the three constants in that same paragraph and then
asserted the stream with no line at all. The citations I took were exactly the ones that were easy.

*Generalisable, and cheap:* **any claim about behaviour in an operator-facing document carries a
`file:line`, or it is a guess.** Round 0 already applied that rule to every value in the table; it
should apply to every verb in the prose too.

### What this says about the machine

1. **"I flagged it" is not the same as "I stopped".** The heartbeat protocol's §3.7 is *say what you
   cannot do* — but a contract that names a file whose role forbids the edit is a packet defect that
   should have produced a question, not a concern paragraph filed after the fact. One question, one
   round-trip, versus one review round: the question is an order of magnitude cheaper, and I had the
   information to ask it before I made the edit.
2. **Two of round 0's three near-misses and both of this round's findings share one shape:** a check
   that reports success over a thing it never examined — `perl -0pi` exiting 0 on no-match, porcelain
   blind to gitignored residue, `git diff` empty on an unmatched pathspec, a merged `2>&1` hiding a
   stream error. **The house rule that would catch all four: every instrument must be shown able to
   say NO on this exact input before its YES is worth anything.** That is `TOOLING-TRAPS:4787`
   ("Prove the instrument can still say YES before reporting eight NOs") run in the other direction,
   and it is the single highest-value habit in this mission's tooling.
3. **The four tools findings are drafted as ticket lines** in the SDD report rather than fixed, per
   the review: `closing-run.sh:20` (`mkdir` before the refusal — ruled harmless, left as is),
   the uniform `100644` modes (`tools/x.sh` exits 126), `closing-run.sh:23` (bare-PATH `--version`
   reads, untestable from this seat without executing a real CLI), and `d15-classify.py:39-45`
   (an unresolvable `INT` subtracts nothing, silently).
