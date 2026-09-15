# ARCH-REV-S02 — round 3 verdict on ARCH-S02-REWORK-R2's answer to `ARCH-REV-S02-r2.md`

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:writing-plans`
- `superpowers:receiving-code-review` — **not loaded this session; not needed, no finding of mine was contested with me** (per-session declaration, `COMMON.md` §10.9).
- Seat ARCH-REV-S02, Opus 5, **fresh blind session, round 3 of max 3 — the LAST lawful review round**. I wrote neither the round-1 nor the round-2 verdict and owe them no loyalty: B3, N6, N9, N10 and the ADR correction are judged on evidence I re-ran myself (`COMMON.md` §10.10), and the "nothing else changed" claim is judged on my own sweep.
- Main tree `2b670d30` / `dev` / **90 dirty** (pre-existing, other missions, untouched). Lane `.worktrees/consent-s02/dialectical-engine` @ `2b670d30` / `slice/consent-s02`, **`git status --porcelain` = 0 entries before AND after every command I ran there**, including nine `pnpm exec vitest run` invocations twice over. No git write, no edit to anything under review.

## Verdict: **PASS** — 0 blocking · 5 non-blocking (N11–N15, each needs a ticket) · 3 packet findings (P6–P8)

**B3 is discharged, and it is discharged the hard way.** The author did not weaken the case to make the probe green: R17's cases 4 and 5 keep their ids, keep the property R17 asserts, gain a second assertion (`checked === true`, so "enabled" can never be reached with an empty box), and reach the "both checked" state by the only route the product allows. I re-ran the author's corrected probe three times and, separately, **wrote my own probe against a component built from the PLAN's prose rather than from their harness** — 5 modes × 6 cases × 3 runs, deterministic — and the remedy holds there too, while discriminating three distinct mutants the plan claims it discriminates.

**The move out of cluster C4 was forced by measurement, not preference, and the second-order cost is stated instead of hidden.** `S02-C4` lost its only positive control and its mutant-class row now says so; `S02-C7` gained it and its row says so. I measured that loss and that gain independently: with `disabled` hard-coded `true`, C4's four remaining cases are **4/4 green** and case 4 in its new home is the case that fails.

**Nothing else changed that I can detect**, and I say exactly what that claim rests on below — no byte-baseline of the round-2 PLAN exists anywhere on disk (I looked), so it rests on structural invariants, on nine cluster commands producing verdicts identical to round 2's, and on a targeted re-check of every pin the round-2 verdict recorded verbatim.

**Round 3 is the last lawful rework round; this PASS releases the coding fleet.** The five N-findings are small, and four of them are one line each. **None of them justifies a fourth round** — they are ticket-and-fix-with-the-first-coding-packet work.

---

## The open findings — one line each, on evidence I re-ran

| # | Status | Evidence I ran myself |
|---|---|---|
| **B3** R17 cases 4/5 unsatisfiable | **ADDRESSED** | `arch-s02-rework-r2-r17-post-c7-fixed.mjs` × 3 invocations by me, byte-identical: **`STAGE c7: 6/6 pass, 0 FAIL`** each time, `STAGE c4: 4/6` with `NO MODAL AT THIS STAGE` on both moved cases. RED control (the reviewer's byte-untouched original) still reproduces `STAGE c7: 4/6 pass, 2 FAIL`. Plus **my own independent probe**: `MODE pinned … C7 (all six): 6/6 pass`. The cases now live in `S02-C7`, in `tests/render/consent-signup-modal.test.tsx` — a file **C7 creates and owns**, so `PLAN:2074`'s forbidden column and the "RUNNING is not WRITING" rule are both preserved. V-18 exists with default (a) and matches what is planned. |
| **N6** last member (C3 boundary row) | **ADDRESSED** | `PLAN.md:2070` now carries `S02-S22`'s text anchor (*"one after each occurrence of `field(\"adult-affirmed\").checked = true;`"*), the three `it(...)` titles, count arms `3`/`3`, and names `S02-S22` authoritative; the bare numbers survive only inside a declared "pre-edit positions that shift" clause. The restated sweep rule measured by me **from a `.sh` under `/bin/bash`, `LC_ALL=C`, and inline**: unqualified lines `0`, raw occurrences `9` (reported, not asserted), and fed the row's OLD text it returns `1` — it discriminates. |
| **N9** brainstorming justification | **ADDRESSED** | The handoff's `SKILLS LOADED` names `superpowers:brainstorming` as loaded **this session**, states plainly that a direction WAS open in both rounds, and discharges §10.1 with **five** alternatives (ALT-2…ALT-5 + the reset question), each carrying the measurement that rejected it — which I re-ran: `arch-s02-rework-r2-alternatives.mjs` × 3, identical. The generalisation it records ("a round that records rejected alternatives has by construction falsified 'no direction was open'") is the right lesson. |
| **N10** one word in the graph | **ADDRESSED** | `mission-graph-S02.md:79` reads *"S02's CSS may REFERENCE `var(--scrim)` before S01 declares it (S02 declares NO token)"*. Swept, not just fixed: `grep -n -i 'declare'` returns 4 hits, and I checked all four (`:7` the r2 header, `:34` "no token declared" — correct, `:79` the fix, `:159` the change-table row). |
| **ADR** `ADR-0020` → `ADR-0022` | **ADDRESSED**, with a count residual (N14) | Measured by me, script and inline agreeing: `ADR-0020-shared-modal-semantics` → **0**, `ADR-0022-shared-modal-semantics.md` → **9**, any `ADR-0020` → **1** (the reservation prose). Graph: `0` / `2`. `S02-S72`'s three acceptance arms grep the new full path. No file exists at any of the four ids (`ls docs/architecture/01-decisions/` → none). |
| **the previously-closed set** (B1, B2, N1–N5, N7, N8, P1–P4) | **STAYED CLOSED** | Re-checked by me as named strings and as behaviour — see §"Nothing else changed", items 1–4. Nothing was re-opened, reverted, or quietly re-worded. |

**Ticket disposition for the orchestrator.**
- `t_e5075f50` (N1–N8) — **CLOSE.** N6's last member is ADDRESSED; N1–N5, N7, N8 were closed on the r2 verdict.
- `t_d12339f3` (B3 → V-18) — **CLOSE as a finding**; the V-18 row stays open as V's, not as this slice's.
- **New tickets needed: N11, N12, N13, N14, N15** (below), plus packet findings P6/P7/P8 against the orchestrator's packets.

---

## Verified — how, with verbatim output

### 1. B3's discharge, re-run by me — three invocations, deterministic

```
$ node .hermes/reports/consent-ui/probes/arch-s02-rework-r2-r17-post-c7-fixed.mjs   (×3, identical)
===== STAGE c4 =====
  PASS  S02-S25 case1 · PASS S02-S26 case2 · PASS S02-S27 case3
  FAIL  S02-S28 case4 BOTH via the modal ack -> expect disabled=FALSE  ERROR:NO MODAL AT THIS STAGE — …
  FAIL  S02-S29 case5 assign,reset,modal ack -> expect disabled=FALSE  ERROR:NO MODAL AT THIS STAGE — …
  PASS  S02-S30 case6
  ---- STAGE c4: 4/6 pass, 2 FAIL
===== STAGE c7 =====
  PASS  S02-S25 · PASS S02-S26 · PASS S02-S27
  PASS  S02-S28 case4 BOTH via the modal ack -> expect disabled=FALSE
  PASS  S02-S29 case5 assign,reset,modal ack -> expect disabled=FALSE
  PASS  S02-S30
  ---- STAGE c7: 6/6 pass, 0 FAIL
===== STAGE c7-unfixed =====
  ---- STAGE c7-unfixed: 6/6 pass, 0 FAIL
```

**RED control — the round-2 reviewer's original, byte-untouched, run by me in the same session:**
```
$ node .hermes/reports/consent-ui/probes/arch-rev-s02-r2-r17-post-c7.mjs
  ---- STAGE c4: 6/6 pass, 0 FAIL
  FAIL  S02-S28 case4 BOTH             -> expect disabled=FALSE
  FAIL  S02-S29 case5 assign,reset,click-> expect disabled=FALSE
  ---- STAGE c7: 4/6 pass, 2 FAIL
  ---- STAGE c7-unfixed: 6/6 pass, 0 FAIL
```
**The originals are byte-untouched, proven not by mtime alone:** `md5` of all three `arch-rev-s02-r2-*.mjs` in `probes/` equals the `md5` of the round-2 reviewer's own scratch copies, and `cmp` reports IDENTICAL for each (`bf3006ea…`, `3fcbb559…`, `e36c1452…`; mtimes `21:35:32`, predating the author's session).

**The probe diff is what the packet ordered, and I counted it myself:** `diff -u` original → fixed is **84 changed lines**, of which the header comment is 25; the substance is (1) the case-4/5 route, (2) the acknowledgement affordance the route needs (`.policyScroll` + a `button.ack` disabled until the R15 gate latches + `S02-S53`'s handler), both declared in the file's own header. **Cases 1, 2, 3 and 6, the three stages, the click rule, the mirror rule and the pass/fail driver are byte-identical to the reviewer's file.** The author declared the component change instead of hiding it — the honest call, and the packet's "change ONLY the route" was unsatisfiable without it (P6).

**The author's own guard, run by me under `/bin/bash`, exit 0:**
```
$ /bin/bash .hermes/reports/consent-ui/probes/arch-s02-rework-r2-b3.sh
FIXED  run 1..3 | exit=0 | 'STAGE c7: 6/6 pass, 0 FAIL'=1 | 'STAGE c4: 4/6 pass, 2 FAIL'=1 | 'NO MODAL AT THIS STAGE' lines=2
RED-CTL run 1..3 | exit=0 | untouched original 'STAGE c7: 4/6 pass, 2 FAIL'=1
ALTS   run 1..3 | exit=0 | ALT-2=3 ALT-3=3 RESETwith=3 RESETwithout=3
-- known-GOOD synthetic: 1 -- MUTANT 5/6: 0 -- MUTANT c4 6/6: 0 -- MUTANT words in a TITLE: 0
### VERDICT=0  (0 = every arm satisfied)
```
Satisfiable **and** discriminating, both proven, exactly as `COMMON.md` §10.16 requires.

### 2. My OWN probe — the component written from the PLAN's prose, not from their harness

`.hermes/reports/consent-ui/probes/arch-rev-s02-r3-b3-independent.mjs` — the click rule from `PLAN:934-938`, the mirror rule from `:940-964`, `S02-S53`'s handler from `:1030-1034`, R15's gate from `:829-830`, the acknowledgement route from `:1124-1132`. Five modes × six cases × **three runs, byte-identical**:

```
===== MODE pinned =====              (the plan as written)
  PASS case1 · PASS case2 · PASS case3 · PASS case4 · PASS case5 · PASS case6
  ---- C4 SUBSET (cases 1,2,3,6): 4/4 pass   |   C7 (all six): 6/6 pass
===== MODE mut_predicate_dom =====   (see N12)
  ---- C4 SUBSET: 4/4 pass   |   C7: 4/6 pass   (cases 4,5 ERROR:no scroll region — modal never opened)
===== MODE mut_disabled_true =====   (`disabled` hard-coded true)
  ---- C4 SUBSET: 4/4 pass   |   C7: 4/6 pass
===== MODE mut_ack_dom_only =====    (acknowledgement sets the DOM, not the mirror)
  ---- C4 SUBSET: 4/4 pass   |   C7: 4/6 pass
===== MODE mut_ack_mirror_only ===== (acknowledgement sets the mirror, not the DOM)
  ---- C4 SUBSET: 4/4 pass   |   C7: 4/6 pass

===== V's goal: is ENABLED-with-empty-box reachable? MODE pinned =====
    bare privacy click x2, then adult      box=false btnDisabled=true
    click row TEXT, then adult             box=false btnDisabled=true
    open then dismiss with x, then adult   box=false btnDisabled=true
```

**Three things fall out of this table, and they are the substance of the PASS.**
(a) **The corrected cases are satisfiable on a component I built, not only on theirs** — 6/6.
(b) **`S02-C4`'s declared loss is real and `S02-C7`'s declared gain is real:** `mut_disabled_true` is **4/4 green across C4's whole remaining case set** and is caught by case 4 in its new home. The plan's mutant-class rows are accurate in both directions — this is the claim I most expected to fail, and it holds.
(c) **`S02-S28` is not a duplicate of `S02-S53`:** it independently discriminates `mut_ack_dom_only` and `mut_ack_mirror_only` as well, which is what its refutation row at `PLAN:2147` claims.

### 3. All nine cluster commands, run by me in the lane — from a `.sh` under `/bin/bash` AND inline

`VERDICT A` — `/bin/bash …/arch-rev-s02-r3-a9.sh`, `grep (BSD grep, GNU compatible) 2.6.0-FreeBSD`, `LC_ALL=C`:
```
S02-C1 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1
S02-C2 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1
S02-C3 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=0 | Tests 19 passed (19) | Test Files 2 passed (2)
S02-C4 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=0 | Tests 19 passed (19) | Test Files 2 passed (2)
S02-C5 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1
S02-C6 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1
S02-C7 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=0 | Tests 19 passed (19) | Test Files 2 passed (2)
S02-C8 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=1
S02-C9 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 cannotFindModule=0 noTestFiles=0 | Tests 19 passed (19) | Test Files 2 passed (2)
S02-C9 | mergeArms: --scrim:=0 (expect 2)  S02markers=0 (expect 2)
### porcelain BEFORE: 0 entries   ### porcelain AFTER: 0 entries
```
`VERDICT B` — the same nine inline under `ugrep 7.8.4`: **identical, line for line** (`porcelain AFTER inline: 0`).

**9 of 9 RAN · 0 BROKEN · all nine RED for their declared reason**, and — this is the load-bearing part for "nothing else changed" — **every one of these numbers equals the round-2 verdict's table**. The author's claim that no cluster's file count moved is therefore not merely asserted: C7's command still takes five paths and still reports `Test Files 2 passed (2)` at base for the same reason (only `auth-flow-integration` and `v2ui-node-runner` exist yet), so the `Test Files <n>` arm is what keeps it RED. C4 still 4, C7 still 5, C9 still 10.

**Satisfiability and per-term mutants, my own matrix, from the same `.sh`:**
```
   T1=0 T2=0 T3=0  GUARD=0   <- A: C7-shaped green, n=5 (the round-3 file set)
   T1=0 T2=0 T3=0  GUARD=0   <- B: C4-shaped green, n=4
   T1=0 T2=0 T3=0  GUARD=0   <- C: C9-shaped green, n=10
   T1=1 T2=0 T3=0  GUARD=1   <- T1 mutant: zero pass count
   T1=1 T2=0 T3=0  GUARD=1   <- T1 mutant: the words inside a test TITLE, not anchored
   T1=1 T2=1 T3=0  GUARD=1   <- T2 mutant: a failure in the summary
   T1=0 T2=0 T3=1  GUARD=1   <- T3 mutant: VARIANT 7 — 4 of 5 files ran, exit 0
   T1=0 T2=0 T3=1  GUARD=1   <- T3 mutant: Test Files line absent entirely
   glyph-matching term (^ . tests/) hits under BSD grep, LC_ALL=C : 0   ASCII path term: 1
   terms in the PLAN's idiom matching a glyph                     : 0
```

### 4. "Nothing else changed" — what the claim rests on, stated because it cannot rest on a diff

**There is no byte-baseline of the round-2 PLAN on disk.** `docs/missions/consent-ui/` is untracked (`git status --porcelain` shows `?? docs/missions/consent-ui/`), and I searched every seat's scratch tree: no copy exists. So this claim is structural, and here is all of it.

**(a) Structure — `python3 .hermes/reports/consent-ui/probes/arch-rev-s02-trace.py`, re-run by me:**
```
SPEC R-ids defined: 24 unique: 24        PLAN trace rows: 24        both directions []
steps DEFINED as '- **S02-Snn ' headers: 72 unique: 72   duplicate step definitions: []
distinct S02-Snn tokens anywhere in PLAN: 72   tokens referenced but never DEFINED: []
distinct step ids appearing in the trace table: 72   DEFINED steps in NO trace row: []
refutation-table rows: 72 unique: 72   DEFINED steps with no refutation row: []
steps per cluster: C1 11 · C2 6 · C3 9 · C4 6 · C5 7 · C6 9 · C7 13 · C8 7 · C9 4 = 72
grep -c '<UNDEFINED>' over the DECISIONS step-reference block: 0
```
**`C4 6` and `C7 13` are B3, measured by the probe's own rule** (it groups by the `### Cluster` heading a step sits under, so the two steps had to be moved *physically*, which they were — `S02-S28`/`S02-S29` are written out after `S02-S71` inside §Cluster S02-C7). `total: 72`, no id renumbered, R17's trace row already read `C4 · C7`.

**(b) Every pin the round-2 verdict recorded verbatim, re-grepped by me — all still exactly one hit:** N4's `getAttribute("aria-label") === "Privacy Policy text"` · the mirror-arm block stated once · member 1's `setPrivacyMirror(event.currentTarget.checked && !event.nativeEvent.defaultPrevented)` · member 2's `setPrivacyMirror(privacyInputRef.current?.checked ?? false)` · the "RUNNING a test file is not WRITING it" paragraph · "standing gates … deliberately NOT folded into the guard" · the chain-rule table · the `C5→C6` second-chain paragraph · the three-run law · G1's `tsc --noEmit` fingerprint arm · G2's hit-list count arm. N5's removed judgement clause is still **absent** (`grep -c 'and it reads as one control'` → `0`).

**(c) `modalSemantics.ts`'s exported surface — the cross-slice interface — did NOT move:** `sed -n '162,172p' S02/PLAN.md | md5` = `3a737c18f8109515e5927a6cd004100e` = `sed -n '495,505p' S01/PLAN.md | md5`. The packet's pin, still byte-identical.

**(d) The frozen SPEC was not touched:** `md5 -q docs/missions/consent-ui/slices/S02/SPEC.md` → `ad060bda81db71f00f4c70b1dbf63f2f`, the packet's pin. The contradiction is recorded and routed (V-18), not repaired.

**(e) Banned-word scan, mine:** 27 lines match `improve|better|robust|handle|appropriate`; excluding `handler`/`Handler`/`HANDLER` as a noun leaves **3**, and all three are the ban statement itself (`:21`, `:30`, `:31`). No finding.

**(f) Surfaces:** the only steps whose text changed are `S02-S28` and `S02-S29`; both declare `apps/ui/components/SignUpFlow.tsx` and `tests/render/consent-signup-modal.test.tsx`, which is **exactly** C7's `allowed` row. No two concurrent clusters share a file; C8 remains the only cluster with `globals.css`; the other slice's surface (`ConsentBanner`, `consentStorage`, `app/api`, `middleware.ts`) is **0 hits**; the registration request is untouched.

**(g) DECISIONS is append-only:** 190 lines, **10** `ARCH-S02-REWORK-R2` entries under a new r2 heading, nothing above it altered (the r0/r1 entries the trace probe resolves are unchanged and all resolve).

**(h) The mission graph's own nodes were swept, not only its change table:** `C4["… r2: steps S25, S26, S27, S30, S31, S32 … cases 4 and 5 moved to C7 (B3)"]` and `C7["… S28 + S29 (r2) …"]`, and the r2 section states "No cluster's file count changed in r2, and no step was renumbered" — which §3 above measures as true.

**What (a)–(h) do NOT prove:** that no *unmentioned prose sentence* elsewhere in the 2224 lines was reworded. I read §§ 0–150, 591–760, 929–1180, 1359–1530, 1734–1900, 2015–2115 and 2144–2152 in full and sampled the rest; nothing outside the declared edits reads as new. A byte-level guarantee is impossible without a baseline, and **the fix for that is a mission rule, not a finding** (P8, below).

---

## Non-blocking findings — each needs a ticket

### N11 — the `writing-plans` floor shortfall is declared honestly, but its justification is the same shape as the N9 defect it answers

`SKILLS LOADED` says: *"superpowers:writing-plans — NOT loaded this session; not needed: **no plan was written this round, five step-level texts were corrected**."*

**Why the reason does not hold.** This round rewrote two steps end to end, **moved two steps between clusters and between test files**, authored a new six-row per-case table, rewrote two cluster-map rows and two refutation rows, and re-derived two cumulative acceptance counts. That is plan authoring, and `superpowers:writing-plans` carries the law that governs exactly it — task right-sizing, the no-placeholder list, **type consistency across tasks**, and the **Self-Review pass** (spec coverage → placeholder scan → type consistency). The seat's own `SKILLS LOADED` line in round 0 named `writing-plans`; this round's edits are not smaller in kind, only in volume.

**Why it is N and not B.** The substantive obligation *was* discharged, by a stronger method than the skill prescribes: the trace probe run in both directions, the per-cluster step-count re-measurement, the count-with-its-command rule, and the physical-placement check that the probe groups by heading. And the declaration is **honest and in the correct per-session form** — `heartbeat-protocol` §3b prices an honest shortfall at one line, which is what this costs. This is the identical disposition round 2 gave N9.

**Remedy:** the honest form is *"not loaded this session; plan TEXT was authored (two steps re-written and re-clustered, one new table), and `writing-plans`'s Self-Review obligation was discharged mechanically by the trace probe and the count re-measurement rather than by the skill's checklist."* Generalisable rule for the mission: **editing steps is writing a plan.**

### N12 — the click rule pins the ACTION but not the VALUE its predicate reads, and reading the wrong one defeats V's goal (measured)

`PLAN.md:934-938`: *"one `onClick` on the row — **if the box is CHECKED**, do not `preventDefault` … **if it is UNCHECKED**, `event.preventDefault()` unconditionally and open the modal."*

**Checked according to what?** The DOM property or the R17 mirror. The plan never says, in that sentence or in the step bodies. I built the component from this prose and hit it immediately — my first implementation read `privacyInputRef.current.checked`, and **the modal never opened once**.

**Measured, 3 runs identical** (`probes/arch-rev-s02-r3-b3-independent.mjs`):
```
TRACE rowClick: domChecked=true mirror=false -> isChecked=false   (predicate = React mirror)
      after: box=false dialog=true
TRACE rowClick: domChecked=true mirror=false -> isChecked=true    (predicate = input.checked)
      after: box=true  dialog=false
MODE mut_predicate_dom, V's goal:
      bare privacy click x2, then adult      box=true  btnDisabled=true
      open then dismiss with x, then adult   box=true  btnDisabled=false   <- registration reachable, policy never shown
```
The DOM read is the **in-flight** activated value — the very distinction `PLAN:948-952` measures and pins **for the `onChange` mirror**, one paragraph later, with the verbatim trace `onClick(mirror=false,domChecked=true)`. **The plan pins half the rule and leaves the other half to the reader**, and the half it leaves open is the one that reproduces B1's outcome class by a different mechanism.

**Seat that goes wrong and how:** the CODE-S02-C7 seat writes `if (privacyInputRef.current.checked)`, `S02-S49` fails on its `[role="dialog"]` assertion, and the seat debugs a React/jsdom mystery. **It is caught** — that is why this is N and not B — but it is caught after the cycle, not before it, in the one cluster this mission has already spent two rounds on.

**Remedy (ADVISORY as wording, BINDING as class — `COMMON.md` §10.22):** one clause in the click rule naming the value, e.g. *"if the **R17 privacy mirror** is `true` (never `input.checked`, which the pre-click activation has already flipped — see the mirror rule below)"*. The class is *every predicate in this plan that reads a checkbox state inside an event handler*; I swept it: the row handler is the only member (the `onChange` mirror is already pinned; `S02-S52`'s "if the box is checked" is a test-side assertion after `act`, where the value is settled). Appended to `TOOLING-TRAPS.md`.

### N13 — the `ADR-0019` residual in C1's forbidden column (author-declared, correctly not fixed, needs a ticket)

`PLAN.md:2068` still names S01's ADR as `ADR-0019-consent-storage-contract.md`; under `COMMON.md` §10.23 that string is now `ADR-0021-consent-storage-contract.md`. The author reported it in the handoff and in `PLAN:301-304` and did **not** fix it, because it is S01's name and outside the packet — the right call under packet §2. **It is filed here so it is not dropped:** `heartbeat-reviewer` §3, and this mission's own history of a "residual" returning as a blocker one round later. One `perl -pi -e` for whoever owns S01's text. `grep -c 'ADR-0019' PLAN.md` → **3** (this one, plus two in the reservation/correction prose, both of which must survive).

### N14 — two counts in the ADR correction entry are wrong, and it is the same class as N8

Measured by me, script and inline agreeing:

| statement | where | measured now |
|---|---|---|
| *"`8` occurrences of `ADR-0022-shared-modal-semantics.md` after"* | `DECISIONS.md`, ADR entry | **9** lines / **9** occurrences — and the author's own handoff says 9 ("the 8 renamed + 1 in the correction paragraph"). The entry also cites `grep -c 'ADR-0020' …` as the command for an `ADR-0022` count. |
| *"reserved by the HALTED `translation` mission (**37 and 14** references)"* | `PLAN.md:291-292` **and** the same DECISIONS entry | `grep -rho 'ADR-0019' docs/missions/translation \| wc -l` → **23** (12 files); `grep -rho 'ADR-0020' …` → **0**. |

**The 37/14 half is not the author's fault and I say so plainly:** those numbers come from the orchestrator's `t_50321020` CORRECTION at 21:12, and `COMMON.md` §10.23 was corrected with the measured counts at **22:03 — three minutes after this seat's 22:00 handoff.** The seat transcribed the constant it was given. **The allocation is unaffected** (0021/0022 are unwritten and unclaimed), so nothing downstream moves; only the justification sentence is false, and it currently reads as though `ADR-0020` were referenced 14 times by a mission that never mentions it. The 8-vs-9 half **is** this round's, and it is precisely the N8 class the same entry set exists to close: **a count stated without re-running its command.**

**Remedy:** correct both in the next lawful ARCH edit, each with the command beside it.

### N15 — this round converted `S02-S28` out of the GREEN-before class and did not sweep the sentence that counts that class

`PLAN.md:126-127`, in §How to read a step: *"A step that quietly passes before and after is not a step; **there are exactly two such controls in this plan (`S02-S28`, `S02-S32`)** and both are labelled."*

`S02-S28` is no longer one. The step now reads *"RED before, GREEN after — and this is an upgrade the move pays for"* (`:1147`) and its refutation row says *"**It is no longer a GREEN-before-and-after control**"* (`:2147`). The author swept the cluster-map rows and the refutation row — **and missed the scaffold sentence that names and counts the class**, which is the B4 shape ("two formulations of one rule") this plan names five times.

**Second half, pre-existing and pointed out because the fix should measure rather than re-guess:** the count was already loose. `grep -n 'GREEN before and after'` returns **4** steps (`:546`, `:557`, `:737` = `S02-S32`, `:1269`); three of them call themselves "constraint" / "standing guard" / "by design" rather than "control", so "exactly two" was a judgement, not a measurement. Neither round 1 nor round 2 raised it, so under this packet's rule that half is N.

**Seat that goes wrong and how:** a C7 seat reading §How to read a step expects `S02-S28` to pass before its change, sees it RED, and pauses to decide whether it has a defect. The step body is authoritative and unambiguous, so nobody is *blocked* — which is why this is N. **Remedy:** delete `S02-S28` from that parenthetical and give the sentence its command (`grep -c 'GREEN before and after'` with the counting rule), or drop the count and keep the rule.

---

## Packet findings

**P6 — `ARCH-S02-REWORK-R2.md` §1 and §2 contradict each other, and §1's instruction was unsatisfiable as worded (author's candidate finding 2, CONFIRMED).** §1: *"change ONLY the case-4/5 route to your corrected text"*; §2: *"No other line of the PLAN changes."* Correcting the route **requires** modelling the acknowledgement affordance in the probe (a component change — there is no acknowledgement control at all in the reviewer's harness), and it **necessarily** staled the cluster map, both mutant-class columns, the refutation rows, the six-cases intro, the pasted trace counts and the mission graph. The author changed all of them and declared each, which is right; a literal reading of §2 would have forbidden it. **Wording:** a rework packet's "nothing else changes" clause should read *"no line outside the closure of the ordered edit changes; state the closure in the handoff."*

**P7 — the same packet sent the author down a ripple axis that does not exist (author's candidate finding 3, CONFIRMED by my own measurement).** §1: *"adjust the chain-rule `<n>` counts and the `Test Files` arm."* **Neither changed:** C4 still runs 4 files, C7 still 5, C9 still 10 — I ran all nine commands twice and the file counts and their base verdicts are identical to round 2's. What actually changed is per-cluster STEP counts and two per-step cumulative acceptances, which §1 never mentions. The general shape: **a packet that names the ripple by guess instead of by measurement costs the seat a hunt for a delta that is not there.** `COMMON.md` §10.24's rule for line ranges should extend to ripple claims.

**P8 — my own round-3 packet ordered a deliverable that is not in its exhaustive `allowed` list, and its "nothing else changed" charge has no baseline to check against.** (i) `ARCH-REV-S02-R3.md` §1 `allowed (exhaustive)` does not include `.hermes/reports/consent-ui/probes/arch-rev-s02-r3-*`, while the dispatch message requires that copy **before** the verdict comment (and rightly — two reviewers promised it and did not do it). I made the copy on the dispatch's authority and declare the mismatch here; `heartbeat-reviewer` §1 calls a mandatory deliverable outside `allowed` a packet defect. (ii) §4 asks me to *"confirm by a targeted `grep -n` sweep that NOTHING ELSE in the PLAN changed"* — but the artifact is untracked and no snapshot is taken at any handoff, so a grep sweep can confirm the pins it knows to look for and nothing more. **Remedy, and it is cheap: every ARCH seat copies its artifacts to `probes/../snapshots/<artifact>.<round>.md` at handoff** (or the orchestrator does, from the `WRITTEN` block it already prints). One `cp` per round converts every future "nothing else changed" from a judgement into a `diff`.

---

## Not verified — gaps for whoever comes next

- **That the author loaded the seven skills declared.** Only a transcript grep settles it (`COMMON.md` §1). I checked form, per-session correctness and floor coverage, and filed N11 on the one absence.
- **Byte-level "nothing else changed."** Impossible without a baseline; see §4 and P8 for exactly what I did check instead.
- **The three-run law on the cluster commands.** I ran each twice (script + inline). Three runs is the coding seat's obligation and remains unspent.
- **`S02-S52`/`S02-S53`'s focus question** — whether the acknowledgement returns focus to the privacy input or to the element that opened the surface, when the modal was opened by clicking the row's TEXT span. `useModalSurface`'s contract says "whatever was focused when the surface opened"; `S02-S53` asserts the input. Round 2 predicted it, the author reported it as candidate finding 4, and **nobody has run it** — including me. It is outside B3 and it is my top prediction for the next defect.
- **The Esc stack, geometry, the pills' scroll, the narrow viewport, the live mode flip, and `Space` on a focused checkbox in a real browser.** V's steps 1-2, 5, 6, 7, 12, 13, 14. Correctly conceded in the refutation table and in `S02-S69`.
- **`S02-S69`'s three commands.** They need a dev stack serving this branch; the step says so and names the `UNVERIFIED` path.
- **Whether S01's plan contains N12's shape.** S01's card consumes `PrivacyPolicyModal.tsx` with `mode="read"` and has no checkbox row, so I expect not — but I read S01's PLAN only for the `modalSemantics` block and the ADR name.

---

## Predictions (blind-lens check)

I expect **the S01 round-3 lens passed**, and that if S01's plan has any row-click-like handler at all, **it did not check the predicate's value the way N12 does** — because the only way to find N12 is to *write the component from the prose and watch it not work*, and a reviewer who reads the prose agrees with it every time. That is the generalisable lesson of this round: **the round-2 lens found B3 by running the author's cases against a component at more than one stage; I found N12 by building the component from the plan's own sentences and discovering the sentence was ambiguous. Both are the same technique — execute the artifact, do not read it — applied one level further down.**

Second prediction: **nobody checked that C4's declared LOSS is real.** The plan says C4 can no longer catch a hard-coded `disabled=true`; it is far easier to accept that sentence than to run the mutant, and if the sentence had been wrong in the other direction (the mutant still caught) the plan would be understating its own coverage while a coding seat trusted the overstatement. I ran it: `mut_disabled_true` gives C4 **4/4 green**. The loss is exactly as described, and this is the one claim in the round I would have bet against.

The thing I would check first with a fourth run: **`S02-S29`'s first half against the acknowledgement route in the SAME case.** It assigns `.checked = true` on both inputs, asserts disabled, resets both, clicks `adult-affirmed`, then runs the acknowledgement route. The route opens the modal by clicking `privacy-accepted` — a box that was assigned `true` and then reset to `false` in the same test. I measured it green three times on two independently written components, so I believe it; but it is the only case in the slice that mixes the assignment idiom, a reset, a real activation and the modal route in one body, and it is the case most likely to break when a coding seat re-orders those four movements.

**Round 3 of max 3 — the last lawful rework round. Verdict PASS: no rework round is opened, and no V DECISIONS row is needed for the round cap.** V-18 remains open as V's own row, exactly as routed.

`comments read through: t_00133ced 5 · t_50321020 8 · t_3160e2d5 5 · t_d16a1656 3 · t_e5075f50 1 · t_d12339f3 0`
