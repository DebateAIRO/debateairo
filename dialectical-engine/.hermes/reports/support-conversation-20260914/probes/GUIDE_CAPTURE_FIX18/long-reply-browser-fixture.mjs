import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { captureGuideAnswerScreenshot } from "./screenshot-evidence.mjs";

const EXECUTABLE_PATH="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const outputDirectory=process.argv[2];
const receiptPath=process.argv[3];
if (typeof outputDirectory !== "string" || !outputDirectory.startsWith("/")
  || typeof receiptPath !== "string" || !receiptPath.startsWith("/")) {
  throw new Error("GUIDE_CAPTURE_FIX18_LONG_FIXTURE_ARGUMENT_INVALID");
}
await mkdir(outputDirectory,{ recursive:false,mode:0o700 });
const browser=await chromium.launch({ executablePath:EXECUTABLE_PATH,headless:true });
const page=await browser.newPage({ viewport:{ width:900,height:700 },deviceScaleFactor:1 });
let supportAttempts=0;
await page.route("**/api/v1/support/**",route => { supportAttempts+=1; return route.abort(); });
await page.setContent(`<!doctype html><style>
  .supportDesk{width:820px}.supportChatScroll{height:240px;overflow:auto;border:4px solid #111}
  .supportConversation{display:flex;flex-direction:column;gap:8px}.supportMessage{width:720px}
  .supportMessageCore{min-height:760px;background:#fff;color:#111;padding:10px}
  .top-marker{height:36px;background:rgb(10,20,30)}.answer-body{height:620px}
  .supportCitation{height:72px;background:rgb(40,50,60)}
</style><div class="supportDesk"><div class="supportChatScroll"><div class="supportConversation">
  <article class="supportMessage supportMessage--assistant" data-role="assistant"><div class="supportMessageCore">
    <div class="top-marker"></div><p>Long public guide answer</p><div class="answer-body"></div>
    <footer class="supportCitation"><div role="list" aria-label="Sources"><span role="listitem">Guide</span></div>
      <nav aria-label="Actions"><a href="/help">Open Help</a></nav></footer>
  </div></article>
</div></div></div>`);
const article=page.locator('.supportDesk .supportMessage[data-role="assistant"]').first();
const api={ text:"Long public guide answer",sources:[{ id:"guide",label:"Guide" }],actions:[{ id:"help",label:"Open Help",href:"/help" }] };
const visible={ text:api.text,sources:["guide"],actions:[{ label:"Open Help",href:"/help" }] };
const screenshotPath=`${outputDirectory}/long-answer.png`;
const evidence=await captureGuideAnswerScreenshot({ page,article,root:".supportDesk",
  row:{ sequence:901,prompt:"Long guide fixture",mode:"full",language:"en" },api,visible,
  beforeAssistantCount:0,screenshotPath });
const geometry=await page.evaluate(() => {
  const article=document.querySelector('.supportMessage[data-role="assistant"]');
  const pane=document.querySelector(".supportChatScroll");
  const top=document.querySelector(".top-marker");
  const footer=document.querySelector(".supportCitation");
  const rect=element => { const value=element.getBoundingClientRect(); return { top:value.top,bottom:value.bottom,left:value.left,right:value.right,height:value.height }; };
  return { article:rect(article),pane:rect(pane),top:rect(top),footer:rect(footer),articleScrollHeight:article.scrollHeight,paneClientHeight:pane.clientHeight };
});
assert.equal(geometry.articleScrollHeight > geometry.paneClientHeight,true);
assert.equal(geometry.top.top >= geometry.article.top && geometry.top.bottom <= geometry.article.bottom,true);
assert.equal(geometry.footer.top >= geometry.article.top && geometry.footer.bottom <= geometry.article.bottom,true);
assert.equal(evidence.pngHeight >= Math.floor(geometry.article.height),true);
const original=await readFile(screenshotPath);
const digest=bytes => createHash("sha256").update(bytes).digest("hex");
await page.locator(".supportCitation").evaluate(element => { element.style.background="rgb(240,1,2)"; });
const footerVariant=`${outputDirectory}/long-answer-footer-variant.png`;
await article.screenshot({ path:footerVariant,animations:"disabled" });
await page.locator(".supportCitation").evaluate(element => { element.style.background="rgb(40,50,60)"; });
await page.locator(".top-marker").evaluate(element => { element.style.background="rgb(3,240,4)"; });
const topVariant=`${outputDirectory}/long-answer-top-variant.png`;
await article.screenshot({ path:topVariant,animations:"disabled" });
const footerBytes=await readFile(footerVariant);
const topBytes=await readFile(topVariant);
assert.notEqual(digest(original),digest(footerBytes));
assert.notEqual(digest(original),digest(topBytes));
assert.equal(supportAttempts,0);
const receipt={ schemaVersion:1,node:"GUIDE_CAPTURE_FIX18_LONG_REPLY_FIXTURE",result:"PASS",
  overheight:true,articleScrollHeight:geometry.articleScrollHeight,paneClientHeight:geometry.paneClientHeight,
  exactArticleEvidence:evidence,footerPixelInfluence:true,topPixelInfluence:true,supportAttempts };
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
await browser.close();
process.stdout.write(`${JSON.stringify({ result:"PASS",supportAttempts,articleScrollHeight:geometry.articleScrollHeight,paneClientHeight:geometry.paneClientHeight })}\n`);
