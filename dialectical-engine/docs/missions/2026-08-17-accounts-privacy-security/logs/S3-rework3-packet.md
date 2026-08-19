# S3 REWORK ROUND 3 — one change: memory-hard IP hashing (V ruling VR-7)

Ticket t_3c875ffb, same session 01a019e7. **W1/W2/W3 are confirmed done — do not
touch them.** This round implements a single new V ruling that arrived after
round 2 was dispatched.

## VR-7 (V ruling, 2026-08-19) — use a memory-hard KDF for the audit source IP

**Why.** The audit table is append-only and can never be modified, so the IP salt
**can never be rotated**. With a fast HMAC, a leaked salt means every historical
IP is recoverable — the IPv4 space is only ~2^32 and a GPU sweeps it in under a
second. Because the damage would be retroactive and permanently unfixable, V
ruled for defence in depth: make the sweep impractical rather than instant.

**Change.** Replace the HMAC-SHA-256 construction for `source_context` IP hashing
with a **memory-hard KDF (argon2id)**, keyed/salted by the existing secret-store
salt. `hash-wasm` is already a declared dependency (it provides the argon2id used
for passwords), so **no new dependency is needed** — if that turns out to be
false, STOP and post `CODEX BLOCKED` rather than adding one.

**Requirements:**
1. **Cost parameters are ruled register rows**, not constants (memory KiB,
   iterations, parallelism) — same discipline as the other auth policy rows, with
   provenance. They must be tunable without a code change.
2. **Tune for the actual workload.** This runs once per audited request, so pick
   parameters that are meaningfully expensive to sweep 2^32 times but negligible
   for a single request. State the measured per-call cost in the handoff, and
   assert an upper bound in a test so a future tuning mistake can't silently make
   every request slow.
3. **Preserve the properties already verified:** same source → same hash
   (correlation still works for abuse investigation); rotated salt → different
   hash; **no raw IP anywhere** in any audit row.
4. **The salt stays in the secret store** (mode 0600), never the database, and the
   ≥32-byte enforcement stays.
5. Password hashing is untouched — this is only the IP path.

**Required proof (RED first):**
- A test asserting the IP hash is produced by the memory-hard KDF with the ruled
  parameters — it must FAIL against the current HMAC implementation.
- Same-source correlation holds; rotated salt differs; zero raw-IP hits across all
  audit columns (re-run the existing probe).
- A measured per-call timing bound asserted in a test.
- Full gates green: `pnpm typecheck` + `pnpm test` + `pnpm lint`.

## Out of scope
Everything else. Do not revisit W1/W2/W3, VR-3, the rate limiter, or the mail
path. If this change appears to require touching them, STOP and post
`CODEX BLOCKED` with the exact reason.

## Return rule
Return at `REWORK READY FOR HERMES REVIEW`, `CODEX BLOCKED`, or an IMPORTANT
OPERATION. Same session. Do NOT commit or push.
