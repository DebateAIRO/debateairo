import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const debatePagePath = path.join(root, "app", "debate", "[id]", "DebatePageClient.tsx");
const typesPath = path.join(root, "lib", "types.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const debatePageSource = fs.readFileSync(debatePagePath, "utf8");
const typesSource = fs.readFileSync(typesPath, "utf8");

assert(/type DebateScoringResponse = \{[\s\S]*model_metadata\?: ScoringModelMetadata \| null/.test(typesSource));
assert(/type DebateScoringResponse = \{[\s\S]*cache\?: ScoringCacheMetadata \| null/.test(typesSource));

assert(
  /const \[scoringDiagnosticsOpen, setScoringDiagnosticsOpen\] = useState\(false\)/.test(debatePageSource),
  "DebatePageClient should keep the diagnostics drawer hidden until opened"
);
assert(
  /aria-label="Open scoring diagnostics"[\s\S]*onClick=\{\(\) => setScoringDiagnosticsOpen\(true\)\}/.test(debatePageSource),
  "DebatePageClient should expose a compact scoring diagnostics opener"
);
assert(
  /function ScoringDiagnosticsDrawer/.test(debatePageSource),
  "DebatePageClient should render a focused scoring diagnostics drawer"
);
assert(
  /aria-label="Scoring diagnostics"/.test(debatePageSource) && /setScoringDiagnosticsOpen\(false\)/.test(debatePageSource),
  "Scoring diagnostics should be a closable drawer"
);
assert(
  /scoringState=\{scoringState\}/.test(debatePageSource) && /refreshState=\{scoringRefreshState\}/.test(debatePageSource),
  "Diagnostics drawer should receive the real scoring and refresh states"
);
assert(
  /data\?\.model_metadata\?\.provider/.test(debatePageSource) &&
    /data\?\.model_metadata\?\.model/.test(debatePageSource) &&
    /data\?\.cache\?\.hit/.test(debatePageSource),
  "Diagnostics drawer should display already-existing provider, model, and cache metadata"
);
assert(
  /Current claims/.test(debatePageSource) && /data\?\.node_ids\?\.length/.test(debatePageSource),
  "Diagnostics drawer should expose current node coverage even when judge outputs are missing"
);
assert(
  /Call count/.test(debatePageSource) &&
    /Latency/.test(debatePageSource) &&
    /Not exposed by scoring API/.test(debatePageSource),
  "Diagnostics drawer should honestly mark call count and latency unavailable when missing from the frontend contract"
);
assert(
  /refreshState\.error \|\| scoringState\.error \|\| data\?\.reason/.test(debatePageSource),
  "Diagnostics drawer should surface real scoring errors or unavailable reasons"
);
assert(
  !/callCount\s*=\s*\d|latencyMs\s*=\s*\d|call_count:\s*\d|latency_ms:\s*\d/.test(debatePageSource),
  "Diagnostics drawer must not fabricate call count or latency values"
);
