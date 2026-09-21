import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`;
const L=`${ROOT}/logs`;
const P=`${ROOT}/probes/GUIDE_HARNESS_FIX26`;
const A=`${ROOT}/agent-reports/GUIDE_HARNESS_FIX26.md`;
const manifestPath=`${E}/GUIDE_HARNESS_FIX26-manifest.json`;
const receiptPath=`${E}/GUIDE_HARNESS_FIX26-receipt.json`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const item=async absolute => {
  const bytes=await readFile(absolute);
  return { absolute,sha256:sha256(bytes),bytes:bytes.byteLength };
};
const paths=[];
for (const name of await readdir(P)) {
  const absolute=`${P}/${name}`;
  if ((await stat(absolute)).isFile()) paths.push(absolute);
}
for (const name of await readdir(E)) {
  if ((name.startsWith("GUIDE_HARNESS_FIX26")
      || name === "GUIDE_ROW_PROOF-run-GUIDE_HARNESS_FIX26-POSITIVE.json")
    && name !== "GUIDE_HARNESS_FIX26-manifest.json"
    && name !== "GUIDE_HARNESS_FIX26-receipt.json") paths.push(`${E}/${name}`);
}
for (const name of await readdir(L)) {
  if (name.startsWith("GUIDE_HARNESS_FIX26")) paths.push(`${L}/${name}`);
}
paths.push(A);
const artifacts=[];
for (const absolute of [...new Set(paths)].sort()) artifacts.push(await item(absolute));
const manifest={ schemaVersion:1,node:"GUIDE_HARNESS_FIX26",ticket:"t_45088d73",
  revision:"456cafb9e56a737de550570b5736ec52d79ddf48",
  verdict:"PASS_CAPTURE_PROOF_DEPENDENCY",artifactCount:artifacts.length,artifacts };
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptArtifacts=[...artifacts,await item(manifestPath)];
const receipt={ schemaVersion:1,node:"GUIDE_HARNESS_FIX26",ticket:"t_45088d73",
  revision:"456cafb9e56a737de550570b5736ec52d79ddf48",
  verdict:"PASS_CAPTURE_PROOF_DEPENDENCY",artifacts:receiptArtifacts };
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
process.stdout.write(`${JSON.stringify({
  result:"PASS",manifestPath,manifestSha256:(await item(manifestPath)).sha256,
  receiptPath,receiptSha256:(await item(receiptPath)).sha256,artifactCount:receiptArtifacts.length
})}\n`);
