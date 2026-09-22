import { mkdir,rm,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { classifyConsoleError,emptyConsoleErrorCounts } from "./console-classifier.mjs";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot = `${reportRoot}/evidence`;
const profileRoot = `${reportRoot}/probes/LIVE3/browser-profile`;
const receiptPath = `${evidenceRoot}/LIVE3-actual-relay-receipt.json`;
const executablePath = "/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const baseUrl = "https://localhost:3100";

await mkdir(evidenceRoot,{ recursive: true });
await rm(profileRoot,{ recursive: true,force: true });
await mkdir(profileRoot,{ recursive: true,mode: 0o700 });

const result = {
  schema_version: 1,
  revision: "43cf9386ea3c9e7c79523ec38debe63271d19292",
  base_url: baseUrl,
  browser: {
    driver: "playwright@1.61.1",
    executablePath,
    headless: true,
    tls_bypass: false,
    fresh_profile: true
  },
  support_api: "actual",
  relay: "actual unchanged support-preview relay",
  identity: "actual anonymous visitor",
  synthetic_support_overrides: false,
  credential_or_recovery_operations: 0,
  prompts: [],
  navigations: [],
  network: [],
  console_error_count: 0,
  console_error_categories: emptyConsoleErrorCounts(),
  screenshots: [],
  completed: false
};

async function checkpoint() {
  await writeFile(receiptPath,JSON.stringify(result,null,2) + "\n");
}

function operationFor(url,method) {
  const parsed = new URL(url);
  if (parsed.pathname === "/api/v1/support/status" && method === "GET") return "support_status";
  if (parsed.pathname === "/api/v1/support/sessions" && method === "POST") return "create_session";
  if (/^\/api\/v1\/support\/sessions\/[^/]+\/messages$/u.test(parsed.pathname)
    && method === "POST") return "send_message";
  return null;
}

function safeResponse(body,status) {
  const row = body !== null && typeof body === "object" && !Array.isArray(body) ? body : {};
  const sources = Array.isArray(row.sources) ? row.sources.flatMap((source) =>
    source !== null && typeof source === "object" && !Array.isArray(source)
      && typeof source.id === "string" && typeof source.label === "string"
      ? [{ id: source.id,label: source.label }] : []) : [];
  const actions = Array.isArray(row.actions) ? row.actions.flatMap((action) =>
    action !== null && typeof action === "object" && !Array.isArray(action)
      && typeof action.id === "string" && typeof action.label === "string"
      && typeof action.href === "string"
      ? [{ id: action.id,label: action.label,href: action.href }] : []) : [];
  return {
    status,
    outcome: typeof row.outcome === "string" ? row.outcome : null,
    text: typeof row.text === "string" ? row.text : null,
    sources,
    actions,
    error: typeof row.error === "string" ? row.error : null
  };
}

const context = await chromium.launchPersistentContext(profileRoot,{
  executablePath,headless: true,viewport: { width: 1440,height: 1000 }
});
const page = context.pages()[0] ?? await context.newPage();
page.on("console",message => {
  if (message.type() === "error") {
    result.console_error_count += 1;
    result.console_error_categories[classifyConsoleError(message.text())] += 1;
  }
});
page.on("response",response => {
  const operation = operationFor(response.url(),response.request().method());
  if (operation !== null) result.network.push({ operation,status: response.status() });
});

async function waitForHydration(targetLanguage = "en") {
  const ro = page.locator('.supportLanguage button').filter({ hasText: /^RO$/ }).first();
  const en = page.locator('.supportLanguage button').filter({ hasText: /^EN$/ }).first();
  for (let attempt = 0;attempt < 40;attempt += 1) {
    await ro.click();
    if (await ro.getAttribute("aria-pressed") === "true") break;
    await page.waitForTimeout(100);
  }
  if (await ro.getAttribute("aria-pressed") !== "true") {
    throw new Error("SUPPORT_ASSISTANT_DID_NOT_HYDRATE");
  }
  if (targetLanguage === "en") {
    await en.click();
    await page.waitForFunction(() =>
      document.querySelector('.supportLanguage button[aria-pressed="true"]')?.textContent?.trim() === "EN");
  }
}

async function settleCookieConsent() {
  const bar = page.getByRole("region",{ name: "Cookie consent" });
  if (await bar.isVisible()) {
    await bar.getByRole("button",{ name: "Essential only",exact: true }).click();
    await bar.waitFor({ state: "hidden" });
  }
}

async function setLanguage(language) {
  const label = language === "ro" ? "RO" : "EN";
  const button = page.locator('.supportLanguage button').filter({ hasText: new RegExp(`^${label}$`) }).first();
  await button.click();
  await page.waitForFunction((expected) =>
    document.querySelector('.supportLanguage button[aria-pressed="true"]')?.textContent?.trim() === expected,label);
}

async function readVisibleReply(article,language) {
  const sourceName = language === "ro" ? "Surse" : "Sources";
  const actionName = language === "ro" ? "Acțiuni" : "Actions";
  return {
    text: await article.locator("p").first().innerText(),
    sources: await article.locator(`[aria-label="${sourceName}"] [role="listitem"]`).allTextContents(),
    actions: await article.locator(`[aria-label="${actionName}"] a`).evaluateAll((links) =>
      links.map((link) => ({ label: link.textContent?.trim() ?? "",href: link.getAttribute("href") ?? "" })))
  };
}

async function sendPrompt({ mode,language,topic,input }) {
  const assistant = page.locator('.supportMessage[data-role="assistant"]');
  const before = await assistant.count();
  const composer = page.locator(`${mode === "full" ? ".supportDesk" : ".supportAssistantCompact"} .supportComposer`);
  const field = composer.locator('input[name="support-message"]');
  const button = composer.locator('button[type="submit"]');
  await field.fill(input);
  const responsePromise = page.waitForResponse((response) =>
    operationFor(response.url(),response.request().method()) === "send_message",{ timeout: 200_000 });
  await button.click();
  const response = await responsePromise;
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  await assistant.nth(before).waitFor({ state: "visible",timeout: 20_000 });
  await button.waitFor({ state: "visible" });
  await page.waitForFunction((selector) => {
    const candidate = document.querySelector(selector);
    return candidate instanceof HTMLButtonElement && !candidate.disabled;
  },`${mode === "full" ? ".supportDesk" : ".supportAssistantCompact"} .supportComposer button[type="submit"]`);
  const visible = await readVisibleReply(assistant.nth(before),language);
  const api = safeResponse(body,response.status());
  const observation = {
    sequence: result.prompts.length + 1,
    mode,language,topic,input,api,visible,
    api_dom_text_equal: api.text === visible.text,
    api_dom_source_labels_equal: JSON.stringify(api.sources.map(({ label }) => label)) === JSON.stringify(visible.sources),
    api_dom_actions_equal: JSON.stringify(api.actions.map(({ label,href }) => ({ label,href }))) === JSON.stringify(visible.actions),
    grounded_success: api.status === 200 && api.outcome === "ANSWER_GROUNDED"
      && api.text === visible.text && api.sources.length > 0
  };
  result.prompts.push(observation);
  await checkpoint();
  process.stdout.write(`PROMPT ${observation.sequence} ${mode}/${language}/${topic} status=${api.status} outcome=${api.outcome} sources=${api.sources.length} actions=${api.actions.length}\n`);
  return { observation,article: assistant.nth(before) };
}

async function activate(article,input) {
  const link = article.locator('nav a').first();
  if (await link.count() === 0) {
    result.navigations.push({ input,performed: false,reason: "NO_RENDERED_ACTION" });
    await checkpoint();
    return;
  }
  const label = (await link.innerText()).trim();
  const href = await link.getAttribute("href");
  if (input === "pointer") {
    await Promise.all([page.waitForURL((url) => url.origin === baseUrl && url.pathname !== "/help"),link.click()]);
  } else {
    await link.focus();
    const focusedLabel = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);
    await Promise.all([page.waitForURL((url) => url.origin === baseUrl && url.pathname !== "/"),link.press("Enter")]);
    result.navigations.push({ input,performed: true,label,href,focused_label: focusedLabel,destination: page.url() });
    await checkpoint();
    return;
  }
  result.navigations.push({ input,performed: true,label,href,destination: page.url() });
  await checkpoint();
}

async function openFull() {
  await page.goto(`${baseUrl}/help`,{ waitUntil: "domcontentloaded" });
  await page.locator('.supportDesk .supportComposer input[name="support-message"]').waitFor();
  await waitForHydration("en");
  await settleCookieConsent();
}

async function openCompact() {
  await page.setViewportSize({ width: 390,height: 844 });
  await page.goto(baseUrl,{ waitUntil: "domcontentloaded" });
  const toggle = page.locator("[data-support-widget-toggle]");
  await toggle.waitFor();
  for (let attempt = 0;attempt < 30;attempt += 1) {
    await toggle.click();
    if (await page.locator(".supportAssistantCompact").isVisible()) break;
    await page.waitForTimeout(100);
  }
  await page.locator('.supportAssistantCompact .supportComposer input[name="support-message"]').waitFor();
  await waitForHydration("en");
  await settleCookieConsent();
}

try {
  await openFull();
  const creationEn = await sendPrompt({
    mode: "full",language: "en",topic: "creation",input: "How do I create a debate?"
  });
  await activate(creationEn.article,"pointer");
  if (page.url() !== `${baseUrl}/help`) await openFull();
  await sendPrompt({
    mode: "full",language: "en",topic: "settings",input: "What can I change in Settings?"
  });
  await sendPrompt({
    mode: "full",language: "en",topic: "export",input: "How does JSON export work?"
  });
  const fullEnPath = `${evidenceRoot}/LIVE3-full-en.png`;
  await page.screenshot({ path: fullEnPath,fullPage: true });
  result.screenshots.push(fullEnPath);
  await checkpoint();

  await setLanguage("ro");
  await sendPrompt({
    mode: "full",language: "ro",topic: "creation",input: "Cum creez o dezbatere?"
  });
  await sendPrompt({
    mode: "full",language: "ro",topic: "settings",input: "Ce pot schimba în Setări?"
  });
  await sendPrompt({
    mode: "full",language: "ro",topic: "export",input: "Cum funcționează exportul JSON?"
  });
  const fullRoPath = `${evidenceRoot}/LIVE3-full-ro.png`;
  await page.screenshot({ path: fullRoPath,fullPage: true });
  result.screenshots.push(fullRoPath);
  await checkpoint();

  await page.evaluate(() => sessionStorage.clear());
  await openCompact();
  await setLanguage("ro");
  const compact = await sendPrompt({
    mode: "compact",language: "ro",topic: "creation-repeat",input: "Cum creez o dezbatere?"
  });
  const compactPath = `${evidenceRoot}/LIVE3-compact-ro.png`;
  await page.screenshot({ path: compactPath,fullPage: true });
  result.screenshots.push(compactPath);
  await checkpoint();
  await activate(compact.article,"keyboard-enter");

  result.completed = true;
  await checkpoint();
  process.stdout.write(JSON.stringify({
    completed: result.completed,
    prompts: result.prompts.length,
    grounded: result.prompts.filter(({ grounded_success }) => grounded_success).length,
    navigations: result.navigations,
    network: result.network,
    console_error_count: result.console_error_count,
    console_error_categories: result.console_error_categories
  },null,2) + "\n");
} catch (error) {
  result.failure = error instanceof Error
    ? { name: error.name,message: error.message }
    : { name: "UnknownError",message: String(error) };
  await checkpoint();
  throw error;
} finally {
  await context.close();
  await rm(profileRoot,{ recursive: true,force: true });
}
