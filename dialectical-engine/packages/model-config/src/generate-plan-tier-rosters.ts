import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadModelConfig,
  type ModelConfigCli
} from "@debateai/model-config";

interface GeneratePlanTierRostersOptions {
  readonly repositoryRoot?: string;
  readonly outputPath?: string;
  readonly isCliInstalled?: (cli: ModelConfigCli) => boolean;
}

export function generatePlanTierRosters(
  options: GeneratePlanTierRostersOptions = {}
): void {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const outputPath = resolve(
    options.outputPath ??
      join(
        repositoryRoot,
        "packages",
        "contract",
        "generated",
        "plan-tier-rosters.ts"
      )
  );
  const config = loadModelConfig(repositoryRoot, {
    ...(options.isCliInstalled
      ? { isCliInstalled: options.isCliInstalled }
      : {})
  });
  const free = config.free.map((entry) => entry.model);
  const premium = config.premium.map((entry) => entry.model);
  const source = `export const GENERATED_PLAN_TIER_ROSTERS = Object.freeze({
  free: Object.freeze(${JSON.stringify(free)}),
  premium: Object.freeze(${JSON.stringify(premium)})
});
`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, source, "utf8");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  generatePlanTierRosters({
    ...(process.argv[2] ? { repositoryRoot: process.argv[2] } : {}),
    ...(process.argv[3] ? { outputPath: process.argv[3] } : {})
  });
}
