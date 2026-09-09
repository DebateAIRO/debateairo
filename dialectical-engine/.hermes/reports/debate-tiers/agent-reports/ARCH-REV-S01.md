# Self-report — seat `ARCH-REV-S01`, node `ARCH-REV(S01)` pass 1 of 3, mission `debate-tiers`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict filed: **PASS**, 9 N findings, 3 packet defects, 0 blocking. Wall clock ~35 min, one session,
no rework, no resume. Lane `tiers-s01` byte-clean before and after (`git status --porcelain` = 0 at
every checkpoint).

---

## 1. The body: what actually happened, and what it cost

| Phase | Wall clock | What it bought |
|---|---|---|
| Skills + packet + COMMON + CLAIM | ~4 min | the contract. No waste. |
| Reading the artefacts (PLAN 859 lines in two pages, SPEC-v2, DECISIONS, ADR, handoff, BASELINE, V packet) | ~9 min | ~55k tokens. **PLAN.md needed two Read calls** because one page exceeds the 25k cap — see §3.1. |
| Static probe (p1) | 2 min | N4, N9, and the reproduction of F2/F3/R11/R20-A in one script |
| Render probe (p6) | 6 min | the answer to charge 1. The single most valuable six minutes of the run. |
| Screens/token probe (p2, p5) | 4 min | exonerated F4 and the token list; produced N6's precision |
| CSS-gate fixture (p4) | 3 min | **N2** — the finding no amount of reading would have produced |
| Cluster commands C1–C4 at base (p3, p8) | ~8 min | 34 of 34 rows agreeing; the packet's whole verification line discharged |
| Trace parser (p9) | 2 min | N3 (S01-42 has no criterion); confirmed the trace closes both ways |
| Verdict + self-report | ~8 min | — |

**Total cost of the review ≈ one third of what the plan under review cost to produce.** That ratio is
right for a blind pass, and it is only that low because the artefact was good: I spent almost no time
recovering from ambiguity in the PLAN itself.

## 2. Cause, not symptom: the three defect families I found, and what actually generates them

### 2.1 The family: **a criterion that was written but never run**

Members: N4 (`grep -c 'useEffect'` = 2, the step says 1), N2 (§8 credits `t9-mode-tokens` with a
detection whose case is already red at base), N5 (§8 credits C2 with a detection that needs a typechecker
`vitest` does not run), N9 (`:disabled` "exactly one selector" — there are 22), N7 ("eight RED at base"
— seven).

**The cause is not carelessness.** Every one of these sits in a *prose* or *table* cell rather than in a
`Done when:` line, and the ARCH seat's contract makes it RUN the cluster commands and the base
measurements — which it did, flawlessly, 34/34 — but nothing makes it run **the criteria inside the
steps** or **the mutant claims inside the refutation table**. The seat validated the instruments and
asserted the detections. That asymmetry is structural, and it is the same asymmetry `TOOLING-TRAPS`
records as *"Validate a checker on known-GOOD input, not only known-bad"* — here applied one level up:
*validate the CLAIM about the checker, not only the checker*.

**The upgrade, and it is cheap:** `heartbeat-architecture` should require that **every `Done when:` whose
text is a shell command is executed at base and its output pasted**, and that **every row of the
refutation table naming a suite as the detector is run once with the mutant**. The ARCH seat already
does this for the two mutants it chose to highlight (S01-31's `maxTokens`, S01-40's end-of-file append —
both correctly named). Extending it from "the two I picked" to "every row that names a detector" would
have caught N2 and N5 inside the authoring session, at a cost of maybe four minutes. **N2 in particular
is a SPEC requirement with no gate at all; it survived REQ, REQ-REV p1, REQ-REV p2 and ARCH.**

### 2.2 The family: **the screen is not the same object as the requirement**

Member: N1 — `page.tsx:186` renders "explicit asker selection" on the control the Free lock pins
machine-side. Three planning nodes routed the sentence one line ABOVE it (V-17, `.ndIntro`) and none
looked at the two lines below.

**The cause is that every seat read `page.tsx` by grep.** I did too, at first — my early greps were
`ndTopicBezel|ndIntro|id=`, and they found exactly what they asked for. N1 only appeared when I dumped
`page.tsx:180-262` as continuous text to check an unrelated question (how many gauge rows `.ndCard` has).
Grep finds the thing you already suspect; the honesty defects in this mission are all *adjacency*
defects — a true record with a false sentence beside it — and adjacency is invisible to grep.

**The upgrade:** on a `ui: yes` slice, the `## Screens` block should be required to include **a verbatim
dump of every copy string inside the region the slice changes** — labels, hints, intro lines, provenance
lines — with a one-word verdict per string (`stands` / `V's`). Ten lines in the PLAN, and it converts an
adjacency question into a checklist. V-14, V-17 and N1 are three members of one class that would all
have been produced by that one rule, in one pass, instead of three.

### 2.3 The family: **scarce global names handed to concurrent seats**

Member: N8 (`/tmp/after.files` in the R21 delta command). The ARCH seat **named this exact class** in
its own DECISIONS correction (`DECISIONS.md:173-177`, about V-row ids and ADR numbers: *"scarce global
names handed to seats that run concurrently and cannot see each other"*) and then wrote a shared
`/tmp` filename into the plan two sections earlier. Naming a class in prose does not sweep it.

**The upgrade — and this is the general one:** law 3.2 says *"a reported finding is a SAMPLE of a class:
name the class, sweep every member, record the sweep member-by-member."* The sweep is currently done by
hand, in prose, at the end of a long session. It should be **a command**: when a seat names a class, the
handoff must carry the grep that enumerates it. Here the sweep is
`grep -rn '/tmp/\|V-1[0-9]\|ADR-00' <the artefacts I wrote>` and it takes two seconds. The class fix for
V-row ids landed (COMMON §4, `V-ROW: NEW`); the class fix for *shared filenames* did not, because nobody
ran the grep over the same three words.

## 3. Where THIS packet fought me, exactly

**3.1 The reading floor collides with the tool's page cap.** `PLAN.md` is 859 lines; `Read` truncated at
line 618 (25k-token cap) and I paid a second call plus a re-orientation. Every planning artefact in this
mission is heading toward that size. **Upgrade:** the packet should name the page split
(`PLAN.md:1-618`, `:619-860`) the way it names line ranges for everything else, or the orchestrator
should hand review seats a pre-split copy. Cost here: ~2 min and ~30k tokens re-read. Across a fleet,
this is a recurring tax.

**3.2 The `allowed` list makes the reviewer contract unsatisfiable on a UI slice (P3).** My packet says
`allowed (exhaustive)` and lists no path inside the lane; `heartbeat-reviewer` §2 says *probe, never
read*, and my packet's own §2 demands probes. But `vitest.config.ts:14-18` includes only `tests/**` and
`acceptance/**` **under the project root**, so a fixture that renders `/new` physically cannot run from a
scratch dir. I resolved it by running from `<lane>/coverage/arch-rev-probe/` — gitignored at
`.gitignore:5`, porcelain 0 before and after, deleted at exit — and disclosed it in the verdict rather
than letting it be found. **I nearly did the other thing**: my first instinct was to skip the render
probe and reason from `sup-04-widget`'s source. That would have produced a verdict that *looked*
identical and rested on nothing. The six minutes it cost me is the entire difference between this being
a review and being a summary. **Upgrade:** every review packet on a `ui: yes` slice grants
`<lane>/coverage/<SEAT>/` by name. One line in the template.

**3.3 Charge 5 cited `PLAN.md §6`; the 17 suites are in §0 F4 and §7 (P1).** Cost: one wrong read.
**Upgrade:** `packet-check.sh` resolves every `§n` citation against the target file's headings — it
already resolves paths.

**3.4 The inputs list is narrower than the charges (P2) — and this was supposed to be class-fixed.**
`ARCH-S01`'s F6 said exactly this about its own packet, the orchestrator marked it class-fixed, and my
packet then omitted `V-DECISIONS-PACKET.md` (charges 3 and 4 are *about* rows V-9 and V-17) and
`BASELINE.md` (charge 5 turns on its rows). **A note in a ledger is not a class fix; a gate is.**
`packet-check.sh` must FAIL a packet when a charge names a file the `inputs` line does not. This is the
single highest-leverage upgrade in this report: it is mechanical, it costs nothing per dispatch, and it
closes a class that has now recurred twice in one mission.

## 4. What I nearly got wrong

1. **I nearly filed a false finding about `--m-gpt`.** My first token probe used `grep -c '^ *--token:'`
   and reported `--surface`, `--muted`, `--focus`, `--m-gpt` and eight others as **absent** from `:root`.
   They are all present: `globals.css` declares several tokens per line (`--m-claude: …; --m-gpt: …;
   --m-gemini: …;` at `:40`), and a line-anchored grep sees only the first. I re-measured with
   `grep -n -- '<token>:'` and got every one, with its line. **Had I shipped the first number, I would
   have told the mock seat that the identity colours it needs do not exist** — and the mock would have
   invented tokens, which is the exact failure R17 exists to prevent. The lesson is not "be careful with
   grep": it is *a measurement that disagrees with a plausible artefact is a bug in the measurement until
   proven otherwise*, and the cost of re-measuring is 20 seconds.
2. **I nearly reported `tests/unit/s14-ui.test.ts` as a missed member of F4's class.** It matched
   `lib/api` in my sweep and is in no cluster command. It imports `../../web/lib/api.js` — the deleted
   `web/` app — which is also why it carries 8 base typecheck diagnostics. One `grep -n` saved a finding
   that would have sent a seat looking for a suite that reads nothing it writes.
3. **I nearly tiered N2 as blocking.** It is a SPEC requirement with no gate, which reads like a B. But
   the next node is `MOCK(S01)` → V's `DONE.md`, C4 runs long after it, and a REWORK would have stalled
   V's UI gate for a defect with no effect until after that gate. `heartbeat-reviewer` §4 — *fold, don't
   loop* — settled it. What made this decidable was asking **"which node does this finding land on?"**
   rather than "how bad is it?". I recommend that question become the tiering rule in the reviewer
   contract: **blocking = the next node produces a wrong artefact without this fix.** It is mechanical,
   two reviewers would answer it the same way, and "how serious is it" is not.

## 5. Dead ends, so nobody re-derives them

- **Running a probe suite from outside the lane is impossible.** `vitest --config <scratch>/x.config.ts`
  loads fine (set `root` to the lane and duplicate the five `resolve.alias` entries), but `include`
  globs resolve **relative to `root`**, so the test file must live under the lane. There is no flag that
  changes this. The only clean landing spot is a gitignored dir inside the lane; `coverage/` is the one
  that exists (`.gitignore:5`).
- **`.mjs`/`type: module` warning on a scratch config is noise**, not a failure — the run proceeds and
  `vitest/config` resolves from the lane's own `node_modules`. Do not spend time on it.
- **`grep -c 'a\|b'` DOES work as alternation in this shell** (macOS BSD grep). I checked, because
  S01-35's criterion depends on it; a control run of `grep -c 'zzz\|useState'` returned 19. Nobody needs
  to re-litigate that.
- **`generate:contract` is safe for a reviewer to run**: rc=0, and the `packages/contract/generated`
  tree hashed identically before and after (`9a8bf691…`). It is gitignored, so porcelain stays 0.
- **The C1 command's third RED row prints `BROKEN`, not a pair mismatch** — that is the runner working
  as designed on a TDD-created path, not a defect. Every cluster shows the same shape.

## 6. Turning this into a one-prompt machine — the three changes I would make first

1. **`packet-check.sh` gains two gates that are pure text:** (a) fail if any charge names a path the
   `inputs` line does not; (b) resolve every `§n` citation against the target file's headings. Together
   they close P1 and P2, and P2 has now fired twice in one mission. **This is the cheapest upgrade with
   the largest measured recurrence.**
2. **`heartbeat-architecture` gains one line:** *every `Done when:` that is a shell command is run at
   base and its output pasted; every refutation-table row that names a suite as the detector is run once
   against its mutant.* That converts N2, N4, N5 and N9 from review findings into authoring-time
   corrections — four of my nine findings, caught by the seat that wrote them, in about four minutes.
3. **`ui: yes` slices get a copy inventory in the `## Screens` block:** every copy string inside the
   changed region, verbatim, each marked `stands` or `V's`. V-14, V-17 and N1 are one class, discovered
   one at a time across three nodes; this rule produces all of them at once. It is also what makes the
   mock's canvas and V's `DONE.md` argue about the same words.

**On efficiency generally:** the expensive thing in this pass was not thinking, it was **re-reading
artefacts to find the line that supports a claim I already believed**. Every finding I filed carries
`file:line` because the fleet demands it, and I paid for each one by grepping back through files I had
already read. A planning artefact that emitted a machine-readable index of its own claims — one line per
`Done when`, per detector claim, per cited `path:line` — would let the next reviewer verify mechanically
instead of re-reading. That is a generator change, not a reviewer change, and it is where the next
order-of-magnitude is.
