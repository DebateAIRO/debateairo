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
    const result = runPython('tests/unit/preview_budget_authority_v2_test.py', 30000);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 51 tests');
    expect(result.stderr).toContain('OK');
  });
});
