# S3c REWORK 1 — both lenses BLOCK: the mail bound moved instead of closing, the sketch's collateral is catastrophic on the route nobody measured, and the two headline proofs prove nothing

Ticket t_86938dd1, board `accounts-phase1`. Same session **01a019e7**
(`codex exec resume 01a019e7`). Progress log: `logs/S3c-progress.log`.
Verdicts — **read both in full before starting**:
`reviews/S3c-grok-verdict.md`, `reviews/S3c-opus-verdict.md`.

## What is CONFIRMED GOOD and is NOT reopened
Both lenses verified independently, on the live stack:
- **D1 properties 1, 2 and 4 hold.** Bounded memory (4 096 slots × ≤20 depth); an
  at-limit key reopens at *exactly* the ruled window under 144 k requests of
  churn; **0 over-admissions across 200 randomised trials**; max 20 in any sliding
  window, no boundary straddle.
- **D3 holds exactly as documented** — a full object-graph walk found exactly one
  raw-IP occurrence, the declared `refusalAggregates[route].source.ip`.
- **All six VR-10 mutants re-derived RED** by both lenses, reproducing your own
  figures (60-vs-20, 204 096-vs-4 096).
- **The legacy fixtures were not relaxed.** (There are **four**, not three — the
  packet and your log both said three. Correct the count in your handoff.)
- **Token guessing is not a hole**, settled in numbers: 256-bit token, 24 h TTL,
  P ≈ 8.3×10⁻⁶⁷ even at 10⁸ sources. Verify per-source actually *tightened* 30→10.
- **The register-route outage got ~32× more expensive** than HEAD's 196 sources /
  3 901 requests. That is a real win — keep it.
- Gates reproduce (798 tests / 110 files, lint 28/0), VR-3 green, S3b durability
  and the equal-work oracle still green, frozen scope clean by mtime.

Three things block.

---

## B1 (BLOCKER) — the per-address bound did not close, it MOVED; and it is now 15-20× cheaper to deny a victim
Removing per-address admission raised verification mail to one victim address from
the ruled **3/hour** to a measured **60-61/hour** at N≥20 sources, sustained
indefinitely. The attacker creates the pending account itself by registering the
victim's unregistered address (1 mail), then the 60 s cooldown permits 60
resends/hour. Bounded paths, confirmed: duplicate registration sends **0** mail;
resend for an unregistered address sends **0**.

**The harm is worse than the mail volume, and this is the part to design against.**
`prepareVerificationResend` (`packages/db/src/identity.ts:413-419`) **rotates
`verification_token_hash` on every send** — so the measurement is **60 token
rotations/hour vs 3**, and the victim's held token returns
`VERIFICATION_TOKEN_INVALID`. D2 fixed who gets *refused*, but the victim still
cannot verify: the denial simply moved from budget exhaustion to token rotation,
at 20× lower cost. **Do not treat "cap the mail" as sufficient on its own — verify
the victim can still complete verification.**

**What lifts it:** restore a per-address **outbound verification-send** cap of
**≤3/hour** (the ruled number, or a measured replacement you justify) enforced as
an *outbound* bound, **not** as request admission — so D2 stays closed and no
caller is refused for an address someone else named. Capping sends also caps
rotations back to the pre-existing 3/hour, which is what lifts the regression.
**Proof:** drive the shipped `register` / `resendVerification` /
`prepareVerificationResend` path with N≥20 sources over a one-hour clock and show
victim-bound verification mails **≤3** and token rotations **≤3**, while a
legitimate owner is never refused admission.

**Scope:** a cooldown/row-level send budget is enough. **Do NOT absorb an S3d mail-
channel rewrite.** The residual "an attacker can still rotate a pending victim's
token up to the cap" is **pre-existing**, belongs to S3d, and must be written into
your handoff rather than fixed here.

## B2 (BLOCKER) — D1 property 3 is false, and the worst route is the one that was never measured
Your proof sampled a single innocent registration. Both lenses measured
populations, and they disagree with it.

**The mechanism Opus found: the 4 096 slots are shared across routes while the
limits differ (20 / 10 / 3), so the lowest limit governs.** A *register* flood
closes *resend* at depth 3. In **your own saturation state** (your fill, your hash
key, 18 722 sources, 4 096/4 096), on the real stack:

| route | innocents refused |
|---|---|
| register | **0 / 40** |
| verify | 6 / 40 |
| resend | **40 / 40** |

Population probe across three keys: **resend 97.9-99.5%**, verify 10.3-30.4%.
**Your single sample tested the one route that is immune.** Cheapest attack:
16 384 sources × 1 resend/hour = **4.6 req/s → 97.1% of innocent resends refused**.

Grok measured the register route at higher intensity and found the same property
failing there too: 0% collateral at 1 request/source (your cell), **93.75%** at 5,
**99.25%** at 10, **99.75%** at 20 — ~17 k sources × 5 requests puts ~42
increments on each 2 048-wide row against a limit of 20.

**What lifts it — all three:**
1. **Stop one route's traffic consuming another's budget.** Slots shared across
   routes with different limits means the smallest limit dominates. Per-route
   structures, or per-route sizing, or a keying scheme that separates them — you
   choose and justify.
2. **Size the structure against a STATED threat model**, and show the arithmetic:
   for a chosen slot count W, collateral stays low while attacker sources × requests
   stays under roughly `W × limit`. Memory here is cheap — state what you are
   buying and at what cost. A number chosen because it passed one test is what
   produced this finding.
3. **Publish the measured false-refusal curve on an operator-visible surface**
   (policy `sourceRef`, runbook, or a structured residual) — **per route**, at
   1/5/10/20 requests per source, several hundred innocents. If any residual
   remains after resizing, state it in numbers rather than leaving it implicit.
   A design whose availability failure mode is undocumented is not acceptable even
   when the mode is understood.

## B3 (BLOCKER) — both headline D1 proofs pass against a limiter with no rate limiting at all
`tests/unit/registration.test.ts:391` and
`tests/integration/registration-database.test.ts:718` **saturate first, then assert
refusal** — and at 4 096/4 096 *everything* is refused, so the assertion cannot
distinguish a working limiter from a no-op one. Both stay GREEN against a limiter
stripped of per-key limiting entirely. The implementation is fine (the suite kills
that mutant elsewhere), but **the cited proof proves nothing**, which is the exact
F1 defect class this mission keeps hitting — and the third ticket in a row to hit it.

**What lifts it:** restructure both so the flood assertion holds **without prior
saturation**, and mutation-test it: against a no-op limiter the test must go RED.

## Record (not blocking)
`per_ip` 20/30/15 and `per_address` 5/10/3 (`auth-policy.ts:119-125`) are still
required by the schema but **no product code reads them**. Either wire them to the
new design or retire them with provenance — a ruled row that governs nothing is a
trap for the next reader.

---

## VR-10 — STANDING RULE
Every security assertion mutation-tested: break it, run it, show RED, include the
evidence. **This round explicitly includes the tests fixed under B3** and the new
B1/B2 assertions. Your six existing mutants were verified real by both lenses —
that discipline is working; extend it to the assertions that were not covered.

## Proof discipline
Real stack, production policy parameters, **and no harness that arranges the world
so the assertion cannot fail** — B3 is precisely that, and S3b's timing test was
too. Before you submit, ask of each new assertion: *what state would make this pass
for the wrong reason?*

## File contract
`apps/api/src/registration.ts`, `packages/register/src/auth-policy.ts` (additive,
with provenance), a new module under `apps/api/src/` if you extract the limiter,
`packages/db/src/identity.ts` **only** as far as the outbound send-cap requires,
and tests. **DO NOT** touch S3a, S3b's durability/oracle work, the S3d mail-channel
or cooldown semantics beyond the send cap, T4's refusal attribution, crypto, or the
identity schema. If the contract must widen, STOP and post `CODEX BLOCKED`.

## Gates before REWORK READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, RED-first evidence per blocker,
VR-10 mutation evidence including the B3 rewrites, the per-route collateral table,
and the measured mail/rotation ceilings. Post `REWORK READY FOR PEER REVIEW`.

## Return rule
Return at `REWORK READY FOR PEER REVIEW`, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Same session. Do NOT commit or push.
