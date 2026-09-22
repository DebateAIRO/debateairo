import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,mkdir,readFile,rm,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { screenshotCompleteArticle as oldScreenshot } from "../GUIDE_CAPTURE_FIX29/screenshot-evidence-successor.mjs";
import { captureCompleteGuideAnswerScreenshot,screenshotCompleteArticle as fixedScreenshot } from "./screenshot-evidence-successor.mjs";

const EXECUTABLE_PATH="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const OUTPUT=`${ROOT}/probes/GUIDE_CAPTURE_FIX30/control-fixtures`;
const RECEIPT=`${ROOT}/evidence/GUIDE_CAPTURE_FIX30-screenshot-control-proof.json`;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
for (const path of [OUTPUT,RECEIPT]) {
  try { await access(path); throw new Error(`GUIDE_CAPTURE_FIX30_OUTPUT_PRESENT:${path}`); }
  catch (error) { if (error?.code!=="ENOENT") throw error; }
}
await mkdir(OUTPUT,{ recursive:false,mode:0o700 });

const shortText="Pricing on the site is informational only — it describes plans and costs but is not a checkout flow, so you cannot purchase or change a plan from it. If you have questions about what a plan includes, Support can explain the published information, but creating or paying for a debate happens through the debate creator after you sign in.";
const longText=`Ghidul public explică fluxul complet. ${"Urmează pașii publicați și păstrează pagina curentă deschisă cât timp verifici fiecare secțiune. ".repeat(22)}`.trim();
const cases=[
  { name:"full-en-short-row1",mode:"full",language:"en",text:shortText,sourceLabel:"Navigate Dialectical Engine",action:null },
  { name:"full-ro-long",mode:"full",language:"ro",text:longText,sourceLabel:"Navighează în Dialectical Engine",action:{ label:"Deschide Ajutor",href:"/help" } },
  { name:"compact-en-long",mode:"compact",language:"en",text:longText,sourceLabel:"Navigate Dialectical Engine",action:{ label:"Open Help",href:"/help" } },
  { name:"compact-ro-short",mode:"compact",language:"ro",text:shortText,sourceLabel:"Navighează în Dialectical Engine",action:null }
];

function fullMarkup(item) {
  const sourceName=item.language==="ro"?"Surse":"Sources";
  const actionName=item.language==="ro"?"Acțiuni":"Actions";
  const action=item.action===null?"":`<nav aria-label="${actionName}"><a class="action-marker" href="${item.action.href}">${item.action.label}</a></nav>`;
  return `<!doctype html><style>
    html,body{margin:0}.supportDesk{width:820px;height:300px;min-height:0;overflow:hidden;display:grid;grid-template-rows:42px minmax(0,1fr);border:4px solid #111}
    .supportHeader{height:42px;background:#ddd}.supportDeskBody{min-height:0;display:grid;grid-template-columns:1fr}
    .supportAgent{min-height:0;display:grid;grid-template-rows:34px minmax(0,1fr) 30px}.supportAgentHeader,.supportComposer{background:#eee}
    .supportChatScroll{min-height:0;overflow:auto;padding:8px}.supportConversation{display:flex;flex-direction:column;gap:8px}
    .supportMessage{box-sizing:border-box;width:760px;padding:10px;background:#fff;color:#111}.previous{height:48px}
    .top-marker{height:18px;background:rgb(11,211,31)}p{font:16px/22px serif;margin:8px 0}
    .supportCitation{min-height:74px;background:rgb(230,230,230);padding:8px}
    .source-marker{display:block;background:rgb(221,31,41);color:#fff}.action-marker{display:block;background:rgb(31,61,221);color:#fff}
  </style><div class="supportDesk"><header class="supportHeader">Support</header><div class="supportDeskBody"><section class="supportAgent"><header class="supportAgentHeader">Agent</header><div class="supportChatScroll"><div class="supportConversation">
    <article class="supportMessage previous" data-role="assistant"><p>Previous answer</p></article>
    <article class="supportMessage" data-role="assistant"><div class="top-marker"></div><p>${item.text}</p><footer class="supportCitation"><div role="list" aria-label="${sourceName}"><span class="source-marker" role="listitem">${item.sourceLabel}</span></div>${action}</footer></article>
  </div></div><div class="supportComposer">Composer</div></section></div></div>`;
}
function compactMarkup(item) {
  const sourceName=item.language==="ro"?"Surse":"Sources";
  const actionName=item.language==="ro"?"Acțiuni":"Actions";
  const action=item.action===null?"":`<nav aria-label="${actionName}"><a class="action-marker" href="${item.action.href}">${item.action.label}</a></nav>`;
  return `<!doctype html><style>
    html,body{margin:0}.supportAssistantCompact{width:360px;height:260px;overflow:auto;border:3px solid #111}.supportConversation{display:flex;flex-direction:column;gap:8px}
    .supportMessage{box-sizing:border-box;width:340px;padding:9px;background:#fff}.previous{height:45px}.top-marker{height:14px;background:rgb(11,211,31)}p{font:15px/20px serif;margin:7px 0}
    .supportCitation{min-height:68px;background:rgb(230,230,230);padding:7px}.source-marker{display:block;background:rgb(221,31,41);color:#fff}.action-marker{display:block;background:rgb(31,61,221);color:#fff}
  </style><div class="supportAssistantCompact"><div class="supportConversation"><article class="supportMessage previous" data-role="assistant"><p>Previous answer</p></article><article class="supportMessage" data-role="assistant"><div class="top-marker"></div><p>${item.text}</p><footer class="supportCitation"><div role="list" aria-label="${sourceName}"><span class="source-marker" role="listitem">${item.sourceLabel}</span></div>${action}</footer></article></div></div>`;
}
async function state(page,root) {
  return page.evaluate(rootQuery=>{
    const rootElement=document.querySelector(rootQuery);
    const target=[...document.querySelectorAll(`${rootQuery} .supportMessage[data-role="assistant"]`)][1];
    if (rootElement===null||target===undefined) throw new Error("FIXTURE_STATE_TARGET_MISSING");
    const ancestors=[];
    for(let element=target.parentElement;element!==null;element=element.parentElement){
      if(!rootElement.contains(element)&&element!==rootElement)break;
      ancestors.push({ cssText:element.style.cssText,scrollTop:element.scrollTop,scrollLeft:element.scrollLeft });
      if(element===rootElement)break;
    }
    return { ancestors,pageScroll:{x:window.scrollX,y:window.scrollY} };
  },root);
}

const browser=await chromium.launch({ executablePath:EXECUTABLE_PATH,headless:true });
const results=[];
let supportAttempts=0;
try {
  for (const [index,item] of cases.entries()) {
    const page=await browser.newPage({ viewport:item.mode==="full"?{ width:920,height:620 }:{ width:390,height:844 } });
    await page.route("**/api/v1/support/**",route=>{ supportAttempts+=1; return route.abort(); });
    await page.setContent(item.mode==="full"?fullMarkup(item):compactMarkup(item));
    const root=item.mode==="full"?".supportDesk":".supportAssistantCompact";
    const paneSelector=item.mode==="full"?".supportChatScroll":root;
    const targetSelector=`${root} .supportMessage[data-role="assistant"]`;
    const article=page.locator(targetSelector).nth(1);
    const api={ text:item.text,sources:[{ id:"app-navigation",label:item.sourceLabel }],actions:item.action===null?[]:[{ id:"help",...item.action }] };
    const visible={ text:item.text,sources:[item.sourceLabel],actions:item.action===null?[]:[item.action] };
    const paths={ screenshotPath:`${OUTPUT}/${item.name}-complete.png`,topPaneScreenshotPath:`${OUTPUT}/${item.name}-top.png`,footerPaneScreenshotPath:`${OUTPUT}/${item.name}-footer.png` };
    const beforeState=await state(page,root);
    const beforeViewport=page.viewportSize();
    const evidence=await captureCompleteGuideAnswerScreenshot({ page,article,root,row:{ sequence:index+1,prompt:item.name,mode:item.mode,language:item.language },api,visible,beforeAssistantCount:1,...paths });
    assert.deepEqual(await state(page,root),beforeState);
    assert.deepEqual(page.viewportSize(),beforeViewport);
    assert.equal(evidence.completePng.expansion.stylesScrollViewportRestored,true);
    assert.equal(evidence.originalPaneTopReachable,true);
    assert.equal(evidence.originalPaneFooterReachable,true);
    assert.equal(evidence.completeAnswerExpandedCapture,true);
    const complete=await readFile(paths.screenshotPath);
    results.push({ name:item.name,mode:item.mode,language:item.language,completeSha256:sha256(complete),completeBytes:complete.byteLength,
      completeWidth:evidence.completePng.width,completeHeight:evidence.completePng.height,ancestorCount:evidence.completePng.expansion.ancestorCount,
      stylesScrollViewportRestored:evidence.completePng.expansion.stylesScrollViewportRestored });

    const negativeBase={ page,root,row:{ sequence:99,prompt:"negative",mode:item.mode,language:item.language },api,visible,...paths };
    await assert.rejects(captureCompleteGuideAnswerScreenshot({ ...negativeBase,article:page.locator(targetSelector).first(),beforeAssistantCount:1 }),/GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH/u);
    await assert.rejects(captureCompleteGuideAnswerScreenshot({ ...negativeBase,article,beforeAssistantCount:0 }),/GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH/u);
    await assert.rejects(captureCompleteGuideAnswerScreenshot({ ...negativeBase,article,beforeAssistantCount:1,visible:{ ...visible,text:`${visible.text} stale` } }),/GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH/u);

    if (item.name==="full-ro-long") {
      const oldBase=`${OUTPUT}/full-ro-long-old-clipped-base.png`;
      const oldFooterVariant=`${OUTPUT}/full-ro-long-old-clipped-footer-variant.png`;
      await oldScreenshot({ page,article,paneSelector,path:oldBase });
      await page.locator(".supportCitation").evaluate(element=>{element.style.background="rgb(3,4,5)";});
      await page.locator(".source-marker").evaluate(element=>{element.style.background="rgb(4,5,6)";});
      await page.locator(".action-marker").evaluate(element=>{element.style.background="rgb(5,6,7)";});
      await oldScreenshot({ page,article,paneSelector,path:oldFooterVariant });
      assert.equal(sha256(await readFile(oldBase)),sha256(await readFile(oldFooterVariant)));

      await page.locator(".supportCitation").evaluate(element=>{element.style.background="rgb(230,230,230)";});
      await page.locator(".source-marker").evaluate(element=>{element.style.background="rgb(221,31,41)";});
      await page.locator(".action-marker").evaluate(element=>{element.style.background="rgb(31,61,221)";});
      const paintBase=`${OUTPUT}/full-ro-long-painted-base.png`;
      const paintTop=`${OUTPUT}/full-ro-long-painted-top-variant.png`;
      const paintFooter=`${OUTPUT}/full-ro-long-painted-footer-variant.png`;
      const paintSource=`${OUTPUT}/full-ro-long-painted-source-variant.png`;
      const paintAction=`${OUTPUT}/full-ro-long-painted-action-variant.png`;
      const capture=path=>fixedScreenshot({ page,article,root,targetSelector,targetIndex:1,paneSelector,path });
      await capture(paintBase);
      const baseDigest=sha256(await readFile(paintBase));
      await page.locator(".top-marker").evaluate(element=>{element.style.background="rgb(201,1,201)";});
      await capture(paintTop); assert.notEqual(sha256(await readFile(paintTop)),baseDigest);
      await page.locator(".top-marker").evaluate(element=>{element.style.background="rgb(11,211,31)";});
      await page.locator(".supportCitation").evaluate(element=>{element.style.background="rgb(201,201,1)";});
      await capture(paintFooter); assert.notEqual(sha256(await readFile(paintFooter)),baseDigest);
      await page.locator(".supportCitation").evaluate(element=>{element.style.background="rgb(230,230,230)";});
      await page.locator(".source-marker").evaluate(element=>{element.style.background="rgb(1,201,201)";});
      await capture(paintSource); assert.notEqual(sha256(await readFile(paintSource)),baseDigest);
      await page.locator(".source-marker").evaluate(element=>{element.style.background="rgb(221,31,41)";});
      await page.locator(".action-marker").evaluate(element=>{element.style.background="rgb(201,101,1)";});
      await capture(paintAction); assert.notEqual(sha256(await readFile(paintAction)),baseDigest);
      await page.locator(".action-marker").evaluate(element=>{element.style.background="rgb(31,61,221)";});
      assert.deepEqual(await state(page,root),beforeState);
      assert.deepEqual(page.viewportSize(),beforeViewport);

      await assert.rejects(capture(OUTPUT));
      assert.deepEqual(await state(page,root),beforeState);
      assert.deepEqual(page.viewportSize(),beforeViewport);
    }
    await page.close();
  }
  assert.equal(supportAttempts,0);
  const receipt={ schemaVersion:1,node:"GUIDE_CAPTURE_FIX30_SCREENSHOT_CONTROLS",result:"PASS_COMPLETE_FULL_ANSWER_CAPTURE",
    cases:results,oldClippedDiscriminator:{ footerSourceActionMutationChangedOldPng:false,oldBehaviorRejected:true },
    paintedEvidence:{ topMutationChangedPng:true,footerMutationChangedPng:true,sourceMutationChangedPng:true,actionMutationChangedPng:true },
    restoration:{ successPath:true,exceptionPath:true,styles:true,scroll:true,viewport:true },
    negatives:{ previousArticleRejected:4,wrongIndexRejected:4,staleProjectionRejected:4 },supportAttempts };
  await writeFile(RECEIPT,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
  process.stdout.write(`${JSON.stringify({ result:receipt.result,cases:results.length,negatives:12,supportAttempts,paintedEvidence:receipt.paintedEvidence })}\n`);
} catch (error) {
  await rm(OUTPUT,{ recursive:true,force:true });
  throw error;
} finally { await browser.close(); }
