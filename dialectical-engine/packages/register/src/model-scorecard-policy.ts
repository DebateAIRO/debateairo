import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
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

/**
 * THE SCORECARD SIZE BOUND: 64 KiB (owner ruling 2026-09-27, "I'm OK with it").
 *
 * ONE number for both modes, so one file gets one answer: local mode's bundled
 * `scorecards/current.json` (below) and hosted publish's `--scorecard` file
 * (apps/runner/src/hosted-register-publish.ts). It caps the file AND the
 * canonical text the register stores, which can be longer (a 2-byte `\n` is
 * stored as the 6-byte `\u000a`). Why so small: the database re-checks a
 * sealed value one character at a time (migrations/0055, register._canonical_json_value),
 * at a cost that grows with the square of its size — sealing ~100 KB took
 * ~84 s on a quiet machine (A19.2). The register's own row limit (1 MiB) is
 * far above what that check can take.
 */
export const MODEL_SCORECARD_MAX_BYTES = 64 * 1_024;

const BUNDLED_FILE_UNREADABLE_DETAIL = "the bundled scorecard path exists but could not be read as a file";

/**
 * Local mode's scorecard: the bundled public file, or ABSENT while there is none.
 *
 * The path is OPENED and its descriptor judged before a byte is read (A19.1
 * review M2, M3). `O_NONBLOCK` makes opening a FIFO return at once instead of
 * waiting for a writer; it changes nothing for a regular file. Only a regular
 * file within `MODEL_SCORECARD_MAX_BYTES` (64 KiB) is read, and never more
 * than one byte past the size it reported; its canonical form must fit the
 * same bound. A link is followed; a link whose target is missing is REFUSED,
 * not ABSENT, because something is there. Details are fixed sentences, never a path.
 */
export async function readBundledModelScorecard(
  engineVersion: string,
  location: URL = BUNDLED_MODEL_SCORECARD_URL
): Promise<ModelScorecardReadResult> {
  let handle;
  try {
    handle = await open(location, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    if (!isFileSystemError(error, "ENOENT")) return refused("FILE_UNREADABLE", BUNDLED_FILE_UNREADABLE_DETAIL);
    const linkStillThere = await lstat(location).then(() => true, () => false);
    return linkStillThere ? refused("FILE_UNREADABLE", BUNDLED_FILE_UNREADABLE_DETAIL) : ABSENT;
  }
  let bytes: Buffer;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) return refused("FILE_UNREADABLE", BUNDLED_FILE_UNREADABLE_DETAIL);
    if (metadata.size > MODEL_SCORECARD_MAX_BYTES) {
      return refused("SCHEMA_INVALID", "the bundled scorecard is larger than 64 KiB, the limit for one scorecard");
    }
    const bounded = Buffer.alloc(metadata.size + 1);
    let offset = 0;
    while (offset < bounded.length) {
      const { bytesRead } = await handle.read(bounded, offset, bounded.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    bytes = bounded.subarray(0, offset);
  } catch {
    return refused("FILE_UNREADABLE", BUNDLED_FILE_UNREADABLE_DETAIL);
  } finally {
    await handle.close().catch(() => undefined);
  }
  let canonical: string;
  try {
    // The register's own canonical parser, so a file local mode accepts is a
    // file the hosted register could seal: no duplicate key, no exponent number.
    canonical = parseCanonicalRegisterJson(bytes);
  } catch {
    return refused(
      "SCHEMA_INVALID",
      "the bundled scorecard is not JSON the register can hold (duplicate key, exponent number, or not JSON)"
    );
  }
  // The same bound on the stored form, as hosted publish applies to what it seals.
  if (Buffer.byteLength(canonical, "utf8") > MODEL_SCORECARD_MAX_BYTES) {
    return refused("SCHEMA_INVALID", "the bundled scorecard is larger than 64 KiB once stored, the limit for one scorecard");
  }
  return modelScorecardFromValue(JSON.parse(canonical) as unknown, BUNDLED_MODEL_SCORECARD_SOURCE_REF, engineVersion);
}

/**
 * The version a scorecard's `engineCompatibility` is judged against: the engine root manifest's `version`.
 * A manifest that is missing, unreadable, not JSON, not an object, or without a dotted version is ONE
 * refusal, `TypeError("ENGINE_VERSION_UNRESOLVED")`, never a raw ENOENT or SyntaxError (A19.1 review M1).
 */
export async function readEngineVersion(
  location: URL = new URL("../../../package.json", import.meta.url)
): Promise<string> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(location, "utf8"));
  } catch {
    throw new TypeError("ENGINE_VERSION_UNRESOLVED");
  }
  const version = manifest !== null && typeof manifest === "object"
    ? (manifest as { readonly version?: unknown }).version
    : undefined;
  if (typeof version !== "string" || !/^\d+(?:\.\d+)*$/u.test(version)) {
    throw new TypeError("ENGINE_VERSION_UNRESOLVED");
  }
  return version;
}
