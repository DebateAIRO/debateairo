# CODE-T9C5-REV — self-report (blind review of the T9 slice-close zero-diff)

`SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:using-superpowers,
superpowers:verification-before-completion`

Seat: FRESH claude-opus-5 blind review · ticket `t_ea07b5dc` · authority_epoch=20 ·
verdict **PASS — T9-C5 CLOSED (zero-diff earned)**, findings N1–N5.

Treat it like a murder case. Below is what killed time, what nearly killed the verdict,
and what to change in the machine.

---

## 1. What nearly went wrong — two false findings I almost filed

**FALSE FINDING #1 — "the composer is pinned by nothing".** I swept `tests/` for
`LibraryComposer|sessionComposer|start-a-debate`, got zero hits, deleted the whole
signed-in composer from `page.tsx`, and watched the row-6 bind stay 54/54 GREEN. That is
a genuine measurement and it looked like an uncovered product surface. It is not:
`tests/render/t3-library.test.tsx:141-145` pins the composer by its **copy**
(`aria-label="Debate claim"`, the placeholder, `Models argue · you judge`), not by any
component or class name. Re-probed: t3-library goes RED (1 failed / 9 passed).

**CAUSE:** I searched by IDENTIFIER when the pin was written against RENDERED COPY.
That is the same class as AM5's `v2ui-pages` under-report (literal `apps/ui/…` match
missed a `source(relativePath)` helper) and AM1's loose-matcher error. Three instances,
three missions, one class: **a grep over test files finds pins that name the
implementation and misses pins that name the output.** The fix is mechanical and belongs
in `test-migration.md`: a coverage sweep must join on BOTH the symbol set and the
rendered-string set of the product file, and must be validated by a deletion probe
before it is written down as a coverage claim.

**PRICE:** ~2 tool rounds and one probe re-run. Cheap here only because the packet's
own instruction ("judge whether that is in-contract … and tier it honestly") made me
re-check before tiering. Without that sentence I would have shipped a fabricated
coverage hole into a PASS verdict.

**FALSE FINDING #2 — "the worker fabricated `heartbeat-protocol`".** Body-grepping the
codex rollout showed **0/8** distinctive lines from either copy of
`.claude/skills/heartbeat-protocol/SKILL.md`, while every other declared skill was
4/6–6/6 body-present. Under `heartbeat-reviewer` §5 that reads as a fabrication charge.
It is not one: the worker read the **SPINE**
(`docs/agent-protocols/debateai-heartbeat-protocol.md`, 8/8 distinctive lines present),
which the protocol itself ranks ABOVE the skill file — and its packet said
*"heartbeat-protocol + heartbeat-worker (repo copies)"*, a phrase that names two
different artifacts equally well.

**CAUSE:** the compliance gate (`SKILLS LOADED`) records a NAME, and two different
artifacts answer to that name. §3b was written to make compliance observable at zero
cost; a name that is ambiguous between a 100-line router and a mission spine is
observable but not decidable. **PRICE:** ~4 tool rounds of forensics, and one
near-miss on the most damaging possible finding (a false fabrication charge against an
honest seat). See N3.

My first pass at this check was also methodologically weak in a way worth recording: I
"verified" `heartbeat-worker` by grepping its frontmatter `description:` line — which is
echoed verbatim in every skills listing and therefore proves nothing. I caught it only
because I printed what my own needle was. **Rule for the next reviewer: a
skill-load body-check must sample lines from BELOW the frontmatter, and must be sampled
from several places in the file, never one.**

## 2. What the packet got right, and where it fought me

**Right, and it is the reason this review has content:** the instruction to build my own
per-case table BEFORE reading the worker's. I formed all five verdicts from `page.tsx`,
`LandingPage`/`LandingChrome`/`LandingHero`/`ModeToggle` and the test file alone, then
read the worker's table and found zero verdict divergence. That is a real independent
agreement, not an echo. Had I read the handoff first I would have been checking its
table instead of the file.

**Right:** "run a DIFFERENT liveness probe" plus the explicit permission for an
in-contract *no case catches this* outcome. It moved me from one confirmation to a
five-mutant discrimination matrix, which is what actually earned the PASS.

**Fought me — N2:** §0 read order names `dispatch-order.md`, `slices/T9/PLAN.md`,
`slices/T9/DECISIONS.md` as bare relative paths. None resolve from the seat's working
directory (`/…/dialectical-engine`); they live under `docs/missions/ui-overhaul/`. The
WORKER's packet (`CODE-T9C5.md` §0) gives the full paths correctly, so the review packet
**regressed a path its sibling had right**. PRICE: 3 wasted tool rounds and one `cd`
that silently persisted into the next call and broke it too. Packets are copy-edited from
siblings; the copy-edit dropped the prefix.

**Fought the worker — N1:** `CODE-T9C5.md` §3 acceptance item 5 demands
*"`git diff` net-touches at most …"* while §4 File contract says *"NO git commands."*
The acceptance cannot be produced under the contract. The worker handled this exactly
right — it declared the contradiction and substituted before/after SHA-256 — but a seat
that handled it wrong would have either broken contract or shipped an unprovable claim.
This is the second packet self-contradiction on this ticket (PD12 was the first, blocked
at 05:00). **Two internal contradictions in one packet is a generator, not bad luck:**
the acceptance list and the file contract are written at different times and never
diffed against each other. Cheapest fix: make "acceptance item N is producible under the
file contract" a line the orchestrator checks before dispatch, the same way it checks
that quoted counts match.

## 3. What repeatedly costs tokens — ranked

1. **Path prefixes in packets (~3 rounds/seat, every seat).** Every packet quotes paths;
   some resolve from the working directory and some do not, and the seat discovers which
   by failing. Fix: packets emit absolute paths, or one `cd`-anchored preamble block.
   This is the single cheapest recurring win in the fleet.
2. **`cd` leaking between Bash calls (1 wasted round here).** A `cd` in a compound
   command persisted and broke the following, unrelated call. Fix: never `cd`; always
   absolute paths from the repo root.
3. **Coverage claims asserted from greps (see §1).** Each one costs a probe to confirm
   or a false finding to retract. Fix: **no coverage claim without a deletion probe.**
   A grep generates the hypothesis; only a mutant settles it. This is the reviewer-side
   twin of AM5's "file overlap is a candidate generator, not a verdict".
4. **Skill-load forensics (~4 rounds).** Entirely avoidable — see N3.

## 4. Dead ends — do not re-derive these

- **`expect.soft` is not a mask.** All eleven assertions in the computed-style cases are
  `expect.soft`; soft failures still fail the test. Probe D proved it: removing one
  `box-shadow` declaration turned both cases RED. Do not re-open this.
- **`vi.importActual` does not disable transitive mocks.** The `next/headers` and
  `@/lib/serverApi` mocks reach `page.js` even though `page.js` itself is imported with
  `importActual`. Probes A and C both depend on this and both discriminated.
- **jsdom does resolve the injected `globals.css` cascade** for the properties this test
  reads. Probe D is the proof; the computed-style cases are not vacuous.
- **`auth-flow-integration.test.tsx` is NOT a missing fifth entry in DECISIONS:37.** It
  renders `TopBar` only in its `.authTopBar` form (lines 167/197/207), never the `/`
  home chrome, and `test-migration.md:67` classifies it T7/T8. I checked this on the
  suspicion that DECISIONS:37 applies its own criterion inconsistently (it admits
  `auth-front-door-parity` for reading `LoginFlow`/`SignUpFlow`, and
  `auth-flow-integration` renders the same two components and WAS edited by T9-C2 in
  `6aa9f35f`). The distinction survives: T9-C5-1's acceptance is scoped to pins of the
  OLD `/` or home chrome, and this file pins neither. The worker's classification is
  correct; do not re-litigate it.

## 5. Toward the one-prompt machine — three concrete upgrades

**(a) Make `SKILLS LOADED` carry paths, not names.**
`SKILLS LOADED: heartbeat-protocol(docs/agent-protocols/debateai-heartbeat-protocol.md), …`
Cost: zero, the seat already knows what it opened. Benefit: the §3b gate becomes
*decidable* instead of merely observable, and this review's 4 rounds of rollout forensics
— plus the false fabrication charge they nearly produced — disappear. The gate's own
stated purpose was "unobservable compliance gets mis-judged in both directions"; a
name that maps to two artifacts reintroduces exactly that.

**(b) Give every CONFIRM+BIND packet a discrimination-matrix cell instead of a single
probe.** The worker's packet asked for *"ONE probe mutant proving the suite is live"*.
It obeyed, and its probe put exactly one of five cases RED — so four of its five
MEASURES verdicts rested on reading, not probing, which is precisely the posture
`heartbeat-reviewer` §2 forbids. The upgrade is one sentence: **"one mutant per case
GROUP, and state which cases each is expected to redden before you run it."** I ran five
and every prediction held; that is what turned "the file looks fine" into
"each case group is proven live". It also costs almost nothing — each probe is ~20s.

**(c) Diff the acceptance list against the file contract before dispatch.** Both packet
defects on this ticket (PD12's missing marker, N1's `git diff`-under-a-no-git-contract)
are the same shape: an acceptance item that no lawful execution can produce. A single
mechanical pre-dispatch pass — "for each acceptance item, name the allowed tool that
produces it" — catches both. PD12 alone cost a full block/unblock cycle (05:00 → 05:09).

## 6. Where I stopped short

- I did **not** re-verify the eleven computed-style property values against the T9-C3
  token contract; I proved the case group is live (probe D) and that its selectors still
  exist, not that every threshold is the designed one. `t9-mode-tokens.test.ts` owns that
  and is not in row 6's command.
- I did **not** exercise the accessibility tree. `knownConcealmentBarrier` is an
  enumerated blacklist, the file says so, and no probe of mine changes that. Its honesty
  comment is nevertheless defective — see N4.
- I did **not** review the two later addendum commits (`dd2ba147`, `3a637d35`); the
  packet declares them and they touch other files.
