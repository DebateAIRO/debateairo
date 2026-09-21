import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const repository = "/Users/vladmihaimiron/Documents/DebateAIRO";
const manifestPath = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/review-packages/CP1-public-boundary/immutable-code.json";
const manifest = JSON.parse(readFileSync(manifestPath,"utf8"));

function readObject(laneRelative) {
  return spawnSync("git",[
    "show",`${manifest.revision}:dialectical-engine/${laneRelative}`
  ],{ cwd:repository,encoding:null,maxBuffer:4 * 1024 * 1024 });
}

const results = manifest.paths.map((entry) => {
  const result = readObject(entry.laneRelative);
  if (entry.deleted === true) {
    return Object.freeze({ laneRelative:entry.laneRelative,deleted:true,
      objectAbsent:result.status !== 0 });
  }
  const bytes = result.stdout ?? Buffer.alloc(0);
  const actual = Object.freeze({
    sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length
  });
  return Object.freeze({ laneRelative:entry.laneRelative,deleted:false,
    expected:{ sha256:entry.sha256,bytes:entry.bytes },actual,
    match:result.status === 0 && actual.sha256 === entry.sha256 && actual.bytes === entry.bytes });
});
const mismatches = results.filter((entry) => entry.deleted ? !entry.objectAbsent : !entry.match);
process.stdout.write(`${JSON.stringify({ revision:manifest.revision,count:results.length,
  present:results.filter((entry) => !entry.deleted).length,
  deleted:results.filter((entry) => entry.deleted).length,mismatches,results },null,2)}\n`);
if (mismatches.length > 0) process.exitCode = 1;
