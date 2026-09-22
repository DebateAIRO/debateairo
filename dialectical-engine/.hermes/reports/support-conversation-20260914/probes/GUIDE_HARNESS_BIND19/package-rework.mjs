import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidence=resolve(root,"evidence");
const files=[];
for (const directory of [
  resolve(root,"probes/GUIDE_HARNESS_BIND19"),
  resolve(root,"probes/GUIDE_ROW_PROOF_BIND19")
]) {
  for (const name of (await readdir(directory)).sort()) files.push(resolve(directory,name));
}
files.push(
  resolve(evidence,"GUIDE_HARNESS_BIND19-failure.json"),
  resolve(evidence,"GUIDE_HARNESS_BIND19.md"),
  resolve(root,"agent-reports/GUIDE_HARNESS_BIND19.md"),
  resolve(root,"logs/GUIDE_HARNESS_BIND19-offline58.log"),
  resolve(root,"logs/GUIDE_HARNESS_BIND19-offline58-attempt2.log"),
  resolve(root,"logs/GUIDE_HARNESS_BIND19-row58-diagnostic.log")
);
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const artifacts=[];
for (const absolute of [...new Set(files)].sort()) {
  const info=await stat(absolute);
  if (!info.isFile()) continue;
  const bytes=await readFile(absolute);
  artifacts.push({ absolute,sha256:hash(bytes),bytes:bytes.length });
}
const manifestPath=resolve(evidence,"GUIDE_HARNESS_BIND19-manifest.json");
const manifest={ schemaVersion:1,node:"GUIDE_HARNESS_BIND19",revision:"0f4290c290fd38caa0ccfb3b6781fb8c33999a22",verdict:"REWORK_PRODUCT_ACCOUNT_ACCESS_RETRIEVAL",artifacts };
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const manifestBytes=await readFile(manifestPath);
const receiptArtifacts=[...artifacts,{ absolute:manifestPath,sha256:hash(manifestBytes),bytes:manifestBytes.length }]
  .sort((a,b)=>a.absolute.localeCompare(b.absolute,"en"));
const receipt={ schemaVersion:1,node:"GUIDE_HARNESS_BIND19",ticket:"t_7286ccaf",revision:"0f4290c290fd38caa0ccfb3b6781fb8c33999a22",verdict:"REWORK_PRODUCT_ACCOUNT_ACCESS_RETRIEVAL",artifacts:receiptArtifacts };
const receiptPath=resolve(evidence,"GUIDE_HARNESS_BIND19-receipt.json");
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({ receipt:receiptPath,sha256:hash(receiptBytes),bytes:receiptBytes.length,artifacts:receiptArtifacts.length })}\n`);
