import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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
    expect(result.stderr).toContain('OK');
  });
  it('runs the v2 team daily pot, concurrency, halt and custody behaviors offline', () => {
    // About 4 s locally (2026-10-09): the margin covers a loaded CI runner. On failure, show the
    // END of the output (the failing test and its traceback) and any spawn error or signal.
    const result = runPython('tests/unit/preview_budget_authority_v2_test.py', 90000);
    expect(result.status, `${String(result.error ?? '')} signal=${result.signal}\n${result.stderr.slice(-6000)}`).toBe(0);
    expect(result.stderr).toContain('Ran 103 tests');
    expect(result.stderr).toContain('OK');
  });
  it('checks the reviewed gate v2 systemd files and the DeepInfra address check offline', () => {
    const result = runPython('tests/unit/preview_gate_v2_unit_test.py', 10000);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 24 tests');
    expect(result.stderr).toContain('OK');
  });
});
