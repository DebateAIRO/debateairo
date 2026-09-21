import { createHash } from "node:crypto";
import { access,mkdir,readFile,rm,stat,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { classifyConsoleError,emptyConsoleErrorCounts } from "../LIVE_P3/console-classifier.mjs";
import { consumeSupportDiagnosticWindow } from "../LIVE_P3/diagnostic-consumer.mjs";
import { createRuntimeSessionVersionGate } from "../LIVE_P3/session-version-gate.mjs";
import { GUIDE_MATRIX } from "./matrix.mjs";
import { assertGuideObservation,validateGuideGateInput } from "./controls.mjs";
import { createGuidePreRequestVerifier } from "./pre-request-verifier.ts";

const REPORT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const EVIDENCE_ROOT=`${REPORT_ROOT}/evidence`;
const PROFILE_ROOT=`${REPORT_ROOT}/probes/GUIDE_HARNESS/browser-profile`;
const RECEIPT_PATH=`${EVIDENCE_ROOT}/GUIDE_LIVE-actual-receipt.json`;
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
const seenAttemptIds=new Set();
const result={
  schemaVersion:1,completed:false,finalCommit:verifier.finalCommit,kbVersion:verifier.kbVersion,
  entryCount:verifier.entryCount,requiredSuiteFiles:verifier.suiteFiles,
  gatePath,gateSha256:sha256(gateBytes),baseUrl:gateInput.baseUrl,
  browser:{ driver:"playwright@1.61.1",executablePath:EXECUTABLE_PATH,headless:true,tlsBypass:false,freshProfile:true },
  supportApi:"actual",relay:"actual unchanged support-preview relay",identity:"actual anonymous visitor",
  syntheticSupportOverrides:false,privateRecordsUsed:false,credentialOrRecoveryOperations:0,
  forgotConnector:"UNRESOLVED_ACTIONLESS",
  preRequestControlProof:{ declaredControls:verifier.declaredControls,derivedFromBoundResult:true },
  matrixCount:GUIDE_MATRIX.length,rows:[],navigations:[],networkCounts:{
    createSession:0,sendMessage:0,forbiddenAnswers:0,forbiddenConsent:0
  },sessionKbVersions:[],sessionReplacementEvidence:[],noPrivateControls:[],
  consoleErrorCount:0,consoleErrorCategories:emptyConsoleErrorCounts(),screenshots:[]
};
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
    try { result.sessionKbVersions.push(sessionGate.observe(await response.json())); }
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
  sessionGate=createRuntimeSessionVersionGate(verifier.kbVersion);
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
  const responsePromise=page.waitForResponse(response =>
    operationFor(response.url(),response.request().method()) === "sendMessage",{ timeout:200_000 });
  const cursorStart=(await stat(gateInput.runtimeLogPath)).size;
  await button.click();
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
  const screenshot=`${EVIDENCE_ROOT}/GUIDE_LIVE-row-${String(row.sequence).padStart(2,"0")}.png`;
  await page.screenshot({ path:screenshot,fullPage:true });
  result.screenshots.push(screenshot);
  await checkpoint();
  if (row.navigation !== null) await activateBoundAction(article,row,proof);
}

try {
  let mode=null;
  let language=null;
  for (const row of GUIDE_MATRIX) {
    const lifecycleSwitch=row.lifecycleRole === "ACCOUNT_RO_AFTER_SWITCH";
    if (lifecycleSwitch) {
      if (mode !== "full" || language !== "en") throw new Error("GUIDE_HARNESS_LIFECYCLE_ORDER_INVALID");
      const before=result.networkCounts.createSession;
      await setLanguage("ro");
      language="ro";
      await send(row);
      const after=result.networkCounts.createSession;
      if (after !== before+1) throw new Error("GUIDE_HARNESS_SESSION_REPLACEMENT_INVALID");
      result.sessionReplacementEvidence.push({ sequence:row.sequence,before,after,selectedLanguage:"ro" });
      continue;
    }
    if (mode !== row.mode || language !== row.language) {
      await openMode(row.mode,row.language);
      mode=row.mode;
      language=row.language;
    }
    await send(row);
    if (row.navigation !== null) { mode=null; language=null; }
  }
  if (result.rows.length !== GUIDE_MATRIX.length || result.networkCounts.sendMessage !== GUIDE_MATRIX.length
    || result.networkCounts.forbiddenAnswers !== 0 || result.networkCounts.forbiddenConsent !== 0) {
    throw new Error("GUIDE_HARNESS_FINAL_COUNT_INVALID");
  }
  result.completed=true;
  await checkpoint();
  process.stdout.write(`${JSON.stringify({
    completed:true,rows:result.rows.length,navigations:result.navigations.length,
    sessionReplacements:result.sessionReplacementEvidence.length,
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
