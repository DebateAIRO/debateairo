import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSupportKeyPort, type SupportKeyPort
} from "../../apps/api/src/support/keys.js";
import {
  createEvalSourcePseudonym, supportEvalKekMaterial
} from "../support-eval/sourcePseudonym.js";

/**
 * FW-E. `pnpm run support:eval` scored 0/60 on every run and nobody read the
 * cause: the harness handed the API a labelled stand-in, `eval-pseudonym:<ip>`,
 * for the caller's network. That value is STORED — `support.admission_event`
 * takes it as `ip_sha256 character(64)` under a CHECK that only 64 lowercase
 * hexadecimal characters pass — so PostgreSQL rejected the very first
 * `POST /v1/support/sessions` of every case, and all sixty scored as
 * `execution` failures before a single answer was generated. A benchmark that
 * fails identically on a perfect answer and on no answer at all measures
 * nothing.
 *
 * The pin reads the CHECK expression OUT OF THE MIGRATION rather than
 * restating it, so it follows the schema if the grammar is ever widened, and
 * it refuses to pass if the expression can no longer be found.
 */

const ADMISSION_MIGRATION = "migrations/0054_support_keys_audit.sql";
const ABUSE_MIGRATION = "migrations/0050_support_foundation.sql";
const HARNESS = "tests/support-eval/run.ts";

/** Every `ip_sha256 ~ '<expression>'` a migration declares, in file order. */
function ipCheckExpressions(sql: string): readonly string[] {
  return [...sql.matchAll(/ip_sha256\s*~\s*'([^']+)'/gu)].map((match) => match[1] ?? "");
}

/** The synthetic caller addresses `createInProcessSupportEvalExecutor` mints, one per case. */
function evalSourceValues(cases: number): readonly string[] {
  return Array.from({ length: cases },(_unused,index) => {
    const address = index + 1;
    return `198.51.${Math.floor(address / 250)}.${(address % 250) + 1}`;
  });
}

const temporaryRoots: string[] = [];
const ports: SupportKeyPort[] = [];

async function evalKeyPort(): Promise<SupportKeyPort> {
  const root = await mkdtemp(join(tmpdir(),"debateai-sup-01-eval-"));
  temporaryRoots.push(root);
  const secrets = join(root,"secrets");
  await mkdir(secrets,{ mode: 0o700 });
  const supportKekPath = join(secrets,"support-kek.bin");
  await writeFile(supportKekPath,supportEvalKekMaterial(),{ mode: 0o600 });
  const port = await createSupportKeyPort({ supportKekPath });
  ports.push(port);
  return port;
}

afterEach(async () => {
  await Promise.all(ports.splice(0).map((port) => port.close()));
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root,{ recursive: true,force: true })
  ));
});

describe("SUP-01 the answer benchmark's source pseudonym is storable", () => {
  it("satisfies the ip_sha256 CHECK the support migrations declare, for every case's caller", async () => {
    const admissionSql = await readFile(ADMISSION_MIGRATION,"utf8");
    const abuseSql = await readFile(ABUSE_MIGRATION,"utf8");
    // The constraint the finding names, still where the finding said it is.
    expect(admissionSql).toContain("CONSTRAINT support_admission_event_ip_ck");
    const expressions = [
      ...ipCheckExpressions(admissionSql),...ipCheckExpressions(abuseSql)
    ];
    // Not vacuous: both columns the support write path touches were found.
    expect(expressions).toHaveLength(2);
    const checks = expressions.map((expression) => new RegExp(expression,"u"));

    // The control: the stand-in this harness used to send fails the CHECK, so a
    // regression puts the benchmark straight back to 0/60 and this test is red.
    for (const check of checks) expect(check.test("eval-pseudonym:198.51.0.2")).toBe(false);

    const pseudonym = createEvalSourcePseudonym(await evalKeyPort());
    const sources = [
      ...evalSourceValues(60),"2001:db8:1:2::/64","unknown"
    ];
    for (const source of sources) {
      const stored = pseudonym(source);
      for (const check of checks) expect(stored).toMatch(check);
      // `character(64)`: the column takes exactly this width, no more.
      expect(stored).toHaveLength(64);
    }
    // The per-source budgets still see sixty distinct callers, not one.
    expect(new Set(sources.map((source) => pseudonym(source))).size).toBe(sources.length);
  });

  it("is keyed, so the stored value cannot be inverted back to the caller's address", async () => {
    const pseudonym = createEvalSourcePseudonym(await evalKeyPort());
    const other = createEvalSourcePseudonym(
      await (async () => {
        const root = await mkdtemp(join(tmpdir(),"debateai-sup-01-eval-other-"));
        temporaryRoots.push(root);
        const secrets = join(root,"secrets");
        await mkdir(secrets,{ mode: 0o700 });
        const path = join(secrets,"support-kek.bin");
        await writeFile(path,Buffer.alloc(32,0x66),{ mode: 0o600 });
        const port = await createSupportKeyPort({ supportKekPath: path });
        ports.push(port);
        return port;
      })()
    );
    expect(pseudonym("198.51.0.2")).toBe(pseudonym("198.51.0.2"));
    expect(pseudonym("198.51.0.2")).not.toBe(other("198.51.0.2"));
  });

  it("is the derivation the harness actually wires, not a lookalike beside it", async () => {
    const harness = await readFile(HARNESS,"utf8");
    expect(harness).toContain('from "./sourcePseudonym.js"');
    expect(harness).toContain("createEvalSourcePseudonym(keys)");
    // No inline stand-in may be handed to the application beside the real one.
    expect(harness).not.toMatch(/sourcePseudonym\s*:\s*\(/u);
    expect(harness).not.toContain("eval-pseudonym:");
  });
});
