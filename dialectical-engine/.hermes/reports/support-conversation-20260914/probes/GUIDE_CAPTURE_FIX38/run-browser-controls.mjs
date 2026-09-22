import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { captureCompleteGuideAnswerScreenshot as oldCapture } from "../GUIDE_PREVIEW_RECOVER34/screenshot-evidence-successor.mjs";
import { captureCompleteGuideAnswerScreenshot as correctedCapture,revealFooterIfNeeded } from "./screenshot-evidence-successor.mjs";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const product=`${root}/.worktrees/support-conversation-cp1/dialectical-engine`;
const R=`${root}/.hermes/reports/support-conversation-20260914`,E=`${R}/evidence`;
const executable="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const actual=JSON.parse(await readFile(`${E}/GUIDE_LIVE_GUIDE22-actual-receipt.json`,"utf8"));
const cssPath=`${product}/apps/ui/app/globals.css`,assistantPath=`${product}/apps/ui/components/support/Assistant.tsx`;
const cssBytes=await readFile(cssPath),assistantBytes=await readFile(assistantPath);
const css=cssBytes.toString("utf8").split(/\r?\n/u).slice(0,970).join("\n");
const required=new Map([2,15,19,23].map(sequence=>{
  const row=actual.freshRows.find(value=>value.sequence===sequence);
  assert.ok(row,`missing saved row ${sequence}`);
  return [sequence,{ sequence,prompt:row.prompt,mode:"full",language:"ro",text:row.api.text,
    sources:row.api.sources,actions:row.api.actions }];
}));
const expected={
  2:{ sources:["settings-help-menus","app-navigation"],actions:[] },
  15:{ sources:["debate-workspace-menus"],actions:[] },
  19:{ sources:["debate-workspace-menus","guide-how-it-works"],actions:[] },
  23:{ sources:["export-json","guide-how-it-works"],actions:[] }
};
for (const [sequence,row] of required) {
  assert.deepEqual(row.sources.map(source=>source.id),expected[sequence].sources);
  assert.deepEqual(row.actions.map(action=>action.id),expected[sequence].actions);
}
const browser=await chromium.launch({ executablePath:executable,headless:true });
const records=[];let forwardedSupport=0,externalRequests=0;
const attempt=process.env.GUIDE_FIX38_ATTEMPT ?? "final";
const pathFor=(label,suffix)=>`${E}/GUIDE_CAPTURE_FIX38-${attempt}-${label}-${suffix}`;
const absent=async path=>{ try { await access(path);return false; } catch { return true; } };

async function fixture(label,{ paneHeight=null }={}) {
  const context=await browser.newContext({ viewport:{ width:1440,height:1000 } });
  const page=await context.newPage();
  await page.route("**/*",route=>{ const url=route.request().url();if(url.includes("/api/v1/support/"))forwardedSupport+=1;else externalRequests+=1;void route.abort(); });
  const heightOverride=paneHeight===null?"":`.supportDeskBody{align-items:start!important}.supportAgent{align-self:start!important;height:${paneHeight+160}px!important;min-height:0!important}.supportChatScroll{height:${paneHeight}px!important;min-height:${paneHeight}px!important;max-height:${paneHeight}px!important;overflow:auto!important}`;
  await page.setContent(`<!doctype html><html><head><style>${css}\n${heightOverride}</style></head><body><main class="supportPage"><div class="supportDesk" data-support-desk><header class="supportHeader"></header><div class="supportDeskBody"><nav class="supportRail supportTopicRail"></nav><section class="supportAgent"><header class="supportAgentHeader"></header><div class="supportChatScroll"><p class="supportTimestamp">Today · Support conversation</p><div class="supportConversation" aria-label="Support conversation"></div></div><div class="supportComposerDock"><form class="supportComposer"><input aria-label="message"></form></div></section><aside class="supportRail supportRightRail"></aside></div></div></main></body></html>`,{ waitUntil:"load" });
  return { context,page,label };
}
async function append(page,row,{ text=row.text,sources=row.sources,actions=row.actions }={}) {
  return page.evaluate(value=>{
    const conversation=document.querySelector(".supportConversation");
    const user=document.createElement("article");user.className="supportMessage supportMessage--user";user.dataset.role="user";
    const userText=document.createElement("p");userText.textContent=value.prompt;user.append(userText);conversation.append(user);
    const article=document.createElement("article");article.className="supportMessage supportMessage--assistant";article.dataset.role="assistant";article.dataset.sequence=String(value.sequence);
    const shell=document.createElement("div");shell.className="supportMessageShell";
    const tab=document.createElement("div");tab.className="supportMessageTab";tab.ariaHidden="true";
    const core=document.createElement("div");core.className="supportMessageCore";
    const p=document.createElement("p");p.textContent=value.text;core.append(p);
    if(value.sources.length>0||value.actions.length>0){const footer=document.createElement("footer");footer.className="supportCitation";
      if(value.sources.length>0){const list=document.createElement("div");list.setAttribute("role","list");list.setAttribute("aria-label","Surse");for(const source of value.sources){const span=document.createElement("span");span.setAttribute("role","listitem");span.dataset.sourceId=source.id;span.textContent=source.label;list.append(span)}footer.append(list)}
      if(value.actions.length>0){const nav=document.createElement("nav");nav.setAttribute("aria-label","Acțiuni");for(const action of value.actions){const a=document.createElement("a");a.href=action.href;a.dataset.actionId=action.id;a.textContent=action.label;nav.append(a)}footer.append(nav)}core.append(footer)}
    shell.append(tab,core);article.append(shell);conversation.append(article);
    const pane=document.querySelector(".supportChatScroll");pane.scrollTop=pane.scrollHeight;
    return document.querySelectorAll('.supportMessage[data-role="assistant"]').length-1;
  },row);
}
const visible=row=>({ text:row.text,sources:row.sources.map(source=>source.label),actions:row.actions.map(({label,href})=>({label,href})) });
const api=row=>({ text:row.text,sources:row.sources,actions:row.actions });
const paths=label=>({ screenshotPath:pathFor(label,"complete-expanded.png"),topPaneScreenshotPath:pathFor(label,"original-pane-top.png"),footerPaneScreenshotPath:pathFor(label,"original-pane-footer.png"),failureDiagnosticPath:pathFor(label,"failure.json") });
async function populateFour(page){for(const sequence of [2,15,19,23])await append(page,required.get(sequence));}
async function runCapture(capture,fx,row,before,label,options={}) {
  const article=fx.page.locator('.supportDesk .supportMessage[data-role="assistant"]').nth(options.articleIndex??before);
  return capture({ page:fx.page,article,root:".supportDesk",row,api:api(row),visible:options.visible??visible(row),beforeAssistantCount:before,...paths(label) });
}

try {
  const old=await fixture("old");await populateFour(old.page);let oldResult=null,oldError=null;
  try { oldResult=await runCapture(oldCapture,old,required.get(23),3,"old-row23"); } catch(error){ oldError=error; }
  const oldBackward=oldResult!==null && oldResult.footerView.paneScrollTop < oldResult.topView.paneScrollTop;
  assert.equal(oldBackward || oldError?.message==="GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE",true);
  records.push({ name:"old helper RED: contained footer moves backward or fails",passed:true,oldBackward,oldFailure:oldError?.message??null,
    topScrollTop:oldResult?.topView.paneScrollTop??null,footerScrollTop:oldResult?.footerView.paneScrollTop??null });await old.context.close();

  const corrected=await fixture("corrected");await populateFour(corrected.page);
  const correctedResult=await runCapture(correctedCapture,corrected,required.get(23),3,"corrected-row23");
  assert.equal(correctedResult.footerScroll.action,"PRESERVED_ALREADY_CONTAINED");assert.equal(correctedResult.footerScroll.requestedDelta,0);
  assert.equal(correctedResult.preFooterView.paneScrollTop,correctedResult.footerView.paneScrollTop);
  assert.equal(correctedResult.footerView.footerPainted,true);assert.equal(correctedResult.restoration.paneScrollTopRestored,true);assert.equal(correctedResult.restoration.viewportRestored,true);
  assert.deepEqual(correctedResult.caseIdentitySha256.length,64);
  records.push({ name:"corrected four-turn row23 preserves visible current footer",passed:true,sequence:23,
    sourceIds:required.get(23).sources.map(source=>source.id),scroll:correctedResult.footerScroll,
    preFooter:correctedResult.preFooterView,footer:correctedResult.footerView,restoration:correctedResult.restoration,
    images:{ complete:correctedResult.completePng,top:correctedResult.topPanePng,footer:correctedResult.footerPanePng } });await corrected.context.close();

  const forward=await fixture("forward",{ paneHeight:300 });
  const longRow={ sequence:38,prompt:"Long fixture",mode:"full",language:"ro",text:Array.from({length:50},(_,index)=>`Linie publică ${index+1}: ghid de produs.`).join("\n"),sources:required.get(23).sources,actions:[] };
  await append(forward.page,longRow);
  const forwardBefore=await forward.page.evaluate(()=>{const pane=document.querySelector('.supportChatScroll'),target=document.querySelector('.supportMessage[data-role="assistant"]'),top=target.firstElementChild,footer=target.querySelector('.supportCitation'),pr=pane.getBoundingClientRect(),tr=top.getBoundingClientRect();pane.scrollTop+=tr.top-pr.top-10;const map=e=>{const r=e.getBoundingClientRect();return{top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return{priorScrollTop:pane.scrollTop,pane:map(pane),top:map(top),footer:map(footer),scrollHeight:pane.scrollHeight,clientHeight:pane.clientHeight}});
  assert.ok(forwardBefore.top.top>=forwardBefore.pane.top);assert.ok(forwardBefore.footer.bottom>forwardBefore.pane.bottom);
  const forwardScroll=await revealFooterIfNeeded({page:forward.page,targetSelector:'.supportDesk .supportMessage[data-role="assistant"]',paneSelector:'.supportChatScroll',targetIndex:0});
  const forwardAfter=await forward.page.evaluate(()=>{const pane=document.querySelector('.supportChatScroll'),footer=document.querySelector('.supportCitation'),pr=pane.getBoundingClientRect(),fr=footer.getBoundingClientRect(),style=getComputedStyle(footer),hit=document.elementFromPoint(fr.left+fr.width/2,fr.top+fr.height/2);return{paneScrollTop:pane.scrollTop,pane:{top:pr.top,left:pr.left,right:pr.right,bottom:pr.bottom},footer:{top:fr.top,left:fr.left,right:fr.right,bottom:fr.bottom},contained:fr.top>=pr.top&&fr.bottom<=pr.bottom&&fr.left>=pr.left&&fr.right<=pr.right,painted:style.display!=="none"&&style.visibility!=="hidden"&&Number(style.opacity)>0&&(hit===footer||footer.contains(hit))}});
  assert.equal(forwardScroll.action,"SCROLLED_FORWARD");assert.ok(forwardScroll.requestedDelta>0);assert.ok(forwardAfter.paneScrollTop>forwardBefore.priorScrollTop);assert.equal(forwardAfter.contained,true);assert.equal(forwardAfter.painted,true);
  const forwardImage=pathFor("forward","original-pane-footer.png");await forward.page.locator('.supportChatScroll').screenshot({path:forwardImage,animations:"disabled"});const forwardImageBytes=await readFile(forwardImage);
  await forward.page.locator('.supportChatScroll').evaluate((pane,scrollTop)=>{pane.scrollTop=scrollTop},forwardBefore.priorScrollTop);const forwardRestored=await forward.page.locator('.supportChatScroll').evaluate((pane,scrollTop)=>pane.scrollTop===scrollTop,forwardBefore.priorScrollTop);assert.equal(forwardRestored,true);
  records.push({ name:"genuinely below-pane footer scrolls forward into painted containment",passed:true,scroll:forwardScroll,before:forwardBefore,after:forwardAfter,restored:forwardRestored,image:{path:forwardImage,sha256:sha(forwardImageBytes),bytes:forwardImageBytes.byteLength} });await forward.context.close();

  const impossible=await fixture("impossible");await append(impossible.page,required.get(23));
  await impossible.page.locator('.supportCitation').evaluate(element=>{element.style.position="fixed";element.style.top="-120px";element.style.left="430px";element.style.width="300px";});
  let impossibleError=null;try{await runCapture(correctedCapture,impossible,required.get(23),0,"impossible");}catch(error){impossibleError=error;}
  assert.equal(impossibleError?.message.includes("GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE"),true);const impossibleDiagnostic=JSON.parse(await readFile(paths("impossible").failureDiagnosticPath,"utf8"));assert.equal(impossibleDiagnostic.failureCode,"GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE");assert.equal(impossibleDiagnostic.restoration.paneScrollTopRestored,true);assert.notEqual(impossibleDiagnostic.geometry.preFooter,null);assert.notEqual(impossibleDiagnostic.geometry.postFooter,null);
  records.push({ name:"unreachable clipped footer rejects with geometry and restoration",passed:true,diagnostic:impossibleDiagnostic });await impossible.context.close();

  const stale=await fixture("stale");await append(stale.page,required.get(2));await append(stale.page,required.get(23));let staleError=null;
  try{await runCapture(correctedCapture,stale,required.get(23),1,"stale",{articleIndex:0});}catch(error){staleError=error;}
  assert.equal(staleError?.message,"GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH");const staleDiagnostic=JSON.parse(await readFile(paths("stale").failureDiagnosticPath,"utf8"));assert.equal(staleDiagnostic.phase,"PRE_CAPTURE_IDENTITY");assert.equal(await absent(paths("stale").topPaneScreenshotPath),true);records.push({ name:"previous target rejects before capture",passed:true,diagnostic:staleDiagnostic });await stale.context.close();

  const mutation=await fixture("mutation");await append(mutation.page,required.get(23));let mutationError=null;
  try{await runCapture(correctedCapture,mutation,required.get(23),0,"mutation",{visible:{...visible(required.get(23)),sources:["mutated"]}});}catch(error){mutationError=error;}
  assert.equal(mutationError?.message,"GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH");const mutationDiagnostic=JSON.parse(await readFile(paths("mutation").failureDiagnosticPath,"utf8"));assert.equal(mutationDiagnostic.observed.sourceLabelsEqual,false);assert.equal(await absent(paths("mutation").topPaneScreenshotPath),true);records.push({ name:"source mutation rejects before capture",passed:true,diagnostic:mutationDiagnostic });await mutation.context.close();

  assert.equal(forwardedSupport,0);assert.equal(externalRequests,0);
  const proof={ schemaVersion:1,node:"GUIDE_CAPTURE_FIX38",revision:"0d34f82f4a2188d0ce1db04655b693798ffd2169",verdict:"PASS_FOOTER_CAPTURE_CONTROLS",controls:records.length,passed:records.length,records,traffic:{ forwardedSupport,externalRequests,status:0,capacity:0,database:0,model:0 },productionInputs:{ assistant:{ path:assistantPath,sha256:sha(assistantBytes),bytes:assistantBytes.byteLength },css:{ path:cssPath,sha256:sha(cssBytes),bytes:cssBytes.byteLength,exactPrefixLines:970 },savedReceipt:{ path:`${E}/GUIDE_LIVE_GUIDE22-actual-receipt.json`,sha256:sha(await readFile(`${E}/GUIDE_LIVE_GUIDE22-actual-receipt.json`)) } } };
  await writeFile(`${E}/GUIDE_CAPTURE_FIX38-browser-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{ flag:"wx",mode:0o600 });
  console.log(JSON.stringify({ passed:proof.passed,controls:proof.controls,oldBackward,oldFailure:oldError?.message??null,correctedAction:correctedResult.footerScroll.action,forwardAction:forwardScroll.action,impossible:impossibleDiagnostic.failureCode,forwardedSupport,externalRequests }));
} finally { await browser.close(); }
