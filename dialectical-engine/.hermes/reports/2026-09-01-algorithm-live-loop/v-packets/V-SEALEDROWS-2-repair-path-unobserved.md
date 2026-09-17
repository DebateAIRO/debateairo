# V DECISIONS PACKET — V-SEALEDROWS-2

**Why this reaches you:** the rework cap is spent (3 of 3), and the one exception you authorized
(V-SEALEDROWS-1) has been used. Codex's final review returned CHANGES with one blocking finding.
There is no round I can start on my own.

**One decision.** No other finding is open: zero follow-ups this round.

## What the exception round delivered — verified, and codex agrees

The runner-send half is now tested the way the setup-routine half is: a recorder wraps the real
provider connection, a real work item runs through the runner, and the test asserts the
evaluator's request carries exactly one system message, leading, byte-equal to the exported
constant. Codex's comment-decoy attack is caught. The four harmless refactors it had flagged as
wrongly rejected all pass. The runner file was not touched. Suites: `13 failed | 1529 passed`
three times identically, zero new failures.

Codex also confirmed the recorder watches the **real** gateway the runner uses — not a parallel
one — and that the recovery after the stall was proportionate and sound.

## The one thing not closed, in plain terms

When the AI's first answer comes back malformed, the system **retries with a repair message**.
That repair packet is built **inside** the provider layer, one level below where the recorder
sits. So the recorder sees the first request and never the retry.

**Today the retry is safe by construction.** The repair helper appends one message to the
original packet, so the constant stays first. Codex states this outright: *"The shipped code is
correct on static inspection."* Nothing wrong is being sent.

The gap: **nothing proves it.** The new test allows exactly one attempt and returns a valid
answer first time, so the retry path never runs. If someone later changed the repair helper to
rebuild the packet instead of appending, every check would stay green while the retry carried a
different prompt. Codex's words: *"enforcement of what is sent is the outcome B1 and V
authorized"* — and that outcome is delivered for the first attempt only.

**The fix is test-only and the route already exists.** The test's fake provider server already
receives every HTTP body; codex confirms extending it to retain those bodies, forcing one
malformed first reply, and asserting every attempt leads with the constant *"will expose the gap
without touching production code."* No production change. No new file.

## Options

**(a) One more exception, test-only, scoped to the retry path. — RECOMMENDED, narrowly.**
Your reason for the last exception was that it makes the lane's claim true rather than written
down. That reason still applies: the claim is enforced on one of two paths. Cost: one short
seat round, no production code, observation point already in place. Risk of it going wrong: low —
it is the same kind of test the seat has now written twice successfully.

**(b) Merge now, ticket the retry-path test as follow-up.** The shipped code is correct. The
hazard needs a future change to a helper that is currently one line. Your demonstration run is
waiting behind this merge, and this lane has consumed six rounds. The honest cost of (b): a
documented-but-unenforced guarantee on a path that is correct today, in a mission whose record
says that exact class returns. If you choose this, I will ticket it at medium and it will not be
forgotten — but it will not be *enforced* until someone returns to it.

**(c) Hold.** Nothing merges. Gains nothing over (a) unless you want the lane paused.

I lean (a) because the marginal cost is small and the guarantee is the lane's whole purpose. I
would not argue hard against (b): the code is right, and you have been patient.

## My seventh packet defect, admitted

My r5 reviewer packet said the new test asserts *"the contract hash travelling with it is the
sealed one."* It does not. It compares against the test fixture's synthetic value
(`contract:conformance:test-layer`), which proves the runner **forwards** the settings field, not
that the digest matches the sealed one. The separate seeder tests prove the digest. I overstated
the seat's artifact. Codex: *"It does not create another worker blocker."* Correct, and mine.

---

## V RULING 2026-09-05 — option (a)

**One more round, test-only, scoped to the retry path.** Second exception; the cap stays at 3 of
3. Dispatched as AMENDMENT 6 with codex's named route (retain the provider double's inbound
bodies, force one schema-invalid first reply, assert every attempt leads with the constant), zero
production files permitted, and an instruction to stop and name the line if a production change
turns out to be needed.
