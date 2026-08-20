# S3d REWORK 1 — re-review packet (arm-independent handoff lease, real proofs, bounded refusal path)

Ticket t_cc197ed2, board `accounts-phase1`. Author: Codex, session 01a019e7.
ONE of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on source;
running tests REQUIRED. Change set from **mtimes** — **`git diff` is blind in this
repo** (`migrations/0033` is untracked). HEAD b2324d6. Verdict to
`reviews/S3d-r1-<lens>-verdict.md`. No commit, no push.

## MANDATORY — concurrency protocol (new, and it is not optional)
**The other lens is reviewing the same working tree at the same time, and both of
you apply mutations.** In the previous round a lens found `identity.ts` changed
underneath it mid-measurement. It caught this by hash divergence and recovered
correctly — that recovery is now the required protocol:

1. **Before any work**, record `sha256` for every file you may touch. That is your
   **gold baseline**; write it into your verdict.
2. **Apply mutations one at a time**, and after each restore, re-verify against
   gold.
3. **If you observe a divergence you did not cause**, do not proceed on it: note
   it, re-establish a verified-gold baseline, and **re-run any mutant whose result
   could depend on it**. State in your verdict that this happened and what you
   re-ran.
4. Confirm at the end that the tree is byte-identical to gold.

Codex records its own gold hashes in `logs/S3d-progress.log` — registration
`478f4e5c`, mail-channel `7e35e6f`, identity `c57266d3`, auth-policy `3b576d34`,
migration `34fadf7c`. Cross-check yours against those.

---

## Scope: D1 only. D2, D3, D4 are frozen — both lenses confirmed them last round.
Confirm they survived, but do not re-litigate: 73 = 1 + 24 h/20 min, sibling
invalidation on consume, deletion cascading with 0 orphans, S3c's
creation-transaction cooldown fix, and D4's audit behaviour.

## What Codex claims
**RED first** (its own harness, balanced mail, n=30): register **AUC 0.8733 /
accuracy 0.8833** vs same-arm null 0.5244/0.5667; resend **0.9200 / 0.9000** vs
null 0.5733/0.6000; queued caller still PENDING past 18 s; 2 000 refusals grew RSS
173.7 → 199.0 MiB (**15.703 MiB spread against a 0.109 MiB ceiling**) and emitted
2 000 retained signals; the ruled-row truth test RED on the false resolver-only
claim.

**Fixes.** An **arm-independent 5.1 s minimum on saturation handoffs**; queued
callers expire at **18 s** with the same opaque `AUTH_MAIL_BUSY`/503; capacity
signals **coalesced to one bounded 60 s window**; the ruled row now names opaque
queue nodes plus validated plaintext retained in suspended frames **only until
grant/timeout**; the vacuous JSON token scan replaced with a **positive-control V8
heap snapshot**; a fixed-source 2 000-refusal proof that isolates D1 from S3c's
demand-paged sketch; a CRLF defence-in-depth comment; sibling-family assertions.

**Final:** register **AUC 0.5367 / accuracy 0.6833** vs null 0.5867/0.6000; resend
**0.5833 / 0.6167** vs null 0.5244/0.6000; **92/92 sends in both arms**; queue
returned opaque 503 at 18 005.6 ms; heap proof retained exactly 32/32 active tokens
and zero outside active sends; across 2 000 refusals RSS 393.9/394.1/394.0/394.0,
**plateau spread 0.172 MiB against a fixed 0.625 MiB ceiling**, one coalesced
signal; siblings 4/4 `consumed_at`, 3/3 invalidated. Gates **815 tests / 110
files**.

VR-10, all RED then restored: zeroing the lease → **AUC and accuracy 1.0000**;
doubling the queue timeout → PENDING at 18.25 s; restoring per-refusal signals →
2 250 signals, 0.922 spread > 0.875 ceiling; retaining one raw token per waiter →
heap proof sees **128 token strings vs 32 active**; restoring the false
resolver-only row → RED; disabling family `consumed_at` → 0/4 vs 4/4.

**Codex corrected its own CRLF claim honestly:** removing only the explicit clause
stays GREEN because the whitespace regex shadows it; with a widened regex the
clause keeps the test GREEN and removing it goes RED.

---

## PRIMARY QUESTION 1 — is the oracle closed under YOUR harness, not just Codex's?
**Codex's RED reproduction was materially weaker than the block that produced it**
— it measured AUC 0.87/0.92 where the blocking lens measured **1.0000**. That gap
matters: **if Codex's harness is less sensitive, its GREEN numbers are less
trustworthy too.** Do not accept 0.5367 on Codex's instrument.

Re-measure **black-box with your own harness**, production policy, at the
saturation boundary, on **both register and resend**: AUC and best-single-threshold
accuracy against a **same-arm null**, plus sends-per-round equality. Explain the
sensitivity gap if you can. **If your harness still separates the arms, that is a
BLOCK** regardless of Codex's numbers.

Probe specifically the mechanism that was broken: the *next* caller's admission
time as a function of the *previous* caller's arm, and the resend path where a
non-existent address previously released in 0 ms.

## PRIMARY QUESTION 2 — what does the 5.1 s lease cost, and does the 18 s expiry leak?
The fix equalises by making **every** saturation handoff wait 5.1 s.
1. **Throughput and latency under saturation** — what does a legitimate user
   experience? Quantify. 7 source IPs were enough to fill 128 slots; with a 5.1 s
   lease, what is the sustained cost of holding registration degraded, and is that
   a worse availability trade than what it replaced?
2. **Does the 18 s expiry leak the arm** — by timing, by which callers expire, or
   by the order in which the queue drains? Measure it as a channel, don't reason
   about it.
3. Is the queue **FIFO and starvation-free**, or can a stream of new arrivals
   starve a queued caller?
4. Does the lease interact with S3b's 600 ms clamp or S3c's limiter in a way that
   reopens either property? **Re-run S3b's oracle and durability tests.**

## Also attack
- **Signal coalescing to one 60 s window** — the refusal audit is how an operator
  learns they are under attack. One signal per 60 s: is that still enough to detect
  and size an attack, or has a memory fix blinded the alarm? Say what an operator
  sees during a sustained flood.
- **The RSS ceiling is now claimed wave-size-independent** — verify that
  structurally, then push **past** 2 000 refusals and confirm the plateau holds.
  The previous ceiling was `3 × null` tested against exactly 3 waves.
- **The heap-snapshot proof** — re-derive it. Retain a token yourself and confirm
  it goes RED. A positive control is only worth its own verification.
- **The ruled row's new retention statement** — measure whether it is now TRUE, in
  the same way the old one was measured FALSE (96/96 plaintext emails, 96/96 raw
  IPs in suspended frames). Does "only until grant/timeout" hold in fact?
- **The 2 000-refusal proof "isolates D1 from S3c's demand-paged sketch"** —
  scrutinise that isolation. An isolation that excludes the thing under test is the
  defect class this ticket is being reworked for.
- Frozen scope by mtime: S3a, S3b, S3c's limiter and ruled row, T4, crypto,
  identity schema beyond the additive ledger. **T9 (t_6ff49601) out of scope** —
  confirm untouched, do not re-report.
- Gates reproduce (815 tests / 110 files); VR-3 holds.

## Verdict
GREENLIGHT or BLOCK + numbered findings with file:line evidence and measured
numbers. If BLOCK, state exactly what proof lifts it.
