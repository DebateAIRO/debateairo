import { mkdir,rm,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";

const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const profileRoot = `${reportRoot}/probes/FIX2/browser-profile`;
const receiptPath = `${reportRoot}/evidence/FIX2-actual-diagnostic.json`;
const executablePath = "/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const baseUrl = "https://localhost:3100";

await rm(profileRoot,{ recursive: true,force: true });
await mkdir(profileRoot,{ recursive: true,mode: 0o700 });
const receipt = {
  schema_version: 1,
  topic: "en_creation",
  support_api: "actual",
  relay: "actual_unchanged",
  synthetic_overrides: false,
  credential_or_recovery_operations: 0,
  status: null,
  outcome: null,
  source_count: null,
  action_count: null,
  completed: false,
};

const context = await chromium.launchPersistentContext(profileRoot,{
  executablePath,headless: true,viewport: { width: 1200,height: 900 },
});
try {
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(`${baseUrl}/help`,{ waitUntil: "domcontentloaded" });
  const composer = page.locator(".supportDesk .supportComposer");
  const field = composer.locator('input[name="support-message"]');
  const button = composer.locator('button[type="submit"]');
  await field.waitFor();
  const ro = page.locator('.supportLanguage button').filter({ hasText: /^RO$/ }).first();
  const en = page.locator('.supportLanguage button').filter({ hasText: /^EN$/ }).first();
  await ro.click();
  await en.click();
  const consent = page.getByRole("region",{ name: "Cookie consent" });
  if (await consent.isVisible()) {
    await consent.getByRole("button",{ name: "Essential only",exact: true }).click();
  }
  await field.fill("How do I create a debate?");
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST"
      && /^\/api\/v1\/support\/sessions\/[^/]+\/messages$/u.test(url.pathname);
  },{ timeout: 200_000 });
  await button.click();
  const response = await responsePromise;
  const decoded = await response.json().catch(() => ({}));
  const row = decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)
    ? decoded : {};
  receipt.status = response.status();
  receipt.outcome = typeof row.outcome === "string" ? row.outcome : "INVALID";
  receipt.source_count = Array.isArray(row.sources) ? row.sources.length : 0;
  receipt.action_count = Array.isArray(row.actions) ? row.actions.length : 0;
  receipt.completed = true;
  await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ mode: 0o600 });
  process.stdout.write(`status=${receipt.status} outcome=${receipt.outcome} sources=${receipt.source_count} actions=${receipt.action_count}\n`);
} finally {
  await context.close();
  await rm(profileRoot,{ recursive: true,force: true });
}
