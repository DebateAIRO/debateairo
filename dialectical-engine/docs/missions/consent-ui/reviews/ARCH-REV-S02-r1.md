# ARCH-REV-S02 — round 1 verdict on ARCH-S02's packet and `slices/S02/PLAN.md`

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:writing-plans`
- `superpowers:receiving-code-review` — **not loaded this session; not needed, no finding was contested with me** (per-session declaration, `COMMON.md` §10.9).
- Seat ARCH-REV-S02, Opus 5, fresh blind session, round **1 of max 3**. Main tree `2b670d30` / `dev` / 90 dirty (pre-existing, untouched). Lane `.worktrees/consent-s02/dialectical-engine` @ `2b670d30` / `slice/consent-s02`, **`git status --porcelain` = 0 entries before and after every command I ran there**. No git write, no edit to anything under review.

## Verdict: **REWORK** — 2 blocking (B1, B2), 8 non-blocking (N1–N8), 4 packet findings (P1–P4)

This is a strong plan. 69 steps, 67 of them with a mechanical acceptance; the SPEC trace is 24/24 both ways; the A9 proof is real (I re-ran all nine cluster commands and reproduced the author's table byte-for-byte); the `opacity: .65` contrast pin reproduces to the digit under an independent implementation of the WCAG formula; the cross-slice interface is byte-identical to S01's copy; every product constant I sampled is correctly quoted. **B1 is not a slip in any of that — it is an emergent defect between two separately-correct pins, and no step in the plan looks at the state where it lives.**

---

## B1 — BLOCKING. The plan's own pinned click rule desynchronises R17's mirror: `Create account` enables with the privacy box unticked, and two clicks tick it with no acknowledgement at all.

**Where:** `PLAN.md:702-706` (the C7 "one click rule"), `PLAN.md:420-423` (C4's pinned mirror shape), `DECISIONS.md:97` (the ARCH ruling that fixes the rule). The mechanism is the interaction of the two, not either alone.

**The two pins.** R17 (SPEC-pinned, restated at `PLAN.md:420-423`): each input carries an `onChange` that mirrors `event.currentTarget.checked` into a React boolean, and those booleans compute the submit button's `disabled` **alone**. C7 (ARCH-pinned, `PLAN.md:705-706`): if the privacy box is UNCHECKED, `event.preventDefault()` **unconditionally** and open the modal.

**The mechanism.** jsdom's pre-click activation steps set `input.checked = true` *before* the click event dispatches; React routes a checkbox's `onChange` through that click event and fires it with `currentTarget.checked === true`; jsdom's canceled-activation steps then revert `.checked` to `false` *after* dispatch. Net: **DOM `false`, mirror `true`.** The button's `disabled` is computed from the mirror alone, so it enables.

**Measured** — `scratchpad/arch-rev-consent-s02/c7-mirror-desync-probe.mjs`, React 19.2.8 / jsdom 30.0.1 from `apps/ui/node_modules`, the component built from the PLAN's own prose (uncontrolled inputs + `onChange` mirror + `FormData` at submit + C7's row handler), **three runs, identical**:

```
  SCENARIO 1 — click the UNCHECKED privacy box, then dismiss with the x button
    dialog open (S02-S49 expects true)                  true
    DOM .checked (S02-S49 expects false)                false
    R17 mirror p  [PLAN asserts this NOWHERE]           true
    after x: dialog (S02-S54 expects null)              null
    after x: DOM .checked (S02-S54: false)              false
    after x: Create account .disabled                   false
      ^^ SPEC V-step 7 requires 'Create account still disabled' here.
    register() calls (R18 refusal holds?)               0

  SCENARIO 2 — click the UNCHECKED privacy box TWICE (no acknowledgement at all)
    DOM .checked after 2nd click                        true
    R17 mirror p                                        true
    Create account .disabled                            false
    register() calls  [MUST be 0 per V's goal]          1
```

And the **browser-realistic** path, where the scrim forces the user to dismiss before clicking again — `scratchpad/arch-rev-consent-s02/scenario3.mjs`, three runs, identical:

```
run 1: after [click box -> x -> click row text]  DOM .checked=true mirror=true submitDisabled=false register()calls=1 dialogReopened=false
run 2: after [click box -> x -> click row text]  DOM .checked=true mirror=true submitDisabled=false register()calls=1 dialogReopened=false
run 3: after [click box -> x -> click row text]  DOM .checked=true mirror=true submitDisabled=false register()calls=1 dialogReopened=false
```

The second click takes C7's CHECKED branch — because the *mirror* says checked — which by design does **not** `preventDefault`, so the native toggle ticks the box. Three clicks and a dismissal, and the policy was never scrolled, never acknowledged, and `register()` fires.

**What breaks, in the SPEC's own words:**
- `SPEC.md` Purpose (`:30-34`) and V's goal verbatim in `SPEC.md:133-134` — *"if the User does not click the 'I agree' button …, then the tickbox is not ticked."* It is ticked.
- `PLAN.md:1240-1242`, invariant 1 — *"The privacy box is ticked only through the modal's acknowledgement."* It is not.
- `SPEC.md:661-665`, V acceptance step 7 — *"the modal closes and the privacy box is still empty; `Create account` still disabled."* It is enabled.
- `COMMON.md` §3 standing V honesty law — after scenario 1 the button is visibly active and does nothing when pressed, because R18's `FormData` refusal silently returns. `SPEC.md:648-649` uses *"greyed out and does nothing when clicked"* to describe the **disabled** state; this ships the second half without the first.

**No step in this plan can see it.** `S02-S49/S50/S51` (`PLAN.md:708-727`) assert only `dialog present` + `DOM .checked === false`. `S02-S54/S55/S56` (`:753-775`) assert only `dialog absent` + `DOM .checked === false` + focus. `S02-S52` (`:729-734`) reaches the checked state *through the modal path*, so it never meets a desynced mirror. C4's six cases run before C7 exists, and **C4's command does not include C7's test file** (N7). C9 runs all nine files and asserts nothing about the button after any open-or-dismiss route. The refutation row for `S02-S49` (`:1437`) claims it catches *"the square ticking the box as the modal opens"* — it catches the DOM half and misses the mirror half, which is the same defect one layer down and is precisely the B2/B4/B5 class this mission has spent three rework rounds on.

**Seat that goes wrong and how:** the C7 coding seat implements exactly what `PLAN.md:702-706` pins. Every C7 step goes green, C9 goes green, the Grok gate's precondition is met, and V finds it at acceptance step 7 — the round the whole cluster structure exists to prevent.

**Remedy (the class, not the instance — `heartbeat-protocol` §2.2).** The class is *"every place where the DOM checkbox state and the R17 mirror can diverge"*. Two members, both must be fixed:
1. **The open path.** C7's UNCHECKED branch must drive the mirror back to `false` as well as the DOM (or the mirror must stop being an `onChange`-set state and be recomputed from `input.checked` after the handler runs). Pin the choice in DECISIONS with its measurement.
2. **The dismissal paths.** `×`, `Esc` and backdrop must leave the mirror `false` too, since the modal can be opened from a state where it was already desynced.

And add the assertion that would have caught it, to `S02-S49`, `S02-S50`, `S02-S51`, `S02-S54`, `S02-S55` and `S02-S56` — after each route, **also** assert the `Create account` button's `disabled` is still `true` after `field("adult-affirmed").click()`. Per `COMMON.md` §10.10 the rework is discharged only by re-running `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/arch-rev-consent-s02/c7-mirror-desync-probe.mjs` and `scenario3.mjs` (copied to `.hermes/reports/consent-ui/probes/` at my exit) against the corrected rule, with the output pasted verbatim.

**VERDICT / CONFIDENCE high / STRONGEST COUNTER:** a coding seat might independently notice and write `setPrivacyMirror(false)` next to `preventDefault()`. Nothing in PLAN or DECISIONS tells it to, no test would tell it if it did not, and `DECISIONS.md:97` shows the author reasoning about mirror sync in the *checked* direction only ("so the box unchecks **and the mirror updates**") — which is the strongest evidence that the unchecked direction was not considered rather than considered and dismissed.

---

## B2 — BLOCKING. Eight of the nine step references in DECISIONS.md's ARCH-S02 section point at the wrong step; one points at a pin that does not exist.

**Where:** `slices/S02/DECISIONS.md:77, 82, 89, 99, 100, 101, 107, 109`. Measured by cross-referencing every `S02-Snn` token in DECISIONS against the 69 `- **S02-Snn ·` step headers in PLAN.md (`scratchpad/arch-rev-consent-s02/trace.py`):

| DECISIONS | cites | PLAN defines that id as | the step actually meant |
|---|---|---|---|
| `:77` | `S02-S17`…`S02-S22` | the C3 checkbox-group steps | `S02-S25`…`S02-S30` (R17's six cases) |
| `:82` | `S02-S45` | "The scroll region is keyboard-reachable and named" | `S02-S66` (the merge) |
| `:89` | `S02-S42` | "A policy short enough to need no scrolling enables the button at mount" | `S02-S65` (the transform guard) |
| `:99` | `S02-S33` | "The prop type has exactly four members" | **no such pin exists** — see N3 |
| `:100` | `S02-S36` | "Eight pills render in order" | `S02-S53` (acknowledge sets DOM + mirror) |
| `:101` | `S02-S05` | "Shift+Tab from the first focusable goes to the last" | `S02-S01` (the two-surface Esc pin) |
| `:107` | `S02-S28` | "Case 4 — both, via `.click()` → NOT `disabled`" | `S02-S48` (the `scrollIntoView` stub) |
| `:109` | `S02-S43` | "The criterion is re-evaluated on `resize`" | `S02-S64` (the contrast composite) |

The offsets are not constant (+8, +21, +23, +17, −4, +20, +21), so this is not one renumbering — it is stale references from more than one drafting pass, and `COMMON.md` §10.6's standing self-contradiction charge ("before handoff the author diffs its own artifacts against each other") was discharged for PLAN↔SPEC and not for PLAN↔DECISIONS. `DECISIONS.md:101` is additionally self-refuting: it calls `S02-S05` "the first assertion of the first cluster", and `S02-S05` is the fifth step of C1.

**Seat that goes wrong and how, concretely:** DECISIONS.md's own header (`:5`) makes it the file every seat reads before asking a question. A C6 seat reading `:89` is told that step **`S02-S42`** adds a source-text assertion to `tests/unit/consent-s02-style-contract.test.ts`. `S02-S42` is in C6, whose `allowed` list (`PLAN.md:1342`) is `PrivacyPolicyModal.tsx` + `consent-policy-modal-behaviour.test.tsx` — the style-contract file is not in it. The seat either crosses its file contract or drops the guard as stale. Same shape for `:82` (a C6 seat told it owns the cross-lane merge) and `:107` (a C4 seat told its Case 4 stubs `scrollIntoView`).

**Remedy:** DECISIONS is append-only (`:3-5`), so append ONE correction entry carrying the table above, in the form the file already uses for supersessions (`:66`, `:70`). Do not edit the existing lines. Then re-run `scratchpad/arch-rev-consent-s02/trace.py` and paste its `--- DECISIONS.md step references ---` block verbatim.

---

## N1 — `S02-C9`'s mutant-class column claims a mutant its ONE command cannot detect.

`PLAN.md:1034` claims C9's command detects *"the merge losing S01's or S02's `globals.css` block"*, under a column headed *"Mutant class **the command** detects"* (`:1024`), against the plan's own rule at `:1224` — *"a cluster whose command passes under its own mutant is not a verification."*

The C9 command is nine vitest files. The only one that reads `globals.css` is `tests/unit/consent-s02-style-contract.test.ts`, whose seven steps (`S02-S59`…`S02-S65`) assert **only** about S02's own delimited block and the seven auth-shell selectors; `S02-S64` takes its token values from `COMMON.md` §7 as literals, not from the file. Nothing in the nine reads S01's markers or `--scrim:`. Losing S02's block fails `S02-S59`; **losing S01's block fails nothing.** The `--scrim:` grep that would catch it lives in `S02-S66`'s step acceptance (`PLAN.md:910`) and is not part of the command.
**Remedy:** either add the S01-block arm to the C9 command, or narrow the column to "the merge losing S02's block" and cite `S02-S66`'s grep as the separate, named acceptance for S01's.

## N2 — Five defined steps appear in no trace row, and the handoff claims otherwise.

`S02-S02`, `S02-S04`, `S02-S05`, `S02-S06`, `S02-S09` reach the trace only through the range notation `S02-S01 … S02-S10` in R16's row (`PLAN.md:72`). Literal token count: 64 of 69 step ids appear in the trace table. The handoff (comment 3 on `t_50321020`) states *"steps NOT in any trace row: []"*, and `PLAN.md:53` states *"no step exists without a requirement"*.
**Remedy:** expand R16's range, or state the range convention beside the counting rule at `PLAN.md:84-98` so the count is reproducible.

## N3 — SPEC R03's "keyboard-toggleable" hook has no step, and DECISIONS asserts a pin that does not exist.

`SPEC.md:96-97` gives R03 the hook *"jsdom asserts both inputs exist by name and are keyboard-toggleable"*, and `SPEC.md:621-622` repeats it. R03's trace row (`PLAN.md:59`) names `S02-S19`, `S02-S20`, `S02-S22` — none dispatches a key on either input. Grepping the whole PLAN for `Space`/`keydown` returns only Escape and Tab, all inside `modalSemantics`. `DECISIONS.md:99` — the seat's own CONTESTED entry about `Space` on `privacy-accepted` — says *"the plan pins the behaviour (`S02-S33`)"*; it does not, and no step does.
**Remedy:** add a step to C3 that dispatches `Space` on `adult-affirmed` and asserts it toggles, and a step to C7 that dispatches `Space` on the unchecked `privacy-accepted` and asserts the modal opens with the box still `false` — which is the *only* mechanical evidence for the recommendation `DECISIONS.md:99` routes to V.

## N4 — `S02-S45`'s accessible-name assertion cannot fail.

`PLAN.md:655-661`: *"a non-empty accessible name (`aria-label`, asserted by string equality against the label the component sets)"*. The expected value is whatever the implementation chose, so the assertion is a tautology; only the `tabindex === "0"` half discriminates. Compare `S02-S44` (`:646-653`), which pins its string verbatim (`Scroll to the end of the policy to continue.`).
**Remedy:** pin the `aria-label` string in the step, as `S02-S44` does.

## N5 — Two acceptances are judgement calls, against the PLAN's own quantifiability law.

`PLAN.md:942-943`, `S02-S69`: *"the sign-up page renders the bordered two-row group, and the Grok gate's precondition ('every numbered step runnable') holds."* No command, no expected string. `PLAN.md:460-461`, `S02-S28`: *"the case passes, **and it passes for the right reason** once `S02-S25` is also green."* `PLAN.md:19-26` requires that a stranger mark every step done or not-done with no judgement call; 67 of 69 acceptances meet that bar, these two do not.
**Remedy:** `S02-S69` → a fetch of `https://localhost:3000/sign-up` grepped for the `consentGroup` class, plus the two `.next` removal / restart facts as observable commands. `S02-S28` → drop the trailing clause; the conjunction with `S02-S25` is already the refutation table's job (`:1416`).

## N6 — `S02-S22`'s three insertion points are pre-edit line numbers that shift, and all three target lines are byte-identical.

`PLAN.md:380-381` and the C3 boundary row (`:1339`) pin the edit at `:324`, `:448`, `:466`. Measured in the lane: all three lines are the identical string `field("adult-affirmed").checked = true;`. Inserting at `:324` shifts the other two by one. The step's acceptance (`Tests 17 passed (17)`) still holds if a line lands in the wrong case, so a stranger can mark it done having done it wrong.
**Remedy:** anchor on the case lines the plan already cites (`:316`, `:436`, `:456`) or on the `it(...)` titles, and add a count arm — exactly three occurrences of `field("privacy-accepted").checked = true;` in the file.

## N7 — `S02-C4` and `S02-C7` do not re-run the earlier `SignUpFlow.tsx` cluster's own test file.

`PLAN.md:1029` (C4) lists `consent-signup-gate` + `auth-flow` + `v2ui-node-runner`; `PLAN.md:1032` (C7) lists `consent-signup-modal` + `auth-flow`. All three clusters edit the same component (`:1046-1047`), so a C4 regression into C3's pins, or a C7 regression into C3's or C4's, is invisible until C9. This is the structural gap **B1** fell through.
**Remedy:** each cluster in the `SignUpFlow.tsx` chain runs every earlier chain member's test file, with `<n>` raised accordingly.

## N8 — Two counts in the handoff and self-report are wrong, and one of them is the evidence for a binding discharge.

`agent-reports/ARCH-S02.md:12-13` and comment 3 both state *"30 appended `DECISIONS.md` lines"*; measured **28** entries under `### Architecture round — ARCH-S02` (all 28 correctly ending `· ARCH-S02`). `agent-reports/ARCH-S02.md:52` and comment 3 state *"9 of my 30 lines carry a `Rejected:` clause"*; measured **4** entries (10, 11, 16, 26 of 28). The second is not cosmetic: it is the evidence offered for `COMMON.md` §10.1's discharge of brainstorming's human gate. The substance is better than 4 — several further entries record an alternative without the marker word (`:83`, `:99`, `:114`, `:115`) — but the stated count is not the measured one, and `COMMON.md` §10.10 (and packet §6's N13 class rule, which the PLAN itself obeys perfectly at `:84-98`) requires a count to carry its command.
**Remedy:** restate both counts with the command that produced them, or drop them.

---

## Packet findings (against the packets, not their authors)

**P1 — `ARCH-S02.md:13` (§A2) vs `:33` (§5e) conflict, confirmed.** §A2 demands "ONE verification command … in the lawful capture-first idiom"; §5(e) demands the typecheck and t9 deltas "in every cluster's verification command". The lawful guard asserts a summary with a nonzero pass count and no `failed`; both gates are RED at base by design (`BASELINE.md:9,11`), so folding them in makes every cluster command permanently red. The author resolved it correctly (standing gates outside the guard, `PLAN.md:1057-1069`) and priced it at ~10 minutes. **The packet is wrong, not the plan.** Wording: "reported by every cluster".

**P2 — `ARCH-S02.md:20` (§A9) lists `cannot find module` as a BROKEN signature.** It is the *expected* pre-fix RED of every TDD-first cluster whose test imports the module the same step creates. `TOOLING-TRAPS.md` draws this distinction for `no test files found` but not for this one. The author wrote the discriminator into `PLAN.md:121-127`; it belongs in the packet.

**P3 — `ARCH-S02.md:29` states an orchestrator "recommended order" that is measurably wrong.** It orders `S02-C1` to be `privacyPolicy.ts` + the helper + `PrivacyPolicyModal.tsx`, *"built after `git merge slice/consent-s01` brings S01-C1's tokens into the S02 lane"*. Measured in the lane: none of those three files references a CSS token, and `t9-mode-tokens.test.ts:376-377` asserts set equality over **declarations** while its colour-literal gate scans for `#hex`/`rgb(`/`oklch(` literals — a `var()` reference is neither. Following the packet would have serialized both lanes behind S01-C1 for no reason, in a mission whose stated point is two parallel lanes. §A2 marks its own hint "a hint not a law"; §4 states this one as the order. **Give §4's order the same caveat, or measure it before writing it.**

**P4 — my own packet, `ARCH-REV-S02.md:24`,** ends "Round 3 REWORK → V row". The rule is that a REWORK which would *open round 4* becomes a V row; as written it reads as though a round-3 REWORK is itself unlawful. This is round 1, so nothing turned on it. `ARCH-REV-S02.md:16`'s instruction to "plant a trivial mutant in scratch — never in the lane" is the single best line in the packet: it is what forced me to rebuild the component from the plan's prose, which is how B1 surfaced.

---

## Verified — how, with verbatim output

**1. Charge A9 re-run independently. All nine cluster commands, in the lane, at base, with the PLAN's own guard function** (`scratchpad/arch-rev-consent-s02/a9.sh`). My output is **identical to the author's table at `PLAN.md:1087-1118`, line for line**:

```
S02-C1 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 noTestFiles=1
S02-C1 | raw     : No test files found, exiting with code 1
S02-C2 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 noTestFiles=1
S02-C3 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 noTestFiles=0
S02-C3 | Tests    :       Tests  19 passed (19)
S02-C3 | TestFiles:  Test Files  2 passed (2)
S02-C4 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 noTestFiles=0
S02-C4 | Tests    :       Tests  19 passed (19)
S02-C4 | TestFiles:  Test Files  2 passed (2)
S02-C5 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 noTestFiles=1
S02-C6 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 noTestFiles=1
S02-C7 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 noTestFiles=0
S02-C7 | Tests    :       Tests  17 passed (17)
S02-C7 | TestFiles:  Test Files  1 passed (1)
S02-C8 | vt=1 guard=1 VERDICT=1 | brokenSigs=0 noTestFiles=1
S02-C9 | vt=0 guard=1 VERDICT=1 | brokenSigs=0 noTestFiles=0
S02-C9 | Tests    :       Tests  17 passed (17)
S02-C9 | TestFiles:  Test Files  1 passed (1)
### lane porcelain after cluster commands: 0 entries
```
**9 of 9 RAN, zero BROKEN, all nine RED for the declared reason.** The A9 classification at `PLAN.md:1123-1128` is correct, and variant 7 is real: the `Test Files <n> passed (<n>)` arm is the only thing turning C3/C4/C7/C9's `vt=0` into a RED.

**2. The `opacity: .65` pin re-derived from scratch** (`scratchpad/arch-rev-consent-s02/contrast.mjs`, my own WCAG relative-luminance implementation, `COMMON.md` §7 token values, per-channel composite `α·fg + (1-α)·bg`). It reproduces `PLAN.md:1192-1198` **including every composited hex**:
```
opacity 0.60 : Terracotta #78746c/#f5f1ea 4.13   |   Chamber #9f988b/#1a1612 6.29
opacity 0.65 : Terracotta #6e6a63/#f6f1eb 4.79   |   Chamber #a9a295/#191511 7.17
opacity 0.70 : Terracotta #646159/#f6f2ec 5.54   |   Chamber #b4ac9f/#181511 8.09
enabled (no opacity): Terracotta 14.00 | Chamber 15.72
```
`.65` is the smallest 0.05 step clearing 4.5:1 in both modes. **This closes the contrast gap three review rounds left UNVERIFIED, and it is the best single thing in the plan.**

**3. Trace both ways, mechanically** (`scratchpad/arch-rev-consent-s02/trace.py`):
```
SPEC R-ids defined: 24 unique: 24        PLAN trace rows: 24
R-ids in SPEC missing a trace row: []    trace rows with no SPEC R-id: []
steps DEFINED as '- **S02-Snn ' headers: 69 unique: 69   duplicate step definitions: []
distinct S02-Snn tokens anywhere in PLAN: 69   tokens referenced but never DEFINED: []
refutation-table rows: 69 unique: 69
DEFINED steps with no refutation row: []   refutation rows for undefined steps: []
steps with no 'Acceptance:': []            steps naming no cluster: []
distinct step ids appearing in the trace table: 64   -> N2
```
Cluster membership by document position: C1 10 · C2 6 · C3 8 · C4 8 · C5 7 · C6 9 · C7 10 · C8 7 · C9 4 = **69**, matching the cluster table's ranges exactly.

**4. Cross-slice interface byte-identity.** `S02-R14`'s blockquote and `S01-R20`'s blockquote: both md5 `a0440e4f9e1492c200f63079da89f236`, 1038 chars, **BYTE-IDENTICAL: True**. `SPEC.md` md5 `ad060bda81db71f00f4c70b1dbf63f2f`, matching the author's claim — the frozen SPEC was not touched.

**5. Every product constant I sampled, in the lane, matches the plan:** `--scrim`/`--z-policy-scrim`/`--z-policy-card`/`--ok-edge` → `0` declarations each, `--ok-dot` → `2` (so `DECISIONS.md:84`'s correction to frozen R22 is right); `SignUpFlow.tsx:185-188` is the `.authCheck` label with `I affirm that I am at least 18 years old.` at `:187` and `disabled={busy || sent}` on the button at `:190`; `auth-flow-integration.test.tsx` `field()` at `:35-39`, `submit()` dispatching a bare `new Event("submit")` at `:41-48`, `field("adult-affirmed").checked = true;` at `:324`/`:448`/`:466`, the four-argument `toHaveBeenCalledWith` at `:327-332`; `t9-mode-tokens.test.ts:376-377` is the set-equality pair and `:379-384` the raw VALUE loop (N2's correction stands); `tests/support/contrast.ts` exports `contrastRatio`. `v2ui-node-runner.test.ts:19` **is** `expect(activeTests).toEqual([...manifest].sort());` — REQ-01's contest of REQ-REV-01 N5 (`DECISIONS.md:59`) is correct.

**6. The C3/C4 copy-ban mutant is real.** `v2ui-node-runner.test.ts:24-34` runs `scripts/run-node-tests.mjs` via `spawnSync` and asserts `{ status: 0 }`, so a banned substring entering `SignUpFlow.tsx` fails `authRoutes.source-test.mjs:48` → nonzero exit → vitest RED inside the cluster command.

**7. The modal placement boundary holds.** `SignUpFlow.tsx:101-203` is `<AuthShell>` wrapping a single `<form>` at `:110-202`, so `S02-S57`'s "sibling after `</form>`" needs only `SignUpFlow.tsx` — `AuthShell.tsx` stays in the forbidden list correctly.

**8. Concurrency claim checked file-by-file.** C1∥C2, C3∥C5, C4∥C6, C8∥all — all disjoint. C3→C4→C7 and C5→C6 correctly serialized on their shared component. The two-seat schedule at `PLAN.md:1053-1055` is sound.

**9. Banned-word scan of PLAN.md.** Every hit of `improve|better|robust|handle|appropriate` is either the scaffold's own statement of the ban (`:21`, `:30-31`) or "handler"/"HANDLER" as a noun naming `submitRegistration`/`backdropCloseHandler`. **No banned-word finding.**

**10. Author's `SKILLS LOADED` vs the architecture floor.** Comment 3 declares `superpowers:using-superpowers, heartbeat-protocol, heartbeat-architecture, superpowers:brainstorming, superpowers:writing-plans, superpowers:test-driven-development`, with the §10.1 discharge stated and the honest `receiving-code-review — not loaded this session` line. **Meets the floor (`brainstorming` then `writing-plans`), correct per-session form per `COMMON.md` §10.9.** See N8 on the evidence count offered for the discharge.

**11. Mission graph** (`mission-graph-S02.md`) carries all four required graphs; every edge matches the PLAN's concurrency section; the lane, branch, review seats, Grok gate and merge point are all present. No finding. One cosmetic slip: `:67` says S02's CSS may *"declare"* `var(--scrim)` where it means *reference*.

**12. Lane left clean:** `git status --porcelain` = **0 entries**.

---

## Not verified — gaps for the next lens

- **That the author actually loaded the skills declared.** Only a transcript grep settles it (`COMMON.md` §21); I checked the declaration's form and floor coverage, not its truth.
- **Whether B1 also reaches S01.** S01's card consumes `PrivacyPolicyModal.tsx` with `mode="read"`, which has no acknowledgement and no checkbox, so I expect not — but S01's PLAN is outside my scope and I did not read it beyond `S01-R20`'s blockquote.
- **`modalSemantics.ts`'s exported signature against S01's plan.** `PLAN.md:150-162` fixes `useModalSurface(open, surface)`, `backdropCloseHandler`, `prefersReducedMotion`, `openSurfaceCount`. S01's plan was written blind to that file. **Nobody has diffed the two.** See predictions.
- **The Esc stack, the geometry, the pills' scroll, the narrow viewport and the live mode flip in a real browser.** V's steps 1-2, 5, 6, 7, 12, 13, 14. Unverified by every seat so far, correctly conceded in the refutation table's right-hand column.
- **The three-run law on any cluster command.** I ran each once, as the author did; that is the coding seat's obligation.
- **`BASELINE.md` gained an addendum at 20:15, four minutes after ARCH-S02's handoff.** I read the current file. Its new class rule ("a baseline covers every file a plan CONSTRAINS") does not bite this PLAN — every file it orders to stay green (`auth-flow-integration.test.tsx` 17/17, `v2ui-node-runner.test.ts` 2/2) is measured green at base — but the PLAN was written before the rule existed and complies by luck rather than by construction.

---

## Predictions (blind-lens check)

I expect **ARCH-REV-S01 passed the "not a deadlock" reasoning without re-executing React**, because S01's plan contains no checkbox mirror and the reasoning reads airtight on the page — it *is* airtight, and it is not where the defect is. I expect **neither lens looked at the state B1 lives in**, because it is only reachable by composing a C4 pin with a C7 pin, and both review seats are scoped to one slice's plan while the plan's own refutation table is scoped to one step at a time.

The thing I would check first if I had a second run: **`modalSemantics.ts`'s exported surface, across the two plans.** S02 fixes it at `PLAN.md:150-162` and hands it to S01 as "consumed unchanged"; S01's plan was authored in a separate blind session and had to name the same functions to write `S01-R18`. My prediction is that **the two plans give that file different signatures** — most likely S01 assuming a hook that takes the surface's `onClose` plus an `open` flag in one argument, or naming a `useEscapeStack`/`useFocusTrap` pair rather than a single `useModalSurface` — and that neither lens compared them, because each was told to review one slice. One command settles it:
`diff <(grep -A15 'export function useModalSurface\|export type ModalSurface' docs/missions/consent-ui/slices/S02/PLAN.md) <(grep -n 'modalSemantics' docs/missions/consent-ui/slices/S01/PLAN.md)`.
If they disagree, the mission's first artefact ships with an interface its only other consumer cannot call — the same shape as REQ-REV-01 P4, one layer down. I also predict the S01 lens found at least one stale cross-reference of its own, since the S02 seat's DECISIONS↔PLAN drift (B2) looks like a drafting habit rather than a one-off.

**Round 1 of max 3.** A round-4 REWORK would become a V DECISIONS PACKET row; we are two rounds away from that.

`comments read through: 3`
