import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), "utf8");

const OWN_FUNCTIONS = [
  "core.enforce_content_attestation_v2_answer_story",
  "core.enforce_content_ciphertext_answer_story",
  "core.enforce_erasure_barrier_answer_story"
] as const;

// Verdict story (spec 2026-09-26 §7): 0063's carrier mechanism applied to
// serve.answer_story, pinned as text so a borrowed function or a stale mirror
// cannot pass unseen.
describe("serve.answer_story — carrier contract (migration 0074)", () => {
  it("is ONE migration that installs the three carrier triggers and owns every function it defines", async () => {
    const names = (await readdir(new URL("migrations/", root))).filter((name) => /^\d+_answer_story\.sql$/u.test(name));
    expect(names).toEqual(["0074_answer_story.sql"]);
    const migration = await read(`migrations/${names[0]}`);
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS serve.answer_story (");
    expect(migration).toContain("  content_ciphertext jsonb,\n  content_attestation bytea,");
    for (const [trigger, fn] of [
      ["aaa_enforce_content_attestation_v2", "core.enforce_content_attestation_v2_answer_story()"],
      ["enforce_content_ciphertext", "core.enforce_content_ciphertext_answer_story()"],
      ["enforce_erasure_barrier", "core.enforce_erasure_barrier_answer_story()"]
    ] as const) {
      expect(migration).toContain(
        `CREATE TRIGGER ${trigger}\nBEFORE INSERT ON serve.answer_story\nFOR EACH ROW EXECUTE FUNCTION ${fn};`
      );
    }
    expect(migration).toContain("SELECT core.install_truncate_guard('serve.answer_story');");
    expect(migration).toContain(
      "CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON serve.answer_story\n  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();"
    );
    expect(migration).toContain("GRANT SELECT, INSERT ON serve.answer_story TO debateai_runtime;");
    expect(migration).toContain("CHECK (spend_source IN ('RUN', 'SUPPORT', 'STORY'))");

    const defined = (sql: string): readonly string[] => [
      ...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_][a-z0-9_]*\.[a-z0-9_]+)\s*\(/giu)
    ].map((match) => match[1]!.toLowerCase());
    expect(defined(migration)).toEqual([...OWN_FUNCTIONS]);
    for (const other of (await readdir(new URL("migrations/", root)))
      .filter((name) => name.endsWith(".sql") && name !== names[0])) {
      for (const owned of defined(await read(`migrations/${other}`))) {
        expect({ migration: other, function: owned, alsoDefinedBy0074: (OWN_FUNCTIONS as readonly string[]).includes(owned) })
          .toEqual({ migration: other, function: owned, alsoDefinedBy0074: false });
      }
    }
  });

  it("mirrors both carrier columns in schema.ts and declares the carrier to the cipher", async () => {
    const schema = await read("packages/db/src/schema.ts");
    const start = schema.indexOf('export const answerStory = serve.table("answer_story", {');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = schema.slice(start, schema.indexOf("});", start));
    expect(block).toContain('contentCiphertext: jsonb("content_ciphertext"),');
    expect(block).toContain('contentAttestation: bytea("content_attestation"),');
    const crypto = await read("packages/crypto/src/index.ts");
    const carriers = crypto.slice(
      crypto.indexOf("export const CONTENT_CARRIERS"), crypto.indexOf("export type ContentCarrier")
    );
    expect(carriers).toContain('"serve.answer_story"');
  });
});
