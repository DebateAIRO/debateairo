import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export const MODEL_CONFIG_TIERS = ["free", "premium"] as const;

export type PlanTierWord = (typeof MODEL_CONFIG_TIERS)[number];
export type ModelConfigCli = "codex" | "claude" | "grok";
export type ModelConfigApi = "openai" | "zai";

export const MODEL_CONFIG_SHAPE_CODES = [
  "MODEL_CONFIG_FILE_MALFORMED",
  "MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN",
  "MODEL_CONFIG_CLI_ABSENT",
  "MODEL_CONFIG_KEY_NAME_INVALID",
  "MODEL_CONFIG_TIER_ROSTER_INVALID",
  "MODEL_CONFIG_BASE_URL_INVALID"
] as const;

export type ModelConfigShapeCode =
  (typeof MODEL_CONFIG_SHAPE_CODES)[number];

export type ModelConfigEntry =
  | {
      readonly transport: "cli";
      readonly tier: PlanTierWord;
      readonly cli: ModelConfigCli;
      readonly model: string;
    }
  | {
      readonly transport: "api";
      readonly tier: PlanTierWord;
      readonly api: ModelConfigApi;
      readonly model: string;
      readonly baseUrl: string;
      readonly keyVariable: string;
    };

export interface ModelConfig {
  readonly free: readonly ModelConfigEntry[];
  readonly premium: readonly ModelConfigEntry[];
}

export interface ModelConfigLoadOptions {
  readonly isCliInstalled?: (cli: ModelConfigCli) => boolean;
}

interface ShapeErrorFields {
  readonly code: ModelConfigShapeCode;
  readonly classNumber: number;
  readonly tier?: PlanTierWord;
  readonly model?: string;
  readonly detail: string;
}

export class ModelConfigShapeError extends Error {
  readonly code: ModelConfigShapeCode;
  readonly classNumber: number;
  readonly tier: PlanTierWord | undefined;
  readonly model: string | undefined;
  readonly detail: string;

  constructor(fields: ShapeErrorFields) {
    super(`${fields.code}: ${fields.detail}`);
    this.name = "ModelConfigShapeError";
    this.code = fields.code;
    this.classNumber = fields.classNumber;
    this.tier = fields.tier;
    this.model = fields.model;
    this.detail = fields.detail;
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === keys.length &&
    [...keys].sort().every((key, index) => actualKeys[index] === key)
  );
}

function shapeError(fields: ShapeErrorFields): never {
  throw new ModelConfigShapeError(fields);
}

function entryContext(
  entry: UnknownRecord,
  tier: PlanTierWord
): Pick<ShapeErrorFields, "tier" | "model"> {
  return {
    tier,
    ...(typeof entry.model === "string" ? { model: entry.model } : {})
  };
}

function validateEntryShape(
  value: unknown,
  tier: PlanTierWord
): UnknownRecord {
  if (!isRecord(value)) {
    return shapeError({
      code: "MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN",
      classNumber: 2,
      tier,
      detail: "each tier entry must be a mapping"
    });
  }

  const cliEntry =
    hasExactKeys(value, ["cli", "model"]) &&
    (value.cli === "codex" || value.cli === "claude" || value.cli === "grok") &&
    typeof value.model === "string" &&
    value.model.length > 0;
  const apiEntry =
    hasExactKeys(value, ["api", "model", "base_url", "key"]) &&
    (value.api === "openai" || value.api === "zai") &&
    typeof value.model === "string" &&
    value.model.length > 0 &&
    typeof value.base_url === "string" &&
    typeof value.key === "string";

  if (!cliEntry && !apiEntry) {
    return shapeError({
      code: "MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN",
      classNumber: 2,
      ...entryContext(value, tier),
      detail: "entry must use one known transport and its exact fields"
    });
  }

  return value;
}

function validateApiFields(entry: UnknownRecord, tier: PlanTierWord): void {
  if (!("api" in entry)) {
    return;
  }

  if (!/^[A-Z][A-Z0-9_]*$/u.test(entry.key as string)) {
    shapeError({
      code: "MODEL_CONFIG_KEY_NAME_INVALID",
      classNumber: 4,
      ...entryContext(entry, tier),
      detail: "key must name an uppercase environment variable"
    });
  }

  try {
    const url = new URL(entry.base_url as string);
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error("unsafe URL component");
    }
  } catch {
    shapeError({
      code: "MODEL_CONFIG_BASE_URL_INVALID",
      classNumber: 6,
      ...entryContext(entry, tier),
      detail: "base_url must be an HTTPS URL without credentials, query, or fragment"
    });
  }
}

function maker(entry: UnknownRecord): string {
  if ("api" in entry) {
    return entry.api as string;
  }

  if (entry.cli === "codex") {
    return "openai";
  }
  if (entry.cli === "claude") {
    return "anthropic";
  }
  return "xai";
}

function cliInstalledOnPath(cli: ModelConfigCli): boolean {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory.length === 0) {
      continue;
    }

    try {
      accessSync(join(directory, cli), constants.X_OK);
      return true;
    } catch {
      // Keep looking through PATH.
    }
  }

  return false;
}

function validateRoster(entries: UnknownRecord[], tier: PlanTierWord): void {
  const makers = entries.map(maker);
  if (entries.length < 2 || new Set(makers).size !== makers.length) {
    shapeError({
      code: "MODEL_CONFIG_TIER_ROSTER_INVALID",
      classNumber: 5,
      tier,
      detail: "each tier needs at least two entries from distinct makers"
    });
  }
}

function normalizeEntry(
  entry: UnknownRecord,
  tier: PlanTierWord
): ModelConfigEntry {
  if ("cli" in entry) {
    return Object.freeze({
      transport: "cli" as const,
      tier,
      cli: entry.cli as ModelConfigCli,
      model: entry.model as string
    });
  }

  return Object.freeze({
    transport: "api" as const,
    tier,
    api: entry.api as ModelConfigApi,
    model: entry.model as string,
    baseUrl: entry.base_url as string,
    keyVariable: entry.key as string
  });
}

export function validateModelConfig(
  value: unknown,
  options: ModelConfigLoadOptions = {}
): ModelConfig {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, MODEL_CONFIG_TIERS) ||
    !Array.isArray(value.free) ||
    !Array.isArray(value.premium)
  ) {
    return shapeError({
      code: "MODEL_CONFIG_FILE_MALFORMED",
      classNumber: 1,
      detail: "top level must contain only free and premium arrays"
    });
  }

  const shaped = Object.fromEntries(
    MODEL_CONFIG_TIERS.map((tier) => [
      tier,
      (value[tier] as unknown[]).map((entry) => validateEntryShape(entry, tier))
    ])
  ) as Record<PlanTierWord, UnknownRecord[]>;

  for (const tier of MODEL_CONFIG_TIERS) {
    for (const entry of shaped[tier]) {
      validateApiFields(entry, tier);
    }
  }

  for (const tier of MODEL_CONFIG_TIERS) {
    validateRoster(shaped[tier], tier);
  }

  const isCliInstalled = options.isCliInstalled ?? cliInstalledOnPath;
  for (const tier of MODEL_CONFIG_TIERS) {
    for (const entry of shaped[tier]) {
      if ("cli" in entry && !isCliInstalled(entry.cli as ModelConfigCli)) {
        shapeError({
          code: "MODEL_CONFIG_CLI_ABSENT",
          classNumber: 3,
          ...entryContext(entry, tier),
          detail: `configured CLI ${entry.cli as string} is not installed`
        });
      }
    }
  }

  return Object.freeze({
    free: Object.freeze(shaped.free.map((entry) => normalizeEntry(entry, "free"))),
    premium: Object.freeze(
      shaped.premium.map((entry) => normalizeEntry(entry, "premium"))
    )
  });
}
