import type { ObsAcceptanceCase, ObsCaseContext } from "../index.js";
import { readObsSchemaColumns } from "../database.js";
import { FIX08_RUNTIME_SUBJECT } from "./corpus.js";

export interface ObsSchemaColumn {
  readonly table_schema: string;
  readonly table_name: string;
  readonly column_name: string;
  readonly data_type: string;
}

export type SchemaFindingReason = "FREE_TEXT_MESSAGE" | "USER_LINKED";

export interface SchemaManifestHit {
  readonly table: string;
  readonly column: string;
  readonly reason: SchemaFindingReason;
}

export interface SchemaManifestEvaluation {
  readonly passed: boolean;
  readonly scannedColumns: number;
  readonly hits: readonly SchemaManifestHit[];
}

export function evaluateSchemaManifest(columns: readonly ObsSchemaColumn[]): SchemaManifestEvaluation {
  const hits: SchemaManifestHit[] = [];
  let scannedColumns = 0;
  for (const column of columns) {
    if (column.table_schema !== "obs") continue;
    scannedColumns += 1;
    if (/message/iu.test(column.column_name)) {
      hits.push(Object.freeze({
        table: column.table_name,
        column: column.column_name,
        reason: "FREE_TEXT_MESSAGE" as const,
      }));
      continue;
    }
    if (/asker|session/iu.test(column.column_name)) {
      hits.push(Object.freeze({
        table: column.table_name,
        column: column.column_name,
        reason: "USER_LINKED" as const,
      }));
    }
  }
  return Object.freeze({
    passed: hits.length === 0,
    scannedColumns,
    hits: Object.freeze(hits),
  });
}

export const schemaManifestCase: ObsAcceptanceCase = Object.freeze({
  name: "schema-manifest",
  subjectPaths: Object.freeze([FIX08_RUNTIME_SUBJECT]),
  async run(context: ObsCaseContext) {
    if (!process.env.OBS_LISTENER_DATABASE_URL?.trim()) {
      return context.skipMissing("OBS_LISTENER_DATABASE_URL");
    }
    try {
      const receipt = await context.spawn({
        command: process.execPath,
        arguments: ["-e", "process.exit(0)"],
        timeoutMs: 2_000,
      });
      const evaluation = evaluateSchemaManifest(await readObsSchemaColumns());
      if (!evaluation.passed) {
        return context.fail("SCHEMA_MANIFEST_FORBIDDEN_COLUMN", { hits: evaluation.hits.length });
      }
      return context.passProcess(receipt, { scanned_columns: evaluation.scannedColumns });
    } catch {
      return context.fail("SCHEMA_MANIFEST_PROOF_UNAVAILABLE", { failures: 1 });
    }
  },
});
