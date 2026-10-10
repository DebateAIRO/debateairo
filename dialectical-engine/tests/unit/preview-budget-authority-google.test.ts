import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
/**
 * PR C: the Google gate's offline Python suites. The summary line must be exactly "OK" (no skips),
 * and each count is pinned, so a deleted or skipped test is a red.
 */
function summaryLine(stderr: string): string | undefined {
  return stderr.split('\n').map(line => line.trim()).filter(line => /^(OK|FAILED)\b/.test(line)).pop();
}
function runPython(file: string, timeout: number) {
  return spawnSync('/usr/bin/python3', [resolve(file), '-v'], {
    encoding: 'utf8', timeout, env: { PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' }
  });
}
describe('the preview spending gate, Google profile and files (PR C)', () => {
  it('runs the Google profile: shape, dated prices, settlement, halts, unbilled refusals, key, probe', () => {
    const result = runPython('tests/unit/preview_budget_authority_google_test.py', 30000);
    const last = result.stderr.split('\n').filter(line => line.trim()).slice(-12).join(' | ');
    expect(result.status, `status=${result.status} signal=${result.signal} ${String(result.error ?? '')} LAST: ${last}\n${result.stderr.slice(-6000)}`).toBe(0);
    expect(result.stderr).toContain('Ran 34 tests');
    expect(summaryLine(result.stderr)).toBe('OK');
  });
  it('checks the Google gate units, forwarder, halt watcher and README offline', () => {
    const result = runPython('tests/unit/preview_gate_google_unit_test.py', 10000);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 11 tests');
    expect(summaryLine(result.stderr)).toBe('OK');
  });
  it('checks the Google address list, the forwarder check and the 24-hour measurement offline', () => {
    const result = runPython('tests/unit/preview_google_addresses_test.py', 10000);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 32 tests');
    expect(summaryLine(result.stderr)).toBe('OK');
  });
});
