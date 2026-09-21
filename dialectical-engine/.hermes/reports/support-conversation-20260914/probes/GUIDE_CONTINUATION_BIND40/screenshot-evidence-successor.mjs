import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const same=(left,right) => JSON.stringify(left) === JSON.stringify(right);
const fixedRect=rect => rect === null ? null : Object.freeze({
  x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)
});
const intersects=(target,pane) => target !== null && pane !== null
  && target.bottom > pane.top && target.top < pane.bottom && target.right > pane.left && target.left < pane.right;
const contained=(target,pane) => target !== null && pane !== null
  && target.top >= pane.top && target.bottom <= pane.bottom && target.left >= pane.left && target.right <= pane.right;
const failureCode=error => error instanceof Error
  ? (/\bGUIDE_CAPTURE_[A-Z0-9_]+\b/u.exec(error.message)?.[0] ?? "GUIDE_CAPTURE_SCREENSHOT_FAILED")
  : "GUIDE_CAPTURE_SCREENSHOT_FAILED";

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
    const textEdge=(root,atEnd) => {
      if (root===null) return null;
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      const nodes=[];for(let node=walker.nextNode();node!==null;node=walker.nextNode())if(node.textContent?.length)nodes.push(node);
      const node=atEnd?nodes.at(-1):nodes[0];if(node===undefined)return null;
      const range=document.createRange(),offset=atEnd?node.textContent.length-1:0;
      range.setStart(node,offset);range.setEnd(node,offset+1);const rect=range.getBoundingClientRect();
      return { top:rect.top,left:rect.left,right:rect.right,bottom:rect.bottom,x:rect.x,y:rect.y,width:rect.width,height:rect.height };
    };
    const body=target?.querySelector(".supportMessageCore > p") ?? target?.querySelector("p") ?? null;
    const bodyStart=textEdge(body,false),bodyEnd=textEdge(body,true);
    const edgePainted=rect => rect!==null && rect.width>0 && rect.height>0 && (()=>{const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return hit!==null&&target?.contains(hit)===true;})();
    const footerStyle=footer === null ? null : getComputedStyle(footer);
    const footerRect=footer?.getBoundingClientRect() ?? null;
    const footerCenter=footerRect === null ? null : document.elementFromPoint(
      footerRect.left+footerRect.width/2,footerRect.top+footerRect.height/2
    );
    const footerPainted=footer !== null && footerRect !== null && footerRect.width > 0 && footerRect.height > 0
      && footerStyle.display !== "none" && footerStyle.visibility !== "hidden"
      && Number(footerStyle.opacity) > 0
      && (footerCenter === footer || footer.contains(footerCenter));
    return { target:map(target),pane:map(pane),top:map(top),bodyStart,bodyEnd,
      bodyStartPainted:edgePainted(bodyStart),bodyEndPainted:edgePainted(bodyEnd),footer:map(footer),footerPainted,
      paneScrollTop:pane?.scrollTop ?? null,paneScrollHeight:pane?.scrollHeight ?? null,
      paneClientHeight:pane?.clientHeight ?? null,targetScrollHeight:target?.scrollHeight ?? null };
  },[targetSelector,paneSelector,targetIndex]
);

const scrollTargetTopIntoPane=async ({ page,targetSelector,paneSelector,targetIndex }) => page.evaluate(
  ([targetQuery,paneQuery,index]) => {
    const target=[...document.querySelectorAll(targetQuery)][index] ?? null;
    const pane=document.querySelector(paneQuery);
    if (target === null || pane === null) throw new Error("GUIDE_CAPTURE_SCROLL_TARGET_MISSING");
    const edgeElement=target.querySelector(".top-marker") ?? target.firstElementChild;
    if (edgeElement === null) throw new Error("GUIDE_CAPTURE_SCROLL_EDGE_MISSING");
    const paneRect=pane.getBoundingClientRect();
    const edgeRect=edgeElement.getBoundingClientRect();
    const delta=edgeRect.top-paneRect.top;
    pane.scrollTop=Math.max(0,Math.min(pane.scrollHeight-pane.clientHeight,pane.scrollTop+delta));
  },[targetSelector,paneSelector,targetIndex]
);

export const revealFooterIfNeeded=async ({ page,targetSelector,paneSelector,targetIndex }) => {
  const assigned=await page.evaluate(([targetQuery,paneQuery,index]) => {
    const target=[...document.querySelectorAll(targetQuery)][index] ?? null;
    const pane=document.querySelector(paneQuery);
    const footer=target?.querySelector(".supportCitation") ?? null;
    if (target === null || pane === null || footer === null) throw new Error("GUIDE_CAPTURE_SCROLL_EDGE_MISSING");
    const paneRect=pane.getBoundingClientRect();
    const footerRect=footer.getBoundingClientRect();
    const priorScrollTop=pane.scrollTop;
    const maximumScrollTop=Math.max(0,pane.scrollHeight-pane.clientHeight);
    const alreadyContained=footerRect.top >= paneRect.top && footerRect.bottom <= paneRect.bottom
      && footerRect.left >= paneRect.left && footerRect.right <= paneRect.right;
    const belowOverflow=Math.max(0,footerRect.bottom-paneRect.bottom);
    const aboveOverflow=Math.max(0,paneRect.top-footerRect.top);
    const requestedDelta=alreadyContained ? 0 : belowOverflow > 0 ? Math.ceil(belowOverflow)+1 : 0;
    const requestedScrollTop=priorScrollTop+requestedDelta;
    if (requestedDelta > 0) pane.scrollTop=Math.max(0,Math.min(maximumScrollTop,requestedScrollTop));
    return { action:alreadyContained ? "PRESERVED_ALREADY_CONTAINED"
      : requestedDelta > 0 ? "SCROLLED_FORWARD" : "UNREACHABLE_NO_FORWARD_SCROLL",
      alreadyContained,priorScrollTop,requestedDelta,requestedScrollTop,
      assignedScrollTop:pane.scrollTop,maximumScrollTop,belowOverflow,aboveOverflow };
  },[targetSelector,paneSelector,targetIndex]);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return assigned;
};

export const revealBodyEndIfNeeded=async ({ page,targetSelector,paneSelector,targetIndex }) => {
  const assigned=await page.evaluate(([targetQuery,paneQuery,index]) => {
    const target=[...document.querySelectorAll(targetQuery)][index] ?? null;
    const pane=document.querySelector(paneQuery);
    const body=target?.querySelector(".supportMessageCore > p") ?? target?.querySelector("p") ?? null;
    if(target===null||pane===null||body===null)throw new Error("GUIDE_CAPTURE_BODY_END_MISSING");
    const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT),nodes=[];
    for(let node=walker.nextNode();node!==null;node=walker.nextNode())if(node.textContent?.length)nodes.push(node);
    const node=nodes.at(-1);if(node===undefined)throw new Error("GUIDE_CAPTURE_BODY_END_MISSING");
    const range=document.createRange(),offset=node.textContent.length-1;range.setStart(node,offset);range.setEnd(node,offset+1);
    const paneRect=pane.getBoundingClientRect(),edgeRect=range.getBoundingClientRect(),priorScrollTop=pane.scrollTop;
    const maximumScrollTop=Math.max(0,pane.scrollHeight-pane.clientHeight);
    const alreadyContained=edgeRect.top>=paneRect.top&&edgeRect.bottom<=paneRect.bottom&&edgeRect.left>=paneRect.left&&edgeRect.right<=paneRect.right;
    const belowOverflow=Math.max(0,edgeRect.bottom-paneRect.bottom),aboveOverflow=Math.max(0,paneRect.top-edgeRect.top);
    const requestedDelta=alreadyContained?0:belowOverflow>0?Math.ceil(belowOverflow)+1:0,requestedScrollTop=priorScrollTop+requestedDelta;
    if(requestedDelta>0)pane.scrollTop=Math.max(0,Math.min(maximumScrollTop,requestedScrollTop));
    return { action:alreadyContained?"PRESERVED_ALREADY_CONTAINED":requestedDelta>0?"SCROLLED_FORWARD":"UNREACHABLE_NO_FORWARD_SCROLL",
      alreadyContained,priorScrollTop,requestedDelta,requestedScrollTop,assignedScrollTop:pane.scrollTop,maximumScrollTop,belowOverflow,aboveOverflow };
  },[targetSelector,paneSelector,targetIndex]);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return assigned;
};

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
  page,article,root,row,api,visible,beforeAssistantCount,screenshotPath,topPaneScreenshotPath,footerPaneScreenshotPath,
  failureDiagnosticPath,expectedLayout
}) {
  const paneSelector=root === ".supportDesk" ? ".supportChatScroll" : root;
  const targetSelector=`${root} .supportMessage[data-role="assistant"]`;
  const pane=page.locator(paneSelector);
  const articleCount=await article.count();
  const afterAssistantCount=await page.locator(targetSelector).count();
  const articleRole=await article.getAttribute("data-role");
  const articleText=await article.locator("p").first().innerText();
  const identity={ sequence:row.sequence,promptSha256:sha256(Buffer.from(row.prompt)),mode:row.mode,language:row.language,
    apiTextSha256:sha256(Buffer.from(api.text)),sources:api.sources.map(source => source.id),
    actions:api.actions.map(action => action.id),targetAssistantIndex:beforeAssistantCount };
  const projectedLayout={ sourceIds:api.sources.map(source=>source.id),actionIds:api.actions.map(action=>action.id),
    footerExpected:api.sources.length>0||api.actions.length>0 };
  if(expectedLayout===null||typeof expectedLayout!=="object"
    || !same(Object.keys(expectedLayout),["sourceIds","actionIds","footerExpected"])
    || !same(expectedLayout.sourceIds,projectedLayout.sourceIds)||!same(expectedLayout.actionIds,projectedLayout.actionIds)
    || expectedLayout.footerExpected!==projectedLayout.footerExpected)throw new Error("GUIDE_CAPTURE_EXPECTED_LAYOUT_INVALID");
  if (articleCount !== 1 || afterAssistantCount !== beforeAssistantCount+1 || articleRole !== "assistant"
    || articleText !== visible.text || visible.text !== api.text
    || !same(visible.sources,api.sources.map(source => source.label))
    || !same(visible.actions,api.actions.map(({ label,href }) => ({ label,href })))) {
    const error=new Error("GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH");
    await writeFile(failureDiagnosticPath,`${JSON.stringify({ schemaVersion:1,sequence:row.sequence,
      failureCode:error.message,phase:"PRE_CAPTURE_IDENTITY",identity,
      observed:{ articleCount,afterAssistantCount,articleRole,textEqual:articleText===visible.text,
        apiDomTextEqual:visible.text===api.text,
        sourceLabelsEqual:same(visible.sources,api.sources.map(source=>source.label)),
        actionsEqual:same(visible.actions,api.actions.map(({ label,href })=>({ label,href }))) },
      geometry:"NOT_READ",restoration:"NOT_REQUIRED" },null,2)}\n`,{ flag:"wx",mode:0o600 });
    throw error;
  }

  const before=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
  const viewportBefore=page.viewportSize();
  const endEvidenceKind=expectedLayout.footerExpected?"SOURCE_ACTION_FOOTER":"BODY_END";
  let topView,preEndView,endView,topPanePng,endPanePng,completePng,scrollAssignment;
  let caught=null;
  let restoration={ paneScrollTopRestored:false,viewportRestored:false,observedPaneScrollTop:null,observedViewport:null };
  try {
    await scrollTargetTopIntoPane({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
    topView=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
    if (!intersects(topView.target,topView.pane) || !contained(topView.bodyStart,topView.pane)
      || topView.bodyStartPainted!==true) throw new Error("GUIDE_CAPTURE_ORIGINAL_PANE_TOP_UNREACHABLE");
    await pane.screenshot({ path:topPaneScreenshotPath,animations:"disabled" });
    topPanePng=await readPng(topPaneScreenshotPath);
    preEndView=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
    if(expectedLayout.footerExpected&&preEndView.footer===null)throw new Error("GUIDE_CAPTURE_EXPECTED_FOOTER_MISSING");
    if(!expectedLayout.footerExpected&&preEndView.footer!==null)throw new Error("GUIDE_CAPTURE_UNEXPECTED_FOOTER_PRESENT");
    scrollAssignment=expectedLayout.footerExpected
      ? await revealFooterIfNeeded({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount })
      : await revealBodyEndIfNeeded({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
    endView=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
    const endContained=expectedLayout.footerExpected?contained(endView.footer,endView.pane):contained(endView.bodyEnd,endView.pane);
    const endPainted=expectedLayout.footerExpected?endView.footerPainted:endView.bodyEndPainted;
    if (!intersects(endView.target,endView.pane)||!endContained||endPainted!==true
      ||(scrollAssignment.alreadyContained&&endView.paneScrollTop!==scrollAssignment.priorScrollTop)
      ||(!scrollAssignment.alreadyContained&&endView.paneScrollTop<=scrollAssignment.priorScrollTop)) {
      throw new Error(expectedLayout.footerExpected?"GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE":"GUIDE_CAPTURE_ORIGINAL_PANE_BODY_END_UNREACHABLE");
    }
    await pane.screenshot({ path:footerPaneScreenshotPath,animations:"disabled" });
    endPanePng=await readPng(footerPaneScreenshotPath);
    completePng=await screenshotCompleteArticle({
      page,article,root,targetSelector,targetIndex:beforeAssistantCount,paneSelector,path:screenshotPath
    });
  } catch (error) {
    caught=error;
  } finally {
    try {
      await pane.evaluate((element,scrollTop)=>{ element.scrollTop=scrollTop; },before.paneScrollTop);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const restored=await geometry({ page,targetSelector,paneSelector,targetIndex:beforeAssistantCount });
      const observedViewport=page.viewportSize();
      restoration={ paneScrollTopRestored:restored.paneScrollTop===before.paneScrollTop,
        viewportRestored:same(observedViewport,viewportBefore),observedPaneScrollTop:restored.paneScrollTop,
        observedViewport };
      if (!restoration.paneScrollTopRestored || !restoration.viewportRestored) {
        caught ??=new Error("GUIDE_CAPTURE_SCREENSHOT_RESTORE_MISMATCH");
      }
    } catch (error) { caught ??=error; }
  }
  const geometryEvidence={
    before:{ target:before.target,pane:before.pane,footer:before.footer,footerPainted:before.footerPainted,
      paneScrollTop:before.paneScrollTop,paneScrollHeight:before.paneScrollHeight,paneClientHeight:before.paneClientHeight },
    top:topView===undefined ? null : { target:topView.target,pane:topView.pane,top:topView.top,footer:topView.footer,
      footerPainted:topView.footerPainted,paneScrollTop:topView.paneScrollTop,paneScrollHeight:topView.paneScrollHeight,paneClientHeight:topView.paneClientHeight },
    preEnd:preEndView===undefined ? null : { target:preEndView.target,pane:preEndView.pane,bodyEnd:preEndView.bodyEnd,
      bodyEndPainted:preEndView.bodyEndPainted,footer:preEndView.footer,footerPainted:preEndView.footerPainted,
      paneScrollTop:preEndView.paneScrollTop,paneScrollHeight:preEndView.paneScrollHeight,paneClientHeight:preEndView.paneClientHeight },
    postEnd:endView===undefined ? null : { target:endView.target,pane:endView.pane,bodyEnd:endView.bodyEnd,
      bodyEndPainted:endView.bodyEndPainted,footer:endView.footer,footerPainted:endView.footerPainted,
      paneScrollTop:endView.paneScrollTop,paneScrollHeight:endView.paneScrollHeight,paneClientHeight:endView.paneClientHeight }
  };
  if (caught!==null) {
    await writeFile(failureDiagnosticPath,`${JSON.stringify({ schemaVersion:1,sequence:row.sequence,
      failureCode:failureCode(caught),phase:"ORIGINAL_PANE_SCREENSHOT",identity,endEvidenceKind,geometry:geometryEvidence,
      scrollAssignment:scrollAssignment??null,restoration,
      artifacts:{ topPaneScreenshotPath,footerPaneScreenshotPath,screenshotPath,
        topPaneCreated:topPanePng!==undefined,endPaneCreated:endPanePng!==undefined,
        completeExpandedCreated:completePng!==undefined } },null,2)}\n`,{ flag:"wx",mode:0o600 });
    throw caught;
  }
  return Object.freeze({ schemaVersion:2,sequence:row.sequence,mode:row.mode,language:row.language,
    beforeAssistantCount,targetAssistantIndex:beforeAssistantCount,afterAssistantCount,articleCount,articleRole,
    projectionEqual:true,sourceActionLayoutIncluded:expectedLayout.footerExpected,originalPaneTopReachable:true,
    originalPaneFooterReachable:expectedLayout.footerExpected,originalPaneBodyEndReachable:!expectedLayout.footerExpected,
    endEvidenceKind,completeAnswerExpandedCapture:true,
    completeCapturePresentation:"evidence_only_expanded_pane",
    caseIdentitySha256:sha256(Buffer.from(JSON.stringify(identity))),completePng,topPanePng,endPanePng,
    before:{ target:fixedRect(before.target),pane:fixedRect(before.pane),paneScrollTop:before.paneScrollTop,paneScrollHeight:before.paneScrollHeight,paneClientHeight:before.paneClientHeight },
    topView:{ target:fixedRect(topView.target),pane:fixedRect(topView.pane),bodyStart:fixedRect(topView.bodyStart),bodyStartPainted:topView.bodyStartPainted,paneScrollTop:topView.paneScrollTop },
    preEndView:{ target:fixedRect(preEndView.target),pane:fixedRect(preEndView.pane),bodyEnd:fixedRect(preEndView.bodyEnd),
      bodyEndPainted:preEndView.bodyEndPainted,footer:fixedRect(preEndView.footer),footerPainted:preEndView.footerPainted,paneScrollTop:preEndView.paneScrollTop },
    endScroll:Object.freeze(scrollAssignment),
    endView:{ target:fixedRect(endView.target),pane:fixedRect(endView.pane),bodyEnd:fixedRect(endView.bodyEnd),
      bodyEndPainted:endView.bodyEndPainted,footer:fixedRect(endView.footer),footerPainted:endView.footerPainted,paneScrollTop:endView.paneScrollTop },
    restoration:Object.freeze(restoration)
  });
}
