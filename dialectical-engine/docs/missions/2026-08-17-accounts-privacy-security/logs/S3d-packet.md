# Goal packet — S3d · Mail channel + verification cooldown (last of the VR-9 split)

Board `accounts-phase1`, ticket t_cc197ed2. Coder: Codex (gpt-5.6-sol, xhigh).
Same session **01a019e7**. Progress log: `logs/S3d-progress.log`.
**S3a, S3b and S3c are CLOSED and dual-greenlit** (commits cff3dd5, b2324d6) — do
not touch their work. Read the ticket's accumulated comments first; several of
these defects were found by lenses reviewing other tickets and handed to you.

## What S3c already did for you (verify, don't redo)
S3c moved the per-address bound onto the **outbound send**: a row-level 20-minute
spacing giving 3 verification mails per rolling hour, written inside
`prepareVerificationResend`'s transaction (`packages/db/src/identity.ts:415-417`).
That is the shape old blocker B3 asked for, and it is dual-greenlit. **Confirm the
cooldown is genuinely written in the token-minting transaction and re-measure the
3/hour ceiling before assuming it — then leave it alone.**

---

## D1 (BLOCKER) — an unbounded in-memory Set holding raw verification tokens
`apps/api/src/registration.ts:370` — `pendingMailDispatches = new Set<Promise<void>>()`.
Measured under a hanging transport: **100 / 200 / 300 / 400 entries and climbing**,
each retained entry holding **plaintext email, the raw verification token, and the
raw source IP**.

The raw token is the sharp part. Everywhere else in this system the token is stored
only as a hash (`verification_token_hash`); here the **working credential itself**
sits in process memory for as long as a slow or hung MTA keeps the promise alive,
with no bound on how many accumulate. Anyone with heap access — a core dump, a
memory-disclosure bug, a debugger — gets live verification links.

**Requirements:**
1. **Bound the structure.** A ruled maximum concurrent in-flight dispatches; what
   happens at the bound is your design (refuse, queue with a cap, shed) but it must
   be deliberate and it must not lose an account or silently drop a promised mail.
2. **Minimise the retained payload.** The raw token must not outlive the send
   attempt; nor should plaintext email and raw IP sit in a process-local structure
   longer than the dispatch needs them. If a retry needs a token, re-derive or
   re-read it rather than holding it.
3. **A hung transport must not grow memory without limit.** S3c's limiter is now
   flat and bounded; this Set is the growing structure beside it.

**Proof (real stack):** with a transport that hangs, drive sustained registrations
and show in-flight dispatches stay at the ruled bound and RSS plateaus; and walk
the object graph to show **zero raw tokens retained** outside an active send.

## D2 (BLOCKER) — an attacker can invalidate the rightful owner's verification link
`prepareVerificationResend` **rotates `verification_token_hash` on every send**
(`identity.ts:415-416`). Both lenses measured the consequence: under attack the
owner *can* complete verification, but **not with the token they hold** — only the
newest mailed token works, and the older link returns `VERIFICATION_TOKEN_INVALID`.
S3c bounded the *rate* to the ruled 3/hour, so this is no worse than ruled — but it
was explicitly deferred to you, and the property is wrong: **a third party who
names an address can invalidate a link the rightful owner is holding.**

**The property to reach:** a person who received a verification link can use it,
and nobody else's actions can take that away. How you get there is your design —
resending the same token until it expires, honouring the previous token for a
window, or another shape — but state the reasoning, and consider the case rotation
was presumably protecting against (a token believed leaked). If the two goals
genuinely conflict, say so with the trade rather than picking silently.

**Proof:** owner registers and holds link A; an attacker triggers the full 3/hour
of resends; **link A still verifies.** Plus whatever your design implies about
token lifetime.

## D3 (BLOCKER) — the first email must not ship a dead link
The historical defect: the resend UPDATE rotated the token hash **before** the
registration mail was dispatched, so the user's first email arrived already
invalid. S3c reshaped this path. **Reproduce against current code first** — RED or
not — and state plainly whether it is still live. If it is fixed, prove it and say
which change fixed it. If it is live, fix it and prove register→immediate-resend
leaves the first link valid or deliberately superseded, never silently dead.

## D4 (BLOCKER) — a failed delivery record must not permanently disable the cooldown
Historically `dispatchVerification` swallowed record failures, so one failure left
`verification_last_sent_at` NULL **forever** and the cooldown inert for that
account. Re-check on current code: if a delivery record fails, is the cooldown
still enforced for that account on the next attempt? A cooldown that a single
transient error disables permanently is a rate-limit bypass with no alarm.

**Proof:** inject a delivery-record failure; show the cooldown still holds
afterwards, and that the failure is audited with a correlation id (never the email,
never the raw IP/UA).

## Also fold in
- **Delivery honesty.** When mail genuinely cannot be sent, what does the user
  learn, and what does the operator learn? A promised email that never arrives with
  no operator signal is the S3b lesson in a different place. Do not leak whether
  the address exists — coordinate with S3b's equal-work property, which is
  dual-greenlit and must not regress.
- `SendmailMailSender` already validates recipient shape, rejects CRLF, passes
  `--` before the recipient, and kills on timeout (`apps/api/src/mail-channel.ts`).
  **Confirm it, don't rewrite it.** If you find a genuine injection or
  argument-smuggling hole, that is a finding — say so with a repro.

## VR-10 — STANDING RULE
Every security assertion mutation-tested: break the implementation, run the
guarding test, show it goes **RED**, include the evidence. Three tickets running
have shipped assertions that could not fail for their believed reason — S3c's two
headline flood proofs passed against a limiter with **no rate limiting at all**
because they saturated first and then asserted refusal. **Before submitting, ask of
each assertion: what state would make this pass for the wrong reason?**

## Proof discipline
Real stack, production policy parameters, no harness that suppresses the effect
under test. Thresholds derived from a measured null, not chosen because the
achievable result clears them.

## File contract
`apps/api/src/registration.ts` (dispatch/drain path), `apps/api/src/mail-channel.ts`,
`packages/db/src/identity.ts` (delivery/cooldown/token lifecycle only),
`packages/register/src/auth-policy.ts` (additive ruled rows with provenance),
migrations if genuinely required (additive only), and tests. **DO NOT** touch S3a,
S3b's durability/oracle work, S3c's limiter or its ruled row, T4's refusal
attribution, crypto, or the identity schema beyond what the above requires.
**T9 (t_6ff49601) is NOT yours** — the resend deadlock surfacing as an untyped 500
and reopening the address-existence oracle is separately ticketed and pre-existing.
If the contract must widen, STOP and post `CODEX BLOCKED`.

## Gates before READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, per-defect RED→GREEN evidence,
VR-10 mutation evidence, the measured in-flight bound and RSS plateau, and the
3/hour ceiling re-measured. Post `READY FOR PEER REVIEW`.

## Return rule
Return at READY FOR PEER REVIEW, `CODEX BLOCKED` (+ exact reason), or an IMPORTANT
OPERATION. Same session. Do NOT commit or push.
