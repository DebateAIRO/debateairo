# V DECISIONS PACKET — V-SEALEDROWS-1

**Why this reaches you:** the lane spent all three rework rounds. Round 4 is not authorized, so
this is a decision rather than another attempt.

**One decision needed.** Two other findings are already ticketed as follow-up and need nothing
from you: `F-SEALEDROWS-F`, `F-SEALEDROWS-G`.

## What the lane was for

The setup routines fingerprint the checker's prompt so a silent edit to that wording cannot pass
unnoticed. That only means anything if **the prompt we fingerprint is the prompt we actually
send.** Four attempts to guarantee it failed; the fifth deleted the problem by making the prompt a
named constant that is both fingerprinted and sent.

## What is genuinely closed

- **The two setup routines are protected behaviourally, not textually.** A test replaces the
  constant with a marker and requires both fingerprints to follow it. A routine that searches
  source text keeps hashing the real prompt and fails. Codex confirms this kills its own earlier
  bypass.
- **The prompt/parser agreement check is restored and reads live definitions**, so adding,
  renaming or removing a criterion turns the suite red. Codex verified all three directions.
- **The value has not moved**: 339 bytes, sha256 `2364b1b5…`, both deployments equal to it and
  different from the writer's. **No re-seeding.** Your ruling holds exactly.
- **The mutation tool over-admission is fixed**, verified against six abort shapes: the valid one
  passes, five invalid ones are rejected, both real campaigns still pass.
- **Suites:** `13 failed | 1533 passed (1546)` three times identically, against a base of
  `13 failed | 1505 passed (1518)`. Zero new failures, 28 added tests all passing, typecheck 0.

## The one thing that is NOT closed

The check proving **the runner sends what it fingerprints** still reads the runner's source as
TEXT. Codex built the counterexample and evaluated the current predicates against it: put the
expected lines inside a COMMENT, re-export the real constant under its expected name, and wire the
actual call to a different variable. **Every check passes. The AI receives a different prompt.**

It also rejects harmless changes — a multiline initializer, an aliased import, reordered fields —
so a legitimate tidy-up will fail it one day for no real reason.

The fix codex specifies: observe the request **at the point it leaves for the provider** and
assert its system message is the exported value. Behavioural, like the seeder test that already
works — not another text search.

**Honest risk assessment.** Triggering the hole takes a deliberate decoy comment plus a rewired
call; it will not happen by accident. The false-alarm side is the likelier nuisance. But this lane
exists because a silent hashed-A-sent-B mismatch happened by accident three times, and the check
meant to prevent it is currently unenforced on the half that matters most.

## Options

**(a) Authorize ONE post-cap round, scoped to this only. — RECOMMENDED.** The fix is specified,
the seat holds the context and every file, and the seeder test proves it already knows how to
write a behavioural check. Cost: one round. This is the option that makes the lane's central
claim true.

**(b) Merge now, ticket it as follow-up.** Everything else is verified and the demonstration run
is waiting behind the next lane. Accepts that the runner-send guarantee is documented but
unenforced until someone returns to it — and this mission's record says that class comes back.

**(c) Hold the lane at CHANGES.** Nothing merges, nothing is lost, and the work resumes when you
choose. Costs the most time and gains nothing over (a) unless you want the lane paused for a
reason outside this packet.

## My six packet defects in this lane, for the record

Codex found no seventh. All six are one habit: **I stated an outcome without checking the contract
could reach it, or relayed a claim without verifying it.**
PD-1 (missing authority) · P1 (false diff constant) · P2 (unprovable byte-identity claim) ·
P3 (dispatched a ticket that could not be finished) · the false TypeScript premise ·
and AMENDMENT 4 requiring a runtime check from a private schema while forbidding the export that
makes it possible.

---

## V RULING 2026-09-04 — option (a)

**One post-cap round, scoped to B1 alone.** The rework cap stays at 3 of 3; this is an exception
V spent a decision on, not a fourth round. Dispatched as AMENDMENT 5, which names what is closed
and forbids reopening it, forbids another source-text pattern, and instructs the seat to stop and
report BLOCKED rather than approximate the claim a fifth time.
