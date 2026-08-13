import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "app", "new", "page.tsx");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(pagePath, "utf8");

assert(
  /type AdaptiveDepthMode = "fixed" \| "manual" \| "recommended" \| "adaptive";/.test(source),
  "New debate page should define the AdaptiveDepthMode UI-state union"
);
assert(
  /useState<AdaptiveDepthMode>\("fixed"\)/.test(source),
  "New debate page should keep depth mode in local UI state with fixed as the default"
);
assert(
  source.includes('id="depthMode"') && source.includes('value={depthMode}'),
  "New debate page should render a controlled depth mode option selector"
);

for (const mode of ["fixed", "manual", "recommended", "adaptive"]) {
  assert(
    source.includes(`value: "${mode}"`) || source.includes(`value="${mode}"`),
    `New debate page should expose the ${mode} depth mode option`
  );
}

const configBlock = source.match(/const config: Record<string, unknown> = \{[\s\S]*?\n      \};/);
assert(configBlock, "New debate page should still build the existing submit config object");
assert(
  !/depth.?mode|adaptive.?depth/i.test(configBlock[0]),
  "Depth mode must remain UI-only and not be sent in debate creation config yet"
);
