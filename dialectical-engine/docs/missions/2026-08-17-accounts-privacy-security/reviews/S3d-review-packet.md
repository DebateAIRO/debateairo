# S3d dual-diamond review packet — mail dispatch bound, multi-token verification, cooldown durability

Ticket t_cc197ed2, board `accounts-phase1`. Author: Codex, session 01a019e7.
ONE of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on source;
running tests REQUIRED — a blocking lens must have run the live world. Establish
the change set from **mtimes** (`find -mmin` / `stat` / sha256), never `git diff`.
HEAD is **b2324d6**; S3a/S3b/S3c are closed and dual-greenlit, so anything of
theirs that moved is a finding. Restore any mutation, confirm byte-identity. No
commit, no push. Verdict to `reviews/S3d-<lens>-verdict.md`.

Contract: `logs/S3d-packet.md`. Author's evidence: `logs/S3d-progress.log`.

## What Codex claims
**Reproduce-first (RED baseline, real Postgres, production policy):** D1 accepted
64/64 hanging registrations retaining 64 in-flight promises, RSS 165.9→187.1 MiB;
D2 link A became `VERIFICATION_TOKEN_INVALID` after 3 permitted resends; D4 wrote
**0** durable delivery-record-failure audit rows. **D3 characterised as already
GREEN** on current code — immediate resend emitted 1 mail and link A activated.

**D1 — bounded dispatch.** 32 active dispatches + **96 bounded pre-mint
resolver-only waiters**; beyond that, opaque 503 refusals. Final measurement under
a hanging transport: attempts 162, admitted 128, deliberate opaque busy 34,
active 32, queued 96/96, **raw tokens outside an active send = 0**, committed at
saturation 32 and after drain 128, RSS 171.0 → 171.4 (null 8) → 172.3 MiB —
sustained growth **+0.9 MiB against a 1.188 MiB null-derived ceiling**.

**D2 — multiple live tokens instead of rotate-and-invalidate.** Link A stays valid
after 3 attacker resends; 81 tokens issued over 26 h prune to **72 live hashes
against a ruled bound of 73**; newest active, oldest expired. Codex states a
leaked-token tradeoff in its handoff.

**D3** — one immediate mail, link active. **D4** — cooldown held and one opaque
hashed-source fallback audit persisted.

**A self-caught cross-ticket regression.** The first D1 design (32-only refusal)
**broke frozen S3b's 100-request durable burst**. Codex found it in the full suite
and reworked to 32 active + 96 queued, also permitting both prefixed and raw
SHA-256 hex at the repository boundary and updating the table inventory, stating no
frozen product behaviour was weakened.

VR-10: a long mutant list all RED then restored — dispatch cap removed (66
in-flight), current-token-only consume (link A invalid), expiry pruning disabled
(81 live > 73), creation-transaction cooldown cleared, fallback audit removed,
failed delivery marked sent, recipient/CRLF validation disabled, sendmail `--`
removed, sendmail timeout disabled, ruled dispatch drifted 32→31 and hash bound
73→72, outbound cooldown disabled (61 sends, rolling max 60), a 33rd active
dispatch, queue policy drift 96→97. Gates: **812 tests / 110 files** in 238 s,
typecheck, lint, scoped diff-check and mutation-residue scan clean.

---

## PRIMARY QUESTION 1 — does the new refusal shape leak whether an address exists?
D1 now refuses with an **opaque 503** once 32 active + 96 queued is exceeded, and
S3b's dual-greenlit equal-work property says an outsider must not be able to
distinguish an existing address from a new one. **A saturation-dependent refusal is
exactly the kind of side channel that reopened this before** (T9 does it via
deadlock-induced 500s).

Measure it: drive the dispatcher to saturation and compare **existing vs
non-existent addresses** on status code, timing distribution, refusal rate, and any
observable difference. Use the same separation statistic S3b established (best
single-threshold classifier / AUC against a same-arm null), not a range check.
**If saturation is reachable more cheaply for one arm than the other, that is a
BLOCK.** Also: is saturation itself cheap enough to be an availability attack —
what does it cost to hold 128 slots?

## PRIMARY QUESTION 2 — is "many live tokens" actually safe, and is the trade honestly stated?
D2 was fixed by keeping **up to 73 live token hashes per address** rather than
rotating. That resolves the denial, but it inverts the property rotation provided:
**the owner can no longer invalidate a token they believe leaked** — every old link
stays live until TTL.

1. Confirm the arithmetic and the bound: where does 73 come from, is pruning
   correct at the edges (expiry boundary, consumption, account deletion), and can
   the live set be driven above the bound by any sequence?
2. **Is a consumed token invalidated, and are its siblings?** After successful
   verification, do the other 72 links still work? State what happens.
3. Does this interact with **VR-3 erasure** or account deletion — are stale token
   hashes cleaned up?
4. **Judge the leaked-token trade on its merits** and say whether Codex's stated
   reasoning is adequate, or whether this needs V's ruling rather than a coder's
   choice. Say so plainly if you think it is a product decision.
5. Token entropy is settled (256-bit, P≈8.3×10⁻⁶⁷) — but re-check that 73 live
   tokens does not change that materially.

## Also attack
- **Verify the self-caught regression is genuinely repaired**, not merely
  accommodated: re-run S3b's 100-request durable burst and F3 yourself, and confirm
  the equal-work oracle test still passes. Codex changed the repository boundary to
  permit **both prefixed and raw SHA-256 hex** — scrutinise that. Widening what a
  security boundary accepts to make a test pass is the pattern this mission keeps
  hitting; confirm it does not weaken the audit rejection S3b's F3 relies on.
- **The null-derived RSS ceiling** (+0.9 MiB against 1.188): check the null
  derivation is honest and the measurement resolution real, and push occupancy
  past what Codex tested.
- **D3's "already fixed" claim** — verify independently that the first email's link
  is live, and identify which change fixed it. An unverified "characterised GREEN"
  is a claim, not a proof.
- **D4** — inject your own delivery-record failure; confirm the cooldown still
  holds and the audit carries a correlation id with **no email, no raw IP/UA**.
- **Re-derive the VR-10 mutants yourself**, especially the four sendmail-hardening
  ones (recipient validation, CRLF, `--`, timeout). Those prove existing hardening
  is load-bearing — confirm they really go RED.
- **The queue holds "pre-mint resolver-only waiters"** — verify no raw token,
  plaintext email or raw IP is retained in the queue, by walking the object graph
  under load, not by reading the code.
- Frozen scope by mtime: S3a, S3b, S3c's limiter and its ruled row, T4, crypto,
  identity schema beyond the additive ledger. **T9 (t_6ff49601) is out of scope** —
  confirm untouched, do not re-report.
- Gates reproduce (812 tests / 110 files); VR-3 holds.

## Verdict
GREENLIGHT or BLOCK + numbered findings with file:line evidence and measured
numbers. If BLOCK, state exactly what proof lifts it.
