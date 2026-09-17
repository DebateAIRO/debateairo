# ARCH-REV-S02 — round 2 verdict on ARCH-S02-REWORK-R1's answer to `ARCH-REV-S02-r1.md`

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:writing-plans`
- `superpowers:receiving-code-review` — **not loaded this session; not needed, no finding of mine was contested with me** (per-session declaration, `COMMON.md` §10.9).
- Seat ARCH-REV-S02, Opus 5, **fresh blind session, round 2 of max 3**. I did not write the round-1 verdict and I owe it no loyalty: every one of B1, B2, N1–N8, P1–P4 is judged on evidence I re-ran myself (`COMMON.md` §10.10), and two of the round-1 remedies are **WITHDRAWN as measurably wrong**.
- Main tree `2b670d30` / `dev` / **90 dirty** (pre-existing, other missions, untouched). Lane `.worktrees/consent-s02/dialectical-engine` @ `2b670d30` / `slice/consent-s02`, **`git status --porcelain` = 0 entries before and after every command I ran there**. No git write, no edit to anything under review.

## Verdict: **REWORK** — 1 blocking (**B3**, new), 1 non-blocking carried over (**N6**, one named member unswept), 2 new non-blocking (N9, N10), 1 new packet finding (P5)

**This is a very strong rework.** B1 and B2 are genuinely discharged, and the author was right to refuse two of the verdict's remedy wordings — I reproduced both refutations independently. The A9 re-proof is the best in this mission: I ran all nine commands twice (script + inline) and the satisfiability matrix, and every number matches.

**And the B1 fix, which is correct, makes two of cluster C4's pinned R17 cases unsatisfiable — and the N7 chain rule added in the same round puts those cases inside C7's own verification command.** That is B3. Under the *defective* round-0 mirror rule those two cases passed; the desync was propping them up. Nobody could see this before this round, because before this round C7's command did not run C4's file.

**Round 3 would be the LAST lawful rework round** (`heartbeat-protocol` §2.3). B3 is one DECISIONS entry plus two step re-statements; it does not need a fourth.

---

## Round-1 findings — one line each, on evidence I re-ran

| # | Status | Evidence I ran myself |
|---|---|---|
| **B1** mirror desync | **ADDRESSED** | Both fixed probes, 3 invocations each (9 internal runs each), byte-identical; plus **my own 12-route probe** in 4 modes × 3 runs: pinned rule = **0 desynced routes, 0 unlawful `register()`, 0 unlawfully-enabled routes, 0 enabled-with-empty-box frames**. The untouched originals still reproduce the defect. |
| **B2** DECISIONS step refs | **ADDRESSED** | `arch-rev-s02-trace.py` re-run by me: **`<UNDEFINED>` count = 0**; all eight stale lines unedited (append-only) and each mapped by exactly one correction row at `DECISIONS.md:131-138`. |
| **N1** C9 mutant not detectable | **ADDRESSED** | `run_c9`'s two merge arms exist and I proved them on four synthetic `globals.css` states: post-merge → 0, S01's block lost → 1, S02's lost → 1, S02's duplicated → 1. Live at base both arms read `0`, one more declared reason C9 is RED. |
| **N2** five steps only in a range | **ADDRESSED** | `distinct step ids appearing in the trace table: 72` (was 64) and `DEFINED steps that appear in NO trace row: []`. The two remaining `…` in that region are prose, not trace rows (`PLAN:37`, `PLAN:58`). |
| **N3** R03's keyboard hook had no step | **ADDRESSED — and my round-1 predecessor's remedy WORDING is WITHDRAWN as wrong.** | I measured jsdom **30.0.1** myself, 3 runs identical: focused checkbox + `keydown/keypress/keyup key=" " code=Space keyCode=32` → `checked=false clickEventsSeen=0`; `.click()` → `checked=true clickEventsSeen=1`. A step worded "dispatch `Space` and assert it toggles" is RED forever. `S02-S70`/`S02-S71` are written on the activation event with the limitation stated in-step and the keystroke handed to V step 14. Correct. |
| **N4** tautological accessible name | **ADDRESSED** | `PLAN:817` pins `getAttribute("aria-label") === "Privacy Policy text"` as a literal, with the derivation at `:822-827`. |
| **N5** two judgement-call acceptances | **ADDRESSED** | `S02-S28`'s trailing clause is removed (`PLAN:607-610`); `S02-S69` is three observable commands with expected outputs, a stated precondition and an explicit `UNVERIFIED` path (`PLAN:1204-1216`). |
| **N6** line numbers as edit instructions | **NOT ADDRESSED — one named member, and the artifacts claim the sweep is complete** | Seven steps are correctly re-anchored (I checked `S02-S17/S18/S22/S23/S25/S31/S32`). **`PLAN.md:1887`, the C3 row of §Per-cluster boundaries, still reads `three inserted lines at :324, :448, :466 and nothing else`** — bare pre-edit line numbers, no text anchor, no count arm, not even the "measured at base / reading aid" qualifier every swept step carries. **`PLAN.md:388` and `DECISIONS.md:160` both list "the C3 boundary row" among the members swept.** See B3's sibling note below. |
| **N7** clusters not re-running the chain | **ADDRESSED, and swept past the sample** | Measured in my own A9 run: `run S02-C3 3`, `run S02-C4 4`, `run S02-C6 2`, `run S02-C7 5`, `run_c9 10` — the counts the chain-rule table claims, and the `Test Files <n>` arm is what makes each of them RED at base. The second chain (`C5→C6`) is the author's own class sweep, not in the finding. **This is also what surfaced B3.** |
| **N8** two wrong counts | **ADDRESSED** | The author's own commands, run by me **from a `.sh` under `/bin/bash`, `LC_ALL=C`**: `28`, `4`, `14` — exactly as restated. (The middot in those patterns is a literal byte sequence, not a `.` metacharacter, so `COMMON.md` §10.21's trap does not bite them. I verified with an ASCII-only equivalent: `28`, `4`, `14`.) |
| **P1** packet §A2 vs §5(e) | **ADDRESSED** | Absorbed into `COMMON.md` §10.20 as binding law, citing P1 by name. The PLAN's three standing gates are reported beside the guard, never inside it (`PLAN:1383-1399`). |
| **P2** `cannot find module` listed as BROKEN | **ADDRESSED** | Absorbed into `COMMON.md` §10.17, citing P2 by name; the PLAN carries the discriminator and my A9 run prints `brokenSigs` / `cannotFindModule` / `noTestFiles` as three separate counters. |
| **P3** an unmeasured "recommended order" | **ADDRESSED** | Absorbed into `COMMON.md` §10.20, citing P3 by name. |
| **P4** my own packet's round-cap wording | **ADDRESSED** | `COMMON.md` §10.20 now states it correctly, and my round-2 packet `ARCH-REV-S02-R2.md:24` reads "A REWORK that would open round 4 → V row." |

**Round-1 N-ticket `t_e5075f50` may be closed for N1, N2, N3, N4, N5, N7 and N8. It must stay open for N6** (one member, above).

---

## B3 — BLOCKING, NEW. The B1 fix makes R17 cases 4 and 5 unsatisfiable, and the N7 chain rule puts them inside C7's own command. C7 cannot go green.

**Where:** `PLAN.md:599-625` (`S02-S28` case 4, `S02-S29` case 5, cluster **C4**) · `PLAN.md:871-891` (C7's click rule + the B1 mirror rule) · `PLAN.md:1358` (C7's command, which now RUNS `tests/render/consent-signup-gate.test.tsx`) · `PLAN.md:1874-1881` and `:1891` (C7 may RUN that file and may not WRITE it) · frozen `SPEC.md:370-379`.

**The mechanism, in one sentence.** R17 case 4 requires that `field("privacy-accepted").click()` from a fresh mount **enable** `Create account`; C7's click rule requires that the same click **open the modal and not tick the box**; the B1 fix makes the mirror record the settled `false`. The two are logically contradictory — any implementation satisfying case 4 literally must tick the box on a bare click, which is the one thing V's goal forbids.

**Measured, three runs, deterministic** (`scratchpad/arch-rev-consent-s02-r2/r17-post-c7.mjs`; the six cases transcribed from `SPEC.md:370-385` and `PLAN.md` `S02-S25`…`S02-S30`, run against the component at three stages):

```
===== STAGE c4 =====                      (R17 mirror only, no row handler — as C4 leaves it)
  PASS  S02-S25 case1 · PASS S02-S26 case2 · PASS S02-S27 case3
  PASS  S02-S28 case4 BOTH -> expect disabled=FALSE
  PASS  S02-S29 case5 assign,reset,click -> expect disabled=FALSE
  PASS  S02-S30 case6
  ---- STAGE c4: 6/6 pass, 0 FAIL

===== STAGE c7 =====                      (+ C7's click rule + the B1 mirror fix)
  PASS  S02-S25 case1 · PASS S02-S26 case2 · PASS S02-S27 case3
  FAIL  S02-S28 case4 BOTH -> expect disabled=FALSE
  FAIL  S02-S29 case5 assign,reset,click -> expect disabled=FALSE
  PASS  S02-S30 case6
  ---- STAGE c7: 4/6 pass, 2 FAIL

===== STAGE c7-unfixed =====              (C7's click rule + ROUND 0's defective mirror)
  ---- STAGE c7-unfixed: 6/6 pass, 0 FAIL
```

**Read the third block.** Under the *unfixed* rule all six cases pass, because the desync sets the mirror `true` while the DOM says `false` — **the B1 defect was propping up cases 4 and 5.** Fixing B1 correctly is what exposes them. This is `COMMON.md` §10.10's named pattern ("rework round 1 fixed B2's premise exactly as told and introduced B4 and B5") arriving one layer up, and it is not a criticism of the B1 fix, which I verified is right.

**Why it is blocking rather than a later integration concern.** C7's command is now
`run S02-C7 5 … tests/render/consent-signup-gate.test.tsx …` (`PLAN:1358`) — the chain arm N7 added **this round**. So `S02-S28`/`S02-S29` are inside C7's own acceptance. `PLAN:1874-1881` then closes the exit: *"if an earlier cluster's test goes red, that is a finding against the current seat's change, and the remedy is to fix the change — never to edit the earlier test"*, and `PLAN:1891` puts `consent-signup-gate.test.tsx` explicitly in C7's **forbidden** column. **The C7 seat is deadlocked by construction:** it cannot make case 4 green without deleting its own click rule, and it may not touch the test. It files a finding and stops (`heartbeat-protocol` §2.7) — a full seat cycle spent rediscovering this.

**The plan's only sentence on this subject is the false half of it.** `PLAN:595-597`, attached to `S02-S27` (case 3): *"at this point in the plan the privacy row's click still toggles the box natively — C7 is what makes it open the modal instead. This case therefore clicks the **input**, which is the same event either way, and C7 adds no assertion that changes it."* The invariance is true for case 3 (`disabled === true` both ways) and for case 6, and **false for cases 4 and 5**, whose expected value is `false`. I grepped `PLAN.md`, `DECISIONS.md` and `SPEC.md` for any acknowledgement that cases 4 or 5 change meaning after C7: **there is none.**

**The class, not the instance** (`heartbeat-protocol` §2.2). The class is *"every C4 assertion whose truth value depends on the privacy row's click semantics, which C7 changes."* I enumerated and measured all six members plus the three assignment-idiom steps:

| member | depends on the privacy click? | post-C7 | why |
|---|---|---|---|
| `S02-S25` case 1 | no click at all | **PASS** | fresh mount |
| `S02-S26` case 2 | clicks `adult-affirmed` only | **PASS** | untouched by C7 |
| `S02-S27` case 3 | yes, expects `disabled=true` | **PASS** | invariant — the note at `:595-597` is right about this one |
| **`S02-S28` case 4** | yes, expects `disabled=false` | **FAIL** | the click no longer ticks and the mirror correctly stays `false` |
| **`S02-S29` case 5** | yes, expects `disabled=false` | **FAIL** | same, in its second half |
| `S02-S30` case 6 | yes, expects `disabled=true` | **PASS** | invariant |
| `S02-S22`, `S02-S31`, `S02-S32` | no — `.checked = true` assignment | **unaffected** | assignment never reaches the row handler; `FormData` still reads `"on"` |

Exactly two members are broken. `S02-S21` (C3, the 18+ row) and the three existing `auth-flow-integration` cases are outside the class.

**Remedy — and I ran it through the probe before proposing it** (adopting the author's own P8, which I accept as a good rule for the reviewer contract). Direction, not wording; the class binds:
1. `S02-S28` and `S02-S29` reach the "both checked" state through the **modal's acknowledgement**, exactly as `S02-S52`/`S02-S53` already do, instead of through a bare privacy `.click()`. **Measured, 3 runs identical** (`scratchpad/arch-rev-consent-s02-r2/remedy-check.mjs`): `REMEDY case4-via-modal -> DOM=true btnDisabled=false` — the property R17 case 4 asserts ("both boxes checked → not disabled") is satisfied, by the only route the product allows.
2. Whichever wording is chosen, the **frozen SPEC's case-4/case-5 text becomes an imprecision that must be recorded and routed**, in the same disposition this file already uses three times (R22, R03, and R17 point 2 at `DECISIONS.md:148`): a DECISIONS entry naming the contradiction, and a V row, because `SPEC.md:370-379` and `SPEC.md` R05 cannot both be satisfied literally.
3. `PLAN:595-597`'s invariance sentence must stop generalising: name which cases are invariant under C7 and which are not, per case.
4. **Discharge:** re-run `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/arch-rev-consent-s02-r2/r17-post-c7.mjs` (copied to `.hermes/reports/consent-ui/probes/` at my exit as `arch-rev-s02-r2-r17-post-c7.mjs`) against the corrected case text and paste **STAGE c7: 6/6 pass** verbatim. `COMMON.md` §10.10.

**VERDICT / CONFIDENCE high / STRONGEST COUNTER:** a C7 coding seat might reach the checked state through the modal on its own initiative when case 4 goes red. It may not — `PLAN:1891` forbids it from editing the gate test, and the gate test's case 4 is what is wrong, not the component. The counter that would actually defeat me is "the C4 test never clicks `privacy-accepted` directly" — `PLAN:601` says *"click both inside one `act`"* and `SPEC.md:370-372` says cases 1-4 run *"from a fresh mount with the one idiom"*, so it does.

---

## N6 (carried over) — the eighth member of the swept class is unswept, and two artifacts say it is not

`PLAN.md:1887` — C3's row of §Per-cluster boundaries, the row the PLAN itself calls the coding seat's `allowed` list (`:1872`):

> `tests/render/auth-flow-integration.test.tsx` (**three inserted lines at `:324`, `:448`, `:466` and nothing else**)

Against `PLAN.md:388` — *"The class members, swept and each fixed in its own step: … and the C3 row of §Per-cluster boundaries"* — and `DECISIONS.md:160` — *"Members swept: `S02-S17`, `S02-S18`, `S02-S22`, `S02-S23`, `S02-S25`, `S02-S31`, `S02-S32`, and the C3 boundary row"*.

**Seat that goes wrong and how:** the CODE-S02-C3 packet is built from this row. Its three numbers are the exact ones `S02-S22` was re-anchored away from, and they are the ones N6 measured as unusable: all three target lines are the identical string, and inserting at `:324` shifts `:448` and `:466`. A seat that follows the row instead of the step lands two of three lines off-anchor; `S02-S22`'s own count arms still read `3`/`3`, because they count occurrences and not positions. Two formulations of one rule, in one document, is the B4 class this plan names five times.

**Remedy:** replace the row's parenthetical with the step's own anchor — "three inserted lines, one after each occurrence of `field("adult-affirmed").checked = true;`, identified by the three `it(...)` titles in `S02-S22`; count arms `3`/`3`" — or make it a pointer to `S02-S22`. Then re-state the sweep claim with the command that proves it.

**Not blocking on its own** — the authoritative step is correct and a careful seat reads it. It is listed here because the *claim of completeness* is what §2.2 exists to prevent, and because the correction is two minutes inside the round B3 already requires.

---

## N9 (new) — `superpowers:brainstorming` was absent from the architecture floor, and the stated reason is contradicted by the round's own record

The handoff declares: *"superpowers:brainstorming — NOT loaded this session; **not needed: no direction was open this round.**"* The declaration is honest and in the correct per-session form (`COMMON.md` §10.9), and `heartbeat-protocol` §3b prices an honest shortfall at one line. But the reason is not accurate: **a direction was open** — the B1 repair mechanism, with at least four candidates, recorded by this seat itself at `DECISIONS.md:144` as *"Rejected alternatives for B1, each with the measurement that rejected it"*. Two further directions were committed this round (N3's re-wording of the keyboard steps; the ADR-0020 allocation).

**What saves it, and why this is N and not B:** `COMMON.md` §10.1 discharges brainstorming's human gate by *"recording every alternative you rejected and why in DECISIONS.md"* plus the blind review that follows, and the seat did exactly that — six candidate mechanisms × 8 routes, four rejections each carrying its measurement. **The substantive obligation was met by a better method than the skill would have produced.** The defect is the justification, not the work.

**Remedy:** the honest form is *"not loaded this session; a direction WAS open (the B1 mechanism) and it was settled by measurement rather than by exploration — §10.1's substitute obligation is discharged at `DECISIONS.md:144`"*. `heartbeat-reviewer` §5 requires me to file the floor gap either way.

## N10 (new) — the mission graph still says S02's CSS may "declare" `var(--scrim)`

`mission-graph-S02.md:74`: *"S02's CSS may **declare** `var(--scrim)` before S01 declares it"*. It means **reference**; the same paragraph's next clause draws exactly that distinction, and S02 declaring a token is the mutant `t9-mode-tokens.test.ts:376-377` exists to catch (`COMMON.md` §10.8: **S02 adds no token**). Round 1 flagged this as cosmetic and did not number it; a seat reading the graph alone could take it as licence. One word.

---

## Packet finding

**P5 — `ARCH-REV-S02-R2.md` §2 probe 3 was not re-swept when `COMMON.md` §10.16–§10.21 landed.** §2.3 still prescribes the round-1 method — *"classify BROKEN / RED / GREEN exactly as TOOLING-TRAPS prescribes (signature grep + anchored summary)"* — which §10.16 itself calls insufficient: *"A BROKEN signature list … tests only whether the command ran; it cannot see an unsatisfiable guard."* §4 repairs it in passing ("run every cluster command from a `.sh` file under `/bin/bash` AND inline"), and my dispatch message repaired it explicitly, so nothing turned on it. **Wording:** §2.3 should carry §10.16's three arms (script + inline, known-GOOD synthetic, one mutant per term). The general shape is P1/P2's, one round later: **when an amendment lands in COMMON, the packet sections it supersedes are not re-read.**

**On the author's own packet findings P5–P8:** P6 was already ruled by the orchestrator on `t_3160e2d5` (*"the finding's CLASS binds; the reviewer's remedy WORDING is advisory"*) and that ruling is correct — I have applied it twice above, withdrawing two round-1 remedy wordings on my own measurements. **P8 is the best line in this round's handoff** — *"a reviewer that proves a finding with a probe should run its own proposed remedy through that same probe"* — and I adopted it for B3 before proposing anything.

---

## Verified — how, with verbatim output

**1. The two fixed probes, run by ME, three invocations each (each invocation runs 3 internal scenarios ⇒ 9 executions per probe), all identical.**

```
node .hermes/reports/consent-ui/probes/arch-s02-rework-r1-c7-mirror-fixed.mjs
  SCENARIO 1 — click the UNCHECKED privacy box, then dismiss with the x button
    dialog open (S02-S49 expects true)                  true
    DOM .checked (S02-S49 expects false)                false
    R17 mirror p  [PLAN asserts this NOWHERE]           false
    after x: dialog (S02-S54 expects null)              null
    after x: DOM .checked (S02-S54: false)              false
    after x: Create account .disabled                   true
    register() calls (R18 refusal holds?)               0
  SCENARIO 2 — click the UNCHECKED privacy box TWICE (no acknowledgement at all)
    DOM .checked after 2nd click                        false
    R17 mirror p                                        false
    Create account .disabled                            true
    register() calls  [MUST be 0 per V's goal]          0

node .hermes/reports/consent-ui/probes/arch-s02-rework-r1-scenario3-fixed.mjs
run 1: after [click box -> x -> click row text]  DOM .checked=false mirror=false submitDisabled=true register()calls=0 dialogReopened=true
run 2: ... identical    run 3: ... identical
```

**RED control — the untouched originals, run in the same session:**
```
node .hermes/reports/consent-ui/probes/arch-rev-s02-scenario3.mjs
run 1: after [click box -> x -> click row text]  DOM .checked=true mirror=true submitDisabled=false register()calls=1 dialogReopened=false
node .hermes/reports/consent-ui/probes/c7-mirror-desync-probe.mjs   (RUN 1 block)
    R17 mirror p           true     after x: Create account .disabled   false     register() calls (scenario 2)  1
```

**2. The probe diff is exactly what the packet ordered — component only.** `diff -u` on both pairs, counted by me rather than taken from the handoff: the c7 probe's non-comment change is **six lines** — a new four-line `close()` that resyncs the mirror from the DOM, the `onChange` expression, and the `×`'s handler now pointing at `close`; scenario3's is **three** (the same three edits, its `close()` being one line). Everything else in both files is header comment. (The handoff calls the c7 diff "FOUR lines". It is the **only** count in this round's artifacts I could not reproduce — every other count checks out — and it is not filed as a finding because the diff is pasted, checkable, and its substance is exactly as described.) **The originals are byte-untouched**, proven against the predecessor's own scratch copies: `md5 9147b3ceb001779967c80d11c262edfd` and `00c07c844bddc854ae1df8428bc66ae5`, `cmp` **IDENTICAL** for both.

**3. My OWN probe, wider than the author's — 12 routes × 4 mechanisms × 3 runs, deterministic** (`scratchpad/arch-rev-consent-s02-r2/r2-allroutes.mjs`, component built from the PLAN's prose, not from their probe):

```
---- MODE pinned:  desynced routes=0  unlawful register()=0  unlawfully-enabled routes=0  frames enabled-with-empty-box=0
---- MODE unfixed: desynced routes=5  unlawful register()=2  unlawfully-enabled routes=7  frames enabled-with-empty-box=4
---- MODE verdict: desynced routes=5  unlawful register()=2  unlawfully-enabled routes=7  frames enabled-with-empty-box=4
---- MODE m1only:  desynced routes=0  unlawful register()=0  unlawfully-enabled routes=0  frames enabled-with-empty-box=0
```
Per route under the pinned rule — every open route (`square`, `row text`, `Privacy Policy` control, `focus+activation`), every dismissal route (`×`, `Esc`, `backdrop`), the acknowledge route, both untick routes, the double-click and the browser-realistic path:
```
  R01 click unchecked SQUARE (open)                DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=true
  R02 click row TEXT (open)                        DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=true
  R03 click 'Privacy Policy' control (open)        DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=true
  R04 open then dismiss with x                     DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=false
  R05 open then dismiss with Esc                   DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=false
  R06 open then dismiss with BACKDROP              DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=false
  R07 open then ACKNOWLEDGE                        DOM=true  mirror=true  desync=false btnDisabled=false register=1 dialog=false
  R08 acknowledge then click row TEXT (untick)     DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=false
  R09 acknowledge then click the INPUT (untick)    DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=false
  R10 focus + activation (S02-S71 keyboard route)  DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=true
  R11 click unchecked box TWICE                    DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=true
  R12 box -> x -> row TEXT (browser-realistic)     DOM=false mirror=false desync=false btnDisabled=true  register=0 dialog=true
```
**Three independent confirmations fall out of this table.** (a) The pinned mechanism closes **every** route, including the three (`Esc`, `backdrop`, `focus+activation`) that round 1 never tested and that `unfixed` desyncs. (b) **MODE `verdict` — the round-1 verdict's literal `setPrivacyMirror(false)` beside `preventDefault()` — is byte-for-byte as bad as no fix at all**, independently reproducing the author's refutation; my predecessor's remedy wording is **WITHDRAWN**. (c) **MODE `m1only` is identical to `pinned`**, so the author's claim that member 2 is defence-in-depth and not load-bearing is **correct and correctly labelled**.

**4. The jsdom `Space` fact, measured by me, 3 runs identical** (`scratchpad/arch-rev-consent-s02-r2/space-fact.mjs`):
```
jsdom version measured: 30.0.1
activeElement is the checkbox: true
after Space keydown+keypress+keyup : checked=false clickEventsSeen=0
after .click()                     : checked=true clickEventsSeen=1
VERDICT: Space produced NO activation; .click() did. The author's N3 claim REPRODUCES.
```

**5. B2 — the trace probe, re-run by me.** `python3 .hermes/reports/consent-ui/probes/arch-rev-s02-trace.py`:
```
SPEC R-ids defined: 24 unique: 24        PLAN trace rows: 24
R-ids in SPEC missing a trace row: []    trace rows with no SPEC R-id     : []
steps DEFINED as '- **S02-Snn ' headers: 72 unique: 72   duplicate step definitions: []
distinct S02-Snn tokens anywhere in PLAN: 72   tokens referenced but never DEFINED: []
distinct step ids appearing in the trace table: 72
DEFINED steps that appear in NO trace row (range '...' not expanded): []
refutation-table rows: 72 unique: 72   DEFINED steps with no refutation row: []   refutation rows for undefined steps: []
steps per cluster: C1 11 · C2 6 · C3 9 · C4 8 · C5 7 · C6 9 · C7 11 · C8 7 · C9 4 = 72
```
`grep -c '<UNDEFINED>'` over the whole `--- DECISIONS.md step references ---` block: **0**.

**6. A9 re-run in full, by me, TWICE — from a `.sh` file under `/bin/bash` and inline. The two agree line for line.**

`VERDICT A` — `/bin/bash scratchpad/arch-rev-consent-s02-r2/a9-r2.sh`, `grep (BSD grep, GNU compatible) 2.6.0-FreeBSD`, `LC_ALL=C`, lane `2b670d30`, porcelain `0`:
```
S02-C1 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1   raw: No test files found, exiting with code 1
S02-C2 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1   raw: No test files found, exiting with code 1
S02-C3 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=0   Tests 19 passed (19) | Test Files 2 passed (2)
S02-C4 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=0   Tests 19 passed (19) | Test Files 2 passed (2)
S02-C5 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1   raw: No test files found, exiting with code 1
S02-C6 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1   raw: No test files found, exiting with code 1
S02-C7 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=0   Tests 19 passed (19) | Test Files 2 passed (2)
S02-C8 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1   raw: No test files found, exiting with code 1
S02-C9 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=0   Tests 19 passed (19) | Test Files 2 passed (2)
S02-C9 | mergeArms: --scrim:=0 (expect 2)  S02markers=0 (expect 2)
### lane porcelain after: 0 entries
```
`VERDICT B` — the same body inline in the lane under `ugrep 7.8.4`: **identical, line for line.**
**9 of 9 RAN · 0 BROKEN · all nine RED for their declared reason.** The `Tests 19 passed (19)` on C3/C4/C7/C9 is variant 7 live: vitest silently drops the not-yet-created files, runs the two that exist and exits 0 — and only the `Test Files <n> passed (<n>)` arm turns `vt=0` into a RED.

**7. The guard PROVEN SATISFIABLE and DISCRIMINATING — my own matrix, from a `.sh` under `/bin/bash` and inline, both identical** (`scratchpad/arch-rev-consent-s02-r2/guard-matrix.sh`):
```
-- PART A: known-GOOD captures. The guard MUST return 0, or it is unsatisfiable. --
   T1=0 T2=0 T3=0 T4=0  VERDICT=0   <- A: n=1  C1-shaped green
   T1=0 T2=0 T3=0 T4=0  VERDICT=0   <- B: n=5  C7-shaped green
   T1=0 T2=0 T3=0 T4=0  VERDICT=0   <- C: n=10 C9-shaped green
   T1=0 T2=0 T3=0 T4=0  VERDICT=0   <- D: n=3  C3-shaped green
-- PART B: ONE mutant per guard term. Each MUST flip its own term and the VERDICT. --
   T1=1 T2=0 T3=0 T4=0  VERDICT=1   <- T1 mutant: zero pass count
   T1=1 T2=0 T3=0 T4=0  VERDICT=1   <- T1 mutant: words in a TEST TITLE, not anchored
   T1=1 T2=1 T3=0 T4=0  VERDICT=1   <- T2 mutant: a failure in the summary
   T1=0 T2=0 T3=1 T4=0  VERDICT=1   <- T3 mutant: VARIANT 7 — 4 of 5 files ran, exit 0
   T1=0 T2=0 T3=1 T4=0  VERDICT=1   <- T3 mutant: Test Files line absent entirely
   T1=0 T2=0 T3=0 T4=1  VERDICT=1   <- T4 mutant: green summary, runner exit 1
-- PART C: the glyph trap --
   glyph-matching term (^ . tests/) hits under BSD grep, LC_ALL=C : 0
   glyph-matching term (^ . tests/) hits under ugrep (inline)     : 1
   ASCII test-path term hits                                       : 1
-- PART D: the C9 merge arms, synthetic --
   post-merge  : --scrim:=2  S02markers=2  mergeArmVerdict=0
   S01 lost    : --scrim:=0  S02markers=2  mergeArmVerdict=1
   S02 lost    : --scrim:=2  S02markers=0  mergeArmVerdict=1
   S02 doubled : --scrim:=2  S02markers=4  mergeArmVerdict=1
```
**PART C reproduces `COMMON.md` §10.16's trap end to end in one measurement**: the same term is `1` inline and `0` from a script. The PLAN's rule "never match the glyph" is validated, and I confirmed no term in the plan does.

**8. The three standing gates, run by me in the lane, all matching `BASELINE.md`:**
```
G3  v2ui-node-runner    exit=0    Test Files 1 passed (1)   Tests 2 passed (2)
G1  typecheck           typecheckExit=1  tscRanFingerprint=1
    total diagnostics 8 · inside the pin (tests/unit/s14-ui.test.ts) 8 · OUTSIDE the pin 0
G2  t9-mode-tokens      exit=1    Tests 2 failed | 6 passed (8)
    FAIL  tests/unit/t9-mode-tokens.test.ts > T9-C3 mode control and document guard > renders one accessible toggle that reads the document mode, flips it, and persists it
    FAIL  tests/unit/t9-mode-tokens.test.ts > T9-C3 mode control and document guard > leaves no mode-inert colour literal in the four Wave-0 product files
    FAIL line count (ASCII anchor ^ FAIL +<file> > ): 2
    +   ".../apps/ui/app/globals.css:6096:background: color-mix(in srgb, #0a0806 32%, transparent);",
    hit-list count (^\+ +"/.*:[0-9]+:): 1
```
G1's monotone-delta form is right: it asserts *zero diagnostics outside the pin* and the run-actually-happened fingerprint, and only **reports** the pinned total, so it survives the other mission repairing its eight. G2's named-failure-set + hit-list form is satisfiable exactly as written — I ran its own anchors and got `2` and `1`.

**9. `modalSemantics.ts`'s exported surface — the round-1 gap, now closed.** The block did **not** change: `useModalSurface(open, surface)`, `backdropCloseHandler(scrim, onClose)`, `prefersReducedMotion()`, `openSurfaceCount()` and the `ModalSurface` type, matching the round-1 verdict's independent record of the round-0 block. **And I ran the diff my predecessor said nobody had run:** `S02/PLAN.md:162-172` and `S01/PLAN.md:495-505` are **BYTE-IDENTICAL**, `md5 3a737c18f8109515e5927a6cd004100e` for both. The prediction that the two plans would disagree is **falsified**.

**10. Counts, all re-measured by me from a `.sh` under `/bin/bash`:** PLAN `2041` lines · `72` step headers · `24` SPEC R-ids · `24` trace rows · DECISIONS `168` lines, `28` ARCH-S02 entries, `4` carrying `Rejected`, `14` ARCH-S02-REWORK-R1 entries · **frozen `SPEC.md` md5 `ad060bda81db71f00f4c70b1dbf63f2f`, matching the packet pin — the SPEC was not touched.**

**11. Banned-word scan of `PLAN.md`, mine:** 31 hits of `improve|better|robust|handle|appropriate`; **0** not explained by the scaffold's own statement of the ban (`:21`, `:30-31`) or by `handler`/`HANDLER` as a noun. No finding.

**12. Refutation table:** 72 rows for 72 steps, **0** rows with an empty "failure NOT caught" cell, **71 distinct** texts in that column. It is not theatre.

**13. Surfaces and boundaries:** I extracted every file path named in all 72 step bodies and compared it against the cluster's `allowed` row. **No step writes outside its row.** The 21 apparent mismatches are all read-only references or bare filenames (`v2ui-node-runner` which C3 runs, `SignUpFlow.tsx` named in a guard note in `S02-S45`, `README.md`/`ADR-0019` in `S02-S72`'s collision note). The new "RUNNING a test file is not WRITING it" paragraph (`:1874-1881`) is the right rule — it is also the paragraph that deadlocks C7 under B3.

**14. Lane left clean:** `git status --porcelain` = **0 entries**, before and after every command, including `pnpm typecheck` (`packages/contract/generated/` already present and gitignored, so nothing was written).

---

## Not verified — gaps for the next lens

- **That the author actually loaded the six skills declared.** Only a transcript grep settles it (`COMMON.md` §1); I checked form and floor coverage, and filed N9 on the one absence.
- **The three-run law on any cluster command.** I ran each twice (script + inline); three runs is the coding seat's obligation.
- **Whether B3's class also reaches S01.** S01's card consumes `PrivacyPolicyModal.tsx` with `mode="read"` — no checkbox, no acknowledgement — so I expect not, but I read S01's PLAN only for the `modalSemantics` block.
- **The Esc stack, the geometry, the pills' scroll, the narrow viewport and the live mode flip in a real browser.** V's steps 1-2, 5, 6, 7, 12, 13, 14. Unverified by every seat so far and correctly conceded in the refutation table's right-hand column and in `S02-S69`.
- **`S02-S69`'s three commands.** They need a dev stack serving this branch, which no seat in this loop can arrange. The step says so and names the `UNVERIFIED` path; correct.
- **The ADR-0019 collision with the halted `translation` mission.** Reported by the author, unresolved, and still unresolved — it is the orchestrator's.
- **`arch-s02-rework-r1-a9.sh`.** I wrote and ran my own A9 script rather than theirs, deliberately (`heartbeat-reviewer` §2: build your own probe). The two agree on all nine verdicts; I did not audit their script line by line.

---

## Predictions (blind-lens check)

I expect **ARCH-REV-S01's round-2 lens did not find B3's shape in S01**, and correctly so — S01's card has no gate whose expected value flips when a later cluster changes a click's meaning. What I expect it *did* miss, if S01's plan has the same architecture: **whether S01's own cluster chain rule (if it added one this round in sympathy with N7) put an earlier cluster's test inside a later cluster's command where the two clusters disagree about a pinned expected value.** B3 is not a React bug and not a jsdom bug — it is the generic consequence of adding a chain arm to a plan whose earlier cases were written against an earlier component. **Any plan that adopted N7 this round should be re-checked case by case, not cluster by cluster**, and I predict nobody did that on either lane, because N7 reads as a pure strengthening.

Second prediction: I expect the S01 lens **passed** its round-2, because S01's round-1 findings were reference and hygiene defects rather than a mechanism defect, and mechanism defects are the only ones that spawn children. If S01 passed and S02 did not, the difference is not seat quality — ARCH-S02's rework is the more rigorous of the two by a distance — it is that **fixing a real mechanism is the only kind of fix that can break something else.**

The thing I would check first with a third run: **`S02-S52`'s route.** It reaches the checked state "through the modal path (open, satisfy the gate, click `I have read it`)" and then clicks the row text to untick. I measured that route green (R08/R09 above) on a component built from the plan's prose — but the plan never pins *where* the acknowledgement sets `document.activeElement`, and `S02-S53` asserts focus returns to the input while `useModalSurface`'s focus-return contract says focus returns "to whatever was focused when the surface opened" (`S02-S03`). If the modal was opened by clicking the row's **text span**, those two are different elements. Nobody has run that.

**Round 2 of max 3. A round-3 REWORK is lawful and would be the last; a round-4 REWORK becomes a V DECISIONS PACKET row.** B3 plus the N6 member is one focused round.

`comments read through: t_50321020 5 · t_00133ced 3 · t_3160e2d5 5`
