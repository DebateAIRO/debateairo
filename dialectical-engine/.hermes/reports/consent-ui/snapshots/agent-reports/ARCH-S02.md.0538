# ARCH-S02 — self-report (mission `consent-ui`, ticket `t_50321020`, architecture seat)

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

**Seat:** ARCH-S02, Claude Opus 5, one session, no rework round. **Ran** 2026-09-06 ~19:45-21:0x
EEST. Main tree `2b670d30` / `dev` / 90 dirty (pre-existing, other missions, untouched). Lane
`.worktrees/consent-s02/dialectical-engine` @ `2b670d30` / `slice/consent-s02` / **0 dirty
before and after**. Read-only in the lane; no git write anywhere; `SPEC.md` untouched.

**Delivered:** `slices/S02/PLAN.md` (69 steps, 9 clusters, 24/24 trace both ways, refutation
table with 69 rows) · 30 appended `DECISIONS.md` lines · `mission-graph-S02.md` · 5 appended
`TOOLING-TRAPS.md` entries · this file.

---

## 1. The finding that matters most: three defects were sitting in the ENVIRONMENT, not in the documents

Three review rounds, two blocking findings each in rounds 1 and 2, and a PASS in round 3 — all
of them about **React's checkbox event routing**. Everyone was looking at the same 40 lines.
Meanwhile, in the same test environment, waiting for the first coding seat:

| Fact | Measured | What it would have cost |
|---|---|---|
| `window.matchMedia` does not exist in jsdom 30.0.1 | `typeof` → `undefined` | Every render test that mounts the modal throws a `TypeError` naming a DOM API. The seat reads it as an environment bug, not a design bug. ~1 round. |
| `Element.prototype.scrollIntoView` does not exist | `typeof` → `undefined` | Every jump-pill click throws. Same misattribution. ~1 round. |
| `pnpm exec vitest run <existing> <missing>` exits **0** | `Tests 17 passed (17)`, `Test Files 1 passed (1)` | A cluster command naming a file the seat never wrote reports GREEN. **This one is worse than a round: it does not fail, it lies.** |

**Cause, and it is the same cause as B2/B4/B5:** the mission had executed React semantics
(three probes, four idioms, four implementation variants) and had executed **nothing about the
DOM APIs the new components would call**. The review lens correctly predicted "the next defect
is the Esc stack, because nobody has run it" — right principle, one example short. The class is
not "the Esc stack"; it is **every runtime capability the plan assumes and no probe has
touched**.

**Upgrade, concrete and cheap:** a mission's baseline should include an **environment
capability probe**, not only a suite baseline. Twenty lines, run once at intake, printing
`typeof` for every DOM/browser API the design implies — `matchMedia`, `scrollIntoView`,
`IntersectionObserver`, `ResizeObserver`, `getComputedStyle`, `Element.animate`,
`structuredClone`, `crypto.randomUUID` — plus whether the scroll metrics are writable. The
design of record names the capabilities; the probe answers them. Cost at intake: ~5 minutes.
Cost when a coding seat finds them: a round each, and the failure blames the wrong thing.

## 2. What repeatedly cost tokens — priced

| Cost | Price | Cause | Fix |
|---|---|---|---|
| **Reading three review verdicts to extract two sections** | ~14k tokens, ~8 min | `REQ-REV-01*.md` total 105 KB. The packet correctly told me to read `## Not verified` and `## Deferred`, which are ~60 lines of the 105 KB — but I had to grep headings first to find them. | **A verdict should end with a `## Residue for the next seat` block, ≤30 lines, that IS the gap list.** r3 nearly does this (`## Pins for the next round`). Make it mandatory and put its line range in the packet. |
| **Re-deriving what already existed in `globals.css`** | ~6k tokens, ~6 min | The SPEC's token mapping names 20 tokens; nothing said which are new. I greped 26 tokens to find that **only 4 of the "five S02 consumes" are new** (`--ok-dot` already exists, twice). | The requirements seat measures token existence once and writes `NEW`/`EXISTS` in the mapping table. One `grep -c` per token. |
| **Reading `SignUpFlow.tsx` and `auth-flow-integration.test.tsx` in full** | ~9k tokens | Unavoidable and correct — I edit-plan both. **But `COMMON.md` §10.5 promises "every pointer to a product file carries a line range" and the packet mostly delivered.** Where it did (`SignUpFlow.tsx:185-188`, `:63`, `:72`) I read 4 lines instead of 205. | Keep doing it. It works. The two files I read whole, I would read whole again. |
| **The `superpowers:brainstorming` human gate** | ~0 tokens, but a real design cost | The skill's entire terminal state is "present the design and wait for an explicit yes". In a fleet seat there is nobody to say yes. `COMMON.md` §10.1 discharges it procedurally, which is correct — but it means the skill's *actual value* (the 2-3 alternatives + trade-offs discipline) lands only if the seat chooses to do it anyway. | **§10.1 should say what to DO, not only what to skip:** "record 2-3 alternatives per contested choice with the reason each was rejected, in DECISIONS". I did that — 9 of my 30 lines carry a `Rejected:` clause — but I did it because I read the skill body, not because §10.1 asked. |

**What did NOT cost tokens, and is worth copying:** `.hermes/reports/consent-ui/probes/`. I ran
`v3-r17-cases-probe.mjs` unmodified and got a 6×4×3 matrix in 40 seconds that would have cost
~30 minutes to write. REQ-REV-01 r3 said the same thing about the same directory. **This is the
single highest-leverage artefact the mission has produced.** Promote it: every mission gets a
probe directory, every packet names it by absolute path, and every seat that writes a probe
worth ≥10 minutes copies it there at exit.

## 3. What I nearly got wrong

1. **I nearly bundled `modalSemantics.ts`, `PrivacyPolicyModal.tsx` and `privacyPolicy.ts` into
   one first cluster** — the orchestrator's own hint in the packet (§A2: "a data/storage or
   content module first, then the rendering component(s)"). It would have been wrong. The
   helper is what S01 is *blocked* on; bundling it with a component that takes an hour longer
   would have kept the other lane blocked for that hour, in a mission whose whole point is two
   parallel lanes. **A hint in a packet is an anchor, and I nearly anchored on it instead of
   measuring the dependency.**
2. **I nearly wrote "S02 is blocked until S01's tokens land."** Both SPECs and the packet say
   the dependency runs both ways. It reads like a deadlock. It is not: the helper and the data
   module reference no token, and S02's CSS may reference `var(--scrim)` before S01 declares it
   because the token test asserts set equality over *declarations* and the colour-literal gate
   scans for literals — a `var()` is neither. **I only found this by reading both assertions in
   `t9-mode-tokens.test.ts` rather than the prose about them.** Had I not, the merge would have
   been an early blocking step instead of the last one, and the lanes would have serialized.
3. **I nearly pinned `opacity: .6` for the disabled button** because it is the round number.
   It fails 4.5:1 in Terracotta at 4.13. Two minutes of arithmetic moved it to `.65` (4.79).
4. **I nearly wrote a second statement of the one-idiom rule** in the refutation table,
   alongside REQ-01's. Two formulations of one rule is literally the B4 defect. I deleted mine
   and replaced it with a pointer plus the step list.

## 4. Dead ends — do not re-derive these

- **`IntersectionObserver` for the scroll gate.** Rejected by REQ-01 (jsdom implements none);
  I re-confirmed the reasoning and did not re-derive it. Do not propose it.
- **`createPortal` for the modal.** Rejected: 0 hits under `apps/ui`, and the fixed scrim
  escapes its ancestors anyway (measured — no auth-shell ancestor declares `transform`,
  `filter`, `perspective`, `will-change` or `contain`). **The fallback is pre-authorized in
  DECISIONS** so that if V sees clipping it costs one import, not one round.
- **A React context provider for the Esc stack.** Rejected: the two surfaces are mounted from
  different components in different slices; a provider would force them into one tree.
- **A visually-hidden input + sibling `<span>` square.** Rejected: `appearance: none` on the
  real input is one element with native focus, native `Space`, native `required` and one focus
  ring.
- **Making case 5 do the controlled-inputs job.** Measured green under all four variants by
  two independent seats. It documents the toggle and detects nothing. Case 6 is the pin.
- **Business facts in the policy** (retention periods, the sub-processor URL, the controller
  entity). Three rounds have marked these UNVERIFIED. Do not re-open.

## 5. Where THIS packet was unclear — exactly

1. **§A2 asks for "ONE verification command" per cluster; §5(e) asks for "the typecheck delta
   and the t9 gate delta in every cluster's verification command".** These conflict: the lawful
   guard asserts a GREEN summary with no `failed`, and both of those gates are RED at base by
   design. Folding them in makes every cluster command permanently red. I resolved it —
   standing gates run and reported per cluster, outside the guard, classified under A9 — and
   recorded the resolution in DECISIONS. **Cost ~10 minutes of deciding whether I was allowed
   to disobey half a charge.** The packet should say "reported by every cluster" rather than
   "in every cluster's verification command".
2. **§A9's BROKEN signature list contains `cannot find module`**, which is the *expected* RED
   for every step that creates a test importing a module the same step creates. `TOOLING-TRAPS`
   already draws this distinction for `no test files found` but not for `cannot find module`.
   I wrote the discriminator into the PLAN (it is BROKEN unless `<X>` is the module the step
   itself creates). **The packet should carry it, because every TDD-first cluster hits it.**
3. **§1 says "cwd: the main tree".** The harness's session cwd was a *different lane*
   (`.worktrees/consent-s01/...`). Nothing went wrong because every command I ran carried an
   absolute `cd` prefix — but a seat that trusted the packet's cwd and ran a background command
   would have run it in another seat's lane. **Packets should say "assume no cwd; prefix every
   command with an absolute `cd`", and the launcher should not disagree with the packet.**
4. **§6 hands me N12 as "R17's case text governs"** — a correct ruling, delivered with the
   pointer and the reason. **This is the best-designed part of the packet** and the model for
   the rest: the residue arrived as a ruling I could execute, not as a finding I had to
   adjudicate. Compare item 1, which arrived as two charges I had to reconcile.

## 6. How to make this more of a one-prompt machine — five changes, in order of payoff

1. **Environment capability probe at intake** (§1). The only reason B2/B4/B5 cost three rounds
   is that React's behaviour was *assumed* until someone ran it. Three more assumptions were
   sitting one layer down, in the DOM. A 20-line probe at intake answers a whole class at once.
   **This is the highest-payoff change on this list.**
2. **Make the acceptance-command idiom a repo artefact, not a convention copied per plan.**
   Seven variants of "a command that looks like verification and verifies nothing" are now in
   `TOOLING-TRAPS.md`, and variant 7 was introduced by the *correct* fix for the earlier ones
   (a multi-file command is what you write once you stop writing one file per cluster). Ship
   `tools/verify-cluster.sh <n> <files…>` with the hostile matrix beside it, and let every PLAN
   cite it instead of re-typing eight lines that can each be wrong. **A convention copied
   without execution inherits whatever was wrong with its first use** — this file says so, and
   it happened again here.
3. **A verdict ends with a ≤30-line `## Residue for the next seat`.** Every architecture seat
   reads every verdict to extract two sections. Three verdicts, 105 KB, ~60 useful lines.
4. **The requirements seat marks each token `NEW` or `EXISTS`, measured.** One `grep -c` per
   token at authoring time; it removes a whole re-derivation from every downstream seat and it
   caught a real imprecision here (four new tokens, not five).
5. **Put the probe directory in every packet, by absolute path, with one line on what each
   probe proves.** Mine did (§5's B2/B4-class prediction) and it paid for itself twice: once
   for R17's six cases, once as the model for the guard's hostile matrix.

## 7. What I could not do, and said so

- **I ran no product test beyond charge A9's proof** — architecture §4 forbids it. Every cluster
  command was run once, at base, to prove it executes and discriminates. I did **not** run the
  three-run law; that is the coding seat's.
- **Rendered geometry, the Esc stack in a real browser, and the live mode flip are UNVERIFIED
  by me and by everyone so far.** They are V acceptance steps 1-2, 5, 7, 12, 13 and 14, and
  they are in the refutation table's right-hand column, not in a test that pretends to cover
  them.
- **Two SPEC imprecisions I found and did NOT repair** (the SPEC is frozen; both are recorded
  in DECISIONS with their measurements): R22 says S02 consumes five S01-declared tokens when
  `--ok-dot` already exists; R03 says both inputs are "toggled by `Space`" when `Space` on the
  privacy input takes R05's modal path. **The second is contested and is routed up with my
  recommendation** — it is the only place where I think the frozen text and the intended
  behaviour genuinely differ, and it is a keyboard-only route around the read gate if resolved
  the other way.
- **`superpowers:receiving-code-review` — not loaded this session; not needed, because nothing
  was contested with me.** Per-session declaration, `COMMON.md` §10.9.

---

# Part II — ARCH-S02-REWORK-R1 (rework round 1 of max 3, fresh session, ticket `t_3160e2d5`)

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

**Part I above is my predecessor's and is not edited.** This part continues it, per
`COMMON.md` §5 and the packet's instruction ("continue it — Part II — never rewrite it").

**Seat:** ARCH-S02-REWORK-R1, Claude Opus 5, one session, round 1 of max 3. Main tree
`2b670d30` / `dev` / 90 dirty (pre-existing, other missions, untouched). Lane
`.worktrees/consent-s02/dialectical-engine` @ `2b670d30` / `slice/consent-s02` / **0 dirty
before and after**. Read-only in the lane; no git write anywhere; `SPEC.md` md5
`ad060bda81db71f00f4c70b1dbf63f2f`, unchanged.

**Answered:** `reviews/ARCH-REV-S02-r1.md` — B1, B2, N1-N8, and the three orchestrator notes.
**Delivered:** `PLAN.md` 69→72 steps with the A9 section fully re-run and re-proved · 14
appended `DECISIONS.md` entries · the mission graph updated · two new probes · this part.

---

## 1. The finding that matters most: TWO of the verdict's own remedies were measurably wrong, and both would have shipped

This is the second time in this mission that **a correct diagnosis carried an incorrect
prescription**, and it is now the single most expensive recurring pattern in the loop.

| Remedy, as the verdict worded it | What I measured | What it would have cost |
|---|---|---|
| **B1 (1):** "C7's UNCHECKED branch drives the mirror back to `false`" — i.e. `setPrivacyMirror(false)` beside `preventDefault()` | **React fires the ROW's `onClick` BEFORE the INPUT's `onChange`.** The `onChange` then runs with `checked=true` and overwrites it. Trace: `onClick(mirror=false,domChecked=true) -> onChange(checked=true,defaultPrevented=true)`. Measured over 8 routes: still desynced on open-by-square, `register()` still fires on a double click. | A full round. The seat implements the remedy exactly as told, every new assertion it was also told to add goes GREEN on five of six routes, and B1 ships **believing it was fixed** — the worst possible failure mode, because the fix's own test suite certifies it. |
| **N3:** "add a step that dispatches `Space` on `adult-affirmed` and asserts it toggles" | **jsdom 30.0.1 does not implement Space-activates-checkbox.** Focused checkbox, `keydown`+`keypress`+`keyup` with `key:" "`, `code:"Space"`, `keyCode:32` → `checked=false`, `clickEventsSeen=0`. A real `.click()` on the same element → `checked=true`, `clickEventsSeen=1`. | A step **RED forever against a correct implementation** — REQ-REV-01 B5's defect exactly, and the fourth time this mission has shipped an idiom that was never executed. |

**The cause is structural, not personal, and it is worth stating precisely.** The reviewer did
the hardest thing right: it rebuilt the component from the plan's prose and ran it, which is how
B1 surfaced at all. It then wrote the remedy **without running the remedy**. `COMMON.md` §10.10
says *"a finding proved by a probe is discharged only by re-running that probe against the
fix"* — that duty is placed entirely on the AUTHOR. Nothing places it on the reviewer, so a
reviewer who has a working harness in hand, three lines from the answer, is not required to
spend those three lines.

**Upgrade, and it is cheap because the harness already exists:** *a reviewer who proves a
finding with a probe MUST run its own proposed remedy through that same probe and paste the
result, or mark the remedy `UNVERIFIED — direction only`.* Two outcomes, both good: the remedy
arrives verified, or the author is told it is a direction and not an instruction and does not
spend a round discovering it. **Cost: one probe re-run, seconds. Benefit measured here: two
rounds avoided in one verdict.**

**The deeper lesson, which is the same one Part I §1 draws one layer up.** Part I found that
three defects were sitting in the ENVIRONMENT, not the documents, and asked for an environment
capability probe. This round found that **the environment does not only surprise you about what
EXISTS (`matchMedia`, `scrollIntoView`) — it surprises you about ORDER**. Nobody had asked
"which of React's two handlers runs first?", and the entire B1 defect and the entire failure of
its remedy live in that one fact. **Add ordering to the intake probe**: for every event a design
implies, print the observed handler order and what each handler sees. Six lines. It is the
difference between `preventDefault` being a fact and being a hope.

## 2. What repeatedly cost tokens this round — priced

| Cost | Price | Cause | Fix |
|---|---|---|---|
| **Reading `PLAN.md` (1,490 lines) to change ~40 of them** | ~24k tokens, ~12 min | The plan is correctly long (V's no-line-cap ruling), but a rework seat needs *the diff surface*, not the document. The verdict gave excellent line pointers; I still had to read whole sections around each to edit safely. | **A verdict should carry an `## Edit surface` block: `path:line-range → finding id`, one line each.** The reviewer already computes it — every finding cites its lines. Emitting it as a machine-readable list would let a rework seat open exactly those ranges. ~15 lines in the verdict; ~20k tokens saved per rework round, every round, in every mission. |
| **Re-running A9 for nine commands, twice, plus 3 gates and 15 mutants** | ~9 min wall-clock, ~6k tokens | Correct and non-negotiable (`COMMON.md` §10.16). But **round 0 also ran A9, and its command set was invalidated by a single non-blocking finding (N7).** | Cheap and structural: **the cluster command table should be generated from one list of `(cluster, files)` tuples, and A9 should be a script that reads that list.** Then a file-count change costs one line and a re-run, not a hand-edit of a markdown table plus a hand-edit of the script plus a chance to disagree. This is Part I §6.2's `tools/verify-cluster.sh` proposal, and it is now measured twice. |
| **Deciding whether to obey a remedy I had measured to be wrong** | ~15 min, ~4k tokens | `heartbeat-protocol` §2.7 says "say what you cannot do"; `receiving-code-review` says push back with technical reasoning; the packet says "exactly the remedies in the verdict" and "N7 is mandatory". Three instructions, one of which is unsatisfiable. | **A packet that hands down remedies should say which are BINDING (the finding's substance) and which are ADVISORY (the suggested mechanism).** The substance of B1 — the mirror must not diverge — is binding and I honoured it. The mechanism was advisory and wrong. **One word per remedy would have saved the deliberation.** |
| **The trace probe reporting `<UNDEFINED>` for three real steps** | ~6 min, ~2k tokens | `arch-rev-s02-trace.py` extracts a step's title with a regex requiring the title to close on the SAME line. Two of my new steps wrapped their titles, as `S02-S49` already did before I touched it. | The probe is right to be strict and I conformed the file rather than loosening the probe — **a formatting convention a tool enforces is worth more than one a human remembers.** But it should be STATED: "a step header's title closes with `**` on its own line" belongs in `PLAN.md`'s §How to read a step, so the next author does not learn it from a false `<UNDEFINED>`. |

**What did NOT cost tokens and is worth copying, again:** `.hermes/reports/consent-ui/probes/`.
The reviewer's two probes were runnable unmodified; the corrected copies took **four edited
lines between them**, and the diff is what proves the fix is a component change and not a probe
change. **A probe directory whose files can be copied and mutated in four lines is the highest
form of this artefact.** Part I said this. It is still true and it paid again.

## 3. What I nearly got wrong

1. **I nearly implemented B1's remedy exactly as worded.** It is the natural reading, it is one
   line, and the verdict's confidence was `high` and deserved to be. What stopped me was
   `superpowers:test-driven-development`'s rule applied to a *plan*: measure the failure before
   writing the fix. **Six candidate mechanisms × 8 routes cost me 20 minutes and caught it.**
   Had I written the one-liner and then run the two probes I was told to run, the probes would
   have caught it too — which is the real argument for §10.10 and the reason it exists.
2. **I nearly wrote the microtask fix (`queueMicrotask` resync), which produces the correct end
   state.** Only when I instrumented RENDERS rather than end states did I see it paints **one
   frame with `Create account` enabled while the box is empty** — the honesty defect in
   miniature, invisible to every end-state assertion in the plan. **Assert on end state, choose
   on intermediate states.**
3. **I nearly treated member 2 (the dismissal resync) as the fix.** It is not: measured, with
   member 1 in place it changes nothing observable. Saying so in DECISIONS is what stops a
   future seat deleting member 1 and keeping member 2 because member 2 "looks like the fix".
4. **I nearly fixed only `C4` and `C7` for N7.** The class is "clusters sharing a component
   file", and `C5→C6` is the other member. Nobody would have found it before `C9`.
5. **I nearly left `ADR-0020` as "the next free number".** It is not — `0019` is free on disk,
   the orchestrator allocated it to S01, **and the halted `translation` mission reserves `0019`
   in twelve places.** A number nobody re-measures is a collision waiting for a merge.

## 4. Dead ends — do not re-derive these

- **`setPrivacyMirror(false)` in the row handler.** Measured dead (§1). Do not propose it.
- **A `useEffect` that resyncs the mirror from the DOM after every render.** Measured dead:
  React flushes the discrete update inside the dispatch, before jsdom's canceled-activation
  revert, so the effect reads `checked === true`.
- **`queueMicrotask` resync.** Correct end state, one enabled frame, rejected (§3.2).
- **Dropping `privacy-accepted`'s `onChange` mirror.** Measured to break the
  acknowledge-then-untick route, and it contradicts frozen `SPEC.md` R17 point 2.
- **Dispatching `Space` in jsdom to toggle a checkbox.** `clickEventsSeen=0`. There is no stub
  worth writing: stubbing the activation *is* `.click()`, which is what the two new steps do.
- **Folding the standing gates into a cluster guard.** Part I settled it; it is still true and
  `COMMON.md` §10.20 is now the law. Do not re-open.

## 5. Where THIS packet was unclear — exactly

1. **The `allowed` list names new probe files as `arch-s02-rework-r1-*.mjs`, and §2 mandates
   running every command "once from a `.sh` file under `/bin/bash`".** A `.sh` is not a `.mjs`.
   I put it in scratch, which the same list allows, and said so — but the two clauses were
   written by the same hand in the same packet and disagree. **Cost ~5 minutes of deciding
   whether I was allowed to create the file the packet requires me to run.** Wording: name the
   glob `arch-s02-rework-r1-*` with no extension.
2. **"Exactly the remedies in the verdict" vs `heartbeat-protocol` §2.7.** See §2 above. This
   is the single most valuable one-word change available to the packet template.
3. **`N7 is mandatory` — and it is the best-designed line in the packet**, for the same reason
   §6's N12 ruling was in round 0: it removed an adjudication I would otherwise have had to
   perform, and it happened to be the finding that closes B1's structural gap. **The pattern
   worth generalising: when the orchestrator KNOWS a non-blocking finding is load-bearing, say
   so; "non-blocking" otherwise reads as "optional" no matter what §2.2 says.**
4. **The packet told me to add the mirror assertion to six steps and did not say what makes it
   discriminate.** `Create account`'s `disabled` is computed from BOTH mirrors, so the
   assertion is vacuous unless `adult-affirmed` is ticked first — which the verdict's own
   remedy text does include (`field("adult-affirmed").click()`), but as an incantation rather
   than with its reason. I wrote the reason into the plan once, above the six steps, because a
   seat that does not know WHY the extra click is there will drop it as noise.

## 6. How to make this more of a one-prompt machine — four changes, in order of payoff

1. **A reviewer must run its own remedy through its own probe, or mark it `UNVERIFIED —
   direction only`.** (§1.) Highest payoff on this list by a wide margin: it is seconds of work
   and it caught two would-be rounds in one verdict.
2. **Verdicts emit a machine-readable `## Edit surface`** — `path:line-range → finding id`.
   (§2.) The reviewer already has the data; the rework seat currently re-derives it by reading.
3. **Generate the cluster command table and the A9 script from ONE list of `(cluster, files)`
   tuples.** (§2.) Twice now a command-set change has meant hand-editing a markdown table AND a
   shell script, with a chance to disagree between them. This is Part I §6.2, measured a second
   time — the second measurement is what should promote it from suggestion to task.
4. **Add HANDLER ORDER to the intake environment probe.** (§1.) Part I asked for `typeof` on
   every DOM API the design implies. Add: for every event the design implies, print the observed
   order of the handlers involved and what each one sees (`checked`, `defaultPrevented`). B1 and
   the failure of its remedy are both one line of that output.

## 7. What I could not do, and said so

- **I ran no product test beyond charge A9's proof** — architecture §4. Each cluster command was
  run at base, twice (inline and from the `.sh`), never three times; the three-run law is the
  coding seat's.
- **The two new steps `S02-S70`/`S02-S71` do NOT establish that a browser's `Space` reaches the
  activation behaviour.** No jsdom test can. It is V acceptance step 14 and it is also the
  observation that settles the contested row `DECISIONS.md:99` routes to V.
- **`S02-S69`'s three commands require a dev stack serving this branch**, which is not this
  seat's to arrange. The step says so and tells a seat that cannot arrange it to report
  `UNVERIFIED` rather than guess.
- **Rendered geometry, the Esc stack in a real browser, the pills' scroll, the narrow viewport
  and the live mode flip remain UNVERIFIED by every seat.** They are V's, and they are in the
  refutation table's right-hand column rather than in a test that pretends to cover them.
- **I did not diff `modalSemantics.ts`'s surface against S01's PLAN** — the reviewer's own
  top prediction. It is outside my `allowed` list to change either plan's copy, and S01's
  rework is running in parallel. What I CAN state, and did, in one line for S01 to cite:
  **the surface did not change this round.**
- **The `ADR-0019` collision with the halted `translation` mission is reported, not resolved.**
  No file exists at either number; whichever mission writes first takes it.

---

# Part III — ARCH-S02-REWORK-R2 (rework round 2 of max 3, fresh session, ticket `t_d16a1656`)

*Appended, never rewriting Parts I or II. Answers V's standing question for this round only.*

**Round scope:** one blocking finding (B3), one carried-over non-blocking member (N6), two new
non-blocking (N9, N10), one orchestrator correction (ADR-0020 → ADR-0022). Everything else in
`ARCH-REV-S02-r2.md` was closed by the reviewer's own re-runs, and I re-opened none of it.

## 1. The finding that matters most: a correct fix is the only kind of fix that can break something else

B3 is not a mistake by the round-1 seat. It is the second-order consequence of that seat doing
its job. **The class is: "a defect can be PROPPING UP the assertions that are supposed to be
checking it, and repairing the defect is what makes them fall over."**

The mechanics here, priced exactly:

- Round 0 wrote R17's six cases verbatim from a frozen SPEC and MEASURED them green — against a
  component with the R17 mirror and **no row click rule**, because that is the component cluster
  C4 leaves behind. The measurement was honest and the conclusion ("all six PASS under the
  pinned variant") was true **of that stage**. Nothing in the plan recorded the stage.
- Round 1's B1 fix made the mirror record the settled value. Correct, independently
  re-measured by the reviewer over 12 routes. **It also removed the desync that was making cases
  4 and 5 pass.** Measured: `STAGE c7-unfixed: 6/6` vs `STAGE c7: 4/6`.
- Round 1's N7 chain rule put `consent-signup-gate.test.tsx` inside C7's own verification
  command. Also correct. **It is what turned a latent contradiction into a deadlock**, because
  C7's boundary row forbids C7 from editing that file.

Three correct changes composed into a blocking defect. **Nobody could have seen it earlier and
the record should say so** — a review that treats B3 as a round-1 quality failure will learn the
wrong lesson and slow the next seat down.

**What generalises, and it is the cheapest possible check:** whenever a plan adds a chain arm
that pulls an earlier cluster's test file into a later cluster's command, **walk the earlier
file's assertions one by one and mark each "survives / does not survive" the later cluster's
change.** Per case, never per cluster. Six rows of a table would have caught B3 in round 1 at a
cost of about ten minutes. It cost a full review round and a full rework round instead — call it
two seat-cycles, roughly 4-5 hours wall-clock across three sessions.

## 2. What repeatedly cost tokens this round — priced

- **The N6 counting rule, three iterations, ~25 minutes.** I wrote the sweep claim with the
  obvious guard (`grep -c ':324\|:448\|:466' PLAN.md` → 0), ran it, and got **7**. The guard is
  unsatisfiable by construction: the authoritative step legitimately keeps the numbers as a
  declared reading aid, and the correction paragraph must quote them to say they were removed.
  Writing the fix pushed the raw count UP to 9. I rewrote the rule as "lines carrying no
  qualifier from a fixed vocabulary", got 2, then 1, then 0 — the residual failures were both
  **line-wrapping**: a quoted string wrapped onto a second line, leaving that line unqualified.
  **This is the single most reusable thing I learned this round and it is now in TOOLING-TRAPS.**
  It also vindicates COMMON §10.10's corollary in the strongest possible way: I would have
  shipped "0" as an unmeasured claim, and it was 7.
- **Deciding WHERE the two moved cases live, ~20 minutes of reading before one line of writing.**
  Five candidate homes, and four of them are wrong for reasons that are only visible after
  reading the boundary table, the chain rule, the trace probe's grouping logic and the per-step
  cumulative acceptance counts. The packet asked the right question ("check whether cases 4/5
  must move cluster") but the answer needed four artifacts.
- **The trace probe's grouping is by DOCUMENT POSITION.** I nearly changed only the steps' body
  sentences. That would have left the probe printing `S02-C4 8 · S02-C7 11` while every readable
  statement said 6 and 13 — a self-contradiction manufactured inside the round that fixes one.
  Reading `arch-rev-s02-trace.py:43-53` cost 2 minutes and saved a finding.

## 3. What I nearly got wrong

- **I nearly pasted "0" for the N6 sweep without running it.** The number felt obviously right.
  It was 7. If a count can be felt, it can be wrong; §10.10's corollary is not bureaucracy.
- **I nearly left `S02-C4`'s mutant-class row saying "a `disabled` hard-coded `true`
  (S02-S28 catches it)".** After the move that sentence is false, and a false mutant-class cell
  is worse than an empty one — it tells a coding seat a mutant is covered when it is not. Both
  cluster rows now carry the loss and the gain explicitly.
- **I nearly modelled the acknowledgement route in the probe WITHOUT the scroll gate**, copying
  the reviewer's `remedy-check.mjs`, which does not model it. My step text says "satisfy the
  scroll gate". A probe that skips a clause of the text it is meant to prove is exactly the
  §10.10 defect. Modelling it cost eight lines.
- **I nearly renumbered `ADR-0019` → `ADR-0021` in C1's `forbidden` column while I was in there.**
  It is S01's name and outside this packet. Reported as a residual instead.

## 4. Dead ends — do not re-derive these

- **There is NO route to "both boxes checked" that works at both the C4 stage and the C7 stage.**
  Measured: at C4 there is no modal, so the acknowledgement route throws; after C7 a bare click
  cannot tick, and an assignment never reaches React (`btnDisabled=true`). The cases must live
  where the modal exists. Do not look for a stage-invariant idiom; there isn't one.
- **Keeping the literal case and exempting C7 from the chain arm does not work.** The only rule
  satisfying the literal case gives `ticked box=true btnDisabled=false acknowledgements=0
  register()=1` — a registration with the policy never opened. It also re-opens N7.
- **Letting C7 append two cases to C4's test file is not a shortcut.** It requires amending the
  "RUNNING a test file is not WRITING it" boundary, and it makes a red in that file ambiguous
  between "C7's new case" and "C7 regressed C4" — destroying the discrimination the chain arm
  exists to provide.
- **`STAGE c7-unfixed` no longer discriminates anything** once the route is corrected (6/6). It
  is retained as the reviewer's contrast control, not as a guard.

## 5. Where THIS packet was unclear — exactly

- **§1 says "change ONLY the case-4/5 route" in the copied probe; §2 says "No other line of the
  PLAN changes".** Both are under-specified against what B3 actually requires. The corrected
  route needs an acknowledgement control and a scroll gate the reviewer's harness never modelled
  — that is a component change, not a route change — and correcting the two cases forces edits
  to the cluster map, the refutation rows, the six-cases intro, the pasted trace counts and the
  mission graph, none of which §1 lists. I made all of them and declared each. **Suggested
  wording: "change the case-4/5 route and whatever the harness needs to exercise it, declared in
  the header" and "no line unrelated to B3/N6/N9/N10/ADR changes; the artifacts B3 makes stale
  are in scope and are declared."**
- **§1's "adjust the chain-rule `<n>` counts and the `Test Files` arm" pointed at the wrong
  numbers.** Measured: **no** `Test Files` arm and **no** chain-rule file count changed — C4
  still runs 4, C7 still 5, C9 still 10. What changed is the per-cluster STEP counts (8→6,
  11→13) and the per-step cumulative `Tests <n> passed (<n>)` acceptances, which the packet does
  not mention. I spent time looking for a file-count change that does not exist. **The packet
  correctly anticipated a ripple; it named the wrong axis.**
- **GOOD, and the model for the rest:** §1 named the probe by absolute path and stated the exact
  string to paste (`STAGE c7: 6/6 pass`). There was zero ambiguity about what would discharge
  B3. Compare the two items above, where the ambiguity was about SCOPE. **A packet that pins the
  evidence exactly should pin the blast radius equally exactly.**
- **The V-18 row was already written when I arrived, with the default I was to plan.** That is
  the strongest thing in this packet: I never had to decide whether a frozen-SPEC contradiction
  was mine to resolve. It cost the orchestrator one row and saved this seat a whole deliberation.

## 6. How to make this more of a one-prompt machine — four changes, in order of payoff

1. **Make "chain arm added → per-case survival table" a standing law, not a lesson.** Any round
   that adds a chain arm owes a table with one row per assertion in the pulled-in file and a
   survives/does-not-survive verdict. This is the whole of B3, and it is ten minutes.
2. **Ban raw-occurrence counts as sweep evidence.** A sweep guard must be stated as a PROPERTY
   with a qualifier vocabulary, must report the raw count without asserting it, and must be fed
   the defect's own text to prove it returns non-zero. Round 1's "the sweep is complete" and my
   own first "0" are the same failure one round apart.
3. **Have the packet name the artifacts a finding makes STALE, not just the artifact it fixes.**
   For B3 that list is: the cluster map's two step columns and two mutant columns, the six-cases
   intro, the refutation rows, the pasted trace output, and the mission graph's two nodes and
   change table. A seat rediscovers that list every time; the orchestrator can compute it once
   with a grep for the step ids.
4. **Pin the trace probe's grouping semantics in the PLAN itself**, one sentence beside the
   pasted output: "grouped by the `### Cluster` heading a step sits under". Without it, every
   future cluster move is a coin flip between editing text and editing headings.

## 7. What I could not do, and said so

- **I ran no product test and no cluster command.** Architecture §4; the lane was read-only and
  is `0` porcelain before and after. The three-run law on the cluster commands remains the
  coding seat's.
- **`S02-S28`/`S02-S29`'s new acceptance counts (`Tests 12 passed (12)`, `Tests 13 passed (13)`)
  are derived from the plan's own cumulative numbering, not measured** — the file
  `consent-signup-modal.test.tsx` does not exist yet. Same status as every other cumulative
  count in that cluster, and the `Test Files 5 passed (5)` arm is what actually guards the file
  set.
- **The residual `ADR-0019-consent-storage-contract.md` in C1's `forbidden` column** is S01's
  name and outside this packet. Reported, not repaired.
- **Nobody has still run `S02-S52`'s focus question** (the reviewer's own "thing I would check
  first"): whether the acknowledgement returns focus to the input or to the element that opened
  the surface, when the modal was opened by clicking the row's text span. It is outside B3 and I
  did not widen scope to it. **It is the most likely next defect in this cluster.**
