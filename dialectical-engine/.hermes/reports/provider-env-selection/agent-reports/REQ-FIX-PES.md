# Self-report — seat REQ-FIX-PES · node REQ-FIX pass 2 of 3 · ticket t_90d85031 · mission `provider-env-selection` · 2026-09-24

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Wall clock 14:28 → 14:4x, ~18 min. 3 blocking + 7 non-blocking findings closed, 0 contested.
Output: two complete `SPEC-v2.md`, INSTRUCTIONS amended (99 lines), two PLAN scaffolds re-aimed,
two DECISIONS appended, one detector script watched failing then passing.

---

## 1. The autopsy of MY defect, not the reviewer's report of it

All three blocking findings are one failure, and I can name the exact move that caused it.

**I wrote the SPEC from the CALL SITES and never from the CALLEE's signature.** At pass 1 my packet
named `packages/register/src/configured-provider-set.ts:5-144`. The function S01 must call —
`buildConfiguredProviderSetDeploymentRow` — is at `:177`. I *cited* 177 (I had grepped for it) but
I never READ its signature. Had I read two lines of it I would have seen `requiredDistinctMakers`
and `sealedSourceRef` as required arguments that my R1.2 listed no source for. The same move
produced B1's other half: I knew `parseProviderDiscoveryTargets` existed and what it was FOR, and
I never read that its second parameter is the already-published set (`packages/providers/src/index.ts:232-235`)
and that it returns the configured set's order, not the JSON's (`:333-337`). I made a downstream
consumer the upstream source of its own input. **A citation is not a read**, and my pass-1 handoff
quoted line numbers as if it were.

**PRICE:** one full REQ-REV pass (~1 seat) plus this rework (~18 min, ~90k tokens), and it would
have been one BUILD node and a FIX node if it had reached a coder — the reviewer's "concrete fork"
(`reviews/REQ-REV-p1.md:19`) names three coders who each satisfy one sentence and violate another.

**B3 has the same shape.** I wrote R2.9 ("no line contains the words `Bearer` or `authorization`")
from the *intent* — protect the secret — and wrote step 4 from the *codes* the tree emits, an hour
apart, and never read the two together. Then, at step 7, I wrote a grep that EXCLUDED
`^PES-S02 REFUSED ` lines — I had actually *noticed* the collision and patched the symptom in the
one place it bit, without going back to the rule. That exclusion is the fingerprint: I saw the
contradiction and coded around it instead of resolving it. The reviewer spotted exactly that
(`reviews/REQ-REV-p1.md:37`).

**B2 is the cheapest and the most embarrassing.** My own pass-1 READY declared the S02→S01 edge in
three documents. The dependency never existed: `createProviderDiscoveryResolver`
(`apps/api/src/provider-discovery.ts:40-48`) takes plain values and reads no database. I had read
that function at pass 1 — it is in my own SPEC's R2.8 citation — and still wrote a header saying
the acceptance publishes a row. **I inherited the dependency from my own first draft's slicing
table and never re-derived it after R2.8 made it false.**

## 2. What I nearly got wrong THIS pass

**My own B2 detector had the defect it was built to catch.** First version matched the dependency
phrases per LINE. The claim is prose, prose wraps, and S02's header wrapped mid-phrase — so the
detector found the two unwrapped copies (INSTRUCTIONS, PLAN) and MISSED the SPEC's own header, the
primary site. If I had run it only against v2 it would have printed a clean PASS and I would have
quoted it. It was the v1 run — the mandated failing fixture — that exposed it, because I could
count the sites the verdict named (3) against the sites the detector found (2). **The failing
fixture did not just prove the detector works; it proved the detector was broken.** That is the
single strongest argument for charge 7 in this packet, and it should be quoted in the next one.
The fix and the reason are recorded in `probes/REQ-FIX-PES/detectors.py` at the `WITHDRAWN`
constant, so the next seat does not re-derive it.

**A line number that moved under me.** N11 cites intake §10 item (e) at `00-intake.md:88`. The
orchestrator's N1 restore put §6–§9 back, and item (e) is now `:114`. I cited `:88` from the
verdict, then re-measured before freezing. A verdict's `path:line` is as perishable as a packet's.

## 3. Dead ends — do not re-derive

- **The parser cannot mint a set.** Any design where `PROVIDER_DISCOVERY_TARGETS_JSON` is the
  source of the register row is circular. The row is the parser's second argument.
- **Two operator-authored inputs is never the answer here.** Whatever the second one is (a vetting
  file, a maker map), it must agree with the first about the vendor list, and nothing checks that
  agreement at publish time. One roster file, everything derived.
- **`adapterKind` cannot be hardcoded.** Two kinds ship (`packages/providers/src/index.ts:807-809`).
- **A plain-HTTP or loopback fake vendor cannot be the ADMISSION case** — hosted mode refuses both
  by design. The admission case needs a public-form name and real TLS, trusted through the
  `fetchImplementation` seam only.
- **`requiredDistinctMakers` must not come from an operator file** — that would let a JSON edit
  lower DR-013's maker-diversity floor.

## 4. Upgrades, ranked by tokens saved per mission

1. **A packet's code range must END at the end of the thing it names.** N2 is the proximate cause of
   B1: the range stopped 33 lines before the function the slice exists to call. Make
   `packet-check.sh` reject a range that ends inside a function body or mid-sentence — for TS, the
   cheap version is "the last line is not indented and is not inside an unbalanced brace". *This one
   check would have prevented the most expensive finding of this mission.*
2. **Ship `spec-lint.sh` with the CONTRADICTION check, not just the banned-word check.** My pass-1
   self-report already asked for existence-testing of paths and flags (it would have caught N7, N9,
   N10). B3 needs one more rule, and it is mechanical: **every literal token an acceptance step
   requires on stdout must be permitted by every rule that constrains stdout.** That is a set
   difference over two sections of one file — `check_b3` in `probes/REQ-FIX-PES/detectors.py` is 20
   lines and generalises.
3. **A "determination" check for any SPEC that builds a typed value.** B1's general form: for every
   constructor a requirement names, every required parameter of that constructor must appear in the
   requirement's source table. This is greppable from the TypeScript signature. It is the same
   check as #1 from the other end, and it catches the case where the range WAS long enough and the
   author still skimmed.
4. **A run-the-detectors-on-the-previous-version rule, stated as a one-liner in every FIX packet.**
   This packet has it (charge 7) and it earned its place twice this pass: it caught my broken
   detector, and it turned "I fixed it" into a diff of two run logs. It should never be dropped.
5. **Verdict line numbers should be re-measured by the FIX seat, mechanically.** A tiny script that
   takes every `path:line` in a verdict and prints the current line's text would make a stale
   citation visible in one second instead of one careful read.

## 5. Toward the one-prompt machine

The machine already caught all three blocking defects before a coder saw them, at the cost of one
review seat — that is the loop working. What it spent tokens on was a defect a *mechanical* check
could have caught at write time: three of the ten findings (N7, N9, N10) are "a name that does not
exist or points at the wrong line", and two more (N3, N5) are "a description where a specification
belongs". Five of ten findings are lint. **Lint them and the review pass gets to spend itself on
B1-class reasoning, which is the only part that needed a mind.** The way to fewer prompts is not a
longer packet — my pass-1 packet was good — it is moving the checkable half out of the reviewer's
attention entirely.

**Where THIS packet was unclear, exactly:** nowhere that cost me time. Charge 2 naming the exact
ranges including `:145-196`, and charge 3 stating B2's two lawful resolutions explicitly ("either
… or …, never both readings"), removed the two decisions I would otherwise have agonised over. The
one thing I would add: charge 6 says "every pointer … re-pointed at the v2 file and line", and
PROGRESS.md is both forbidden to me and full of `SPEC.md` pointers. I left them; the packet could
say so in one clause.
