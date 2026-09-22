import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const same=(left,right) => JSON.stringify(left) === JSON.stringify(right);
const fixedRect=rect => rect === null ? null : Object.freeze({
  x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)
});
const intersects=(target,pane) => target !== null && pane !== null
  && target.bottom > pane.top && target.top < pane.bottom && target.right > pane.left && target.left < pane.right;
const contained=(target,pane) => target !== null && pane !== null
  && target.top >= pane.top && target.bottom <= pane.bottom && target.left >= pane.left && target.right <= pane.right;

const readPng=async path => {
  const bytes=await readFile(path);
  if (bytes.length < 24 || bytes.subarray(1,4).toString("ascii") !== "PNG") {
    throw new Error("GUIDE_CAPTURE_SCREENSHOT_PNG_INVALID");
  }
  return Object.freeze({
    path,sha256:sha256(bytes),bytes:bytes.length,
    width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)
  });
};

const geometry=async ({ page,targetSelector,paneSelector,targetIndex }) => page.evaluate(
  ([targetQuery,paneQuery,index]) => {
    const target=[...document.querySelectorAll(targetQuery)][index] ?? null;
    const pane=document.querySelector(paneQuery);
    const top=target?.querySelector(".top-marker") ?? target?.firstElementChild ?? null;
    const footer=target?.querySelector(".supportCitation") ?? null;
    const map=element => element === null ? null : (() => {
      const rect=element.getBoundingClientRect();
      return { top:rect.top,left:rect.left,right:rect.right,bottom:rect.bottom,x:rect.x,y:rect.y,width:rect.width,height:rect.height };
    })();
    return {
      target:map(target),pane:map(pane),top:map(top),footer:map(footer),
      paneScrollTop:pane?.scrollTop ?? null,paneScrollHeight:pane?.scrollHeight ?? null,
      paneClientHeight:pane?.clientHeight ?? null,targetScrollHeight:target?.scrollHeight ?? null
    };
  },[targetSelector,paneSelector,targetIndex]
);

const scrollTargetEdgeIntoPane=async ({ page,targetSelector,paneSelector,targetIndex,edge }) => page.evaluate(
  ([targetQuery,paneQuery,index,requestedEdge]) => {
    const target=[...document.querySelectorAll(targetQuery)][index] ?? null;
    const pane=document.querySelector(paneQuery);
    if (target === null || pane === null) throw new Error("GUIDE_CAPTURE_SCROLL_TARGET_MISSING");
    const edgeElement=requestedEdge === "footer" ? target.querySelector(".supportCitation") : target.querySelector(".top-marker") ?? target.firstElementChild;
    if (edgeElement === null) throw new Error("GUIDE_CAPTURE_SCROLL_EDGE_MISSING");
    const paneRect=pane.getBoundingClientRect();
    const edgeRect=edgeElement.getBoundingClientRect();
    const delta=requestedEdge === "footer" ? edgeRect.bottom-paneRect.bottom : edgeRect.top-paneRect.top;
    pane.scrollTop=Math.max(0,Math.min(pane.scrollHeight-pane.clientHeight,pane.scrollTop+delta));
  },[targetSelector,paneSelector,targetIndex,edge]
);

export async function screenshotCompleteArticle({ page,article,paneSelector,path }) {
  const saved=await page.evaluate(paneQuery => {
    const pane=document.querySelector(paneQuery);
    if (pane === null) throw new Error("GUIDE_CAPTURE_PANE_MISSING");
    const value={
      height:pane.style.height,maxHeight:pane.style.maxHeight,overflow:pane.style.overflow,
      overflowY:pane.style.overflowY,scrollTop:pane.scrollTop
    };
    pane.style.height=`${pane.scrollHeight}px`;
    pane.style.maxHeight="none";
    pane.style.overflow="visible";
    pane.style.overflowY="visible";
    pane.scrollTop=0;
    return value;
  },paneSelector);
  try {
    await article.screenshot({ path,animations:"disabled" });
  } finally {
    await page.evaluate(([paneQuery,value]) => {
      const pane=document.querySelector(paneQuery);
      if (pane === null) return;
      pane.style.height=value.height;
      pane.style.maxHeight=value.maxHeight;
      pane.style.overflow=value.overflow;
      pane.style.overflowY=value.overflowY;
      pane.scrollTop=value.scrollTop;
    },[paneSelector,saved]);
  }
  return readPng(path);
}

export async function captureCompleteGuideAnswerScreenshot({
  page,article,root,row,api,visible,beforeAssistantCount,screenshotPath,topPaneScreenshotPath,footerPaneScreenshotPath
}) {
  const paneSelector=root === ".supportDesk" ? ".supportChatScroll" : root;
  const targetSelector=`${root} .supportMessage[data-role="assistant"]`;
  const pane=page.locator(paneSelector);
  const articleCount=await article.count();
  const afterAssistantCount=await page.locator(targetSelector).count();
  const articleRole=await article.getAttribute("data-role");
  const articleText=await article.locator("p").first().innerText();
  if (articleCount !== 1 || afterAssistantCount !== beforeAssistantCount+1 || articleRole !== "assistant"
    || articleText !== visible.text || visible.text !== api.text
    || !same(visible.sources,api.sources.map(source => source.id))
    || !same(visible.actions,api.actions.map(({ label,href }) => ({ label,href })))) {
    throw new Error("GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH");
  }

  const before=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
  await scrollTargetEdgeIntoPane({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount,edge:"top" });
  const topView=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
  if (!intersects(topView.target,topView.pane) || !contained(topView.top,topView.pane)) {
    throw new Error("GUIDE_CAPTURE_ORIGINAL_PANE_TOP_UNREACHABLE");
  }
  await pane.screenshot({ path:topPaneScreenshotPath,animations:"disabled" });
  const topPanePng=await readPng(topPaneScreenshotPath);

  await scrollTargetEdgeIntoPane({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount,edge:"footer" });
  const footerView=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
  if (!intersects(footerView.target,footerView.pane) || !contained(footerView.footer,footerView.pane)
    || footerView.paneScrollTop <= topView.paneScrollTop) {
    throw new Error("GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE");
  }
  await pane.screenshot({ path:footerPaneScreenshotPath,animations:"disabled" });
  const footerPanePng=await readPng(footerPaneScreenshotPath);

  const completePng=await screenshotCompleteArticle({ page,article,paneSelector,path:screenshotPath });
  const identity={
    sequence:row.sequence,prompt:row.prompt,mode:row.mode,language:row.language,
    apiTextSha256:sha256(Buffer.from(api.text)),sources:api.sources.map(source => source.id),
    actions:api.actions,targetAssistantIndex:beforeAssistantCount
  };
  return Object.freeze({
    schemaVersion:2,sequence:row.sequence,mode:row.mode,language:row.language,
    beforeAssistantCount,targetAssistantIndex:beforeAssistantCount,afterAssistantCount,articleCount,articleRole,
    projectionEqual:true,sourceActionLayoutIncluded:true,originalPaneTopReachable:true,
    originalPaneFooterReachable:true,completeAnswerExpandedCapture:true,
    completeCapturePresentation:"evidence_only_expanded_pane",
    caseIdentitySha256:sha256(Buffer.from(JSON.stringify(identity))),
    completePng,topPanePng,footerPanePng,
    before:{ target:fixedRect(before.target),pane:fixedRect(before.pane),paneScrollTop:before.paneScrollTop,paneScrollHeight:before.paneScrollHeight,paneClientHeight:before.paneClientHeight },
    topView:{ target:fixedRect(topView.target),pane:fixedRect(topView.pane),top:fixedRect(topView.top),paneScrollTop:topView.paneScrollTop },
    footerView:{ target:fixedRect(footerView.target),pane:fixedRect(footerView.pane),footer:fixedRect(footerView.footer),paneScrollTop:footerView.paneScrollTop }
  });
}
