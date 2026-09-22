import { readFile,stat,writeFile } from "node:fs/promises";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const runtimeLog = `${reportRoot}/logs/LIVE3-stack-detached-r2.log`;
const baseline = JSON.parse(await readFile(`${reportRoot}/evidence/LIVE3-diagnostic-baseline.json`,"utf8"));
const bytes = await readFile(runtimeLog);
const window = bytes.subarray(baseline.baseline_byte_offset).toString("utf8");
const matches = [...window.matchAll(/SUPPORT_DRAFT_([A-Z_]+)/gu)].map((match) => match[1]);
const counts = {};
for (const category of matches) counts[category] = (counts[category] ?? 0) + 1;
const end = (await stat(runtimeLog)).size;
const receipt = {
  schema_version: 1,
  revision: "43cf9386ea3c9e7c79523ec38debe63271d19292",
  byte_offset_start: baseline.baseline_byte_offset,
  byte_offset_end: end,
  actual_finite_requests: 7,
  rejected_outcomes: 3,
  fixed_enum_events: matches.length,
  counts,
  correlation_limit: "Events are isolated to the finite-matrix byte window. The reporter emits no request identifier, so exact category-to-prompt attribution is not claimed.",
  raw_completion_or_log_lines_retained: false
};
await writeFile(`${reportRoot}/evidence/LIVE3-diagnostic-counts.json`,JSON.stringify(receipt,null,2) + "\n");
process.stdout.write(JSON.stringify({ fixed_enum_events: matches.length,counts }) + "\n");
