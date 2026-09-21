import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const same=(left,right) => JSON.stringify(left) === JSON.stringify(right);
const fixedRect=rect => rect === null ? null : Object.freeze({
  x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)
});
const visibleIntersection=(target,pane) => target !== null && pane !== null
  && target.bottom > pane.top && target.top < pane.bottom && target.right > pane.left && target.left < pane.right;

export function validateGuideScreenshotEvidence(value) {
  if (value === null || typeof value !== "object" || value.schemaVersion !== 1
    || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || !Number.isSafeInteger(value.targetAssistantIndex) || value.targetAssistantIndex < 0
    || value.targetAssistantIndex !== value.beforeAssistantCount
    || value.afterAssistantCount !== value.beforeAssistantCount+1
    || value.articleCount !== 1 || value.articleRole !== "assistant"
    || value.targetVisible !== true || value.targetIntersectsCaptureRegion !== true
    || value.exactArticleScreenshot !== true || value.pngWidth < 1 || value.pngHeight < 1
    || typeof value.caseIdentitySha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.caseIdentitySha256)
    || typeof value.screenshotSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.screenshotSha256)
    || value.projectionEqual !== true || value.sourceActionLayoutIncluded !== true) {
    throw new Error("GUIDE_CAPTURE_SCREENSHOT_EVIDENCE_INVALID");
  }
  return Object.freeze(structuredClone(value));
}

export async function captureGuideAnswerScreenshot({ page,article,root,row,api,visible,beforeAssistantCount,screenshotPath }) {
  const pane=root === ".supportDesk" ? page.locator(".supportChatScroll") : page.locator(root);
  const articleCount=await article.count();
  const afterAssistantCount=await page.locator(`${root} .supportMessage[data-role="assistant"]`).count();
  const beforeGeometry=await page.evaluate(([targetSelector,paneSelector,targetIndex]) => {
    const targets=[...document.querySelectorAll(targetSelector)];
    const target=targets[targetIndex] ?? null;
    const capturePane=document.querySelector(paneSelector);
    const map=element => element === null ? null : (() => { const rect=element.getBoundingClientRect(); return { top:rect.top,left:rect.left,right:rect.right,bottom:rect.bottom,x:rect.x,y:rect.y,width:rect.width,height:rect.height }; })();
    return { target:map(target),pane:map(capturePane),paneScrollTop:capturePane?.scrollTop ?? null,paneScrollHeight:capturePane?.scrollHeight ?? null,paneClientHeight:capturePane?.clientHeight ?? null };
  },[`${root} .supportMessage[data-role="assistant"]`,root === ".supportDesk" ? ".supportChatScroll" : root,beforeAssistantCount]);
  await article.scrollIntoViewIfNeeded();
  const afterGeometry=await page.evaluate(([targetSelector,paneSelector,targetIndex]) => {
    const targets=[...document.querySelectorAll(targetSelector)];
    const target=targets[targetIndex] ?? null;
    const capturePane=document.querySelector(paneSelector);
    const map=element => element === null ? null : (() => { const rect=element.getBoundingClientRect(); return { top:rect.top,left:rect.left,right:rect.right,bottom:rect.bottom,x:rect.x,y:rect.y,width:rect.width,height:rect.height }; })();
    return { target:map(target),pane:map(capturePane),paneScrollTop:capturePane?.scrollTop ?? null,paneScrollHeight:capturePane?.scrollHeight ?? null,paneClientHeight:capturePane?.clientHeight ?? null };
  },[`${root} .supportMessage[data-role="assistant"]`,root === ".supportDesk" ? ".supportChatScroll" : root,beforeAssistantCount]);
  const articleRole=await article.getAttribute("data-role");
  const articleText=await article.locator("p").first().innerText();
  const targetVisible=await article.isVisible();
  const targetIntersectsCaptureRegion=visibleIntersection(afterGeometry.target,afterGeometry.pane);
  if (articleCount !== 1 || afterAssistantCount !== beforeAssistantCount+1 || articleRole !== "assistant"
    || articleText !== visible.text || visible.text !== api.text || !targetVisible || !targetIntersectsCaptureRegion
    || !same(visible.sources,api.sources.map(source => source.id))
    || !same(visible.actions,api.actions.map(({ label,href }) => ({ label,href })))) {
    throw new Error("GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH");
  }
  await article.screenshot({ path:screenshotPath,animations:"disabled" });
  const screenshotBytes=await readFile(screenshotPath);
  if (screenshotBytes.length < 24 || screenshotBytes.subarray(1,4).toString("ascii") !== "PNG") {
    throw new Error("GUIDE_CAPTURE_SCREENSHOT_PNG_INVALID");
  }
  const pngWidth=screenshotBytes.readUInt32BE(16);
  const pngHeight=screenshotBytes.readUInt32BE(20);
  const identity={ sequence:row.sequence,prompt:row.prompt,mode:row.mode,language:row.language,
    apiTextSha256:sha256(Buffer.from(api.text)),sources:api.sources.map(source => source.id),actions:api.actions,
    targetAssistantIndex:beforeAssistantCount };
  return validateGuideScreenshotEvidence({
    schemaVersion:1,sequence:row.sequence,mode:row.mode,language:row.language,
    beforeAssistantCount,targetAssistantIndex:beforeAssistantCount,afterAssistantCount,articleCount,articleRole,
    targetVisible,targetIntersectsCaptureRegion,exactArticleScreenshot:true,sourceActionLayoutIncluded:true,
    projectionEqual:true,caseIdentitySha256:sha256(Buffer.from(JSON.stringify(identity))),
    screenshotSha256:sha256(screenshotBytes),screenshotBytes:screenshotBytes.length,pngWidth,pngHeight,
    before:{ target:fixedRect(beforeGeometry.target),pane:fixedRect(beforeGeometry.pane),paneScrollTop:beforeGeometry.paneScrollTop,paneScrollHeight:beforeGeometry.paneScrollHeight,paneClientHeight:beforeGeometry.paneClientHeight },
    after:{ target:fixedRect(afterGeometry.target),pane:fixedRect(afterGeometry.pane),paneScrollTop:afterGeometry.paneScrollTop,paneScrollHeight:afterGeometry.paneScrollHeight,paneClientHeight:afterGeometry.paneClientHeight }
  });
}
