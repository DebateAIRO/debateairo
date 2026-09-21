# Self-report — REV-S01-p2-security-data-safety

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REV(S01) security/data-safety, pass 2 (scoped), ticket `t_d2c8d5fc`, the pass-1 session resumed. Verdict PASS; all six in-scope pass-1 findings ADDRESSED by measurement; two new non-blocking findings. Wall clock ~25 min.

## The cause, not the symptom

**My own pass-1 output cost another seat a launch.** I promoted four probe files and a `run.sh` and no `README.md`. FIX-S01-p1-B's packet ordered it to read a promoted probe's README before running it; mine had none; it filed BLOCKED and stopped — correctly. Its self-report prices that at ~10 minutes and 5–7k tokens, plus an orchestrator ruling and a resume, and the orchestrator opened `t_ff155aeb` against the packet. The packet was not the cause. **I was**: I treated "promote the probe" as "copy the files", and a probe without its invocation contract is not a promoted probe, it is an artifact someone else has to reverse-engineer — which is precisely what that seat was forbidden to do. I wrote the missing README this pass, and wrote my pass-2 one before running anything.

The generalisable rule, and it is cheap: **a promoted probe is (files + runner + README + expected frame + mutation disclosure + the direction a RED means), or it is not promoted.** Packet-check validates that the directory exists; it should validate the tuple. That one check would have saved this mission a blocked node, a ruling, a resume and a ticket.

## What this pass got right by construction

Resuming with context intact was worth more than any single probe. I already knew the privilege grid (no product role holds INSERT on `core.run_visibility_event` or `identity.audit_event`), so I did not re-derive it — I re-measured it in one case (`D2`) and spent the budget on the two things that actually changed. A cold pass-2 lens would have paid the pass-1 reading cost again to reach the same starting line.

The second thing that paid: **every inverted case carries a control.** `D3b`, `D4` and `D5` assert the refusal AND assert that the same shape with boundness / the live lease / the matching run restored is still `NO_ERROR`. Without the control, a fix and a broken admission produce the same green. This is the cheapest guard against the failure mode the package itself warns about ("a mutant's direction can invert between heads").

## What repeatedly cost tokens

1. **The zsh `$FILES` trap, which I walked into with my eyes open.** I put the 19 suite specs in a shell variable and passed `$SUITES` unquoted. In zsh that is ONE token, so the runner matched one suite and printed `CLUSTER_GREEN`. A green marker over a single suite is the most expensive output in this system, because it reads as success. I caught it only because the output was 2 lines instead of 20. I had read this exact trap in my pass-1 packet. **Upgrade: `run-suites.sh` should refuse to print `CLUSTER_GREEN` when `$#` is smaller than the number of `:`-separated specs it was given, or simply echo the argument count first.** Price here: one wasted 4-minute double run, ~3k tokens.
2. **Fixture archaeology, again, in a new shape.** Three retries on the D3b case: `core.run` is append-only (`core.reject_mutation` raises on UPDATE, so I could not flip `plan_tier`), `serve.publication_snapshot` has a check constraint that rejects a hand-written ciphertext, and `MemoryPublicationKeyStore` refuses a second `create()` for one ref. All three are facts about the repo, none is about security, and I paid for two of them at pass 1 as well. I wrote them into the pass-2 README so the next seat does not. **This is the same `seedOwnedRun()` upgrade I ranked first at pass 1, still unbuilt, and it has now cost two passes.**
3. **A schema-valid `Answer` is 35 fields.** My oracle probe returned 500s until I built one. The security content of E1/E2 never needed the body — but E3 ("a throwing hook does not change the answer") did, and a 500-vs-500 comparison would have been vacuous. **Upgrade: export one valid `Answer` fixture from `tests/support/`.** Four files in this slice alone hand-roll it.

## What I nearly got wrong

I nearly filed the three vanished test-case names as a finding. Charge 2 says in terms that "a case that disappeared is a finding", the pairs had moved, and two of the three were *exactly* my territory (the NULL-tier and pre-rule unbound cases). They were renames: *"with one DENY"* → *"with no forgeable DENY"*, because my own S-N4 fix makes the old assertion false by construction. **A finding I caused is the one I am least likely to recognise.** The check that saved me was mechanical — diff the `it("…")` name sets, then read the new names for the same subject before concluding anything.

I also nearly tiered S-N8 as blocking. `publish_pending:true` on a Premium run is a flat contradiction of R-11.2, and I had it on screen in a verbatim log line. It is not reachable: the only caller checks boundness first. Tiering it blocking would have sent the slice to its last pass over a capability nobody calls wrongly.

## Dead ends, named so nobody re-derives them

- **Inserting a visibility row under `SET ROLE` to test the trigger.** It always stops at `42501`; the trigger never runs. The instrument is a test-only SECURITY DEFINER inserter created inside the probe's own ephemeral database. FIX-B reached the same conclusion independently and said so in its report; that is two seats paying for one fact, which is one too many.
- **Flipping a run's `plan_tier` to make it unbound.** `core.reject_mutation()`. Seed it unbound.

## Where this packet was unclear, exactly

- **Charge 4 points at the wrong artifact first.** It says the FIX seats' "agent-reports ... and their READY comments carry the lines". The agent-reports carry none (0 grep hits in both); only the READY comments do. The charge resolves because of its second half, so it cost me only one grep — but it is the same shape as the pass-1 defect it was written to close, and a seat that checked only the named file would have filed a fabrication finding against two innocent seats.
- **Charge 6 lists my pass-1 findings as "N1 · N2 · N3 · N4 · N5 · N7" and omits N6.** N6 was the packet defect, and this packet's charge 4 is its remedy — so the omission is correct in substance and confusing in form. One clause ("N6 is answered by charge 4") would have removed the ambiguity.
- **`comment cursor at dispatch: 0 comments` was 1 again.** Already ticketed from pass 1; noted, not re-raised.

## Upgrades, ranked by tokens saved

1. **Packet-check validates the promoted-probe tuple** (files + runner + README + expected frame + mutation disclosure + RED direction), not directory existence. Saves a blocked node per review round; already cost this mission one.
2. **`tests/support/seedOwnedRun()` and an exported valid `Answer`.** Two passes of this lens, both FIX seats and four cluster test files have now each re-derived the same fixtures. Largest recurring line item in the mission.
3. **`run-suites.sh` echoes its argument count and refuses `CLUSTER_GREEN` on a spec-count mismatch.** Turns the most dangerous silent failure in the harness into a loud one, for about three lines of shell.
4. **Every inverted probe case ships a control.** Free at write time; it is the only thing that distinguishes "tightened" from "broken" when a mutant's direction flips between heads.
5. **A finding's remedy names the class, and the sweep is re-run at the next pass.** S-N9 exists only because the sweep for S-N1/S-N2 stopped at the visibility half of one trigger function while the audit half sat 41 lines below it in the same file.

## Toward one prompt

Pass 2 was nearly mechanical: for each of my rows, re-run my own probe with the expectation inverted, read one line, write one table cell. The judgement was in two places only — re-deriving what a pass-1 characterisation *should* assert now, and tiering the two new findings. Everything else is transcription. A review artifact that emitted, per finding, `{id, file:line, probe case, pass-1 value, expected-after value}` as data would let the next pass run itself and hand the lens only the two judgement calls. That is the shape of the one-prompt machine here: not a bigger packet, but a finding record that is machine-readable at the moment the finding is written.
