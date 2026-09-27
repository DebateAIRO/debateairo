import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), "utf8");
const defined = (sql: string): readonly string[] => [
  ...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_][a-z0-9_]*\.[a-z0-9_]+)\s*\(/gi)
].map((match) => match[1]!.toLowerCase());

// Model scorecard (migration 0072, ruling R8): 0063's carrier mechanism for
// ledger.call_prompt and the mirror of every new column and table, pinned as
// text so a borrowed function or a stale mirror cannot pass unseen.
describe("model scorecard migration 0072 — architecture contract", () => {
  it("owns exactly its two carrier functions and redefines no function another migration defines", async () => {
    const names = (await readdir(new URL("migrations/", root)))
      .filter((name) => /^\d+_model_scorecard\.sql$/.test(name));
    expect(names).toEqual(["0072_model_scorecard.sql"]);
    const migration = await read(`migrations/${names[0]}`);
    const definedHere = defined(migration);
    expect(definedHere).toEqual([
      "core.enforce_content_ciphertext_call_prompt",
      "core.enforce_content_attestation_v2_call_prompt"
    ]);
    for (const other of (await readdir(new URL("migrations/", root)))
      .filter((name) => name.endsWith(".sql") && name !== names[0])) {
      for (const owned of defined(await read(`migrations/${other}`))) {
        expect({ migration: other, function: owned, alsoDefinedBy0072: definedHere.includes(owned) })
          .toEqual({ migration: other, function: owned, alsoDefinedBy0072: false });
      }
    }
  });

  it("installs the three carrier triggers on ledger.call_prompt and both append-only guards", async () => {
    const migration = await read("migrations/0072_model_scorecard.sql");
    for (const [trigger, fn] of [
      ["aaa_enforce_content_attestation_v2", "core.enforce_content_attestation_v2_call_prompt()"],
      ["enforce_content_ciphertext", "core.enforce_content_ciphertext_call_prompt()"],
      ["enforce_erasure_barrier", "core.enforce_erasure_barrier()"]
    ] as const) {
      expect(migration).toContain(
        `CREATE TRIGGER ${trigger}\nBEFORE INSERT ON ledger.call_prompt\nFOR EACH ROW EXECUTE FUNCTION ${fn};`
      );
    }
    for (const table of ["ledger.call_prompt", "core.run_role_assignment"]) {
      expect(migration).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(migration).toContain(
        `CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table}\n  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();`
      );
    }
  });

  it("holds thinking_level to the scorecard's own token rule, character for character (Task A2 review)", async () => {
    // One rule in every place a level is checked: a VALID scorecard never names a
    // level the ledger would refuse, and the ledger accepts nothing the scorecard could not name.
    const schema = await read("packages/scorecard/src/schema.ts");
    const scorecardRule = /thinkingLevel: z\.string\(\)\.regex\(\/(.+?)\/u\)/u.exec(schema)?.[1];
    expect(scorecardRule).toBe("^(?:[a-z][a-z0-9_-]{0,31}|DEFAULT_ONLY)$");
    const migration = await read("migrations/0072_model_scorecard.sql");
    expect(migration).toContain(`CHECK (thinking_level IS NULL OR thinking_level ~ '${scorecardRule}')`);
  });

  it("holds THINKING_LEVEL_TOKEN (packages/providers) to the scorecard's rule minus DEFAULT_ONLY (Task A7a)", async () => {
    // A target's declared levels are real level names, never DEFAULT_ONLY (that
    // token means "no level can be set", not a level itself), so the providers'
    // token rule is the scorecard's rule with the DEFAULT_ONLY alternative removed
    // — not a second, independently-drifting pattern.
    const schema = await read("packages/scorecard/src/schema.ts");
    const scorecardRule = /thinkingLevel: z\.string\(\)\.regex\(\/(.+?)\/u\)/u.exec(schema)?.[1];
    expect(scorecardRule).toBe("^(?:[a-z][a-z0-9_-]{0,31}|DEFAULT_ONLY)$");
    const providers = await read("packages/providers/src/index.ts");
    const providersRule = /THINKING_LEVEL_TOKEN = \/(.+?)\/u;/u.exec(providers)?.[1];
    expect(providersRule).toBe("^[a-z][a-z0-9_-]{0,31}$");
    expect(scorecardRule).toBe(`^(?:${providersRule!.slice(1, -1)}|DEFAULT_ONLY)$`);
  });

  it("holds candidate_id to the scorecard's identifierText, character for character (fix round 1)", async () => {
    // A VALID scorecard never names a candidate the ledger would refuse, and the ledger
    // records no id a scorecard could not name.
    const schema = await read("packages/scorecard/src/schema.ts");
    const scorecardRule = /const identifierText = z\.string\(\)\.regex\(\/(.+?)\/u\);/u.exec(schema)?.[1];
    expect(scorecardRule).toBe("^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$");
    const migration = await read("migrations/0072_model_scorecard.sql");
    expect(migration).toContain(`CHECK (candidate_id IS NULL OR candidate_id ~ '${scorecardRule}')`);
    expect(migration).not.toContain("CANDIDATE_ID_TOKEN");
  });

  it("mirrors every new column and table in schema.ts and declares the carrier to the cipher", async () => {
    const schema = await read("packages/db/src/schema.ts");
    const block = (declaration: string): string => {
      const start = schema.indexOf(declaration);
      expect(start, declaration).toBeGreaterThanOrEqual(0);
      return schema.slice(start, schema.indexOf("});", start));
    };
    const ledgerEntry = block('export const ledgerEntry = ledger.table("ledger_entry", {');
    for (const column of [
      'modelRole: text("model_role"),',
      'candidateId: text("candidate_id"),',
      'scorecardVersion: integer("scorecard_version"),',
      'thinkingLevel: text("thinking_level")'
    ]) expect(ledgerEntry).toContain(column);
    expect(block('export const rawArtifact = ledger.table("raw_artifact", {'))
      .toContain('thinkingTokens: integer("thinking_tokens")');
    const callPrompt = block('export const callPrompt = ledger.table("call_prompt", {');
    for (const column of [
      'promptFingerprint: text("prompt_fingerprint"),',
      'promptText: text("prompt_text").notNull(),',
      'contentCiphertext: jsonb("content_ciphertext"),',
      'contentAttestation: bytea("content_attestation"),'
    ]) expect(callPrompt).toContain(column);
    expect(block('export const runRoleAssignment = core.table("run_role_assignment", {'))
      .toContain('steppedDown: boolean("stepped_down").notNull(),');
    const crypto = await read("packages/crypto/src/index.ts");
    expect(crypto.slice(
      crypto.indexOf("export const CONTENT_CARRIERS"), crypto.indexOf("export type ContentCarrier")
    )).toContain('"ledger.call_prompt"');
  });
});
