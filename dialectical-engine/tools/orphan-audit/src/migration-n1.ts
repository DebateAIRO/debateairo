import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { N1_GRANDFATHERED_THROUGH, N1_REVIEWED_LINE, parseN1Header } from "../../../packages/db/src/migration-n1.js";
import { lexSql, lineAt } from "./sql-text.js";

/**
 * The N-1 audit (side-by-side spec 2026-10-21 §5, "The N-1 rule"; plan A, task A8). During a side-by-side upload the
 * newer release migrates the shared database while the release before keeps running on it, so every step after
 * 0122_engine_map_check.sql declares its n1 header (parseN1Header, packages/db/src/migration-n1.ts, the ONE parser the
 * migrator, the database-ahead check and this audit share), and an `expand` step may only add: nothing the older code
 * reads is dropped, renamed, retyped, made NOT NULL, revoked or replaced, nothing newly restricts a table it uses
 * without review, and nothing takes a strong lock on one (a lock queue there stalls its pages). auditSourceRules runs
 * it on every migrations/*.sql, and CI runs auditSourceRules (security.yml, job verify: `pnpm run test:ci-gate`).
 *
 * Findings read `${name}:${line} ${CODE} ${detail}`. The SQL is read through ONE lexer pass (sql-text.ts lexSql), with
 * comments, literals and dollar-quoted bodies blanked. A function body runs when called, not when the step applies, so
 * it is not read; a `DO` body runs when the step applies, so its statements are read like the file's own. A relation is
 * "existing" unless this file creates it with CREATE TABLE / CREATE VIEW and no earlier file did. A
 * `-- n1: reviewed <reason>` line (N1_REVIEWED_LINE) directly above a statement admits four things, and only these:
 * - `DROP TRIGGER IF EXISTS t ON x` followed by `CREATE TRIGGER t … ON x` (on a new table the pair needs no line);
 * - `ALTER TABLE x DROP CONSTRAINT IF EXISTS c` followed by `ALTER TABLE x ADD CONSTRAINT c … NOT VALID` (likewise);
 * - any other `ADD CONSTRAINT … NOT VALID` on an existing table (a new restriction the older code's writes meet);
 * - a `DO` block that runs `EXECUTE` (SQL the audit cannot read).
 */

/**
 * Every migrations/*.sql that sorts at or before N1_GRANDFATHERED_THROUGH, counted at 47293e3ca (0000-0122). They
 * predate the rule and are not audited; a file slipped in before the cut-off would escape it, so the count is pinned.
 */
export const N1_GRANDFATHERED_COUNT = 142;

/** What the audit of one file knows beyond its text. */
export type N1AuditContext = Readonly<{
  /** Every function the files sorted before this one define (definedFunctionNames): the older release may call them. */
  earlierFunctions: ReadonlySet<string>;
  /** Every table and view the files sorted before this one create (definedRelationNames): the older code uses them. */
  earlierRelations: ReadonlySet<string>;
  /** Whether the file's lineage manifest names the step before's verifier; null when no manifest names the file. */
  keepsVerifier: boolean | null;
}>;

const NAME_PART = String.raw`[A-Za-z_][A-Za-z0-9_$]*`;
const NAME = String.raw`(${NAME_PART}(?:\.${NAME_PART})?)`;
const normal = (name: string): string => name.toLowerCase();
const named = (pattern: string, code: string): string[] =>
  [...code.matchAll(new RegExp(pattern, "giu"))].map((match) => normal(match[1]!));

/** Lower-case `schema.name` (as written) of each CREATE [OR REPLACE] FUNCTION outside comments, literals, bodies. */
export function definedFunctionNames(source: string): readonly string[] {
  return Object.freeze([...new Set(named(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+${NAME}\s*\(`, lexSql(source).code))]);
}

const TABLE_CREATED = String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`;
const VIEW_CREATED = String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+|RECURSIVE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`;

/** The lower-case `schema.name` (as written) of every table and view a migration creates. */
export function definedRelationNames(source: string): readonly string[] {
  const code = lexSql(source).code;
  return Object.freeze([...new Set([...named(TABLE_CREATED, code), ...named(VIEW_CREATED, code)])]);
}

/** A statement: its trimmed text, the offset of its first character and of its closing `;` (or the end). */
type Statement = Readonly<{ text: string; start: number; end: number }>;

/** The statements of lexed SQL from `offset`, split on `;`, each with the offset of its first non-blank character. */
function statementsOf(code: string, offset = 0): Statement[] {
  const statements: Statement[] = [];
  let from = 0;
  for (let index = 0; index <= code.length; index += 1) {
    if (index < code.length && code[index] !== ";") continue;
    const raw = code.slice(from, index);
    const lead = raw.length - raw.trimStart().length;
    if (raw.trim() !== "") statements.push(Object.freeze({ text: raw.trim(), start: offset + from + lead, end: offset + index }));
    from = index + 1;
  }
  return statements;
}

/**
 * The statements of a `DO` body: each PL/pgSQL statement, and the rest of it after every control word (BEGIN, THEN,
 * ELSE, LOOP), so `BEGIN IF … THEN ALTER TABLE …` is also read from its `ALTER`. A finding seen twice at one offset
 * is reported once.
 */
function doBodyStatements(source: string, bodyStart: number, bodyEnd: number): Statement[] {
  const statements: Statement[] = [];
  for (const statement of statementsOf(lexSql(source.slice(bodyStart, bodyEnd)).code, bodyStart)) {
    statements.push(statement);
    for (const control of statement.text.matchAll(/\b(?:BEGIN|THEN|ELSE|LOOP)\b/giu)) {
      const rest = statement.text.slice(control.index + control[0].length);
      const lead = rest.length - rest.trimStart().length;
      if (rest.trim() !== "") statements.push(Object.freeze({ text: rest.trim(), start: statement.start + control.index + control[0].length + lead, end: statement.end }));
    }
  }
  return statements;
}

/** Top-level comma-separated parts of a text (parentheses nest), each with its offset in that text. */
function topLevelParts(text: string): readonly Readonly<{ text: string; offset: number }>[] {
  const parts: { text: string; offset: number }[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index <= text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (index < text.length && (char !== "," || depth !== 0)) continue;
    const raw = text.slice(from, index);
    parts.push({ text: raw.trim(), offset: from + raw.length - raw.trimStart().length });
    from = index + 1;
  }
  return parts;
}

/** Whether the line directly above source line `line` (1-based) is a reviewed line with its reason. */
function reviewedAbove(lines: readonly string[], line: number): boolean {
  return line >= 2 && N1_REVIEWED_LINE.test(lines[line - 2]!.trim());
}

/**
 * A constant column default, which PostgreSQL stores without rewriting the table: a literal (blanked by the lexer, so
 * empty here), a number, TRUE/FALSE/NULL, an empty ARRAY[], now() / CURRENT_TIMESTAMP / CURRENT_DATE / LOCALTIMESTAMP,
 * each optionally in parentheses and cast (`'{}'::jsonb`, `0::bigint`).
 */
const CONSTANT_DEFAULT = new RegExp(String.raw`^\(?\s*(?:[-+]?\d+(?:\.\d+)?|TRUE|FALSE|NULL|ARRAY\s*\[\s*\]|now\s*\(\s*\)|CURRENT_TIMESTAMP|CURRENT_DATE|LOCALTIMESTAMP)?\s*\)?(?:\s*::\s*${NAME_PART}(?:\.${NAME_PART})?(?:\s*\([\d,\s]*\))?(?:\s*\[\s*\])*)*\s*$`, "iu");
/** Where a column default ends: the next column constraint word. */
const DEFAULT_END = /\b(?:NOT\s+NULL|NULL|CHECK|REFERENCES|UNIQUE|PRIMARY|CONSTRAINT|GENERATED|COLLATE)\b/iu;

const DROP_TRIGGER_PAIR = new RegExp(String.raw`^DROP\s+TRIGGER\s+IF\s+EXISTS\s+${NAME}\s+ON\s+${NAME}$`, "iu");
const DROP_CONSTRAINT_PAIR = new RegExp(String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${NAME}\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+${NAME}$`, "iu");
const ALTER_TABLE = new RegExp(String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${NAME}\s+`, "iu");
const ADD_CONSTRAINT = new RegExp(String.raw`^ADD\s+CONSTRAINT\s+${NAME}\s`, "iu");
const CREATE_TRIGGER = new RegExp(String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+${NAME}\b[\s\S]*?\bON\s+${NAME}`, "iu");
const CREATE_INDEX = new RegExp(String.raw`^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:${NAME_PART}\s+)?ON\s+(?:ONLY\s+)?${NAME}`, "iu");
const CREATE_POLICY_OR_RULE = new RegExp(String.raw`^(?:CREATE|ALTER)\s+(POLICY|(?:OR\s+REPLACE\s+)?RULE)\s+${NAME_PART}\b[\s\S]*?\b(?:ON|TO)\s+${NAME}`, "iu");
const REVOKE_KIND = String.raw`(?:(?:TABLE|SEQUENCE|FUNCTION|PROCEDURE|ROUTINE|SCHEMA|TYPE|DOMAIN)\s+)?`;
const REVOKE_ALL_IN_SCHEMA = /^ALL\s+(?:TABLES|SEQUENCES|FUNCTIONS|PROCEDURES|ROUTINES)\s+IN\s+SCHEMA\s+/iu;
const STRONG_UNIQUE = /\b(?:UNIQUE|PRIMARY\s+KEY|EXCLUDE)\b/iu;
const NOT_VALID_END = /\bNOT\s+VALID\s*$/iu;

/**
 * The N-1 findings of the migration `name` (`migrations/<file>.sql`) with source `source`: none for a file at or before
 * N1_GRANDFATHERED_THROUGH; for a later one its header (N1_HEADER_INVALID, N1_KEEPS_VERIFIER_MISMATCH), then, for an
 * `expand` step, every shape the release before cannot run beside, in line order.
 */
export function auditMigrationN1Compatibility(name: string, source: string, context: N1AuditContext): readonly string[] {
  const file = name.slice(name.lastIndexOf("/") + 1);
  if (file <= N1_GRANDFATHERED_THROUGH) return Object.freeze([]);
  const findings: { index: number; text: string }[] = [];
  const report = (index: number, code: string, detail: string): void => {
    findings.push({ index, text: `${name}:${lineAt(source, index)} ${code} ${detail}` });
  };
  let declaration: ReturnType<typeof parseN1Header>;
  try {
    declaration = parseN1Header(file, source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Object.freeze([`${name}:1 N1_HEADER_INVALID ${message.slice(message.lastIndexOf(" ") + 1)}`]);
  }
  if (declaration.keepsVerifier !== context.keepsVerifier) {
    report(0, "N1_KEEPS_VERIFIER_MISMATCH", `the header says ${declaration.keepsVerifier}, ${context.keepsVerifier === null
      ? "no lineage manifest names the file" : `the lineage manifest says ${context.keepsVerifier}`}`);
  }
  if (declaration.drained) return Object.freeze(findings.map((finding) => finding.text));

  const { code, dollarBodies } = lexSql(source);
  const lines = source.split("\n");
  const createdRelations = new Set([...named(TABLE_CREATED, code), ...named(VIEW_CREATED, code)]);
  const createdObjects = new Set([
    ...createdRelations,
    ...named(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+${NAME}\s*\(`, code),
    ...named(String.raw`\bCREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`, code),
    ...named(String.raw`\bCREATE\s+TYPE\s+${NAME}`, code),
    ...named(String.raw`\bCREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`, code)
  ]);
  /** An unreadable name counts as existing: a check that cannot tell flags. */
  const existing = (relation: string | undefined): boolean => relation === undefined
    || context.earlierRelations.has(normal(relation)) || !createdRelations.has(normal(relation));
  const existingObject = (object: string | undefined): boolean => object === undefined || context.earlierRelations.has(normal(object))
    || context.earlierFunctions.has(normal(object)) || !createdObjects.has(normal(object));
  const reviewed = (index: number): boolean => reviewedAbove(lines, lineAt(source, index));

  const topLevel = statementsOf(code);
  const statements: Statement[] = [];
  for (const statement of topLevel) {
    statements.push(statement);
    if (!/^DO\b/iu.test(statement.text)) continue;
    const body = dollarBodies.find((candidate) => candidate.start >= statement.start && candidate.start < statement.end);
    if (body === undefined) continue;
    statements.push(...doBodyStatements(source, body.bodyStart, body.bodyEnd));
    if (/\bEXECUTE\b/iu.test(lexSql(source.slice(body.bodyStart, body.bodyEnd)).code) && !reviewed(statement.start)) {
      report(statement.start, "N1_DYNAMIC_SQL", "a DO block runs SQL the audit cannot read; a reviewed line above it says why it is expand");
    }
  }

  // The guard pairs: a DROP passes when its partner follows (on a new table) or is reviewed too (on an existing one).
  // Both are keyed by the offset of their keyword, so a DO body's statement read twice is the same statement.
  const passedDrops = new Set<number>();
  const pairedAdds = new Set<number>();
  const pairedTriggers = new Set<string>();
  statements.forEach((statement, position) => {
    const trigger = DROP_TRIGGER_PAIR.exec(statement.text);
    const constraint = DROP_CONSTRAINT_PAIR.exec(statement.text);
    const table = trigger?.[2] ?? constraint?.[1];
    if (table === undefined) return;
    if (existing(table) && !reviewed(statement.start)) return;
    for (const next of statements.slice(position + 1)) {
      if (next.start <= statement.start) continue;
      if (trigger !== null) {
        const recreated = CREATE_TRIGGER.exec(next.text);
        if (recreated === null || normal(recreated[1]!) !== normal(trigger[1]!) || normal(recreated[2]!) !== normal(table)) continue;
        pairedTriggers.add(`${normal(trigger[1]!)}|${normal(table)}`);
      } else {
        const altered = ALTER_TABLE.exec(next.text);
        if (altered === null || normal(altered[1]!) !== normal(table)) continue;
        const add = topLevelParts(next.text.slice(altered[0].length)).find((part) => {
          const added = ADD_CONSTRAINT.exec(part.text);
          return added !== null && normal(added[1]!) === normal(constraint![2]!) && (!existing(table) || NOT_VALID_END.test(part.text));
        });
        if (add === undefined) continue;
        pairedAdds.add(next.start + altered[0].length + add.offset);
      }
      passedDrops.add(statement.start + statement.text.search(/\bDROP\b/iu));
      return;
    }
  });

  const addedConstraints = new Set<string>();
  for (const statement of statements) {
    const at = statement.start;
    const text = statement.text;
    for (const drop of text.matchAll(/\bDROP\b/giu)) {
      if (!passedDrops.has(at + drop.index)) report(at + drop.index, "N1_FORBIDDEN_DROP", "an expand step drops nothing the release before may use");
    }
    for (const rename of text.matchAll(/\bRENAME\b/giu)) {
      report(at + rename.index, "N1_FORBIDDEN_RENAME", "an expand step renames nothing the release before may use");
    }
    for (const retype of text.matchAll(new RegExp(String.raw`\bALTER\s+(?:COLUMN\s+)?${NAME_PART}\s+(?:SET\s+DATA\s+)?TYPE\b`, "giu"))) {
      report(at + retype.index, "N1_FORBIDDEN_COLUMN_TYPE", "an expand step changes no column type");
    }
    for (const notNull of text.matchAll(/\bSET\s+NOT\s+NULL\b/giu)) {
      report(at + notNull.index, "N1_FORBIDDEN_SET_NOT_NULL", "the release before may still write NULL");
    }
    for (const security of text.matchAll(/\b(?:ENABLE|DISABLE|FORCE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/giu)) {
      const table = ALTER_TABLE.exec(text)?.[1];
      if (existing(table)) report(at + security.index, "N1_FORBIDDEN_ROW_SECURITY", `${table ?? "a table"} changes the rows the release before may read or write`);
    }
    const altered = ALTER_TABLE.exec(text);
    if (altered !== null) {
      const table = altered[1]!;
      for (const part of topLevelParts(text.slice(altered[0].length))) {
        const index = at + altered[0].length + part.offset;
        const constraint = ADD_CONSTRAINT.exec(part.text);
        const validate = new RegExp(String.raw`^VALIDATE\s+CONSTRAINT\s+${NAME}$`, "iu").exec(part.text);
        const unnamed = /^ADD\s+(?:UNIQUE|PRIMARY\s+KEY|EXCLUDE|CHECK|FOREIGN\s+KEY)\b/iu.test(part.text);
        if (constraint !== null || unnamed) {
          if (constraint !== null) addedConstraints.add(`${normal(table)}|${normal(constraint[1]!)}`);
          if (!existing(table)) continue;
          if (!NOT_VALID_END.test(part.text) || STRONG_UNIQUE.test(part.text)) {
            report(index, "N1_STRONG_LOCK_CONSTRAINT", `${table} gains a constraint that is checked or indexed under its strongest lock`);
          } else if (!pairedAdds.has(index) && !reviewed(at)) {
            report(index, "N1_UNREVIEWED_RESTRICTION", `${table} gains a constraint the release before's writes meet; a reviewed line above it says why they pass`);
          }
        } else if (validate !== null) {
          if (addedConstraints.has(`${normal(table)}|${normal(validate[1]!)}`)) {
            report(index, "N1_STRONG_LOCK_VALIDATE", `${validate[1]} is validated by the step that adds it; a later step validates it`);
          }
        } else if (/^ADD\b/iu.test(part.text)) {
          if (/\bNOT\s+NULL\b/iu.test(part.text) && !/\bDEFAULT\b/iu.test(part.text)) {
            report(index, "N1_FORBIDDEN_NOT_NULL_WITHOUT_DEFAULT", "the release before inserts rows without the new column");
          }
          if (!existing(table)) continue;
          if (STRONG_UNIQUE.test(part.text)) {
            report(index, "N1_STRONG_LOCK_CONSTRAINT", `${table} gains a column indexed under its strongest lock`);
          }
          const defaulted = /\bDEFAULT\b([\s\S]*)$/iu.exec(part.text);
          const expression = defaulted === null ? "" : defaulted[1]!.split(DEFAULT_END)[0]!;
          if (/\b(?:SMALL|BIG)?SERIAL\b|\bSERIAL[248]\b|\bGENERATED\b/iu.test(part.text) || !CONSTANT_DEFAULT.test(expression)) {
            report(index, "N1_STRONG_LOCK_REWRITE", `${table} is rewritten to fill the new column (a non-constant default or a generated value)`);
          }
        } else if (/^SET\s+(?:LOGGED|UNLOGGED|TABLESPACE)\b/iu.test(part.text) && existing(table)) {
          report(index, "N1_STRONG_LOCK_REWRITE", `${table} is rewritten under its strongest lock`);
        } else if (/^(?:ENABLE|DISABLE)\s+(?:REPLICA\s+|ALWAYS\s+)?TRIGGER\b/iu.test(part.text) && existing(table)) {
          report(index, "N1_FORBIDDEN_TRIGGER", `${table} changes which triggers the release before's writes meet`);
        }
      }
    }
    if (/^REVOKE\b/iu.test(text)) {
      const target = /\bON\s+([\s\S]+?)\s+FROM\b/iu.exec(text);
      const objects = target === null ? [] : (() => {
        const list = target[1]!.replace(new RegExp(`^${REVOKE_KIND}`, "iu"), "");
        const inSchema = REVOKE_ALL_IN_SCHEMA.exec(list);
        return topLevelParts(inSchema === null ? list : list.slice(inSchema[0].length))
          .map((part) => new RegExp(`^${NAME}`, "u").exec(part.text)?.[1]);
      })();
      if (objects.length === 0 || objects.some(existingObject)) {
        report(at, "N1_FORBIDDEN_REVOKE", "the release before may still use what is revoked");
      }
    }
    const replacedFunction = new RegExp(String.raw`^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+${NAME}\s*\(`, "iu").exec(text);
    if (replacedFunction !== null && context.earlierFunctions.has(normal(replacedFunction[1]!))) {
      report(at, "N1_FORBIDDEN_REPLACE", `${replacedFunction[1]} is defined by an earlier step; a new function supersedes it`);
    }
    const replacedView = new RegExp(String.raw`^CREATE\s+OR\s+REPLACE\s+(?:RECURSIVE\s+)?VIEW\s+${NAME}`, "iu").exec(text);
    if (replacedView !== null && context.earlierRelations.has(normal(replacedView[1]!))) {
      report(at, "N1_FORBIDDEN_REPLACE", `${replacedView[1]} is created by an earlier step; a new view supersedes it`);
    }
    const trigger = CREATE_TRIGGER.exec(text);
    if (trigger !== null && existing(trigger[2]) && !pairedTriggers.has(`${normal(trigger[1]!)}|${normal(trigger[2]!)}`)) {
      report(at, "N1_FORBIDDEN_TRIGGER", `${trigger[2]} gains a trigger the release before's writes would meet`);
    }
    const policyOrRule = CREATE_POLICY_OR_RULE.exec(text);
    if (policyOrRule !== null && existing(policyOrRule[2])) {
      const rule = /RULE$/iu.test(policyOrRule[1]!);
      report(at, rule ? "N1_FORBIDDEN_RULE" : "N1_FORBIDDEN_ROW_SECURITY", `${policyOrRule[2]} gains a ${rule ? "rule" : "policy"} the release before's queries meet`);
    }
    const index = CREATE_INDEX.exec(text);
    if (index !== null && index[1] === undefined && existing(index[2])) {
      report(at, "N1_STRONG_LOCK_INDEX", `${index[2]} is indexed without CONCURRENTLY, which blocks its writes`);
    }
    const backfill = new RegExp(String.raw`\bUPDATE\s+(?:ONLY\s+)?${NAME}(?:\s+(?:AS\s+)?${NAME_PART})?\s+SET\b`, "iu").exec(text)
      ?? new RegExp(String.raw`\bDELETE\s+FROM\s+(?:ONLY\s+)?${NAME}`, "iu").exec(text)
      ?? new RegExp(String.raw`\bINSERT\s+INTO\s+${NAME}\b[\s\S]*\bSELECT\b`, "iu").exec(text);
    if (backfill !== null && existing(backfill[1])) {
      report(at + backfill.index, "N1_STRONG_LOCK_BACKFILL", `${backfill[1]} is rewritten row by row inside the step's transaction`);
    }
    if (/^TRUNCATE\b/iu.test(text)) report(at, "N1_STRONG_LOCK_TRUNCATE", "an expand step empties no table");
    if (/^REFRESH\s+MATERIALIZED\s+VIEW\b/iu.test(text) && !/^REFRESH\s+MATERIALIZED\s+VIEW\s+CONCURRENTLY\b/iu.test(text)) {
      report(at, "N1_STRONG_LOCK_REFRESH", "a materialized view is refreshed without CONCURRENTLY, which blocks its reads");
    }
    if (/^(?:LOCK|CLUSTER)\b/iu.test(text) || /^VACUUM\b[\s\S]*\bFULL\b/iu.test(text) || (/^REINDEX\b/iu.test(text) && !/\bCONCURRENTLY\b/iu.test(text))) {
      report(at, "N1_STRONG_LOCK_LOCK_TABLE", "an expand step takes no table lock of its own");
    }
  }
  // A DO body's statement is read whole and from each control word, so one finding can be seen twice: keep the first.
  const unique = [...new Map(findings.map((finding) => [finding.text, finding] as const)).values()];
  return Object.freeze(unique.sort((left, right) => left.index - right.index).map((finding) => finding.text));
}

/** N1_GRANDFATHER_DRIFT when the files at or before N1_GRANDFATHERED_THROUGH differ from N1_GRANDFATHERED_COUNT. */
export function auditN1GrandfatheredCount(names: readonly string[]): readonly string[] {
  const count = names.filter((name) => name.endsWith(".sql") && name <= N1_GRANDFATHERED_THROUGH).length;
  return Object.freeze(count === N1_GRANDFATHERED_COUNT ? [] : [
    `migrations:1 N1_GRANDFATHER_DRIFT ${count} files sort at or before ${N1_GRANDFATHERED_THROUGH}, pinned ${N1_GRANDFATHERED_COUNT}`
  ]);
}

/**
 * For each migration a lineage manifest names (`migration.name`), whether it keeps the verifier in force: its own
 * `verifier.sha256` is the `previous.verifierSha256` of the step before, as the forward chain checks it
 * (packages/db/src/migration-forward-chain.ts). Manifests without both digests (dev's sealed ones) name nothing.
 */
export async function readLineageKeepsVerifier(lineageDirectory: string): Promise<ReadonlyMap<string, boolean>> {
  const keeps = new Map<string, boolean>();
  for (const entry of (await readdir(lineageDirectory)).filter((file) => file.endsWith(".json")).sort()) {
    const manifest = JSON.parse(await readFile(join(lineageDirectory, entry), "utf8")) as {
      migration?: { name?: unknown }; previous?: { verifierSha256?: unknown }; verifier?: { sha256?: unknown };
    };
    const name = manifest.migration?.name;
    const previous = manifest.previous?.verifierSha256;
    const own = manifest.verifier?.sha256;
    if (typeof name === "string" && typeof previous === "string" && typeof own === "string") keeps.set(name, own === previous);
  }
  return keeps;
}
