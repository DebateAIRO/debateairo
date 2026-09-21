import assert from "node:assert/strict";
import { projectGuideApiResponse } from "./controls.mjs";

const projected=projectGuideApiResponse({
  outcome:"REFUSE_INJECTION",
  text:"Fixed refusal"
},200,"DETERMINISTIC_INJECTION_REFUSAL");

assert.deepEqual(projected,{
  status:200,
  outcome:"REFUSE_INJECTION",
  text:"Fixed refusal",
  sources:[],
  actions:[]
});

process.stdout.write(`${JSON.stringify({
  schemaVersion:1,
  result:"PASS",
  control:"legacy deterministic omitted decorations normalize to empty arrays",
  traffic:{ browser:0,runtime:0,http:0,database:0,supportRequests:0,modelRequests:0 }
})}\n`);
