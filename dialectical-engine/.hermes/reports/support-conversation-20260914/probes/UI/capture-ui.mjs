import { mkdir,rm,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";

const evidenceRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const profileRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/UI/browser-profile";
const executablePath = "/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const baseUrl = "https://localhost:3100";

await mkdir(evidenceRoot,{ recursive: true });
await rm(profileRoot,{ recursive: true,force: true });
await mkdir(profileRoot,{ recursive: true,mode: 0o700 });

const apiCalls = [];
const consoleErrors = [];
let staleProbeActive = false;
const staleCalls = [];
const result = {
  schema_version: 1,
  base_url: baseUrl,
  browser: { driver: "playwright@1.61.1",executablePath,headless: true,tls_bypass: false },
  synthetic_api: true,
  observations: [],
  action_activation: null,
  stale_session: null,
  api_calls: apiCalls,
  console_errors: consoleErrors
};

const context = await chromium.launchPersistentContext(profileRoot,{
  executablePath,
  headless: true,
  viewport: { width: 1440,height: 1000 }
});
const page = context.pages()[0] ?? await context.newPage();
page.on("console",(message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.route("**/api/v1/session",async (route) => {
  apiCalls.push({ method: route.request().method(),path: "/api/v1/session" });
  await route.fulfill({ status: 401,contentType: "application/json",body: "{}" });
});
await page.route("**/api/v1/support/status",async (route) => {
  apiCalls.push({ method: route.request().method(),path: "/api/v1/support/status" });
  await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
    configuration: { kind: "AVAILABLE" },relay_state: "AVAILABLE",kb_loaded: { shipped: 18,ignored: 0 }
  }) });
});
await page.route("**/api/v1/support/sessions",async (route) => {
  apiCalls.push({ method: route.request().method(),path: "/api/v1/support/sessions" });
  if (staleProbeActive) staleCalls.push({ step: "create",session: "B" });
  await route.fulfill({ status: 201,contentType: "application/json",body: JSON.stringify({
    session: { session_id: staleProbeActive ? "stale-b" : `browser-${apiCalls.length}`,identity_bound: false },
    session_token: "synthetic-browser-token"
  }) });
});
await page.route(/\/api\/v1\/support\/sessions\/[^/]+\/messages$/,async (route) => {
  const request = route.request();
  const requestBody = request.postDataJSON();
  const language = requestBody.language === "ro" ? "ro" : "en";
  const path = new URL(request.url()).pathname;
  apiCalls.push({ method: request.method(),path,language });
  if (path.endsWith("/stale-a/messages")) {
    staleCalls.push({ step: "message",session: "A",redacted: requestBody.text === "My [REDACTED_SECRET_LIKE] failed" });
    await route.fulfill({ status: 409,contentType: "application/json",body: JSON.stringify({
      error: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE",restart_session: true
    }) });
    return;
  }
  if (path.endsWith("/stale-b/messages")) {
    staleCalls.push({ step: "message",session: "B",redacted: requestBody.text === "My [REDACTED_SECRET_LIKE] failed" });
    await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
      message_id: "browser-fresh-answer",outcome: "NO_SOURCE",text: "Fresh session answer.",sources: [],actions: []
    }) });
    return;
  }
  await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
    message_id: `browser-answer-${apiCalls.length}`,
    outcome: "ANSWER_GROUNDED",
    text: language === "ro"
      ? "Poți porni o dezbatere după autentificare și alegerea opțiunilor disponibile pentru planul tău."
      : "You can start a debate after signing in and choosing the controls available for your plan.",
    sources: [
      { id: "getting-started-debate",label: language === "ro" ? "Începe o dezbatere" : "Start a debate" },
      { id: "budget-tier-choice",label: language === "ro" ? "Alege planul" : "Choose your plan" }
    ],
    actions: [{
      id: "start-debate",
      label: language === "ro" ? "Pornește o dezbatere" : "Start a debate",
      href: "/login?next=%2Fnew"
    }]
  }) });
});

async function capture(mode,language,screenshotPath) {
  await page.waitForTimeout(400);
  const sourceLabel = language === "ro" ? "Surse" : "Sources";
  const actionLabel = language === "ro" ? "Acțiuni" : "Actions";
  const expectedText = language === "ro" ? "Poți porni o dezbatere" : "You can start a debate";
  const sourceItems = await page.locator(`[aria-label="${sourceLabel}"] [role="listitem"]`).allTextContents();
  const action = page.getByRole("link",{ name: language === "ro" ? "Pornește o dezbatere" : "Start a debate",exact: true });
  const actionCount = await action.count();
  const actionHref = actionCount === 1 ? await action.getAttribute("href") : null;
  const actionBox = actionCount === 1 ? await action.boundingBox() : null;
  const shellStyle = await page.locator(".supportMessageCore").last().evaluate((element) => {
    const style = getComputedStyle(element);
    return { display: style.display,fontFamily: style.fontFamily,color: style.color,backgroundColor: style.backgroundColor };
  });
  const textVisible = await page.getByText(new RegExp(expectedText)).isVisible();
  await page.screenshot({ path: screenshotPath,fullPage: mode === "full" });
  result.observations.push({ mode,language,url: page.url(),sourceLabel,sourceItems,actionLabel,actionCount,actionHref,actionBox,shellStyle,textVisible,screenshotPath });
}

async function waitForHydration() {
  const ro = page.locator('.supportLanguage button').filter({ hasText: /^RO$/ }).first();
  const en = page.locator('.supportLanguage button').filter({ hasText: /^EN$/ }).first();
  for (let attempt = 0;attempt < 40;attempt += 1) {
    await ro.click();
    if (await ro.getAttribute("aria-pressed") === "true") break;
    await page.waitForTimeout(100);
  }
  if (await ro.getAttribute("aria-pressed") !== "true") throw new Error("SUPPORT_ASSISTANT_DID_NOT_HYDRATE");
  await en.click();
  await page.waitForFunction(() => document.querySelector('.supportLanguage button[aria-pressed="true"]')?.textContent?.trim() === "EN");
}

async function settleCookieConsent() {
  const bar = page.getByRole("region",{ name: "Cookie consent" });
  if (await bar.isVisible()) {
    await bar.getByRole("button",{ name: "Essential only",exact: true }).click();
    await bar.waitFor({ state: "hidden" });
  }
}

async function openCompactWidget() {
  const toggle = page.locator("[data-support-widget-toggle]");
  await toggle.waitFor();
  for (let attempt = 0;attempt < 20;attempt += 1) {
    await toggle.click();
    if (await page.locator(".supportAssistantCompact").isVisible()) return;
    await page.waitForTimeout(100);
  }
  throw new Error("SUPPORT_WIDGET_DID_NOT_HYDRATE");
}

try {
  await page.goto(`${baseUrl}/help`,{ waitUntil: "domcontentloaded" });
  await page.locator('.supportComposer input[name="support-message"]').waitFor();
  await waitForHydration();
  await settleCookieConsent();
  await page.locator('.supportComposer input[name="support-message"]').fill("How do I create a debate?");
  await page.locator('.supportComposer button[type="submit"]').click();
  await page.getByText(/You can start a debate/).waitFor();
  await capture("full","en",`${evidenceRoot}/UI-full-en.png`);

  const fullAction = page.getByRole("link",{ name: "Start a debate",exact: true });
  await fullAction.focus();
  const focusedName = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);
  await Promise.all([
    page.waitForURL(`${baseUrl}/login?next=%2Fnew`),
    fullAction.press("Enter")
  ]);
  result.action_activation = { input: "keyboard-enter",focusedName,destination: page.url() };

  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${baseUrl}/help`,{ waitUntil: "domcontentloaded" });
  await page.locator('.supportComposer input[name="support-message"]').waitFor();
  await waitForHydration();
  await page.getByRole("button",{ name: "RO",exact: true }).first().click();
  await page.locator('.supportComposer input[name="support-message"]').fill("Cum creez o dezbatere?");
  await page.locator('.supportComposer button[type="submit"]').click();
  await page.getByText(/Poți porni o dezbatere/).waitFor();
  await capture("full","ro",`${evidenceRoot}/UI-full-ro.png`);

  staleProbeActive = true;
  await page.evaluate(() => {
    sessionStorage.setItem("debateai.support.conversation.v1",JSON.stringify({
      language: "en",
      session: { sessionId: "stale-a",token: "synthetic-stale-token",identityBound: false },
      messages: [{ id: "disclosure",role: "assistant",text: "Prior disclosure." }],
      ownContext: { latest: true }
    }));
  });
  await page.goto(`${baseUrl}/help`,{ waitUntil: "domcontentloaded" });
  await page.locator('.supportComposer input[name="support-message"]').waitFor();
  await waitForHydration();
  await page.locator('.supportComposer input[name="support-message"]').fill("My code 123456 failed");
  await page.locator('.supportComposer button[type="submit"]').click();
  await page.getByText("Fresh session answer.",{ exact: true }).waitFor();
  const staleStored = await page.evaluate(() => sessionStorage.getItem("debateai.support.conversation.v1"));
  result.stale_session = {
    synthetic: true,
    calls: staleCalls,
    oneVisibleUserTurn: await page.locator('[data-role="user"]').count() === 1,
    storedSessionB: typeof staleStored === "string" && staleStored.includes("stale-b"),
    removedSessionA: typeof staleStored === "string" && !staleStored.includes("stale-a")
  };
  staleProbeActive = false;

  await page.evaluate(() => sessionStorage.clear());
  await page.setViewportSize({ width: 390,height: 844 });
  await page.goto(baseUrl,{ waitUntil: "domcontentloaded" });
  await openCompactWidget();
  await page.locator('.supportComposer input[name="support-message"]').fill("How do I create a debate?");
  await page.locator('.supportComposer button[type="submit"]').click();
  await page.getByText(/You can start a debate/).waitFor();
  await capture("compact","en",`${evidenceRoot}/UI-compact-en.png`);

  await page.evaluate(() => sessionStorage.clear());
  await page.goto(baseUrl,{ waitUntil: "domcontentloaded" });
  await openCompactWidget();
  await page.getByRole("button",{ name: "RO",exact: true }).click();
  await page.locator('.supportComposer input[name="support-message"]').fill("Cum creez o dezbatere?");
  await page.locator('.supportComposer button[type="submit"]').click();
  await page.getByText(/Poți porni o dezbatere/).waitFor();
  await capture("compact","ro",`${evidenceRoot}/UI-compact-ro.png`);

  await writeFile(`${evidenceRoot}/UI-browser-receipt.json`,JSON.stringify(result,null,2) + "\n");
  process.stdout.write(JSON.stringify(result,null,2) + "\n");
} catch (error) {
  const failure = { ...result,error: error instanceof Error ? { name: error.name,message: error.message } : { name: "UnknownError",message: String(error) } };
  await writeFile(`${evidenceRoot}/UI-browser-receipt.json`,JSON.stringify(failure,null,2) + "\n");
  throw error;
} finally {
  await context.close();
}
