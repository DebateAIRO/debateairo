import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const paths=[
  `${root}/probes/GUIDE_CAPTURE_CONTROLS18/screenshot-evidence-successor.mjs`,
  `${root}/probes/GUIDE_CAPTURE_CONTROLS18/long-reply-browser-fixture.mjs`,
  `${root}/probes/GUIDE_CAPTURE_CONTROLS18/package-evidence.mjs`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-control-proof.json`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18.md`,
  `${root}/agent-reports/GUIDE_CAPTURE_CONTROLS18.md`,
  `${root}/logs/GUIDE_CAPTURE_CONTROLS18-prepared-controls.log`,
  `${root}/logs/GUIDE_CAPTURE_CONTROLS18-long-reply-attempt1.log`,
  `${root}/logs/GUIDE_CAPTURE_CONTROLS18-long-reply-attempt2.log`,
  `${root}/logs/GUIDE_CAPTURE_CONTROLS18-long-reply-attempt3.log`,
  `${root}/logs/GUIDE_CAPTURE_CONTROLS18-long-reply-attempt4.log`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-long-reply-attempt4.json`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-screenshots/attempt3/long-answer.png`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-screenshots/attempt3/long-answer-footer-variant.png`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-screenshots/attempt3/long-answer-top-variant.png`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-screenshots/attempt4/long-answer-complete-expanded.png`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-screenshots/attempt4/long-answer-complete-footer-variant.png`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-screenshots/attempt4/long-answer-complete-top-variant.png`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-screenshots/attempt4/long-answer-original-pane-top.png`,
  `${root}/evidence/GUIDE_CAPTURE_CONTROLS18-screenshots/attempt4/long-answer-original-pane-footer.png`
];
const artifact=async path => {
  const bytes=await readFile(path);
  return { path,sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length };
};
const artifacts=[];
for (const path of paths) artifacts.push(await artifact(path));
const manifest={
  schemaVersion:1,node:"GUIDE_CAPTURE_CONTROLS18",ticket:"t_6831cb23",
  revision:"6cbe0e7ad18b20eca35876f4a91478cfbba82307",
  verdict:"PASS_CAPTURE_AND_INVOCATION_CONTROLS",artifacts
};
const manifestPath=`${root}/evidence/GUIDE_CAPTURE_CONTROLS18-manifest.json`;
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptArtifacts=[...artifacts,await artifact(manifestPath)];
const receipt={
  schemaVersion:1,node:"GUIDE_CAPTURE_CONTROLS18",ticket:"t_6831cb23",
  session:"/root/preview",nativeSession:"01a09f02-346a-7fb0-aa70-0424f1fdd21e",
  revision:"6cbe0e7ad18b20eca35876f4a91478cfbba82307",
  verdict:"PASS_CAPTURE_AND_INVOCATION_CONTROLS",
  counts:{ preparedControls:{ total:4,passed:4 },fixtureAttempts:4,fixturePasses:1,preservedFixtureFailures:3 },
  correction:{
    originalFailure:"ancestor_overflow_blank_footer_pixels_in_exact_article_png",
    successor:"original_pane_top_footer_reachability_plus_labeled_evidence_only_expanded_complete_capture"
  },
  traffic:{ runtime:0,appPage:0,http:0,status:0,capacity:0,database:0,support:0,model:0 },
  browserCleanup:{ awaitedClose:true,matchingOwnedChildrenAfterward:0 },
  pending:{ final151Binding:true,finalProductBinding:true,finalKnowledgeBaseAttestation:true,supportedOwnedReload:true,forgotDestination:"UNRESOLVED" },
  artifacts:receiptArtifacts
};
const receiptPath=`${root}/evidence/GUIDE_CAPTURE_CONTROLS18-receipt.json`;
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const sealed=await artifact(receiptPath);
process.stdout.write(`${JSON.stringify({ result:"SEALED",receipt:sealed,manifest:await artifact(manifestPath),artifacts:receiptArtifacts.length })}\n`);
