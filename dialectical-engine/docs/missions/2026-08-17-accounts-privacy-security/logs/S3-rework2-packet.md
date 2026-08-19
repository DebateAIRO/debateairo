# S3 REWORK ROUND 2 — three fixes, all small

Ticket t_3c875ffb, same session 01a019e7. Second split diamond (Opus BLOCK /
Grok GREENLIGHT); **the block stands** — the orchestrator independently verified
finding 1 before routing this.

**Your R1/R2-memory/R3 fixes are CONFIRMED GOOD by the finder itself** (16-cell
slow-transport matrix incl. 3000 ms in both drained and undrained shapes, worst
6.5 ms; 21 buckets / 5.1 MiB under the 200k flood; 0 raw-IP hits; VR-3 no
regression across 169 probes). **Do not touch any of that.** Three things remain.

## W1 (BLOCKER) — the lockfile is still broken, and it IS this ticket's work

`pnpm install --frozen-lockfile` **still fails**. Orchestrator-verified directly:
`apps/api/package.json` and `packages/db/package.json` BOTH declare
`@debateai/crypto`, and `pnpm-lock.yaml` mentions `@debateai/crypto`
**zero times**. Missing importer entries: **`apps/api` → @debateai/crypto** and
**`packages/db` → @debateai/crypto** (plus the hash-wasm entry you already
landed). Total regenerated diff is ~6 lines.

Your handoff described the `packages/db` mismatch as **pre-existing** and left
it. It is not pre-existing: HEAD's `main.ts` has no crypto import, the import
arrives with this ticket, and `packages/db/src/identity.ts` is the only db file
using it — both manifests were written at 15:17/15:19, inside your own S3 window.

**Fix:** run the already-authorized `pnpm install --lockfile-only`. It fixes all
three entries and changes nothing else. **Required proof:** `pnpm install
--frozen-lockfile` (or an equivalent isolated check) now succeeds, and the
lockfile diff contains ONLY those crypto/hash-wasm importer entries.

## W2 (BLOCKER) — the aggregated refusal audit silently drops the count

`aggregateRefusal` computes `count` (`apps/api/src/registration.ts:112`), but
`refuseRateLimit` discards it and `recordRateLimitRefusal` has no count
parameter. Consequence: **1,000,000 refusals in one window produce one row
written at `count=1`.** Only the first refuser's actor token, IP hash and scope
survive; no metric was added either.

That defeats the purpose of the aggregation compromise — we accepted losing
per-refusal rows *in exchange for* keeping the volume. Right now we lose both.

**Fix:** thread the count through to the persisted row (add the parameter and
persist it), and record enough per-window shape to make abuse investigable —
at minimum the count, and consider distinct-source cardinality. Keep it bounded:
still at most one row per route per ruled window.
**Required proof:** N refusals in a window → 1 row whose count == N; chain still
verifies; the row is still bounded under route/window churn.

## W3 (fold in — it is one predicate) — the LRU cap is a rate-limit bypass

The reviewer proved its own prescribed remedy has a hole: a victim at limit is
refused, an attacker churns **4,106 distinct IP keys**, and the victim is allowed
again. `retain()` evicts regardless of bucket state, and re-inserting on every
call keeps attackers MRU while low-frequency legitimate users sit in the LRU tail.

**Fix (one predicate):** **never evict a bucket that is currently at/over its
limit**; sweep expired buckets first, and only then evict by recency. If the cap
is reached with no evictable candidate, fail closed on the *new* key rather than
evicting an at-limit victim.
**Required proof:** a test where a victim is at limit, an attacker churns >cap
distinct keys, and the victim **remains refused**.

## Out of scope
Everything else — including the R3 salt-rotation residual (a bare HMAC over 2^32
is brute-forceable if the salt leaks, and the immutable table means the salt can
never be rotated). That is a **V design decision**, not rework; the orchestrator
is putting it to V separately. Do NOT change the IP-hash construction here.

## Gates before REWORK READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, plus the three proofs above
(W2 and W3 each need a RED that fails against current code). Post
`REWORK READY FOR HERMES REVIEW` with per-finding RED→GREEN evidence and the
frozen-lockfile check output.

## Return rule
Return at REWORK READY, `CODEX BLOCKED` (+ exact reason), or an IMPORTANT
OPERATION. Same session. Do NOT commit or push.
