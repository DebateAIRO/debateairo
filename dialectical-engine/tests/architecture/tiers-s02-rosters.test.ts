import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { loadModelConfig } from "@debateai/model-config";

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
        // `.next-dev` / `.next-build` are the dev server's own output trees, gitignored
        // like `.next`; they mirror every roster id compiled into a page and would count
        // as a second declaration of it.
        return EXCLUDED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".next")
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

function sourceFilesContaining(modelId: string): string[] {
  const needle = JSON.stringify(modelId);
  return SOURCE_ROOTS.flatMap((sourceRoot) =>
    sourceFiles(join(PROJECT_ROOT, sourceRoot)).flatMap((absolutePath) => {
      const projectPath = relative(PROJECT_ROOT, absolutePath).split(sep).join("/");
      return readFileSync(absolutePath, "utf8").includes(needle)
        ? [projectPath]
        : [];
    })
  ).sort();
}

function sourceOccurrencesContaining(modelId: string): Readonly<Record<string, number>> {
  const needle = JSON.stringify(modelId);
  return Object.fromEntries(SOURCE_ROOTS.flatMap((sourceRoot) =>
    sourceFiles(join(PROJECT_ROOT, sourceRoot)).flatMap((absolutePath) => {
      const source = readFileSync(absolutePath, "utf8");
      const count = source.split(needle).length - 1;
      const projectPath = relative(PROJECT_ROOT, absolutePath).split(sep).join("/");
      return count === 0 ? [] : [[projectPath, count] as const];
    })
  ).sort(([left], [right]) => left.localeCompare(right)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rosterSelectors(source: string): readonly string[] {
  const selectors = ["PLAN_TIER_ROSTERS"];
  const localRosterBinding = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*PLAN_TIER_ROSTERS\s*(?:\.|\[)/g;
  for (const match of source.matchAll(localRosterBinding)) selectors.push(match[1]!);
  return [...new Set(selectors)];
}

function selectsRoster(source: string, selectors: readonly string[]): boolean {
  return selectors.some((selector) => new RegExp(
    `(?:^|[^A-Za-z0-9_$])${escapeRegExp(selector)}(?:$|[^A-Za-z0-9_$])`
  ).test(source));
}

function closingDelimiter(
  source: string,
  openingIndex: number,
  opening: "(" | "{",
  closing: ")" | "}"
): number {
  let depth = 0;
  let quote: '"' | "'" | "`" | undefined;

  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index]!;
    const next = source[index + 1];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "/" && next === "/") {
      index = source.indexOf("\n", index + 2);
      if (index === -1) return source.length;
      continue;
    }
    if (character === "/" && next === "*") {
      index = source.indexOf("*/", index + 2);
      if (index === -1) return source.length;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return source.length;
}

function skipTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index]!)) {
      index += 1;
    } else if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
    } else if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
    } else {
      break;
    }
  }
  return index;
}

function branchBody(source: string, start: number): { body: string; end: number } {
  const bodyStart = skipTrivia(source, start);
  if (source[bodyStart] === "{") {
    const end = closingDelimiter(source, bodyStart, "{", "}");
    return { body: source.slice(bodyStart + 1, end), end: end + 1 };
  }

  const end = source.indexOf(";", bodyStart);
  const statementEnd = end === -1 ? source.length : end + 1;
  return { body: source.slice(bodyStart, statementEnd), end: statementEnd };
}

function tierBranchLines(): string[] {
  return SOURCE_ROOTS.flatMap((sourceRoot) =>
    sourceFiles(join(PROJECT_ROOT, sourceRoot)).flatMap((absolutePath) => {
      const projectPath = relative(PROJECT_ROOT, absolutePath).split(sep).join("/");
      if (projectPath === "packages/contract/src/plan-tiers.ts") return [];

      const source = readFileSync(absolutePath, "utf8");
      const selectors = rosterSelectors(source);
      const hits: string[] = [];
      const location = (index: number) =>
        `${projectPath}:${source.slice(0, index).split("\n").length}`;
      const controlFlow = /\b(if|switch)\s*\(/g;
      for (const match of source.matchAll(controlFlow)) {
        const opening = source.indexOf("(", match.index);
        const closing = closingDelimiter(source, opening, "(", ")");
        const condition = source.slice(opening + 1, closing);
        if (!/\b(?:plan_tier|planTier)\b/.test(condition)) continue;

        const consequent = branchBody(source, closing + 1);
        let selectedBody = consequent.body;
        if (match[1] === "if") {
          const afterConsequent = skipTrivia(source, consequent.end);
          if (source.startsWith("else", afterConsequent)) {
            selectedBody += branchBody(source, afterConsequent + 4).body;
          }
        }
        const branchSelectsRoster = selectsRoster(selectedBody, selectors);
        const selectsTierCase = match[1] !== "switch" ||
          /\bcase\s+(?:"(?:free|premium)"|'(?:free|premium)')\s*:/.test(selectedBody);
        if (branchSelectsRoster && selectsTierCase) hits.push(location(match.index));
      }

      const tierTernary = /\b(?:plan_tier|planTier)\b[^;?]*\?[^;]*;/gs;
      for (const match of source.matchAll(tierTernary)) {
        if (selectsRoster(match[0], selectors)) hits.push(location(match.index));
      }
      return [...new Set(hits)];
    })
  ).sort();
}

function rosterSelectingFiles(): string[] {
  return SOURCE_ROOTS.flatMap((sourceRoot) =>
    sourceFiles(join(PROJECT_ROOT, sourceRoot)).flatMap((absolutePath) => {
      const source = readFileSync(absolutePath, "utf8");
      const projectPath = relative(PROJECT_ROOT, absolutePath).split(sep).join("/");
      if (projectPath === "packages/contract/src/plan-tiers.ts") {
        return [];
      }
      if (!selectsRoster(source, rosterSelectors(source))) {
        return [];
      }

      return [projectPath];
    })
  ).sort();
}

describe("S02 tier roster architecture", () => {
  it("keeps the exact ordered model roster for each plan tier", () => {
    expect(PLAN_TIER_ROSTERS.free).toEqual([
      "gpt-5.6-luna",
      "glm-5.3-flash"
    ]);
    expect(PLAN_TIER_ROSTERS.premium).toEqual([
      "gpt-5.6-sol",
      "claude-opus-5",
      "grok-4.7-build"
    ]);
  });

  it("keeps every roster model id in one canonical declaration", () => {
    const expectedFiles: Record<string, string[]> = {
      "gpt-5.6-luna": [],
      "glm-5.3-flash": [],
      "gpt-5.6-sol": [],
      "claude-opus-5": [],
      "grok-4.7-build": [],
      "claude-sonnet-5": []
    };

    for (const [modelId, expectedPaths] of Object.entries(expectedFiles)) {
      expect(sourceFilesContaining(modelId), modelId).toEqual(expectedPaths);
      expect(sourceOccurrencesContaining(modelId), modelId).toEqual(Object.fromEntries(
        expectedPaths.map((expectedPath) => [expectedPath, 1])
      ));
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

  it("keeps generated rosters equal to the configured file order", () => {
    const config = loadModelConfig(PROJECT_ROOT, {
      isCliInstalled: () => true
    });

    expect(config.free.map((entry) => entry.model)).toEqual(
      PLAN_TIER_ROSTERS.free
    );
    expect(config.premium.map((entry) => entry.model)).toEqual(
      PLAN_TIER_ROSTERS.premium
    );
  });

  it("keeps plan-tier roster selection in server production files only", () => {
    const selectingFiles = rosterSelectingFiles();
    expect.soft(selectingFiles).toEqual([
      "apps/api/src/index.ts",
      "apps/runner/src/dev-deployment-register.ts"
    ]);
    expect(selectingFiles.filter((file) => file.startsWith("apps/ui/"))).toEqual([]);
  });
});
