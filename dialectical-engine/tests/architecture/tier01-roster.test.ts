import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as contract from "@debateai/contract";
import { describe, expect, it } from "vitest";

const MODEL_IDS = [
  "gpt-5.6-luna",
  "glm-5.3-flash",
  "gpt-5.6-sol",
  "claude-opus-5",
  "grok-4.7-build"
] as const;

function productionFiles(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages"],
    { encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((file) => !file.includes("/node_modules/"))
    .filter((file) => !file.startsWith("packages/contract/generated/"))
    .filter((file) => !/\.test\.[^/]+$/.test(file));
}

describe("R11 plan-tier roster architecture", () => {
  it("R11 declares each tier's ordered roster exactly once in the repo", () => {
    const rosters = (contract as Record<string, unknown>).PLAN_TIER_ROSTERS as
      | { free: readonly string[]; premium: readonly string[] }
      | undefined;

    expect(
      rosters,
      "PLAN_TIER_ROSTERS is not exported from @debateai/contract"
    ).toBeDefined();
    expect(rosters!.free).toEqual(["gpt-5.6-luna", "glm-5.3-flash"]);
    expect(rosters!.premium).toEqual(["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build"]);

    const files = productionFiles();
    for (const modelId of MODEL_IDS) {
      const quotedExact = JSON.stringify(modelId);
      const declarations = files.filter((file) =>
        readFileSync(resolve(file), "utf8").includes(quotedExact)
      );
      expect(declarations, `${modelId} quoted-exact declarations`).toEqual([]);
    }

    const retiredDeclarations = files.filter((file) =>
      readFileSync(resolve(file), "utf8").includes(JSON.stringify("claude-sonnet-5"))
    );
    expect(retiredDeclarations, "claude-sonnet-5 quoted-exact declarations").toEqual([]);

    const contractSource = readFileSync(resolve("packages/contract/src/index.ts"), "utf8");
    const askSchema = contractSource.indexOf("export const AskRequestSchema");
    const askTypes = [...contractSource.matchAll(/^export type AskRequest =/gm)].map(
      (match) => match.index
    );
    expect(askSchema).toBeGreaterThanOrEqual(0);
    expect(askTypes).toHaveLength(1);
    expect(askTypes[0]).toBeGreaterThan(askSchema);
  });

  it("generates plan-tier rosters before importing the contract generator", () => {
    const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const generateContract = manifest.scripts["generate:contract"] ?? "";
    const rosterGenerator = generateContract.indexOf(
      "packages/model-config/src/generate-plan-tier-rosters.ts"
    );
    const contractGenerator = generateContract.indexOf(
      "packages/contract/src/generate.ts"
    );

    expect(rosterGenerator).toBeGreaterThanOrEqual(0);
    expect(contractGenerator).toBeGreaterThan(rosterGenerator);
  });
});
