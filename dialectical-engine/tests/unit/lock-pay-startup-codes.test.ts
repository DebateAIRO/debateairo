// Real payments: the codes the owner reads when the API refuses to start while switching to live. The launcher prints
// `PREVIEW_API_STARTUP_REFUSED <code>` for the closed forms in startup-refusals.mjs and the bare line for anything else;
// these cases pin the API's own billing refusals to those forms, as they are really thrown, and follow one through the
// launcher's own import of a TypeScript entry (tsx) and afterApiListen, as a boot failure of main.ts travels.
import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { assertNoRecordsDatedAhead, assertOtherSystemRecordsClosed } from '../../apps/api/src/billing/connectors.js';
import { assertLiveInvoicersAreLive, assertPreviewLivePayments, assertStageInvoicersAreSandboxes } from '../../apps/api/src/billing/stage-clock.js';
import { parseApiEnvironment } from '../../packages/register/src/runtime-environment.js';
import { validApiEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
const refusals = await import('../../deploy/' + 'preview-auth-dev/v1/startup-refusals.mjs');
const receipt = await import('../../deploy/' + 'preview-auth-dev/v1/runtime-receipt.mjs');
const execute = promisify(execFile);
const OPERATOR = resolve('deploy/preview-auth-dev/v1');

const LINE = 'PREVIEW_API_STARTUP_REFUSED';
const lineOf = (run: () => unknown) => { try { run(); } catch (error) { return refusals.startupRefusedLine(LINE, error); } return 'started'; };

describe('the API\'s own billing start refusals are named on this kit', () => {
 it('names exactly the closed forms of the live switch\'s codes', () => {
  for (const code of [
   'BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=1:charges=0:jobs=2', 'BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=0:charges=0:jobs=123456789',
   'BILLING_RECORDS_DATED_AHEAD:rows=3:jobs=0', 'BILLING_LIVE_SANDBOX_INVOICER_REFUSED', 'BILLING_STAGE_LIVE_INVOICER_REFUSED',
   'PREVIEW_LIVE_PAYMENTS_UNSET', 'PREVIEW_LIVE_PAYMENTS_MISMATCH', 'PREVIEW_LIVE_PAYMENTS_OFF_PREVIEW', 'PREVIEW_LIVE_PAYMENTS_BILLING_OFF',
   ...['value', 'incomplete', 'netopia-base', 'quaderno-base', 'smartbill-base', 'paths', 'egress', 'egress-account'].map(word => `PREVIEW_LIVE_PAYMENTS_REFUSED:${word}`)
  ]) expect(refusals.isNamedRefusal(code), code).toBe(true);
  for (const code of [
   'BILLING_OTHER_SYSTEM_RECORDS_OPEN', 'BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=-1:charges=0:jobs=0', 'BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=1:charges=0',
   'BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=1234567890:charges=0:jobs=0', 'BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=1:charges=0:jobs=0:x=1',
   'BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=1.5:charges=0:jobs=0', 'BILLING_RECORDS_DATED_AHEAD:rows=1', 'BILLING_RECORDS_DATED_AHEAD:rows=1:jobs=one',
   'BILLING_CONFIGURATION_INCOMPLETE', 'BILLING_CONFIGURATION_INVALID:NETOPIA_API_BASE_URL', 'BILLING_STAGE_CLOCK_LIVE_REFUSED', 'BILLING_COMPANY_FACTS_UNVERIFIED:cui',
   'BILLING_LIVE_SANDBOX_INVOICER_REFUSED https://smartbill.invalid', 'billing_live_sandbox_invoicer_refused', 'PREVIEW_LIVE_PAYMENTS_REFUSED:Real-Money'
  ]) expect(refusals.isNamedRefusal(code), code).toBe(false);
 });

 it('the real throwers give exactly the line the operator reads', () => {
  expect(lineOf(() => assertOtherSystemRecordsClosed({ subscriptions: 2, charges: 1, jobs: 0 })))
   .toBe(`${LINE} BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=2:charges=1:jobs=0`);
  expect(lineOf(() => assertNoRecordsDatedAhead({ rows: 4, jobs: 1 }))).toBe(`${LINE} BILLING_RECORDS_DATED_AHEAD:rows=4:jobs=1`);
  expect(lineOf(() => assertLiveInvoicersAreLive({ paymentEnvironment: 'live', quadernoApiBaseUrl: 'https://dezbatere.sandbox-quadernoapp.com/api', smartbillApiBaseUrl: 'https://ws.smartbill.ro/SBORO/api' })))
   .toBe(`${LINE} BILLING_LIVE_SANDBOX_INVOICER_REFUSED`);
  expect(lineOf(() => assertStageInvoicersAreSandboxes({ paymentEnvironment: 'sandbox', quadernoApiBaseUrl: 'https://dezbatere.quadernoapp.com/api', smartbillApiBaseUrl: 'https://smartbill.invalid' })))
   .toBe(`${LINE} BILLING_STAGE_LIVE_INVOICER_REFUSED`);
  expect(lineOf(() => assertPreviewLivePayments({ preview: true, paymentEnvironment: 'live', billingOn: true, flag: null }))).toBe(`${LINE} PREVIEW_LIVE_PAYMENTS_UNSET`);
  expect(lineOf(() => assertPreviewLivePayments({ preview: true, paymentEnvironment: 'sandbox', billingOn: true, flag: 'real-money' }))).toBe(`${LINE} PREVIEW_LIVE_PAYMENTS_MISMATCH`);
  expect(lineOf(() => assertPreviewLivePayments({ preview: false, paymentEnvironment: 'live', billingOn: true, flag: 'real-money' }))).toBe(`${LINE} PREVIEW_LIVE_PAYMENTS_OFF_PREVIEW`);
  expect(lineOf(() => assertPreviewLivePayments({ preview: true, paymentEnvironment: 'live', billingOn: false, flag: 'real-money' }))).toBe(`${LINE} PREVIEW_LIVE_PAYMENTS_BILLING_OFF`);
  expect(lineOf(() => parseApiEnvironment({ ...validApiEnvironmentFixture(), PREVIEW_LIVE_PAYMENTS: 'yes' }))).toBe(`${LINE} PREVIEW_LIVE_PAYMENTS_REFUSED:value`);
  // Any other boot failure keeps the bare line.
  expect(lineOf(() => { throw new TypeError('BILLING_CONFIGURATION_INVALID:NETOPIA_API_BASE_URL'); })).toBe(LINE);
  expect(lineOf(() => { throw new TypeError('KEK_UNRESOLVED'); })).toBe(LINE);
 });

 it('a refusal while main is imported reaches the launcher unchanged through afterApiListen, and nothing is announced', async () => {
  const hash = 'a'.repeat(64);
  const publication = { publicationId: '11111111-1111-4111-8111-111111111111', publicationKind: 'GENERAL', baseRegisterVersion: '8', registerVersion: '12', requestSha256: hash,
   snapshotSha256: 'b'.repeat(64), rowCount: 68, recordedAt: '2026-10-06T12:00:00.000Z', outcome: 'CREATED' };
  const binding = { sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceManifestSha256: hash, operatorManifestSha256: hash, contractSha256: hash, apiMainSha256: hash };
  const identity = { pid: 123, uid: 456, bootId: '11111111-1111-4111-8111-111111111111', startTicks: '10001' };
  const selection = { REGISTER_VERSION: '12', DEBATEAI_DEPLOYMENT_MODE: 'hosted', RELEASE_KEY: ['r12', 'aaaaaaaaaaaa'].join('-') };
  const failure = new TypeError('BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=1:charges=0:jobs=0');
  const emitted: unknown[] = [];
  let thrown: unknown;
  try {
   await receipt.afterApiListen({ binding, publication, identity, readSelection: () => selection, importMain: async () => { throw failure; }, emit: (event: unknown) => emitted.push(event) });
  } catch (error) { thrown = error; }
  expect(thrown).toBe(failure);
  expect(emitted).toEqual([]);
  expect(refusals.startupRefusedLine(LINE, thrown)).toBe(`${LINE} BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=1:charges=0:jobs=0`);
 });

 it('a TypeScript entry that refuses during its top-level awaits, imported through the launcher\'s tsx, gives the named line', async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'lock-pay-')));
  try {
   // The entry mimics main.ts in its ES module package: a top-level await, then a boot stage that throws a coded error
   // (TypedDomainError's shape) or a TypeError whose message is the code.
   writeFileSync(join(folder, 'package.json'), '{"type":"module"}\n');
   writeFileSync(join(folder, 'entry.ts'), [
    'class CodedError extends Error { constructor(readonly code: string, message: string) { super(message); } }',
    'const which: string = process.env.WHICH ?? "";',
    'await new Promise((done) => setTimeout(done, 5));',
    'if (which === "typed") throw new CodedError("PREVIEW_LIVE_PAYMENTS_UNSET", "the preview takes live payments only with its switch");',
    'if (which === "counts") throw new TypeError("BILLING_RECORDS_DATED_AHEAD:rows=2:jobs=0");',
    'throw new TypeError("BILLING_CONFIGURATION_INVALID:NETOPIA_API_BASE_URL");',
    'export {};'
   ].join('\n'));
   writeFileSync(join(folder, 'launch.mjs'), [
    `import { loadTsxApi } from ${JSON.stringify(join(OPERATOR, 'tsx-api.mjs'))};`,
    `import { startupRefusedLine } from ${JSON.stringify(join(OPERATOR, 'startup-refusals.mjs'))};`,
    'const { tsImport } = await loadTsxApi();',
    `try { await tsImport(${JSON.stringify(join(folder, 'entry.ts'))}, import.meta.url); } catch (error) { process.stdout.write(startupRefusedLine('PREVIEW_API_STARTUP_REFUSED', error)); }`
   ].join('\n'));
   const run = async (which: string) => (await execute(process.execPath, [join(folder, 'launch.mjs')], { env: { PATH: process.env.PATH ?? '', WHICH: which }, timeout: 30_000 })).stdout;
   expect(await run('typed')).toBe(`${LINE} PREVIEW_LIVE_PAYMENTS_UNSET`);
   expect(await run('counts')).toBe(`${LINE} BILLING_RECORDS_DATED_AHEAD:rows=2:jobs=0`);
   expect(await run('other')).toBe(LINE);
  } finally { rmSync(folder, { recursive: true, force: true }); }
 }, 60_000);
});
