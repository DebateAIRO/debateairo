# P2-14 Grok 4.6 review packet

## Requested verdict

Return exactly one of:

- `GREENLIGHT` — no P0/P1 issue in this bounded sealed role-catalog surface.
- `BLOCK` — at least one concrete P0/P1 issue, with file/line, failure path,
  and the smallest structural repair.

Read only the listed files and receipts. Do not edit files, run broad suites,
or expand this catalog ticket into operator/passkey issuance, specialist
workflows, database principals, or UI.

## Ticket

`P2-14 · Add the product role catalog and growth-path policy`

Persist and expose only the ruled product roles and role transitions, leave
grants empty for unimplemented workflows, deny unknown/caller-supplied roles,
and cover the migration/register contract.

## Authority and scope

- `../wave-2-target-architecture.md#11` is authoritative: launch roles are
  `anonymous`, `user`, and `operator`; growth roles are `moderator`, `support`,
  `security_auditor`, and `db_operator`; the existing worker/service identity
  is reused.
- `operator` is a catalog reservation, not an issued session role. Its eventual
  authentication requires a passkey, but P2-11–13 own ceremony and enforcement.
- Only anonymous and user product behavior exists today. The catalog therefore
  lists their implemented high-level grants, keeps operator and every unbuilt
  workflow at zero grants, and contains only the existing anonymous→user
  verified-registration-and-MFA transition.
- There is no new SQL table. `register.register_row` is already the ruled
  generic persistent sealed-policy carrier. The real PostgreSQL test applies
  all migrations before exercising exact persistence, sealing, and replay.

## Frozen review paths

- `packages/register/src/product-role-policy.ts`
- `packages/register/src/index.ts`
- `apps/runner/src/dev-deployment-register.ts`
- `apps/api/src/main.ts`
- `tests/architecture/p2-product-role-policy.test.ts`
- `tests/integration/dev-deployment-register.test.ts`
- `tests/unit/s7-authorization.test.ts`
- `../IMPLEMENTATION-STATUS.md`

The retrospective ledger is process evidence, not product authority.

## Intended invariants

- The catalog contains exactly eight ordered IDs: `anonymous`, `user`,
  `operator`, `moderator`, `support`, `security_auditor`, `db_operator`, and
  `worker_service`. An invented `administrator` or any extra/reordered member
  makes the strict row invalid.
- Assignment authority is exactly `SERVER_DERIVED_ONLY`; caller-supplied roles
  are `DENIED`. A `role` field in an ask body is rejected before application
  work and API code never reads `request.body.role`/`body.role`.
- Operator is `RESERVED_UNASSIGNABLE`, requires a passkey, and has no grants.
  Every growth identity is `UNIMPLEMENTED` with unratified authentication and
  no grants. `worker_service` is the reused service identity and has no product
  grants.
- The only transition is anonymous→user, active only through verified
  registration and MFA. No caller-selected or user→operator transition exists.
- Missing, duplicate, malformed, provenance-free, unsealed, or row-count-drifted
  policy state fails closed. API boot reads the sealed policy before starting
  its Argon2 worker/listener path.
- Bootstrap accepts only empty or exact sealed state. Development seeding
  includes the identical row and cannot append it to a stale sealed version.

## Reproduce-first and restored evidence

- Initial architecture RED: module import failed because
  `packages/register/src/product-role-policy.ts` was absent.
- Focused catalog + adjacent authorization: `34/34` GREEN.
- Fresh real-PostgreSQL migration/sealed-register ceremony: `4/4` GREEN.
- Root `pnpm typecheck`: GREEN.
- Repository lint: GREEN (`28` architecture edges, zero violations; source
  `blocking: []`). The first sandboxed attempt failed before analysis on the
  recurring `tsx` IPC `EPERM`; the identical permitted run is the receipt.
- `git diff --check`: GREEN.

## Mutation evidence

Each mutation changed both the strict schema and persisted value where needed,
turned the exact catalog assertion RED, and restored byte-exactly:

1. `caller_supplied_role: DENIED → ACCEPTED` — RED on caller-role policy.
2. Reserved operator gains `READ_DEPLOYMENT` — RED on the zero-grant boundary.
3. `worker_service → administrator` — RED on the exact ruled catalog.

Restored SHA-256 values:

- product role policy: `0052c6cbb2a96831135494b2c90e9a265bfca3a84a7a5d14c0f87c6b5c7e798a`
- register index: `ecfc416e52dbd2c741f60558e0c27528fe6b96db24fe0cf95f2db812494d69cb`
- dev register: `9537f7d84e92c6f13741a184847c0a75ecd07a8e28b909952326367458f1ace5`
- API main: `feb8fdc16808b9e83f5682bdc931b7ba2b99831b26c9c00ff0cfd5dd5de68af5`
- catalog architecture test: `baef6571059d964edfc55211ffda16e966c2cf32286604f91341416736917cd2`
- PostgreSQL register test: `e904675b6a2cca95e421829ae684a53a7b61b442ace1c8ff9f4f3d957c681d26`
- authorization test: `75b8b5235b7198400e649a2c23a96ac7e23561dc8a5de1bba98ad4393fd752b1`

## Review questions

1. Does the strict tuple encode exactly the ruled eight identities without
   silently inventing an administrator or specialist authority?
2. Is any reserved/unimplemented identity accidentally assignable or powered?
3. Can caller input influence role selection despite the server-derived policy?
4. Does the existing sealed-register carrier provide adequate persistence and
   boot integrity without a redundant SQL role table?
5. Do status and packet language avoid claiming that operator issuance or the
   role growth path itself is complete?

## Honest residuals

- Operator session issuance, passkey registration/login/enforcement, and every
  specialist workflow remain absent.
- The catalog is not a role-assignment endpoint and intentionally exposes no
  public role-selection API.
- Existing deployed sealed register versions cannot be altered in place; an
  operator must configure a new register version through deployment ceremony.
- The overall role-growth row remains `✗` until real reviewed workflows exist.

## Review-attempt status

The single bounded Grok 4.6 invocation exited before reading any repository
file or emitting a verdict. The CLI reported `Not signed in` and requested a
device-code login or `XAI_API_KEY`; model refresh also reported no credentials
for `cli-chat-proxy`. This is a reviewer-capability block, not a product finding
or self-approved verdict. No retry or substitute reviewer was launched.
