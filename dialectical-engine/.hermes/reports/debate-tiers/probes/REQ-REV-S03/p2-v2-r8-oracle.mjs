// REQ-REV-S03 probe 2 — does SPEC(S03) R8 hold for `glm-5.3-flash`?
// Re-implements the two matchers the suites R27 names actually use, over the LANE:
//   A) tests/architecture/tiers-s02-rosters.test.ts  -> sourceFilesContaining(): BARE substring
//   B) tests/architecture/tier01-roster.test.ts      -> JSON.stringify(id): QUOTED-EXACT substring
// Read-only. No stack, no provider.
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine";
const ROOTS = ["apps", "packages"];
const EXCLUDED = new Set(["node_modules", "dist", "generated", ".next"]);
const EXT = new Set([".cjs",".cts",".js",".json",".jsx",".mjs",".mts",".ts",".tsx"]);

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).sort((l, r) => l.name.localeCompare(r.name)).flatMap((e) => {
    const abs = join(dir, e.name);
    if (e.isDirectory()) return EXCLUDED.has(e.name) || e.name.startsWith(".next") ? [] : sourceFiles(abs);
    if (!e.isFile()) return [];
    const p = relative(ROOT, abs).split(sep).join("/");
    return p.includes(".test.") || !EXT.has(extname(e.name)) ? [] : [abs];
  });
}
const files = ROOTS.flatMap((r) => sourceFiles(join(ROOT, r)));
const IDS = ["gpt-5.6-luna","glm-5.3-flash","glm-5.3","gpt-5.6-sol","claude-opus-5","grok-4.6-build","claude-sonnet-5"];
for (const id of IDS) {
  const bare = [], quoted = [];
  for (const abs of files) {
    const src = readFileSync(abs, "utf8");
    const p = relative(ROOT, abs).split(sep).join("/");
    const n = src.split(id).length - 1;
    if (n > 0) bare.push(`${p} x${n}`);
    if (src.includes(JSON.stringify(id))) quoted.push(p);
  }
  console.log(`\n### ${id}`);
  console.log(`  A) bare-substring (tiers-s02-rosters matcher): ${bare.length === 0 ? "(none)" : ""}`);
  for (const b of bare) console.log(`       ${b}`);
  console.log(`  B) quoted-exact  (tier01-roster matcher):      ${quoted.length === 0 ? "(none)" : ""}`);
  for (const q of quoted) console.log(`       ${q}`);
}
console.log(`\nfiles scanned: ${files.length}`);
