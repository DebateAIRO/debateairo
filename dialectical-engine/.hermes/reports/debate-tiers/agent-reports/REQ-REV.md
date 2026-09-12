# SELF-REPORT — seat REQ-REV · mission `debate-tiers` · node REQ-REV pass 1 · 2026-09-09

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**Run:** 20:33 → 20:52 EEST, 19 minutes wall-clock, single session, no retries, no dead ends that
cost a re-read. Output: a REWORK verdict with 4 blocking and 8 non-blocking findings, from 42
verified citations and one live-stack probe. **Zero tool failures.** That number is the headline of
this report, and the rest of it is about why — because the previous missions' self-reports in this
repo are mostly about tool failures, and this run had none.

---

## 1. The body on the floor: what actually goes wrong in a REQ node

The four blocking findings are not four different mistakes. They are **one** mistake with four
faces, and naming it is the whole value of this report.

**CAUSE: a requirement written against a file is checked; a requirement written against a *sequence*
is not.**

REQ cited 42 file locations and got 42 right. It read `evaluateAskAdmission` closely enough to name
`makers` at `:1206`, `makerAvailability` at `:1207-1214` and `panelSize` at `:1225` individually.
And then it wrote R6 — "raise the refusal inside `evaluateAskAdmission`" — without saying *before
which line*, and the whole S02 acceptance turns on that. Same shape in B3: R7 pins the risk-tier
VALUE with a three-line derivation and never mentions the two fields shipped in the same object
literal four lines below it in the file it cites. Same in B2: R20 counts literals matched by a
`grep` and never asks which *callers* a new guard breaks. Same in B4: R12 names a file to write and
never checks who owns the file.

Every one is the same failure mode — **the citation proves the seat read the line and does not prove
it read the line's neighbourhood or its order.** A `path:line` is a point; correctness lives in
intervals and sequences.

**The upgrade, and it is small.** Add one line to `heartbeat-requirements` §4 and to the SPEC
template:

> For every requirement that names a function, state (a) the line it runs BEFORE and the line it
> runs AFTER, (b) every other field written in the same object literal or returned by the same call,
> and (c) every existing caller of the function whose signature you change. A requirement that names
> a function but no ordering is not frozen — it is two requirements.

That one paragraph would have pre-empted B1, B2, B3 and B4. Four findings, one rule.

---

## 2. What repeatedly cost tokens — priced honestly

| What | Price | Cause | Fix |
|---|---|---|---|
| **Re-reading `apps/api/src/index.ts` in four separate `sed` windows** (`:285-305`, `:500-535`, `:900-935`, `:1195-1235`, `:1280-1300`) | ~5 tool calls, ~9k tokens | The file is 1300+ lines and my packet named only the *ranges the SPECs cite*. I could not know which ranges I needed until I had read the SPECs. | The packet already does the right thing (`REQ-REV.md:10` widened inputs to "the product files the SPECs cite at the lines they cite"). The residual cost is unavoidable: a reviewer must see the neighbourhood, not the point. **Budget for it** rather than trying to eliminate it. |
| **Counting line numbers by hand from `sed` output** to confirm `:1205`, `:1206`, `:1216`, `:1225` | ~3k tokens of silent arithmetic across two messages | `sed -n 'A,Bp'` returns text with no line numbers. I mentally offset from A every single time, and I was one substitution away from an off-by-one in a blocking finding. | **`sed -n 'A,Bp' file \| cat -n` is wrong** — it renumbers from 1. The safe idiom, which I ran and checked against known line numbers before recommending it, is `awk 'NR>=A&&NR<=B{printf "%d\t%s\n",NR,$0}' file`. (`grep -n . file \| sed -n 'A,Bp'` is ALSO wrong and I nearly wrote it into this report: `grep .` drops blank lines, so the stream's line N is not the file's line N — it was off by 51 lines at 1205 when I tested it.) Put the `awk` line in `TOOLING-TRAPS.md`; numbered range-reading is the single highest-frequency operation a reviewer performs and it currently has no safe idiom recorded. |
| **The `--include` flag on zsh's `grep`** | 1 wasted call, ~400 tokens | `grep -rn "x" packages/ apps/ --include=*.ts` → `zsh: no matches found: --include=*.ts`. zsh globs the flag's value before `grep` sees it. | Quote it (`--include='*.ts'`) or drop it. Already a known class in this repo; it is not in `TOOLING-TRAPS.md` under a name I could have grepped for. |
| **The 376 KB grep** (`grep -rl 'question_line' tests apps packages`) | ~1 call, output truncated to a file, ~2k tokens to recover | I swept a field name that appears in every run projection and every `.next` build artefact. My own impatience, not a tool problem. | Sweep the *consumer* (`AskRequestSchema`, `submitAsk`, `createDebate`), never the *field*. The narrow sweep that replaced it found everything in one call and is what produced B2. |

**Total avoidable spend: roughly 12–15k tokens, ~4 minutes.** On a 19-minute run that is 20%, and
three of the four causes are one-line entries in `TOOLING-TRAPS.md`.

---

## 3. What I NEARLY got wrong — the near-miss that matters

**I nearly shipped B2 with main-tree line numbers.**

I read `tests/unit/v2ui-data-layer.test.ts` in the MAIN tree and wrote the finding against
`:794-806`. Then, while verifying my own citations, I ran `git status --short` over the files I had
cited and saw ` M tests/unit/v2ui-data-layer.test.ts` — **one of my two pieces of blocking evidence
was in a dirty file.** The lanes are at `7f89f7b7`; the main tree's copy carries +41 lines of
another mission's work. A FIX seat standing in the lane and opening `:794` would have found an
unrelated test and reasonably concluded the reviewer was hallucinating.

I recovered it — `git show 7f89f7b7:…` gave the true range `:753-767`, and I then diffed **all 18
files the SPECs cite** against base and confirmed every one is byte-identical, so the SPECs' own 42
citations are safe. But I caught it by luck of ordering, not by design: had I written the verdict
five minutes earlier I would have shipped it.

**The upgrade — and this one is a law, not a habit.** `COMMON.md:7` and `BASELINE.md:75` both say
the main tree is not a baseline surface. Neither says the thing that actually bites:

> **The main tree is not a LINE-NUMBER authority.** Any `path:line` a seat writes for a lane
> audience is measured with `git show <base>:<path>`, or the seat runs
> `git diff --numstat <base> -- <path>` and states the file is clean. A citation into a dirty file
> is a fabrication finding under §3.6.

Every planning and review seat in this fleet stands in the main tree and writes for seats standing
in lanes. This will recur on every mission until it is written down.

---

## 4. Dead ends — so nobody re-derives them

- **The `/` composer is not a break.** `LibraryComposer.tsx:29` calls `createDebate` directly, which
  looks like a second production caller S01's new required field would break. It does not:
  the call already throws today (its config has no `risk_tier`) and the bare `catch {}` at `:34`
  swallows it into the `/new` redirect at `:37`. Twenty minutes of "I've found a production
  regression" collapses to N7. **Check the catch before you check the call.**
- **`tests/architecture/s14-contract.test.ts:64` and `ux01-new-debate-form.test.tsx:266,272` are not
  missed ask literals.** They match `grep -c steering_annotations` but the first is a source-text
  assertion and the other two are `toMatchObject` partials, which extra keys pass. REQ's exclusion
  was correct. Do not re-file them.
- **`assertMakerAdmission` does not require two makers.** Its name and its `MakerAvailability`
  parameter suggest it enforces the `>= 2` reachability rule; it throws only at `< 1`
  (`packages/critique/src/index.ts:334`), and the two-maker rule lives in
  `applyCriticUnavailableCap` (`:342-357`), which *marks* and never refuses. S02 R5 gets this wrong
  (N4) and it is the kind of wrong that a reviewer who reads only the SPEC will repeat.
- **`riskTierWasEdited` is not dead state.** It looks vestigial in `page.tsx:76`; it is the sole
  input to `tier_source` and `tier_provenance_ref` (`defaults.tsx:71-72`), and S01 is the first
  change in the repo's history that can set a risk tier without setting it. That is B3.

---

## 5. Where THIS packet fought me — exactly

**It mostly didn't, and that is new.** `packets/REQ-REV.md` is the best packet I have been handed in
this repo: seven numbered charges, each answerable or explicitly `UNVERIFIED`-able; the inputs
widened at `:10` to "the product files the SPECs cite at the lines they cite — a requirement is
checkable only against the code it constrains", which is precisely the permission a reviewer needs
and which the REQ packet itself does not grant its own seat (my N5). Three specific frictions:

1. **`:23` says "the `allowed` list against what REQ actually wrote" — and I cannot check it.**
   The entire mission tree is untracked (`git status --short` reports `?? docs/missions/debate-tiers/`
   and nothing finer), so git cannot attribute a single file to REQ versus the orchestrator. I fell
   back to `find` plus the packet's own output list, which shows no file outside REQ's contract — but
   that is an absence-of-evidence argument, not a check. **Fix: the orchestrator commits the intake,
   BASELINE and V-DECISIONS-PACKET before dispatching REQ.** One commit makes REQ's diff exact and
   makes this charge answerable in one command instead of unanswerable in five.

2. **`:33` says "Check the AUTHOR's `SKILLS LOADED` line against their role floor" (via the reviewer
   contract §1) and my inputs do not include the REQ ticket.** I am blind to the REQ seat by design
   (`:7`), the REQ ticket `t_cb9482de` is named at `:8` only as context, and reading its READY
   comment is the one way to check the line. I filed it UNVERIFIED. **Fix: either put "the READY
   comment on `t_cb9482de`, and nothing else from that ticket" in the reviewer's inputs, or move the
   SKILLS-LOADED check to the orchestrator explicitly and drop it from the reviewer contract.**
   Right now the contract assigns a duty the packet's blindness rule makes impossible, and a seat
   that does not notice will silently skip it — or, worse, claim it.

3. **`:25` asks me to run the S01 acceptance "as a stranger would … do not sign in".** `/new`
   redirects a signed-out visitor to the sign-in page, so all twelve steps are UNVERIFIED by
   construction — a foregone conclusion the packet could have stated, saving a browser round-trip.
   It is not wasted: the redirect itself is worth knowing, and I verified every DOM premise those
   steps rest on from source instead. But **the packet should say what it expects the stranger run
   to prove**: "the acceptance is auth-gated; probe the DOM premises in source and report the gate".

---

## 6. The one-prompt machine — what would actually move the needle

Three upgrades, in the order I would build them.

**(a) A `spec-lint` script, run by the orchestrator at packet-check time, not by a seat.**
Everything in my charges 1, 5, 6 and 7 is mechanical and I spent about a third of this run doing it
by hand. A script in `scripts/` can, in seconds:
- resolve every `path:line` in a SPEC and diff the cited file against the mission base (the whole of
  §3 above, and my near-miss, gone);
- grep the ban list outside quoted-ban-list lines;
- assert `ui:` is on line 3 and is `yes|no`;
- assert every suite named in a SPEC has a row in `BASELINE.md` (that is N3, found for free);
- assert `wc -l INSTRUCTIONS.md ≤ 100`;
- diff the shared roster sentences between SPECs byte-for-byte.

That leaves the reviewer's tokens for the four things a script cannot do — ordering, class
completeness, provenance truth, file ownership — which is exactly where all four blocking findings
came from. **This is the single highest-leverage change available to this fleet right now.**

**(b) Make "name the class" mechanical in the SPEC template.** R20 is a genuinely excellent
requirement — it prices its own blast radius, names the grep, and pre-commits to treating a missed
member as a finding. It still missed two thirds of its class because it swept one *symptom*
(`steering_annotations`) instead of the *shape* (every construction site of an ask). The template
should say: **a census names the CONSUMER it swept (`AskRequestSchema.parse`, `createDebate`,
`buildNewDebateAskConfig`), one line per consumer, not the string it grepped.** Same rule as
`heartbeat-protocol` §3.2 — choose the remedy by the SHAPE — applied one step earlier, at
requirements time.

**(c) Give the reviewer the base, not the main tree.** `REV(S)` seats already get a detached
worktree (`heartbeat-reviewer` §3). Planning reviewers do not, and stand in a tree with 100 dirty
entries while writing citations for seats in clean lanes. Either give REQ-REV/ARCH-REV a read-only
worktree at the base, or make `git show <base>:` the mandatory read idiom for them. The cost of not
doing it is a fabrication finding that looks exactly like a hallucination.

**What NOT to change.** The `V-ROW:` mechanism worked perfectly here — REQ hit two questions it had
no authority to settle (the Free risk-tier value, `plan_tier` required-vs-optional), wrote both as
rows with measured evidence and a smallest yes/no, took its recommended default as binding, and kept
going. Zero blocked time, zero invented authority, and V gets two crisp yes/no questions instead of
a stalled mission. Whatever else changes, keep that.

---

## 7. One number for the file

**4 blocking findings, all four closable by adding a single sentence to a requirement that already
exists.** None needs a re-slice, a new SPEC, or a V ruling. That is what a good REQ node failing
well looks like, and it is the argument for keeping the blind planning review: 19 minutes here
against, by my estimate, a full FIX cycle on S02 plus a wrong-error-code test point in V's hands —
the thing this node exists to prevent.
