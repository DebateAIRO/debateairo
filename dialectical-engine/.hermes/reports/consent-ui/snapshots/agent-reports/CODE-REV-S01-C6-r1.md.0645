# Self-report — CODE-REV-S01-C6, round 1 (mission `consent-ui`)

**Seat:** CODE-REV-S01-C6 · reviewer (`heartbeat-reviewer`) · Opus 5, fresh blind session
**Work reviewed:** CODE-S01-C6, ticket `t_f46592b6`, commits `abcc388d` + `ab449cba` on
`slice/consent-s01`, HEAD `ab449cba`, base `92828aa5`.
**Worktree:** `.worktrees/rev-s01-c6/dialectical-engine`, detached at `ab449cba`, porcelain 0
at CLAIM and 0 at handoff. **Verdict: REWORK** (B1) — full text in
`docs/missions/consent-ui/reviews/CODE-REV-S01-C6-r1.md`.

**SKILLS LOADED:** `superpowers:using-superpowers`, `heartbeat-protocol`,
`heartbeat-reviewer`, `superpowers:verification-before-completion`,
`superpowers:systematic-debugging`, `superpowers:receiving-code-review`.

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

---

## 1. The one I NEARLY got wrong, and what it cost

**I manufactured a false finding against the author inside my first ten minutes, and the
only reason it did not reach the verdict is that I re-ran it under `/bin/bash`.**

My second measurement of the run was the `n_s02c` arm the packet told me to settle. I wrote
it the obvious way:

```
P="apps/ui/components/consent/modalSemantics.ts apps/ui/…/PrivacyPolicyModal.tsx …"
s02c=$(git log --oneline "$s02tip"..HEAD -- $P)
```

It printed **`n_s02c=0` against the moved ref** — i.e. the exact opposite of the author's
claim, and a clean, quotable "the author's RED does not reproduce; their handoff overstates
the defect". The Bash tool's shell is **zsh**, `$P` did not word-split, git received ONE
argument naming a file that does not exist, matched nothing, printed nothing and **exited
0**. Re-run from a `.sh` under `/bin/bash` with literal paths: **1**, and the commit counted
is `92828aa5`, exactly as the author said.

- **CAUSE:** not zsh. The cause is that **a vacuous git query is indistinguishable from a
  true negative**: no error, no warning, exit 0, empty output. Every other trap in this
  mission's file (`grep` on a glyph, the escaped `|`, multi-path vitest) has the same
  signature — *the silent zero*.
- **PRICE:** ~4 minutes and two tool calls for me. Priced properly it is **one review round**:
  had I written it up, the author would have spent a round refuting a finding produced by my
  shell.
- The author hit the SAME class the same night (their CORRECTION), and `COMMON` §10.40
  already records it from CODE-S02-C7's F4. **Three seats, one night, one class.** The
  amendment below is the one thing I would change first.

**UPGRADE — make the silent zero impossible, not documented.** §10.40 is a *warning*; a
warning is discharged by remembering. Replace it with a **shape rule** in COMMON §4:

> Any command whose result is a COUNT of nothing carries a **positive control in the same
> block**: a second invocation, differing in one input, that MUST return non-zero. A count
> reported without its control is `UNVERIFIED`.

For the arm above the control is two lines: run it against `44744d8d` (expect 0) *and*
against the branch tip (expect 1). Both numbers together are a measurement; either alone is a
coin flip. This generalises the mission's existing "validate on known-GOOD and known-BAD
input" (§10.16b) from *acceptance commands* to **every count anyone writes down**, which is
where all three of tonight's instances lived.

## 2. What the packet got RIGHT, precisely, and why it mattered

Credit where it is measurable, because the next packet should copy it:

- **§4 handed me the author's claims as claims to REFUTE, with the numbers attached.** I did
  not have to reconstruct what to check. Every one of the seven charges was answerable.
- **Every `path:line` in the packet resolved.** I checked all six: `CookieConsent.tsx:182-183`,
  `CookiePreferencesCard.tsx:97-101`, `:125`, `modalSemantics.ts:165-168`, `CookieBar.tsx:61`,
  `CookieConsent.tsx:87,:130` at `abcc388d`. §10.24 is working. **One drift only**
  (`PrivacyPolicyModal.tsx:114,:118` → measured `:118,:122`), and it was inherited from the
  author's handoff rather than produced by the orchestrator — see §4.
- **"Build your own fixture, then swap the elements and show the inversion"** (§4 DOM ORDER)
  is the single highest-value sentence in the packet. It converted a *reading* task into an
  *experiment* and produced the mutant matrix in §3 below.
- **The packet snapshot** (§10.32) was byte-identical to the live packet — I diffed it. That
  is thirty seconds that removes a whole category of doubt.

## 3. Where the review time actually went (and the one thing that found the blocker)

| Activity | Wall-clock | Yield |
|---|---|---|
| Reading (COMMON, INSTRUCTIONS, BASELINE, PLAN, SPEC, packet, diff, handoff) | ~22 min | context, 4 packet findings confirmed |
| Re-running CMD-C6 / CMD-C5 ×3 × two shells | ~6 min | reproduced the author exactly; **0 new information** |
| Writing my OWN three probe files | ~14 min | **B1 — the blocker** |
| 4 reviewer mutants + RM2/RM3 | ~7 min | 1 equivalent mutant, 3 confirmations |

**The lesson is in the second and third rows.** Twelve command executions reproducing the
author's own three-run tables produced **nothing** — six identical lines I could have
predicted. The fourteen minutes writing an independent fixture produced the only blocking
finding in the review. `heartbeat-reviewer` §2 says "probe, never read"; the harness's
economics say it louder than the skill does.

**UPGRADE — invert the reviewer's default budget.** The reviewer packet currently orders
"run every owned cluster command yourself ×3" *first* and "build your own probes" *second*,
and the three-run table is the thing a tired seat does completely. Propose for the reviewer
packet template:

> Re-run the author's cluster command **ONCE** in your worktree. If it matches their reported
> worst line, record "reproduced, 1 run" and STOP re-running — three runs is the AUTHOR's
> obligation, discharged; a reviewer re-running it three times is buying the same evidence
> twice. Spend the recovered budget on fixtures the author did not write.

Three runs exist to catch flakiness in the *author's* lane. A reviewer's second and third
runs measure nothing new. This is ~5 minutes and ~8 tool calls per review seat, every seat,
every round.

## 4. The blocker, and the class it belongs to

B1 (stranded `policyOpen`) was not found by reading the diff — the diff *argues for itself*
in a twelve-line JSDoc at `CookieConsent.tsx:80-87`, and the argument is good prose. It was
found by asking one question the prose invites: **"its scrim covers every control of the
card" — which stylesheet says so?** Answer: none. `apps/ui/app/globals.css` at HEAD has no
`.policyScrim` rule and no `=== consent-ui S02 ===` block at all.

**CAUSE — the general one, worth a law:** the author discharged `heartbeat-worker` §2's
"delete a line no mutant catches" honestly, but their mutant search was bounded by *the
transitions their own cases already drive*. M8 (delete the line) is unobservable in a suite
where no case ever closes the card while the policy is open. **A mutant that survives is
evidence about the SUITE, not about the LINE.**

**UPGRADE — amend `heartbeat-worker` §2's deletion clause:**

> Before deleting a defensive line because no mutant catches it, name the STATE TRANSITION
> the line guards and show a case that drives it. If no case drives that transition, the
> finding is a MISSING CASE, not a redundant line. "No mutant is observable" is a claim about
> coverage and must be written as one.

That sentence would have turned tonight's deletion into a four-case test the author could
have written in ten minutes — which is exactly what my probe kit is.

**Second-order cause worth naming:** the justification leaned on a *cross-slice* fact (S02's
scrim CSS) that the author could not edit, could not test, and did not verify exists. A
component's safety argument that terminates in another slice's unwritten file is a
**cross-slice assumption**, and this mission has no place to declare one. Suggest a
`## Cross-slice assumptions` section in each slice's `DECISIONS.md`: one line per assumption,
naming the other slice's file and the ticket that will make it true. The orchestrator can
then grep for assumptions whose file is still empty at merge time — which is precisely the
state B1 sits in tonight.

## 5. Dead ends — do not re-derive these

1. **MR5 `containerRef: cardRef → scrimRef` is an EQUIVALENT mutant.** Caught by nothing (author suite
   11/11, my kit 9/9), and correctly so: the scrim is the card's ancestor, `focusableWithin`
   returns the identical six nodes, and the scrim still PRECEDES the policy element so
   `topmostSurface()` is unchanged. Do not file it, and do not "strengthen" a test to catch it.
2. **`useLayoutEffect` does not fix C6-F1.** Measured with a synthetic fixture: the layout
   phase runs AFTER the mutation phase, the opener is already detached, and
   `document.activeElement` is already `BODY`. Anyone who reads C6-F1 will propose this
   first; the measurement is in
   `probes/code-rev-s01-c6-r1-focus-mechanism.test.tsx`.
3. **`n_s02c` against `44744d8d` is 0 and always will be** — the merge is TREESAME to its S02
   parent for those four paths, so history simplification prunes it. The arm is only
   unsatisfiable when the *range boundary* excludes that parent. Pin the SHA, not the ref.

## 6. Toward the one-prompt machine

Three changes, in order of measured value:

1. **The positive-control rule (§1).** Kills the silent-zero class outright. Three instances
   in one night across three seats is not a discipline problem, it is a missing shape.
2. **The reviewer budget inversion (§3).** Frees ~20% of every review seat's run for the
   activity that actually finds defects.
3. **The deletion clause (§4).** Converts the most dangerous honest move a worker makes —
   deleting a guard for good reasons — into a coverage question with a mechanical answer.

**And one that costs nothing:** the packet already told me the author found four packet
defects and named them. That is the second time in this mission a packet has shipped with its
own known defects listed in it. It works — I confirmed all four in about six minutes instead
of rediscovering them — but it means the ORCHESTRATOR is now the only reader of the packet
who has not fixed it. Suggest: **when a seat reports a packet defect, the orchestrator
repairs the packet text and appends a dated correction line before dispatching the reviewer**
(§10.32 already preserves the snapshot, so nothing is lost). Tonight I reviewed a packet whose
four defects were known, unrepaired, and re-transcribed into MY packet — including the one
wrong line citation I had to correct a second time (§2).

## 7. Where THIS packet fought me

- **§4's "the author's C6-F1 … rule on the remedy class"** asked for a paragraph "with
  numbers" about React's commit ordering. The numbers do not exist as counts — the answer is
  an ORDERING (mutation → layout → passive). I answered with a fixture that observes the
  ordering. Suggest packets ask for "a measurement", not "numbers", when the fact is ordinal.
- **The `allowed` list grants `.hermes/TOOLING-TRAPS.md` (append)** but the trap I hit is
  already filed twice (author's trap 2, `COMMON` §10.40). I did not append a third copy of
  the same class; the *variant* worth recording — a reviewer's vacuous query producing a false
  finding AGAINST the author — is in this report and in the verdict instead. Flagging it so
  nobody scores the empty append as a shortfall.
- **Scratch path**: §10.11 mandates the shared scratchpad under `<seat>-<round>/`; my packet
  §1 names `.review-scratch/` inside the worktree. I used both (the worktree one for the
  probe kit, since vitest's `include` is `tests/**` and a probe outside it is not collected;
  the scratchpad for the throwaway git repo). Both are deleted. The two rules should be
  reconciled in one sentence: **jsdom probes must live under `tests/` to run at all** — that
  is a harness fact, not a choice, and every render-test reviewer will rediscover it.
