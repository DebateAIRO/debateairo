/**
 * Row-level security S01, PLAN S8.3 (SPEC-v4 R7-R9, R14, R38-R40, A6; DECISIONS D62): `pnpm run rls:proof` as V runs it
 * at A6, and the proof's own refutation — the same proof on a database with row security off (the base) must fail.
 *
 * S8.3-a stdout lines 2, 3×16 and 4 EXACT, line 1 CONTAINS the throwaway cluster, the head's last migration and the
 *        118 in-scope relations; exit 0.
 * S8.3-b stdout carries no session token, token hash or bytea value (R40).
 * S8.3-c the run leaves no cluster process, listener or temporary directory of its own behind (R40). PLAN S8.3-c reads
 *        "`lsof -nP -iTCP -sTCP:LISTEN | wc -l` is equal before and after"; on this shared host that count moved with
 *        other processes during a passing run (measured 87 -> 85, log BUILD-S01-C8-S8.3-3.log), so the test checks the
 *        proof's own: no process names a `debateai-rls-proof-` directory (the cluster's data directory is under one,
 *        so a cluster left running is caught) and no such directory is left under the temporary folder.
 * S8.3-d runRlsProof({ emulateBase: true, out }) returns non-zero and `out` received RLS_PROOF_FAILED lines — for each
 *        login, an R7, an R8 and an R9 failure and a forgery line with widened > 0, so each check is shown to bite.
 */
import { execFile, spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { runRlsProof } from "../../tools/rls/proof.js";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LOGINS = ["debateai_prod_api_runtime", "debateai_prod_api_authorization", "debateai_dev_runtime", "debateai_dev_authorization"];

/** The proof's own leftovers: processes whose command line names one of its directories, and those directories. */
async function leftovers(): Promise<Readonly<{ processes: string; directories: readonly string[] }>> {
  const processes = await promisify(execFile)("/usr/bin/pgrep", ["-fl", "debateai-rls-proof-"])
    .then(({ stdout }) => stdout.trim(), (error: { code?: number; stdout?: string }) => {
      if (error.code === 1) return "";
      throw error;
    });
  const directories = (await readdir(tmpdir())).filter((name) => name.startsWith("debateai-rls-proof-")).sort();
  return Object.freeze({ processes, directories });
}

describe("rls:proof — V's command at the head (PLAN S8.3, A6)", () => {
  let run: Readonly<{ code: number | null; stdout: string; before: Awaited<ReturnType<typeof leftovers>>;
    after: Awaited<ReturnType<typeof leftovers>> }>;

  beforeAll(async () => {
    const before = await leftovers();
    const result = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
      const child = spawn("pnpm", ["--reporter=silent", "run", "rls:proof"], { cwd: PRODUCT_ROOT, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", () => undefined);
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stdout }));
    });
    run = Object.freeze({ ...result, before, after: await leftovers() });
  }, 1_200_000);

  it("S8.3-a stdout lines 2, 3×16, 4 EXACT and line 1 CONTAINS \"RLS_PROOF cluster=throwaway migrated_to=0136_investigation_reports.sql\" and \" in_scope=118\"; exit 0", () => {
    const lines = run.stdout.split("\n");
    expect(lines.at(-1)).toBe("");
    const [first, ...rest] = lines.slice(0, -1);
    expect(first).toContain("RLS_PROOF cluster=throwaway migrated_to=0136_investigation_reports.sql");
    expect(first).toContain(" in_scope=118");
    expect(rest).toEqual([
      "RLS_PROOF seeded l5f12_relations_with_rows_of_b=6/6",
      ...LOGINS.flatMap((login) => [
        `RLS_PROOF login=${login} context=A foreign_rows=0 own_rows_seen=yes`,
        `RLS_PROOF login=${login} context=none private_rows=0 errors=0`,
        `RLS_PROOF login=${login} context=forged private_rows=0 errors=0`,
        `RLS_PROOF login=${login} forgeries=8 widened=0`
      ]),
      "RLS_PROOF_OK logins=4 foreign_rows=0 private_rows=0 widened=0"
    ]);
    expect(run.code).toBe(0);
  });

  it("S8.3-b stdout matches none of /[A-Za-z0-9_-]{43}/, /sha256:[0-9a-f]{64}/, /\\\\x[0-9a-f]{16}/ (R40)", () => {
    expect(run.stdout).toContain("RLS_PROOF cluster=throwaway");
    for (const secret of [/[A-Za-z0-9_-]{43}/u, /sha256:[0-9a-f]{64}/u, /\\x[0-9a-f]{16}/u]) {
      expect(run.stdout).not.toMatch(secret);
    }
  });

  it("S8.3-c the run leaves no cluster process, listener or temporary directory of its own behind (R40)", () => {
    expect(run.stdout).toContain("RLS_PROOF cluster=throwaway");
    expect(run.before.processes).toBe("");
    expect(run.after.processes).toBe("");
    expect(run.after.directories).toEqual(run.before.directories);
  });
});

describe("rls:proof — the base, where it must fail (PLAN S8.3)", () => {
  it("S8.3-d runRlsProof({ emulateBase: true, out }) returns non-zero and out received a line starting RLS_PROOF_FAILED", async () => {
    const lines: string[] = [];
    const code = await runRlsProof({ emulateBase: true, out: (line) => { lines.push(line); } });
    expect(code).not.toBe(0);
    expect(lines.some((line) => line.startsWith("RLS_PROOF_FAILED "))).toBe(true);
    expect(lines).not.toContain("RLS_PROOF_OK logins=4 foreign_rows=0 private_rows=0 widened=0");
    for (const login of LOGINS) {
      for (const requirement of ["R7", "R8", "R9"]) {
        expect(lines.some((line) => line.startsWith(`RLS_PROOF_FAILED ${login} `) && line.endsWith(` ${requirement}`)),
          `${login} ${requirement}`).toBe(true);
      }
      expect(lines.find((line) => line.startsWith(`RLS_PROOF login=${login} forgeries=8 widened=`)), login)
        .toMatch(/ widened=[1-8]$/u);
    }
  }, 1_200_000);
});
