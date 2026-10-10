import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
/**
 * unittest's summary line, exactly: "OK" alone, or "OK (skipped=N)" only where a test file has a
 * known, environment-dependent skip. Plain toContain('OK') would also pass a run that skipped tests.
 */
function summaryLine(stderr: string): string | undefined {
  return stderr.split('\n').map(line => line.trim()).filter(line => /^(OK|FAILED)\b/.test(line)).pop();
}
/** The only skips the v2 file may take: running as root, and a file system that cannot hard-link a socket. */
const V2_KNOWN_SKIPS = ['needs a non-root owner', 'this file system cannot hard-link a socket'];
function runPython(file: string, timeout: number) {
  return spawnSync('/usr/bin/python3', [resolve(file), '-v'], {
    encoding: 'utf8', timeout, env: { PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' }
  });
}
describe('production preview spending guard optional JSON mode', () => {
  it('runs strict validation and budget preservation behaviors without real credentials or dispatch', () => {
    const result = runPython('tests/unit/preview_budget_authority_json_mode_test.py', 10000);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 8 tests');
    expect(summaryLine(result.stderr)).toBe('OK');
  });
  it('runs the v2 team daily pot, concurrency, halt and custody behaviors offline', () => {
    // About 4 s locally (2026-10-09): the margin covers a loaded CI runner. On failure, show the
    // END of the output (the failing test and its traceback) and any spawn error or signal.
    const result = runPython('tests/unit/preview_budget_authority_v2_test.py', 90000);
    // The CI gate prints only the first lines of a failure message, so the end of the output (the
    // last test that ran, a traceback, the summary) comes first, on one line.
    const last = result.stderr.split('\n').filter(line => line.trim()).slice(-12).join(' | ');
    expect(result.status, `status=${result.status} signal=${result.signal} ${String(result.error ?? '')} LAST: ${last}\n${result.stderr.slice(-6000)}`).toBe(0);
    expect(result.stderr).toContain('Ran 103 tests');
    const summary = summaryLine(result.stderr);
    const skips = [...result.stderr.matchAll(/ skipped '([^']*)'/g)].map(match => match[1]);
    expect(summary === 'OK' || summary === `OK (skipped=${skips.length})`, String(summary)).toBe(true);
    expect(skips.every(reason => V2_KNOWN_SKIPS.includes(reason!)), skips.join('; ')).toBe(true);
  });
  it('checks the reviewed gate v2 systemd files and the DeepInfra address check offline', () => {
    const result = runPython('tests/unit/preview_gate_v2_unit_test.py', 10000);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 24 tests');
    expect(summaryLine(result.stderr)).toBe('OK');
  });
  it('runs the v3 model table, /remaining and probe behaviors offline', () => {
    const result = runPython('tests/unit/preview_budget_authority_v3_test.py', 30000);
    const last = result.stderr.split('\n').filter(line => line.trim()).slice(-12).join(' | ');
    expect(result.status, `status=${result.status} signal=${result.signal} ${String(result.error ?? '')} LAST: ${last}\n${result.stderr.slice(-6000)}`).toBe(0);
    expect(result.stderr).toContain('Ran 79 tests');
    expect(summaryLine(result.stderr)).toBe('OK');
  });
  it('checks the reviewed gate v3 systemd files and the enabled-model start check offline', () => {
    const result = runPython('tests/unit/preview_gate_v3_unit_test.py', 10000);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 14 tests');
    expect(summaryLine(result.stderr)).toBe('OK');
  });
});
