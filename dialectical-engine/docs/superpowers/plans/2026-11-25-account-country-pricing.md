# Prices for the Country on the Account — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in person with a sign-up country sees that country's price on the pricing page and starts checkout from it, wherever they connect from; everyone else is priced by their connection, as today.

**Architecture:** One rule in the API. A new database function lets the API read the sign-up country of the request's own account. `GET /v1/billing/plans` looks at a session when one is presented (a new route policy that can never fail the request) and gives that country to `pricingPlace` between "chosen on the page" and "the connection's". `POST /v1/billing/quote` uses the same read when the body names no country. The pricing page only forwards the session cookie.

**Tech Stack:** TypeScript (Node 26, pnpm 11), Fastify, PostgreSQL (forward-chain migrations with sha-pinned lineage), Next.js server components, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-account-country-pricing-design.md` (approved by the owner on 25 November 2026). Read it before any task.

## Workspace

- Branch `feat/2026-11-25-account-country-pricing`, cut from `origin/dev` at `728f9a723`. All paths below are relative to `dialectical-engine/`.
- A fresh checkout needs `pnpm install --frozen-lockfile` and `pnpm run generate:contract` (the contract client is git-ignored) before any test runs.
- On the owner's Mac: put Node 26 first (`export PATH=/opt/homebrew/bin:$PATH`) and, for `git`, `export DEVELOPER_DIR=/Library/Developer/CommandLineTools`.
- Baseline on 25 November 2026, before any change: the seven unit, architecture and render files this plan edits pass (182 tests), `tests/integration/registration-region-database.test.ts`, `billing-quote.test.ts` and `free-debate-refused-by-check-0189.test.ts` pass (31 tests), and `pnpm run typecheck` exits 0.
- Commit messages in this repository are one plain sentence saying what is now true. End each with the line `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Global Constraints

- No new sign-up field, account setting, page text, currency or response field. `BillingPlansResponseSchema` and `BillingQuoteResponseSchema` do not change.
- `apps/ui/app/page.tsx` (the landing page), `apps/ui/lib/billing/serverBilling.ts` and `apps/ui/components/billing/SubscriptionControls.tsx` are not edited.
- The database function returns the country code only, never the US state. `EXECUTE` goes to `debateai_billing_runtime` and to no other role. No table grant is added.
- No existing migration, lineage manifest or verifier is edited: their bytes are sha-pinned.
- The string `registration_region` may appear in exactly one new file, the migration. Every other new file says "sign-up country" (`tests/architecture/region-picker-scope.test.ts` pins the list).
- `GET /v1/billing/plans` never fails over the account's country: whatever goes wrong on the way to it, the answer is 200 with the connection's country.
- The shared `session: "optional"` branch of the API's auth hook is not changed.
- The plans answer keeps `Cache-Control: private, max-age=60`, gains `Vary: Cookie`, and never carries `Set-Cookie`.
- `POST /v1/billing/quote`: a country read that throws is 503 and nothing is stored. Only a clean "no sign-up country" falls back to the connection.
- `decidePayment`, `decidePaymentPlace`, the country gate and every tax computation keep their code unchanged.
- TypeScript here uses exact optional properties: pass an optional member as `...(x === undefined ? {} : { member: x })`, the way the surrounding code does.

## Review Focus

Five conditions the spec implies that are most likely to bite a real person. Each has its test in the task named.

1. A sign-up country that is closed for payment (`GB` in `testCountryPolicy`), with no country in the quote body: the quote refuses `403 COUNTRY_PAYMENT_UNAVAILABLE`, as for a typed country. Task 4.
2. A sign-up country and a connection over Tor at the first quote: `403 TOR_REFUSED`, never a price. Task 4.
3. A US account whose pricing-page request carries only `postal_code` (no `country`): the country comes from the account and the postal code is used. Task 2 and Task 3.
4. A query that does not parse (`?country=zz9`) from a signed-in account: it is no choice at all, so the account's country applies. Task 3.
5. A session cookie the browser holds in a wrong shape (not the 43-character grammar): the pricing page sends no session and renders as for a signed-out visitor. Task 5.

Known and accepted, not tested: on this route the session lookup runs before the per-source admission budget, as it does on every optional-session route.

---

### Task 1: Database step 0191 and its reader

The model for every file here is the commit that added step 0189 (`git show c7fcbf626 --stat`): one function for `debateai_billing_runtime` that asks `identity.request_owner_matches`. Copy its shape; the differences are listed.

**Files:**
- Create: `migrations/0191_registration_country_read.sql`
- Create: `migrations/lineage/registration-country-read-forward0191.json`
- Create: `packages/db/src/migration-forward0191.ts`
- Create: `packages/db/src/registration-country.ts`
- Create: `tests/integration/registration-country-0191.test.ts`
- Modify: `packages/db/src/migration-forward-chain.ts` (import, `STEPS`, the doc comment's list)
- Modify: `packages/db/src/index.ts` (export the reader)
- Modify: `migrations/lineage/README.md` (new section, and the count sentence)
- Modify: `docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json` (`privilegeDisclosures`)
- Modify: `tests/architecture/migration-forward-chain.test.ts`, `tests/architecture/p3-production-database-principals.test.ts`, `tests/architecture/region-picker-scope.test.ts`
- Modify: `tests/integration/security-review-hardening-database.test.ts` (the `ASKS_CONNECTION` list)
- Modify: `tests/support/forward-chain-steps.ts`, `tests/support/shipped-corpus.manifest.txt`, `tests/ci-integration-auth.txt`

**Interfaces:**
- Produces (SQL): `identity.read_registration_country(p_owner_ref uuid) RETURNS text`. Raises `42501` with message `REQUEST_OWNER_MISMATCH` unless the connection is that owner's; else the two-letter country, or NULL when the account has no sign-up region row.
- Produces (TypeScript, exported from `@debateai/db`):

```ts
export class PostgresRegistrationCountryReader {
  constructor(pool: Pick<Pool, "query">);
  /** The country the account chose at sign-up, or null when it chose none. Rejects when the database refuses. */
  read(ownerRef: string): Promise<string | null>;
}
```

- [ ] **Step 1: Write the failing database test** `tests/integration/registration-country-0191.test.ts`

Setup as `tests/integration/free-debate-refused-by-check-0189.test.ts` lines 133-148: `startTestDatabase`, `migrate`, `provisionRlsLogins`, `request = logins.apiPools().runtime`. Seed three accounts with `seedSessionAccount(database.pool, label)`: `ana`, `tex`, `old`. Give `ana` the row `('RO', NULL)` and `tex` the row `('US', 'TX')` with a superuser `INSERT INTO identity.registration_region(user_id,country_code,us_state)`; `old` gets none. Helper: `asked(pool, token, ownerRef)` runs `new PostgresRegistrationCountryReader(pool).read(ownerRef)` inside `inAccountRequest(token, ...)`.

```ts
const READER = "identity.read_registration_country(uuid)";
const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };

it("answers the country of the request's own account, null with no sign-up region, and never the US state", async () => {
  expect(await asked(request, ana.token, ana.ownerRef)).toBe("RO");
  expect(await asked(request, tex.token, tex.ownerRef)).toBe("US");
  expect(await asked(request, old.token, old.ownerRef)).toBeNull();
});

it("refuses every connection that is not the account's own", async () => {
  await expect(asked(request, tex.token, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
  await expect(asked(request, null, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
  await expect(asked(request, ana.revokedToken, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
  await expect(asked(request, ana.expiredToken, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
  const bare = createPool(logins.url("DATABASE_URL"), { max: 1 });   // the request login, no account named
  opened.push(bare);
  await expect(asked(bare, null, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
});

it("is the API's billing role's alone, a STABLE definer, and opens no way to the table", async () => {
  // grantees other than the owner: exactly ["debateai_billing_runtime"] (the 0189 test's aclexplode query, with READER)
  // none of debateai_runtime, debateai_authorization_runtime, debateai_erasure_runtime, debateai_replay,
  //   debateai_data_export_worker, debateai_staff_security_owner, debateai_content_provision,
  //   debateai_rls_all_accounts has EXECUTE
  // AUTHORIZATION_DATABASE_URL, RUNNER_DATABASE_URL, ERASURE_DATABASE_URL, DATA_EXPORT_DATABASE_URL,
  //   SUPPORT_DATABASE_URL: SELECT identity.read_registration_country($1) rejects { code: "42501" }
  // has_table_privilege('debateai_billing_runtime','identity.registration_region', p) is false for
  //   SELECT, INSERT, UPDATE, DELETE, TRUNCATE
  // pg_proc: provolatile 's', prosecdef true, proconfig ["search_path=pg_catalog"],
  //   same owner as identity.read_age_check_outcome(uuid)
});

it("on the production logins: api-runtime reads its own account's country and is refused another's", async () => {
  // as the 0189 test's last case: system = createPool(production.url("api-system")),
  // runtime = createPool(production.url("api-runtime"), { crossAccount: system })
  expect(await asked(runtime, ana.token, ana.ownerRef)).toBe("RO");
  await expect(asked(runtime, tex.token, ana.ownerRef)).rejects.toMatchObject(MISMATCH);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm exec vitest run tests/integration/registration-country-0191.test.ts`
Expected: FAIL, `PostgresRegistrationCountryReader` is not exported from `@debateai/db`.

- [ ] **Step 3: Write `migrations/0191_registration_country_read.sql`**

Header comment in plain words, as 0189's: what it is for (a signed-in person's prices start from the country they chose at sign-up), who may learn it (the account's own request, or a system login), what it returns (the country only, never the state), then the n1 lines `-- n1: expand` and `-- n1: keeps-verifier` with their reasons. Statements, in this order and nothing else:

```sql
CREATE OR REPLACE FUNCTION identity.read_registration_country(p_owner_ref uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;
  RETURN (SELECT region.country_code FROM identity.registration_region AS region
    JOIN identity."user" AS account ON account.user_id = region.user_id
    WHERE account.owner_ref = p_owner_ref);
END
$$;
```

Then one `-- n1: reviewed …` comment line directly above `DO $registration_country_read_owner$`: the block gives the function the owner of `identity.read_age_check_outcome(uuid)` (checked on a test database on 25 November 2026: that owner holds all three rights below, on the dev and the production logins) and raises `42501` `REGISTRATION_COUNTRY_READ_OWNER_UNABLE` unless that owner has `SELECT` on `identity.registration_region` and `identity."user"` and `EXECUTE` on `identity.request_owner_matches(uuid)` (0189's block, with these three checks). Then:

```sql
REVOKE ALL ON FUNCTION identity.read_registration_country(uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION identity.read_registration_country(uuid) TO debateai_billing_runtime;
```

- [ ] **Step 4: Register the step**

- `packages/db/src/migration-forward0191.ts`: 0189's loader with `NAME = "0191_registration_country_read.sql"`, `VERSION = "registration-country-read-forward0191-v1"`, `MANIFEST_PATH = "lineage/registration-country-read-forward0191.json"`, `PREVIOUS = "0190_check_deletes_public_debate.sql"`, `FUNCTIONS = ["identity.read_registration_country(uuid)"]`, error prefix `MIGRATION_FORWARD0191_`, export `loadForward0191`. Its comment must not contain `registration_region`.
- `migrations/lineage/registration-country-read-forward0191.json`: the six keys of 0190's manifest. `baseRecipeSha256` and `verifier` are copied from it; `previous.manifestSha256` is the sha256 of `migrations/lineage/check-deletes-public-debate-forward0190.json`; `migration.sha256` is the sha256 of the new SQL file (`shasum -a 256`). Recompute `migration.sha256` after every edit of the SQL.
- `migration-forward-chain.ts`: import and append `loadForward0191` to `STEPS`; extend the comment's list with "then the sign-up country read for prices (0191, expand: one function of the API's billing role)".
- `tests/support/forward-chain-steps.ts`: append `["0191_registration_country_read.sql", "expand"]`.
- `tests/support/shipped-corpus.manifest.txt`: add `packages/db/src/migration-forward0191.ts` and `packages/db/src/registration-country.ts`, keeping the list sorted.
- `tests/ci-integration-auth.txt`: add the new test file with a one-line comment, as 0189's entry.
- `P3-01-production-database-principals.json`: append to `privilegeDisclosures` `{ "roleName": "debateai_billing_runtime", "source": "migrations/0191_registration_country_read.sql", "grants": ["EXECUTE ON FUNCTION identity.read_registration_country(uuid)"] }`.
- `migrations/lineage/README.md`: a section headed `## The sign-up country, read for prices (0191)` in the form of 0189's section, and append to the sentence that counts the steps: `, and the sign-up country read for prices (0191, below) the eighty-first`.
- If `origin/dev` gains its own 0191 before this merges, renumber as the README's "renumber" rule says.

- [ ] **Step 5: Implement `PostgresRegistrationCountryReader` in `packages/db/src/registration-country.ts`** and export it from `packages/db/src/index.ts`

One statement, `SELECT identity.read_registration_country($1) AS country`. A non-null answer that is not two capital letters throws `Error("REGISTRATION_COUNTRY_INVALID")`. A database error is not caught.

- [ ] **Step 6: Extend the pinned-list tests**

- `tests/architecture/migration-forward-chain.test.ts`: a new `it` for 0191, copied from 0190's (line 1063). Its statement list is exactly:
  ```ts
  ["CREATE OR REPLACE FUNCTION identity.read_registration_country(p_owner_ref uuid) RETURNS text",
   "DO $registration_country_read_owner$",
   "REVOKE ALL ON FUNCTION identity.read_registration_country(uuid)",
   "GRANT EXECUTE ON FUNCTION identity.read_registration_country(uuid) TO debateai_billing_runtime;"]
  ```
  with `step.n1` equal to `{ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null }`, `statements` not matching `/\bbilling\./u`, no earlier migration containing `read_registration_country`, the loader containing `"identity.read_registration_country(uuid)"`, the README section starting with its heading and containing `0190`, the three new file names, `MIGRATION_FORWARD0191_`, `-- n1: expand`, `-- n1: keeps-verifier`, `-- n1: reviewed`, `REQUEST_OWNER_MISMATCH`, `debateai_billing_runtime` and `tests/integration/registration-country-0191.test.ts`, and the README (whitespace collapsed) containing `(0190, below) the eightieth, and the sign-up country read for prices (0191, below) the eighty-first`. In 0190's own `it`, replace the two `slice(-2)` reads with an `indexOf`-based pair, as 0189's `it` reads its position (line 1014).
- `tests/architecture/p3-production-database-principals.test.ts`: the two additions the 0189 commit made (the expected disclosure entry near line 1790 and the `it` at line 2376), for 0191, with `declared` equal to `["GRANT EXECUTE ON FUNCTION identity.read_registration_country(uuid) TO debateai_billing_runtime;"]`.
- `tests/architecture/region-picker-scope.test.ts`: add `const countryReadMigration = "migrations/0191_registration_country_read.sql"` to the expected list, and assert its source matches `FROM identity.registration_region` exactly once, does not match `/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+identity\.registration_region\b/i`, and does not contain `us_state`.
- `tests/integration/security-review-hardening-database.test.ts`: add `"identity.read_registration_country(uuid)"` to `ASKS_CONNECTION`, beside `identity.read_age_check_outcome(uuid)`, with a `// 0191:` comment.

- [ ] **Step 7: Run the tests**

Run: `pnpm exec vitest run tests/integration/registration-country-0191.test.ts tests/integration/registration-region-database.test.ts tests/integration/security-review-hardening-database.test.ts tests/architecture/migration-forward-chain.test.ts tests/architecture/p3-production-database-principals.test.ts tests/architecture/region-picker-scope.test.ts`
Expected: PASS, every file.

- [ ] **Step 8: Commit**

```bash
git add migrations packages/db tests docs/missions
git commit -m "Database step 0191 lets the API read the sign-up country of the request's own account, and nothing else about its region."
```

---

### Task 2: The rule in `pricingPlace`

**Files:**
- Modify: `apps/api/src/billing/place.ts:61-80`
- Create: `tests/unit/billing-pricing-place.test.ts`

**Interfaces:**
- Produces: `pricingPlace` takes one more optional member. Task 3 passes it.

```ts
export function pricingPlace(input: Readonly<{
  geo: GeoLookup | undefined; ip: string; country: string | undefined;
  /** The signed-in account's sign-up country; null or absent when there is none. */
  accountCountry?: string | null;
  postalCode: string | undefined;
}>): PricingPlace;
```

- [ ] **Step 1: Write the failing test**

```ts
const PLACES: Record<string, { country: string; tor: boolean }> = {
  "198.51.100.20": { country: "DE", tor: false }, "198.51.100.40": { country: "DE", tor: true }
};
const geo: GeoLookup = { lookup: (ip) => PLACES[ip] ?? { country: "XX", tor: false }, close: () => undefined };
const place = (over: Partial<Parameters<typeof pricingPlace>[0]>) =>
  pricingPlace({ geo, ip: "198.51.100.20", country: undefined, postalCode: undefined, ...over });

it("takes the chosen country, else the account's, else the connection's, else none", () => {
  expect(place({ country: "FR", accountCountry: "RO" })).toEqual({ country: "FR", postalCode: null, status: "READY" });
  expect(place({ accountCountry: "RO" })).toEqual({ country: "RO", postalCode: null, status: "READY" });
  expect(place({ accountCountry: null })).toEqual({ country: "DE", postalCode: null, status: "READY" });
  expect(place({})).toEqual({ country: "DE", postalCode: null, status: "READY" });
  expect(place({ ip: "203.0.113.9" })).toEqual({ country: null, postalCode: null, status: "COUNTRY_NEEDED" });
});

it("prices an account country where the connection says nothing: Tor, an unknown address, no lookup", () => {
  for (const over of [{ ip: "198.51.100.40" }, { ip: "203.0.113.9" }, { ip: "not-an-address" }, { geo: undefined }]) {
    expect(place({ ...over, accountCountry: "RO" })).toEqual({ country: "RO", postalCode: null, status: "READY" });
  }
});

it("asks a US or Canadian account for the postal code, and uses one sent without a country", () => {
  expect(place({ accountCountry: "US" })).toEqual({ country: "US", postalCode: null, status: "POSTAL_CODE_NEEDED" });
  expect(place({ accountCountry: "US", postalCode: "75201" })).toEqual({ country: "US", postalCode: "75201", status: "READY" });
  expect(place({ accountCountry: "CA", postalCode: "k1a0b1" })).toEqual({ country: "CA", postalCode: "K1A 0B1", status: "READY" });
  expect(place({ accountCountry: "US", postalCode: "7520" })).toEqual({ country: "US", postalCode: null, status: "POSTAL_CODE_INVALID" });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm exec vitest run tests/unit/billing-pricing-place.test.ts`
Expected: FAIL, the account-country cases answer `DE` or `COUNTRY_NEEDED`.

- [ ] **Step 3: Implement**

The country is `input.country ?? input.accountCountry ?? connectionCountry(...)`. Rewrite the doc comment above the function to name the three sources in order. Nothing below that line changes.

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm exec vitest run tests/unit/billing-pricing-place.test.ts tests/unit/billing-plans-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/billing/place.ts tests/unit/billing-pricing-place.test.ts
git commit -m "The place a price is for takes the account's sign-up country before the connection's."
```

---

### Task 3: The plans route looks at a session, and can never fail over it

**Files:**
- Create: `apps/api/src/billing/account-country.ts`
- Modify: `apps/api/src/index.ts:456` (the type), `:1658` (the policy row), `:2990-3013` (the auth hook)
- Modify: `apps/api/src/billing/index.ts` (`BillingRoutePolicy`, `BillingRouteDeps`, the plans route and its `onSend`)
- Modify: `tests/unit/billing-plans-route.test.ts`, `tests/unit/s7-authorization.test.ts:173`
- Modify: `tests/support/shipped-corpus.manifest.txt` (add `apps/api/src/billing/account-country.ts`)
- Modify: `docs/superpowers/specs/2026-10-05-netopia-payments-design.md` §2.16.1

**Interfaces:**
- Consumes: `pricingPlace`'s `accountCountry` member (Task 2).
- Produces, in `apps/api/src/billing/account-country.ts`:

```ts
/**
 * The country an account chose at sign-up, or null when it chose none. It rejects when the country cannot be read.
 * The read must run inside the account's own request, on the request's database login.
 */
export interface AccountCountryPort { read(ownerRef: string): Promise<string | null>; }
```

- Produces: `BillingRouteDeps.accountCountry?: AccountCountryPort` (absent: the connection's country, as before). It stays in `BillingRouteOptions`, so main.ts supplies it through the runtime (Task 4).
- Produces: route session policy `"best-effort"`: `type RouteSessionPolicy = "optional" | "best-effort"` in `index.ts`, and the same union in `BillingRoutePolicy`'s `session` member.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/billing-plans-route.test.ts`, a new `describe("GET /v1/billing/plans starts from the signed-in account's sign-up country")`. Harness:

```ts
const OWNER = testHttpIdentity("plans-account-country");
const DE = "198.51.100.20";          // geo answers DE here, XX elsewhere, tor for "198.51.100.40"
const plansApi = (over: { read?: AccountCountryPort["read"]; sessions?: SessionApplication } = {}) => {
  const read = vi.fn(over.read ?? (async () => "RO"));
  const api = buildApi({
    application: unusedAskApplication(), sessions: over.sessions ?? testSessionApplication([OWNER]),
    billing: { ...billing(), plans: testRegionalPlans, geo, accountCountry: { read } }
  });
  return { api, read };
};
const get = (api, headers = {}, url = "/v1/billing/plans", remoteAddress = DE) =>
  api.inject({ method: "GET", url, remoteAddress, headers });
const seen = (response) => [response.statusCode, response.json().currency, response.json().place.country];
```

Cases, each its own `it`:

| Request | Port | Expect `seen(response)` | Also |
|---|---|---|---|
| `testSessionHeaders(OWNER)` | answers `"RO"` | `[200, "RON", "RO"]` | `read` called once with `OWNER.authenticated.ownerRef` |
| `testSessionHeaders(OWNER)` | answers `null` | `[200, "EUR", "DE"]` | |
| `testSessionHeaders(OWNER)`, from `203.0.113.9` | answers `null` | `[200, "USD", null]` | `place.status` is `COUNTRY_NEEDED` |
| no cookie | | `[200, "EUR", "DE"]` | `read` not called |
| `cookie: "__Host-debateai-session=short"` | | `[200, "EUR", "DE"]` | `read` not called |
| a well-formed token no identity has (`testHttpIdentity("stranger")`'s headers) | | `[200, "EUR", "DE"]` | `read` not called |
| `testSessionHeaders(OWNER)`, `sessions.authenticate` throws `Error("SESSION_STORE_DOWN")` | | `[200, "EUR", "DE"]` | `read` not called |
| `testSessionHeaders(OWNER)` | rejects `Error("down")` | `[200, "EUR", "DE"]` | |
| `testSessionHeaders(OWNER)` | rejects `Object.assign(Error("REQUEST_OWNER_MISMATCH"), { code: "42501" })` | `[200, "EUR", "DE"]` | |
| `testSessionHeaders(OWNER)`, url `?country=FR` | answers `"RO"` | `[200, "EUR", "FR"]` | `read` not called |
| `testSessionHeaders(OWNER)`, url `?country=zz9` | answers `"RO"` | `[200, "RON", "RO"]` | Review Focus 4 |
| `testSessionHeaders(OWNER)`, url `?postal_code=75201` | answers `"US"` | `[200, "USD", "US"]` | `place.postal_code` is `"75201"`; Review Focus 3 |
| `testSessionHeaders(OWNER)`, from `198.51.100.40` (Tor) | answers `"RO"` | `[200, "RON", "RO"]` | |

Three more:

```ts
it("says the answer depends on who asks, and never sets a cookie on an answer a browser may keep", async () => {
  const { api } = plansApi();
  const signedIn = await get(api, testSessionHeaders(OWNER));
  expect([signedIn.headers["cache-control"], signedIn.headers.vary]).toEqual(["private, max-age=60", "Cookie"]);
  expect(signedIn.headers["set-cookie"]).toBeUndefined();
  expect((await get(api)).headers.vary).toBe("Cookie");
});

it("reads the country inside the account's own request, on the request login", async () => {
  // A pool shaped as main.ts's request pool; it never connects. createPool and accountContextRoute are @debateai/db's.
  const target = createPool("postgres://127.0.0.1:1/unused", { max: 1 });
  const routed = createPool("postgres://127.0.0.1:1/unused", { max: 1, crossAccount: target });
  let route: unknown;
  const { api } = plansApi({ read: async () => { route = accountContextRoute(routed); return "RO"; } });
  await get(api, testSessionHeaders(OWNER));
  expect(route).toEqual({ kind: "own", credential: OWNER.rawSessionToken });
  await Promise.all([routed.end(), target.end(), api.close()]);
});

it("leaves the optional-session routes as they were: a session lookup that throws still fails them", async () => {
  // same throwing sessions as above
  const status = await api.inject({ method: "GET", url: "/v1/support/status", headers: testSessionHeaders(OWNER) });
  expect(status.statusCode).toBeGreaterThanOrEqual(500);
});
```

Change the existing policy assertion (line 133) and the matrix row at `tests/unit/s7-authorization.test.ts:173` to `{ route: "GET /v1/billing/plans", auth: "public", session: "best-effort", resource: "billing", action: "read-plans" }`. Add to `s7-authorization.test.ts`:

```ts
it("reads a session best-effort on the plans list only, and only on a GET", () => {
  expect(authorizationPolicyInventory.filter((policy) => "session" in policy && policy.session === "best-effort")
    .map((policy) => policy.route)).toEqual(["GET /v1/billing/plans"]);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm exec vitest run tests/unit/billing-plans-route.test.ts tests/unit/s7-authorization.test.ts`
Expected: FAIL, the signed-in cases answer `DE`, `vary` is undefined, the policy rows differ.

- [ ] **Step 3: Add the `"best-effort"` branch to the auth hook in `apps/api/src/index.ts`**

Inside `if (authPolicy === "public")`, beside the `"optional"` branch and without touching it. For a route whose `config.session` is `"best-effort"`:
- read the token with `exactCookie(request.headers.cookie, SESSION_COOKIE_NAME)`; no token or no `options.sessions`: the request stays anonymous;
- call `options.sessions.authenticate(sessionToken, sourceFor(request))` inside `try`; a throw or a `null`: the request stays anonymous;
- on a live session: `setRequestCredential(sessionToken)`, `request.authenticatedSession`, `request.session`, as the `"optional"` branch does;
- never set `request.cookieRefresh` (a kept answer must not carry a cookie) and do no CSRF work (the policy is for GET only).

Set `session: "best-effort"` on the `GET /v1/billing/plans` row.

- [ ] **Step 4: Use it in the plans route in `apps/api/src/billing/index.ts`**

- After the query is parsed: when the query names no country, `request.authenticatedSession` is set and `deps.accountCountry` is present, read `deps.accountCountry.read(ownerRef)`; a rejection is `null`. Otherwise do not read.
- Pass the result as `accountCountry` to `pricingPlace`. Rewrite the handler's comment ("the country the visitor chose … else the connection's") to name the three sources.
- In the route's `onSend`, when the status is 200, also set `vary: Cookie`. Rewrite the comment above `PLANS_CACHE_CONTROL` to say the answer now also depends on the signed-in account.

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run tests/unit/billing-plans-route.test.ts tests/unit/s7-authorization.test.ts tests/unit/dl1-f7-support-origin-and-share.test.ts tests/unit/dl1-f2-support-admission.test.ts tests/unit/ai-generated-header.test.ts`
Expected: PASS.

- [ ] **Step 6: Note the rule in the older spec**

In `docs/superpowers/specs/2026-10-05-netopia-payments-design.md` §2.16.1, add one dated paragraph: "25 November 2026: for a signed-in account with a sign-up country, that country comes before the connection's on the pricing page and at the first quote. See `2026-11-25-account-country-pricing-design.md`."

- [ ] **Step 7: Commit**

```bash
git add apps/api/src tests/unit tests/support/shipped-corpus.manifest.txt docs/superpowers/specs/2026-10-05-netopia-payments-design.md
git commit -m "The plans list prices a signed-in account for its sign-up country, and answers as for a visitor whenever that country cannot be read."
```

---

### Task 4: The first quote starts from the account's country, and the port is wired

**Files:**
- Modify: `apps/api/src/billing/quote.ts` (`QuoteService` deps and `create`, the `QuoteInput.country` comment)
- Modify: `apps/api/src/billing/runtime.ts` (`BillingRuntimeDeps`, the `routes` literal, the `QuoteService` literal)
- Modify: `apps/api/src/main.ts:1997` (the `createBillingRuntime` call)
- Modify: `tests/integration/billing-quote.test.ts`, `tests/unit/billing-plans-route.test.ts` (the "API root" describe)

**Interfaces:**
- Consumes: `AccountCountryPort` (Task 3), `PostgresRegistrationCountryReader` (Task 1).
- Produces: `QuoteService` deps gain `accountCountry?: AccountCountryPort`; `BillingRuntimeDeps` gains `accountCountry?: AccountCountryPort`. Absent in both: today's behaviour, so no test harness changes.

- [ ] **Step 1: Write the failing tests** in `tests/integration/billing-quote.test.ts`

Add an optional parameter to the file's `service()` factory: `service(accountCountry?: AccountCountryPort)`, and import `vi` from vitest. This file's plans charge every country in USD, so the tests read the tax, not the currency.

```ts
/** The pricing page's first quote: no country, nobody named yet. */
const first = (ownerRef: string) => input(ownerRef, { country: null, firstName: null, lastName: null, region: null, city: null });

it("starts the first quote from the account's sign-up country, and asks to confirm it when the connection is elsewhere", async () => {
  geo.country = "DE";
  const result = await service({ read: async () => "RO" }).create(first(randomUUID()));
  expect(result).toMatchObject({ declaredCountry: "RO", ipCountry: "DE", countryConfirmNeeded: true });
  expect(result.quote).toMatchObject({ taxCountry: "RO", taxRateBasisPoints: 2_100 });
  geo.country = "RO";
  expect(await service({ read: async () => "RO" }).create(first(randomUUID())))
    .toMatchObject({ declaredCountry: "RO", countryConfirmNeeded: false });
});

it("uses the connection when the account chose no country, and the body's country when it names one", async () => {
  geo.country = "DE";
  const read = vi.fn(async () => null);
  expect(await service({ read }).create(first(randomUUID()))).toMatchObject({ declaredCountry: "DE", countryConfirmNeeded: false });
  const named = vi.fn(async () => "RO");
  expect(await service({ read: named }).create(input(randomUUID(), { country: "DE" }))).toMatchObject({ declaredCountry: "DE" });
  expect(named).not.toHaveBeenCalled();
});

it("answers the one 503 and stores nothing when the account's country cannot be read", async () => {
  const ownerRef = randomUUID();
  const refused = Object.assign(new Error("REQUEST_OWNER_MISMATCH"), { code: "42501" });
  await expect(service({ read: async () => { throw refused; } }).create(first(ownerRef)))
    .rejects.toMatchObject({ status: 503, code: "TAX_SERVICE_UNAVAILABLE" });
  expect((await database.pool.query("SELECT 1 FROM billing.quote WHERE owner_ref=$1", [ownerRef])).rowCount).toBe(0);
  expect(audit).toEqual([{ event: "billing.quote.refused", code: "TAX_SERVICE_UNAVAILABLE", reason: "ACCOUNT_COUNTRY_UNREADABLE" }]);
});

it("refuses a sign-up country as it refuses a typed one: closed for payment, and over Tor", async () => {   // Review Focus 1, 2
  await expect(service({ read: async () => "GB" }).create(first(randomUUID())))
    .rejects.toMatchObject({ status: 403, code: "COUNTRY_PAYMENT_UNAVAILABLE" });
  geo.tor = true;
  await expect(service({ read: async () => "RO" }).create(first(randomUUID())))
    .rejects.toMatchObject({ status: 403, code: "TOR_REFUSED" });
});
```

In `tests/unit/billing-plans-route.test.ts`, in `describe("P8a the API root hands the billing runtime's routes to buildApi")`, with that describe's own helpers (`code`, `braceAfter`, `topLevelMembers`):

```ts
it("gives the billing runtime the sign-up country reader on the request pool, and the runtime gives it to the routes and the quote", async () => {
  const main = code(await readFile("apps/api/src/main.ts", "utf8"));
  const members = topLevelMembers(main, braceAfter(main, /\bcreateBillingRuntime\(\s*\{/u)).filter((member) => /^accountCountry\b/u.test(member));
  expect(members).toEqual(["accountCountry: new PostgresRegistrationCountryReader(pool)"]);
  const runtime = code(await readFile("apps/api/src/billing/runtime.ts", "utf8"));
  expect(runtime.match(/accountCountry:\s*deps\.accountCountry/gu)?.length).toBe(2);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm exec vitest run tests/integration/billing-quote.test.ts tests/unit/billing-plans-route.test.ts`
Expected: FAIL, the declared country is the connection's and `main.ts` has no `accountCountry` member.

- [ ] **Step 3: Implement in `QuoteService.create`**

After the erasure and live-subscription checks and before `decidePaymentPlace`: when `input.country` is null and the port is present, read it with `input.ownerRef`. A rejection writes the audit line `("billing.quote.refused", { code: "TAX_SERVICE_UNAVAILABLE", reason: "ACCOUNT_COUNTRY_UNREADABLE" })` and throws `new BillingRefusal(503, "TAX_SERVICE_UNAVAILABLE")`. Pass `input.country ?? accountCountry` as `declaredCountry`. `decidePaymentPlace` is not edited. Update the `QuoteInput.country` comment: "Null: the account's sign-up country, else the connection's."

- [ ] **Step 4: Wire it**

- `runtime.ts`: `accountCountry?: AccountCountryPort` on `BillingRuntimeDeps` ("the sign-up country of the request's account; absent: the connection's"), passed to the `routes` literal and to the `QuoteService` literal.
- `main.ts`: in the `createBillingRuntime({ … })` call add `accountCountry: new PostgresRegistrationCountryReader(pool)` with a comment: it is given `pool` itself, not the cross-account target the line above gives the runtime, because the database answers only inside the account's own request.

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run tests/integration/billing-quote.test.ts tests/unit/billing-plans-route.test.ts tests/unit/billing-quote-route.test.ts tests/unit/billing-quote-currency.test.ts tests/architecture/rls-db-cross-account-sites.test.ts && pnpm run typecheck`
Expected: PASS, and the type check exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src tests
git commit -m "The checkout's first quote starts from the account's sign-up country, and waits rather than guess when it cannot be read."
```

---

### Task 5: The pricing page forwards the session

**Files:**
- Modify: `apps/ui/app/pricing/page.tsx:34-46` (`readPlans`)
- Modify: `tests/render/billing-pricing.test.tsx`, `tests/render/t9-landing.test.tsx`

**Interfaces:**
- Consumes: `readSessionCookie(store): string | null` and `createServerContractClient(fetch, sessionCookie?, userAgent?, clientIp?)`, both from `@/lib/serverApi`.

- [ ] **Step 1: Write the failing tests**

In `tests/render/billing-pricing.test.tsx`: add `session: null as string | null` and `client: vi.fn()` to the hoisted `mocks`; make the `serverApi` mock's `createServerContractClient` record its arguments in `mocks.client` before returning the stub; make the `next/headers` mock's `cookies().get` answer `{ value: mocks.session }` for the name `"__Host-debateai-session"` when `mocks.session` is not null. Reset both in the existing `beforeEach`.

```ts
const TOKEN = "s".repeat(43);

it("asks for the plans as the signed-in person, so the answer is for their account's country", async () => {
  mocks.session = TOKEN;
  mocks.getBillingPlans.mockResolvedValue(ROMANIA);
  const document = await renderPricing();
  expect(mocks.client.mock.calls.at(-1)?.[1]).toBe(TOKEN);
  expect(document.querySelector('[data-plan="PLUS"] .pricingPrice')?.textContent).toBe(`${formatMoney("en", "121.00", "RON")} a month`);
});

it("asks with no session when signed out, and when the cookie is not a session", async () => {   // Review Focus 5
  mocks.getBillingPlans.mockResolvedValue(GERMANY);
  for (const session of [null, "short", `${TOKEN}x`]) {
    mocks.session = session;
    await renderPricing();
    expect(mocks.client.mock.calls.at(-1)?.[1]).toBeUndefined();
  }
});
```

In `tests/render/t9-landing.test.tsx`: record the arguments of the mocked `createServerContractClient` the same way, and in the test at line 541 ("GERMANY_PLANS") assert that every recorded call's second argument is `undefined`.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm exec vitest run tests/render/billing-pricing.test.tsx tests/render/t9-landing.test.tsx`
Expected: FAIL in `billing-pricing` only: the second argument is `undefined` for the signed-in case.

- [ ] **Step 3: Implement**

In `readPlans`, read `readSessionCookie(await cookies())` and pass it as the second argument (`undefined` when it is null). Extend the function's comment: "…else the signed-in account's sign-up country, else the connection's country".

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm exec vitest run tests/render/billing-pricing.test.tsx tests/render/t9-landing.test.tsx tests/render/billing-server-billing.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/pricing/page.tsx tests/render
git commit -m "The pricing page asks for the plans as the signed-in person."
```

---

### Task 6: The whole gate

- [ ] **Step 1: Run the gates CI runs**

Run: `pnpm run typecheck && pnpm run lint && pnpm run test:ci-gate`
Expected: exit 0. A red architecture test names a list this plan missed (a new file or function not yet listed): add the entry it asks for, in that list's own form, and say so in the commit.

- [ ] **Step 2: Run the database suites this change can reach**

Run: `pnpm run test:ci-integration`
Then: `pnpm exec vitest run tests/integration/billing-whole-flow.test.ts tests/integration/billing-every-country-closed.test.ts tests/integration/italy-approval-signup-database.test.ts`
Expected: PASS. No existing billing, country-gate or Italy-approval test changes what it expects; if one does, stop and report it rather than editing the expectation.

- [ ] **Step 3: Confirm the untouched files**

Run: `git diff --stat origin/dev -- apps/ui/app/page.tsx apps/ui/lib/billing/serverBilling.ts apps/ui/components/billing/SubscriptionControls.tsx apps/ui/messages apps/ui/legal packages/contract`
Expected: no output.

- [ ] **Step 4: Commit anything Step 1 added**

```bash
git add -A
git commit -m "The lists that pin new files and functions name the sign-up country read."
```

## Left open by the spec, for the owner

The privacy policy's line "Applying the consumer, privacy and tax rules for where you live" (`apps/ui/legal/en/privacy-policy.md:80`) is read as covering this use. If the owner or counsel reads it differently, the policy needs a sentence before this ships. The build does not change.
