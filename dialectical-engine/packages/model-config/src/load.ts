import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";

import {
  ModelConfigShapeError,
  validateModelConfig,
  type ModelConfig,
  type ModelConfigLoadOptions
} from "./shape.js";

export function loadModelConfig(
  repositoryRoot = process.cwd(),
  options: ModelConfigLoadOptions = {}
): ModelConfig {
  const source = readFileSync(
    join(repositoryRoot, "config", "models.yaml"),
    "utf8"
  );
  let parsed: unknown;
  try {
    parsed = parse(source);
  } catch {
    throw new ModelConfigShapeError({
      code: "MODEL_CONFIG_FILE_MALFORMED",
      classNumber: 1,
      detail: "models.yaml is not valid YAML"
    });
  }

  return validateModelConfig(parsed, options);
}
