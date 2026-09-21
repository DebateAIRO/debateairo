import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const R='/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914';
const E=`${R}/evidence`,L=`${R}/logs`,P=`${R}/probes/GUIDE_HARNESS_BIND20`,W='/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine';
const revision='456cafb9e56a737de550570b5736ec52d79ddf48',kb='7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af';
const meta=async path=>{const b=await readFile(path);return {path,sha256:sha(b),bytes:b.length}};
const inventory=await meta(`${E}/GATE_GUIDE_FINAL13-manifest.json`),att=await meta(`${E}/GUIDE_HARNESS_BIND20-snapshot-receipt.json`),suite=await meta(`${E}/GUIDE_HARNESS_BIND20-required-suites.json`),control=await meta(`${E}/GUIDE_HARNESS_BIND20-control-proof.json`),ui=await meta(`${R}/probes/GUIDE_HARNESS_BIND16/probe-zero-request-ui.mjs`),row=await meta(`${R}/probes/GUIDE_ROW_PROOF_BIND20/replay-row-proofs.mjs`);
const runtimeCustodyPath=`${E}/GUIDE_RUNTIME7-stack-custody.json`,runtimeLogPath=`${L}/GUIDE_LIVE20-stack.log`;
const custodyContract={schemaVersion:1,node:'GUIDE_HARNESS_BIND20',producerNode:'GUIDE_RUNTIME7',outputPath:runtimeCustodyPath,privateRuntimeLogPath:runtimeLogPath,exactKeys:['schemaVersion','node','revision','pid','pgid','commandMarker','runtimeLogPath','ports','startedAtUtc','detached','ordinarySystemTls'],required:{schemaVersion:1,node:'GUIDE_RUNTIME7',revision,commandMarker:'pnpm dev:auth:up',runtimeLogPath,ports:{ui:3100,api:8787,relay:8894},detached:true,ordinarySystemTls:{path:'/help',customCa:false,insecure:false,status:200}},dynamic:{pid:'positive safe integer',pgid:'positive safe integer',startedAtUtc:'finite ISO-8601 timestamp'},limitation:'Produced only after supported owned reload; it carries no Support status, capacity, model, or database read.'};
const custodyPath=`${E}/GUIDE_HARNESS_BIND20-runtime-custody-contract.json`;
await writeFile(custodyPath,`${JSON.stringify(custodyContract,null,2)}\n`,{flag:'wx',mode:0o600});
const template={schemaVersion:1,productRoot:W,finalCommit:revision,productInventoryPath:inventory.path,productInventorySha256:inventory.sha256,attestationPath:att.path,attestationSha256:att.sha256,expectedSnapshotVersion:kb,expectedEntryCount:44,requiredSuiteReceiptPath:suite.path,requiredSuiteReceiptSha256:suite.sha256,controlProofPath:control.path,controlProofSha256:control.sha256,runtimeLogPath,baseUrl:'https://localhost:3100',forgotConnector:{status:'UNRESOLVED_ACTIONLESS'}};
const templatePath=`${E}/GUIDE_HARNESS_BIND20-gate-template.json`;
await writeFile(templatePath,`${JSON.stringify(template,null,2)}\n`,{flag:'wx',mode:0o600});
const templateMeta=await meta(templatePath);
const contractPath=`${E}/GUIDE_HARNESS_BIND20-command-contract.json`;
const names={preflight:'preflight',readiness:'readiness',capacity:'capacity',gate:'gate',rowProof:'row-proof',capture:'capture',idle:'idle'};
const phase=(key,extra={})=>({argv:['/Users/vladmihaimiron/.local/bin/node',`${P}/phase-${names[key]}.mjs`,contractPath],output:`${E}/GUIDE_LIVE20-${names[key]}${key==='rowProof'?'-status':''}.json`,log:`${L}/GUIDE_LIVE20-${names[key]}.log`,...extra});
const uiOutput=`${E}/GUIDE_UI_TRANSITION_PROBE-run-LIVE20.json`,uiLog=`${L}/GUIDE_UI_TRANSITION_PROBE-LIVE20.log`;
const phases={
 preflight:phase('preflight',{ui:{script:ui.path,sha256:ui.sha256,bytes:ui.bytes,argv:['/Users/vladmihaimiron/.local/bin/node',ui.path,revision,uiOutput],output:uiOutput,log:uiLog}}),
 readiness:phase('readiness'),capacity:phase('capacity'),gate:phase('gate'),
 rowProof:phase('rowProof',{childArgv:['/Users/vladmihaimiron/.local/bin/node','--import','tsx',row.path,`${E}/GUIDE_LIVE20-gate.json`,revision,`${E}/GUIDE_ROW_PROOF-run-LIVE20.json`],result:`${E}/GUIDE_ROW_PROOF-run-LIVE20.json`}),
 capture:phase('capture',{childArgv:['/Users/vladmihaimiron/.local/bin/node','--import','tsx',`${P}/capture-public-guide.mjs`,`${E}/GUIDE_LIVE20-gate.json`]}),idle:phase('idle')
};
const contract={schemaVersion:1,node:'GUIDE_HARNESS_BIND20',revision,kbVersion:kb,cwd:W,evidenceRoot:E,baseUrl:'https://localhost:3100',runtimeCustodyPath,runtimeCustodyContractPath:custodyPath,runtimeCustodyContractSha256:(await meta(custodyPath)).sha256,runtimeLogPath,gateTemplatePath:templatePath,gateTemplateSha256:templateMeta.sha256,actualReceipt:`${E}/GUIDE_LIVE_GUIDE18-actual-receipt.json`,browserProfile:`${P}/browser-profile`,actualSequences:[1,2,15,19,23,27,31,35,39,47,43,10,18,26,34,56,58,54,5,13,21,25,29,37,45,53,8,12,42,55,57],phases};
await writeFile(contractPath,`${JSON.stringify(contract,null,2)}\n`,{flag:'wx',mode:0o600});
console.log(JSON.stringify({template:await meta(templatePath),contract:await meta(contractPath),custodyContract:await meta(custodyPath)}));
