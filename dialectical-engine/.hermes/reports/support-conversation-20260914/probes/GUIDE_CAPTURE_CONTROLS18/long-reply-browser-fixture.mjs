import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { captureCompleteGuideAnswerScreenshot,screenshotCompleteArticle } from "./screenshot-evidence-successor.mjs";

const EXECUTABLE_PATH="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const outputDirectory=process.argv[2];
const receiptPath=process.argv[3];
if (typeof outputDirectory !== "string" || !outputDirectory.startsWith("/")
  || typeof receiptPath !== "string" || !receiptPath.startsWith("/")) {
  throw new Error("GUIDE_CAPTURE_CONTROLS18_LONG_FIXTURE_ARGUMENT_INVALID");
}
await mkdir(outputDirectory,{ recursive:false,mode:0o700 });
const browser=await chromium.launch({ executablePath:EXECUTABLE_PATH,headless:true });
try {
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
  const screenshotPath=`${outputDirectory}/long-answer-complete-expanded.png`;
  const evidence=await captureCompleteGuideAnswerScreenshot({
    page,article,root:".supportDesk",row:{ sequence:901,prompt:"Long guide fixture",mode:"full",language:"en" },api,visible,
    beforeAssistantCount:0,screenshotPath,
    topPaneScreenshotPath:`${outputDirectory}/long-answer-original-pane-top.png`,
    footerPaneScreenshotPath:`${outputDirectory}/long-answer-original-pane-footer.png`
  });
  assert.equal(evidence.before.paneScrollHeight > evidence.before.paneClientHeight,true);
  assert.equal(evidence.originalPaneTopReachable,true);
  assert.equal(evidence.originalPaneFooterReachable,true);
  assert.equal(evidence.completeAnswerExpandedCapture,true);
  assert.equal(evidence.completePng.height >= evidence.before.target.height,true);

  const original=await readFile(screenshotPath);
  const digest=bytes => createHash("sha256").update(bytes).digest("hex");
  await page.locator(".supportCitation").evaluate(element => { element.style.background="rgb(240,1,2)"; });
  const footerVariant=`${outputDirectory}/long-answer-complete-footer-variant.png`;
  await screenshotCompleteArticle({ page,article,paneSelector:".supportChatScroll",path:footerVariant });
  await page.locator(".supportCitation").evaluate(element => { element.style.background="rgb(40,50,60)"; });
  await page.locator(".top-marker").evaluate(element => { element.style.background="rgb(3,240,4)"; });
  const topVariant=`${outputDirectory}/long-answer-complete-top-variant.png`;
  await screenshotCompleteArticle({ page,article,paneSelector:".supportChatScroll",path:topVariant });
  const footerBytes=await readFile(footerVariant);
  const topBytes=await readFile(topVariant);
  assert.notEqual(digest(original),digest(footerBytes));
  assert.notEqual(digest(original),digest(topBytes));
  assert.equal(supportAttempts,0);
  const receipt={
    schemaVersion:1,node:"GUIDE_CAPTURE_CONTROLS18_LONG_REPLY_FIXTURE",result:"PASS",
    correction:"expanded_evidence_capture_plus_original_pane_top_footer_views",
    originalPanePresentationPreserved:true,completeCapturePresentation:"evidence_only_expanded_pane",
    overheight:true,articleHeight:evidence.before.target.height,paneClientHeight:evidence.before.paneClientHeight,
    exactArticleEvidence:evidence,footerPixelInfluence:true,topPixelInfluence:true,supportAttempts
  };
  await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
  process.stdout.write(`${JSON.stringify({ result:"PASS",supportAttempts,articleHeight:evidence.before.target.height,paneClientHeight:evidence.before.paneClientHeight })}\n`);
} finally {
  await browser.close();
}
