import { mkdir,rm,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";

const evidenceRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const profileRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/UIFIX1/browser-profile";
const executablePath = "/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const baseUrl = "https://localhost:3100";

await mkdir(evidenceRoot,{ recursive: true });
await rm(profileRoot,{ recursive: true,force: true });
await mkdir(profileRoot,{ recursive: true,mode: 0o700 });

const apiCalls = [];
const consoleErrors = [];
const result = {
  schema_version: 1,
  base_url: baseUrl,
  browser: { driver: "playwright@1.61.1",executablePath,headless: true,tls_bypass: false },
  synthetic_identity: true,
  synthetic_support_api: true,
  observations: [],
  cookie_opener: null,
  action_activation: null,
  api_calls: apiCalls,
  console_errors: consoleErrors
};

const context = await chromium.launchPersistentContext(profileRoot,{
  executablePath,headless: true,viewport: { width: 1440,height: 1000 }
});
const page = context.pages()[0] ?? await context.newPage();
page.on("console",message => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.route("**/api/v1/session",async route => {
  apiCalls.push({ method: route.request().method(),path: "/api/v1/session" });
  await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({ signed_in: true }) });
});
await page.route("**/api/v1/support/status",async route => {
  apiCalls.push({ method: route.request().method(),path: "/api/v1/support/status" });
  await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
    configuration: { kind: "AVAILABLE" },relay_state: "AVAILABLE",kb_loaded: { shipped: 18,ignored: 0 }
  }) });
});
await page.route("**/api/v1/answers?**",async route => {
  apiCalls.push({ method: route.request().method(),path: "/api/v1/answers" });
  await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
    items: [{
      run_ref: "123e4567-e89b-42d3-a456-426614174000",
      question_line: "Should cities fund public libraries?",
      created_at_sequence: 7
    }]
  }) });
});
await page.route("**/api/v1/support/sessions",async route => {
  apiCalls.push({ method: route.request().method(),path: "/api/v1/support/sessions" });
  await route.fulfill({ status: 201,contentType: "application/json",body: JSON.stringify({
    session: { session_id: `signed-in-${apiCalls.length}`,identity_bound: true },
    session_token: "synthetic-browser-token"
  }) });
});
await page.route(/\/api\/v1\/support\/sessions\/[^/]+\/messages$/,async route => {
  const requestBody = route.request().postDataJSON();
  const language = requestBody.language === "ro" ? "ro" : "en";
  apiCalls.push({ method: route.request().method(),path: new URL(route.request().url()).pathname,language });
  await route.fulfill({ status: 200,contentType: "application/json",body: JSON.stringify({
    message_id: `signed-in-answer-${apiCalls.length}`,
    outcome: "ANSWER_GROUNDED",
    text: language === "ro"
      ? "Poți porni o dezbatere nouă direct din contul tău."
      : "You can start a new debate directly from your account.",
    sources: [
      { id: "getting-started-debate",label: language === "ro" ? "Începe o dezbatere" : "Start a debate" },
      { id: "budget-tier-choice",label: language === "ro" ? "Alege planul" : "Choose your plan" }
    ],
    actions: [{
      id: "start-debate",
      label: language === "ro" ? "Pornește o dezbatere" : "Start a debate",
      href: "/new"
    }]
  }) });
});

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

async function capture(mode,language,screenshotPath) {
  await page.waitForTimeout(400);
  const sourceName = language === "ro" ? "Surse" : "Sources";
  const actionName = language === "ro" ? "Acțiuni" : "Actions";
  const consentCopy = language === "ro" ? /Permite asistentului/ : /Let the assistant/;
  const pickerName = language === "ro" ? "Alege una dintre dezbaterile mele" : "Choose one of my debates";
  const actionLabel = language === "ro" ? "Pornește o dezbatere" : "Start a debate";
  const action = page.getByRole("link",{ name: actionLabel,exact: true });
  const assistant = page.locator(mode === "full" ? ".supportDesk" : ".supportAssistantCompact");
  const assistantBox = await assistant.boundingBox();
  const actionBox = await action.boundingBox();
  const sources = await page.locator(`[aria-label="${sourceName}"] [role="listitem"]`).allTextContents();
  const identityVisible = mode === "full"
    ? await page.getByText("Signed-in asker",{ exact: true }).isVisible()
    : true;
  const consentVisible = await page.getByText(consentCopy).isVisible();
  const pickerVisible = await page.getByRole("region",{ name: pickerName }).isVisible();
  const debateVisible = await page.getByRole("button",{ name: "Should cities fund public libraries?",exact: true }).isVisible();
  const humanVisible = await page.getByRole("button",{
    name: mode === "full" ? "Escalate to a human"
      : language === "ro" ? "Vorbește cu o persoană" : "Talk to a human",
    exact: true
  }).isVisible();
  await page.screenshot({ path: screenshotPath,fullPage: mode === "full" });
  result.observations.push({
    mode,language,url: page.url(),identityVisible,consentVisible,pickerVisible,debateVisible,humanVisible,
    sources,actionLabel,actionHref: await action.getAttribute("href"),actionBox,assistantBox,
    actionContained: assistantBox !== null && actionBox !== null
      && actionBox.x >= assistantBox.x && actionBox.y >= assistantBox.y
      && actionBox.x + actionBox.width <= assistantBox.x + assistantBox.width
      && actionBox.y + actionBox.height <= assistantBox.y + assistantBox.height,
    screenshotPath
  });
}

async function clearSupportStateIfAvailable() {
  if (page.url().startsWith(baseUrl)) await page.evaluate(() => sessionStorage.clear());
}

async function prepareFull(language) {
  await clearSupportStateIfAvailable();
  await page.goto(`${baseUrl}/help`,{ waitUntil: "domcontentloaded" });
  await page.locator('.supportComposer input[name="support-message"]').waitFor();
  await waitForHydration();
  await settleCookieConsent();
  await page.getByText("Signed-in asker",{ exact: true }).waitFor();
  if (language === "ro") await page.getByRole("button",{ name: "RO",exact: true }).first().click();
  await page.getByRole("button",{ name: "Attach a debate",exact: false }).click();
  await page.getByRole("region",{
    name: language === "ro" ? "Alege una dintre dezbaterile mele" : "Choose one of my debates"
  }).waitFor();
  await page.locator('.supportComposer input[name="support-message"]').fill(
    language === "ro" ? "Cum creez o dezbatere?" : "How do I create a debate?"
  );
  await page.locator('.supportComposer button[type="submit"]').click();
  await page.getByText(language === "ro" ? /Poți porni o dezbatere nouă/ : /You can start a new debate/).waitFor();
}

async function prepareCompact(language) {
  await clearSupportStateIfAvailable();
  await page.setViewportSize({ width: 390,height: 844 });
  await page.goto(baseUrl,{ waitUntil: "domcontentloaded" });
  await openCompactWidget();
  await page.getByRole("region",{ name: "Choose one of my debates" }).waitFor();
  if (language === "ro") {
    await page.getByRole("button",{ name: "RO",exact: true }).click();
    await page.getByRole("region",{ name: "Alege una dintre dezbaterile mele" }).waitFor();
  }
  await page.locator('.supportComposer input[name="support-message"]').fill(
    language === "ro" ? "Cum creez o dezbatere?" : "How do I create a debate?"
  );
  await page.locator('.supportComposer button[type="submit"]').click();
  await page.getByText(language === "ro" ? /Poți porni o dezbatere nouă/ : /You can start a new debate/).waitFor();
}

try {
  await prepareFull("en");
  const privacy = page.getByRole("link",{ name: /Privacy preferences/,exact: false });
  const cookie = page.getByRole("button",{ name: /Cookie preferences/,exact: false });
  const privacyHref = await privacy.getAttribute("href");
  await cookie.focus();
  await cookie.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  result.cookie_opener = {
    input: "keyboard-enter",
    focusedName: "Cookie preferences",
    dialogVisible: await dialog.isVisible(),
    dialogHeading: await dialog.getByText("Cookie preferences",{ exact: true }).first().textContent(),
    privacyShortcutHref: privacyHref
  };
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await capture("full","en",`${evidenceRoot}/UIFIX1-signed-in-full-en.png`);

  await prepareFull("ro");
  await capture("full","ro",`${evidenceRoot}/UIFIX1-signed-in-full-ro.png`);

  await prepareCompact("en");
  await capture("compact","en",`${evidenceRoot}/UIFIX1-signed-in-compact-en.png`);

  await prepareCompact("ro");
  await capture("compact","ro",`${evidenceRoot}/UIFIX1-signed-in-compact-ro.png`);
  const action = page.getByRole("link",{ name: "Pornește o dezbatere",exact: true });
  await action.focus();
  const focusedName = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);
  await Promise.all([page.waitForURL(`${baseUrl}/new`),action.press("Enter")]);
  result.action_activation = { input: "keyboard-enter",focusedName,destination: page.url() };

  await writeFile(`${evidenceRoot}/UIFIX1-browser-receipt.json`,JSON.stringify(result,null,2) + "\n");
  process.stdout.write(JSON.stringify(result,null,2) + "\n");
} catch (error) {
  const failure = { ...result,error: error instanceof Error
    ? { name: error.name,message: error.message } : { name: "UnknownError",message: String(error) } };
  await writeFile(`${evidenceRoot}/UIFIX1-browser-receipt.json`,JSON.stringify(failure,null,2) + "\n");
  throw error;
} finally {
  await context.close();
}
