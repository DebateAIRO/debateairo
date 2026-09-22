import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { executeGuideBoundHelper,validateGuideOperatorCommandContract } from "./command-contract.mjs";
import { validateGuideScreenshotEvidence } from "./screenshot-evidence.mjs";

const fixtures=JSON.parse(await readFile(new URL("./screenshot-fixtures.json",import.meta.url),"utf8"));
assert.throws(() => validateGuideScreenshotEvidence(fixtures.staleViewport),/GUIDE_CAPTURE_SCREENSHOT_EVIDENCE_INVALID/u);
assert.equal(validateGuideScreenshotEvidence(fixtures.targetVisible).sequence,7);

const scriptPath=new URL("./materialize-runtime-capacity.mjs",import.meta.url).pathname;
const bytes=await readFile(scriptPath);
const sha256=createHash("sha256").update(bytes).digest("hex");
const base={ schemaVersion:1,baseRevision:"152eed4da1cd3e66b74d8301159ba76427552409",
  finalRevision:"1".repeat(40),actualNamespace:"GUIDE_LIVE_GUIDE18",
  helpers:["preflight","readiness","capacity","gate","rowProof","capture","idle"].map((phase,index) => ({
    phase,script:{ path:scriptPath,sha256,bytes:bytes.length },cwd:"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine",
    argv:[process.execPath,scriptPath,"1".repeat(40),`/tmp/guide-${phase}.json`],argumentTypes:["string","string","string","string"],
    output:`/tmp/guide-output-${index}.json`,log:`/tmp/guide-log-${index}.log`
  })) };
assert.equal((await validateGuideOperatorCommandContract(base)).helpers.length,7);
let executions=0;
const stale=structuredClone(base);
stale.helpers.find(helper => helper.phase === "capacity").script.path=".hermes/probes/materialize-runtime-capacity.mjs";
stale.helpers.find(helper => helper.phase === "capacity").argv[1]=".hermes/probes/materialize-runtime-capacity.mjs";
await assert.rejects(async () => executeGuideBoundHelper(stale,"capacity",() => { executions+=1; }),/GUIDE_CAPTURE_FIX18_HELPER_CONTRACT_INVALID/u);
assert.equal(executions,0);
await executeGuideBoundHelper(base,"capacity",() => { executions+=1; return { status:0 }; });
assert.equal(executions,1);
process.stdout.write(`${JSON.stringify({ result:"PASS",controls:4,passed:4 })}\n`);
