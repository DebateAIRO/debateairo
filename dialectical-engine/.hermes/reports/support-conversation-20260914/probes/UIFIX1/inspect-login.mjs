import { mkdir,rm,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";

const evidenceRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
const profileRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/UIFIX1/login-profile";
const executablePath = "/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
await mkdir(evidenceRoot,{ recursive: true });
await rm(profileRoot,{ recursive: true,force: true });

const context = await chromium.launchPersistentContext(profileRoot,{
  executablePath,headless: true,viewport: { width: 1280,height: 900 }
});
const page = context.pages()[0] ?? await context.newPage();
const result = {
  schema_version: 1,
  url: "https://localhost:3100/login?next=%2Fnew",
  browser: { driver: "playwright@1.61.1",executablePath,headless: true,tls_bypass: false },
  matching_controls: [],
  exact_destination: null
};
try {
  await page.goto(result.url,{ waitUntil: "domcontentloaded" });
  await page.locator("form").waitFor();
  result.matching_controls = await page.locator("a,button").evaluateAll(nodes => nodes.flatMap(node => {
    const label = node.textContent?.trim() ?? "";
    if (!/(?:forgot|reset|recover|password)/iu.test(label)) return [];
    return [{
      element: node.tagName.toLowerCase(),
      label,
      href: node instanceof HTMLAnchorElement ? node.getAttribute("href") : null,
      type: node instanceof HTMLButtonElement ? node.type : null
    }];
  }));
  const exact = result.matching_controls.filter(control => /(?:forgot|reset|recover)/iu.test(control.label));
  result.exact_destination = exact.length === 1 ? exact[0] : null;
  await page.screenshot({ path: `${evidenceRoot}/UIFIX1-login-destination.png`,fullPage: true });
  await writeFile(`${evidenceRoot}/UIFIX1-login-destination.json`,JSON.stringify(result,null,2) + "\n");
  process.stdout.write(JSON.stringify(result,null,2) + "\n");
} finally {
  await context.close();
}
