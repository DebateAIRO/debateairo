import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PLAN_TIERS } from "@debateai/contract";
import * as modelConfig from "@debateai/model-config";
import { describe, expect, it } from "vitest";

describe("model configuration tier vocabulary", () => {
  it("matches the contract wire tier words", () => {
    expect([...(modelConfig.MODEL_CONFIG_TIERS ?? [])].sort()).toEqual(
      [...PLAN_TIERS].sort()
    );
  });

  it("does not import the contract into the file loader package", () => {
    const sourceDirectory = join(
      process.cwd(),
      "packages",
      "model-config",
      "src"
    );
    const source = readdirSync(sourceDirectory)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(join(sourceDirectory, name), "utf8"))
      .join("\n");

    expect(source).not.toContain("@debateai/contract");
  });
});
