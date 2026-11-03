import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const startChecks = await import('../../tools/' + 'upload-check/start-checks.mjs');

// The release root is the folder that holds dialectical-engine/. Here it is this worktree, whose packages are installed.
const engine = resolve(import.meta.dirname, '../..');
const root = resolve(engine, '..');
const driver = join(engine, 'tools/upload-check/start-checks-driver.ts');
const roots: string[] = [];
afterEach(() => { for (const folder of roots.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const scratch = () => { const folder = realpathSync(mkdtempSync(join(tmpdir(), 'upload-check-start-'))); roots.push(folder); return folder; };
/** Every running process whose command line names <folder>: a PostgreSQL the check left behind would name its data folder. */
const processesNaming = (folder: string) => execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' }).split('\n').filter((line) => line.includes(folder));
const portHolders = () => execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' }).split('\n').filter((line) => /postgres.* -p 5434( |$)/.test(line));

describe('check 3: the API and runner start checks as the production logins', () => {
  it('both start checks pass as the production logins', async () => {
    const before = readFileSync(driver, 'utf8');
    const workdir = scratch();
    const result = await startChecks.checkStartChecks({ root, workdir, node: process.execPath });
    expect(result.name).toBe('start-checks');
    expect(result.lines, result.lines.join('\n')).toContain('api runtime login: passed');
    expect(result.lines, result.lines.join('\n')).toContain('runner login: passed');
    expect(result.lines, result.lines.join('\n')).toContain('api system logins: passed');
    expect(result.lines, result.lines.join('\n')).toContain("known gap: the server's logins were made by hand in step B4 of R22's own upload guide; this checks the production list");
    expect(result.status).toBe('passed');
    expect(typeof result.seconds).toBe('number');
    // The repository already holds the same driver, so nothing was copied over it and it is still there, unchanged.
    expect(readFileSync(driver, 'utf8')).toBe(before);
    expect(processesNaming(workdir)).toEqual([]);
    expect(existsSync(join(workdir, 'start-checks'))).toBe(false);
  }, 600_000);

  it('a runner login with one more role is refused', async () => {
    const workdir = scratch();
    const result = await startChecks.checkStartChecks({
      root, workdir, node: process.execPath, extraEnv: { UPLOAD_CHECK_TEST_EXTRA_GRANT: 'debateai_billing_runtime' }
    });
    expect(result.status).toBe('refused');
    expect(result.lines, result.lines.join('\n')).toContain('runner login: refused');
    expect(result.lines, result.lines.join('\n')).toContain('api runtime login: passed');
    expect(result.lines, result.lines.join('\n')).toContain('UPLOAD_CHECK_START_CHECK_REFUSED');
    expect(processesNaming(workdir)).toEqual([]);
  }, 600_000);

  it('a system login without a recovery role is refused on the system route', async () => {
    // The API's start runs each recovery check on the runtime login and then on its system target (attestEveryRoute).
    // Taking one recovery role from api-system alone must refuse there, while the runtime login's own check still passes.
    const workdir = scratch();
    const result = await startChecks.checkStartChecks({
      root, workdir, node: process.execPath, extraEnv: { UPLOAD_CHECK_TEST_SYSTEM_REVOKE: 'debateai_password_reset_runtime' }
    });
    expect(result.status).toBe('refused');
    expect(result.lines, result.lines.join('\n')).toContain('api system logins: refused');
    expect(result.lines, result.lines.join('\n')).toContain('  PASSWORD_RESET_DATABASE_ROLE_INVALID on the system route (api-system)');
    expect(result.lines, result.lines.join('\n')).toContain('api runtime login: passed');
    expect(result.lines, result.lines.join('\n')).toContain('runner login: passed');
    expect(processesNaming(workdir)).toEqual([]);
  }, 600_000);

  it('port 5434 in use refuses before PostgreSQL starts', async () => {
    const workdir = scratch();
    const holder: Server = createServer((socket) => socket.end());
    await new Promise<void>((done, failed) => { holder.once('error', failed); holder.listen(5434, '127.0.0.1', () => done()); });
    try {
      const result = await startChecks.checkStartChecks({ root, workdir, node: process.execPath });
      expect(result.status).toBe('refused');
      expect(result.lines, result.lines.join('\n')).toContain('UPLOAD_CHECK_PORT_BUSY');
      expect(processesNaming(workdir)).toEqual([]);
      expect(portHolders()).toEqual([]);
      expect(existsSync(join(workdir, 'start-checks'))).toBe(false);
    } finally {
      await new Promise<void>((done) => holder.close(() => done()));
    }
  });

  it('a root without the driver gets a copy, which is removed afterwards', async () => {
    // An older commit's root: dialectical-engine/ with no tools/upload-check folder. Its stand-in tsx says whether the
    // driver it was handed is there, byte for byte the checker's own, and nothing more.
    const older = scratch();
    mkdirSync(join(older, 'dialectical-engine/node_modules/.bin'), { recursive: true });
    writeFileSync(join(older, 'dialectical-engine/node_modules/.bin/tsx'),
      `#!/bin/sh\ncmp -s "$1" '${driver}' && echo '{"ok":false,"lines":["start checks: not checked: the stand-in driver ran"]}'\n`, { mode: 0o755 });
    const result = await startChecks.checkStartChecks({ root: older, workdir: scratch(), node: process.execPath });
    expect(result).toMatchObject({ status: 'not-checked', lines: ['start checks: not checked: the stand-in driver ran'] });
    expect(existsSync(join(older, 'dialectical-engine/tools'))).toBe(false);
  });

  it('a driver past its limit is stopped with everything it started', async () => {
    // The stand-in driver starts a grandchild, as the real one starts PostgreSQL, and then hangs. Each sleep carries a
    // made-up length that names this test, so ps can tell them from any other sleep.
    const older = scratch();
    mkdirSync(join(older, 'dialectical-engine/node_modules/.bin'), { recursive: true });
    writeFileSync(join(older, 'dialectical-engine/node_modules/.bin/tsx'), '#!/bin/sh\n/bin/sleep 3011 &\nexec /bin/sleep 3012\n', { mode: 0o755 });
    const sleeps = () => execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' }).split('\n').filter((line) => /^\/bin\/sleep 301[12]$/.test(line.trim()));
    const result = await startChecks.checkStartChecks({ root: older, workdir: scratch(), node: process.execPath, limitMs: 2000 });
    expect(result.status).toBe('not-checked');
    expect(result.lines[0]).toContain('ran past 2 s');
    expect(sleeps()).toEqual([]);
    expect(existsSync(join(older, 'dialectical-engine/tools'))).toBe(false);
  });

  it('no root means not checked', async () => {
    const result = await startChecks.checkStartChecks({ root: null, workdir: scratch(), node: process.execPath });
    expect(result).toMatchObject({ name: 'start-checks', status: 'not-checked', lines: ['no installed release'] });
  });
});
