# V DECISIONS PACKET — V-SEALEDROWS-3

**Why this reaches you:** the cap is spent and both exceptions you granted are used. Codex's
review of the second exception round returned CHANGES with two blocking findings. **This is the
third decision on one lane**, and I want to be plain about that before the options.

## The pattern, stated honestly

| Round | What the seat proved | What codex found one layer down |
|---|---|---|
| exception 1 | the first request, at the runner's provider boundary | the gateway builds a repair packet internally, unobserved |
| exception 2 | the first repair, on the wire | the deployment permits a **second** repair, unobserved |

Each round has closed a real gap, and each time the shipped code has been correct on inspection.
Codex says so again: *"The current helper is correct because it always appends to the captured
base packet."* What is being chased is not a defect in what ships. It is the guarantee that a
**future** edit cannot silently break it — which is this lane's stated purpose, and which is why
codex keeps classifying these as blocking rather than follow-up.

## The two findings, in plain terms

**B1 — the test runs two attempts; the sealed settings allow three.** With three attempts, the
second repair is a repair applied to an *already repaired* packet. Nothing proves the constant
still leads on that one. Codex built the case: a repair helper that behaves on its first call and
misbehaves on its second passes the current test, because the test never makes a second call.
The fix is small and exact: set attempts to three, script two malformed replies then a valid one,
assert all three wire attempts. Test-only.

**B2 — the seat added shape constraints I had said not to add.** To stop a single-attempt run
passing vacuously, it required the repair packet to have *exactly one more* message than the
original, and assumed the evaluator's payload is the *first* user message. Both are shape, not the
invariant. A legitimate future repair that appends two messages, or reorders, would fail a test
that is supposed to check only "the contract leads." And the vacuity guard was already covered by
the existing attempt-count assertion, so the extra pin is redundant as well as wrong. The fix is
deletion plus a one-line change to how the payload is found. Test-only.

**One of the four record corrections codex charged is mine:** my reviewer packet said the repair
assertion "checks only that the contract leads." It did not — line 4187 also pinned the message
count. I described the test the seat was asked to write, not the test it wrote.

## Options

**(a) Third exception, test-only, both findings, then stop.** Cost: one short round; the fixes
are specified to the line and the seat has done this twice. Value: the guarantee holds on every
attempt the deployment can produce, with no shape pins. Risk: codex finds a fourth layer. I do
not currently see one — three attempts is the sealed maximum, and after B2 there is nothing left
to over-constrain — but I have said "I do not see one" before in this lane.

**(b) Merge now; carry B1 and B2 into F-SEALEDROWS-I. — RECOMMENDED.** The synthesizer leg has the
identical unenforced gap and its own ticket already. One follow-up lane, test-only, does BOTH legs
with the cardinality lesson learned: three attempts, leading-contract only, no shape pins, for the
synthesizer and the evaluator together. Your demonstration run unblocks today; the sealed value
is unchanged; nothing that ships is wrong. The honest cost: the evaluator's third-attempt
guarantee is documented-not-enforced until that lane lands, and this mission's record says
unenforced guarantees come back. That lane is small and I would dispatch it right after F-T17-T9.

**(c) Hold.** Gains nothing over (a) or (b).

I recommend (b) because the gap is the same class on two legs, one lane closes both cleanly, and
the demonstration run has waited long enough for a guarantee that is already true of the code.

## Housekeeping that needs no decision

Three follow-ups filed or annotated: the seat's r7 mutant log is prose, not `mutate.sh` output
(F-SEALEDROWS-K); the "5 of 5 solo" flake fact has no retained artifact (annotated on F22, marked
unverified); the seat's report dates AMENDMENT 6 one day early (a one-word correction, carried to
whatever lane touches the file next).

---

## V RULING 2026-09-05 — option (a), against the orchestrator's recommendation of (b)

**One more round, test-only, scoped to B1 and B2, then stop.** Third exception; cap stays 3 of 3.
Dispatched as AMENDMENT 7 with codex's exact routes (three attempts asserted; shape pins deleted;
envelope found by scanning all user messages), F1 and F3 folded in because the seat is in the same
file, and an explicit instruction that the lane stops after codex r7 whatever the verdict —
a further finding goes to V as merge-or-hold with the finding ticketed, not as a fourth round.

---

## RECORD CORRECTION — 2026-09-05 (codex r7 F1)

The B1 paragraph above says the second repair is "a repair applied to an *already repaired*
packet." Codex r7 corrected the topology: the repair callback closes over the original packet, so
the third attempt is produced from the captured base by the callback's second invocation, not
from the second attempt's packet. The decision and its outcome are unaffected — three attempts are
now observed on the wire — but the sentence V read was wrong about how the third one is built.
