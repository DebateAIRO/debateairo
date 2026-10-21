// Side-by-side spec §5 (the database rule): the database steps a newer release adds to the older one's, and the n1 header
// lines each step declares about itself. The release check (D11) and the database-ahead file (D5) read both.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
const steps = await import('../../deploy/' + 'preview-lifecycle/v1/migration-steps.mjs');

const { MIGRATION_FILE, addedMigrations, n1Headers } = steps;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const migration = (name: string, text = `-- ${name}\nSELECT 1;\n`) => ({ path: `dialectical-engine/migrations/${name}`, sha256: sha(text), mode: 0o644 });
const manifest = (...files: object[]) => ({ schema: 'preview-auth-dev-source-v3', files: [{ path: 'package.json', sha256: sha('{}'), mode: 0o644 }, ...files] });
const OLD = [migration('0122_engine_map_check.sql'), migration('0123_side_by_side_releases.sql')];

describe('migration steps between two manifests (side-by-side spec §5)', () => {
  it('names a migration file by its repository path only', () => {
    expect(MIGRATION_FILE.exec('dialectical-engine/migrations/0124_side_next.sql')?.[1]).toBe('0124_side_next.sql');
    for (const path of ['dialectical-engine/migrations/compatibility/0124_x.sql', 'migrations/0124_x.sql', 'dialectical-engine/migrations/124_x.sql',
      'dialectical-engine/migrations/0124_X.sql', 'dialectical-engine/migrations/0124_x.sql.bak', 'x/dialectical-engine/migrations/0124_x.sql']) {
      expect(MIGRATION_FILE.test(path)).toBe(false);
    }
  });

  it('lists the added migrations in ascending order, with their hashes, whatever order the manifest holds', () => {
    const later = migration('0125_more.sql'), next = migration('0124_side_next.sql');
    const added = addedMigrations(manifest(...OLD), manifest(later, ...OLD, next, { path: 'dialectical-engine/migrations/lineage/README.md', sha256: sha('r'), mode: 0o644 }));
    expect(added).toEqual([{ name: '0124_side_next.sql', sha256: next.sha256 }, { name: '0125_more.sql', sha256: later.sha256 }]);
    expect(Object.isFrozen(added)).toBe(true);
    expect(Object.isFrozen(added[0])).toBe(true);
  });

  it('lists nothing when the newer release adds no migration', () => {
    expect(addedMigrations(manifest(...OLD), manifest(...OLD))).toEqual([]);
  });

  it('refuses a newer release that lacks a migration of the older one', () => {
    expect(() => addedMigrations(manifest(...OLD), manifest(OLD[0]!, migration('0124_side_next.sql')))).toThrow(expect.objectContaining({ code: 'DATABASE_AHEAD_NOT_A_SUPERSET' }));
  });

  it('refuses a newer release whose migration of the same name has other bytes', () => {
    expect(() => addedMigrations(manifest(...OLD), manifest(OLD[0]!, migration('0123_side_by_side_releases.sql', '-- edited\nSELECT 2;\n'))))
      .toThrow(expect.objectContaining({ code: 'DATABASE_AHEAD_NOT_A_SUPERSET' }));
  });

  it('refuses a manifest whose migration row is not a hashed file, or that is not a manifest at all', () => {
    const linked = { path: 'dialectical-engine/migrations/0124_side_next.sql', realpath: '/elsewhere/0124_side_next.sql' };
    for (const [older, newer] of [[manifest(...OLD), manifest(...OLD, linked)], [manifest(...OLD), manifest(...OLD, { ...migration('0124_x.sql'), sha256: 'nothex' })],
      [null, manifest(...OLD)], [manifest(...OLD), { files: 'no' }], [manifest(...OLD), manifest(...OLD, migration('0124_x.sql'), migration('0124_x.sql'))]] as const) {
      expect(() => addedMigrations(older, newer)).toThrow(expect.objectContaining({ code: 'MIGRATION_MANIFEST_REFUSED' }));
    }
  });
});

describe('n1 header lines (side-by-side spec §5, the escape hatch)', () => {
  it('reads both lines from the leading comment block', () => {
    expect(n1Headers('-- 0124 · next step\n--\n-- n1: expand\n-- n1: keeps-verifier\n\nCREATE TABLE x (id int);\n')).toEqual({ expand: true, keepsVerifier: true });
    expect(Object.isFrozen(n1Headers('SELECT 1;'))).toBe(true);
  });

  it('reads each line on its own', () => {
    expect(n1Headers('-- n1: keeps-verifier\nDROP TABLE x;\n')).toEqual({ expand: false, keepsVerifier: true });
    expect(n1Headers('-- n1: expand\nALTER TABLE x ADD COLUMN y int;\n')).toEqual({ expand: true, keepsVerifier: false });
  });

  it('does not count a line after the first statement', () => {
    expect(n1Headers('-- header\nCREATE TABLE x (id int);\n-- n1: expand\n-- n1: keeps-verifier\n')).toEqual({ expand: false, keepsVerifier: false });
  });

  it('counts only the exact lines', () => {
    for (const line of ['--n1: expand', '-- n1:expand', '-- N1: expand', '-- n1: expand ', '-- n1: expanded', '-- n1: drained']) {
      expect(n1Headers(`${line}\n-- n1: keeps-verifier\nSELECT 1;\n`)).toEqual({ expand: false, keepsVerifier: true });
    }
    // An indented line is not a `--` comment line: it ends the block (as packages/db/src/migration-n1.ts reads it).
    expect(n1Headers(' -- n1: expand\n-- n1: keeps-verifier\nSELECT 1;\n')).toEqual({ expand: false, keepsVerifier: false });
  });

  it('accepts Windows line ends and a file that is all header', () => {
    expect(n1Headers('-- n1: expand\r\n-- n1: keeps-verifier\r\nSELECT 1;\r\n')).toEqual({ expand: true, keepsVerifier: true });
    expect(n1Headers('-- n1: expand\n-- n1: keeps-verifier')).toEqual({ expand: true, keepsVerifier: true });
  });

  it('refuses text that is not text', () => {
    expect(() => n1Headers(Buffer.from('-- n1: expand') as unknown as string)).toThrow(expect.objectContaining({ code: 'MIGRATION_TEXT_REFUSED' }));
  });
});
