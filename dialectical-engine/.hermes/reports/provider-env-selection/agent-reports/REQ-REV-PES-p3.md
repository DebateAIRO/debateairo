# REQ-REV-PES-p3 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

Pass 2's detectors match strings. They printed PASS on SPEC-v2 while the duplicate roster threw `CONFIGURED_PROVIDER_SET_INVALID` and step 5 printed the directory R2.9 forbade. Pass 3 existed because of that gap. The REQ-FIX seat then wrote checkers that call the shipped functions (`p3_exec.ts`). Those fail on v2 (7 checks) and pass on v3. An independent runner (`exec.ts`) that does not read the SPEC to choose a code produced the same messages. The closures are real. The token cost of the pass was re-deriving fixtures the SPEC already writes out in full, because the previous detector shape had taught the reviewer not to trust a green script.

## Price

- About 10 minutes to locate the five closures inside a 307-line and a 259-line SPEC after a 19k-character READY comment. The supersession line on each SPEC (line 4) already lists the changed requirement ids. Reading past that line into unchanged R1.1 / R2.1 was low yield.
- One `tsx` run of `exec.ts` (a few seconds) settled B1's code, B2's layout, N1's constructor, the five refusal messages, and the 32-row seed. The author's `p3_checks.py` v2 then v3 took the rest of the clock, mostly process startup per fixture, and confirmed the checkers are not glued to v3: v2 fails first.
- The 3h48m idle on the REQ-FIX seat (HTTP 429, recorded in its own report) is not this seat's spend. Nothing from that idle was on disk; the re-walk was one pass, not two.

## Nearly wrong

The roster-invalid case almost became a reopened B1. The shipped builder on two copies of element E still throws `CONFIGURED_PROVIDER_SET_INVALID`, and the author's `check_b1_fixture_codes` does not call that builder for the case: it sets a flag from a regex over R1.2 and returns the SPEC's own string. That looks like a closed finding when it is the SPEC talking to itself. The case is closed for a different reason: R1.3 puts the gate first, and the printed string is written once (`PES_PUBLISH_ROSTER_INVALID:vendor:a`). The targets-rejected fixture is the one the shipped parser owns, and that message is `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID`. Scoring the regex arm as evidence would have either rubber-stamped a hole or rejected a closed gate.

## Dead ends

- The grok `heartbeat-protocol` skill is the v3 thin loader and points at the spine. The v4 skill's §5 is the eight-line handoff. The packet says the spine is not floor reading. Opening the spine to find the handoff shape wastes a pass; the v4 SKILL.md already has it.
- `rg` is not on the lane's default PATH (pass 2's probe log). This pass used the Grep tool and `python3`. Do not replay pass 2's `rg` lines.
- String detectors (`detectors.py`, `detectors_v3.py`) still print PASS. Re-running them does not speak to B1 or B2. Keep them as a regression on the old string class only.

## Where this packet was unclear

`packets/REQ-REV-p3.md:9` lists S03's three files as exhaustive inputs. `packets/REQ-REV-p3.md:31` says S03 is out of scope. Those are two passes. This seat followed line 31 and filed that as N1. Charge 3 says re-measure every BUILT cell; `INSTRUCTIONS.md:12-18` has none. Charge 8's quotations of the pass-2 prediction and of the N4 pass test are exact, and that is what made the scope scorable without re-litigating pass 1.

## Upgrades, ranked by tokens saved

1. One reading list. A scoped pass names the changed requirement ids and the acceptance tables, and does not also say "read every slice exhaustively." The supersession line is already that list. Dropping S03 from this packet would have removed a whole false branch.
2. Ship the executing probe in the packet as the thing to refute, and state the one command that must fail on the previous SPEC before the pass counts. This packet did that for `p3_checks.py`. It saved a guess. Do the same for every later review, and say which arm of the checker is circular (here, the roster gate flag).
3. Put the fixture JSON in the review packet, not only in the SPEC. The reviewer otherwise re-copies element E into a new script. The SPEC's fenced block was enough this time; a one-screen fixture appendix would have been shorter than the READY comment's retelling of the same table.
4. Freeze the "string detector PASS is not a closure" lesson in the reviewer packet as a standing sentence, so the next seat does not re-read `detectors.py` to learn it. Pass 2 already wrote the sentence. Pass 3 still had to re-prove it.
