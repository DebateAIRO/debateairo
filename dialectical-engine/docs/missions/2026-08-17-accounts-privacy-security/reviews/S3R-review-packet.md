# S3 REWORK review packet — confirm the three blocked findings

Ticket t_3c875ffb, board accounts-phase1. Author: Codex, same session 01a019e7.
Rework of a **split diamond** (Opus BLOCK / Grok GREENLIGHT; block stood).
Rework contract: `logs/S3-rework-packet.md`. Original verdicts:
`reviews/S3-opus-verdict.md`, `reviews/S3-grok-verdict.md`.

**Scope of THIS review: only R1, R2, R3 and the lockfile.** Everything both
lenses already passed — especially the VR-3 name-erasure work — is frozen and
must NOT be re-litigated. But **do** confirm the rework didn't regress it.

## Codex's claimed evidence (verify, don't accept)

| Finding | Before | After (claimed) |
|---|---|---|
| **R1** enumeration oracle via awaited mail send | 678.2 ms delta at 1000 ms transport (tolerance 100 ms); hung sendmail resolved after ~1 s | mail queued **after** the floor; ruled 5 s hard timeout; deltas **0.9 / 3.4 / 0.5 ms** at 0/400/1000 ms; timeout probe fired at 47 ms against a 40 ms test config |
| **R2** unbounded limiter + one immutable row per refusal | 200,001 buckets retained; victim address charged before IP refusal; 40 refusals → 40 immutable rows | IP-first check; ruled **4,096-bucket LRU cap**; **21 buckets** retained after 200,000 requests; aggregated audit → **1 immutable row** per route per ruled 60 s window; chain still valid |
| **R3** raw IP in an undeletable table (V's ruling) | raw `192.0.2.40` in persisted audit JSON | HMAC-SHA-256 under a mode-0600 secret-store key; raw-IP hits **0**; stable-hash cardinality **1**; rotated salt differs |
| **Lockfile** | `hash-wasm@4.12.0` declared, lock still `packages/crypto: {}` | lock differs by exactly the hash-wasm importer + integrity + empty snapshot, nothing else |

Gates claimed: `pnpm typecheck && pnpm test && pnpm lint` exit 0 · **110 files / 771 tests** · architecture 28 rows, 0 violations.

## Claims to verify

1. **R1 is genuinely fixed, not hidden.** Confirm the mail send no longer sits
   inside the measured window, and that the floor now covers only work whose
   duration is independent of whether the account exists. **Run the slow-transport
   matrix yourself** (0 / 400 / 1000 ms — and try something worse, e.g. 3000 ms).
   The oracle must not reappear at any latency. Confirm the transport timeout is a
   **ruled register row**, not a constant. **F1: would the new test fail against
   the pre-rework code?** (Codex reports it did — verify the assertion is real.)
2. **R2 bucket bounding is real.** Confirm the IP bucket is checked **before** any
   address bucket is allocated or charged, and that eviction is genuine (LRU cap
   as a ruled row). Re-run a flood and count retained buckets. **Does the cap
   itself create a new problem** — can an attacker evict legitimate users' buckets
   to bypass their limits? Say so plainly if yes.
3. **R2 audit aggregation preserves the security property.** One row per route per
   window is bounded — but confirm (a) the chain still verifies, (b) refusal
   information is not *lost* in a way that defeats abuse investigation, (c) an
   attacker cannot force unbounded growth by rotating routes or windows.
4. **R3 IP hashing.** No raw IP in any audit row (search rows as text with a known
   address). Same source → same hash; rotated salt → different hash. **Salt is in
   the secret store, never the database.** Consider: is a bare HMAC of an IPv4
   address brute-forceable (2^32 space) if the salt ever leaks? State the residual.
5. **No regression to frozen work.** Re-confirm VR-3 still holds (Codex reports 39
   rows, 0 forbidden matches, 0 non-NULL actors, valid chain) and that no plaintext
   identity leaked back in.
6. **Lockfile delta is exactly hash-wasm and nothing else.** Codex also reports
   discovering a **separate pre-existing `packages/db` workspace-link mismatch**
   which it deliberately left untouched — confirm it was right to leave it, and
   flag whether it needs its own ticket.

## Live world (required)
The S3 unit + integration suites, the new R1/R2/R3 proof tests, `pnpm typecheck`,
`pnpm lint`, and enough of `pnpm test` to confirm 771.

## Verdict
Write `reviews/S3R-<lens>-verdict.md`: GREENLIGHT or BLOCK + numbered findings
with file:line evidence. If BLOCK, state exactly what proof would change your
mind. No commit/push.
