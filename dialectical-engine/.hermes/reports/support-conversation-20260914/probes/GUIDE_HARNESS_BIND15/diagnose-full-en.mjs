import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { classifyGuideBlockedSupportOperation } from "../GUIDE_HARNESS_BIND14/controls.mjs";

const OUTPUT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_HARNESS_BIND15-interaction-diagnostic.json";
const EXECUTABLE = "/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const BASE_URL = "https://localhost:3100";
const result = {
  schemaVersion: 1,
  node: "GUIDE_HARNESS_BIND15_DIAGNOSTIC",
  revision: "152eed4da1cd3e66b74d8301159ba76427552409",
  completed: false,
  verdict: "RUNNING",
  browser: { headless: true, freshProfile: true, tlsBypass: false },
  traffic: {
    actualSupportRequestsForwarded: 0,
    guardedAttempts: { status: 0, pageCaseListRead: 0, createSession: 0, sendMessage: 0, otherSupport: 0 },
  },
  originalChain: [],
  firstFailure: null,
  discriminator: null,
};

await mkdir(new URL("../../evidence/", import.meta.url), { recursive: true });
let checkpointCreated = false;
async function checkpoint() {
  await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, { flag: checkpointCreated ? "w" : "wx", mode: 0o600 });
  checkpointCreated = true;
}

const profile = await mkdtemp(resolve(tmpdir(), "guide-bind15-diagnostic-"));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: EXECUTABLE,
  headless: true,
  viewport: { width: 1440, height: 1000 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.route("**/*", async (route) => {
  const operation = classifyGuideBlockedSupportOperation(route.request().url(), route.request().method());
  if (operation === null) await route.continue();
  else {
    result.traffic.guardedAttempts[operation] += 1;
    await route.abort("blockedbyclient");
  }
});

const toggle = page.locator(".supportDesk [data-mode-toggle]");
const cookie = page.getByRole("region", { name: "Cookie consent" });
async function modeState() {
  return await toggle.getAttribute("aria-pressed") === "true" ? "CHAMBER" : "TERRACOTTA";
}
async function transitionState() {
  return await page.evaluate(() => document.documentElement.dataset.themeTransition === "active"
    || document.documentElement.classList.contains("theme-transition-fallback") ? "ACTIVE" : "IDLE");
}
async function hitTarget() {
  const box = await toggle.boundingBox();
  if (box === null) return false;
  return await page.evaluate(({ x, y }) => {
    const target = document.querySelector(".supportDesk [data-mode-toggle]");
    const hit = document.elementFromPoint(x, y);
    return target !== null && hit !== null && (target === hit || target.contains(hit));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}
async function handlerReady() {
  const element = await toggle.elementHandle();
  if (element === null) return false;
  return await page.evaluate((node) => Object.getOwnPropertyNames(node).some((name) =>
    name.startsWith("__reactProps$") && typeof node[name]?.onClick === "function"), element);
}
async function observe(step) {
  return {
    step,
    modeState: await modeState(),
    transitionState: await transitionState(),
    cookieVisible: await cookie.isVisible(),
    toggleVisible: await toggle.isVisible(),
    toggleEnabled: await toggle.isEnabled(),
    toggleHitTarget: await hitTarget(),
    privateHandlerReady: await handlerReady(),
  };
}
function fixedFailure(step, code) {
  result.firstFailure = { step, code };
}

try {
  await page.goto(`${BASE_URL}/help`, { waitUntil: "domcontentloaded" });
  await page.locator('.supportDesk .supportComposer input[name="support-message"]').waitFor({ state: "visible", timeout: 30_000 });
  await toggle.waitFor({ state: "visible", timeout: 30_000 });
  result.originalChain.push(await observe("PRECONDITION"));
  const before = await modeState();
  const probe = before === "CHAMBER" ? "TERRACOTTA" : "CHAMBER";
  try {
    await toggle.click({ timeout: 30_000 });
    result.originalChain.push(await observe("FIRST_ACTIVATION_DISPATCHED"));
  } catch {
    fixedFailure("FIRST_MODE_ACTIVATION", "GUIDE_HARNESS_FULL_MODE_ACTIVATION_FAILED");
  }
  if (result.firstFailure === null) {
    try {
      await page.waitForFunction((expected) =>
        document.querySelector('.supportDesk [data-mode-toggle]')?.getAttribute("aria-pressed") === String(expected),
      probe === "CHAMBER", { timeout: 30_000 });
      result.originalChain.push(await observe("FIRST_EXPECTED_STATE"));
    } catch {
      fixedFailure("FIRST_MODE_EXPECTED_STATE", "GUIDE_HARNESS_FULL_MODE_EXPECTED_STATE_TIMEOUT");
    }
  }
  if (result.firstFailure === null) {
    try {
      await toggle.click({ timeout: 30_000 });
      result.originalChain.push(await observe("RESTORE_ACTIVATION_DISPATCHED"));
    } catch {
      fixedFailure("RESTORE_MODE_ACTIVATION", "GUIDE_HARNESS_FULL_MODE_RESTORE_ACTIVATION_FAILED");
    }
  }
  if (result.firstFailure === null) {
    try {
      await page.waitForFunction((expected) =>
        document.querySelector('.supportDesk [data-mode-toggle]')?.getAttribute("aria-pressed") === String(expected),
      before === "CHAMBER", { timeout: 30_000 });
      result.originalChain.push(await observe("RESTORE_EXPECTED_STATE"));
    } catch {
      fixedFailure("RESTORE_MODE_EXPECTED_STATE", "GUIDE_HARNESS_FULL_MODE_RESTORE_STATE_TIMEOUT");
    }
  }
  if (result.firstFailure === null) {
    const final = await observe("FINAL_VERIFICATION");
    result.originalChain.push(final);
    if (final.modeState !== before) fixedFailure("FINAL_VERIFICATION", "GUIDE_HARNESS_FULL_FINAL_VERIFICATION_FAILED");
  }

  const beforeDiscriminator = await observe("DISCRIMINATOR_BEFORE");
  if (result.firstFailure?.step === "FIRST_MODE_ACTIVATION" && beforeDiscriminator.cookieVisible
    && !beforeDiscriminator.toggleHitTarget) {
    try {
      await cookie.getByRole("button", { name: "Essential only", exact: true }).click({ timeout: 30_000 });
      await cookie.waitFor({ state: "hidden", timeout: 30_000 });
      const after = await observe("DISCRIMINATOR_AFTER_COOKIE_DISMISSAL");
      result.discriminator = {
        hypothesis: "COOKIE_REGION_BLOCKS_MODE_TOGGLE_ACTIONABILITY",
        action: "ESSENTIAL_ONLY",
        before: beforeDiscriminator,
        after,
        supported: !after.cookieVisible && after.toggleHitTarget && after.modeState === before,
      };
    } catch {
      result.discriminator = {
        hypothesis: "COOKIE_REGION_BLOCKS_MODE_TOGGLE_ACTIONABILITY",
        action: "ESSENTIAL_ONLY",
        before: beforeDiscriminator,
        after: null,
        supported: false,
      };
    }
  } else {
    result.discriminator = {
      hypothesis: "COOKIE_REGION_BLOCKS_MODE_TOGGLE_ACTIONABILITY",
      action: "NOT_APPLICABLE",
      before: beforeDiscriminator,
      after: null,
      supported: false,
    };
  }
  result.completed = true;
  result.verdict = result.firstFailure !== null && result.discriminator.supported
    ? "CAUSE_ESTABLISHED_COOKIE_OBSTRUCTION" : "DIAGNOSIS_INCONCLUSIVE";
  await checkpoint();
  if (result.verdict !== "CAUSE_ESTABLISHED_COOKIE_OBSTRUCTION") process.exitCode = 1;
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
