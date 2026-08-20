# Goal packet — S3c · Rate limiter, re-cut

Board `accounts-phase1`, ticket t_86938dd1. Coder: Codex (gpt-5.6-sol, xhigh).
Same session **01a019e7**. Progress log:
`docs/missions/2026-08-17-accounts-privacy-security/logs/S3c-progress.log`
Third of four replacement tickets from the VR-9 split. **S3a and S3b are CLOSED
and dual-greenlit** (commit cff3dd5) — do not touch their work. S3d (mail +
cooldown) is a separate ticket.

## Where this stands
Round 2 of the old S3 "fixed" a fail-OPEN limiter with an LRU eviction that made
it worse; round 4 replaced eviction with sweep-then-refuse. **The fail-open bug is
genuinely gone** — `retain` (`apps/api/src/registration.ts:101-118`) no longer
evicts a below-limit bucket to make room, so counters can accumulate. Verify that
yourself before assuming it; it is the one good thing here.

What it was replaced with is a different defect. Ruled values (from
`packages/register/src/auth-policy.ts:110-122`, all register rows, all tunable):
`bucket_capacity 4096`; register `per_ip 20 / per_address 5 / 15 min`; verify
`30 / 10 / 15 min`; resend `15 / 3 / 60 min`.

---

## D1 (BLOCKER) — map saturation is a registration outage for everyone else
When `buckets.size >= bucketCapacity` and `sweepExpired` frees nothing, `retain`
returns `false` (`:111-114`), `take` returns `false` (`:129`), and the request is
**refused**. For a key already in the map this is fine. For a key that is *not*,
saturation is indistinguishable from being over the limit — so **every new user is
locked out** until buckets expire.

The asymmetry is what makes it an attack rather than fair degradation: existing
keys are refreshed by `retain`'s delete-then-set (`:108-110`) and are never
evicted, so **the attacker's own buckets are exactly the ones that survive**, and
the honest newcomers are exactly the ones refused. Each request allocates up to
two keys (`${route}:ip:${ip}` and `${route}:address:${key}`, `:191-196`), so
~2 048 distinct (ip, address) pairs fill the map — at `per_ip 20` that is roughly
**~103 IPs to hold registration closed for a 15-minute window**. Do the arithmetic
yourself and report the real number you measure.

**Design tension — name it, do not pretend to escape it.** Bounded memory, exact
per-key counting, and never-refuse-an-under-limit-key cannot all hold at once.
Choose where to degrade, and state the reasoning in the code. Properties that must
hold in whatever you build:
1. Memory is bounded by a ruled constant under any traffic.
2. A key at or over its limit is **never** forgiven early — no amnesty, no
   metastable slide back open. (This is what round 2 broke.)
3. Saturation **never** refuses a key that is under its own limit.
4. Where bounding loses information, it may only err toward **over**-counting
   (refusing an abuser) or exactness — never toward handing an over-limit key a
   fresh budget.

Fixed-slot counting (hash the key into one of N slots; collisions share a budget
and therefore over-count) satisfies all four without eviction, and is one obvious
shape — but **you choose**, and justify it. If you keep a map, explain how 2 and 3
coexist under saturation.

**Proof (real, not in-memory):**
- A sustained flood from one IP is refused at the ruled policy (20/10/3), holding
  under saturation — not just at first.
- The **two-rotating-keys probe** from the round-4 refuter: two keys alternating
  must not be able to launder each other's state.
- **Saturate the structure from many sources, then register as a fresh, innocent
  user — that must succeed.** This is the assertion D1 exists for.
- Report memory occupancy at saturation.

## D2 (BLOCKER) — an attacker spends a stranger's budget
Two mechanisms, both live:
- **The address bucket is keyed on attacker-supplied input.** Anyone can burn a
  victim's per-address budget by naming their email — 5 registration attempts per
  15 min, or **3 resends per hour**, and the rightful owner is refused. The
  limiter meant to protect an address becomes the way to deny it.
- **The IP is charged before the address is checked** (`consume`, `:180-196`):
  `take` pushes `now` into the IP bucket, and only then is the address tested. A
  request refused on the address still spent the caller's IP budget — so a victim
  whose address was poisoned also burns their own 20/15 min trying.

**The property:** a party's budget must not be consumable by requests that party
did not make. Note that a per-address counter is inherently attacker-reachable, so
"just count harder" does not fix it — reconsider **what the per-address limit is
protecting**. If the answer is "stop one address being spammed with mail", then it
should throttle the outbound side effect rather than deny the request, so the
owner is never locked out of their own account. **You choose the design and state
the reasoning.** If it genuinely cannot be separated from S3d's cooldown/mail
semantics, post `CODEX BLOCKED` rather than absorbing S3d.

**Do not fix the audit attribution here** — "a refusal names an attacker-chosen
actor" is **T4** (t_ffccf3a0), already ticketed. Confine yourself to who gets
*refused*, not who gets *named*.

**Proof:** an attacker naming a victim's address cannot prevent that victim from
registering, verifying, or resending; and a request refused for a reason the
caller did not cause does not consume the caller's own budget.

## D3 (record, do not necessarily change) — plaintext IP in process memory
Bucket keys embed the raw IP (`:191`) and `RefusalAggregate` retains a full
`AuthSourceContext` (`:66-74`). VR-7 made the *audit* IP memory-hard because that
table is append-only and unrotatable; limiter state is ephemeral, so the calculus
differs and a per-request memory-hard KDF here would be absurd. **Decide
deliberately and write down the decision** — bounded lifetime, no persistence, no
logging — or minimise it if that costs nothing. A stated residual is acceptable; an
undocumented one is not.

---

## VR-10 — STANDING RULE
Every security assertion must be mutation-tested: break the implementation, run
the guarding test, show it goes **RED**, include the evidence. A test that passes
against a broken implementation blocks the ticket. **At minimum demonstrate:**
- Remove the at/over-limit protection → the sustained-flood test goes RED.
- Restore eviction of the key being served → the two-rotating-keys probe goes RED.
- Make saturation refuse under-limit keys → the innocent-newcomer test goes RED.
- Remove the D2 fix → the victim-lockout test goes RED.

Both lenses now re-derive your mutants themselves, so make them real.

## Proof discipline (learned the hard way on S3b)
Round 4 shipped three tests that passed against deliberately broken code, and
S3b's timing test certified a configuration production never runs. So: **real
stack, production policy parameters, and no harness that suppresses the very
effect under test.** If an assertion needs a threshold, derive it from a measured
null — do not pick a number that the achievable result happens to clear.

## File contract
`apps/api/src/registration.ts` (the limiter and its call sites), a new module
under `apps/api/src/` if you extract the limiter, `packages/register/src/auth-policy.ts`
(only if a ruled row must change — additively, with provenance), and tests.
**DO NOT** touch S3a's fixes, S3b's durability/oracle work, the mail channel or
cooldown (S3d), `packages/crypto`, the identity schema, or the refusal-audit
attribution (T4). If the contract must widen, STOP and post `CODEX BLOCKED`.

## Gates before READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, per-defect RED→GREEN evidence,
the VR-10 mutation evidence, and the measured saturation numbers. Post
`READY FOR PEER REVIEW`.

## Return rule
Return at READY FOR PEER REVIEW, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Same session. Do NOT commit or push.
