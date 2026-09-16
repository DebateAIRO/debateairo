import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as modelConfig from "@debateai/model-config";
import { afterEach, describe, expect, it } from "vitest";

const VALID_CONFIG = `free:
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
    model: grok-4.6-build
`;

const temporaryRoots: string[] = [];

function fixtureRoot(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "debateai-model-shape-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "config"));
  writeFileSync(join(root, "config", "models.yaml"), contents, "utf8");
  return root;
}

type ShapeCode =
  | "MODEL_CONFIG_FILE_MALFORMED"
  | "MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN"
  | "MODEL_CONFIG_CLI_ABSENT"
  | "MODEL_CONFIG_KEY_NAME_INVALID"
  | "MODEL_CONFIG_TIER_ROSTER_INVALID"
  | "MODEL_CONFIG_BASE_URL_INVALID";

interface ShapeError extends Error {
  code: ShapeCode;
  classNumber: number;
  tier?: "free" | "premium";
  model?: string;
  detail: string;
}

type ShapeErrorConstructor = new (fields: {
  code: ShapeCode;
  classNumber: number;
  tier?: "free" | "premium";
  model?: string;
  detail: string;
}) => ShapeError;

interface LoadOptions {
  isCliInstalled?: (cli: "codex" | "claude" | "grok") => boolean;
}

function expectShapeError(
  contents: string,
  expected: {
    code: ShapeCode;
    classNumber: number;
    tier?: "free" | "premium";
    model?: string | undefined;
  },
  options: LoadOptions = {
    isCliInstalled: () => true
  }
): void {
  const ModelConfigShapeError =
    modelConfig.ModelConfigShapeError as ShapeErrorConstructor;
  const marker = new ModelConfigShapeError({
    code: expected.code,
    classNumber: expected.classNumber,
    ...(expected.tier === undefined ? {} : { tier: expected.tier }),
    ...(expected.model === undefined ? {} : { model: expected.model }),
    detail: "expected shape refusal"
  });
  const loadModelConfig = modelConfig.loadModelConfig as (
    repositoryRoot: string,
    options?: LoadOptions
  ) => unknown;

  let thrown: unknown;
  try {
    loadModelConfig(fixtureRoot(contents), options);
  } catch (error) {
    thrown = error;
  }

  expect(marker).toBeInstanceOf(ModelConfigShapeError);
  expect(thrown).toBeInstanceOf(ModelConfigShapeError);
  expect(thrown).toMatchObject(expected);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("model configuration shape classes", () => {
  it("class 1 refuses a third top-level key as a malformed file", () => {
    expectShapeError(`${VALID_CONFIG}enterprise: []\n`, {
      classNumber: 1,
      code: "MODEL_CONFIG_FILE_MALFORMED"
    });
  });

  it("class 2 refuses an unknown entry transport", () => {
    expectShapeError(VALID_CONFIG.replace("api: openai", "api: acme"), {
      classNumber: 2,
      code: "MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN"
    });
  });

  it("class 3 refuses a configured CLI that is absent", () => {
    expectShapeError(
      VALID_CONFIG,
      {
        classNumber: 3,
        code: "MODEL_CONFIG_CLI_ABSENT"
      },
      { isCliInstalled: () => false }
    );
  });

  it("loads the same CLI fleet through an injected installed verdict", () => {
    const loadModelConfig = modelConfig.loadModelConfig as (
      repositoryRoot: string,
      options: { isCliInstalled: () => boolean }
    ) => { premium: readonly unknown[] };

    const config = loadModelConfig(fixtureRoot(VALID_CONFIG), {
      isCliInstalled: () => true
    });
    const source = readFileSync(
      join(process.cwd(), "packages", "model-config", "src", "shape.ts"),
      "utf8"
    );

    expect(config.premium).toHaveLength(3);
    expect(source).toContain("process.env.PATH");
    expect(source).toContain("constants.X_OK");
  });

  it("class 4 refuses a malformed environment-variable name", () => {
    expectShapeError(VALID_CONFIG.replace("ZAI_API_KEY", "zai_api_key"), {
      classNumber: 4,
      code: "MODEL_CONFIG_KEY_NAME_INVALID"
    });
  });

  it("class 5 refuses a tier with fewer than two entries without naming a model", () => {
    // Property: an undersized tier has no individual repeated entry to name.
    // Break caught: attributing the aggregate roster failure to its sole entry.
    expectShapeError(
      VALID_CONFIG.replace(
        `  - api: zai
    model: glm-5.3-flash
    base_url: https://api.z.ai/api/coding/paas/v4
    key: ZAI_API_KEY
`,
        ""
      ),
      {
        classNumber: 5,
        code: "MODEL_CONFIG_TIER_ROSTER_INVALID",
        tier: "free",
        model: undefined
      }
    );
  });

  it("class 5 names the first repeated maker entry's model", () => {
    // Property: a repeated-maker refusal identifies the first entry whose maker was already seen.
    // Break caught: raising the aggregate class-5 error without the refused entry's model.
    expectShapeError(
      VALID_CONFIG.replace(
        `  - cli: grok
    model: grok-4.6-build
`,
        `  - cli: claude
    model: claude-sonnet-5
`
      ),
      {
        classNumber: 5,
        code: "MODEL_CONFIG_TIER_ROSTER_INVALID",
        tier: "premium",
        model: "claude-sonnet-5"
      }
    );
  });

  it("class 6 refuses a base URL with a query", () => {
    expectShapeError(
      VALID_CONFIG.replace(
        "https://api.openai.com/v1",
        "https://api.openai.com/v1?debug=true"
      ),
      {
        classNumber: 6,
        code: "MODEL_CONFIG_BASE_URL_INVALID"
      }
    );
  });

  it("exports exactly the union of the six shape codes", () => {
    expect(modelConfig.MODEL_CONFIG_SHAPE_CODES).toEqual([
      "MODEL_CONFIG_FILE_MALFORMED",
      "MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN",
      "MODEL_CONFIG_CLI_ABSENT",
      "MODEL_CONFIG_KEY_NAME_INVALID",
      "MODEL_CONFIG_TIER_ROSTER_INVALID",
      "MODEL_CONFIG_BASE_URL_INVALID"
    ]);
  });
});
