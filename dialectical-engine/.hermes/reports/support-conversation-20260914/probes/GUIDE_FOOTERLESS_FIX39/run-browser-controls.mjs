import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { captureCompleteGuideAnswerScreenshot as oldCapture } from "../GUIDE_CAPTURE_FIX38/screenshot-evidence-successor.mjs";
import { captureCompleteGuideAnswerScreenshot as correctedCapture } from "./screenshot-evidence-successor.mjs";
import { expectedLayoutFromValidatedProjection } from "./capture-call-contract.mjs";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const product=`${root}/.worktrees/support-conversation-cp1/dialectical-engine`;
const R=`${root}/.hermes/reports/support-conversation-20260914`,E=`${R}/evidence`;
const executable="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const cssPath=`${product}/apps/ui/app/globals.css`,assistantPath=`${product}/apps/ui/components/support/Assistant.tsx`;
const cssBytes=await readFile(cssPath),assistantBytes=await readFile(assistantPath);
const css=cssBytes.toString("utf8");
const actual=JSON.parse(await readFile(`${E}/GUIDE_LIVE_GUIDE23-actual-receipt.json`,"utf8"));
const observed=actual.freshRows.find(({sequence})=>sequence===47);assert.ok(observed);assert.deepEqual(observed.api.sources,[]);assert.deepEqual(observed.api.actions,[]);
const actualRow={sequence:47,prompt:observed.prompt,mode:"full",language:"ro",text:observed.api.text,sources:[],actions:[]};
const browser=await chromium.launch({executablePath:executable,headless:true});
let forwardedSupport=0,externalRequests=0;const records=[];
const attempt=process.env.GUIDE_FIX39_ATTEMPT??"final";
const pathFor=(label,suffix)=>`${E}/GUIDE_FOOTERLESS_FIX39-${attempt}-${label}-${suffix}`;
const paths=label=>({screenshotPath:pathFor(label,"complete-expanded.png"),topPaneScreenshotPath:pathFor(label,"original-pane-start.png"),footerPaneScreenshotPath:pathFor(label,"original-pane-end.png"),failureDiagnosticPath:pathFor(label,"failure.json")});
const api=row=>({text:row.text,sources:row.sources,actions:row.actions});
const visible=row=>({text:row.text,sources:row.sources.map(x=>x.label),actions:row.actions.map(({label,href})=>({label,href}))});
const absent=async path=>{try{await access(path);return false;}catch{return true;}};

async function fixture(mode,{paneHeight=380}={}){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  await page.route("**/*",route=>{const url=route.request().url();if(url.includes("/api/v1/support/"))forwardedSupport+=1;else externalRequests+=1;void route.abort();});
  const rootClass=mode==="full"?"supportDesk":"supportAssistantCompact";
  const inside=mode==="full"?`<header class="supportHeader"></header><div class="supportDeskBody"><nav class="supportRail supportTopicRail"></nav><section class="supportAgent"><header class="supportAgentHeader"></header><div class="supportChatScroll"><p class="supportTimestamp">Today · Support conversation</p><div class="supportConversation"></div></div><div class="supportComposerDock"><form class="supportComposer"><input></form></div></section><aside class="supportRail supportRightRail"></aside></div>`:`<div class="supportConversation"></div>`;
  await page.setContent(`<!doctype html><html><head><style>${css}\n.supportDeskBody{align-items:start!important}.supportAgent{align-self:start!important;height:${paneHeight+160}px;min-height:0}.supportChatScroll,.supportAssistantCompact{height:${paneHeight}px;min-height:${paneHeight}px;max-height:${paneHeight}px;overflow:auto}</style></head><body><main class="supportPage"><div class="${rootClass}">${inside}</div></main></body></html>`,{waitUntil:"load"});
  return{context,page,rootSelector:`.${rootClass}`};
}
async function append(fx,row,{renderSources=row.sources,renderActions=row.actions}={}){
  return fx.page.evaluate(({rootSelector,row,renderSources,renderActions})=>{const conversation=document.querySelector(`${rootSelector} .supportConversation`);const user=document.createElement("article");user.className="supportMessage supportMessage--user";user.dataset.role="user";const up=document.createElement("p");up.textContent=row.prompt;user.append(up);conversation.append(user);const article=document.createElement("article");article.className="supportMessage supportMessage--assistant";article.dataset.role="assistant";const shell=document.createElement("div");shell.className="supportMessageShell";const tab=document.createElement("div");tab.className="supportMessageTab";const core=document.createElement("div");core.className="supportMessageCore";const p=document.createElement("p");p.textContent=row.text;core.append(p);if(renderSources.length||renderActions.length){const footer=document.createElement("footer");footer.className="supportCitation";if(renderSources.length){const list=document.createElement("div");list.role="list";for(const source of renderSources){const item=document.createElement("span");item.role="listitem";item.dataset.sourceId=source.id;item.textContent=source.label;list.append(item)}footer.append(list)}if(renderActions.length){const nav=document.createElement("nav");for(const action of renderActions){const a=document.createElement("a");a.href=action.href;a.dataset.actionId=action.id;a.textContent=action.label;nav.append(a)}footer.append(nav)}core.append(footer)}shell.append(tab,core);article.append(shell);conversation.append(article);const pane=rootSelector===".supportDesk"?document.querySelector(".supportChatScroll"):document.querySelector(rootSelector);pane.scrollTop=pane.scrollHeight;return document.querySelectorAll(`${rootSelector} .supportMessage[data-role=assistant]`).length-1;},{rootSelector:fx.rootSelector,row,renderSources,renderActions});
}
async function capture(captureFn,fx,row,before,label,{articleIndex=before,expectedLayout=undefined,projectedVisible=visible(row)}={}){
  const article=fx.page.locator(`${fx.rootSelector} .supportMessage[data-role="assistant"]`).nth(articleIndex),projection=api(row);
  return captureFn({page:fx.page,article,root:fx.rootSelector,row,api:projection,visible:projectedVisible,beforeAssistantCount:before,...paths(label),...(captureFn===correctedCapture?{expectedLayout:expectedLayout??expectedLayoutFromValidatedProjection({api:projection,visible:projectedVisible})}:{})});
}

try{
  const old=await fixture("full");await append(old,actualRow);let oldError=null;try{await capture(oldCapture,old,actualRow,0,"old-row47");}catch(error){oldError=error;}assert.ok(oldError?.message.includes("GUIDE_CAPTURE_SCROLL_EDGE_MISSING"));records.push({name:"old FIX38 helper rejects exact saved footerless row47",passed:true,code:"GUIDE_CAPTURE_SCROLL_EDGE_MISSING"});await old.context.close();

  const shortCases=[
    {mode:"full",language:"ro",row:actualRow,label:"full-ro-short"},
    {mode:"compact",language:"ro",row:{...actualRow,sequence:147,mode:"compact"},label:"compact-ro-short"},
    {mode:"full",language:"en",row:{...actualRow,sequence:148,language:"en",prompt:"Reset my password.",text:"Support cannot receive credentials and cannot reset, validate, or send a password, reset token, or recovery code."},label:"full-en-short"},
    {mode:"compact",language:"en",row:{...actualRow,sequence:149,mode:"compact",language:"en",prompt:"Reset my password.",text:"Support cannot receive credentials and cannot reset, validate, or send a password, reset token, or recovery code."},label:"compact-en-short"}
  ];
  for(const item of shortCases){const fx=await fixture(item.mode);await append(fx,item.row);const result=await capture(correctedCapture,fx,item.row,0,item.label);assert.equal(result.endEvidenceKind,"BODY_END");assert.equal(result.sourceActionLayoutIncluded,false);assert.equal(result.originalPaneBodyEndReachable,true);assert.equal(result.endView.bodyEndPainted,true);assert.equal(result.restoration.paneScrollTopRestored,true);assert.equal(result.restoration.viewportRestored,true);records.push({name:`${item.mode} ${item.language} short footerless body start/end`,passed:true,sequence:item.row.sequence,endScroll:result.endScroll,images:{start:result.topPanePng,end:result.endPanePng,complete:result.completePng},restoration:result.restoration});await fx.context.close();}

  const longRow={...actualRow,sequence:150,language:"en",prompt:"Long footerless boundary",text:Array.from({length:60},(_,i)=>`Public refusal explanation line ${i+1}; no private account data is available.`).join("\n")};
  const long=await fixture("full",{paneHeight:280});await append(long,longRow);const longResult=await capture(correctedCapture,long,longRow,0,"full-en-long");assert.equal(longResult.endEvidenceKind,"BODY_END");assert.equal(longResult.endScroll.action,"SCROLLED_FORWARD");assert.ok(longResult.endScroll.assignedScrollTop>longResult.endScroll.priorScrollTop);assert.equal(longResult.endView.bodyEndPainted,true);assert.equal(longResult.restoration.paneScrollTopRestored,true);records.push({name:"long footerless reply proves painted body start and body end",passed:true,endScroll:longResult.endScroll,views:{start:longResult.topView,end:longResult.endView},images:{start:longResult.topPanePng,end:longResult.endPanePng,complete:longResult.completePng},restoration:longResult.restoration});await long.context.close();

  const expectedFooter={...actualRow,sequence:151,text:"Grounded public guidance.",sources:[{id:"app-navigation",label:"Navigate Dialectical Engine"}]};const missing=await fixture("full");await append(missing,expectedFooter,{renderSources:[]});let missingError=null;try{await capture(correctedCapture,missing,expectedFooter,0,"expected-footer-missing");}catch(error){missingError=error;}assert.equal(missingError?.message,"GUIDE_CAPTURE_EXPECTED_FOOTER_MISSING");const missingDiagnostic=JSON.parse(await readFile(paths("expected-footer-missing").failureDiagnosticPath,"utf8"));assert.equal(missingDiagnostic.failureCode,"GUIDE_CAPTURE_EXPECTED_FOOTER_MISSING");assert.equal(missingDiagnostic.restoration.paneScrollTopRestored,true);records.push({name:"missing expected source footer rejects with diagnostic and restoration",passed:true,diagnostic:missingDiagnostic});await missing.context.close();

  const stale=await fixture("full");await append(stale,{...actualRow,sequence:146,text:"Previous reply."});await append(stale,actualRow);let staleError=null;try{await capture(correctedCapture,stale,actualRow,1,"stale",{articleIndex:0});}catch(error){staleError=error;}assert.equal(staleError?.message,"GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH");assert.equal(await absent(paths("stale").topPaneScreenshotPath),true);records.push({name:"previous target remains rejected before capture",passed:true,code:staleError.message});await stale.context.close();

  const layoutApi=api(expectedFooter),badVisible={text:expectedFooter.text,sources:[],actions:[]};let contractError=null;try{expectedLayoutFromValidatedProjection({api:layoutApi,visible:badVisible});}catch(error){contractError=error;}assert.equal(contractError?.message.startsWith("GUIDE_CAPTURE_VALIDATED_SOURCE_LAYOUT_MISMATCH"),true);records.push({name:"call contract rejects mismatched validated source projection",passed:true,code:contractError.message});

  assert.equal(forwardedSupport,0);assert.equal(externalRequests,0);
  const proof={schemaVersion:1,node:"GUIDE_FOOTERLESS_FIX39",ticket:"t_37ac3d2f",revision:"0d34f82f4a2188d0ce1db04655b693798ffd2169",verdict:"PASS_FOOTERLESS_HELPER_CONTROLS",controls:records.length,passed:records.length,records,traffic:{forwardedSupport,externalRequests,http:0,status:0,capacity:0,database:0,support:0,model:0},sourceCustody:{assistant:{path:assistantPath,sha256:sha(assistantBytes),bytes:assistantBytes.byteLength},css:{path:cssPath,sha256:sha(cssBytes),bytes:cssBytes.byteLength},actualRow47Receipt:{path:`${E}/GUIDE_LIVE_GUIDE23-actual-receipt.json`,sha256:sha(await readFile(`${E}/GUIDE_LIVE_GUIDE23-actual-receipt.json`))}},retainedFix38Proof:{path:`${E}/GUIDE_CAPTURE_FIX38-browser-control-proof.json`,sha256:sha(await readFile(`${E}/GUIDE_CAPTURE_FIX38-browser-control-proof.json`))}};
  await writeFile(`${E}/GUIDE_FOOTERLESS_FIX39-control-proof.json`,`${JSON.stringify(proof,null,2)}\n`,{flag:"wx",mode:0o600});console.log(JSON.stringify({passed:proof.passed,controls:proof.controls,oldCode:oldError.message,longAction:longResult.endScroll.action,forwardedSupport,externalRequests}));
}finally{await browser.close();}
