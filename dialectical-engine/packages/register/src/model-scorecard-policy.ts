import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { parseScorecard, type Scorecard, type ScorecardRefusalReason } from "@debateai/scorecard";
import { parseCanonicalRegisterJson } from "./register-publication.js";

/**
 * A19 — THE MODEL SCORECARD ROW FAMILY (spec 2026-09-26 §1, §2.8).
 *
 * One row, `modelScorecard`, whose value is a whole scorecard document. It is
 * OPTIONAL by design and is NOT a `register.required_row`: a register version
 * without it is today's engine, and asks keep the plan rosters. Every reader
 * here answers ABSENT, VALID or REFUSED and never throws for what a row or a
 * file CONTAINS — a refused scorecard is reported, never half-applied. A pool
 * that cannot be queried is not a scorecard state: that failure propagates,
 * exactly as every other boot reader's does.
 *
 * WHERE EACH MODE READS IT.
 *  - Hosted: the sealed row at the deployment's REGISTER_VERSION, published by
 *    `pnpm register:publish-hosted --scorecard <file>` as an ADDITIVE operator
 *    row. There is deliberately NO code-owned default row: the public file lags
 *    the site by one version, and a forgotten flag must mean "no scorecard",
 *    never "the older public one".
 *  - Local: the bundled public file `scorecards/current.json`, found beside
 *    this package the way `register.bootstrap.json` is — no environment key,
 *    no machine path.
 *
 * A NEW SCORECARD IS A NEW REGISTER VERSION, NEVER AN EDIT OF A SEALED ONE.
 * Going back is pinning the earlier REGISTER_VERSION.
 */
export const MODEL_SCORECARD_ROW_KEY = "modelScorecard" as const;

/** The public, one-version-behind scorecard local mode reads. Absent until the owners approve the first. */
export const BUNDLED_MODEL_SCORECARD_URL = new URL("../../../scorecards/current.json", import.meta.url);

const BUNDLED_MODEL_SCORECARD_SOURCE_REF = "bundled:scorecards/current.json";

export type ModelScorecardRefusalReason = ScorecardRefusalReason | "PROVENANCE_MISSING" | "FILE_UNREADABLE";

export type ModelScorecardReadResult =
  | Readonly<{ state: "ABSENT" }>
  | Readonly<{ state: "VALID"; scorecard: Scorecard; sourceRef: string }>
  | Readonly<{ state: "REFUSED"; reason: ModelScorecardRefusalReason; detail: string }>;

const ABSENT: ModelScorecardReadResult = Object.freeze({ state: "ABSENT" });

function refused(reason: ModelScorecardRefusalReason, detail: string): ModelScorecardReadResult {
  return Object.freeze({ state: "REFUSED", reason, detail });
}

/** A row value, or a file's parsed JSON, to its state. The rules are `parseScorecard`'s, never restated here. */
export function modelScorecardFromValue(
  value: unknown,
  sourceRef: string,
  engineVersion: string
): ModelScorecardReadResult {
  if (sourceRef.trim() === "") {
    return refused("PROVENANCE_MISSING", `${MODEL_SCORECARD_ROW_KEY} carries no source reference`);
  }
  const parsed = parseScorecard(value, engineVersion);
  return parsed.state === "VALID"
    ? Object.freeze({ state: "VALID", scorecard: parsed.scorecard, sourceRef })
    : refused(parsed.reason, parsed.detail);
}

/** The row IN FORCE at one register version; ABSENT when that version sealed none. */
export async function readModelScorecard(
  pool: Pool,
  registerVersion: number,
  engineVersion: string
): Promise<ModelScorecardReadResult> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, MODEL_SCORECARD_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? ABSENT : modelScorecardFromValue(row.value_json, row.source_ref, engineVersion);
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

/** Local mode's scorecard: the bundled public file, or ABSENT while there is none. */
export async function readBundledModelScorecard(
  engineVersion: string,
  location: URL = BUNDLED_MODEL_SCORECARD_URL
): Promise<ModelScorecardReadResult> {
  let bytes: Buffer;
  try {
    bytes = await readFile(location);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return ABSENT;
    return refused("FILE_UNREADABLE", "the bundled scorecard path exists but could not be read as a file");
  }
  let value: unknown;
  try {
    // The register's own canonical parser, so a file local mode accepts is a
    // file the hosted register could seal: no duplicate key, no exponent number.
    value = JSON.parse(parseCanonicalRegisterJson(bytes));
  } catch {
    return refused(
      "SCHEMA_INVALID",
      "the bundled scorecard is not JSON the register can hold (duplicate key, exponent number, over 1 MiB, or not JSON)"
    );
  }
  return modelScorecardFromValue(value, BUNDLED_MODEL_SCORECARD_SOURCE_REF, engineVersion);
}

/** The version a scorecard's `engineCompatibility` is judged against: the engine root manifest's `version`. */
export async function readEngineVersion(
  location: URL = new URL("../../../package.json", import.meta.url)
): Promise<string> {
  const manifest = JSON.parse(await readFile(location, "utf8")) as { readonly version?: unknown };
  if (typeof manifest.version !== "string" || !/^\d+(?:\.\d+)*$/u.test(manifest.version)) {
    throw new TypeError("ENGINE_VERSION_UNRESOLVED");
  }
  return manifest.version;
}
