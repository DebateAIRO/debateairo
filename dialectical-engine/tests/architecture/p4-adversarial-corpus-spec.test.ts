import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const corpusPath = fileURLToPath(new URL(
  "../../docs/missions/2026-08-17-accounts-privacy-security/P4-12-adversarial-relay-corpus.json",
  import.meta.url
));

interface CorpusCase {
  readonly id: string;
  readonly category: string;
  readonly executionTarget: string;
  readonly expected: Readonly<Record<string, unknown>>;
  readonly oracles: readonly string[];
  readonly mutationControls: readonly string[];
  readonly inputDesign?: Readonly<Record<string, unknown>>;
}

interface CorpusSpec {
  readonly format: string;
  readonly executionPolicy: {
    readonly allowed: readonly string[];
    readonly forbidden: readonly string[];
  };
  readonly requiredEvidence: readonly string[];
  readonly cases: readonly CorpusCase[];
  readonly mutations: readonly { readonly id: string; readonly killedBy: readonly string[] }[];
}

describe("P4-12 adversarial relay corpus specification", () => {
  it("is versioned, complete, local-only, and mutation-backed", async () => {
    const spec = JSON.parse(await readFile(corpusPath, "utf8")) as CorpusSpec;

    expect(spec.format).toBe("debateai.adversarial-relay-corpus.v1");
    expect(spec.executionPolicy.allowed).toEqual([
      "REPOSITORY_FAKE_CLI",
      "EPHEMERAL_LOOPBACK_RELAY",
      "IN_MEMORY_SPIES"
    ]);
    expect(spec.executionPolicy.forbidden).toEqual([
      "EXTERNAL_VENDOR_CLI",
      "NON_LOOPBACK_NETWORK",
      "DATABASE_CONNECTION",
      "REAL_SECRET",
      "PERSISTENT_USER_DATA"
    ]);

    const requiredCategories = [
      "ROLE_FORGERY",
      "DELIMITER_CONFUSION",
      "CONTROL_BYTES",
      "OVERSIZE",
      "SECRET_EXFILTRATION",
      "DATABASE_CAPABILITY",
      "FILESYSTEM_CAPABILITY",
      "CROSS_REQUEST_STATE",
      "CLAUDE_ARGV_TRICK",
      "GROK_ARGV_TRICK"
    ];
    expect(new Set(spec.cases.map((entry) => entry.id)).size).toBe(spec.cases.length);
    expect(spec.cases.map((entry) => entry.category).sort()).toEqual(requiredCategories.sort());
    expect(spec.cases.every((entry) => entry.executionTarget === "LOCAL_FAKE_RELAY_ONLY")).toBe(true);
    expect(spec.cases.every((entry) => entry.oracles.length > 0)).toBe(true);
    expect(spec.cases.every((entry) => entry.mutationControls.length > 0)).toBe(true);

    const sizeCase = spec.cases.find((entry) => entry.id === "SIZE-01");
    expect(sizeCase?.inputDesign?.multibyteUtf8Boundary).toEqual({
      unit: "é",
      repeats: 32_768,
      suffixes: ["", "a"],
      utf8Bytes: [65_536, 65_537],
      utf16CodeUnits: [32_768, 32_769]
    });
    expect(sizeCase?.mutationControls).toContain("MUT-CODE-UNIT-SIZE");

    const mutationIds = new Set(spec.mutations.map((entry) => entry.id));
    for (const entry of spec.cases) {
      expect(entry.mutationControls.every((id) => mutationIds.has(id))).toBe(true);
    }
    expect(spec.mutations.every((mutation) => mutation.killedBy.length > 0)).toBe(true);
    expect(spec.requiredEvidence).toEqual(expect.arrayContaining([
      "EXACT_REQUEST_AND_RESPONSE",
      "CHILD_SPAWN_COUNT",
      "EXACT_CHILD_ARGV",
      "EXACT_CHILD_ENVIRONMENT",
      "SCRATCH_CUSTODY",
      "DATABASE_SPY_CALL_COUNT",
      "FILESYSTEM_SENTINEL_STATE",
      "CROSS_REQUEST_CANARY_STATE",
      "MUTATION_RED_AND_RESTORED_GREEN"
    ]));
  });
});
