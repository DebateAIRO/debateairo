# ARCH-REV-S01 — blind review of ARCH-S01's packet and `slices/S01/PLAN.md` · round 1 of max 3

SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:writing-plans

`superpowers:receiving-code-review` **not loaded this session — not needed because no finding was contested** (no contact with the author; this is a blind first round).

**Verdict: REWORK** — 6 blocking (B1–B6), 8 non-blocking (N1–N8), 4 packet findings (P1–P4).
Round 1. A round-3 REWORK would go to a V DECISIONS PACKET row; this is not that round.

**Where I stood.** Main tree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`,
HEAD `2b670d30`, 90 dirty (other missions, untouched). Command lane
`.worktrees/consent-s01/dialectical-engine`, HEAD `2b670d30`, branch `slice/consent-s01`,
`git status --porcelain` = 0 entries before and after every command below. No git writes, no
edit to anything under review. Scratch:
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/arch-rev-consent-s01/`.

**What this plan gets right, so the findings are read in proportion.** It is the strongest
artifact this mission has produced. 46 steps, every one with `serves:`/`files:`/`test:`/`accept:`/`cluster:`;
46 refutation rows, one per step, none with an empty "does NOT catch" cell; zero banned words;
the R20 shared interface paragraph is byte-identical to `slices/S02/SPEC.md` S02-R14 after
unwrapping; the SPEC md5 pins hold; the contrast gap that survived three review rounds is closed
with a mechanism and a number; the multi-path `vitest` silent-drop trap is real and I reproduced it.
The findings below are about the *guards*, not about the thinking.

---

## B — blocking

### B1. `CMD-C1` and `CMD-C5` each carry a term that cannot match under the default `grep` and locale, so both clusters are permanently RED in any state of the code

`PLAN.md:558` (`n_inv`), `PLAN.md:633` (`n_keep`), `PLAN.md:635` (`n_mount`).

Each of those three terms begins `^[[:space:]]*. tests/…` — a bare `.` intended to match vitest's
per-test glyph `✓` (U+2713) or `×` (U+00D7). Those are **3-byte and 2-byte UTF-8 sequences**. With
BSD `grep` under the C locale — which is this machine's default when `LANG`/`LC_ALL` are unset —
`.` matches **one byte**, the next byte is not the space the pattern requires, and the term is 0
forever.

**The seat that would go wrong:** the coding seat for C1 or C5, and then its reviewer. `CMD-C1`
requires `[ "$n_inv" -eq 1 ]`; `CMD-C5` requires `[ "$n_keep" -eq 2 ]` and `[ "$n_mount" -ge 1 ]`.
When the command is run anywhere the user's interactive shell profile is not sourced — a `.sh`
file, `bash -c`, a `Makefile`, CI, another machine, or **the three-run loop `S01-S46` itself asks
for** — the cluster can never pass. The seat then hunts a defect in its own correct code.

Measured, same input file, same machine, three environments:

```
$ /bin/bash  scratch/cmd-c1.sh   (script; profile not sourced)
S01-C1 verdict=1   summary:       Tests  2 failed | 6 passed (8)   typecheck-diagnostics-outside-the-pin: 0
TERMS: vt=1 n_fail=2 n_pin=2 n_lit=1 n_inv=0 n_invfail=0 n_tc=0

$ <same command, typed inline in the tool shell, which sources the user's snapshot>
S01-C1 verdict=0   summary:       Tests  2 failed | 6 passed (8)   typecheck-diagnostics-outside-the-pin: 0
TERMS: vt=1 n_fail=2 n_pin=2 n_lit=1 n_inv=1 n_invfail=0 n_tc=0
```

Root cause isolated to the byte, not guessed:

```
$ type grep
grep is a shell function from /Users/vladmihaimiron/.claude/shell-snapshots/snapshot-zsh-1788702936096-2gobzq.sh
$ grep --version           (inside a plain bash/zsh/sh script)
grep (BSD grep, GNU compatible) 2.6.0-FreeBSD
$ grep --version           (tool shell, via the snapshot's function)
ugrep 7.8.4 aarch64-apple-macosx +neon/AArch64; -P:pcre2jit; ...

$ sed -n '4p' t9.out | head -c 8 | xxd
00000000: 20e2 9c93 2074 6573                       ... tes        # " ✓ tes" — ✓ is e2 9c 93

$ LC_ALL=C            /usr/bin/grep -cE '^[[:space:]]*. tests/unit/t9-mode' t9-captured.out  -> 0
$ env -u LC_ALL -u LANG /usr/bin/grep -cE '^[[:space:]]*. tests/unit/t9-mode' t9-captured.out -> 0
$ LC_ALL=en_US.UTF-8  /usr/bin/grep -cE '^[[:space:]]*. tests/unit/t9-mode' t9-captured.out  -> 10
```

Same for `CMD-C5`'s `n_keep`, against my own captured base run of that command:

```
tool shell (grep shim -> ugrep):     2
/usr/bin/grep, LC_ALL unset (C):     0
/usr/bin/grep, LC_ALL=en_US.UTF-8:   2
```

**This is the exact failure mode `PLAN.md:505-511` was written to prevent** — "the guard term is
permanently 1, and the cluster's acceptance can never pass in any state of the code". The author
audited table-cell `|` escaping and missed multibyte-glyph matching. A9 cannot catch it either:
its signature list (`startup error|unexpected argument|failed to load|…`) tests whether the
*command* runs, never whether the *guard* is satisfiable.

**Fix (class, not instance):** never match vitest's status glyph. Replace `^[[:space:]]*. ` with a
glyph-free anchor — e.g. `n_inv=$(printf '%s\n' "$out" | grep -cE 'tests/unit/t9-mode-tokens\.test\.ts > .*declares the complete inventory and the same mode-bearing key set in both modes$')`
paired with the existing `n_invfail` term, which is ASCII-only and already discriminates. Sweep
all seven commands for any other non-ASCII-dependent term, and re-run each guard **once from a
`.sh` file** as well as inline — that difference is what hid this.

### B2. The colour-literal delta — the gate R24 and R25 both hang on — is asserted by no cluster command; `n_lit` counts the *pinned line*, not the *hit list*

`PLAN.md:557` (`CMD-C1`), `:590` (`CMD-C3`), `:610` (`CMD-C4`), `:665` (`CMD-C7`); mutant-class
rows `PLAN.md:515` ("a colour literal introduced outside the two blocks"), `:517` ("a colour
literal … in `globals.css`"); step `PLAN.md:168-173` (`S01-S04`).

`n_lit` is `grep -cE 'globals\.css:[0-9]+:background: color-mix\(in srgb, #0a0806'` — it matches
**only the pinned `.drawerScrim` hit**. The shipped test builds `hits` as
`hits.push(\`${path}:${lineNumber}:${line.trim()}\`)` and asserts `expect(hits).toEqual([])`
(`tests/unit/t9-mode-tokens.test.ts:541-560`, read in the lane). A second offending line adds a
**second array element**; the pinned element is still printed; the **same single test** still
fails, so no new `FAIL` line appears either. Every term stays put.

Measured. I took my real base capture and inserted exactly the one extra received-array element
vitest would print for a literal added to `layout.tsx` (`Array(1)` → `Array(2)`), then evaluated
the guard terms verbatim:

```
=== the two received-array elements ===
+   "…/apps/ui/app/globals.css:6096:background: color-mix(in srgb, #0a0806 32%, transparent);",
+   "…/apps/ui/app/layout.tsx:47:<div style={{ background: "#F9F6F1" }}>",

n_lit=1        (CMD-C1/C3/C4/C7 all require exactly 1)   -> SATISFIED
n_tokfail=2    (all require exactly 2)                   -> SATISFIED
n_pin=2        (CMD-C1 requires exactly 2)               -> SATISFIED
summary=[      Tests  2 failed | 6 passed (8)]  matches '2 failed | N passed'? YES
```

So `S01-S04`'s acceptance — *"the received array … has exactly one element … A second element is
this slice's finding"* — is not mechanised anywhere, and the two cluster rows that name this mutant
cannot fail for it.

**And it is worse for the one cluster that actually edits a scanned file.** `CMD-C5`
(`PLAN.md:626-640`) does not run `tests/unit/t9-mode-tokens.test.ts` at all, yet C5's file surface
(`PLAN.md:519`) includes `apps/ui/app/layout.tsx` — one of the four files that test scans
(`:546`), and a file S01-R25 names explicitly ("nor anywhere in `apps/ui/app/layout.tsx`"). A
`#hex` added by C5's mount edit passes `CMD-C5` **and** `CMD-C7`. `S01-S42`'s own-file scan
(`PLAN.md:463-468`) covers `lib/consent.ts` and `components/consent/**` only — not `layout.tsx`.

**The seat that would go wrong:** the C5 coding seat, whose one-line mount edit is the likeliest
place in this slice for an inline style; and the C7 seat, which believes `n_lit` closes R25.

**Fix:** make the term count the hit list, not the pin — e.g.
`n_hits=$(printf '%s\n' "$tok" | grep -cE '^\+   "/.*:[0-9]+:')` with `[ "$n_hits" -eq 1 ]`, plus
the existing pinned-line term so the pin cannot silently vanish; and add the `tok=` run + those
two terms to `CMD-C5`.

### B3. `S01-S16` carries an instruction a stranger cannot mark done or not-done, and whose only lawful home is outside its own cluster

`PLAN.md:260-265`. The step's `files:` field names exactly one file (`globals.css`) and then ends:

> *"Also wire the bar's three buttons to `writeConsent(decisionFor(...))` through their props' call sites."*

- **No file.** `files:` names only `globals.css`; the wiring is in neither.
- **No acceptance.** `accept:` (`PLAN.md:264`) is entirely about the CSS block — the marker `grep -c '=== consent-ui S01 ==='`, R09's values, the no-literal scan. Nothing observes the wiring. A stranger cannot say whether this half of the step is done.
- **No lawful home.** `writeConsent`/`decisionFor` are C2's exports (`S01-S06`, `S01-S09`). C3's file surface (`PLAN.md:517`) is `CookieBar.tsx`, `globals.css` (S01 block), `consent-bar.test.tsx`. The props' call sites live in `CookieConsent.tsx`, which is **created two clusters later** (`S01-S26`, C5) and is outside C3's surface. `PLAN.md:758-759` forbids exactly this: *"A cluster may write no file outside its own row, even a file another S01 cluster owns."*
- **Both readings are defects.** If the writes go in `CookieBar.tsx`, they contradict `S01-S13` ("no storage access of its own") and `DECISIONS.md:89` ("the rest are prop-driven") — and `S01-S13`'s acceptance would not catch it, because it greps for `localStorage`, which `writeConsent` is not. If they go in `CookieConsent.tsx`, the step is out of contract and **`S01-S29` already owns that exact behaviour** (`PLAN.md:359-364`: *"clicking `Accept all` on the bar stores …"*).
- **The two artifacts disagree about which reading is meant.** `mission-graph-S01.md:44,:70` declares an edge `C2 → C3` justified as *"its buttons call the codec C2 exports"* — i.e. the writes inside the bar. `PLAN.md`'s §Concurrency (`:525-531`) declares no `C2 → C3` edge at all (see N4).

**Fix:** delete the clause from `S01-S16` (the behaviour is `S01-S29`'s), or promote it to its own step in C5 with a file, a test and an acceptance observation.

### B4. `S01-S35` and `S01-S36` order the coding seat to write `PROGRESS.md`, which the same steps, `COMMON.md` §4 and every cluster's file surface forbid

`PLAN.md:405` (`S01-S35` accept: *"confirms in `PROGRESS.md` that neither line was edited"*),
`PLAN.md:419` (`S01-S36` **`files:` edit `LANE/docs/missions/consent-ui/slices/S01/PROGRESS.md`**),
and the same defect duplicated in `slices/S01/DECISIONS.md:113` (*"the coding seat … records
`git log -1 --format=%h slice/consent-s02` in `PROGRESS.md`"*).

`S01-S36`'s `files:` line contradicts its own next clause — *"the orchestrator is its sole writer,
so the coding seat REPORTS the value on its ticket"* — inside one sentence. `COMMON.md` §4:
*"PROGRESS.md is an empty skeleton (orchestrator is its sole writer)."* And `docs/missions/**`
appears in **no** cluster's File-surface column (`PLAN.md:515-521`) and in **no** line of
§Boundaries' Allowed set (`:723-731`), so it is forbidden by omission as well as by rule.

**The seat that would go wrong:** the C6 coding seat reads `files:` — the field the plan trained
it to treat as its write list — commits a `PROGRESS.md` edit on `slice/consent-s01`, and collides
with the orchestrator's sole-writer claim on a file the board depends on.

**Fix:** `files: none — this step writes nothing` in both steps; move the whole instruction into
`accept:` as a *report on the ticket*; correct the DECISIONS line by appending a correction (the
file is append-only).

### B5. `PLAN.md:122-126` presents `46` as the pasted output of a command that outputs `0`

```
$ grep -E '^\*\*S01-S[0-9]{2}' docs/missions/consent-ui/slices/S01/PLAN.md | grep -cE 'serves: *S01-R'
46            <- what PLAN.md:125 shows
```

Re-run by me, verbatim, from the repo root:

```
--- 4: THE SERVES COUNT, exactly as pasted in PLAN.md:124-125 ---
0
exit=1
```

The first `grep` selects only the `**S01-Sxx …` *title* lines; `· serves:` is on the **following**
line, so the pipeline can only ever emit `0`. The other three pasted counts are correct (29 / 29 /
46 — I re-ran all four). The **claim** is true (46 steps do carry a `serves:` field — my own
parser agrees) but the **evidence** is not the evidence.

This is precisely the class `PLAN.md:69-70` binds itself to (*"Every count in this file carries the
command that produced it and that command's pasted output … No count here was typed from memory"*),
the class the ARCH-S01 packet §6 N13 forwarded, and `heartbeat-protocol` §2.6. The same block is
repeated in the `READY FOR PEER REVIEW` comment on `t_5490215a`.

**Fix:** `grep -A1 -E '^\*\*S01-S[0-9]{2}' … | grep -cE '^· serves: S01-R'`, re-run, paste the real
output. Then re-run **every** pasted count in the file the same way.

### B6. 46 steps, 45 traced — `S01-S45` appears in no trace row; and 7 `serves:` claims are absent from the trace's step column

`PLAN.md:74` asserts *"every step below appears in at least one row"*. It does not.

```
$ steps defined:                       46
$ distinct steps named in trace rows:  45
$ set difference:                      S01-S45
```

`S01-S45` (`PLAN.md:484-489`, the "no second Esc listener and no second focus trap" guard) declares
`serves: S01-R18, S01-R20`, but neither the `S01-R18` row (`:96`) nor the `S01-R20` row (`:98`)
lists it. Six further one-directional gaps, all step→trace:

```
S01-S05 serves S01-R05  — row S01-R05 lists only S01-S08, S01-S28
S01-S20 serves S01-R16  — row S01-R16 lists only S01-S10, S01-S19
S01-S22 serves S01-R25  — row S01-R25 lists only S01-S04, S01-S16, S01-S42
S01-S31 serves S01-R21  — row S01-R21 lists only S01-S11, S01-S33, S01-S34
S01-S36 serves S01-R18  — row S01-R18 lists only S01-S24, S01-S41
S01-S45 serves S01-R18  — (as above)
S01-S45 serves S01-R20  — row S01-R20 lists only S01-S36…S01-S40
```

The packet's probe 2 makes count mismatches blocking. The consequence is concrete: the trace is
the artifact an orchestrator uses to cut per-cluster coding packets and to prove a requirement is
covered, and `S01-R20`'s row omits the one step that mechanically enforces its "no second Esc
listener" clause. (The **cluster** column is clean — I cross-checked all 29 rows against each step's
own `cluster:` field and the cluster table's ranges: **0 mismatches**, exactly as the author claimed.)

**Fix:** add `S01-S45` to the `S01-R18` and `S01-R20` rows and the six other step ids to their rows;
then re-run a both-ways script rather than a `grep -c` pair — a count of rows proves nothing about
the contents of the step column.

---

## N — non-blocking (each needs a ticket; the tier sets *when*, never *whether*)

**N1. The typecheck term passes vacuously when `pnpm typecheck` does not run.** `PLAN.md:553, 572,
588, 608, 628, 646, 662` capture `tc=$(pnpm typecheck 2>&1)` and **never capture its exit code**;
`n_tc` counts `error TS…` lines outside the pin. Measured in the lane:

```
$ tc=$(pnpm typechek 2>&1)          # a run that does not happen
  pnpm exit=1 ; first line of $tc: undefined
  n_tc=0  -> [ "$n_tc" -eq 0 ] is SATISFIED (vacuous pass)
$ tc=$(pnpm typecheck 2>&1)         # control
  total TS diagnostics=8   outside the pin=0
```

Add `tt=$?` after the capture and `[ "$tt" -eq 1 ]` (the pin's own exit code), or assert
`[ "$(printf '%s\n' "$tc" | grep -cE 'error TS[0-9]+')" -eq 8 ]` so a run that produced no
diagnostics at all is distinguishable from a run that produced none *outside the pin*.

**N2. The A9 table calls `CMD-C1` "RED"; the guard's own verdict at base is `0` (pass).**
`PLAN.md:692` classifies it **RED** on vitest's exit code, while `PLAN.md:714-716` says of the same
command *"base output → **pass**"*. Both are in the same document. I measured `verdict=0` inline.
The consequence is not academic: C1 has **no red-before state at the cluster level**, so a coding
seat cannot use `CMD-C1` as its reproduce-first evidence (`heartbeat-protocol` §2.5). RED-first
survives at *step* level (`S01-S01`, `S01-S03`), which is why this is N and not B. Say so in the
A9 row: *"vitest RED (the pin, reproduced); guard verdict 0 — this command is green at base by
design and is a delta guard, not a reproduce-first oracle."*

**N3. Two wrong line pointers, same class as the N1/N2/N10 chain this mission already paid three
rounds for.** `PLAN.md:751-752` and `DECISIONS.md:103` both cite
`tests/unit/t9-mode-tokens.test.ts:407` for `expect(measuredRows).toBe(34)` and `:428` for the
`names.length` assertion. Measured in the lane:

```
416:    let measuredRows = 0;
426:        expect(rows).toHaveLength(names.length);
433:    expect(measuredRows).toBe(34);
```

`:407` is the `it("clears all 34 published contrast rows against all four surfaces", …)` line. The
substance is right and the two pins exist; the pointers are off by 26 and 2.

**N4. `PLAN.md` §Concurrency and `mission-graph-S01.md` disagree on the cluster edges.**
`PLAN.md:525-531` declares only: `C1 ∥ C2`, `C1` committed first, `C3 → C4`, `C5` after `C2/C3/C4`,
`C6` after the merge, `C7` last. `mission-graph-S01.md:43-44` and its reading table `:70` also
declare `C1 → C3` **and** `C2 → C3`. A reader of the PLAN alone may schedule C3 before C2 — and C3
is precisely where B3's un-filed wiring clause needs C2's exports. Reconcile in the PLAN, which is
the binding artifact.

**N5. "Placed LAST" is not where `S01-S36` is placed.** `PLAN.md:774` (§Boundaries) and
`DECISIONS.md:113` say the merge mechanism is *"placed LAST, as step `S01-S36`"*; ten steps follow
it, five of them in C7 — and one of those, `S01-S45`, asserts over the merged S02 file
`modalSemantics.ts`, so it genuinely must come after. The packet's A3 asked for LAST placement;
say instead *"last before the slice-wide guards"* and state why C7 must still follow.

**N6. `CMD-C5` hard-pins `[ "$n_fail" -eq 4 ]` against another mission's failure set.**
`PLAN.md:637`, and `PLAN.md:718-719` confirms the intent (*"another mission's four `lists` failures
repaired → fail"*). If the owning mission ever fixes `tests/render/t3-library.test.tsx`, C5 becomes
un-passable through no act of S01's, and the coding seat may not edit `PLAN.md` to unblock itself.
Prefer a monotone delta: `n_keepfail -eq 0`, `n_mount -ge 1`, and `n_newfail -eq 0` where
`n_newfail` counts `FAIL` lines whose name is **not** in `$PIN` — that shape survives a repair.

**N7. Four steps say "RED first" but name no mutant to watch it against, so a stranger cannot mark
the RED done.** `S01-S42`, `S01-S43`, `S01-S44`, `S01-S45` (`PLAN.md:463, 470, 477, 484`) are
grep-shaped guards written in C7 — *after* the code they scan is already compliant — so each passes
the moment it is typed. `PLAN.md:135-138` calls that *"a defect in that step, not a shortcut"*.
`S01-S31` and `S01-S40` show the right form (*"write that branch, see the test fail, then delete
it"*); give each of the four the same one-line mutant recipe (e.g. for `S01-S43`, add a
`transition:` to `.consentBar` with no reduced-motion counterpart, watch it fail, remove it).

**N8. A count in the handoff that is not the file's.** The `READY FOR PEER REVIEW` comment on
`t_5490215a` says *"agent-reports/ARCH-S01.md — 194 lines"*; `wc -l` returns **219**. The
self-report *was* filed before the handoff (mtime 20:06:11 vs comment 20:08:00 — COMMON §5
satisfied), and the other four path counts in that comment are exact. Same class as B5: a count
without a re-run.

---

## Packet findings (`heartbeat-reviewer` §1 — filed against the orchestrator's packets, not the seat)

**P1. `ARCH-S01.md` §5 leaks an S02 concern into the S01 packet — CONFIRMED.** Its last sentence
orders *"the `SignUpFlow` test-update step in its own early cluster"*. `slices/S01/SPEC.md:748`
puts `SignUpFlow.tsx` in Out-of-scope and `:771` under "reads but never edits";
`BASELINE.md:10` assigns `tests/render/auth-flow-integration.test.tsx` to S02. A seat obeying the
packet literally would have planned a step violating its own forbidden list. ARCH-S01 caught this
(its P1) and substituted the real S01 analogue. Confirmed independently.

**P2. `ARCH-S01.md` §2 A5 orders four decisions the SPEC did not leave open — CONFIRMED.** z-index
is `S01-R08`; the migration rule is `S01-R02`; scroll-to-end is excluded by `S01-R20`'s own text
(*"applies no scroll-to-end gate"*) and jump pills are S02's (`policyJump` in
`apps/ui/lib/privacyPolicy.ts`). A5's next sentence forbids re-deciding settled lines, so the
charge contradicts itself. ARCH-S01 recorded all four as explicitly not re-decided.

**P3. The PLAN scaffold's cluster-table header asks for the command in a table cell — CONFIRMED,
and it will recur.** `PLAN.md:513` still reads `| … | ONE verification command | … |`. ARCH-S01
worked around it (ids in the cell, commands in fenced blocks) and flagged it. **Fix the template**:
change the column header to `ONE verification command (id)`, so the next mission is not one careless
seat away from `TOOLING-TRAPS.md:483-497` again.

**P4. NEW — A9's classification rule cannot detect the defect A9 exists to prevent (this is B1's
class fix).** Both `ARCH-S01.md` §2 A9 and my own packet §2.3 define BROKEN by a signature grep
(`startup error|unexpected argument|failed to load|usage:|command not found|cannot find module|no
test files found`). Every one of those signatures is about the **command failing to run**. B1 is a
command that runs perfectly and whose **guard is unsatisfiable** — invisible to the rule, and the
second time this harness has shipped that shape. Amend A9 to require, per command: (a) run it once
in the environment it will be run in **and once from a `.sh` file**, and report both verdicts;
(b) run it against a known-GOOD synthetic input and show it passes; (c) state, per term, which
mutant makes that term flip. ARCH-S01 volunteered (b) and (c) for `CMD-C1`/`CMD-C5` — and (a) is
exactly what would have caught B1.

---

## What I verified, and how (every number below is from a command I ran in the lane)

| Claim under review | How I probed it | Result |
|---|---|---|
| 29 requirements ↔ 29 trace rows | `grep -cE '^\*\*S01-R[0-9]{2} ' SPEC.md` / `grep -cE '^\| S01-R[0-9]{2} \|' PLAN.md` | **29 / 29** — author correct; 0 requirements untraced, 0 rows with zero steps |
| 46 steps, contiguous, no dupes | own parser over `PLAN.md` | **46**, `S01-S01…S01-S46`, contiguous, no duplicates; every step has `serves:`/`files:`/`test:`/`accept:`/`cluster:` |
| every step in ≥1 trace row | set difference | **FALSE — `S01-S45` missing** (B6) |
| `serves:` count = 46 | the pasted command, re-run | **outputs `0`, exit 1** (B5) |
| trace cluster column ↔ steps' `cluster:` ↔ cluster-table ranges | own parser, all 29 rows / 46 steps | **0 mismatches** — author correct |
| 46 refutation rows, no theatre | row count + min-length scan of the "does NOT catch" cell | **46 rows, one per step, 0 short/empty cells** |
| banned words (improve/better/robust/handle/appropriate) | whole-word `grep -inowE` + stem scan | **0 hits**; only near-miss is "keydown handler" (`:518`), a noun, not the banned adjective |
| R20 ≡ S02-R14 verbatim | extracted both blockquotes, unwrapped, compared | `S01/SPEC.md:325-336` vs `S02/SPEC.md:229-240`, 12 lines each, **byte-identical** |
| `globals.css` token blocks at `:5-97` / `:99-158` | `grep -nE '^:root \{\|^html\[data-mode="chamber"\] \{\|^\}'` | `5`, `97`, `99`, `158` — **exact** |
| `layout.tsx:45-48` appShell/TopBar/{children} | `sed -n '43,50p'` | **exact** |
| `settings/page.tsx:37-39` AuthGate, `:52` AccountSettingsScreen | `sed` | **exact** |
| `tests/support/contrast.ts:3-5` throws on non-`#RRGGBB` | read the file | **exact** — `throw new TypeError(\`Expected an #RRGGBB colour, received ${hex}\`)` |
| `t9-mode-tokens.test.ts:376-377` set equality, `:546` scan list | `sed` | **exact** |
| `t9-mode-tokens.test.ts:407` / `:428` | `grep -n` | **wrong — `:433` and `:426`** (N3) |
| `CMD-C1` at base | run verbatim, both environments | `Tests 2 failed \| 6 passed (8)`, exit 1; guard verdict **0 inline / 1 as a script** (B1, N2) |
| `CMD-C2/C3/C4/C6` at base | run verbatim | all exit 1, `No test files found`, 1 line each — **RED, declared**, matches A9 |
| `CMD-C5` at base | run verbatim | exit 1, `Tests 4 failed \| 27 passed (31)`, `Test Files 1 failed \| 1 passed (2)`, terms `n_fail=4 n_pin=4 n_keep=2 n_keepfail=0 n_mount=0` → verdict 1 — **RED, matches A9 exactly** |
| `CMD-C7` at base | run verbatim | exit 1, `No test files found` (1 line) — **RED, declared** |
| BROKEN count | all seven, my own classification | **0 of 7 BROKEN** — the author's headline figure is right |
| the multi-path silent-drop trap (author's F2) | `CMD-C5` at base | **CONFIRMED** — `consent-mount.test.tsx` absent, `no test files found` lines = **0**, `Test Files … (2)` |
| the `t3-library` fourth-baseline gap (author's F1) | ran the file | exit 1, `Tests 4 failed \| 11 passed (15)`; both guarded tests present and passing — **CONFIRMED, and `BASELINE.md` does not carry it** |
| `pnpm typecheck` delta | ran it | exit 1, **8 diagnostics, 0 outside the pin** — matches `BASELINE.md` |
| colour-literal delta detectable? | synthesized the 2-hit output from my real base capture, re-ran every guard term | **all terms satisfied** (B2) |
| typecheck term vacuity | ran a non-existent script through the same pipeline | `n_tc=0`, term satisfied (N1) |
| lane left clean | `git status --porcelain \| wc -l` | **0**, before and after |

**Author's `SKILLS LOADED` vs the architecture floor.** Declared: `using-superpowers`,
`heartbeat-protocol`, `heartbeat-architecture`, `brainstorming`, `writing-plans`,
`test-driven-development` — the floor (`brainstorming` **then** `writing-plans`) is met and in
order, brainstorming's human gate is discharged in the §10.1 form, and the three not-loaded skills
are declared in §10.9's honest form. **I cannot verify the loads themselves** — a reviewer has no
access to another seat's transcript; the orchestrator's grep is the check. Recorded as UNVERIFIED,
not as a pass. The self-report exists (219 lines), was filed before the handoff, and is a case file
rather than a diary: it names causes, prices them, and proposes class fixes.

## What I did NOT verify — so the next lens knows the gaps

1. **That ARCH-S01 actually loaded the six skills it declares.** Transcript-only; orchestrator's duty.
2. **That the *contrast numbers* (4.743 / 4.833 / 4.246 / 7.171) are right.** I confirmed the
   *mechanism* is necessary (`contrast.ts` does throw on `rgba`) and that the composite rule is
   stated reproducibly, but I did not re-derive the four ratios. Cheap for the next lens; my
   prediction is they hold.
3. **That the eight `tint()`-derived token values reproduce from `design-data.js`.** Not re-run.
4. **Anything a coding seat will do.** No product code exists; every guard was probed against base
   or against synthesized output, never against an implementation.
5. **Whether `CMD-C2/C3/C4/C6/C7` can *pass*.** They cannot be run in a passing state until the
   files exist. Their shape is the sanctioned capture-first idiom and their ASCII-only terms are
   sound; that is a structural judgement, not a measurement.
6. **`n_blocks`, `n_hits` and the `Test Files 6 passed (6)` term under a real six-file run.**
   Unmeasurable at base.
7. **The DECISIONS lines against the intake dispositions and the V-row defaults one by one.** I read
   all 19 ARCH-S01 rows; each carries a reason and its rejected alternatives, none contradicts a
   V-row default that I could see, and the four A5 "already decided" questions are explicitly
   recorded as not re-decided. I did not re-read `00-intake-H0.md` C1–C10 against each row.

## Predictions (falsifiable evidence that blindness held)

I expect the other lenses to have gone at the *content* — the state machine, the B1/B3 invariants,
the copy transcription — and to have come back impressed, because that content is genuinely strong.
My prediction is that **the defects in this plan are all in the machinery, not the thinking**, and
that a lens which read the commands instead of running them from a *file* found none of B1, B2 or
N1. Specifically: I predict (a) no other lens ran `CMD-C1` in a shell that did not source the user's
profile, so no other lens saw the `✓`-matching failure; (b) no other lens fed a second colour-literal
hit through `n_lit`, because the term *looks* like a hit-list count; (c) at least one other lens
re-ran the four pasted counting commands and found B5, since it is one paste away; and (d) nobody
flagged `S01-S16`'s wiring clause, because it reads like prose colour rather than an instruction —
it is the single most likely place for the C3 and C5 seats to duplicate or drop the storage write.
If I am wrong anywhere, I expect it to be (c).

**If I were the orchestrator, I would check first:** run every one of the seven commands from a
`.sh` file before dispatching any coding seat. That one action falsifies or confirms B1 in ninety
seconds and is the difference between a clean C1 and a seat chasing a guard that cannot pass.

## Ticket routing for the N-findings (`heartbeat-reviewer` §3 — none is a residual)

| Finding | Ticket to open | When |
|---|---|---|
| N1 | `CONSENT-GUARD-TYPECHECK-EXIT` — capture `pnpm typecheck`'s exit code in all seven commands | with the B-fix round |
| N2 | fold into the B1 rework (one A9 row edit) | same round |
| N3 | `CONSENT-PLAN-LINE-POINTERS` — correct `:407`/`:428` in PLAN and append a DECISIONS correction | same round |
| N4 | fold into the B3 rework (PLAN §Concurrency gains `C1→C3`, `C2→C3`) | same round |
| N5 | wording fix in §Boundaries + a DECISIONS correction line | same round |
| N6 | `CONSENT-C5-MONOTONE-DELTA` — replace `n_fail -eq 4` with a new-failure guard | before C5 is dispatched |
| N7 | fold into the B-fix round: one mutant recipe per guard step | same round |
| N8 | no ticket — corrected in the next handoff | next handoff |

comments read through: 3
