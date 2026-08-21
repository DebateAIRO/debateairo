# S3d REWORK 1 — the dispatch bound reopened the enumeration oracle at AUC 1.0000, and three of its proofs cannot fail

Ticket t_cc197ed2, board `accounts-phase1`. Same session **01a019e7**. Progress
log: `logs/S3d-progress.log`. Verdicts — **read both in full first**:
`reviews/S3d-opus-verdict.md` (BLOCK), `reviews/S3d-grok-verdict.md` (GREENLIGHT).

## CONFIRMED GOOD — D2, D3, D4 held under everything both lenses threw at them. Frozen.
- **D2 is sound.** `73 = 1 + 24 h/20 min` confirmed; a lens hit exactly 73 at the
  true cooldown edge over 120 resends (**your 72 was one short of the edge**) and
  could not exceed it, including 12-way concurrent resends. **Consuming one token
  kills all 72 siblings** (`identity.ts:401-404` plus the `user_state` gate) —
  measured 4/4 `consumed_at` set, siblings `VERIFICATION_TOKEN_INVALID`. Deletion
  cascades with **0 orphans**. 73 live tokens costs **6.19 bits of 256** —
  immaterial. Your trade statement is adequate and better than what it replaced.
- **D3** — the fix is S3c's creation-transaction cooldown (`identity.ts:212`),
  mutation-confirmed, now doubly protected by the D2 ledger. Your
  characterisation was right.
- **D4** — held under a real Postgres trigger injection, with a clean
  correlation-id audit.
- The migration CHECK widening **is** load-bearing for F3 and does **not** weaken
  the audit rejection. 12 of 14 VR-10 mutants re-derived RED. Gates reproduce.
  Frozen scope clean; T9 untouched.

**Everything below is D1.**

---

## B1 (BLOCKER) — the slot release is arm-dependent, giving a perfect existence oracle
The 503 itself is clean — both arms return 100% `AUTH_MAIL_BUSY`/503, cross-arm
**AUC 0.6433** against a same-arm null of 0.6356 — because `reserveMailDispatch`
runs *before* the arm is known. That part is right.

**But the release is not.** An existing address takes the duplicate-postwork path
(`registration.ts:536-540`); a new one does a full mail send (`:626-631`); and on
resend a non-existent address releases **immediately with zero mail work**
(`:820-825`). Because a freed slot goes straight to the head of the wait queue
(`:468-474`), **the next caller's admission time is a function of the previous
caller's arm.**

Measured black-box, production policy, real 600 ms clamp:

| | target exists | target does not |
|---|---|---|
| marker latency | **602 ms** | **1999 ms** |
| slot hold (resend) | 1582 ms | **0 ms** |

**AUC 1.0000. Best-single-threshold accuracy 1.0000.** Separation 1397 ms against
a same-arm null AUC of 0.7778. Sends per round were 33 vs 34 — **provably unequal
work**. This is S3b's dual-greenlit equal-work property defeated through a new
channel, and it is the third distinct route to the same oracle in this mission.

**What lifts it:** make slot occupancy and release independent of the arm — equal
hold time and equal work per slot regardless of whether the address exists, or a
handoff that does not let the previous caller's arm time the next admission.
**Proof:** the same black-box measurement, reporting **AUC and best-threshold
accuracy against a same-arm null** at the saturation boundary on both register and
resend, with sends-per-round equal. **VR-10:** reintroduce the asymmetry and show
the new assertion goes RED.

**Also:** a queued request has **no dispatcher deadline** — still queued after 15 s
under a hung transport — and 7 source IPs fill all 128 slots. Give queued work a
bounded wait, and say what the caller gets when it expires (without leaking the
arm).

## B2 (BLOCKER) — the ruled row states a retention property that is false
`auth-policy.ts:362` publishes `retained_payload: "…WAIT_QUEUE_RESOLVERS_ONLY"`.
Measured: **96/96 queued plaintext emails and 96/96 raw source IPs are resident**
in the suspended `register` frames. The queue does not hold "resolvers only"; the
suspended closures hold the caller's data.

D1's requirement was to **minimise the retained payload**, so prefer fixing the
retention over correcting the claim — but if the data genuinely must be held to
resume the request, then the ruled row must say **exactly** what is retained and
for how long. **A published claim that is false is worse than no claim** — that is
the same defect S3c's r2/r3 rounds were about.

## B3 (BLOCKER) — three D1 proofs cannot fail for their believed reason
The exact class the packet warned about, in the ticket that was warned:
1. **`rawTokensOutsideActiveSend = 0`** searches a **719-byte string containing
   only `{}` and `null`** — it cannot fail. *(The property is nonetheless TRUE: a
   lens re-proved it with a V8 heap snapshot, 32/32 active tokens and no others.
   Keep the property; the assertion is what is broken.)*
2. **The RSS "null-derived ceiling" is `3 × null(8)` asserted against a wave of
   exactly 3×8** — it permits linear growth by construction. And the growth is
   real: pushed to **2 000 refusals, +42.1 MiB post-GC, 49× the run's own ceiling,
   no plateau.** So this is not only a weak assertion, it is **an unbounded-growth
   defect on the refusal path** that the assertion was shaped not to see.
3. Ask of each replacement: *what state would make this pass for the wrong reason?*

**What lifts it:** a raw-token assertion that actually inspects retained memory
(heap snapshot or equivalent) and goes RED when a token is retained; an RSS bound
whose ceiling is **independent of the wave size** and holds at 2 000+ refusals with
a demonstrated plateau; and mutation evidence for both.

## Fold in
- **The sendmail CRLF clause is dead code** — both lenses agree. Removing
  `/[\r\n]/` does not go RED because `[^\s@]+` already rejects the vector
  (`mail-channel.ts:49-50`). It is real insurance **if the recipient regex is ever
  widened**, so either keep it with a comment saying exactly that and correct your
  VR-10 claim, or make it independently load-bearing. **Do not claim a mutant that
  does not kill.**
- **Sibling invalidation has no guarding test.** Consuming one token killing all 72
  siblings is a genuinely good property and it is currently unprotected — add the
  test and mutation-prove it.

## Note for your own hygiene
`git diff` is **blind in this repo** — `migrations/0033` is untracked — so mtime is
the only reliable view of the change set. Bear that in mind for your scope audits.

## NOT yours
T9 (t_6ff49601). D2/D3/D4 as above. S3a, S3b, S3c's limiter and ruled row, T4,
crypto, identity schema beyond the additive ledger.

## Gates before REWORK READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, RED-first evidence per blocker,
VR-10 evidence for every replacement assertion, the AUC/accuracy numbers against a
same-arm null on both routes, and the 2 000-refusal RSS plateau. Post
`REWORK READY FOR PEER REVIEW`.

## Return rule
Return at `REWORK READY FOR PEER REVIEW`, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Same session. Do NOT commit or push.
