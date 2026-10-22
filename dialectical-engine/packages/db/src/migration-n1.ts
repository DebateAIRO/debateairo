/**
 * A migration's n1 header (side-by-side spec 2026-10-21 §5, "The N-1 rule"; plan A, task A6): the ONE parser of the
 * declarations a migration makes about itself. The forward chain reads it for every step (A6), the "database ahead"
 * start mode reads it for the steps a newer release added (A7), and the N-1 audit reads it for every file (A8).
 *
 * The leading comment block (every line before the first one that is neither blank nor a `--` comment) holds exact
 * lines:
 * - `-- n1: expand`: additive only, safe while the release before keeps running on it;
 * - `-- n1: drained`: uploaded the old way, with no debate waiting or running (0123, the transition release T);
 * - `-- n1: keeps-verifier`: the effective-capability verifier in force stays in force (the manifest names it again);
 * - `-- n1: outside-transaction`: an expand step whose whole body is ONE `CREATE INDEX CONCURRENTLY IF NOT EXISTS
 *   <name> ON <schema>.<table> …`, which cannot run inside a transaction; migrate() runs it on its own first
 *   (migration-forward-chain.ts runOutsideTransactionStep).
 * After 0122 exactly one of expand/drained is required, and a declaration placed after the first statement, doubled or
 * misspelled is refused, so a header can never be silently ignored. One line is not a declaration: `-- n1: reviewed
 * <reason>` (N1_REVIEWED_LINE), placed directly above a statement the N-1 audit (tools/orphan-audit migration-n1.ts)
 * admits only once reviewed; it may stand anywhere, and without a reason it is refused like any misspelled declaration.
 * 0122 and earlier predate the rule: they declare nothing and read all false (0117-0122 state their verifier in their
 * loaders, migration-forward0122.ts:9-10).
 *
 * Self-contained, like every module loadMigrationPlan loads (node built-ins and ./migration-*.js only: the plan is
 * loaded by standalone probes and by the preview's superuser JIT creator), so a refusal is a plain Error whose message
 * starts with its typed code and which carries that code as `.code` (controller ruling A6, option B).
 */
export const N1_GRANDFATHERED_THROUGH = "0122_engine_map_check.sql";

export type N1Declaration = Readonly<{
  expand: boolean;
  drained: boolean;
  keepsVerifier: boolean;
  outsideTransaction: boolean;
  /**
   * The index an outside-transaction step builds, its table and that table's schema (the index lives there too), or
   * null for any other step. The step is recorded only over a valid index of that name ON that table.
   */
  concurrentIndex: Readonly<{ schema: string; table: string; name: string }> | null;
}>;

/** A migration refusal of the loader family: the message starts with the code, and `.code` carries it. */
export type MigrationRefusal = Error & Readonly<{ code: string }>;
export function migrationRefusal(code: string, detail?: string): MigrationRefusal {
  const refusal = new Error(detail === undefined ? code : `${code} ${detail}`);
  Object.defineProperty(refusal, "code", { value: code, enumerable: true, writable: false, configurable: false });
  return refusal as MigrationRefusal;
}

type DeclarationKey = "expand" | "drained" | "keepsVerifier" | "outsideTransaction";
const DECLARATIONS: ReadonlyMap<string, DeclarationKey> = new Map([
  ["-- n1: expand", "expand"], ["-- n1: drained", "drained"],
  ["-- n1: keeps-verifier", "keepsVerifier"], ["-- n1: outside-transaction", "outsideTransaction"]
]);
/** Any line that looks like a declaration, exact or not (a misspelled or misplaced one is refused, never skipped). */
const DECLARATION_LIKE = /^--\s*n1\s*:/u;
/** A reviewed exception of the N-1 audit (side-by-side §5, plan A task A8), with its reason; read trimmed. */
export const N1_REVIEWED_LINE = /^-- n1: reviewed \S/u;
const declarationLike = (line: string): boolean => DECLARATION_LIKE.test(line) && !N1_REVIEWED_LINE.test(line);
/** The one statement an outside-transaction body may hold: plain lowercase names, no `;` before its own end. */
const CONCURRENT_INDEX = /^CREATE INDEX CONCURRENTLY IF NOT EXISTS ([a-z_][a-z0-9_]*) ON ([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)[\s(][^;]*;$/u;
const GRANDFATHERED: N1Declaration = Object.freeze({
  expand: false, drained: false, keepsVerifier: false, outsideTransaction: false, concurrentIndex: null
});

/** The n1 declarations of the migration `name` with source `sql`; refuses MIGRATION_N1_HEADER_INVALID. */
export function parseN1Header(name: string, sql: string): N1Declaration {
  if (name <= N1_GRANDFATHERED_THROUGH) return GRANDFATHERED;
  const refuse = (detail: string): never => { throw migrationRefusal("MIGRATION_N1_HEADER_INVALID", `${name} ${detail}`); };
  const lines = sql.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  const firstStatement = lines.findIndex((line) => line.trim() !== "" && !line.startsWith("--"));
  const header = firstStatement < 0 ? lines : lines.slice(0, firstStatement);
  const found = new Set<DeclarationKey>();
  for (const line of header) {
    if (!declarationLike(line)) continue;
    const key = DECLARATIONS.get(line);
    if (key === undefined) return refuse("UNKNOWN_DECLARATION");
    if (found.has(key)) return refuse("DUPLICATE_DECLARATION");
    found.add(key);
  }
  if (firstStatement >= 0 && lines.slice(firstStatement).some((line) => declarationLike(line.trim()))) {
    return refuse("DECLARATION_AFTER_FIRST_STATEMENT");
  }
  const expand = found.has("expand");
  if (expand === found.has("drained")) return refuse("EXPAND_OR_DRAINED");
  const outsideTransaction = found.has("outsideTransaction");
  let concurrentIndex: N1Declaration["concurrentIndex"] = null;
  if (outsideTransaction) {
    if (!expand) return refuse("OUTSIDE_TRANSACTION_NOT_EXPAND");
    const body = lines.filter((line) => !line.trim().startsWith("--")).join("\n").trim();
    const statement = CONCURRENT_INDEX.exec(body);
    if (statement === null) return refuse("OUTSIDE_TRANSACTION_BODY");
    concurrentIndex = Object.freeze({ schema: statement[2]!, table: statement[3]!, name: statement[1]! });
  }
  return Object.freeze({ expand, drained: !expand, keepsVerifier: found.has("keepsVerifier"), outsideTransaction, concurrentIndex });
}
