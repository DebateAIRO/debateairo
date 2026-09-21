import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,mkdir,readFile,rm,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { captureCompleteGuideAnswerScreenshot as oldCapture } from "../GUIDE_HARNESS_BIND21/screenshot-evidence-successor.mjs";
import { captureCompleteGuideAnswerScreenshot as fixedCapture } from "./screenshot-evidence-successor.mjs";

const EXECUTABLE_PATH="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const OUTPUT=`${ROOT}/probes/GUIDE_CAPTURE_FIX29/control-fixtures`;
const RECEIPT=`${ROOT}/evidence/GUIDE_CAPTURE_FIX29-screenshot-control-proof.json`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
for (const path of [OUTPUT,RECEIPT]) {
  try { await access(path); throw new Error(`GUIDE_CAPTURE_FIX29_OUTPUT_PRESENT:${path}`); }
  catch (error) { if (error?.code!=="ENOENT") throw error; }
}
await mkdir(OUTPUT,{ recursive:false,mode:0o700 });

const shortText="Pricing on the site is informational only — it describes plans and costs but is not a checkout flow, so you cannot purchase or change a plan from it. If you have questions about what a plan includes, Support can explain the published information, but creating or paying for a debate happens through the debate creator after you sign in.";
const longText=`The public guide explains this workflow in detail. ${"Follow the published steps and keep the current page open while you review every section. ".repeat(18)}`.trim();
const cases=[
  { name:"full-en-short-row1",mode:"full",language:"en",text:shortText,sourceLabel:"Navigate Dialectical Engine",action:null },
  { name:"full-ro-long",mode:"full",language:"ro",text:longText,sourceLabel:"Navighează în Dialectical Engine",action:{ label:"Deschide Ajutor",href:"/help" } },
  { name:"compact-en-long",mode:"compact",language:"en",text:longText,sourceLabel:"Navigate Dialectical Engine",action:{ label:"Open Help",href:"/help" } },
  { name:"compact-ro-short",mode:"compact",language:"ro",text:shortText,sourceLabel:"Navighează în Dialectical Engine",action:null }
];
const browser=await chromium.launch({ executablePath:EXECUTABLE_PATH,headless:true });
const results=[];
let supportAttempts=0;
try {
  for (const [index,item] of cases.entries()) {
    const page=await browser.newPage({ viewport:item.mode==="full"?{ width:1000,height:760 }:{ width:390,height:844 } });
    await page.route("**/api/v1/support/**",route=>{ supportAttempts+=1; return route.abort(); });
    const rootClass=item.mode==="full"?"supportDesk":"supportAssistantCompact";
    const paneOpen=item.mode==="full"?'<div class="supportChatScroll">':"";
    const paneClose=item.mode==="full"?"</div>":"";
    const sourceName=item.language==="ro"?"Surse":"Sources";
    const actionName=item.language==="ro"?"Acțiuni":"Actions";
    const action=item.action===null?"":`<nav aria-label="${actionName}"><a href="${item.action.href}">${item.action.label}</a></nav>`;
    await page.setContent(`<!doctype html><style>
      .${rootClass}{width:${item.mode==="full"?"820":"360"}px;height:260px;overflow:auto;border:3px solid #111;background:#eee}
      .supportChatScroll{height:250px;overflow:auto}.supportConversation{display:flex;flex-direction:column;gap:8px}
      .supportMessage{box-sizing:border-box;width:95%;padding:10px;background:#fff;color:#111}.supportMessageCore{min-height:30px}
      .top-marker{height:12px;background:#123}.supportCitation{min-height:52px;background:#ddd;padding:8px}
      p{line-height:20px;margin:8px 0}.previous{height:45px}
    </style><div class="${rootClass}">${paneOpen}<div class="supportConversation">
      <article class="supportMessage supportMessage--assistant previous" data-role="assistant"><div class="supportMessageCore"><p>Previous answer</p><footer class="supportCitation"><div role="list" aria-label="${sourceName}"><span role="listitem">Previous source</span></div></footer></div></article>
      <article class="supportMessage supportMessage--assistant" data-role="assistant"><div class="supportMessageCore"><div class="top-marker"></div><p>${item.text}</p><footer class="supportCitation"><div role="list" aria-label="${sourceName}"><span role="listitem">${item.sourceLabel}</span></div>${action}</footer></div></article>
    </div>${paneClose}</div>`);
    const root=`.${rootClass}`;
    const article=page.locator(`${root} .supportMessage[data-role="assistant"]`).nth(1);
    const api={ text:item.text,sources:[{ id:"app-navigation",label:item.sourceLabel }],actions:item.action===null?[]:[{ id:"help",...item.action }] };
    const visible={ text:item.text,sources:[item.sourceLabel],actions:item.action===null?[]:[item.action] };
    const paths={ screenshotPath:`${OUTPUT}/${item.name}-complete.png`,topPaneScreenshotPath:`${OUTPUT}/${item.name}-top.png`,footerPaneScreenshotPath:`${OUTPUT}/${item.name}-footer.png` };
    if (index===0) {
      await assert.rejects(oldCapture({ page,article,root,row:{ sequence:1,prompt:"Pricing",mode:item.mode,language:item.language },api,visible,beforeAssistantCount:1,...paths }),/GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH/u);
    }
    let evidence;
    try {
      evidence=await fixedCapture({ page,article,root,row:{ sequence:index+1,prompt:item.name,mode:item.mode,language:item.language },api,visible,beforeAssistantCount:1,...paths });
    } catch (error) {
      throw new Error(`GUIDE_CAPTURE_FIX29_CASE_FAILED:${item.name}:${error instanceof Error?error.message:"UNKNOWN"}`);
    }
    assert.equal(evidence.projectionEqual,true);
    assert.equal(evidence.originalPaneTopReachable,true);
    assert.equal(evidence.originalPaneFooterReachable,true);
    assert.equal(evidence.completeAnswerExpandedCapture,true);
    const complete=await readFile(paths.screenshotPath);
    results.push({ name:item.name,mode:item.mode,language:item.language,completeSha256:sha256(complete),completeBytes:complete.byteLength,
      originalPaneTopReachable:evidence.originalPaneTopReachable,originalPaneFooterReachable:evidence.originalPaneFooterReachable,
      completeAnswerExpandedCapture:evidence.completeAnswerExpandedCapture });

    const negativeBase={ page,root,row:{ sequence:99,prompt:"negative",mode:item.mode,language:item.language },api,visible,...paths };
    await assert.rejects(fixedCapture({ ...negativeBase,article:page.locator(`${root} .supportMessage[data-role="assistant"]`).first(),beforeAssistantCount:1 }),/GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH/u);
    await assert.rejects(fixedCapture({ ...negativeBase,article,beforeAssistantCount:0 }),/GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH/u);
    await assert.rejects(fixedCapture({ ...negativeBase,article,beforeAssistantCount:1,visible:{ ...visible,text:`${visible.text} stale` } }),/GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH/u);
    await page.close();
  }
  assert.equal(supportAttempts,0);
  const receipt={ schemaVersion:1,node:"GUIDE_CAPTURE_FIX29_SCREENSHOT_CONTROLS",result:"PASS_REAL_MESSAGE_SCREENSHOT_TARGET",
    sourceProjection:{ old:"visible labels versus API ids",fixed:"visible labels versus API labels" },cases:results,
    negatives:{ previousArticleRejected:4,wrongIndexRejected:4,staleProjectionRejected:4 },supportAttempts };
  await writeFile(RECEIPT,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
  process.stdout.write(`${JSON.stringify({ result:receipt.result,cases:results.length,negatives:12,supportAttempts })}\n`);
} catch (error) {
  await rm(OUTPUT,{ recursive:true,force:true });
  throw error;
} finally { await browser.close(); }
