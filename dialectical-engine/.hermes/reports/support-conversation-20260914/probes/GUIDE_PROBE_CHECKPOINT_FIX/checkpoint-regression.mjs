import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createGuideProbeCheckpoint } from "./checkpoint-writer.mjs";

const [mode]=process.argv.slice(2);
const originalPath="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND15/probe-zero-request-ui.mjs";
const evidenceRoot="/owned/evidence";
const outputPath=`${evidenceRoot}/GUIDE_UI_TRANSITION_PROBE-run-fixture.json`;

if (mode === "original") {
  const source=await readFile(originalPath,"utf8");
  const match=/let created=false;\nasync function checkpoint\(\) \{[\s\S]*?\n\}/u.exec(source);
  assert.notEqual(match,null);
  const writes=[];
  const context=vm.createContext({
    mkdir:async () => {},
    writeFile:async (...args) => writes.push(args),
    outputPath,
    result:{ completed:false,verdict:"RUNNING" },
    JSON,
  });
  vm.runInContext(`${match[0]}\nglobalThis.actualCheckpoint=checkpoint;`,context);
  await context.actualCheckpoint();
  throw new Error("GUIDE_CHECKPOINT_ORIGINAL_UNEXPECTED_PASS");
}

if (mode === "fixed") {
  const calls={ mkdir:[],write:[] };
  let result={ completed:false,verdict:"RUNNING",failure:null };
  const checkpoint=createGuideProbeCheckpoint({
    mkdir:async (...args) => calls.mkdir.push(args),
    writeFile:async (...args) => calls.write.push(args),
    evidenceRoot,outputPath,readResult:() => result
  });
  await checkpoint();
  result={ completed:false,verdict:"RUNNING",failure:{ code:"GUIDE_TEST_FIXED_FAILURE" } };
  await checkpoint();
  result={ completed:false,verdict:"FAIL_ZERO_SUPPORT_UI_TRANSITIONS",failure:{ code:"GUIDE_TEST_FIXED_FAILURE" } };
  await checkpoint();
  assert.equal(calls.mkdir.length,3);
  assert.deepEqual(calls.mkdir.map(([path,options]) => [path,options]),[
    [evidenceRoot,{ recursive:true }],[evidenceRoot,{ recursive:true }],[evidenceRoot,{ recursive:true }]
  ]);
  assert.equal(calls.write.length,3);
  assert.deepEqual(calls.write.map(([path,,options]) => [path,options]),[
    [outputPath,{ flag:"wx",mode:0o600 }],[outputPath,{}],[outputPath,{}]
  ]);
  assert.equal(JSON.parse(calls.write[0][1]).verdict,"RUNNING");
  assert.equal(JSON.parse(calls.write[1][1]).failure.code,"GUIDE_TEST_FIXED_FAILURE");
  assert.equal(JSON.parse(calls.write[2][1]).verdict,"FAIL_ZERO_SUPPORT_UI_TRANSITIONS");
  process.stdout.write(`${JSON.stringify({
    schemaVersion:1,result:"PASS",initialExclusive:true,update:true,failureCheckpoint:true,
    mkdirCalls:calls.mkdir.length,writeCalls:calls.write.length
  },null,2)}\n`);
  process.exit(0);
}

throw new Error("GUIDE_CHECKPOINT_REGRESSION_ARGS_INVALID");
