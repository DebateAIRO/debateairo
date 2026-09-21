import { createHash } from "node:crypto";
import { readFileSync,existsSync,lstatSync } from "node:fs";
const manifestPath="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GATE_GUIDE-manifest.json";
const lane="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine";
const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));
const digest=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const check=(path,expected)=>{
  if(!existsSync(path)) return {path,exists:false,match:false};
  const bytes=readFileSync(path);
  return {path,exists:true,sha256:digest(bytes),bytes:bytes.length,
    match:digest(bytes)===expected.sha256&&bytes.length===expected.bytes};
};
const product=manifest.productFiles.map((item)=>check(`${lane}/${item.laneRelative}`,item));
const inputs=manifest.immutableInputs.map((item)=>check(item.path,item));
const deleted=manifest.deletedProductPaths.map((path)=>({path,absent:!existsSync(`${lane}/${path}`)}));
const links=["node_modules","apps/api/node_modules","apps/ui/node_modules","apps/runner/node_modules","packages/support-kb/node_modules"]
  .map((path)=>({path,exists:existsSync(`${lane}/${path}`),symlink:existsSync(`${lane}/${path}`)&&lstatSync(`${lane}/${path}`).isSymbolicLink()}));
const output={revision:manifest.revision,base:manifest.base,
 product:{count:product.length,mismatches:product.filter((x)=>!x.match)},
 inputs:{count:inputs.length,mismatches:inputs.filter((x)=>!x.match)},
 deleted:{count:deleted.length,mismatches:deleted.filter((x)=>!x.absent)},
 temporaryLinks:links};
process.stdout.write(JSON.stringify(output,null,2)+"\n");
if(output.product.mismatches.length||output.inputs.mismatches.length||output.deleted.mismatches.length||links.some((x)=>x.exists)) process.exitCode=1;
