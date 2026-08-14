import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const apiPath = join(root, "lib", "api.ts");
const modelsPath = join(root, "lib", "models.ts");
const debatePagePath = join(root, "app", "debate", "[id]", "DebatePageClient.tsx");

test("frontend correctness helpers keep local labels, SSR token storage, and scoring-by-default wiring safe", () => {
  const apiSource = readFileSync(apiPath, "utf8");
  const modelsSource = readFileSync(modelsPath, "utf8");
  const debatePageSource = readFileSync(debatePagePath, "utf8");

  assert.match(
    modelsSource,
    /const name = key === "qwen" \|\| isLocal \? `\$\{base\}\u00b7local` : base;[\s\S]*?return \{ key, name, dot \};/,
    "modelMeta should return the computed local display name instead of discarding it"
  );

  assert.match(
    apiSource,
    /export function setStoredToken\(token: string\): void \{\s*if \(typeof window === "undefined"\) return;\s*window\.localStorage\.setItem\("dialectical:userToken", token\);\s*\}/,
    "setStoredToken should no-op during SSR before touching window.localStorage"
  );

  assert.match(
    debatePageSource,
    /const scoringVisibility = useMemo\([\s\S]*?formatScoringVisibilityState\(\{\s*enabled: true,\s*hasActionToken: Boolean\(actionToken\),\s*scoringStatus: scoringState\.status,\s*refreshStatus: scoringRefreshState\.status,\s*response: scoringState\.data,\s*error: scoringRefreshState\.error \|\| scoringState\.error\s*\}\),\s*\[actionToken, scoringRefreshState\.error, scoringRefreshState\.status, scoringState\]/,
    "scoring visibility should stay enabled by default and update from persisted scoring and refresh state"
  );
});
