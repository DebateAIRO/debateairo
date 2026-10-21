// The database steps between two releases, and what each step says about itself (side-by-side spec §5, the database
// rule). Node built-ins only: this file is installed in the root-owned operator directory, which has no node_modules of
// its own; release-artifacts.mjs (D5, the database-ahead file) and release-check.mjs (D11, the verdict) both import it.
//
// Plain words: a newer release may only ADD database steps to the older release's list, never drop or change one. Each
// added step must say, in its leading comment block, that it only adds (`-- n1: expand`) and that it keeps the old
// verifier in force (`-- n1: keeps-verifier`); a release with a step that does not say both cannot run beside the release
// before it, and takes the drained upload path instead (spec §5, "the escape hatch").
//
// Same reading of "the leading comment block" as packages/db/src/migration-n1.ts (plan A, A6): every line before the
// first one that is neither blank nor a `--` comment. That parser refuses a malformed header; this one only answers
// "are both lines there", and a step without them simply goes the drained way.

/** A migration in a source manifest (repository paths): `dialectical-engine/migrations/<NNNN_name>.sql`, nothing deeper. */
export const MIGRATION_FILE = /^dialectical-engine\/migrations\/(\d{4}_[a-z0-9_]+\.sql)$/;

const HASH = /^[a-f0-9]{64}$/;
const EXPAND = '-- n1: expand';
const KEEPS_VERIFIER = '-- n1: keeps-verifier';

class MigrationStepsRefusal extends Error { constructor(code) { super(code); this.name = 'MigrationStepsRefusal'; this.code = code; } }
const refuse = code => { throw new MigrationStepsRefusal(code); };

/** name -> sha256 of every migration file a source manifest lists; MIGRATION_MANIFEST_REFUSED for anything unexpected. */
function migrationsOf(manifest) {
  if (manifest === null || typeof manifest !== 'object' || !Array.isArray(manifest.files)) refuse('MIGRATION_MANIFEST_REFUSED');
  const found = new Map();
  for (const row of manifest.files) {
    const match = row !== null && typeof row === 'object' && typeof row.path === 'string' ? MIGRATION_FILE.exec(row.path) : null;
    if (match === null) continue;
    // A migration is a hashed file, listed once (a link row has no bytes this release vouches for).
    if (typeof row.sha256 !== 'string' || !HASH.test(row.sha256) || found.has(match[1])) refuse('MIGRATION_MANIFEST_REFUSED');
    found.set(match[1], row.sha256);
  }
  return found;
}

/**
 * The migrations `newerManifest` adds to `olderManifest`, ascending by name (their apply order). The newer list must
 * hold every older migration with the same bytes, else DATABASE_AHEAD_NOT_A_SUPERSET: a release never drops or edits a
 * step a running release relies on (spec §5).
 */
export function addedMigrations(olderManifest, newerManifest) {
  const older = migrationsOf(olderManifest), newer = migrationsOf(newerManifest);
  for (const [name, digest] of older) if (newer.get(name) !== digest) refuse('DATABASE_AHEAD_NOT_A_SUPERSET');
  return Object.freeze([...newer]
    .filter(([name]) => !older.has(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, sha256]) => Object.freeze({ name, sha256 })));
}

/** Which of the two exact header lines the migration's leading comment block holds (spec §5). */
export function n1Headers(sqlText) {
  if (typeof sqlText !== 'string') refuse('MIGRATION_TEXT_REFUSED');
  const lines = sqlText.split('\n').map(line => (line.endsWith('\r') ? line.slice(0, -1) : line));
  const firstStatement = lines.findIndex(line => line.trim() !== '' && !line.startsWith('--'));
  const header = firstStatement < 0 ? lines : lines.slice(0, firstStatement);
  return Object.freeze({ expand: header.includes(EXPAND), keepsVerifier: header.includes(KEEPS_VERIFIER) });
}
