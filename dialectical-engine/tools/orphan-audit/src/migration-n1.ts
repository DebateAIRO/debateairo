import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { N1_GRANDFATHERED_THROUGH, N1_REVIEWED_LINE, parseN1Header } from "../../../packages/db/src/migration-n1.js";
import { lineAt, maskSqlComments, maskSqlQuotedLiterals, sqlDoBlocks } from "./sql-text.js";

/**
 * The N-1 audit (side-by-side spec 2026-10-21 §5, "The N-1 rule"; plan A, task A8). During a side-by-side upload the
 * newer release migrates the shared database while the release before keeps running on it, so every step after
 * 0122_engine_map_check.sql declares its n1 header (parseN1Header, packages/db/src/migration-n1.ts, the ONE parser the
 * migrator, the database-ahead check and this audit share), and an `expand` step may only add: nothing the older code
 * reads is dropped, renamed, retyped, made NOT NULL, revoked or replaced, and nothing takes a strong lock on a table it
 * uses (a lock queue there stalls its pages). auditSourceRules runs it on every migrations/*.sql, so CI blocks a finding.
 *
 * Findings read `${name}:${line} ${CODE} ${detail}`. The SQL is read with comments, quoted literals and every
 * dollar-quoted body masked (a function body runs when called, not when the step applies); an "existing" relation is
 * one this file does not create with CREATE TABLE / CREATE VIEW. Two guard pairs pass once reviewed, with a
 * `-- n1: reviewed <reason>` line directly above the DROP (N1_REVIEWED_LINE): `DROP TRIGGER IF EXISTS t ON x` with a
 * later `CREATE TRIGGER t … ON x`, and `ALTER TABLE x DROP CONSTRAINT IF EXISTS c` with a later
 * `ALTER TABLE x ADD CONSTRAINT c … NOT VALID`; on a table the file creates, a pair needs no line. A `DO` block that
 * runs `EXECUTE` passes only with a reviewed line directly above it.
 */

/**
 * Every migrations/*.sql that sorts at or before N1_GRANDFATHERED_THROUGH, counted at 47293e3ca (0000-0122). They predate
 * the rule and are not audited; a file slipped in before the cut-off would escape it, so the count is pinned.
 */
export const N1_GRANDFATHERED_COUNT = 142;

/** What the audit of one file knows beyond its text. */
export type N1AuditContext = Readonly<{
  /** Every function the files sorted before this one define (definedFunctionNames): the older release may call them. */
  earlierFunctions: ReadonlySet<string>;
  /** Whether the file's lineage manifest names the verifier of the step before; null when no manifest names the file. */
  keepsVerifier: boolean | null;
}>;

const NAME_PART = String.raw`[A-Za-z_][A-Za-z0-9_$]*`;
const NAME = String.raw`(${NAME_PART}(?:\.${NAME_PART})?)`;
const normal = (name: string): string => name.toLowerCase();

/**
 * The SQL as the audit reads it: comments, quoted literals and every dollar-quoted body blanked, offsets kept; a
 * double-quoted identifier reads as a plain name (`identity."user"` as `identity._user_`), the same in every file.
 */
function maskedSql(source: string): string {
  return maskSqlQuotedLiterals(maskSqlComments(source), "name");
}

/** The lower-case `schema.name` (as written) of every CREATE [OR REPLACE] FUNCTION outside comments, literals and bodies. */
export function definedFunctionNames(source: string): readonly string[] {
  const names = new Set<string>();
  for (const match of maskedSql(source).matchAll(new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+${NAME}\s*\(`, "giu"))) {
    names.add(normal(match[1]!));
  }
  return Object.freeze([...names]);
}

type Statement = Readonly<{ text: string; start: number }>;

/** The statements of masked SQL, split on `;`, each with the offset of its first non-blank character. */
function statementsOf(code: string): readonly Statement[] {
  const statements: Statement[] = [];
  let from = 0;
  for (let index = 0; index <= code.length; index += 1) {
    if (index < code.length && code[index] !== ";") continue;
    const raw = code.slice(from, index);
    const lead = raw.length - raw.trimStart().length;
    if (raw.trim() !== "") statements.push(Object.freeze({ text: raw.trim(), start: from + lead }));
    from = index + 1;
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

/** The names a file creates, by kind: what it creates is new, so the release before cannot be reading it. */
function createdHere(code: string): Readonly<{ relations: ReadonlySet<string>; plainRelations: ReadonlySet<string>; objects: ReadonlySet<string> }> {
  const collect = (pattern: string): string[] => [...code.matchAll(new RegExp(pattern, "giu"))].map((match) => normal(match[1]!));
  const tables = collect(String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`);
  const plainViews = collect(String.raw`\bCREATE\s+(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`);
  const replacedViews = collect(String.raw`\bCREATE\s+OR\s+REPLACE\s+(?:RECURSIVE\s+)?VIEW\s+${NAME}`);
  const others = [
    ...collect(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+${NAME}\s*\(`),
    ...collect(String.raw`\bCREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`),
    ...collect(String.raw`\bCREATE\s+TYPE\s+${NAME}`),
    ...collect(String.raw`\bCREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`)
  ];
  const relations = new Set([...tables, ...plainViews, ...replacedViews]);
  return Object.freeze({ relations, plainRelations: new Set([...tables, ...plainViews]), objects: new Set([...relations, ...others]) });
}

/** Whether the line directly above source line `line` (1-based) is a reviewed line with its reason. */
function reviewedAbove(lines: readonly string[], line: number): boolean {
  return line >= 2 && N1_REVIEWED_LINE.test(lines[line - 2]!.trim());
}

const DROP_TRIGGER_PAIR = new RegExp(String.raw`^DROP\s+TRIGGER\s+IF\s+EXISTS\s+${NAME}\s+ON\s+${NAME}$`, "iu");
const DROP_CONSTRAINT_PAIR = new RegExp(String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${NAME}\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+${NAME}$`, "iu");
const ALTER_TABLE = new RegExp(String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${NAME}\s+`, "iu");
const CREATE_TRIGGER = new RegExp(String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+${NAME}\b[\s\S]*?\bON\s+${NAME}`, "iu");
const CREATE_INDEX = new RegExp(String.raw`^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:${NAME_PART}\s+)?ON\s+(?:ONLY\s+)?${NAME}`, "iu");
const REVOKE_KIND = String.raw`(?:(?:TABLE|SEQUENCE|FUNCTION|PROCEDURE|ROUTINE|SCHEMA|TYPE|DOMAIN)\s+)?`;
const REVOKE_ALL_IN_SCHEMA = /^ALL\s+(?:TABLES|SEQUENCES|FUNCTIONS|PROCEDURES|ROUTINES)\s+IN\s+SCHEMA\s+/iu;

/**
 * The N-1 findings of the migration `name` (`migrations/<file>.sql`) with source `source`: none for a file at or before
 * N1_GRANDFATHERED_THROUGH; for a later one its header (N1_HEADER_INVALID, N1_KEEPS_VERIFIER_MISMATCH), then, for an
 * `expand` step, every shape the release before cannot run beside (the codes in the module comment's order).
 */
export function auditMigrationN1Compatibility(name: string, source: string, context: N1AuditContext): readonly string[] {
  const file = name.slice(name.lastIndexOf("/") + 1);
  if (file <= N1_GRANDFATHERED_THROUGH) return Object.freeze([]);
  const findings: string[] = [];
  const report = (index: number, code: string, detail: string): void => {
    findings.push(`${name}:${lineAt(source, index)} ${code} ${detail}`);
  };
  let declaration: ReturnType<typeof parseN1Header>;
  try {
    declaration = parseN1Header(file, source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    findings.push(`${name}:1 N1_HEADER_INVALID ${message.slice(message.lastIndexOf(" ") + 1)}`);
    return Object.freeze(findings);
  }
  if (declaration.keepsVerifier !== context.keepsVerifier) {
    findings.push(`${name}:1 N1_KEEPS_VERIFIER_MISMATCH the header says ${declaration.keepsVerifier}, ${context.keepsVerifier === null
      ? "no lineage manifest names the file" : `the lineage manifest says ${context.keepsVerifier}`}`);
  }
  if (declaration.drained) return Object.freeze(findings);

  const code = maskedSql(source);
  const lines = source.split("\n");
  const created = createdHere(code);
  const existing = (relation: string | undefined): boolean => relation === undefined || !created.relations.has(normal(relation));
  const statements = statementsOf(code);

  // The guard pairs: a DROP passes when its partner follows (on a new table) or is reviewed as well (on an existing one).
  const passedDrops = new Set<number>();
  const pairedTriggers = new Set<string>();
  statements.forEach((statement, position) => {
    const later = statements.slice(position + 1);
    const trigger = DROP_TRIGGER_PAIR.exec(statement.text);
    const constraint = DROP_CONSTRAINT_PAIR.exec(statement.text);
    const table = trigger?.[2] ?? constraint?.[1];
    if (table === undefined) return;
    if (existing(table) && !reviewedAbove(lines, lineAt(source, statement.start))) return;
    const partner = later.some((next) => {
      if (trigger !== null) {
        const recreated = CREATE_TRIGGER.exec(next.text);
        return recreated !== null && normal(recreated[1]!) === normal(trigger[1]!) && normal(recreated[2]!) === normal(table);
      }
      const altered = ALTER_TABLE.exec(next.text);
      if (altered === null || normal(altered[1]!) !== normal(table)) return false;
      return topLevelParts(next.text.slice(altered[0].length)).some((part) => {
        const added = new RegExp(String.raw`^ADD\s+CONSTRAINT\s+${NAME}\s`, "iu").exec(part.text);
        return added !== null && normal(added[1]!) === normal(constraint![2]!) && (!existing(table) || /\bNOT\s+VALID\s*$/iu.test(part.text));
      });
    });
    if (!partner) return;
    passedDrops.add(statement.start);
    if (trigger !== null) pairedTriggers.add(`${normal(trigger[1]!)}|${normal(table)}`);
  });

  const addedConstraints = new Set<string>();
  for (const statement of statements) {
    const at = statement.start;
    const text = statement.text;
    for (const drop of text.matchAll(/\bDROP\b/giu)) {
      if (!passedDrops.has(at)) report(at + drop.index, "N1_FORBIDDEN_DROP", "an expand step drops nothing the release before may use");
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
    const altered = ALTER_TABLE.exec(text);
    if (altered !== null) {
      const table = altered[1]!;
      for (const part of topLevelParts(text.slice(altered[0].length))) {
        const index = at + altered[0].length + part.offset;
        const constraint = new RegExp(String.raw`^ADD\s+CONSTRAINT\s+${NAME}\s`, "iu").exec(part.text);
        const validate = new RegExp(String.raw`^VALIDATE\s+CONSTRAINT\s+${NAME}$`, "iu").exec(part.text);
        const unnamed = /^ADD\s+(?:UNIQUE|PRIMARY\s+KEY|EXCLUDE|CHECK|FOREIGN\s+KEY)\b/iu.test(part.text);
        if (constraint !== null || unnamed) {
          if (constraint !== null) addedConstraints.add(`${normal(table)}|${normal(constraint[1]!)}`);
          if (existing(table) && (!/\bNOT\s+VALID\s*$/iu.test(part.text) || /\b(?:UNIQUE|PRIMARY\s+KEY|EXCLUDE)\b/iu.test(part.text))) {
            report(index, "N1_STRONG_LOCK_CONSTRAINT", `${table} gains a constraint that is checked or indexed under its strongest lock`);
          }
        } else if (validate !== null) {
          if (addedConstraints.has(`${normal(table)}|${normal(validate[1]!)}`)) {
            report(index, "N1_STRONG_LOCK_VALIDATE", `${validate[1]} is validated by the step that adds it; a later step validates it`);
          }
        } else if (/^ADD\b/iu.test(part.text)) {
          if (/\bNOT\s+NULL\b/iu.test(part.text) && !/\bDEFAULT\b/iu.test(part.text)) {
            report(index, "N1_FORBIDDEN_NOT_NULL_WITHOUT_DEFAULT", "the release before inserts rows without the new column");
          }
          if (existing(table) && /\b(?:UNIQUE|PRIMARY\s+KEY|EXCLUDE)\b/iu.test(part.text)) {
            report(index, "N1_STRONG_LOCK_CONSTRAINT", `${table} gains a column indexed under its strongest lock`);
          }
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
      if (objects.length === 0 || objects.some((object) => object === undefined || !created.objects.has(normal(object)))) {
        report(at, "N1_FORBIDDEN_REVOKE", "the release before may still use what is revoked");
      }
    }
    const replacedFunction = new RegExp(String.raw`^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+${NAME}\s*\(`, "iu").exec(text);
    if (replacedFunction !== null && context.earlierFunctions.has(normal(replacedFunction[1]!))) {
      report(at, "N1_FORBIDDEN_REPLACE", `${replacedFunction[1]} is defined by an earlier step; a new function supersedes it`);
    }
    const replacedView = new RegExp(String.raw`^CREATE\s+OR\s+REPLACE\s+(?:RECURSIVE\s+)?VIEW\s+${NAME}`, "iu").exec(text);
    if (replacedView !== null && !created.plainRelations.has(normal(replacedView[1]!))) {
      report(at, "N1_FORBIDDEN_REPLACE", `${replacedView[1]} may be read by the release before; a new view is created with CREATE VIEW`);
    }
    const trigger = CREATE_TRIGGER.exec(text);
    if (trigger !== null && existing(trigger[2]) && !pairedTriggers.has(`${normal(trigger[1]!)}|${normal(trigger[2]!)}`)) {
      report(at, "N1_FORBIDDEN_TRIGGER", `${trigger[2]} gains a trigger the release before's writes would meet`);
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
    if (/^(?:LOCK|CLUSTER)\b/iu.test(text) || /^VACUUM\b[\s\S]*\bFULL\b/iu.test(text) || (/^REINDEX\b/iu.test(text) && !/\bCONCURRENTLY\b/iu.test(text))) {
      report(at, "N1_STRONG_LOCK_LOCK_TABLE", "an expand step takes no table lock of its own");
    }
  }
  for (const block of sqlDoBlocks(maskSqlComments(source))) {
    const body = maskSqlQuotedLiterals(source.slice(block.bodyStart, block.bodyEnd));
    if (/\bEXECUTE\b/iu.test(body) && !reviewedAbove(lines, lineAt(source, block.start))) {
      report(block.start, "N1_DYNAMIC_SQL", "a DO block runs SQL the audit cannot read; a reviewed line above it says why it is expand");
    }
  }
  return Object.freeze(findings.sort((left, right) => lineOf(left) - lineOf(right)));
}

const lineOf = (finding: string): number => Number(/:(\d+) /u.exec(finding)?.[1] ?? 0);

/** N1_GRANDFATHER_DRIFT when the files at or before N1_GRANDFATHERED_THROUGH are not the N1_GRANDFATHERED_COUNT pinned. */
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
