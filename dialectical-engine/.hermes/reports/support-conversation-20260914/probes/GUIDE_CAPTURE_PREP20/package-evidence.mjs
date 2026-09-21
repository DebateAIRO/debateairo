import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const probe=resolve(root,"probes/GUIDE_CAPTURE_PREP20");
const evidence=resolve(root,"evidence");
const paths=(await readdir(probe)).sort().map(name=>resolve(probe,name));
paths.push(
  resolve(evidence,"GUIDE_CAPTURE_PREP20-control-definitions.json"),
  resolve(evidence,"GUIDE_CAPTURE_PREP20-syntax.json"),
  resolve(evidence,"GUIDE_CAPTURE_PREP20.md"),
  resolve(root,"agent-reports/GUIDE_CAPTURE_PREP20.md")
);
for (const name of (await readdir(resolve(root,"logs"))).filter(name=>name.startsWith("GUIDE_CAPTURE_PREP20-")).sort()) {
  paths.push(resolve(root,"logs",name));
}
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const artifacts=[];
for (const absolute of [...new Set(paths)].sort()) {
  const info=await stat(absolute); if (!info.isFile()) continue;
  const bytes=await readFile(absolute); artifacts.push({ absolute,sha256:sha256(bytes),bytes:bytes.length });
}
const manifestPath=resolve(evidence,"GUIDE_CAPTURE_PREP20-manifest.json");
const manifest={ schemaVersion:1,node:"GUIDE_CAPTURE_PREP20",revision:null,preparationBase:"0f4290c290fd38caa0ccfb3b6781fb8c33999a22",verdict:"PREPARED_UNBOUND_CAPTURE",artifacts };
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const manifestBytes=await readFile(manifestPath);
const receiptArtifacts=[...artifacts,{ absolute:manifestPath,sha256:sha256(manifestBytes),bytes:manifestBytes.length }].sort((a,b)=>a.absolute.localeCompare(b.absolute,"en"));
const receipt={ schemaVersion:1,node:"GUIDE_CAPTURE_PREP20",ticket:"t_53587c62",revision:null,verdict:"PREPARED_UNBOUND_CAPTURE",artifacts:receiptArtifacts };
const receiptPath=resolve(evidence,"GUIDE_CAPTURE_PREP20-receipt.json");
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({ receipt:receiptPath,sha256:sha256(receiptBytes),bytes:receiptBytes.length,artifacts:receiptArtifacts.length })}\n`);
