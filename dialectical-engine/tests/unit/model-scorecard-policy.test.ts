/**
 * A19 — the `modelScorecard` register row family and the bundled public file.
 *
 * Every reader answers ABSENT, VALID or REFUSED and never throws for what a row
 * or a file CONTAINS. Validation itself is `@debateai/scorecard`'s
 * `parseScorecard`; these rows prove the register side carries its verdict
 * unchanged and reads only the version it is pinned to.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLED_MODEL_SCORECARD_URL,
  MODEL_SCORECARD_ROW_KEY,
  modelScorecardFromValue,
  readBundledModelScorecard,
  readEngineVersion,
  readModelScorecard
} from "../../packages/register/src/index.js";

const FIXTURE = new URL("../../packages/scorecard/fixtures/example-scorecard.json", import.meta.url);
/** Any dotted version: every scorecard below is declared compatible with exactly this one. */
const ENGINE = "3.1.4";
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function compatible(): Promise<Record<string, unknown>> {
  const example = JSON.parse(await readFile(FIXTURE, "utf8")) as Record<string, unknown>;
  return { ...example, engineCompatibility: { minEngineVersion: ENGINE, maxEngineVersion: null } };
}

function poolReturning(rows: readonly { value_json: unknown; source_ref: string }[]) {
  const query = vi.fn(async (_text: string, _values: readonly unknown[]) => ({ rows }));
  return { pool: { query } as unknown as Pool, query };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debateai-model-scorecard-"));
  temporaryRoots.push(root);
  return root;
}

async function fileHolding(contents: string): Promise<URL> {
  const path = join(await temporaryRoot(), "current.json");
  await writeFile(path, contents);
  return pathToFileURL(path);
}

describe("A19 · the modelScorecard row family", () => {
  it("names one row key and a bundled file at the engine root", () => {
    expect(MODEL_SCORECARD_ROW_KEY).toBe("modelScorecard");
    expect(fileURLToPath(BUNDLED_MODEL_SCORECARD_URL)).toBe(resolve("scorecards", "current.json"));
  });

  it("carries parseScorecard's VALID verdict with the row's provenance", async () => {
    const value = await compatible();
    const read = modelScorecardFromValue(value, "operator: approved scorecard", ENGINE);
    expect(read).toMatchObject({
      state: "VALID",
      sourceRef: "operator: approved scorecard",
      scorecard: { kind: "DEBATEAI_SCORECARD", scorecardVersion: value.scorecardVersion }
    });
  });

  it("carries a refusal by the scorecard's own reason, and never throws on any value", async () => {
    const value = await compatible();
    expect(modelScorecardFromValue({ ...value, kind: "NOT_A_SCORECARD" }, "operator", ENGINE))
      .toMatchObject({ state: "REFUSED", reason: "SCHEMA_INVALID" });
    expect(modelScorecardFromValue({
      ...value, engineCompatibility: { minEngineVersion: "999.0.0", maxEngineVersion: null }
    }, "operator", ENGINE)).toMatchObject({ state: "REFUSED", reason: "ENGINE_INCOMPATIBLE" });
    for (const garbage of [null, 42, "text", [], {}]) {
      expect(() => modelScorecardFromValue(garbage, "operator", ENGINE)).not.toThrow();
      expect(modelScorecardFromValue(garbage, "operator", ENGINE)).toMatchObject({ state: "REFUSED" });
    }
  });

  it("refuses a row with no provenance rather than trusting it", async () => {
    expect(modelScorecardFromValue(await compatible(), "   ", ENGINE))
      .toMatchObject({ state: "REFUSED", reason: "PROVENANCE_MISSING" });
  });

  it("reads the row at the pinned version only, and answers ABSENT when that version sealed none", async () => {
    const empty = poolReturning([]);
    await expect(readModelScorecard(empty.pool, 7, ENGINE)).resolves.toEqual({ state: "ABSENT" });
    const [text, values] = empty.query.mock.calls[0]!;
    expect(text.replace(/\s+/gu, " ")).toContain("WHERE register_version=$1 AND row_key=$2");
    expect(values).toEqual([7, "modelScorecard"]);

    const sealed = poolReturning([{ value_json: await compatible(), source_ref: "operator: v7" }]);
    await expect(readModelScorecard(sealed.pool, 7, ENGINE))
      .resolves.toMatchObject({ state: "VALID", sourceRef: "operator: v7" });
  });
});

describe("A19 · the bundled public file (local mode)", () => {
  it("is ABSENT while no approved scorecard has been published", async () => {
    const missing = pathToFileURL(join(await temporaryRoot(), "current.json"));
    await expect(readBundledModelScorecard(ENGINE, missing)).resolves.toEqual({ state: "ABSENT" });
  });

  it("reads a VALID file under the bundled provenance", async () => {
    const location = await fileHolding(JSON.stringify(await compatible()));
    await expect(readBundledModelScorecard(ENGINE, location)).resolves.toMatchObject({
      state: "VALID", sourceRef: "bundled:scorecards/current.json"
    });
  });

  it("refuses a file the register could not hold, and one the engine refuses", async () => {
    // Pre-flight fix F33: both defects ride on a VALID scorecard, so only the register's
    // canonical parser can refuse them — plain JSON.parse keeps the last duplicate key,
    // and an exponent number would reach parseScorecard as NUMBER_SHAPE, not SCHEMA_INVALID.
    const valid = JSON.stringify(await compatible());
    const duplicateKey = `{"scorecardVersion":1,${valid.slice(1)}`;
    const exponent = JSON.stringify({ ...await compatible(), futureWeight: 1e-7 });
    expect(exponent).toContain('"futureWeight":1e-7');
    await expect(readBundledModelScorecard(ENGINE, await fileHolding(valid))).resolves.toMatchObject({ state: "VALID" });
    for (const contents of ["not json", duplicateKey, exponent]) {
      await expect(readBundledModelScorecard(ENGINE, await fileHolding(contents)))
        .resolves.toMatchObject({ state: "REFUSED", reason: "SCHEMA_INVALID" });
    }
    const tooNew = { ...await compatible(), engineCompatibility: { minEngineVersion: "999.0.0", maxEngineVersion: null } };
    await expect(readBundledModelScorecard(ENGINE, await fileHolding(JSON.stringify(tooNew))))
      .resolves.toMatchObject({ state: "REFUSED", reason: "ENGINE_INCOMPATIBLE" });
  });

  it("refuses a path it cannot read as a file, instead of treating it as absent", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "current.json"));
    await expect(readBundledModelScorecard(ENGINE, pathToFileURL(join(root, "current.json"))))
      .resolves.toMatchObject({ state: "REFUSED", reason: "FILE_UNREADABLE" });
  });
});

describe("A19 · the engine version a scorecard is judged against", () => {
  it("is the engine root manifest's version", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    await expect(readEngineVersion()).resolves.toBe(manifest.version);
  });

  it("refuses a manifest without a dotted version", async () => {
    for (const manifest of [{ name: "x" }, { version: "latest" }]) {
      await expect(readEngineVersion(await fileHolding(JSON.stringify(manifest))))
        .rejects.toThrowError("ENGINE_VERSION_UNRESOLVED");
    }
  });
});
