import { createHash } from "node:crypto";
import { access,mkdir,readFile,rm,stat,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { classifyConsoleError,emptyConsoleErrorCounts } from "../LIVE_P3/console-classifier.mjs";
import { consumeSupportDiagnosticWindow } from "../LIVE_P3/diagnostic-consumer.mjs";
import { createRuntimeSessionVersionGate } from "../LIVE_P3/session-version-gate.mjs";
import {
  GUIDE_EXECUTION_ORDER,GUIDE_MATRIX,GUIDE_REQUEST_START_SPACING_MS,GUIDE_SESSION_GROUPS,
  validateGuideRequestStartOffsets
} from "./matrix.mjs";
import { assertGuideObservation,validateGuideGateInput } from "./controls.mjs";
import { createGuidePreRequestVerifier } from "./pre-request-verifier.ts";
import {
  createGuideSessionLifecycle,resetGuideStoredConversation
} from "./session-lifecycle.mjs";

const REPORT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const EVIDENCE_ROOT=`${REPORT_ROOT}/evidence`;
const PROFILE_ROOT=`${REPORT_ROOT}/probes/GUIDE_HARNESS_FIX2/browser-profile`;
const RECEIPT_PATH=`${EVIDENCE_ROOT}/GUIDE_LIVE_GUIDE2-actual-receipt.json`;
const EXECUTABLE_PATH="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const gatePath=process.argv[2];
if (typeof gatePath !== "string" || !gatePath.startsWith("/")) {
  throw new Error("GUIDE_HARNESS_GATE_PATH_REQUIRED");
}
const gateBytes=await readFile(gatePath);
const gateInput=validateGuideGateInput(JSON.parse(gateBytes.toString("utf8")));
const verifier=await createGuidePreRequestVerifier(gateInput);
try { await access(RECEIPT_PATH); throw new Error("GUIDE_HARNESS_RECEIPT_ALREADY_EXISTS"); }
catch (error) { if (error?.code !== "ENOENT") throw error; }
await mkdir(EVIDENCE_ROOT,{ recursive:true });
await mkdir(PROFILE_ROOT,{ recursive:false,mode:0o700 });

let sessionGate=createRuntimeSessionVersionGate(verifier.kbVersion);
const sessionLifecycle=createGuideSessionLifecycle(GUIDE_SESSION_GROUPS);
const seenAttemptIds=new Set();
const result={
  schemaVersion:1,completed:false,finalCommit:verifier.finalCommit,kbVersion:verifier.kbVersion,
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
  executionOrder:[...GUIDE_EXECUTION_ORDER],sessionGroups:GUIDE_SESSION_GROUPS,
  pacing:{ requiredRequestStartSpacingMs:GUIDE_REQUEST_START_SPACING_MS,requestStarts:[] },
  rows:[],navigations:[],networkCounts:{
    createSession:0,sendMessage:0,forbiddenAnswers:0,forbiddenConsent:0
  },sessionKbVersions:[],sessionReplacementEvidence:[],groupSessionEvidence:[],noPrivateControls:[],
  consoleErrorCount:0,consoleErrorCategories:emptyConsoleErrorCounts(),screenshots:[]
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
function safeResponse(body,status) {
  const value=body !== null && typeof body === "object" && !Array.isArray(body) ? body : {};
  const sources=Array.isArray(value.sources) ? value.sources.flatMap(source =>
    source !== null && typeof source === "object" && !Array.isArray(source)
      && typeof source.id === "string" && typeof source.label === "string"
      ? [{ id:source.id,label:source.label }] : []) : [];
  const actions=Array.isArray(value.actions) ? value.actions.flatMap(action =>
    action !== null && typeof action === "object" && !Array.isArray(action)
      && typeof action.id === "string" && typeof action.label === "string" && typeof action.href === "string"
      ? [{ id:action.id,label:action.label,href:action.href }] : []) : [];
  return { status,outcome:typeof value.outcome === "string" ? value.outcome : null,
    text:typeof value.text === "string" ? value.text : null,sources,actions };
}
function safeProof(proof) {
  if (proof.branch !== "MODEL") return proof;
  return {
    branch:proof.branch,sourceIds:proof.sourceIds,requestedActionIds:proof.requestedActionIds,
    allowedActions:proof.allowedActions,fallbackSha256:proof.fallbackSha256,review:proof.review
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

async function waitForHydration(language="en") {
  const ro=page.locator('.supportLanguage button').filter({ hasText:/^RO$/ }).first();
  const en=page.locator('.supportLanguage button').filter({ hasText:/^EN$/ }).first();
  for (let attempt=0;attempt<40;attempt+=1) {
    await ro.click();
    if (await ro.getAttribute("aria-pressed") === "true") break;
    await page.waitForTimeout(100);
  }
  if (await ro.getAttribute("aria-pressed") !== "true") throw new Error("GUIDE_HARNESS_UI_NOT_HYDRATED");
  if (language === "en") await en.click();
}
async function settleCookieConsent() {
  const bar=page.getByRole("region",{ name:"Cookie consent" });
  if (await bar.isVisible()) {
    await bar.getByRole("button",{ name:"Essential only",exact:true }).click();
    await bar.waitFor({ state:"hidden" });
  }
}
async function setLanguage(language) {
  const label=language === "ro" ? "RO" : "EN";
  const button=page.locator('.supportLanguage button').filter({ hasText:new RegExp(`^${label}$`) }).first();
  await button.click();
  await page.waitForFunction(expected =>
    document.querySelector('.supportLanguage button[aria-pressed="true"]')?.textContent?.trim() === expected,label);
}
async function assertNoPrivateControls(mode) {
  const labels=["Attach debate","Atașează dezbatere","Use my debate context","Folosește contextul dezbaterii"];
  const counts=[];
  for (const label of labels) counts.push(await page.getByText(label,{ exact:true }).count());
  if (counts.some(count => count !== 0)) throw new Error("GUIDE_HARNESS_PRIVATE_CONTROL_PRESENT");
  result.noPrivateControls.push({ mode,checked:true });
}
async function openMode(mode,language) {
  if (mode === "compact") {
    await page.setViewportSize({ width:390,height:844 });
    await page.goto(gateInput.baseUrl,{ waitUntil:"domcontentloaded" });
    await page.locator("[data-support-widget-toggle]").click();
    await page.locator('.supportAssistantCompact .supportComposer input[name="support-message"]').waitFor();
  } else {
    await page.setViewportSize({ width:1440,height:1000 });
    await page.goto(`${gateInput.baseUrl}/help`,{ waitUntil:"domcontentloaded" });
    await page.locator('.supportDesk .supportComposer input[name="support-message"]').waitFor();
  }
  await waitForHydration(language);
  await settleCookieConsent();
  await setLanguage(language);
  await assertNoPrivateControls(mode);
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
  if (row.navigation.kind === "keyboard") await link.press("Enter"); else await link.click();
  await page.waitForFunction(previous => window.location.href !== previous,before);
  result.navigations.push({
    sequence:row.sequence,kind:row.navigation.kind,actionId:expected.id,
    label:expected.label,href:expected.href,destination:page.url(),performed:true
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
  const response=await responsePromise;
  await sessionGate.waitUntilReady();
  let body={};
  try { body=await response.json(); } catch { body={}; }
  await assistant.nth(before).waitFor({ state:"visible",timeout:20_000 });
  const article=assistant.nth(before);
  const visible=await readVisibleReply(article,row.language);
  const api=safeResponse(body,response.status());
  await page.waitForTimeout(100);
  let cursorEnd=(await stat(gateInput.runtimeLogPath)).size;
  for (let attempt=0;attempt<4;attempt+=1) {
    await page.waitForTimeout(50);
    const next=(await stat(gateInput.runtimeLogPath)).size;
    if (next === cursorEnd) break;
    cursorEnd=next;
  }
  const bytes=await readFile(gateInput.runtimeLogPath);
  const diagnostic=row.branch === "MODEL"
    ? consumeSupportDiagnosticWindow(bytes,{
      cursorStart,cursorEnd,seenAttemptIds,
      responseEvidence:proof.classifyResponse({
        outcome:api.outcome ?? "",text:api.text ?? "",sourceIds:api.sources.map(({ id }) => id)
      })
    }) : deterministicDiagnostic(bytes,cursorStart,cursorEnd);
  const attribution=assertGuideObservation({ row,proof,api,visible,diagnostic });
  result.rows.push({ ...row,proof:safeProof(proof),api,visible,diagnostic,attribution,
    selectedLanguage:row.language,sessionCreateCount:result.networkCounts.createSession });
  const screenshot=`${EVIDENCE_ROOT}/GUIDE_LIVE_GUIDE2-row-${String(row.sequence).padStart(2,"0")}.png`;
  await page.screenshot({ path:screenshot,fullPage:true });
  result.screenshots.push(screenshot);
  await checkpoint();
  if (row.navigation !== null) await activateBoundAction(article,row,proof);
}

try {
  let mode=null;
  let language=null;
  const bySequence=new Map(GUIDE_MATRIX.map(row => [row.sequence,row]));
  for (let groupIndex=0;groupIndex<GUIDE_SESSION_GROUPS.length;groupIndex+=1) {
    const group=GUIDE_SESSION_GROUPS[groupIndex];
    const boundary=sessionLifecycle.beginGroup(groupIndex,result.networkCounts.createSession);
    sessionGate=createRuntimeSessionVersionGate(verifier.kbVersion);
    if (boundary.transition === "FRESH_PROFILE") {
      await openMode(group.mode,group.language);
    } else if (boundary.transition === "STORAGE_RESET_BEFORE_REMOUNT") {
      await resetStoredConversationBeforeRemount();
      await openMode(group.mode,group.language);
    } else if (groupIndex === 1) {
      if (mode !== "full" || language !== "en") throw new Error("GUIDE_HARNESS_LIFECYCLE_ORDER_INVALID");
      await setLanguage(group.language);
    } else {
      await openMode(group.mode,group.language);
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
  if (result.rows.length !== GUIDE_MATRIX.length || result.networkCounts.sendMessage !== GUIDE_MATRIX.length
    || result.networkCounts.createSession !== GUIDE_SESSION_GROUPS.length
    || result.networkCounts.forbiddenAnswers !== 0 || result.networkCounts.forbiddenConsent !== 0
    || new Set(result.rows.map(({ sequence }) => sequence)).size !== GUIDE_MATRIX.length) {
    throw new Error("GUIDE_HARNESS_FINAL_COUNT_INVALID");
  }
  validateGuideRequestStartOffsets(result.pacing.requestStarts);
  result.completed=true;
  await checkpoint();
  process.stdout.write(`${JSON.stringify({
    completed:true,rows:result.rows.length,navigations:result.navigations.length,
    sessions:result.networkCounts.createSession,modelRows:verifier.modelRows,
    sessionReplacements:result.sessionReplacementEvidence.length,
    sessionGroups:result.groupSessionEvidence.length,
    origins:result.rows.reduce((counts,{ attribution }) => ({
      ...counts,[attribution.responseOrigin]:(counts[attribution.responseOrigin] ?? 0)+1
    }),{}),consoleErrorCategories:result.consoleErrorCategories
  },null,2)}\n`);
} catch (error) {
  result.failureCode=error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
    ? error.message : "GUIDE_HARNESS_CAPTURE_FAILED";
  await checkpoint();
  throw error;
} finally {
  await context.close();
  await rm(PROFILE_ROOT,{ recursive:true,force:true });
}
