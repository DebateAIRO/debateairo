import { mkdir,mkdtemp,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename,dirname,isAbsolute,resolve } from "node:path";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { classifyConsoleError,emptyConsoleErrorCounts } from "../LIVE_P3/console-classifier.mjs";
import { openGuideSupportSurface } from "./controls.mjs";

const EVIDENCE_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const EXECUTABLE_PATH="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const BASE_URL="https://localhost:3100";
const COMMIT=/^[0-9a-f]{40}$/u;
const FIXED_CODE=/^GUIDE_[A-Z0-9_]+$/u;
const [expectedRevision,outputPath,...extra]=process.argv.slice(2);
if (extra.length !== 0 || !COMMIT.test(expectedRevision ?? "") || !isAbsolute(outputPath ?? "")
  || dirname(outputPath) !== EVIDENCE_ROOT
  || !/^GUIDE_UI_TRANSITION_PROBE-run-[A-Za-z0-9_-]+\.json$/u.test(basename(outputPath))) {
  throw new Error("GUIDE_UI_PROBE_ARGUMENTS_INVALID");
}

const result={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND13_UI_PROBE",revision:expectedRevision,
  completed:false,verdict:"RUNNING",baseUrlClass:"LOCAL_ORDINARY_TLS",
  browser:{ driver:"playwright@1.61.1",headless:true,tlsBypass:false,freshProfile:true },
  traffic:{
    actualSupportRequestsForwarded:0,
    guardedAttempts:{ status:0,createSession:0,sendMessage:0,otherSupport:0 }
  },
  transitionSequence:[
    "fresh full/en","same-session full/ro","storage-reset compact/ro",
    "route-remount full/en","storage-reset compact/en"
  ],
  observations:[],transitions:[],failure:null,
  consoleErrorCategories:emptyConsoleErrorCounts(),privateControls:[]
};
let created=false;
async function checkpoint() {
  await mkdir(EVIDENCE_ROOT,{ recursive:true });
  await writeFile(outputPath,`${JSON.stringify(result,null,2)}\n`,created ? {} : { flag:"wx",mode:0o600 });
  created=true;
}
function guardedOperation(url,method) {
  const path=new URL(url).pathname;
  if (path === "/api/v1/support/status") return "status";
  if (path === "/api/v1/support/sessions" && method === "POST") return "createSession";
  if (/^\/api\/v1\/support\/sessions\/[^/]+\/messages$/u.test(path) && method === "POST") return "sendMessage";
  if (path.startsWith("/api/v1/support/")) return "otherSupport";
  return null;
}

const profile=await mkdtemp(resolve(tmpdir(),"guide-bind13-ui-"));
const context=await chromium.launchPersistentContext(profile,{
  executablePath:EXECUTABLE_PATH,headless:true,viewport:{ width:1440,height:1000 }
});
const page=context.pages()[0] ?? await context.newPage();
page.on("console",message => {
  if (message.type() === "error") {
    result.consoleErrorCategories[classifyConsoleError(message.text())]+=1;
  }
});
await page.route("**/*",async route => {
  const operation=guardedOperation(route.request().url(),route.request().method());
  if (operation === null) await route.continue();
  else {
    result.traffic.guardedAttempts[operation]+=1;
    await route.abort("blockedbyclient");
  }
});

async function waitForHydratedClickHandler(locator) {
  await locator.waitFor({ state:"visible",timeout:30_000 });
  const element=await locator.elementHandle();
  if (element === null) throw new Error("GUIDE_UI_PROBE_HYDRATION_TARGET_MISSING");
  await page.waitForFunction(node => Object.getOwnPropertyNames(node).some(name =>
    name.startsWith("__reactProps$") && typeof node[name]?.onClick === "function"
  ),element,{ timeout:30_000 });
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
async function observe(surface,language,phase,hydrationReady) {
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
    composerCount,composerVisible:await fixedVisibility(composer,composerCount),
    urlClass:urlClass(),cookieRegionVisible:await fixedVisibility(cookie,cookieCount),
    consoleErrorCategories:{ ...result.consoleErrorCategories }
  };
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
async function assertNoPrivateControls(surface) {
  const labels=["Attach debate","Atașează dezbatere","Use my debate context","Folosește contextul dezbaterii"];
  const counts=[];
  for (const label of labels) counts.push(await page.getByText(label,{ exact:true }).count());
  const passed=counts.every(count => count === 0);
  result.privateControls.push({ surface,passed });
  if (!passed) throw new Error("GUIDE_UI_PROBE_PRIVATE_CONTROL_PRESENT");
}
async function open(surface,language,navigate) {
  const compact=surface === "compact";
  const toggle=page.locator("[data-support-widget-toggle]");
  const hydrationTarget=compact
    ? toggle : page.locator('.supportLanguage button').filter({ hasText:/^EN$/ }).first();
  const composer=page.locator(compact
    ? '.supportAssistantCompact .supportComposer input[name="support-message"]'
    : '.supportDesk .supportComposer input[name="support-message"]');
  const transition=await openGuideSupportSurface({
    surface,language,navigate,
    waitForHydration:() => waitForHydratedClickHandler(hydrationTarget),
    observe:(phase,hydrationReady) => observe(surface,language,phase,hydrationReady),
    activateCompact:() => toggle.click(),
    waitForReady:() => composer.waitFor({ state:"visible",timeout:30_000 }),
    selectLanguage:async selected => { await settleCookieConsent(); await setLanguage(selected); },
    checkpoint:async (observation,code) => {
      result.observations.push(observation);
      if (code !== null) result.failure={ code,phase:observation.phase,surface,language };
      await checkpoint();
    }
  });
  await assertNoPrivateControls(surface);
  result.transitions.push({ surface,language,result:"PASS",readyPhase:transition.ready.phase });
  await checkpoint();
}

try {
  await open("full","en",async () => {
    await page.setViewportSize({ width:1440,height:1000 });
    await page.goto(`${BASE_URL}/help`,{ waitUntil:"domcontentloaded" });
  });
  await open("full","ro",async () => {});
  await page.evaluate(() => sessionStorage.removeItem("debateai.support.conversation.v1"));
  await open("compact","ro",async () => {
    await page.setViewportSize({ width:390,height:844 });
    await page.goto(BASE_URL,{ waitUntil:"domcontentloaded" });
  });
  await open("full","en",async () => {
    await page.setViewportSize({ width:1440,height:1000 });
    await page.goto(`${BASE_URL}/help`,{ waitUntil:"domcontentloaded" });
  });
  await page.evaluate(() => sessionStorage.removeItem("debateai.support.conversation.v1"));
  await open("compact","en",async () => {
    await page.setViewportSize({ width:390,height:844 });
    await page.goto(BASE_URL,{ waitUntil:"domcontentloaded" });
  });
  if (result.traffic.guardedAttempts.createSession !== 0
    || result.traffic.guardedAttempts.sendMessage !== 0
    || result.traffic.guardedAttempts.otherSupport !== 0
    || result.transitions.length !== 5 || result.privateControls.some(({ passed }) => !passed)) {
    throw new Error("GUIDE_UI_PROBE_NO_TRAFFIC_CONTRACT_FAILED");
  }
  result.completed=true;
  result.verdict="PASS_ZERO_SUPPORT_UI_TRANSITIONS";
  await checkpoint();
} catch (error) {
  const code=FIXED_CODE.test(error?.message ?? "") ? error.message : "GUIDE_UI_PROBE_UNCLASSIFIED_FAILURE";
  result.completed=false;
  result.verdict="FAIL_ZERO_SUPPORT_UI_TRANSITIONS";
  if (result.failure === null) result.failure={ code,phase:"UNAVAILABLE",surface:"UNKNOWN",language:"UNKNOWN" };
  await checkpoint();
  process.exitCode=1;
} finally {
  await context.close();
  await rm(profile,{ recursive:true,force:true });
}
