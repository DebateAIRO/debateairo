/**
 * Row-level security S01, PLAN S8.2 (§0.3 "Proof and accounts"; SPEC-v4 R43; DECISIONS D44, D57, D68): the test-only
 * seam R43 names. `createRlsTestAccounts(pools: { runtime; authorization }, { custodyRoot, registerVersion })` makes
 * accounts A and B through the product's own services and writes their sign-in details to one 0600 file under the
 * custody root; it returns `{ path, accounts: [{ label, email, userId }, …] }` and no secret.
 *
 * The implementation lives in tools/rls/proof.ts (finding F-C8-1): the source audit refuses an engine file that imports
 * a specifier matching /(?:tests?|fixtures?)/ (tools/orphan-audit/src/index.ts:740-747), so the CLI and the proof cannot
 * import this file by its name; tests import it here.
 */
export {
  createRlsTestAccounts,
  openRlsAccountServices,
  readRlsTestAccountsFile,
  rlsWaitForTotpStepAfter,
  RLS_TEST_ACCOUNTS_FILE_NAME,
  type RlsAccountPools,
  type RlsAccountServices,
  type RlsTestAccountRecord,
  type RlsTestAccountSecrets,
  type RlsTestAccountsFile,
  type RlsTestAccountsOptions
} from "./proof.js";
