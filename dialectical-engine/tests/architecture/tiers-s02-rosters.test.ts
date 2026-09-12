import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { PLAN_TIER_ROSTERS } from "@debateai/contract";

const PROJECT_ROOT = process.cwd();
const SOURCE_ROOTS = ["apps", "packages"] as const;
const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "generated",
  ".next"
]);
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx"
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return EXCLUDED_DIRECTORIES.has(entry.name)
          ? []
          : sourceFiles(absolutePath);
      }
      if (!entry.isFile()) return [];

      const projectPath = relative(PROJECT_ROOT, absolutePath).split(sep).join("/");
      return projectPath.includes(".test.") ||
        !SOURCE_EXTENSIONS.has(extname(entry.name))
        ? []
        : [absolutePath];
    });
}

function sourceLinesContaining(needle: string): string[] {
  return SOURCE_ROOTS.flatMap((sourceRoot) =>
    sourceFiles(join(PROJECT_ROOT, sourceRoot)).flatMap((absolutePath) => {
      const projectPath = relative(PROJECT_ROOT, absolutePath).split(sep).join("/");
      return readFileSync(absolutePath, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          line.includes(needle) ? [`${projectPath}:${index + 1}`] : []
        );
    })
  ).sort();
}

function tierBranchLines(): string[] {
  return SOURCE_ROOTS.flatMap((sourceRoot) =>
    sourceFiles(join(PROJECT_ROOT, sourceRoot)).flatMap((absolutePath) => {
      const projectPath = relative(PROJECT_ROOT, absolutePath).split(sep).join("/");
      if (projectPath === "packages/contract/src/plan-tiers.ts") return [];

      return readFileSync(absolutePath, "utf8").split("\n").flatMap((line, index) => {
        const namesBothTiers = line.includes("free") && line.includes("premium");
        const branches = line.includes("===") || /\bcase\s+/.test(line);
        return namesBothTiers && branches ? [`${projectPath}:${index + 1}`] : [];
      });
    })
  ).sort();
}

describe("S02 tier roster architecture", () => {
  it("keeps the exact ordered model roster for each plan tier", () => {
    expect(PLAN_TIER_ROSTERS.free).toEqual([
      "gpt-5.6-luna",
      "claude-sonnet-5"
    ]);
    expect(PLAN_TIER_ROSTERS.premium).toEqual([
      "gpt-5.6-sol",
      "claude-opus-5",
      "grok-4.6"
    ]);
  });

  it("keeps every roster model id in one canonical declaration", () => {
    const expectedOccurrences: Record<string, string[]> = {
      "gpt-5.6-luna": ["packages/contract/src/plan-tiers.ts:9"],
      "claude-sonnet-5": ["packages/contract/src/plan-tiers.ts:9"],
      "gpt-5.6-sol": [
        "apps/ui/components/landing/cards.ts:28",
        "packages/contract/src/plan-tiers.ts:10"
      ],
      "claude-opus-5": [
        "apps/ui/components/landing/cards.ts:27",
        "packages/contract/src/plan-tiers.ts:10"
      ],
      "grok-4.6": ["packages/contract/src/plan-tiers.ts:10"]
    };

    for (const [modelId, expectedLines] of Object.entries(expectedOccurrences)) {
      expect(sourceLinesContaining(modelId), modelId).toEqual(expectedLines);
    }
  });

  it("keeps plan-tier model selection out of if and case branches", () => {
    expect(tierBranchLines()).toEqual([]);
  });

  it("keeps at least two members in every tier roster", () => {
    for (const roster of Object.values(PLAN_TIER_ROSTERS)) {
      expect(roster.length).toBeGreaterThanOrEqual(2);
    }
  });
});
