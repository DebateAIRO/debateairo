# S3 REWORK packet — split diamond: Opus BLOCK, Grok GREENLIGHT

Ticket t_3c875ffb. Same session (01a019e7) — same-terminal rework law.
**The block stands**: on the two disputed findings the blocking lens ran the
harder experiment (a slow mail transport; 200k refused requests) and reproduced
real defects that the greenlighting lens's checks structurally could not see.
Grok's GREENLIGHT on the other eight findings is accepted — **do not rework
anything except what is listed below.**

Full verdicts: `reviews/S3-opus-verdict.md`, `reviews/S3-grok-verdict.md`.

## NOT in scope for rework (both lenses agree these are GREEN)
VR-3 name-erasure (Opus ran 182 independent probes across 13 columns × 14
identifier encodings, zero hits, non-vacuity and tamper-control both proven),
no-plaintext, pseudonyms, VR-5 mail transport shape, DEKs-never-in-Postgres,
fail-closed on unseeded policy rows, UA/request-id hashing. **Leave them alone.**

---

## R1 (BLOCKER) — the mail send is inside the timing-floor window, creating an account-existence oracle

`apps/api/src/registration.ts:252-259` awaits the mail send **inside** the window
the 500 ms floor measures (floor applied in `finally`, `:266-268`), and
`SendmailMailSender` (`apps/api/src/mail-channel.ts:67-88`) has **no timeout**.
Headroom after argon2 is only ~356 ms. Measured by the lens: 0/50/150 ms
transport → indistinguishable; **400 ms → Δ70.7 ms; 1000 ms → Δ674 ms** — a clean
oracle for whether an address is registered.

**This matters more than a normal timing bug because of VR-5:** V ruled we run
our own mail server with no relay, so real send latency will be higher and far
more variable than the in-memory stub the tests use. The current green evidence
is green *only* because `MemoryMailSender` returns in ~0 ms — the stub
structurally cannot detect this class of defect.

**Required fix (both parts):**
1. **Take the mail send out of the measured window.** Enqueue/dispatch it so the
   response path does not await delivery (fire-and-forget with the failure still
   recorded per VR-5, or a queue the transport drains). The floor must cover only
   work whose duration does not depend on whether the account exists.
2. **Give the mail transport a hard timeout** (a ruled register row, not a
   constant), so a hung sendmail can never stall a request or a worker.

**Required proof:** a test that injects a **slow** transport (parameterised, e.g.
0 / 400 / 1000 ms) and asserts the existing-vs-new response delta stays under a
ruled tolerance at every latency — i.e. the test must FAIL against today's code.

## R2 (BLOCKER) — rate limiter is unbounded and its refusals write permanent, unpurgeable audit rows

Two distinct defects in `consume()`:
1. **Address bucket is charged before the IP check, and `take()` never evicts.**
   200k requests from a *single* IP were correctly refused after 20 — but still
   retained **200,001 buckets / 82.5 MiB**. Unauthenticated memory exhaustion.
2. **Every refused request writes an immutable audit row** behind the **global
   chain advisory lock** — 300 attempts → 280 refusals → 280 rows at ~10.4 ms
   each, and no operator purge is possible (`DELETE` → SQLSTATE 55000). An
   unauthenticated attacker can permanently bloat the audit table and serialise
   every other audit writer behind the lock.

**Required fix:**
1. **Check the IP bucket FIRST**; do not allocate or charge an address bucket for
   a request already refused on IP. Add eviction/TTL so bucket count is bounded
   (cap + LRU or time-based sweep), with the bound as a ruled register row.
2. **Do not write an immutable audit row per refusal.** Audit rate-limiting in an
   aggregated, bounded way — e.g. one row per (route, window) with a count, or a
   counter/metric outside the immutable chain. The invariant: **no unauthenticated
   caller may cause unbounded growth of an undeletable table, and no
   high-frequency path may serialise behind the global chain lock.**

**Required proof:** tests asserting (a) N refusals from one IP produce O(1) bucket
growth, not O(N); (b) N refusals produce a bounded number of audit rows (not N);
(c) the chain still verifies.

## R3 (V RULING, 2026-08-19) — hash the source IP

V ruled: **store a salted hash of the IP, not the raw address** — same treatment
the user-agent already gets. Rationale: an IP is personal data, the audit table
can never be edited or deleted, so a raw IP would outlive account deletion
permanently and could not be fixed later without a migration on an immutable
table. Keep the audit-useful property ("same source as that other event?") via a
stable salted hash; the address itself must be unrecoverable. **The salt lives in
the secret store, never in the database.**

**Required proof:** no raw IP in any audit row (search rows as text with a known
address); two events from the same source share a hash; the same address under a
rotated salt does not.

## Also required before this ticket can land (orchestrator will verify)
- **Lockfile:** `hash-wasm@4.12.0` is declared in `packages/crypto/package.json`
  but `pnpm-lock.yaml` still shows `packages/crypto: {}` — a clean
  `pnpm install --frozen-lockfile` FAILS, and the suite passes only because
  `node_modules/.pnpm/hash-wasm@4.12.0/` was created locally at 15:15. **You are
  now authorized to run `pnpm install --lockfile-only`** and commit the lockfile
  delta as part of this rework. Nothing else in the lockfile may change.

## Gates before REWORK READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, **plus** the three new proof
tests above (each must fail against the pre-rework code — show the RED). Post
`REWORK READY FOR HERMES REVIEW` with per-finding RED→GREEN evidence.

## Return rule
Return at REWORK READY, `CODEX BLOCKED` (+ exact reason), or an IMPORTANT
OPERATION. Same session. Do NOT commit or push.
