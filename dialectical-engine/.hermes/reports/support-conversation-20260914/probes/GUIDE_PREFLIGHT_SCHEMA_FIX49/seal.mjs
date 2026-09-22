import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const P=`${ROOT}/probes/GUIDE_PREFLIGHT_SCHEMA_FIX49`;
const L=`${ROOT}/logs`;
const A=`${ROOT}/agent-reports`;
const NODE="GUIDE_PREFLIGHT_SCHEMA_FIX49";
const TICKET="t_d5f212de";
const REVISION="0d34f82f4a2188d0ce1db04655b693798ffd2169";
const VERDICT="PASS_PREFLIGHT_SCHEMA_BOUND_REVIEW_REQUIRED";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const describe=async path=>{const bytes=await readFile(path);return {path,sha256:sha256(bytes),bytes:bytes.byteLength};};
async function files(root){const out=[];for(const entry of await readdir(root,{withFileTypes:true})){const path=`${root}/${entry.name}`;if(entry.isDirectory())out.push(...await files(path));else if(entry.isFile())out.push(path);}return out;}

const compatibility={schemaVersion:1,node:NODE,revision:REVISION,verdict:VERDICT,
  changed:{entrypoint:`${P}/phase-preflight.mjs`,sharedValidator:`${P}/preflight-schema.mjs`,composition:`${P}/composition.mjs`,before:{schemaVersion:1,retainedRows:10,remainingRows:21},after:{schemaVersion:2,retainedRows:11,remainingRows:20},boundary:"intercepted immediately before unchanged actual UI child spawn"},
  phases:[
    {phase:"preflight",directCompositionConsumer:true,disposition:"CORRECTED_SCHEMA2_11_20"},
    {phase:"readiness",directCompositionConsumer:false,disposition:"COMPATIBLE_UNCHANGED"},
    {phase:"capacity",directCompositionConsumer:false,disposition:"COMPATIBLE_UNCHANGED_3_26_23"},
    {phase:"gate",directCompositionConsumer:false,disposition:"COMPATIBLE_UNCHANGED"},
    {phase:"rowProof",directCompositionConsumer:false,disposition:"COMPATIBLE_UNCHANGED_LOGICAL58"},
    {phase:"capture",directCompositionConsumer:false,disposition:"COMPATIBLE_UNCHANGED_REMAINING20_COMPOSER_SCHEMA2"},
    {phase:"idle",directCompositionConsumer:false,disposition:"COMPATIBLE_UNCHANGED"}
  ],retained:{compiledReactReplay:"PASS3_OF_3_NOT_RERUN",logicalRows:"PASS58_OF_58_NOT_RERUN",actualGuideNamespace:"GUIDE_LIVE_GUIDE26_UNUSED",ownerOutputs:"UNCHANGED_UNUSED"}};
await writeFile(`${E}/${NODE}-compatibility-map.json`,`${JSON.stringify(compatibility,null,2)}\n`,{flag:"wx",mode:0o600});

const sourceDelta={schemaVersion:1,node:NODE,revision:REVISION,files:[
  {path:`${P}/phase-preflight.mjs`,purpose:"real entrypoint uses shared schema2 validation and emits 11/20 metadata"},
  {path:`${P}/preflight-schema.mjs`,purpose:"strict composition/cardinality/contract/UI binding and UI-child boundary seam"},
  {path:`${P}/composition.mjs`,purpose:"unchanged reviewed schema2 three-segment composer copied into append-only node"},
  {path:`${P}/capture-public-guide.mjs`,purpose:"mechanically rebound unchanged remaining20 capture/composer to LIVE38"},
  {path:`${P}/replay-row-proofs.mjs`,purpose:"mechanically rebound unchanged logical58 proof to LIVE38"},
  {path:`${P}/run-operator.mjs`,purpose:"mechanically rebound final contract/LIVE38 operator"},
  {path:`${P}/generate-binding.mjs`,purpose:"deterministic seven-phase closure and fresh namespace generator"},
  {path:`${P}/run-final-controls.mjs`,purpose:"production-shaped real preflight compatibility and negative controls"}
]};
await writeFile(`${E}/${NODE}-source-delta.json`,`${JSON.stringify(sourceDelta,null,2)}\n`,{flag:"wx",mode:0o600});

const report=`# GUIDE_PREFLIGHT_SCHEMA_FIX49\n\nVerdict: ${VERDICT}\n\nLIVE37 failed before its UI child because the selected real preflight imported the predecessor schema1 composer and expected 10 retained plus 21 remaining rows. This append-only correction makes the real selected preflight call a shared strict schema2 validator. It binds the reviewed composition bytes, enforces retained 11 / remaining 20 / union 31, binds the unchanged actual UI producer, and emits schema2 preflight metadata.\n\nThe real entrypoint reached an intercepted UI-child boundary with production-shaped input. The predecessor rejected that input. Wrong schema, retained cardinality, remaining cardinality, and composition digest all rejected before the child boundary. All seven literal phase argv self-bind the fresh contract; the reachable closure includes the shared validator; all LIVE38 and actual GUIDE26 future paths remained absent. The only same-cause consumer was preflight; readiness, capacity, gate, logical58 row proof, remaining20 capture/composer, and idle do not interpret the changed composition counts.\n\nControls: 15/15 PASS. One first control attempt invoked the operator without its reviewed TypeScript loader and failed with ERR_MODULE_NOT_FOUND before any I/O; the failure is preserved and the affected guard passed with the exact node --import tsx invocation. No browser, runtime, HTTP, status, capacity, DB, Support, or model traffic occurred.\n\nRetained evidence was not rerun: compiled React replay 3/3, logical proof 58/58, remaining20 budget/composer, product revision, Runtime9, and all previously reviewed process/schema/screenshot guards. Independent bounded review and a new actual run are still required. Forgot destination remains unresolved. This is not CP1 readiness or acceptance.\n`;
await writeFile(`${E}/${NODE}.md`,report,{flag:"wx",mode:0o600});

const self=`# ${NODE} self-report\n\n- SKILLS LOADED: superpowers:using-superpowers; superpowers:systematic-debugging; superpowers:test-driven-development; superpowers:verification-before-completion.\n- Native session: /root/preview. Ticket: ${TICKET}. Revision: ${REVISION}.\n- Disposition: ${VERDICT}; 15/15 bounded offline controls; zero operational traffic.\n\n> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.\n\nThe recurring cost was copied orchestration code retaining predecessor schema and cardinality assumptions after the evidence plan changed. Metadata-only binding checks could pass while the real phase still imported its local stale validator. The improvement is to make one versioned composition schema and one shared validator the executable source of truth, then require every phase contract to run its real entrypoint to the first I/O boundary with production-shaped fixtures. Contract generators should derive cardinalities from the matrix instead of embedding 10/21 or 11/20 literals.\n\nThe workflow should upgrade its final review gate to verify three things together: the real imported module graph, the real producer-shaped document, and the real consumer boundary. A single generated execution bundle should carry the schema version, row sets, counts, hashes, namespaces, and phase argv. Review should reject any copied local validator or hand-authored count. That would turn this class of correction into one prompt: generate the bundle, execute the offline real-boundary fixture, review the resulting immutable proof, then authorize the operational run.\n\nThe retained safeguards worked: stop-first preserved zero traffic, append-only namespaces preserved prior evidence, and the explicit compatibility map prevented broad reruns. The remaining limitation is independent review plus the future LIVE38 actual execution; no completion claim is made.\n`;
await writeFile(`${A}/${NODE}.md`,self,{flag:"wx",mode:0o600});

const excluded=new Set([`${E}/${NODE}-receipt.json`,`${E}/${NODE}-manifest.json`]);
const paths=[...(await files(P)),...(await readdir(E)).filter(name=>name.startsWith(`${NODE}-`)||name===`${NODE}.md`).map(name=>`${E}/${name}`),...(await readdir(L)).filter(name=>name.startsWith(`${NODE}-`)).map(name=>`${L}/${name}`),`${A}/${NODE}.md`].filter(path=>!excluded.has(path));
const unique=[...new Set(paths)].sort();
for(const path of unique)if(!(await stat(path)).isFile())throw new Error("GUIDE_FIX49_ARTIFACT_NOT_FILE");
const manifest={schemaVersion:1,node:NODE,ticket:TICKET,revision:REVISION,verdict:VERDICT,artifacts:await Promise.all(unique.map(describe))};
await writeFile(`${E}/${NODE}-manifest.json`,`${JSON.stringify(manifest,null,2)}\n`,{flag:"wx",mode:0o600});
const manifestDescriptor=await describe(`${E}/${NODE}-manifest.json`);
const proof=JSON.parse(await readFile(`${E}/${NODE}-control-proof.json`,"utf8"));
const receipt={schemaVersion:1,node:NODE,ticket:TICKET,revision:REVISION,verdict:VERDICT,nativeSession:"/root/preview",skillsLoaded:["superpowers:using-superpowers","superpowers:systematic-debugging","superpowers:test-driven-development","superpowers:verification-before-completion"],controls:{passed:proof.passed,total:proof.controls},traffic:proof.traffic,artifacts:[...manifest.artifacts,manifestDescriptor]};
await writeFile(`${E}/${NODE}-receipt.json`,`${JSON.stringify(receipt,null,2)}\n`,{flag:"wx",mode:0o600});
const receiptDescriptor=await describe(`${E}/${NODE}-receipt.json`);
process.stdout.write(`${JSON.stringify({verdict:VERDICT,artifactCount:receipt.artifacts.length,receipt:receiptDescriptor})}\n`);
