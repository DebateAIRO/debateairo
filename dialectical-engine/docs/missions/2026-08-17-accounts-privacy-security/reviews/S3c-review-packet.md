# S3c dual-diamond review packet — rate limiter re-cut (counting sketch + source-owned admission)

Ticket t_86938dd1, board `accounts-phase1`. Author: Codex, session 01a019e7, run 7.
You are ONE of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on
source; running tests is REQUIRED — a blocking lens must have run the live world.
You may stand up your own isolated Postgres. Establish the true change set from
**file mtimes** (`find -mmin` / `stat`), never `git diff`; HEAD is cff3dd5 and
S3a/S3b are closed and dual-greenlit — anything of theirs that moved is a finding.

Contract: `logs/S3c-packet.md`. Author's evidence: `logs/S3c-progress.log`.

## What Codex claims
**D1** — replaced the saturating bucket map with a **keyed two-row, 4 096-slot
counting sketch**: no eviction, no reassignment, at-limit keys never forgiven,
collision loss only ever over-counts, and saturation cannot refuse an under-limit
key merely for being new. RED first: filling the legacy 4 096-entry map with
2 048 one-request sources made a fresh registration return `AUTH_RATE_LIMITED`
with 0 rows persisted; the optimised capacity attack measured **196 IPs / 3 901
requests** (the packet's rough ~103 estimate was low — Codex corrected it, which
is the right behaviour).

**D2** — **removed per-address admission entirely.** Public admission is now
source-owned only: register/verify/resend = **20 / 10 / 3** per source. Outbound
throttling is left to the **unchanged channel cooldown**. RED first: at the old
ruled per-address budgets, 5 attacker requests blocked the rightful registration
and 10 blocked the rightful verification.

**D3** — raw bucket keys are no longer retained; the raw source inside
`RefusalAggregate` is documented as a bounded residual.

Six VR-10 mutants killed and restored byte-for-byte. Gates: typecheck, lint 28
edges / 0 violations, `git diff --check`, **798 tests / 110 files**. Claimed clean
evidence: floods stayed refused at 4 096/4 096 occupancy (register 60/60 beyond
limit 20, verify 30/30 beyond 10, resend 9/9 beyond 3); a fresh innocent
registration **after 18 722-source saturation** succeeded and persisted.

---

## PRIMARY QUESTION 1 — did removing per-address admission open an email-bombing or token-brute-force vector?
This is the load-bearing decision of the ticket and it is a **trade**, not a pure
fix. The per-address limit was weaponisable against the address owner (that was
D2), but it was also the only thing bounding *per-address* abuse. It is gone, and
"the cooldown handles it" is an assertion that must be tested, not accepted.

Work out and **measure**, before vs after, for an attacker holding N source
addresses (state N):
1. **Maximum verification emails deliverable to one victim address per hour.**
   The old resend budget was **3/hour**; a 60 s cooldown permits **60/hour**. If
   the effective ceiling went up, say so with numbers — that is a regression even
   though it fixes D2. Check the registration path too (does a duplicate address
   dispatch mail? does an unregistered victim address?).
2. **Verification-token guessing.** The old per-address verify budget (10) bounded
   attempts against a *specific* account. With source-only limits, an attacker
   with many sources gets many attempts per account. Is the token's entropy and
   TTL sufficient that this is irrelevant? Compute it — do not assume. If it is
   fine, say why in numbers.
3. Does any other per-address protection disappear with it?

If the cooldown genuinely covers this, GREENLIGHT it and record the reasoning. If
it does not, that is a BLOCK with the measured ceiling.

## PRIMARY QUESTION 2 — the sketch's collateral-refusal rate, measured on a population, not one user
The packet accepted over-counting as the safe degradation direction, so
collisions refusing innocents is expected *by design* — but the magnitude is
unmeasured. The proof "a fresh innocent registration after 18 722-source
saturation succeeded" is a **single sample**, and 18 722 sources over 4 096 slots
is ~4.5 sources per slot.

**Measure the false-refusal rate across a population of innocent users while a
saturating attack runs** — e.g. several hundred fresh sources, report the fraction
refused, at a few attack intensities. Then judge: is that rate acceptable
availability, and is it *stated anywhere* an operator would see? A design whose
collateral rate is unknown is not obviously better than the deterministic lockout
it replaced. Also probe the two-row minimum — construct adversarial keys that
collide in both rows if you can, and report what it takes.

## Also attack
- **The three "legacy audit-only fixtures" Codex updated** to opt into a
  one-request source limit after address admission was removed. Read those diffs
  closely: a test relaxed to make a change pass is exactly the F1 pattern this
  mission keeps hitting. Confirm each still asserts what it originally asserted.
- **Verify the four D1 properties actually hold in the code**, not just in the
  tests: bounded memory under any traffic; an at/over-limit key is never forgiven
  early (probe the metastable slide that broke round 2 — sweep/decay must not
  reopen a saturated key); saturation never refuses an under-limit key; lost
  information only over-counts. The round-4 refuter showed "evict at most once per
  consume" was insufficient — apply the same suspicion to the sketch's decay/window
  handling.
- **Re-derive the VR-10 mutants yourself.** Break it, run the guarding test,
  confirm RED. Both prior tickets shipped tests that passed against broken code.
- **Window/expiry correctness:** sliding window vs fixed tiers, clock handling, and
  whether a key can straddle a boundary to get double budget.
- **D3:** confirm no raw IP is retained in the sketch, and that the documented
  `RefusalAggregate` residual is the *only* one. Check the object graph yourself.
- **Frozen scope by mtime:** S3a, S3b (durability + the equal-work oracle fix),
  S3d mail/cooldown, T4 refusal attribution, crypto, identity schema, lockfile.
  Re-run the S3b oracle and durability tests — a limiter change sits directly on
  the registration path and could perturb either.
- Gates reproduce (798 tests, lint 28/0), and VR-3 still holds.

## Verdict
Write `reviews/S3c-<lens>-verdict.md`: GREENLIGHT or BLOCK + numbered findings with
file:line evidence and measured numbers. If BLOCK, state exactly what proof lifts
it. Restore any mutation you apply; confirm the tree is byte-identical. No commit,
no push.
