# Self-report — seat `REV-S02-p1-security-data-safety`, node REV(S02) pass 1, mission `debate-tiers`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session: `fe8d9450-13c6-4fa1-aab4-c7333403d886` · ticket `t_2061ade7` · worktree
`.worktrees/rev-s02-p1-security/dialectical-engine` @ `9ef275aa`, 0 dirty in, 0 dirty out.
Wall clock: ~11:19 → ~11:45 EEST. Verdict PASS, N1/N2/N3.

---

## 1. The body: what this review actually cost, line by line

| Phase | Wall | Tool calls | What it bought |
|---|---|---|---|
| Packet + COMMON + skills | ~4 min | 6 | the contract |
| Package README, probes.md, both diffs, oracle | ~5 min | 5 | the CLAIM |
| Source reading (admission, error face, both write paths, migrations, contract) | ~5 min | 10 | the mechanism |
| **Re-running 4 cluster commands × 2** | **~3 min** | 6 | the only thing that makes my PASS a measurement |
| **Writing and running my 2 probes** | **~8 min** | 9 | **every finding and every proof in the verdict** |
| **The 2-cell mutant** | **~2 min** | 4 | **N2 — the only finding nobody could have reached by reading** |
| Packet citation audit | ~1 min | 2 | N3 |
| Promotion + artifact + this report | ~6 min | 8 | the handoff |

**The cause worth naming: reading is cheap and proves nothing; probing is cheap here TOO, and the
fleet keeps budgeting as if it were not.** My two probe files took ~8 minutes and produced the entire
evidentiary spine of a PASS on a HIGH-risk slice. The mutant took two minutes and produced the one
finding that no amount of diff-reading could have produced. If a REV seat's budget were stated as
"one probe file and one mutant, minimum" rather than "read these files", the same verdict would come
out in half the tokens with more of it measured.

## 2. What I NEARLY got wrong (three, and the third is the expensive one)

1. **I nearly opened a V row for the entitlement hole.** `plan_tier` is client-asserted with zero
   server-side check, it now selects which models run *and* becomes the billing record, and I had the
   `V-ROW: NEW` block half-drafted before I read `V-DECISIONS-PACKET.md:12` — row **V-6** already rules
   it ("any signed-in user may pick Premium"). A duplicate row costs V a decision they already made
   and costs the orchestrator a transcription. **The rule that saved me was mechanical, not clever:
   read the V packet's rows for your slice BEFORE drafting a row, not after.** The packet does not say
   to; COMMON §4 tells you how to *write* a row and nothing about checking for an existing one.
2. **I nearly reported the two `500`s (a `null` entry in the discovered panel) as an S02 defect.** The
   base did the same thing — the deleted line in the C2 diff dereferences a `null` entry identically.
   A reviewer who measures a bad outcome without asking *"did the base do this too?"* files noise. The
   diff is the control group and I should reach for it first, not last.
3. **I nearly declared the evaluator test vacuous from the diff alone.** The reasoning was airtight
   and I would have been right — but "right by reasoning" is exactly what heartbeat-reviewer §2 says
   produces the embarrassments. Cell B (remove the filter, watch the same test fail) cost two minutes
   and turned an argument into a two-cell experiment. **Every vacuousness claim should be required to
   ship its control cell.** Without cell B, an author could answer N2 with "it was always double
   guarded" and there would be no way to settle it.

## 3. What repeatedly cost tokens — causes, not symptoms

**C1. Line-number citations into files that moved.** N3 is one instance (`0040:4317` naming a
function C1 superseded), and the mission history is full of the same shape: TOOLING-TRAPS variant 6,
`BASELINE.md:48-70` vs `:43-65` corrected at REQ-REV pass 2, `PLAN.md`'s `$13`/`:1250` residue
tickets `t_ce7452ba` and `t_1e99444c`. Every one costs a seat a verification round trip and
sometimes a wrong patch. **Upgrade: a citation is `path:line — <the first 40 chars of that line>`,
always, and `packet-check.sh` re-reads the line and diffs the quoted text.** The quote makes the
citation self-verifying; a bare number can only be trusted, never checked. The same change would have
caught N3 automatically: 0040's line still reads what it said, but a `commit + path + line + text`
triple would have shown the seat that a *newer* migration owns the function.

**C2. Absolute line numbers inside test assertions.** `tiers-s02-rosters.test.ts:90-102` pins model
ids to `cards.ts:27`/`:28`. One unrelated line in a marketing file turns a security guard into a
false RED, and false REDs are the single most expensive event in this fleet — a seat spends a block
deciding whether it broke something. **Upgrade: an architecture guard asserts the SET of files, never
the line, unless the line itself is the property.**

**C3. Superseded SQL living beside live SQL with no marker.** `migrations/0040` and `migrations/0061`
both contain a full `core.create_encrypted_run`. Nothing in either file says which one runs. A FIX
seat sent to 0040 patches dead code and its tests still pass. **Upgrade: a `CREATE OR REPLACE` of a
function defined in an earlier migration writes a one-line header comment into BOTH files naming the
other** — `-- superseded by 0061` / `-- supersedes 0040`. Two lines, and the whole class of
"patched the dead definition" disappears.

**C4. The reading floor is enforced by honour, and my floor was right, but one input I wanted was
outside it.** N1 may duplicate a class the S01 security lens already found — I could see
`REV-S01-p1-security--probe-b-proto.test.ts` in the probes directory my own packet sends me to write
into, but opening it was outside my floor, so I flagged the possible duplicate and moved on. That is
the correct behaviour and it still leaves the orchestrator a de-duplication job. **Upgrade: the
packet carries a one-line `KNOWN CLASSES ALREADY TICKETED` list (ids + one phrase each, no prose).**
It costs the orchestrator five lines and saves every lens from either re-finding a known class or
breaking blindness to check.

## 4. Dead ends — do not re-derive these

- **`grep -rn … --include='*.ts'` unquoted dies under zsh** before grep sees it (`no matches found`).
  Quote every `--include`. Known trap, still cost me one call.
- **`out["__proto__"] = value` in a plain object silently does nothing** — it sets the prototype, not
  a key, so a probe that tabulates outcomes by key loses the `__proto__` row and reports 5 of 6. Use
  a `Map` in any probe whose keys are attacker-shaped strings. This is the same bug class the probe
  was written to find, in the probe itself.
- **The work-item table is `core.work_item`, not `battery.work_item`,** despite living in
  `packages/battery`. One failed integration run.
- The `vitest` `-t` filter reports skipped tests in the file count, so `1 passed | 20 skipped (21)`
  is a *complete* collection with one test run — not a BROKEN run. Worth stating because
  TOOLING-TRAPS warns that a BROKEN run inside a mutant harness reads as "the mutant was not caught";
  here the two cells collected 21 each and differed only in outcome, which is what makes them
  comparable.

## 5. Where THIS packet fought me, exactly

- **It did not say to check the V packet before drafting a row.** §3 charge 2 says "say V row or
  finding" for probe 6; nothing says "and check whether that row already exists". I found V-6, V-20,
  V-21, V-19, V-15, V-11 and V-16 all already covering ground my lens reaches. One line in COMMON §4
  — *"before writing a `V-ROW: NEW`, grep `V-DECISIONS-PACKET.md` for the surface; an existing row is
  strengthened with evidence, never duplicated"* — would make that automatic.
- **`allowed` lists the promoted-probes directory with four constraints in one parenthesis** (runnable
  from any worktree, root from `$WORKTREE` or argv, logs beside not as probes, a MUTANT probe's header
  names its head and restores from captured state). Those are good rules; as a 90-word parenthesis
  inside an `allowed` bullet they are easy to satisfy accidentally and hard to satisfy deliberately.
  **They belong in the reviewer SKILL as a four-line checklist**, where every lens of every mission
  reads them once.
- **What the packet got RIGHT and should be copied:** charge 2 is eight numbered, lens-specific
  obligations, each naming the probe and the CLAIM to refute. That is the single best packet feature
  in this mission — it converted an open-ended "security review" into eight falsifiable questions, and
  the artifact writes itself against them. Charge 3's explicit "your worktree is yours alone, here are
  the four traps that apply" is the second best; naming four trap headings instead of the whole file
  is exactly right.
- **One thing the packet asked that a `ui: no` slice cannot give:** the `verification` line in §2 says
  "one mount of every surface this slice shares with another slice or with the app shell — on UI:
  rendered DOM…". S02 ships no UI, so I mounted the shared surfaces that exist (the HTTP route, the
  contract constant, both DB write paths) and said so. The line reads as boilerplate carried from a
  UI slice; a `ui: no` packet should say which surfaces count, and this one's §3 charges effectively
  did, so the §2 line is redundant weight.

## 6. Toward the one-prompt machine — the three changes I would make first

1. **Make the probe the deliverable, not the prose.** A REV seat's artifact is currently a document
   that *describes* evidence. It should be a runnable script plus a table of its output. Every claim
   in my §3 is reproducible by `WORKTREE=… zsh REV-S02-p1-security-data-safety--run.sh`; that script
   is worth more to the next pass than the 400 lines around it, and it is the part a machine can
   re-run unattended at every later head. **Rule: a finding with no promoted probe is a comment, not a
   finding.**
2. **Self-verifying citations (C1) + supersession markers (C3).** Together these are ~10 lines of
   convention that would have prevented N3, the two PLAN residue tickets already open on this slice,
   and the `BASELINE.md` line-drift correction at REQ-REV p2. This is the highest ratio of tokens
   saved to effort spent that I can see in the mission record.
3. **Give the packet a `KNOWN CLASSES` line and a `ROWS ALREADY OPEN ON THIS SURFACE` line.** Five
   lines the orchestrator already has in hand. They convert the two most common wasted lens outputs —
   a duplicate finding and a duplicate V row — into non-events, without touching blindness, because
   both lists are facts the orchestrator holds and no lens's judgment.

**The single sentence:** this slice was reviewable in twenty-odd minutes because someone had already
turned the requirements into eight numbered, probe-shaped questions — the way to make this a
one-prompt machine is to make *that* the product of the planning nodes, and to make a runnable probe,
not a paragraph, the product of the review nodes.
