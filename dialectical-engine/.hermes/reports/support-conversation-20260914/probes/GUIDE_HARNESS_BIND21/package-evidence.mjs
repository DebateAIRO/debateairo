import { createHash } from 'node:crypto';
import { readdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const R='/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914',E=resolve(R,'evidence'),L=resolve(R,'logs'),A=resolve(R,'agent-reports'),P=resolve(R,'probes');
const revision='456cafb9e56a737de550570b5736ec52d79ddf48';
const sha=b=>createHash('sha256').update(b).digest('hex');
const self={schemaVersion:1,node:'GUIDE_HARNESS_BIND21',ticket:'t_1e8c584c',revision,verdict:'PASS_PREPARED_FINAL_OPERATION_CONTRACT',model:'gpt-5.6-sol',session:'01a09f02-346a-7fb0-aa70-0424f1fdd21e',skills:{retained:['superpowers:executing-plans','superpowers:systematic-debugging','superpowers:verification-before-completion'],reReadThisNode:false},traffic:{browser:0,runtime:0,http:0,status:0,capacity:0,database:0,support:0,model:0},proofs:{offline58:'PASS',focusedControls:'20/20',bindingControls:'13/13'},limitations:['Runtime7 reload and custody are not executed.','UI preflight, capacity, gate, row proof, capture and idle phases are not executed.','Exact34 receipt is composed provenance, not a new monolithic run.','Forgot password is unresolved and actionless.','No owner acceptance or CP1 readiness is claimed.']};
const selfPath=resolve(E,'GUIDE_HARNESS_BIND21-self-report.json');await writeFile(selfPath,`${JSON.stringify(self,null,2)}\n`,{flag:'wx',mode:0o600});
const paths=[];
for(const dir of [resolve(P,'GUIDE_HARNESS_BIND21'),resolve(P,'GUIDE_ROW_PROOF_BIND21')]) for(const name of (await readdir(dir)).sort()) paths.push(resolve(dir,name));
for(const name of (await readdir(E)).filter(n=>n.startsWith('GUIDE_HARNESS_BIND21-')||n==='GUIDE_HARNESS_BIND21.md'||n==='GUIDE_ROW_PROOF_BIND21-offline58.json').sort()) if(!nIsReceipt(name)) paths.push(resolve(E,name));
for(const name of (await readdir(L)).filter(n=>n.startsWith('GUIDE_HARNESS_BIND21-')).sort()) paths.push(resolve(L,name));
paths.push(resolve(A,'GUIDE_HARNESS_BIND21.md'));
function nIsReceipt(n){return n==='GUIDE_HARNESS_BIND21-receipt.json'||n==='GUIDE_HARNESS_BIND21-manifest.json'}
const uniq=[...new Set(paths)];const artifacts=[];for(const path of uniq){const b=await readFile(path);artifacts.push({absolute:path,sha256:sha(b),bytes:b.length})}
const manifest={schemaVersion:1,node:'GUIDE_HARNESS_BIND21',ticket:'t_1e8c584c',revision,verdict:'PASS_PREPARED_FINAL_OPERATION_CONTRACT',artifacts};
const manifestPath=resolve(E,'GUIDE_HARNESS_BIND21-manifest.json');await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{flag:'wx',mode:0o600});
const receiptPaths=[resolve(E,'GUIDE_HARNESS_BIND21.md'),selfPath,manifestPath,resolve(E,'GUIDE_HARNESS_BIND21-command-contract.json'),resolve(E,'GUIDE_HARNESS_BIND21-gate-template.json'),resolve(E,'GUIDE_HARNESS_BIND21-runtime-custody-contract.json'),resolve(E,'GUIDE_HARNESS_BIND21-control-proof.json'),resolve(E,'GUIDE_HARNESS_BIND21-binding-proof.json'),resolve(E,'GUIDE_ROW_PROOF_BIND21-offline58.json')];
const receiptArtifacts=[];for(const path of receiptPaths){const b=await readFile(path);receiptArtifacts.push({absolute:path,sha256:sha(b),bytes:b.length})}
const receipt={schemaVersion:1,node:'GUIDE_HARNESS_BIND21',ticket:'t_1e8c584c',revision,verdict:'PASS_PREPARED_FINAL_OPERATION_CONTRACT',artifacts:receiptArtifacts,traffic:{browser:0,runtime:0,http:0,status:0,capacity:0,database:0,support:0,model:0},heavyLeaseReleased:true};
const receiptPath=resolve(E,'GUIDE_HARNESS_BIND21-receipt.json');await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{flag:'wx',mode:0o600});
for(const path of [manifestPath,receiptPath]){const b=await readFile(path);console.log(JSON.stringify({path,sha256:sha(b),bytes:b.length}))}
