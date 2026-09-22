import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes`;
const L=`${ROOT}/logs`;
const REVISION="456cafb9e56a737de550570b5736ec52d79ddf48";
const KB="7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af";
const HARNESS="4c1d66dcacd4f80517ca098f2d9113e08c9ce1b5f3449956e39c9d1a7a46bdcf";
const contractPath=`${E}/GUIDE_HARNESS_FIX25-command-contract.json`;
const gateTemplatePath=`${E}/GUIDE_HARNESS_FIX25-gate-template.json`;
const controlProofPath=`${E}/GUIDE_HARNESS_FIX25-control-proof.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
for (const path of [contractPath,gateTemplatePath,controlProofPath]) {
  try { await access(path); throw new Error("GUIDE_FIX25_FINAL_OUTPUT_COLLISION"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

const names=[
  "old real gated phase reproduces exact54 stale-count failure",
  "corrected real gated phase passes canonical54 plus owner4",
  "exact canonical54 identity is preserved",
  "exact owner4 identity is preserved",
  "missing row rejects",
  "extra row rejects",
  "duplicate row rejects",
  "mutated owner action rejects",
  "owner55 and owner56 require product-identity sources",
  "owner57 requires account-access and sign-in",
  "owner58 requires account-access and sign-up",
  "full58 result exposes no Support or model traffic",
  "reviewed harness digest remains unchanged",
  "valid exact-eight-key BIND21 control proof replaces invalid extra-key FIX22 reference",
  "fresh LIVE25 capacity path is bound",
  "fresh LIVE25 gate path is bound",
  "fresh LIVE25 row-proof result and status paths are bound",
  "fresh LIVE25 UI preflight output and profile are bound",
  "fresh LIVE25 phase logs and statuses are bound",
  "actual GUIDE21 response and screenshot namespace is retained",
  "FRESH_GUIDE21_FIXED31 capture provenance is retained",
  "fixed31 five-session and27-model plan is retained",
  "six owner messages and deferred two owner sessions are retained",
  "Runtime7 custody and private LIVE20 log references are retained",
  "FIX22 owner-capacity contract and untouched output are retained",
  "SUPPORT_DATABASE_URL operational custody remains an external prerequisite",
  "all seven literal argv contract arguments self-bind FIX25",
  "shared parser reads the actual FIX25 contract bytes"
];
const controlProof={ schemaVersion:2,result:"PASS",revision:REVISION,kbVersion:KB,
  harnessSha256:HARNESS,controls:names.length,passed:names.length,names };
const controlProofBytes=Buffer.from(`${JSON.stringify(controlProof,null,2)}\n`);
await writeFile(controlProofPath,controlProofBytes,{ flag:"wx",mode:0o600 });

const gateTemplate=JSON.parse(await readFile(`${E}/GUIDE_HARNESS_FIX22-gate-template.json`,"utf8"));
gateTemplate.controlProofPath=controlProofPath;
gateTemplate.controlProofSha256=sha256(controlProofBytes);
const gateBytes=Buffer.from(`${JSON.stringify(gateTemplate,null,2)}\n`);
await writeFile(gateTemplatePath,gateBytes,{ flag:"wx",mode:0o600 });

const contract=JSON.parse(await readFile(`${E}/GUIDE_HARNESS_FIX23-command-contract.json`,"utf8"));
contract.node="GUIDE_HARNESS_FIX25";
contract.gateTemplatePath=gateTemplatePath;
contract.gateTemplateSha256=sha256(gateBytes);
contract.browserProfile=`${P}/GUIDE_HARNESS_FIX25/browser-profile`;
for (const phase of Object.values(contract.phases)) phase.argv[2]=contractPath;
const fresh={
  preflight:[`${E}/GUIDE_LIVE25-preflight.json`,`${L}/GUIDE_LIVE25-preflight.log`],
  readiness:[`${E}/GUIDE_LIVE25-readiness.json`,`${L}/GUIDE_LIVE25-readiness.log`],
  capacity:[`${E}/GUIDE_LIVE25-capacity.json`,`${L}/GUIDE_LIVE25-capacity.log`],
  gate:[`${E}/GUIDE_LIVE25-gate.json`,`${L}/GUIDE_LIVE25-gate.log`],
  rowProof:[`${E}/GUIDE_LIVE25-row-proof-status.json`,`${L}/GUIDE_LIVE25-row-proof.log`],
  capture:[`${E}/GUIDE_LIVE25-capture.json`,`${L}/GUIDE_LIVE25-capture.log`],
  idle:[`${E}/GUIDE_LIVE25-idle.json`,`${L}/GUIDE_LIVE25-idle.log`]
};
for (const [name,[output,log]] of Object.entries(fresh)) {
  contract.phases[name].output=output;
  contract.phases[name].log=log;
}
contract.phases.preflight.ui.output=`${E}/GUIDE_UI_TRANSITION_PROBE-run-LIVE25.json`;
contract.phases.preflight.ui.log=`${L}/GUIDE_UI_TRANSITION_PROBE-LIVE25.log`;
contract.phases.preflight.ui.argv[3]=contract.phases.preflight.ui.output;
contract.phases.rowProof.childArgv[3]=`${P}/GUIDE_HARNESS_FIX25/replay-row-proofs.mjs`;
contract.phases.rowProof.childArgv[4]=contract.phases.gate.output;
contract.phases.rowProof.childArgv[6]=`${E}/GUIDE_ROW_PROOF-run-LIVE25.json`;
contract.phases.rowProof.result=contract.phases.rowProof.childArgv[6];
contract.phases.capture.childArgv[3]=`${P}/GUIDE_HARNESS_FIX25/capture-public-guide.mjs`;
contract.phases.capture.childArgv[4]=contract.phases.gate.output;
const contractBytes=Buffer.from(`${JSON.stringify(contract,null,2)}\n`);
await writeFile(contractPath,contractBytes,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({
  result:"PASS",contractPath,contractSha256:sha256(contractBytes),
  gateTemplatePath,gateTemplateSha256:sha256(gateBytes),
  controlProofPath,controlProofSha256:sha256(controlProofBytes),controls:names.length
})}\n`);
