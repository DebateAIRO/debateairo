# TYPECHECK BASELINE — mission 2026-08-21-observability-loop

Pinned by Claude-Router 2026-08-22. Authoritative copy; the same `count` and
`sha256` are recorded in `TP-10-typecheck-criterion-correction.md` and in each
affected ticket's acceptance text, so a silent edit to any one is detectable as
disagreement between the other two.

```
base commit : 29f370e
count       : 9
sha256      : 98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2
tsconfig    : 905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d
recipe      : pnpm typecheck 2>&1 | grep -E 'error TS[0-9]+:' | LC_ALL=C sort
```

Router-verified: both hashes reproduced independently before pinning.

## The nine pinned diagnostics

```
apps/api/src/main.ts(51,28): error TS2554: Expected 3 arguments, but got 2.
packages/db/src/identity.ts(103,30): error TS2554: Expected 4 arguments, but got 3.
packages/db/src/identity.ts(104,37): error TS2554: Expected 4 arguments, but got 3.
tests/architecture/t1-argon2-worker-contract.test.ts(405,24): error TS2554: Expected 3 arguments, but got 2.
tests/integration/registration-database.test.ts(327,43): error TS2741: Property 'argon2' is missing in type '{ repository: PostgresIdentityRepository; mail: MailSender; dekStore: UserDekStore; blindIndexKey: Buffer<ArrayBuffer>; ... 4 more ...; sleep?: (milliseconds: number) => Promise<void>; }' but required in type '{ readonly repository: IdentityRepository; readonly mail: MailSender; readonly dekStore: UserDekStore; readonly blindIndexKey: Uint8Array<ArrayBufferLike>; ... 5 more ...; readonly verificationTokenFactory?: () => string; }'.
tests/integration/registration-database.test.ts(610,9): error TS2554: Expected 4 arguments, but got 3.
tests/integration/registration-database.test.ts(611,9): error TS2554: Expected 4 arguments, but got 3.
tests/integration/registration-database.test.ts(890,7): error TS2554: Expected 4 arguments, but got 3.
tests/integration/registration-database.test.ts(891,7): error TS2554: Expected 4 arguments, but got 3.
```

## Ownership of the inherited defect

NOT this mission's, and not repairable by any lane: two of the four files are
GLOBAL-FORBID / excluded security zone. Cause: an argon2 refactor split across
the commit boundary — ROW-GIT commit `9801f85` added the argon2 contract test
(previously untracked) while deliberately holding back the call-site updates in
`identity.ts` and `registration-database.test.ts`, which belong to the
concurrently-running accounts mission and were excluded on V's ruling. The
CURRENT WORKING TREE typechecks clean; only the committed state carries the
split. Owner: accounts mission. Split point: `9801f85`.

## Re-pinning

**Downward** (strictly smaller set) is a **Router** act at a merge boundary,
recorded on the board with the new count/sha256 and the causing commit. It is
**MANDATORY, not optional** — a stale pin larger than reality re-authorizes
errors that no longer exist. **Upward** (any added diagnostic) requires **V**
and must name the commit and owner of each addition. No lane may do either:
nothing under `docs/` is in any lane's `allowed:` set.

Expected next re-pin: **downward to 0** when the accounts mission commits its
held-back work. Router must re-pin before the next lane dispatch after that.
