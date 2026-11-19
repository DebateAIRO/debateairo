import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const rekey = await import('../../deploy/' + 'preview-lifecycle/v1/rekey-staff-key.mjs');

const folder = join(dirname(fileURLToPath(import.meta.url)), '../../deploy/preview-lifecycle/v1');
const start = Date.parse('2026-11-19T10:00:00Z');
const USER = '11111111-1111-4111-8111-111111111111';
const PERMIT = '22222222-2222-4222-8222-222222222222';
const CODE = '3f9a1c2e';
const site = { rpId: 'dezbatere.ro', origin: 'https://dezbatere.ro' };
const closedRole = { passwordNull: true, expiredMinusInfinity: true, noSessions: true, capabilitiesPreserved: true };
const answer = { permitId: PERMIT, expiresAt: '2026-11-19T10:15:00.000Z', sessionStartedAt: '2026-11-19T09:58:00.000Z', otherSignIns: 0 };

/** Recording fakes for the two things the tool reaches: the postgres-peer creator and the recovery-login pool. */
function harness(options: { open?: unknown; close?: unknown | Error; query?: () => Promise<{ rows: unknown[] }>; pool?: Error; end?: Error } = {}) {
  const calls: string[] = [], controls: any[] = [], secrets: (string | null)[] = [], queries: { text: string; values: unknown[] }[] = [], passwords: string[] = [];
  const bytes = Buffer.alloc(32, 7);
  const runCreator = async (control: any, secret: Buffer | null) => {
    calls.push(control.mode); controls.push(control); secrets.push(secret ? secret.toString() : null);
    if (control.mode === 'open') return 'open' in options ? options.open : { existingRoleOpened: true };
    if (options.close instanceof Error) throw options.close;
    return 'close' in options ? options.close : closedRole;
  };
  const createPool = async (password: string) => {
    calls.push('pool'); passwords.push(password);
    if (options.pool) throw options.pool;
    return {
      query: async (text: string, values: unknown[]) => { calls.push('query'); queries.push({ text, values }); return options.query ? options.query() : { rows: [{ value: answer }] }; },
      end: async () => { calls.push('end'); if (options.end) throw options.end; }
    };
  };
  const run = (target = { userId: null as string | null, signIn: CODE }) => rekey.armRekey({ target, site, runCreator, createPool, randomBytes: () => bytes, now: () => start });
  return { calls, controls, secrets, queries, passwords, bytes, run };
}
const sqlError = (message: string) => Object.assign(new Error(message), { code: 'P0001' });

describe('rekey-staff-key.mjs: what the operator may type', () => {
  it('accepts the Owner or one account id, each with the code of the sign-in the permit is for, and nothing else', () => {
    expect(rekey.parseRekeyArguments(['arm-owner', CODE])).toEqual({ userId: null, signIn: CODE });
    expect(rekey.parseRekeyArguments(['arm-user', USER, CODE])).toEqual({ userId: USER, signIn: CODE });
    for (const argv of [[], ['arm-owner'], ['arm-owner', USER], ['arm-owner', '3F9A1C2E'], ['arm-owner', '3f9a1c2'], ['arm-owner', '3f9a1c2e0'], ['arm-owner', CODE, CODE], ['arm-user'], ['arm-user', USER],
      ['arm-user', 'not-an-id', CODE], ['arm-user', USER, USER], ['arm', CODE], ['reset'], ['arm-owner', '--database-url=postgres://x']])
      expect(() => rekey.parseRekeyArguments(argv)).toThrow('ARGUMENTS_REFUSED');
  });
});

describe('rekey-staff-key.mjs: the site a new staff key is for comes from the API file alone', () => {
  const file = (name: string, extra: Record<string, string> = {}) => ({ PUBLIC_APP_URL: `https://${name}`, STAFF_ACCESS_POLICY_VERSION: '2', STAFF_WEBAUTHN_ORIGIN: `https://${name}`, STAFF_WEBAUTHN_RP_ID: name, ...extra });
  it('reads the main name and the test name when the staff lines name the same site', () => {
    expect(rekey.staffSiteOf(file('dezbatere.ro'))).toEqual(site);
    expect(rekey.staffSiteOf(file('v3-preview.dezbatere.ro'))).toEqual({ rpId: 'v3-preview.dezbatere.ro', origin: 'https://v3-preview.dezbatere.ro' });
  });
  it('refuses when the staff screens are off', () => {
    const { STAFF_ACCESS_POLICY_VERSION: _off, ...without } = file('dezbatere.ro');
    expect(() => rekey.staffSiteOf(without)).toThrow('STAFF_SCREENS_OFF');
    expect(() => rekey.staffSiteOf(file('dezbatere.ro', { STAFF_ACCESS_POLICY_VERSION: '1' }))).toThrow('STAFF_SCREENS_OFF');
  });
  it('refuses staff lines that name another site than the API answers as', () => {
    expect(() => rekey.staffSiteOf(file('dezbatere.ro', { STAFF_WEBAUTHN_RP_ID: 'v3-preview.dezbatere.ro' }))).toThrow('STAFF_NAME_MISMATCH');
    expect(() => rekey.staffSiteOf(file('dezbatere.ro', { STAFF_WEBAUTHN_ORIGIN: 'https://v3-preview.dezbatere.ro' }))).toThrow('STAFF_NAME_MISMATCH');
  });
  it('refuses a name that is not one of the listed sites', () => {
    expect(() => rekey.staffSiteOf(file('example.org'))).toThrow('PUBLIC_NAME_REFUSED');
    expect(() => rekey.staffSiteOf({})).toThrow('PUBLIC_NAME_REFUSED');
  });
});

describe('rekey-staff-key.mjs: open the recovery login, one call, close it', () => {
  it('arms a permit for the Owner and resets the login', async () => {
    const h = harness();
    expect(await h.run()).toEqual({ armed: true, name: 'dezbatere.ro', expiresAt: answer.expiresAt, signInStartedAt: answer.sessionStartedAt, otherSignIns: 0, roleReset: true });
    expect(h.calls).toEqual(['open', 'pool', 'query', 'end', 'close']);
    expect(h.queries).toEqual([{ text: 'SELECT staff.arm_rekey($1::uuid,$2,$3,$4) AS value', values: [null, 'dezbatere.ro', 'https://dezbatere.ro', CODE] }]);
  });

  it('names another staff member by account id', async () => {
    const h = harness();
    await h.run({ userId: USER, signIn: 'abcdef01' });
    expect(h.queries[0]!.values).toEqual([USER, 'dezbatere.ro', 'https://dezbatere.ro', 'abcdef01']);
  });

  it('opens the login for three minutes, far under the database\'s five', async () => {
    const h = harness();
    await h.run();
    expect(rekey.REKEY_LEASE_MS).toBe(180_000);
    expect(h.controls[0]).toEqual({ mode: 'open', validUntil: new Date(start + 180_000).toISOString() });
    expect(h.controls[1]).toEqual({ mode: 'close' });
  });

  it('sends the password only on the creator\'s private channel and to the pool, then zeroes its own copies', async () => {
    const h = harness();
    await h.run();
    const password = Buffer.alloc(32, 7).toString('hex');
    expect(h.secrets).toEqual([password, null]);
    expect(h.passwords).toEqual([password]);
    expect(JSON.stringify(h.controls)).not.toContain(password);
    expect(h.bytes.equals(Buffer.alloc(32, 0))).toBe(true);
  });

  it.each(['STAFF_REKEY_KEY_PRESENT', 'STAFF_REKEY_SESSION_REQUIRED', 'STAFF_REKEY_PERMIT_ACTIVE', 'STAFF_REKEY_TARGET_INVALID', 'STAFF_REKEY_INVALID', 'STAFF_RECOVERY_JIT_REQUIRED'])(
    'passes the database\'s refusal %s on by name and still resets the login', async code => {
      const h = harness({ query: async () => { throw sqlError(code); } });
      expect(await h.run()).toEqual({ armed: false, reason: code, roleReset: true });
      expect(h.calls).toEqual(['open', 'pool', 'query', 'end', 'close']);
    });

  it('never repeats any other database message', async () => {
    const h = harness({ query: async () => { throw sqlError('relation "staff.rekey_permit" does not exist'); } });
    expect(await h.run()).toEqual({ armed: false, reason: 'ARM_REFUSED', roleReset: true });
  });

  it('does not close a login it did not open (another tool holds it)', async () => {
    const h = harness({ open: { existingRoleOpened: false } });
    expect(await h.run()).toEqual({ armed: false, reason: 'STAFF_JIT_OPEN_REFUSED', roleReset: null });
    expect(h.calls).toEqual(['open']);
  });

  it('resets the login when the connection is refused', async () => {
    const h = harness({ pool: Object.assign(new Error('STAFF_JIT_IDENTITY_REFUSED'), { code: 'STAFF_JIT_IDENTITY_REFUSED' }) });
    expect(await h.run()).toEqual({ armed: false, reason: 'STAFF_JIT_IDENTITY_REFUSED', roleReset: true });
    expect(h.calls).toEqual(['open', 'pool', 'close']);
  });

  it('resets the login even when ending the pool throws', async () => {
    const h = harness({ end: new Error('socket') });
    expect((await h.run()).roleReset).toBe(true);
    expect(h.calls.at(-1)).toBe('close');
  });

  it('says so when the login was not reset', async () => {
    expect((await harness({ close: { ...closedRole, noSessions: false } }).run()).roleReset).toBe(false);
    expect((await harness({ close: new Error('STAFF_JIT_CLOSE_REFUSED') }).run())).toMatchObject({ armed: true, roleReset: false });
  });

  it('refuses an answer that is not a permit', async () => {
    for (const rows of [[], [{ value: null }], [{ value: { ...answer, permitId: 'x' } }], [{ value: { ...answer, expiresAt: 'soon' } }], [{ value: { ...answer, otherSignIns: -1 } }], [{ value: answer }, { value: answer }]])
      expect(await harness({ query: async () => ({ rows }) }).run()).toEqual({ armed: false, reason: 'ARM_ANSWER_REFUSED', roleReset: true });
  });
});

describe('rekey-staff-key.mjs: the one line and the exit code', () => {
  const ok = { armed: true, name: 'dezbatere.ro', expiresAt: answer.expiresAt, signInStartedAt: answer.sessionStartedAt, otherSignIns: 1, roleReset: true };
  const command = async (argv: string[], result: unknown, who = { platform: 'linux', uid: 0 }) => {
    const logs: any[] = [], targets: unknown[] = [];
    const held: string[] = [], released: string[] = [];
    const signals = { on: (name: string) => { held.push(name); }, off: (name: string) => { released.push(name); } };
    const code = await rekey.runCommand(argv, { ...who, signals, run: async (target: unknown) => { targets.push(target); expect(held).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']); expect(released).toEqual([]); if (result instanceof Error) throw result; return result; }, log: (event: unknown) => logs.push(event) });
    return { code, logs, targets, held, released };
  };

  it('holds SIGINT, SIGTERM and SIGHUP while it runs, so a signal cannot leave the login open, and lets go of them after', async () => {
    for (const result of [ok, new Error('boom')]) {
      const { held, released } = await command(['arm-owner', CODE], result);
      expect(held).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
      expect(released).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
    }
  });

  it('prints the permit\'s end and the sign-in it is for, never an account id, and exits 0', async () => {
    const { code, logs, targets } = await command(['arm-user', USER, CODE], ok);
    expect(code).toBe(0);
    expect(targets).toEqual([{ userId: USER, signIn: CODE }]);
    expect(logs).toEqual([{ event: 'PREVIEW_STAFF_REKEY_ARMED', name: 'dezbatere.ro', expiresAt: answer.expiresAt, signInStartedAt: answer.sessionStartedAt, otherSignIns: 1, roleReset: true }]);
    expect(JSON.stringify(logs)).not.toContain(USER);
    expect(JSON.stringify(logs)).not.toContain(PERMIT);
  });

  it('exits non-zero when a permit was armed but the login was not reset', async () => {
    const { code, logs } = await command(['arm-owner', CODE], { ...ok, roleReset: false });
    expect(code).toBe(1);
    expect(logs[0]).toMatchObject({ event: 'PREVIEW_STAFF_REKEY_ARMED', roleReset: false });
  });

  it('prints the refusal by name and exits non-zero', async () => {
    expect(await command(['arm-owner', CODE], { armed: false, reason: 'STAFF_REKEY_KEY_PRESENT', roleReset: true }))
      .toMatchObject({ code: 1, logs: [{ event: 'PREVIEW_STAFF_REKEY_REFUSED', reason: 'STAFF_REKEY_KEY_PRESENT', roleReset: true }] });
    expect(await command(['arm-owner', CODE], Object.assign(new Error('RELEASE_UNVERIFIED'), { code: 'RELEASE_UNVERIFIED' })))
      .toMatchObject({ code: 1, logs: [{ event: 'PREVIEW_STAFF_REKEY_REFUSED', reason: 'RELEASE_UNVERIFIED', roleReset: null }] });
    expect(await command(['arm-owner', CODE], new Error('something with a path /etc/secret')))
      .toMatchObject({ code: 1, logs: [{ event: 'PREVIEW_STAFF_REKEY_REFUSED', reason: 'UNEXPECTED', roleReset: null }] });
  });

  it('only root on Linux may run it, and wrong words reach nothing', async () => {
    for (const who of [{ platform: 'darwin', uid: 0 }, { platform: 'linux', uid: 1000 }]) {
      const { code, logs, targets } = await command(['arm-owner', CODE], ok, who);
      expect(code).toBe(1); expect(targets).toEqual([]);
      expect(logs).toEqual([{ event: 'PREVIEW_STAFF_REKEY_REFUSED', reason: 'ACTOR_REFUSED', roleReset: null }]);
    }
    const { code, logs, targets } = await command(['arm-everyone', CODE], ok);
    expect(code).toBe(1); expect(targets).toEqual([]);
    expect(logs[0]).toMatchObject({ reason: 'ARGUMENTS_REFUSED' });
  });

  it('loads and refuses cleanly off the server with no environment but PATH', () => {
    const result = spawnSync('/usr/bin/env', ['-i', 'PATH=/usr/sbin:/usr/bin:/sbin:/bin', process.execPath, join(folder, 'rekey-staff-key.mjs'), 'arm-owner', CODE], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toEqual({ event: 'PREVIEW_STAFF_REKEY_REFUSED', reason: 'ACTOR_REFUSED', roleReset: null });
    expect(result.stderr).toBe('');
  });
});

describe('rekey-staff-key.mjs: what it may reach', () => {
  const source = readFileSync(join(folder, 'rekey-staff-key.mjs'), 'utf8');
  it('makes one database call, the permit, as the recovery login the creator actor opens', () => {
    expect(source.match(/\.query\(/g)).toHaveLength(1);
    expect(source).toContain("'SELECT staff.arm_rekey($1::uuid,$2,$3,$4) AS value'");
    expect(source).toContain('creatorRunner({ engine, nodePath: process.execPath })');
    expect(source).toContain('INTERIM_IDENTITY_SQL');
    expect(source).not.toMatch(/ALTER ROLE|PASSWORD '|postgres(ql)?:\/\//);
    // Run by hand, it takes the database's place from nowhere but the kit's own layout.
    expect(source).toContain('resolveStaffDbHost(undefined)');
    expect(source).not.toMatch(/process\.env/);
  });
  it('checks the release before it loads the database driver from it', () => {
    expect(source.indexOf('await verifyReleaseForImport({ plan, importPaths: [pgPath] })')).toBeGreaterThan(0);
    expect(source.indexOf('await verifyReleaseForImport({ plan, importPaths: [pgPath] })')).toBeLessThan(source.indexOf("createRequire(`${engine}/package.json`)(pgPath)"));
  });
  it('is listed among the kit\'s files', () => {
    expect(readFileSync(join(folder, 'README.md'), 'utf8')).toContain('rekey-staff-key.mjs');
  });
});
