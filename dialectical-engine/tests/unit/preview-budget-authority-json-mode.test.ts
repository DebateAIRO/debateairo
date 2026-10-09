import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
describe('production preview spending guard optional JSON mode', () => {
  it('runs strict validation and budget preservation behaviors without real credentials or dispatch', () => {
    const result = spawnSync('/usr/bin/python3', [resolve('tests/unit/preview_budget_authority_json_mode_test.py'), '-v'], {
      encoding: 'utf8', timeout: 10000, env: { PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' }
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 9 tests');
    expect(result.stderr).toContain('OK');
  });
});
