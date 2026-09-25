import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), "utf8");

const CARRIERS = [
  "serve.conformance_record",
  "core.value_hinge",
  "ledger.overlay_run",
  "core.run_progress_event",
  "memory.alias_row"
] as const;

// V-6 (owner ruling 2026-09-22, scope ruled 2026-09-25): 0063's mechanism,
// applied to the remaining debate-text carriers, pinned as text so a stale
// mirror or a borrowed function cannot pass unseen.
describe("V-6 remaining content carriers — architecture contract", () => {
  it("0069 installs the three carrier triggers on each new carrier and owns every function it defines", async () => {
    const names = (await readdir(new URL("migrations/", root)))
      .filter((name) => /^\d+_remaining_content_carriers\.sql$/.test(name));
    expect(names).toEqual(["0069_remaining_content_carriers.sql"]);
    const migration = await read(`migrations/${names[0]}`);
    for (const carrier of CARRIERS) {
      expect(migration).toContain(`ALTER TABLE ${carrier}\n  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb,\n  ADD COLUMN IF NOT EXISTS content_attestation bytea;`);
      expect(migration).toContain(`'${carrier}'`);
    }
    for (const [trigger, fn] of [
      ["aaa_enforce_content_attestation_v2", "core.enforce_content_attestation_v2_remaining_carriers()"],
      ["enforce_content_ciphertext", "core.enforce_content_ciphertext_remaining_carriers()"],
      ["enforce_erasure_barrier", "core.enforce_erasure_barrier_remaining_carriers()"]
    ] as const) {
      expect(migration).toContain(
        `'CREATE TRIGGER ${trigger} BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION ${fn}'`
      );
    }
    expect(migration).toContain("CREATE TRIGGER enforce_raw_artifact_metadata_code_shaped\nBEFORE INSERT ON ledger.raw_artifact");

    // The class 0063 swept: no function this migration defines may be defined
    // by any other migration, because a replay of that other file would
    // silently restore its owner's body under our triggers.
    const defined = (sql: string): readonly string[] => [
      ...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_][a-z0-9_]*\.[a-z0-9_]+)\s*\(/gi)
    ].map((match) => match[1]!.toLowerCase());
    const definedHere = defined(migration);
    expect(definedHere).toEqual([
      "core.jsonb_is_code_token",
      "core.jsonb_has_exact_keys",
      "core.progress_value_is_code_shaped",
      "core.raw_artifact_metadata_is_code_shaped",
      "core.enforce_content_ciphertext_remaining_carriers",
      "core.enforce_content_attestation_v2_remaining_carriers",
      "core.enforce_erasure_barrier_remaining_carriers",
      "core.enforce_raw_artifact_metadata_code_shaped"
    ]);
    for (const other of (await readdir(new URL("migrations/", root)))
      .filter((name) => name.endsWith(".sql") && name !== names[0])) {
      for (const owned of defined(await read(`migrations/${other}`))) {
        expect({ migration: other, function: owned, alsoDefinedBy0069: definedHere.includes(owned) })
          .toEqual({ migration: other, function: owned, alsoDefinedBy0069: false });
      }
    }
  });

  it("mirrors both carrier columns in schema.ts and declares every carrier to the cipher", async () => {
    const schema = await read("packages/db/src/schema.ts");
    for (const declaration of [
      'export const conformanceRecord = serve.table("conformance_record", {',
      'export const valueHinge = core.table("value_hinge", {',
      'export const overlayRun = ledger.table("overlay_run", {',
      'export const runProgressEvent = core.table("run_progress_event", {',
      'export const memoryAliasRow = memory.table("alias_row", {'
    ]) {
      const start = schema.indexOf(declaration);
      expect(start).toBeGreaterThanOrEqual(0);
      const block = schema.slice(start, schema.indexOf("});", start));
      expect(block).toContain('contentCiphertext: jsonb("content_ciphertext"),');
      expect(block).toContain('contentAttestation: bytea("content_attestation")');
    }
    const crypto = await read("packages/crypto/src/index.ts");
    const carriers = crypto.slice(
      crypto.indexOf("export const CONTENT_CARRIERS"), crypto.indexOf("export type ContentCarrier")
    );
    for (const carrier of CARRIERS) expect(carriers).toContain(`"${carrier}"`);
  });
});
