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
  return Object.freeze({ path,sha256:sha256(bytes),bytes:bytes.length,
    width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20) });
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
    return { target:map(target),pane:map(pane),top:map(top),footer:map(footer),
      paneScrollTop:pane?.scrollTop ?? null,paneScrollHeight:pane?.scrollHeight ?? null,
      paneClientHeight:pane?.clientHeight ?? null,targetScrollHeight:target?.scrollHeight ?? null };
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

export async function screenshotCompleteArticle({
  page,article,root,targetSelector,targetIndex,paneSelector,path
}) {
  const viewport=page.viewportSize();
  if (viewport === null) throw new Error("GUIDE_CAPTURE_VIEWPORT_UNAVAILABLE");
  const saved=await page.evaluate(([rootQuery,targetQuery,paneQuery,index]) => {
    const rootElement=document.querySelector(rootQuery);
    const target=[...document.querySelectorAll(targetQuery)][index] ?? null;
    const pane=document.querySelector(paneQuery);
    if (rootElement === null || target === null || pane === null || !rootElement.contains(target)) {
      throw new Error("GUIDE_CAPTURE_EXPANSION_TARGET_MISSING");
    }
    const ancestors=[];
    for (let element=target.parentElement;element!==null;element=element.parentElement) {
      if (!rootElement.contains(element) && element!==rootElement) break;
      ancestors.push({ element,cssText:element.style.cssText,scrollTop:element.scrollTop,scrollLeft:element.scrollLeft });
      if (element===rootElement) break;
    }
    if (ancestors.at(-1)?.element!==rootElement) throw new Error("GUIDE_CAPTURE_EXPANSION_ROOT_UNREACHED");
    const pageScroll={ x:window.scrollX,y:window.scrollY };
    // Every ancestor in the selected article's real chain is released from fixed
    // height and clipping constraints. This includes supportChatScroll,
    // supportAgent/supportDeskBody grid containers, and supportDesk itself.
    for (const record of [...ancestors].reverse()) {
      const element=record.element;
      element.style.height="auto";
      element.style.maxHeight="none";
      element.style.minHeight="0";
      element.style.overflow="visible";
      element.style.overflowX="visible";
      element.style.overflowY="visible";
      if (element.classList.contains("supportDesk")) element.style.gridTemplateRows="auto auto";
      if (element.classList.contains("supportAgent")) element.style.gridTemplateRows="auto auto auto";
      element.scrollTop=0;
      element.scrollLeft=0;
    }
    pane.style.height=`${pane.scrollHeight}px`;
    const targetRect=target.getBoundingClientRect();
    return {
      pageScroll,ancestorCount:ancestors.length,targetHeight:targetRect.height,
      ancestorClasses:ancestors.map(({ element })=>element.className),
      ancestors:ancestors.map(({ cssText,scrollTop,scrollLeft })=>({ cssText,scrollTop,scrollLeft }))
    };
  },[root,targetSelector,paneSelector,targetIndex]);
  const expandedHeight=Math.max(viewport.height,Math.ceil(saved.targetHeight)+160);
  let captureError=null;
  try {
    if (expandedHeight!==viewport.height) await page.setViewportSize({ width:viewport.width,height:expandedHeight });
    await article.screenshot({ path,animations:"disabled" });
  } catch (error) { captureError=error; }
  finally {
    if (page.viewportSize()?.width!==viewport.width || page.viewportSize()?.height!==viewport.height) {
      await page.setViewportSize(viewport);
    }
    await page.evaluate(([rootQuery,targetQuery,index,value]) => {
      const rootElement=document.querySelector(rootQuery);
      const target=[...document.querySelectorAll(targetQuery)][index] ?? null;
      if (rootElement === null || target === null) throw new Error("GUIDE_CAPTURE_RESTORE_TARGET_MISSING");
      const ancestors=[];
      for (let element=target.parentElement;element!==null;element=element.parentElement) {
        if (!rootElement.contains(element) && element!==rootElement) break;
        ancestors.push(element);
        if (element===rootElement) break;
      }
      if (ancestors.length!==value.ancestors.length) throw new Error("GUIDE_CAPTURE_RESTORE_CHAIN_MISMATCH");
      for (let index=ancestors.length-1;index>=0;index-=1) ancestors[index].style.cssText=value.ancestors[index].cssText;
      for (let index=ancestors.length-1;index>=0;index-=1) {
        ancestors[index].scrollTop=value.ancestors[index].scrollTop;
        ancestors[index].scrollLeft=value.ancestors[index].scrollLeft;
      }
      window.scrollTo(value.pageScroll.x,value.pageScroll.y);
    },[root,targetSelector,targetIndex,saved]);
  }
  if (captureError!==null) throw captureError;
  const restored=await page.evaluate(([rootQuery,targetQuery,index,value]) => {
    const rootElement=document.querySelector(rootQuery);
    const target=[...document.querySelectorAll(targetQuery)][index] ?? null;
    if (rootElement === null || target === null) return false;
    const ancestors=[];
    for (let element=target.parentElement;element!==null;element=element.parentElement) {
      if (!rootElement.contains(element) && element!==rootElement) break;
      ancestors.push(element);
      if (element===rootElement) break;
    }
    return ancestors.length===value.ancestors.length
      && ancestors.every((element,index)=>element.style.cssText===value.ancestors[index].cssText
        && element.scrollTop===value.ancestors[index].scrollTop
        && element.scrollLeft===value.ancestors[index].scrollLeft)
      && window.scrollX===value.pageScroll.x && window.scrollY===value.pageScroll.y;
  },[root,targetSelector,targetIndex,saved]);
  if (!restored || page.viewportSize()?.width!==viewport.width || page.viewportSize()?.height!==viewport.height) {
    throw new Error("GUIDE_CAPTURE_EXPANSION_RESTORE_MISMATCH");
  }
  return Object.freeze({ ...(await readPng(path)),expansion:Object.freeze({
    ancestorCount:saved.ancestorCount,ancestorClasses:Object.freeze(saved.ancestorClasses),
    viewportBefore:Object.freeze(viewport),viewportExpandedHeight:expandedHeight,
    stylesScrollViewportRestored:true
  }) });
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
    || !same(visible.sources,api.sources.map(source => source.label))
    || !same(visible.actions,api.actions.map(({ label,href }) => ({ label,href })))) {
    throw new Error("GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH");
  }

  const before=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
  let topView,footerView,topPanePng,footerPanePng,completePng;
  try {
    await scrollTargetEdgeIntoPane({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount,edge:"top" });
    topView=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
    if (!intersects(topView.target,topView.pane) || !contained(topView.top,topView.pane)) throw new Error("GUIDE_CAPTURE_ORIGINAL_PANE_TOP_UNREACHABLE");
    await pane.screenshot({ path:topPaneScreenshotPath,animations:"disabled" });
    topPanePng=await readPng(topPaneScreenshotPath);
    await scrollTargetEdgeIntoPane({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount,edge:"footer" });
    footerView=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
    if (!intersects(footerView.target,footerView.pane) || !contained(footerView.footer,footerView.pane)
      || (!contained(topView.footer,topView.pane) && footerView.paneScrollTop <= topView.paneScrollTop)) {
      throw new Error("GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE");
    }
    await pane.screenshot({ path:footerPaneScreenshotPath,animations:"disabled" });
    footerPanePng=await readPng(footerPaneScreenshotPath);
    completePng=await screenshotCompleteArticle({
      page,article,root,targetSelector,targetIndex:beforeAssistantCount,paneSelector,path:screenshotPath
    });
  } finally {
    await pane.evaluate((element,scrollTop)=>{ element.scrollTop=scrollTop; },before.paneScrollTop);
  }
  const identity={ sequence:row.sequence,prompt:row.prompt,mode:row.mode,language:row.language,
    apiTextSha256:sha256(Buffer.from(api.text)),sources:api.sources.map(source => source.id),
    actions:api.actions,targetAssistantIndex:beforeAssistantCount };
  return Object.freeze({ schemaVersion:2,sequence:row.sequence,mode:row.mode,language:row.language,
    beforeAssistantCount,targetAssistantIndex:beforeAssistantCount,afterAssistantCount,articleCount,articleRole,
    projectionEqual:true,sourceActionLayoutIncluded:true,originalPaneTopReachable:true,
    originalPaneFooterReachable:true,completeAnswerExpandedCapture:true,
    completeCapturePresentation:"evidence_only_expanded_pane",
    caseIdentitySha256:sha256(Buffer.from(JSON.stringify(identity))),completePng,topPanePng,footerPanePng,
    before:{ target:fixedRect(before.target),pane:fixedRect(before.pane),paneScrollTop:before.paneScrollTop,paneScrollHeight:before.paneScrollHeight,paneClientHeight:before.paneClientHeight },
    topView:{ target:fixedRect(topView.target),pane:fixedRect(topView.pane),top:fixedRect(topView.top),paneScrollTop:topView.paneScrollTop },
    footerView:{ target:fixedRect(footerView.target),pane:fixedRect(footerView.pane),footer:fixedRect(footerView.footer),paneScrollTop:footerView.paneScrollTop }
  });
}
