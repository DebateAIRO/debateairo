import { createHash } from "node:crypto";
import { access,mkdir,readFile,rm,stat,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { classifyConsoleError,emptyConsoleErrorCounts } from "../LIVE_P3/console-classifier.mjs";
import { consumeSupportDiagnosticWindow } from "../LIVE_P3/diagnostic-consumer.mjs";
import { createRuntimeSessionVersionGate } from "../LIVE_P3/session-version-gate.mjs";
import {
  GUIDE_AFFECTED_PLAN,GUIDE_FRESH_GROUPS,GUIDE_FRESH_SEQUENCES,GUIDE_MATRIX,
  GUIDE_REQUEST_START_SPACING_MS,GUIDE_RETAINED_SEQUENCES,GUIDE_SESSION_GROUPS,
  validateGuideAffectedPlan,validateGuideFreshRequestStartOffsets
} from "../GUIDE_HARNESS_BIND17/matrix.mjs";
import {
  activateGuideNavigation,consumeGuideObservationStages,guidePostReadyFailureCode,
  openGuideSupportSurface,proveGuideFullReadiness,readGuidePublicResponse,
  selectGuideSupportLanguage,validateGuideGateInput
} from "../GUIDE_HARNESS_BIND17/controls.mjs";
import { createGuidePreRequestVerifier } from "../GUIDE_HARNESS_BIND17/pre-request-verifier.ts";
import { createGuideFreshSessionLifecycle,resetGuideStoredConversation } from "../GUIDE_HARNESS_BIND17/session-lifecycle.mjs";
import { validateGuideCaptureFix18Binding } from "./binding-contract.mjs";
import { captureGuideAnswerScreenshot } from "./screenshot-evidence.mjs";

const REPORT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const EVIDENCE_ROOT=`${REPORT_ROOT}/evidence`;
const EXECUTABLE_PATH="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const gatePath=process.argv[2];
const bindingPath=process.argv[3];
if (typeof gatePath !== "string" || !gatePath.startsWith("/")
  || typeof bindingPath !== "string" || !bindingPath.startsWith("/")) {
  throw new Error("GUIDE_HARNESS_GATE_PATH_REQUIRED");
}
const bindingBytes=await readFile(bindingPath);
const binding=validateGuideCaptureFix18Binding(JSON.parse(bindingBytes.toString("utf8")));
const PROFILE_ROOT=binding.profileRoot;
const RECEIPT_PATH=binding.receiptPath;
const RETENTION_PATH=binding.retentionPath;
const EXPECTED_RETENTION_SHA256=binding.retentionSha256;
const gateBytes=await readFile(gatePath);
const gateInput=validateGuideGateInput(JSON.parse(gateBytes.toString("utf8")));
const verifier=await createGuidePreRequestVerifier(gateInput);
if (verifier.finalCommit !== binding.finalRevision || verifier.kbVersion !== binding.expectedKbVersion
  || JSON.stringify(binding.retainedSequences) !== JSON.stringify(GUIDE_RETAINED_SEQUENCES)
  || JSON.stringify(binding.freshSequences) !== JSON.stringify(GUIDE_FRESH_SEQUENCES)
  || JSON.stringify(binding.freshSessionGroups) !== JSON.stringify(GUIDE_FRESH_GROUPS)) {
  throw new Error("GUIDE_CAPTURE_FIX18_FINAL_BINDING_MISMATCH");
}
const retentionBytes=await readFile(RETENTION_PATH);
if (sha256(retentionBytes) !== EXPECTED_RETENTION_SHA256) {
  throw new Error("GUIDE_HARNESS_RETENTION_MANIFEST_HASH_MISMATCH");
}
const retention=JSON.parse(retentionBytes.toString("utf8"));
if (retention.revision !== verifier.finalCommit || retention.kbVersion !== verifier.kbVersion
  || retention.verdict !== "PASS_RETAINED_COMPLETE_GROUPS_BOUND"
  || JSON.stringify(retention.dependencyBoundary.retainedSequences) !== JSON.stringify(GUIDE_RETAINED_SEQUENCES)
  || JSON.stringify(retention.dependencyBoundary.freshSequences) !== JSON.stringify(GUIDE_FRESH_SEQUENCES)
  || retention.retainedRows.length !== GUIDE_RETAINED_SEQUENCES.length) {
  throw new Error("GUIDE_HARNESS_RETENTION_MANIFEST_INVALID");
}
validateGuideAffectedPlan();
try { await access(RECEIPT_PATH); throw new Error("GUIDE_HARNESS_RECEIPT_ALREADY_EXISTS"); }
catch (error) { if (error?.code !== "ENOENT") throw error; }
await mkdir(EVIDENCE_ROOT,{ recursive:true });
await mkdir(PROFILE_ROOT,{ recursive:false,mode:0o700 });

let sessionGate=createRuntimeSessionVersionGate(verifier.kbVersion);
const sessionLifecycle=createGuideFreshSessionLifecycle(GUIDE_FRESH_GROUPS);
const seenAttemptIds=new Set();
const result={
  schemaVersion:2,completed:false,finalCommit:verifier.finalCommit,kbVersion:verifier.kbVersion,
  entryCount:verifier.entryCount,requiredSuiteFiles:verifier.suiteFiles,
  gatePath,gateSha256:sha256(gateBytes),baseUrl:gateInput.baseUrl,
  browser:{ driver:"playwright@1.61.1",executablePath:EXECUTABLE_PATH,headless:true,tlsBypass:false,freshProfile:true },
  supportApi:"actual",relay:"actual unchanged support-preview relay",identity:"actual anonymous visitor",
  syntheticSupportOverrides:false,privateRecordsUsed:false,credentialOrRecoveryOperations:0,
  forgotConnector:"UNRESOLVED_ACTIONLESS",
  preRequestControlProof:{
    revision:verifier.controlProof.revision,kbVersion:verifier.controlProof.kbVersion,
    harnessSha256:verifier.controlProof.harnessSha256,
    declaredControls:verifier.declaredControls,derivedFromBoundResult:true
  },
  runtimeCapacity:{
    measuredAtUtc:verifier.runtimeCapacity.measuredAtUtc,
    supportRegisterVersion:verifier.runtimeCapacity.supportRegisterVersion,
    supportSchemaVersion:verifier.runtimeCapacity.supportSchemaVersion,
    supportSnapshotSha256:verifier.runtimeCapacity.supportSnapshotSha256,
    fullSnapshotSha256:verifier.runtimeCapacity.fullSnapshotSha256,
    limits:verifier.runtimeCapacity.limits,observed:verifier.runtimeCapacity.observed
  },
  matrixCount:GUIDE_MATRIX.length,canonicalOrder:GUIDE_MATRIX.map(({ sequence }) => sequence),
  coveragePlan:GUIDE_AFFECTED_PLAN,
  retainedEvidence:{ path:RETENTION_PATH,sha256:EXPECTED_RETENTION_SHA256,rows:15,groups:2 },
  retainedRows:retention.retainedRows,
  executionOrder:[...GUIDE_FRESH_SEQUENCES],sessionGroups:GUIDE_FRESH_GROUPS,
  pacing:{ requiredRequestStartSpacingMs:GUIDE_REQUEST_START_SPACING_MS,requestStarts:[] },
  failureObservation:null,failure:null,
  attemptedRows:[],attemptedRowCount:0,completedRowCount:0,
  freshRows:[],combinedCoverage:[],navigations:[],networkCounts:{
    createSession:0,sendMessage:0,forbiddenAnswers:0,forbiddenConsent:0
  },sessionKbVersions:[],sessionReplacementEvidence:[],groupSessionEvidence:[],noPrivateControls:[],
  consoleErrorCount:0,consoleErrorCategories:emptyConsoleErrorCounts(),screenshots:[],
  screenshotEvidence:[],captureBinding:{ path:bindingPath,sha256:sha256(bindingBytes),actualNamespace:binding.actualNamespace },
  uiTransitions:[],uiTransitionFailure:null,postReadyStages:[],currentPostReadyStage:null
};
const captureStartedAt=performance.now();
let previousRequestStartedAt=null;
async function checkpoint() { await writeFile(RECEIPT_PATH,`${JSON.stringify(result,null,2)}\n`); }
function operationFor(url,method) {
  const parsed=new URL(url);
  if (parsed.pathname === "/api/v1/support/sessions" && method === "POST") return "createSession";
  if (/^\/api\/v1\/support\/sessions\/[^/]+\/messages$/u.test(parsed.pathname) && method === "POST") return "sendMessage";
  if (parsed.pathname === "/api/v1/answers") return "forbiddenAnswers";
  if (parsed.pathname.includes("/support/") && parsed.pathname.endsWith("/consent")) return "forbiddenConsent";
  return null;
}
function safeProof(proof) {
  if (proof.branch !== "MODEL") return proof;
  return {
    branch:proof.branch,sourceIds:proof.sourceIds,requestedActionIds:proof.requestedActionIds,
    allowedActions:proof.allowedActions,sourcePolicy:proof.sourcePolicy,
    recoverySourceIds:proof.recoverySourceIds,
    fallbackSha256:proof.fallbackSha256,review:proof.review
  };
}
function deterministicDiagnostic(bytes,start,end) {
  const window=bytes.subarray(start,end).toString("utf8");
  return Object.freeze({ status:"NOT_APPLICABLE",candidateCount:(window.match(/SUPPORT_DRAFT_/gu) ?? []).length });
}

const context=await chromium.launchPersistentContext(PROFILE_ROOT,{
  executablePath:EXECUTABLE_PATH,headless:true,viewport:{ width:1440,height:1000 }
});
const page=context.pages()[0] ?? await context.newPage();
page.on("console",message => {
  if (message.type() === "error") {
    result.consoleErrorCount+=1;
    result.consoleErrorCategories[classifyConsoleError(message.text())]+=1;
  }
});
page.on("response",async response => {
  const operation=operationFor(response.url(),response.request().method());
  if (operation !== null) result.networkCounts[operation]+=1;
  if (operation === "createSession") {
    try {
      const body=await response.json();
      result.sessionKbVersions.push(sessionGate.observe(body));
      sessionLifecycle.observeCreatedSession(body?.session?.session_id);
    }
    catch (error) {
      result.sessionVersionFailure=error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
        ? error.message : "GUIDE_HARNESS_SESSION_VERSION_FAILURE";
    }
  }
});
await page.route("**/api/v1/support/sessions/*/messages",async route => {
  try { await sessionGate.waitUntilReady(); await route.continue(); }
  catch { await route.abort("blockedbyclient"); }
});

async function waitForHydratedClickHandler(locator) {
  await locator.waitFor({ state:"visible",timeout:30_000 });
  const element=await locator.elementHandle();
  if (element === null) throw new Error("GUIDE_HARNESS_UI_NOT_HYDRATED");
  await page.waitForFunction(node => Object.getOwnPropertyNames(node).some(name =>
    name.startsWith("__reactProps$") && typeof node[name]?.onClick === "function"
  ),element,{ timeout:30_000 });
}
async function waitForSurfaceLanguage(surface,language,selectors) {
  const label=language.toUpperCase();
  await page.waitForFunction(({ selector,expected }) => {
    const buttons=[...document.querySelectorAll(selector)];
    return buttons.length === 1 && buttons[0]?.textContent?.trim() === expected;
  },{ selector:selectors.active,expected:label });
}
async function waitForFullLanguage(language) {
  return await waitForSurfaceLanguage("full",language,{
    active:'.supportDesk .supportLanguage button[aria-pressed="true"]'
  });
}
async function waitForMode(mode) {
  const pressed=mode === "CHAMBER";
  await page.waitForFunction(expected => {
    const root=document.documentElement;
    return document.querySelector('.supportDesk [data-mode-toggle]')?.getAttribute("aria-pressed") === String(expected)
      && root.dataset.themeTransition !== "active"
      && !root.classList.contains("theme-transition-fallback");
  },
  pressed);
}
async function settleCookieConsent() {
  const bar=page.getByRole("region",{ name:"Cookie consent" });
  if (await bar.isVisible()) {
    await bar.getByRole("button",{ name:"Essential only",exact:true }).click();
    await bar.waitFor({ state:"hidden" });
  }
}
async function setLanguage(surface,language) {
  return await selectGuideSupportLanguage({
    surface,language,locate:selector => page.locator(selector),waitForLanguage:waitForSurfaceLanguage
  });
}
async function recordPostReadyStage(surface,language,stage,state) {
  const record={ surface,language,stage,state };
  result.currentPostReadyStage=record;
  result.postReadyStages.push(record);
  await checkpoint();
}
async function assertNoPrivateControls(mode) {
  const labels=["Attach debate","Atașează dezbatere","Use my debate context","Folosește contextul dezbaterii"];
  const counts=[];
  for (const label of labels) counts.push(await page.getByText(label,{ exact:true }).count());
  if (counts.some(count => count !== 0)) throw new Error("GUIDE_HARNESS_PRIVATE_CONTROL_PRESENT");
  result.noPrivateControls.push({ mode,checked:true });
}
async function fixedVisibility(locator,count) {
  if (count !== 1) return "UNKNOWN";
  return await locator.isVisible() ? "VISIBLE" : "HIDDEN";
}
function urlClass() {
  try {
    const path=new URL(page.url()).pathname;
    return path === "/" ? "BASE" : path === "/help" ? "HELP" : "OTHER";
  } catch { return "UNKNOWN"; }
}
async function readFullReadinessState() {
  const controls=page.locator(".supportDesk .supportLanguage button");
  const active=page.locator('.supportDesk .supportLanguage button[aria-pressed="true"]');
  const composer=page.locator('.supportDesk .supportComposer input[name="support-message"]');
  const modeToggle=page.locator(".supportDesk [data-mode-toggle]");
  const [languageControlCount,activeCount,composerCount,modeToggleCount]=await Promise.all([
    controls.count(),active.count(),composer.count(),modeToggle.count()
  ]);
  let visibleLanguageControlCount=0;
  for (let index=0;index<languageControlCount;index+=1) {
    if (await controls.nth(index).isVisible()) visibleLanguageControlCount+=1;
  }
  const activeText=activeCount === 1 ? (await active.first().textContent())?.trim() : null;
  return {
    languageControlCount,visibleLanguageControlCount,
    activeLanguage:activeText === "EN" || activeText === "RO" ? activeText : "UNKNOWN",
    composerCount,composerVisible:await fixedVisibility(composer,composerCount),
    modeToggleCount,modeToggleVisible:await fixedVisibility(modeToggle,modeToggleCount),
    modeState:modeToggleCount === 1
      ? await modeToggle.getAttribute("aria-pressed") === "true" ? "CHAMBER" : "TERRACOTTA"
      : "UNKNOWN",urlClass:urlClass()
  };
}
async function proveFullInteraction(language) {
  const modeToggle=page.locator(".supportDesk [data-mode-toggle]");
  await waitForHydratedClickHandler(modeToggle);
  return await proveGuideFullReadiness({
    desiredLanguage:language,readState:readFullReadinessState,
    activateMode:async () => modeToggle.click(),
    waitForMode,
    activateLanguage:async selected => {
      const label=selected.toUpperCase();
      await page.locator(".supportDesk .supportLanguage button")
        .filter({ hasText:new RegExp(`^${label}$`) }).first().click();
    },
    waitForLanguage:waitForFullLanguage
  });
}
async function observeSupportSurface(surface,language,phase,hydrationReady) {
  const compact=surface === "compact";
  const toggle=page.locator("[data-support-widget-toggle]");
  const widget=page.locator(".supportWidget");
  const panel=page.locator("[data-support-widget-panel]");
  const compactRoot=page.locator(".supportAssistantCompact");
  const composer=page.locator(compact
    ? '.supportAssistantCompact .supportComposer input[name="support-message"]'
    : '.supportDesk .supportComposer input[name="support-message"]');
  const cookie=page.getByRole("region",{ name:"Cookie consent" });
  const [toggleCount,panelCount,compactRootCount,composerCount,cookieCount]=await Promise.all([
    toggle.count(),panel.count(),compactRoot.count(),composer.count(),cookie.count()
  ]);
  const state=compact && await widget.count() === 1 ? await widget.getAttribute("data-widget-state") : null;
  const expanded=compact && toggleCount === 1 ? await toggle.getAttribute("aria-expanded") : null;
  return {
    surface,language,phase,hydrationReady,toggleCount,
    toggleVisible:compact ? await fixedVisibility(toggle,toggleCount) : "NOT_APPLICABLE",
    widgetState:compact && ["collapsed","expanded","closing"].includes(state)
      ? state.toUpperCase() : compact ? "UNKNOWN" : "NOT_APPLICABLE",
    ariaExpanded:compact && expanded === "true" ? "TRUE"
      : compact && expanded === "false" ? "FALSE" : compact ? "UNKNOWN" : "NOT_APPLICABLE",
    panelCount:compact ? panelCount : 0,
    panelVisible:compact ? await fixedVisibility(panel,panelCount) : "NOT_APPLICABLE",
    compactRootCount:compact ? compactRootCount : 0,
    compactRootVisible:compact ? await fixedVisibility(compactRoot,compactRootCount) : "NOT_APPLICABLE",
    composerCount,
    composerVisible:await fixedVisibility(composer,composerCount),
    urlClass:urlClass(),
    cookieRegionVisible:await fixedVisibility(cookie,cookieCount),
    consoleErrorCategories:{ ...result.consoleErrorCategories },
    fullReadiness:compact ? null : await readFullReadinessState()
  };
}
async function openMode(mode,language) {
  const compact=mode === "compact";
  const toggle=page.locator("[data-support-widget-toggle]");
  const hydrationTarget=compact
    ? toggle : page.locator('.supportLanguage button').filter({ hasText:/^EN$/ }).first();
  const composer=page.locator(compact
    ? '.supportAssistantCompact .supportComposer input[name="support-message"]'
    : '.supportDesk .supportComposer input[name="support-message"]');
  await openGuideSupportSurface({
    surface:mode,language,
    navigate:async () => {
      await page.setViewportSize(compact ? { width:390,height:844 } : { width:1440,height:1000 });
      await page.goto(compact ? gateInput.baseUrl : `${gateInput.baseUrl}/help`,{ waitUntil:"domcontentloaded" });
    },
    waitForHydration:() => compact
      ? waitForHydratedClickHandler(hydrationTarget) : proveFullInteraction(language),
    observe:(phase,hydrationReady) => observeSupportSurface(mode,language,phase,hydrationReady),
    activateCompact:() => toggle.click(),
    waitForReady:() => composer.waitFor({ state:"visible",timeout:30_000 }),
    selectLanguage:async selected => {
      await recordPostReadyStage(mode,language,"COOKIE_SETTLING","ENTERED");
      try { await settleCookieConsent(); }
      catch { throw new Error(guidePostReadyFailureCode("COOKIE_SETTLING")); }
      await recordPostReadyStage(mode,language,"COOKIE_SETTLING","PASSED");
      await recordPostReadyStage(mode,language,"LOCALE_SELECTION","ENTERED");
      try { await setLanguage(mode,selected); }
      catch { throw new Error(guidePostReadyFailureCode("LOCALE_SELECTION")); }
      await recordPostReadyStage(mode,language,"LOCALE_SELECTION","PASSED");
    },
    checkpoint:async (observation,code) => {
      result.uiTransitions.push(observation);
      if (code !== null) result.uiTransitionFailure={ code,observation };
      await checkpoint();
    }
  });
  await recordPostReadyStage(mode,language,"PRIVATE_CONTROL_CHECK","ENTERED");
  try { await assertNoPrivateControls(mode); }
  catch { throw new Error(guidePostReadyFailureCode("PRIVATE_CONTROL_CHECK")); }
  await recordPostReadyStage(mode,language,"PRIVATE_CONTROL_CHECK","PASSED");
  await recordPostReadyStage(mode,language,"TRANSITION_COMPLETION","ENTERED");
  await recordPostReadyStage(mode,language,"TRANSITION_COMPLETION","PASSED");
}
async function resetStoredConversationBeforeRemount() {
  await resetGuideStoredConversation({
    removeItem:key => page.evaluate(name => { window.sessionStorage.removeItem(name); },key),
    getItem:key => page.evaluate(name => window.sessionStorage.getItem(name),key)
  });
}
async function readVisibleReply(article,language) {
  const sourceName=language === "ro" ? "Surse" : "Sources";
  const actionName=language === "ro" ? "Acțiuni" : "Actions";
  return {
    text:await article.locator("p").first().innerText(),
    sources:await article.locator(`[aria-label="${sourceName}"] [role="listitem"]`).allTextContents(),
    actions:await article.locator(`[aria-label="${actionName}"] a`).evaluateAll(links =>
      links.map(link => ({ label:link.textContent?.trim() ?? "",href:link.getAttribute("href") ?? "" })))
  };
}
async function activateBoundAction(article,row,proof) {
  const expected=proof.allowedActions.find(action => action.id === row.navigation.actionId);
  if (expected === undefined) throw new Error("GUIDE_HARNESS_NAVIGATION_PROOF_MISSING");
  const link=article.locator("nav a").filter({ hasText:expected.label }).first();
  if (await link.count() !== 1 || await link.getAttribute("href") !== expected.href) {
    throw new Error("GUIDE_HARNESS_NAVIGATION_LINK_MISMATCH");
  }
  const before=page.url();
  const navigation=await activateGuideNavigation({
    baseUrl:gateInput.baseUrl,beforeUrl:before,expectedHref:expected.href,kind:row.navigation.kind,
    activatePointer:() => link.click(),activateKeyboard:() => link.press("Enter"),
    waitForExpectedDestination:destination => page.waitForURL(destination),
    readCurrentUrl:() => page.url()
  });
  result.navigations.push({
    sequence:row.sequence,kind:row.navigation.kind,actionId:expected.id,
    label:expected.label,href:expected.href,destination:navigation.destination,
    performed:navigation.performed,transitionWaited:navigation.transitionWaited
  });
}
async function send(row) {
  const proof=verifier.prepare(row);
  const root=row.mode === "full" ? ".supportDesk" : ".supportAssistantCompact";
  const assistant=page.locator(`${root} .supportMessage[data-role="assistant"]`);
  const before=await assistant.count();
  const field=page.locator(`${root} .supportComposer input[name="support-message"]`);
  const button=page.locator(`${root} .supportComposer button[type="submit"]`);
  await field.fill(row.prompt);
  if (previousRequestStartedAt !== null) {
    const remaining=GUIDE_REQUEST_START_SPACING_MS-(performance.now()-previousRequestStartedAt);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve,remaining));
  }
  const responsePromise=page.waitForResponse(response =>
    operationFor(response.url(),response.request().method()) === "sendMessage",{ timeout:200_000 });
  const cursorStart=(await stat(gateInput.runtimeLogPath)).size;
  const requestStartedAt=performance.now();
  await button.click();
  const requestStartOffsetMs=Math.floor(requestStartedAt-captureStartedAt);
  const previous=result.pacing.requestStarts.at(-1);
  if (previous !== undefined
    && requestStartOffsetMs-previous.requestStartOffsetMs < GUIDE_REQUEST_START_SPACING_MS) {
    throw new Error("GUIDE_HARNESS_PACING_INVALID");
  }
  previousRequestStartedAt=requestStartedAt;
  result.pacing.requestStarts.push({ sequence:row.sequence,requestStartOffsetMs });
  result.attemptedRows.push(row.sequence);
  result.attemptedRowCount=result.attemptedRows.length;
  const response=await responsePromise;
  const { body,status }=await readGuidePublicResponse(response);
  const article=assistant.nth(before);
  const { api,visible,diagnostic,attribution }=await consumeGuideObservationStages({
    row,proof,body,status,
    waitForSessionVersion:() => sessionGate.waitUntilReady(),
    waitForAssistant:() => assistant.nth(before).waitFor({ state:"visible",timeout:20_000 }),
    readVisible:() => readVisibleReply(article,row.language),
    readDiagnostic:async ({ api:projectedApi }) => {
      await page.waitForTimeout(100);
      let cursorEnd=(await stat(gateInput.runtimeLogPath)).size;
      for (let attempt=0;attempt<4;attempt+=1) {
        await page.waitForTimeout(50);
        const next=(await stat(gateInput.runtimeLogPath)).size;
        if (next === cursorEnd) break;
        cursorEnd=next;
      }
      const bytes=await readFile(gateInput.runtimeLogPath);
      return row.branch === "MODEL"
        ? consumeSupportDiagnosticWindow(bytes,{
          cursorStart,cursorEnd,seenAttemptIds,
          responseEvidence:proof.classifyResponse({
            outcome:projectedApi.outcome,text:projectedApi.text,
            sourceIds:projectedApi.sources.map(({ id }) => id)
          })
        }) : deterministicDiagnostic(bytes,cursorStart,cursorEnd);
    },
    checkpoint:async observation => {
      result.failureObservation=observation;
      if (observation.failureCode !== null) {
        result.failure={ sequence:row.sequence,code:observation.failureCode };
      }
      await checkpoint();
    }
  });
  result.freshRows.push({ provenance:"FRESH_GUIDE17_COMPLETE_GROUP",...row,proof:safeProof(proof),api,visible,diagnostic,attribution,
    selectedLanguage:row.language,sessionCreateCount:result.networkCounts.createSession });
  result.completedRowCount=result.freshRows.length;
  const screenshot=`${binding.screenshotPrefix}${String(row.sequence).padStart(2,"0")}.png`;
  const screenshotEvidence=await captureGuideAnswerScreenshot({
    page,article,root,row,api,visible,beforeAssistantCount:before,screenshotPath:screenshot
  });
  result.screenshots.push(screenshot);
  result.screenshotEvidence.push(screenshotEvidence);
  await checkpoint();
  if (row.navigation !== null) await activateBoundAction(article,row,proof);
  result.failureObservation=null;
  result.failure=null;
  await checkpoint();
}

try {
  let mode=null;
  let language=null;
  const bySequence=new Map(GUIDE_MATRIX.map(row => [row.sequence,row]));
  for (let groupIndex=0;groupIndex<GUIDE_FRESH_GROUPS.length;groupIndex+=1) {
    const group=GUIDE_FRESH_GROUPS[groupIndex];
    const boundary=sessionLifecycle.beginGroup(groupIndex,result.networkCounts.createSession);
    sessionGate=createRuntimeSessionVersionGate(verifier.kbVersion);
    if (boundary.transition === "FRESH_PROFILE") {
      await openMode(group.mode,group.language);
    } else if (boundary.transition === "STORAGE_RESET_BEFORE_REMOUNT") {
      await resetStoredConversationBeforeRemount();
      await openMode(group.mode,group.language);
    } else {
      throw new Error("GUIDE_HARNESS_FRESH_GROUP_TRANSITION_INVALID");
    }
    mode=group.mode;
    language=group.language;
    for (let rowIndex=0;rowIndex<group.sequences.length;rowIndex+=1) {
      const sequence=group.sequences[rowIndex];
      const row=bySequence.get(sequence);
      if (row === undefined || row.mode !== group.mode || row.language !== group.language) {
        throw new Error("GUIDE_HARNESS_EXECUTION_ROW_MISSING");
      }
      await send(row);
      if (rowIndex === 0) {
        const evidence=sessionLifecycle.confirmFirstResponse(result.networkCounts.createSession);
        result.groupSessionEvidence.push({ ...evidence,firstSequence:row.sequence });
        if (row.lifecycleRole === "ACCOUNT_RO_AFTER_SWITCH") {
          result.sessionReplacementEvidence.push({
            sequence:row.sequence,before:evidence.createdBefore,after:evidence.createdAfter,
            selectedLanguage:"ro"
          });
        }
      } else {
        sessionLifecycle.confirmContinuation(result.networkCounts.createSession);
      }
      if (row.navigation !== null) { mode=null; language=null; }
    }
    sessionLifecycle.endGroup(result.networkCounts.createSession);
  }
  sessionLifecycle.complete(result.networkCounts.createSession);
  result.combinedCoverage=[
    ...GUIDE_RETAINED_SEQUENCES.map(sequence => ({ sequence,provenance:"RETAINED_LIVE8_COMPLETE_GROUP" })),
    ...result.freshRows.map(({ sequence }) => ({ sequence,provenance:"FRESH_GUIDE17_COMPLETE_GROUP" }))
  ];
  if (result.freshRows.length !== GUIDE_FRESH_SEQUENCES.length
    || result.networkCounts.sendMessage !== GUIDE_FRESH_SEQUENCES.length
    || result.attemptedRowCount !== GUIDE_FRESH_SEQUENCES.length
    || result.completedRowCount !== GUIDE_FRESH_SEQUENCES.length
    || result.networkCounts.createSession !== GUIDE_FRESH_GROUPS.length
    || result.networkCounts.forbiddenAnswers !== 0 || result.networkCounts.forbiddenConsent !== 0
    || new Set(result.freshRows.map(({ sequence }) => sequence)).size !== GUIDE_FRESH_SEQUENCES.length
    || result.combinedCoverage.length !== GUIDE_MATRIX.length
    || new Set(result.combinedCoverage.map(({ sequence }) => sequence)).size !== GUIDE_MATRIX.length) {
    throw new Error("GUIDE_HARNESS_FINAL_COUNT_INVALID");
  }
  validateGuideFreshRequestStartOffsets(result.pacing.requestStarts);
  result.completed=true;
  await checkpoint();
  process.stdout.write(`${JSON.stringify({
    completed:true,retainedRows:result.retainedRows.length,freshRows:result.freshRows.length,
    combinedRows:result.combinedCoverage.length,navigations:result.navigations.length,
    sessions:result.networkCounts.createSession,modelRows:verifier.modelRows,
    sessionReplacements:result.sessionReplacementEvidence.length,
    sessionGroups:result.groupSessionEvidence.length,
    origins:[...result.retainedRows,...result.freshRows].reduce((counts,{ attribution }) => ({
      ...counts,[attribution.responseOrigin]:(counts[attribution.responseOrigin] ?? 0)+1
    }),{}),consoleErrorCategories:result.consoleErrorCategories
  },null,2)}\n`);
} catch (error) {
  result.failureCode=result.currentPostReadyStage?.state === "ENTERED"
    ? guidePostReadyFailureCode(result.currentPostReadyStage.stage)
    : error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message : "GUIDE_HARNESS_CAPTURE_FAILED";
  await checkpoint();
  throw error;
} finally {
  await context.close();
  await rm(PROFILE_ROOT,{ recursive:true,force:true });
}
