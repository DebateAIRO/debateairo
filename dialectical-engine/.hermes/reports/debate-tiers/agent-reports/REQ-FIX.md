# SELF-REPORT — seat REQ-FIX · node REQ-FIX (requirements rework) · mission `debate-tiers` · pass 2 of 3

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**Run:** 2026-09-09 21:10 → 21:26 EEST, 16 minutes wall clock, 21 tool calls, ~145k tokens.
**Output:** 8 assigned findings closed, 234 lines added across 7 files, 2 SPECs re-frozen as v2, 1 new
V row. **Zero tokens spent searching for a file** — the packet named every range. That is the
headline, and it is the difference between this pass and pass 1.

---

## 1. The body — the CAUSE of this rework, not the four symptoms

**All four blocking findings are one defect wearing four coats: the SPEC pinned the FIRST decision
and left the SECOND to inference.**

| Finding | First decision (pinned in v1) | Second decision (left to inference) |
|---|---|---|
| B1 | *where* the roster filter runs (`apps/api/src/index.ts:1205`) | *when* the refusal fires, relative to the throw already at `:1216` |
| B2 | *which* field becomes required | *how* it is typed, and *which class of call sites* that reaches |
| B3 | *what value* Free's risk tier takes (`standard`) | *what provenance* travels beside the value |
| B4 | *that* a read-back command exists | *who owns the file it is written into* |

Requirements prose pins values naturally — a value has a name and a place. Order, ownership,
encoding and provenance have neither, so they read as implementation detail and get inferred. Two
seats infer differently, and a coin decides which build V receives. Pass 1's SPECs were *accurate*
(the reviewer checked 42 citations and found 42 correct); they were under-determined, which is a
different failure and the one this graph is built to catch.

**The upgrade, and it is three questions long.** Before a REQ node freezes, it re-reads its own
requirements once and asks of each: **is the ORDER pinned? is the OWNER pinned? is the ENCODING
pinned?** Those three questions catch B1, B3 and B4 outright and half of B2 — three of four blocking
findings, for the cost of one re-read. It belongs in `heartbeat-requirements` §4 beside the
contradiction check, and in `packet-check.sh` as a REQ-node checklist line.

### 1.1 What the packet got right, measured — because this is the thing to copy

Pass 1's self-report says ~60% of its tokens went to reading product source the packet did not list.
**This packet listed ten exact `path:line` ranges in charge 1.** I read all ten in four batched
`Bash` calls, spent nothing on search, and every one of them was load-bearing. The whole reading
phase cost ~45k tokens against pass 1's ~110k for the same ground. **Naming ranges instead of files
is worth roughly 2× on a planning node, and it compounds at every node downstream.** The remaining
step — pasting the CONTENT, not the range — is still unpaid and still worth taking.

### 1.2 What cost tokens in THIS pass, and it was not reading

Two class sweeps, both unavoidable, both cheap in tools and expensive in judgement:

- **B2's sweep** — three sub-classes, 14 call sites, one `grep` each (~6k tokens). The finding named
  the members; I re-derived them anyway, which is the rule and which is what caught that
  `tests/render/ux01-new-debate-form.test.tsx:264, 272` are `toMatchObject` partials and therefore not
  members. Re-deriving a reviewer's list is not duplicated work: it is the only way the list becomes
  evidence rather than testimony.
- **B3's sweep** — this is the one that paid for itself ten times over. See §2.2.

---

## 2. What I NEARLY got wrong — three, and the second would have shipped a false sentence to V's screen

### 2.1 I nearly inherited a wrong line number from the verdict. Cost if shipped: one REQ-REV finding.

The verdict cites `.claude/skills/heartbeat-requirements/SKILL.md:42` for "PROGRESS.md — the
orchestrator is its only writer". **It is line 44.** I had already written `:42` into a re-frozen SPEC
and an append-only DECISIONS row before the packet's own verification line
("every `path:line` … re-verified after editing") made me measure it. `grep -n 'PROGRESS.md'` — one
second — and it was wrong.

**CAUSE:** a citation that arrives inside another seat's document reads as already-measured. It is
not. The verdict was authoritative about the *claim* and stale about the *pointer*, and those are
independent.
**UPGRADE:** `packet-check.sh` re-measures every `path:line` a packet or a consumed verdict quotes,
at dispatch, and stamps the ones that moved. Both pointer defects in this pass are one
`awk 'NR==<n>'` from detection. This is the 2026-08-29 lesson again — **gates work, reminders do not.**

### 2.2 I nearly closed B3 exactly as written, leaving the lie one layer up and visible to V.

B3 says the Free lock persists `tier_provenance_ref: "machine:deployment-floor"`, naming a source the
page never reads, and the fix is an honest string. True — and incomplete. Sweeping the class
(*everything derived from a `MACHINE_DEFAULT` risk tier the asker did not choose*) found a third
member the verdict did not name:

- `apps/ui/lib/v3/labels.ts:6` maps `MACHINE_DEFAULT` to the **fixed phrase** "machine default from
  the deployment floor";
- `apps/ui/components/AnswerHonestyDrawer.tsx:86` renders that phrase beside the ref.

So the fixed SPEC would have produced, on V's own screen: *"Risk tier standard · machine default from
the deployment floor · machine:plan-tier-free"* — an honest string sitting inside a false sentence.
The persisted field would be right and the words V reads would be wrong, which is worse than the
defect B3 reported, because a column needs an audit to expose and a drawer needs a glance.

I did **not** fix it: the drawer is the debate page, not the `/new` surface S01 owns; the label is
shared by every run in the app; and `tests/render/prov01-honesty-drawer.test.tsx:41` asserts the
phrase verbatim in a suite with no `BASELINE.md` row. Routed as row **V-14**, with the two closable
paths written out. **The lesson is general and mechanical: a provenance field is never alone — sweep
every label, every projection and every export that reads the same source.**

### 2.3 I nearly left a stale citation alone because it was not on my list.

`S02/SPEC.md` R14 pinned `BASELINE.md:43-65`. That range was correct when v1 froze and moved by
exactly five lines when the orchestrator appended the N3 and B2 baseline rows at 21:00–21:02 — the
rows that fixed two other findings from the same verdict. **A fix to one finding silently broke a
pointer belonging to another.** Corrected to `:48-70` (measured). Two siblings survive: `S02/DECISIONS.md`
row V-12 and `V-DECISIONS-PACKET.md:18` both cite `BASELINE.md:7, 40`, where `:40` should now be
`:45`; DECISIONS is append-only so I appended the correction, and the packet file is the
orchestrator's.

**CAUSE, and it is architectural:** `BASELINE.md`, `V-DECISIONS-PACKET.md` and every `DECISIONS.md`
are append-only files, and **every line citation into an append-only file decays on the next
append.** This mission already carries four such citations and one had already rotted within 25
minutes of being written.
**UPGRADE:** ban the pattern. Cite the VALUE (`pol01-policy 8/8`) or a stable anchor
(`<!-- suite:pol01-policy -->`), never the line. I wrote R19's two new baselines as values for
exactly this reason, and wrote the rule into `S02/DECISIONS.md` so the next seat inherits it.

---

## 3. DEAD ENDS — nobody re-derives these

1. **`assertMakerAdmission` does NOT enforce two makers.** It throws iff `configuredMakers` is empty
   (`packages/critique/src/index.ts:334-339`); its own comment says "every nonempty discovered panel
   serves". The two-maker threshold lives in `applyCriticUnavailableCap` (`:342-357`) and marks the
   run `SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE` — **it still serves.** Reading the name and stopping
   is what produced N4 and half of B1.
2. **`NewDebateAskDefaults` already carries three optional members** (`riskTierWasEdited?`,
   `steeringPresets?`, `steeringAnnotations?`, `apps/ui/app/new/defaults.tsx:52-54`). The
   optional-vs-required argument for the tier is already settled by the type it joins; do not re-open
   it on style.
3. **No suite asserts the `false` branch of `buildNewDebateAskConfig`'s provenance.** Every
   `machine:deployment-floor` in `tests/` is a literal passed in or a fixture, never a value that
   function derived (`grep -rn 'machine:deployment-floor' apps packages tests`, lane at `7f89f7b7`).
   Changing that string breaks nothing. Do not go hunting for the test that will break.
4. **`tests/render/prov01-honesty-drawer.test.tsx` has no `BASELINE.md` row** and asserts a shared
   honesty phrase verbatim at `:41`. Anyone editing `apps/ui/lib/v3/labels.ts` turns it red with no
   baseline to argue against.
5. **`tests/unit/t9-mode-tokens.test.ts` is named by S01 R19 and has no `BASELINE.md` row either.**
   N3's sweep found three suites missing rows; there were four. Measure it before the first RED test
   of the cluster that touches it.
6. **`tests/unit/v2ui-data-layer.test.ts` line numbers differ between trees.** The lane copy at
   `7f89f7b7` has the ask block at `:742-767`; the main tree's carries +41 lines of another mission.
   Every citation in these SPECs is the LANE copy. A seat handed a main-tree number finds nothing.

---

## 4. What we must upgrade — ranked by rework rounds saved

| # | Upgrade | Where | Saves |
|---|---|---|---|
| 1 | **The three-question freeze check** — per requirement: ORDER pinned? OWNER pinned? ENCODING pinned? | `heartbeat-requirements` §4 + `packet-check.sh` | 3 of the 4 blocking findings in this verdict — one whole rework round and a V gate |
| 2 | **Re-measure every `path:line` a packet or verdict quotes, at dispatch** | `packet-check.sh` | two inherited pointer defects in this pass alone; one `awk` per citation |
| 3 | **No line citations into append-only files** — cite the value or a stable anchor | COMMON §4, packet template | a pointer class that rots on every append; one had rotted in 25 minutes |
| 4 | **`V-ROW:` lines are plain text, never backtick-wrapped** | packet template, `heartbeat-requirements` §2 | N1's whole class — rows V-11/V-12 were truncated where a nested backtick opened. V-14 is written with none. |
| 5 | **A fix seat gets the reviewer's reproduction commands routed to a node that can RUN them** | packet template §3 | the verdict named the exact command that proves B2 (`pnpm exec vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/pol01-policy.test.ts`, before and after the guard) — and a REQ-FIX seat runs no suites, so nobody ran it. I put it in R19 so BUILD inherits it, but ownership should not depend on a seat's improvisation. |
| 6 | **Packets carry the measured EXTRACT, not the range** | orchestrator intake | the last unpaid step of pass 1's #1 upgrade; ranges already bought ~2× |

---

## 5. How this becomes a one-prompt machine

Pass 1's answer was *stop re-measuring the same twenty facts*. This pass says the second half:
**stop re-measuring, and stop trusting what was measured once.**

Every defect in this pass — the four blocking findings, the two pointer rots I nearly inherited, N1's
truncated rows — is a fact that was TRUE when it was written and was consumed later as if time had
not passed. Line numbers moved. A baseline file grew. A skill file shifted by two lines. The system
does not need more measurement; it needs measurements that carry their own expiry:

1. **Every fact in a packet carries the command that produced it AND is re-run at dispatch.** COMMON
   §6 already has the command column. Running it is one loop in `packet-check.sh`.
2. **Anything append-only is addressed by value or anchor, never by line.** This single rule closes a
   whole species of finding, and it costs nothing to obey.
3. **The freeze check is three questions, not a paragraph.** ORDER, OWNER, ENCODING. Under-determined
   requirements are the expensive kind of wrong, because they are *not wrong yet* — they become wrong
   in a coding seat's hands, two nodes and one V gate downstream.

**On the efficiency of the coding itself:** this pass moved four decisions from a BUILD seat's
inference into the SPEC — a control-flow order, a TypeScript modifier, one string literal and one
artifact's owner. Each is one line of code. Each would have cost a RED suite, a confused seat and a
rework round to discover in a lane, and the B1 one would have reached V as a wrong error code in the
only acceptance path runnable this week. **The trade this node exists to make is: one grep now, or
one rework round later. It won four times today.**

---

## 6. Where THIS packet was unclear, exactly

- **Charge 7 (N2) requires the compass to name every RED-at-base suite "with its `passed/total`", and
  those numbers live only in `BASELINE.md` — which is not in my `allowed` list.** That works until a
  suite the SPEC names has no row: `tests/unit/t9-mode-tokens.test.ts` has none, and I had no legal
  way to close the gap. I named it in R19 with the measure-before-RED rule and reported it. The packet
  should say what a seat does when a fold-in depends on another seat's file being complete.
- **"Fix the CLASS" (§3 of the packet) versus "no requirement added beyond the findings" (§2
  verification) collide whenever the class runs past the finding.** It happened twice — B3's drawer
  label and the `BASELINE.md` citation class. The rule I applied, and which the packet should state:
  **fix inside your file contract, route outside it.**
- **Charge 2 lists eight finding tickets to comment on and says nothing about a NINTH finding.** I
  found three (the drawer label, the `t9-mode-tokens` baseline gap, the citation rot) and put them in
  the handoff rather than opening tickets, because ticket creation is the orchestrator's. One packet
  line would remove the guess.
- **The packet says `ui:` stays line 3 and the supersession line goes directly under it.** "Directly
  under" and "a line" both read as one line; what B1–B4 needed was a block naming every changed
  requirement. I wrote a block, kept `ui:` on line 3, and am declaring the reading.

**What the packet got right, and must be copied:** the ten `path:line` ranges in charge 1 (§1.1 —
worth ~2× on the reading phase); naming the LANE copy of `v2ui-data-layer` with its line range and
saying why the main tree's differs; charge 11's explicit "these stand as written, this pass does not
reopen them", which stopped a whole category of scope creep before it started; and per-charge
numbering with "answer each or write UNVERIFIED".

---

## 7. ADDENDUM — the packet defect that arrived mid-run, and the undo that did not exist

**Sequence.** The orchestrator posted a CORRECTION on `t_a4a6ea69` at **21:14** superseding the
packet's §1 'output' and charge 11: a frozen SPEC is never edited in place; the amendments go into a
new `slices/<S>/SPEC-v2.md` and `SPEC.md` stays byte-identical. The packet I was dispatched with says
the opposite in two places — "`SPEC.md` re-frozen as v2 (a supersession line directly UNDER the `ui:`
line — `ui:` stays line 3)". I had already amended both `SPEC.md` files in place by the time I read
the comment, at **21:32**, on my way to post the handoff.

**Cost:** ~8 minutes and ~25k tokens to recover. **Price of not reading it:** two frozen files
corrupted and a REQ-REV pass 2 finding on the seat, not the packet.

**What made the recovery possible, and it was luck, not design.** `docs/missions/debate-tiers/` is
**untracked** (`git status --short` shows it as a single `??` entry). There is no git object to
restore from: `git checkout --` would have done nothing. I rebuilt both v1 files by scripting the
inverse of my own edits over a copy of the amended text, then proved the result independently — S01
came back at **189 lines** and S02 at **141 lines**, matching REQ's pass-1 handoff exactly, and every
one of the verdict's v1 line citations lands again on the sentence it names (S01 R7 `:51-63`, R12/R13
`:86-93`, R19 `:130-137`, R20 `:138-144`, R21 `:145-146`; S02 R3 `:36-41`, R5 `:47-51`, R6 `:55-58`,
R12 `:89-91`, R13 `:95-101`, Precondition A `:109-112`, step 7 `:129-130`, step 9 `:133-134`). Had I
retyped the files from my reading instead of inverting the edits, I would have had no such proof.

**Three upgrades, and the first is the cheapest insurance in this protocol:**

1. **Commit the mission tree at every freeze.** A frozen SPEC that git has never seen has no undo. A
   `docs(mission): freeze S01/S02 SPEC v1` commit at REQ's READY marker costs one command and turns
   every later mistake into `git checkout`. The no-push law is untouched by it — committing is not
   pushing.
2. **A packet correction that supersedes the packet must reach the seat before the work, not after.**
   The comment was posted 2 minutes after dispatch and read 18 minutes later, because a seat reads
   its ticket at CLAIM and then works. Either the orchestrator re-dispatches with an amended packet,
   or the seat's contract says re-read the ticket before writing the FIRST artifact — a HEARTBEAT
   marker with a comment re-read is the natural place, and I did not have one.
3. **When a packet and a contract disagree, the packet is the defect.** The correction was right and
   the packet was wrong; `heartbeat-requirements` §2 and each SPEC's own frozen note already said so,
   and both were in my reading floor. **I read both and followed the packet anyway** — because a
   packet reads as the more specific instruction. That is the deeper defect: `heartbeat-protocol`
   ranks sources (spine > skills > INSTRUCTIONS > board) and a packet is nowhere in that list.
   Naming its rank — *a packet cannot override a role contract; a contradiction is a packet defect,
   reported under §3.7* — would have stopped me at 21:16 instead of 21:32.

**One consequence for the reviewer of this pass:** the eight finding-ticket comments I posted quote
line numbers under the path `slices/<S>/SPEC.md`. The reshaped `SPEC-v2.md` keeps every one of those
line numbers identical — only the filename changed — and a correction line is posted on each ticket.
