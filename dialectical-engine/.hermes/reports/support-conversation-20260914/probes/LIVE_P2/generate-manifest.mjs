import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const reportRoot = path.join(repositoryRoot,".hermes/reports/support-conversation-20260914");
const outputPath = path.join(reportRoot,"evidence/LIVE_P2-manifest.json");
const activeLog = path.join(reportRoot,"logs/LIVE_P2-stack-detached.log");
const revision = "606b2eabea1dc9212159e53c193cf69655424e77";

async function filesIn(directory,predicate) {
  const entries = await readdir(directory,{ withFileTypes:true });
  const rows = [];
  for (const entry of entries) {
    const absolute = path.join(directory,entry.name);
    if (entry.isDirectory()) rows.push(...await filesIn(absolute,predicate));
    else if (entry.isFile() && predicate(absolute)) rows.push(absolute);
  }
  return rows;
}

const candidates = [
  path.join(reportRoot,"agent-reports/LIVE_P2.md"),
  ...await filesIn(path.join(reportRoot,"evidence"),(absolute) =>
    path.basename(absolute).startsWith("LIVE_P2-") || path.basename(absolute) === "LIVE_P2.md"),
  ...await filesIn(path.join(reportRoot,"logs"),(absolute) => path.basename(absolute).startsWith("LIVE_P2-")),
  ...await filesIn(path.join(reportRoot,"probes/LIVE_P2"),() => true)
];
const selected = [...new Set(candidates)]
  .filter((absolute) => absolute !== outputPath && absolute !== activeLog)
  .sort((left,right) => left.localeCompare(right));
const artifacts = [];
for (const absolute of selected) {
  const bytes = await readFile(absolute);
  artifacts.push({
    missionRelative:path.relative(repositoryRoot,absolute),
    absolute,
    sha256:createHash("sha256").update(bytes).digest("hex"),
    bytes:(await stat(absolute)).size
  });
}
const receipt = {
  schemaVersion:1,
  node:"LIVE_P2",
  productRevision:revision,
  receiptSelfExcluded:true,
  artifactCount:artifacts.length,
  artifacts,
  exclusions:[{
    missionRelative:path.relative(repositoryRoot,activeLog),
    reason:"Active mode-0600 runtime log may grow while the supported detached preview remains active."
  }]
};
await writeFile(outputPath,JSON.stringify(receipt,null,2) + "\n",{ mode:0o600 });
process.stdout.write(`LIVE_P2 manifest generated: ${artifacts.length} artifacts\n`);
