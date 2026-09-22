import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import * as modelConfig from "@debateai/model-config";
import { afterEach, describe, expect, it } from "vitest";

const MODEL_CONFIG = `free:
  - api: openai
    model: gpt-5.6-luna
    base_url: https://api.openai.com/v1
    key: OPENAI_API_KEY
  - api: zai
    model: glm-5.3-flash
    base_url: https://api.z.ai/api/coding/paas/v4
    key: ZAI_API_KEY

premium:
  - cli: codex
    model: gpt-5.6-sol
  - cli: claude
    model: claude-opus-5
  - cli: grok
    model: grok-4.7-build
`;

const temporaryRoots: string[] = [];

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fixtureRoot(contents = MODEL_CONFIG): string {
  const root = mkdtempSync(join(tmpdir(), "debateai-model-config-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "config"));
  writeFileSync(join(root, "config", "models.yaml"), contents, "utf8");
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("model configuration file", () => {
  it("parses the exact five-entry fleet without dropping API fields", () => {
    expect(typeof modelConfig.loadModelConfig).toBe("function");

    const loadModelConfig = modelConfig.loadModelConfig as unknown as (
      repositoryRoot: string,
      options?: { isCliInstalled?: () => boolean }
    ) => {
      free: Array<Record<string, unknown>>;
      premium: Array<Record<string, unknown>>;
    };
    const config = loadModelConfig(fixtureRoot(), { isCliInstalled: () => true });

    expect(config.free).toHaveLength(2);
    expect(config.premium).toHaveLength(3);
    expect(config.free[0]).toMatchObject({
      transport: "api",
      keyVariable: "OPENAI_API_KEY"
    });
    expect(config.free[1]).toMatchObject({
      transport: "api",
      baseUrl: "https://api.z.ai/api/coding/paas/v4"
    });
    expect(config.premium[2]).toMatchObject({
      transport: "cli",
      model: "grok-4.7-build"
    });
  });

  it("leaves the configuration bytes and modification time unchanged", () => {
    const root = fixtureRoot();
    const path = join(root, "config", "models.yaml");
    const digestBefore = sha256(path);
    const mtimeBefore = statSync(path).mtimeMs;
    const loadModelConfig = modelConfig.loadModelConfig as (
      repositoryRoot: string,
      options?: { isCliInstalled?: () => boolean }
    ) => unknown;

    loadModelConfig(root, { isCliInstalled: () => true });
    loadModelConfig(root, { isCliInstalled: () => true });

    expect(sha256(path)).toBe(digestBefore);
    expect(statSync(path).mtimeMs).toBe(mtimeBefore);
  });

  it("keeps write primitives out of the loader source", () => {
    const source = readFileSync(
      join(process.cwd(), "packages", "model-config", "src", "load.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/(?:appendFile|rename|writeFile)(?:Sync)?\s*\(/u);
  });

  it("generates the exact default-parsed plan tier rosters", async () => {
    const generatorPath = join(
      process.cwd(),
      "packages",
      "model-config",
      "src",
      "generate-plan-tier-rosters.ts"
    );
    expect(existsSync(generatorPath)).toBe(true);

    const generator = (await import(pathToFileURL(generatorPath).href)) as {
      generatePlanTierRosters(options: {
        repositoryRoot: string;
        outputPath: string;
        isCliInstalled: () => boolean;
      }): void;
    };
    const root = fixtureRoot();
    const outputPath = join(root, "generated", "plan-tier-rosters.ts");
    generator.generatePlanTierRosters({
      repositoryRoot: root,
      outputPath,
      isCliInstalled: () => true
    });

    const generated = (await import(
      `${pathToFileURL(outputPath).href}?generated=${Date.now()}`
    )) as {
      GENERATED_PLAN_TIER_ROSTERS: unknown;
    };
    expect(generated.GENERATED_PLAN_TIER_ROSTERS).toEqual({
      free: ["gpt-5.6-luna", "glm-5.3-flash"],
      premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build"]
    });
  });

  it("keeps the committed fleet and V's edit comments exact", () => {
    const source = readFileSync(
      join(process.cwd(), "config", "models.yaml"),
      "utf8"
    );
    const config = modelConfig.loadModelConfig(process.cwd(), {
      isCliInstalled: () => true
    });

    expect(config.free.map((entry) => entry.model)).toEqual([
      "gpt-5.6-luna",
      "glm-5.3-flash"
    ]);
    expect(config.premium.map((entry) => entry.model)).toEqual([
      "gpt-5.6-sol",
      "claude-opus-5",
      "grok-4.7-build"
    ]);
    expect(source.match(/claude-sonnet-5/gu) ?? []).toHaveLength(0);
    expect(source.match(/grok-4\.6-build/gu) ?? []).toHaveLength(0);
    expect(source).toContain("# config/models.yaml");
    expect(source).toContain("# Which models debate in each tier.");
    expect(source).toContain("# Edit, then restart the stack.");
    expect(source).toMatch(/^# CLIs:.*codex.*api:/mu);
    expect(source).toContain(`# Put Grok in Free too:
#   add under free:
#   - cli: grok
#     model: grok-4.7-build`);
  });
});
