/**
 * A19 — the `modelScorecard` register row family and the bundled public file.
 *
 * Every reader answers ABSENT, VALID or REFUSED and never throws for what a row
 * or a file CONTAINS. Validation itself is `@debateai/scorecard`'s
 * `parseScorecard`; these rows prove the register side carries its verdict
 * unchanged and reads only the version it is pinned to.
 */
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLED_MODEL_SCORECARD_URL,
  MODEL_SCORECARD_MAX_BYTES,
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

  /*
   * Carry 9 (A19.1 review M2, M3, M5): the path is opened and its descriptor
   * judged BEFORE anything is read. Only a regular file within the scorecard
   * bound is read at all, and every refusal's detail is a fixed sentence with
   * no path.
   *
   * Owner ruling 2026-09-27: the bound is 64 KiB, ONE constant shared with
   * hosted publish, so the same file gets the same answer in both modes. It
   * caps the file and the form it is stored in, since the database re-checks a
   * sealed value at a cost that grows with the square of its size.
   */
  it("is 64 KiB, one number for both modes", () => {
    expect(MODEL_SCORECARD_MAX_BYTES).toBe(65_536);
  });

  it("reads a file of exactly 64 KiB", async () => {
    const valid = JSON.stringify(await compatible());
    const atBound = valid + " ".repeat(MODEL_SCORECARD_MAX_BYTES - Buffer.byteLength(valid, "utf8"));
    expect(Buffer.byteLength(atBound, "utf8")).toBe(65_536);
    await expect(readBundledModelScorecard(ENGINE, await fileHolding(atBound)))
      .resolves.toMatchObject({ state: "VALID" });
  });

  it("refuses a file over 64 KiB from its size alone, before reading it", async () => {
    const valid = JSON.stringify(await compatible());
    const oversized = valid + " ".repeat(MODEL_SCORECARD_MAX_BYTES + 1 - Buffer.byteLength(valid, "utf8"));
    expect(Buffer.byteLength(oversized, "utf8")).toBe(65_537);
    const location = await fileHolding(oversized);
    const read = await readBundledModelScorecard(ENGINE, location);
    expect(read).toMatchObject({ state: "REFUSED", reason: "SCHEMA_INVALID" });
    expect((read as { detail: string }).detail).toBe("the bundled scorecard is larger than 64 KiB, the limit for one scorecard");
    expect(JSON.stringify(read)).not.toContain(fileURLToPath(new URL(".", location)));
  });

  it("refuses a file under 64 KiB whose stored form is over it", async () => {
    // "\n" is 2 bytes in the file and `\u000a`, 6 bytes, in the register's canonical form.
    const expanding = JSON.stringify({ ...await compatible(), futureNote: "\n".repeat(12_000) });
    expect(Buffer.byteLength(expanding, "utf8")).toBeLessThanOrEqual(MODEL_SCORECARD_MAX_BYTES);
    const read = await readBundledModelScorecard(ENGINE, await fileHolding(expanding));
    expect(read).toMatchObject({ state: "REFUSED", reason: "SCHEMA_INVALID" });
    expect((read as { detail: string }).detail)
      .toBe("the bundled scorecard is larger than 64 KiB once stored, the limit for one scorecard");
  });

  it("refuses a link whose target is missing, instead of calling it absent", async () => {
    const root = await temporaryRoot();
    await symlink(join(root, "approved-elsewhere.json"), join(root, "current.json"));
    const read = await readBundledModelScorecard(ENGINE, pathToFileURL(join(root, "current.json")));
    expect(read).toMatchObject({ state: "REFUSED", reason: "FILE_UNREADABLE" });
    expect(JSON.stringify(read)).not.toContain(root);
  });

  it("refuses a FIFO at once, without waiting for a writer", async () => {
    const root = await temporaryRoot();
    const fifo = join(root, "current.json");
    execFileSync("mkfifo", [fifo]);
    const stop = new AbortController();
    const read = readBundledModelScorecard(ENGINE, pathToFileURL(fifo));
    try {
      const settled = await Promise.race([
        read,
        delay(2_000, undefined, { signal: stop.signal }).then(() => "STILL_WAITING_FOR_A_WRITER", () => "ABORTED")
      ]);
      expect(settled).toMatchObject({ state: "REFUSED", reason: "FILE_UNREADABLE" });
      expect(JSON.stringify(settled)).not.toContain(root);
    } finally {
      stop.abort();
      // A reader blocked in open() waits for a writer: open and close one end so
      // it can finish. With no reader waiting this refuses (ENXIO) and is ignored.
      await open(fifo, constants.O_WRONLY | constants.O_NONBLOCK).then((handle) => handle.close(), () => undefined);
      await Promise.race([read.catch(() => undefined), delay(1_000)]);
    }
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

  /* Carry 9 (A19.1 review M1): one code for every manifest it cannot use, never a raw ENOENT or SyntaxError. */
  it("refuses a missing, non-JSON, null or non-object manifest by the same code", async () => {
    const missing = pathToFileURL(join(await temporaryRoot(), "package.json"));
    await expect(readEngineVersion(missing))
      .rejects.toMatchObject({ name: "TypeError", message: "ENGINE_VERSION_UNRESOLVED" });
    for (const contents of ["not json", "null", "42", "\"0.1.0\""]) {
      await expect(readEngineVersion(await fileHolding(contents)), contents)
        .rejects.toMatchObject({ name: "TypeError", message: "ENGINE_VERSION_UNRESOLVED" });
    }
  });
});
