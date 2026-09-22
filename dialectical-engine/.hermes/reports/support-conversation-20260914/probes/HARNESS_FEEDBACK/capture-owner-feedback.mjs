import { createHash } from "node:crypto";
import { access,mkdir,readFile,rm,stat,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { classifyConsoleError,emptyConsoleErrorCounts } from "../LIVE_P3/console-classifier.mjs";
import { consumeSupportDiagnosticWindow } from "../LIVE_P3/diagnostic-consumer.mjs";
import { createRuntimeSessionVersionGate } from "../LIVE_P3/session-version-gate.mjs";
import { FEEDBACK_MATRIX } from "./matrix.mjs";
import { assertFeedbackObservation,validateFinalGateInput } from "./controls.mjs";
import { createFeedbackPreRequestVerifier } from "./pre-request-verifier.ts";

const REPORT_ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const EVIDENCE_ROOT = `${REPORT_ROOT}/evidence`;
const PROFILE_ROOT = `${REPORT_ROOT}/probes/HARNESS_FEEDBACK/browser-profile`;
const RECEIPT_PATH = `${EVIDENCE_ROOT}/FEEDBACK_LIVE-actual-receipt.json`;
const EXECUTABLE_PATH = "/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const gatePath = process.argv[2];
if (typeof gatePath !== "string" || !gatePath.startsWith("/")) throw new Error("HARNESS_FEEDBACK_GATE_PATH_REQUIRED");
const gateBytes = await readFile(gatePath);
const gateInput = validateFinalGateInput(JSON.parse(gateBytes.toString("utf8")));
const verifier = createFeedbackPreRequestVerifier(gateInput);
try { await access(RECEIPT_PATH); throw new Error("HARNESS_FEEDBACK_RECEIPT_ALREADY_EXISTS"); }
catch (error) { if (error?.code !== "ENOENT") throw error; }
await mkdir(EVIDENCE_ROOT,{ recursive:true });
await mkdir(PROFILE_ROOT,{ recursive:false,mode:0o700 });

let sessionGate = createRuntimeSessionVersionGate(verifier.kbVersion);
const seenAttemptIds = new Set();
const result = {
  schemaVersion:1,completed:false,finalCommit:verifier.finalCommit,kbVersion:verifier.kbVersion,
  entryCount:verifier.entryCount,gatePath,gateSha256:sha256(gateBytes),baseUrl:gateInput.baseUrl,
  browser:{ driver:"playwright@1.61.1",executablePath:EXECUTABLE_PATH,headless:true,tlsBypass:false,freshProfile:true },
  supportApi:"actual",relay:"actual unchanged support-preview relay",identity:"actual anonymous visitor",
  syntheticSupportOverrides:false,credentialOrRecoveryOperations:0,
  preRequestControlProof:{ declaredControls:verifier.declaredControls,derivedFromBoundResult:true },
  matrixCount:FEEDBACK_MATRIX.length,sessionKbVersions:[],rows:[],navigations:[],network:[],
  consoleErrorCount:0,consoleErrorCategories:emptyConsoleErrorCounts(),screenshots:[]
};
async function checkpoint() { await writeFile(RECEIPT_PATH,JSON.stringify(result,null,2)+"\n"); }
function operationFor(url,method) {
  const parsed = new URL(url);
  if (parsed.pathname === "/api/v1/support/sessions" && method === "POST") return "create_session";
  if (/^\/api\/v1\/support\/sessions\/[^/]+\/messages$/u.test(parsed.pathname) && method === "POST") return "send_message";
  return null;
}
function safeResponse(body,status) {
  const row = body !== null && typeof body === "object" && !Array.isArray(body) ? body : {};
  const sources = Array.isArray(row.sources) ? row.sources.flatMap(source =>
    source !== null && typeof source === "object" && !Array.isArray(source)
      && typeof source.id === "string" && typeof source.label === "string"
      ? [{ id:source.id,label:source.label }] : []) : [];
  const actions = Array.isArray(row.actions) ? row.actions.flatMap(action =>
    action !== null && typeof action === "object" && !Array.isArray(action)
      && typeof action.id === "string" && typeof action.label === "string" && typeof action.href === "string"
      ? [{ id:action.id,label:action.label,href:action.href }] : []) : [];
  return { status,outcome:typeof row.outcome === "string" ? row.outcome : null,
    text:typeof row.text === "string" ? row.text : null,sources,actions };
}
function safeProof(proof) {
  if (proof.branch === "MODEL") return {
    branch:proof.branch,topSourceId:proof.topSourceId,sourceIds:proof.sourceIds,
    requestedActionIds:proof.requestedActionIds,fallbackSha256:proof.fallbackSha256,review:proof.review
  };
  return proof;
}
function deterministicDiagnostic(bytes,start,end) {
  const window = bytes.subarray(start,end).toString("utf8");
  const candidateCount = (window.match(/SUPPORT_DRAFT_/gu) ?? []).length;
  return Object.freeze({ status:"NOT_APPLICABLE",candidateCount });
}

const context = await chromium.launchPersistentContext(PROFILE_ROOT,{
  executablePath:EXECUTABLE_PATH,headless:true,viewport:{ width:1440,height:1000 }
});
const page = context.pages()[0] ?? await context.newPage();
page.on("console",message => {
  if (message.type() === "error") {
    result.consoleErrorCount += 1;
    result.consoleErrorCategories[classifyConsoleError(message.text())] += 1;
  }
});
page.on("response",async response => {
  const operation = operationFor(response.url(),response.request().method());
  if (operation !== null) result.network.push({ operation,status:response.status() });
  if (operation === "create_session") {
    try {
      const version = sessionGate.observe(await response.json());
      result.sessionKbVersions.push(version);
    } catch (error) {
      result.sessionVersionFailure = error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
        ? error.message : "HARNESS_FEEDBACK_SESSION_VERSION_FAILURE";
    }
  }
});
await page.route("**/api/v1/support/sessions/*/messages",async route => {
  try { await sessionGate.waitUntilReady(); await route.continue(); }
  catch { await route.abort("blockedbyclient"); }
});

async function waitForHydration(language="en") {
  const ro = page.locator('.supportLanguage button').filter({ hasText:/^RO$/ }).first();
  const en = page.locator('.supportLanguage button').filter({ hasText:/^EN$/ }).first();
  for (let attempt=0;attempt<40;attempt+=1) {
    await ro.click();
    if (await ro.getAttribute("aria-pressed") === "true") break;
    await page.waitForTimeout(100);
  }
  if (await ro.getAttribute("aria-pressed") !== "true") throw new Error("HARNESS_FEEDBACK_UI_NOT_HYDRATED");
  if (language === "en") await en.click();
}
async function settleCookieConsent() {
  const bar = page.getByRole("region",{ name:"Cookie consent" });
  if (await bar.isVisible()) {
    await bar.getByRole("button",{ name:"Essential only",exact:true }).click();
    await bar.waitFor({ state:"hidden" });
  }
}
async function setLanguage(language) {
  const label = language === "ro" ? "RO" : "EN";
  const button = page.locator('.supportLanguage button').filter({ hasText:new RegExp(`^${label}$`) }).first();
  await button.click();
  await page.waitForFunction(expected =>
    document.querySelector('.supportLanguage button[aria-pressed="true"]')?.textContent?.trim() === expected,label);
}
async function openMode(mode,language) {
  sessionGate = createRuntimeSessionVersionGate(verifier.kbVersion);
  if (mode === "compact") {
    await page.setViewportSize({ width:390,height:844 });
    await page.goto(gateInput.baseUrl,{ waitUntil:"domcontentloaded" });
    const toggle = page.locator("[data-support-widget-toggle]");
    await toggle.click();
    await page.locator('.supportAssistantCompact .supportComposer input[name="support-message"]').waitFor();
  } else {
    await page.setViewportSize({ width:1440,height:1000 });
    await page.goto(`${gateInput.baseUrl}/help`,{ waitUntil:"domcontentloaded" });
    await page.locator('.supportDesk .supportComposer input[name="support-message"]').waitFor();
  }
  await waitForHydration(language);
  await settleCookieConsent();
  await setLanguage(language);
}
async function readVisibleReply(article,language) {
  const sourceName = language === "ro" ? "Surse" : "Sources";
  const actionName = language === "ro" ? "Acțiuni" : "Actions";
  return {
    text:await article.locator("p").first().innerText(),
    sources:await article.locator(`[aria-label="${sourceName}"] [role="listitem"]`).allTextContents(),
    actions:await article.locator(`[aria-label="${actionName}"] a`).evaluateAll(links =>
      links.map(link => ({ label:link.textContent?.trim() ?? "",href:link.getAttribute("href") ?? "" })))
  };
}
async function activateFirstAction(article,kind,sequence) {
  const link = article.locator("nav a").first();
  if (await link.count() === 0) {
    result.navigations.push({ sequence,kind,performed:false,reason:"NO_RENDERED_ACTION" });
    return;
  }
  const href = await link.getAttribute("href");
  const label = (await link.innerText()).trim();
  await Promise.all([
    page.waitForURL(url => url.origin === gateInput.baseUrl && url.pathname !== "/help"),
    kind === "keyboard" ? link.press("Enter") : link.click()
  ]);
  result.navigations.push({ sequence,kind,performed:true,label,href,destination:page.url() });
}
async function send(row) {
  const proof = verifier.prepare(row);
  const assistant = page.locator('.supportMessage[data-role="assistant"]');
  const before = await assistant.count();
  const root = row.mode === "full" ? ".supportDesk" : ".supportAssistantCompact";
  const composer = page.locator(`${root} .supportComposer`);
  const field = composer.locator('input[name="support-message"]');
  const button = composer.locator('button[type="submit"]');
  await field.fill(row.prompt);
  const responsePromise = page.waitForResponse(response =>
    operationFor(response.url(),response.request().method()) === "send_message",{ timeout:200_000 });
  const cursorStart = (await stat(gateInput.runtimeLogPath)).size;
  if (row.navigation === "keyboard-submit") await field.press("Enter"); else await button.click();
  const response = await responsePromise;
  await sessionGate.waitUntilReady();
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  await assistant.nth(before).waitFor({ state:"visible",timeout:20_000 });
  await button.waitFor({ state:"visible" });
  const visible = await readVisibleReply(assistant.nth(before),row.language);
  const api = safeResponse(body,response.status());
  await page.waitForTimeout(100);
  let cursorEnd = (await stat(gateInput.runtimeLogPath)).size;
  for (let attempt=0;attempt<4;attempt+=1) {
    await page.waitForTimeout(50);
    const next = (await stat(gateInput.runtimeLogPath)).size;
    if (next === cursorEnd) break;
    cursorEnd = next;
  }
  const bytes = await readFile(gateInput.runtimeLogPath);
  const diagnostic = row.branch === "MODEL"
    ? consumeSupportDiagnosticWindow(bytes,{
      cursorStart,cursorEnd,seenAttemptIds,
      responseEvidence:proof.classifyResponse({
        outcome:api.outcome ?? "",text:api.text ?? "",sourceIds:api.sources.map(({ id }) => id)
      })
    }) : deterministicDiagnostic(bytes,cursorStart,cursorEnd);
  const attribution = assertFeedbackObservation({ row,proof,api,visible,diagnostic });
  const record = { ...row,proof:safeProof(proof),api,visible,diagnostic,attribution };
  result.rows.push(record);
  const screenshot = `${EVIDENCE_ROOT}/FEEDBACK_LIVE-row-${String(row.sequence).padStart(2,"0")}.png`;
  await page.screenshot({ path:screenshot,fullPage:true });
  result.screenshots.push(screenshot);
  await checkpoint();
  return assistant.nth(before);
}

try {
  let mode = null;
  let language = null;
  for (const row of FEEDBACK_MATRIX) {
    if (mode !== row.mode || language !== row.language) {
      await openMode(row.mode,row.language); mode=row.mode; language=row.language;
    }
    const article = await send(row);
    if (row.navigation === "pointer") {
      await activateFirstAction(article,"pointer",row.sequence);
      mode=null; language=null;
    } else if (row.topic === "recovery" && verifier.recovery.status === "VERIFIED" && row.sequence === 6) {
      await activateFirstAction(article,"pointer",row.sequence);
      mode=null; language=null;
    }
  }
  result.completed = true;
  await checkpoint();
  process.stdout.write(JSON.stringify({ completed:true,rows:result.rows.length,
    origins:result.rows.map(({ attribution }) => attribution.responseOrigin),
    navigations:result.navigations,consoleErrorCategories:result.consoleErrorCategories },null,2)+"\n");
} catch (error) {
  result.failureCode = error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
    ? error.message : "HARNESS_FEEDBACK_CAPTURE_FAILED";
  await checkpoint();
  throw error;
} finally {
  await context.close();
  await rm(PROFILE_ROOT,{ recursive:true,force:true });
}
