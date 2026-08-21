# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> debate route covers connecting, generating, completed, error, no-tree, and single-shot
- Location: tests\s8-closure\acceptance-matrix.spec.ts:332:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Open synthesis and verdict' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: 'Open synthesis and verdict' })

```

```yaml
- banner:
  - link "Dialectical Engine — home":
    - /url: /
    - text: Dialectical Engine dezbatere.ro
  - text: Responsive evidence should remain readable across every supported viewport Complete
  - group "View":
    - button "Thread"
    - button "Split"
    - button "Tree" [pressed]
    - button "Map"
  - text: Scoring
  - button "Open scoring diagnostics": i
  - link "Library":
    - /url: /
  - button "Replay"
  - button "Workspace"
  - link "Export":
    - /url: http://127.0.0.1:8118/api/debates/s8-complete/export.md
  - button "How it works": "?"
  - link "Settings":
    - /url: /settings
    - text: ⚙
- group: Scoring insights Real scores displayed Showing 1 persisted scored claim from the scoring response. Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC Model-assisted reasoning aid, not a truth verdict. Open
- checkbox "Show set-aside paths" [checked]
- text: Show set-aside paths Root claim Public decisions improve when communities examine reasons together. 4 claims / depth 3 ↑ Pro Structured debate helps people compare ordinary reasons without losing context.
- button "⚐ Challenge"
- button "Read ▼"
- text: ↓ Con Careful dissent can expose hidden assumptions before a decision becomes costly.
- button "⚐ Challenge"
- button "Read ▼"
- text: ◆ Evidence Concrete evidence improves collective decisions when reasons remain visible.
- button "⚐ Challenge"
- button "Read ▼"
- text: ◆ Practical A second practical branch keeps comparison broad and tests responsive packing.
- button "⚐ Challenge"
- button "Read ▼"
- group "Canvas zoom controls":
  - button "Zoom in": +
  - button "Zoom out": −
  - button "Fit whole tree (overview)": Fit
  - button "Reset zoom to 1:1": 1:1
  - status: 100%
- complementary "Synthesis":
  - text: Synthesis The strongest case on each side, plus a verdict. ↑ Strongest Pro Visible reasons make tradeoffs easier to inspect. ↓ Strongest Con Structured formats can still omit important context. Verdict gpt-5 · Responsive fixture worker Use structured debate while preserving dissent and source context. Leans Even Agreements
  - list:
    - listitem: Reasons should stay visible.
  - text: Tensions
  - list:
    - listitem: Structure can simplify context.
  - text: Evidence Gaps
  - list:
    - listitem: Real-device gesture behavior remains a hardware gate.
  - text: Key Takeaways
  - list:
    - listitem: Preserve context while comparing claims.
- button "🔒 Unlock actions"
- alert
```

# Test source

```ts
  244 |   await expectNoHorizontalOverflow(page);
  245 | 
  246 |   await setLibraryState(page, "populated");
  247 |   await page.goto("/", { waitUntil: "domcontentloaded" });
  248 |   await expect(page.locator(".debateCard")).toHaveCount(1);
  249 |   await expect(page.locator(".debateCardClaim")).toContainText("Public decisions improve");
  250 |   await expectNoHorizontalOverflow(page, ".screenInner");
  251 | 
  252 |   await setLibraryState(page, "error");
  253 |   await page.goto("/", { waitUntil: "domcontentloaded" });
  254 |   await expect(page.locator(".error")).toContainText("intentionally unreachable");
  255 |   await expectNoHorizontalOverflow(page);
  256 | 
  257 |   await setLibraryState(page, "empty");
  258 |   await page.goto("/", { waitUntil: "domcontentloaded" });
  259 |   await page.waitForLoadState("networkidle");
  260 |   const composer = page.getByLabel("Debate claim");
  261 |   await composer.focus();
  262 |   await expect(composer).toBeFocused();
  263 |   await composer.fill("Ordinary reasons should stay visible during careful debate");
  264 |   const start = page.getByRole("button", { name: /^Start/ });
  265 |   await expect(start).toBeEnabled();
  266 |   await start.click();
  267 |   await expect(page).toHaveURL(/\/new\?topic=/);
  268 |   await expect(page.getByLabel("User token")).toBeVisible();
  269 |   await expectNoHorizontalOverflow(page);
  270 | });
  271 | 
  272 | test("protected routes cover AuthGate and route lifecycle states", async ({ page }) => {
  273 |   for (const route of protectedRoutes) {
  274 |     await expectProtectedShellAuthStates(page, route.path, route.heading);
  275 | 
  276 |     if (route.path === "/new") {
  277 |       await expect(page.getByLabel("Topic")).toBeVisible();
  278 |       await page.getByRole("button", { name: /Options/ }).click();
  279 |       await expect(page.locator(".optionsPanel")).toBeVisible();
  280 |       await page.getByLabel("Topic").fill("A valid responsive debate topic");
  281 |       await page.getByLabel("Role overrides JSON").fill("{invalid");
  282 |       await page.getByRole("button", { name: /Start debate/ }).click();
  283 |       await expect(page.locator(".error")).toBeVisible();
  284 | 
  285 |       await page.getByLabel("Role overrides JSON").fill("");
  286 |       await page.route("**/api/debates", async (request) => {
  287 |         if (request.request().method() !== "POST") {
  288 |           await request.continue();
  289 |           return;
  290 |         }
  291 |         await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  292 |         await fulfillJson(request, { id: "s8-complete" }, 201);
  293 |       });
  294 |       await page.getByRole("button", { name: /Start debate/ }).click();
  295 |       await expect(page.getByRole("button", { name: /Starting/ })).toBeDisabled();
  296 |       await page.waitForURL(/\/debate\/s8-complete/);
  297 |       await page.unroute("**/api/debates");
  298 |     } else if (route.path === "/settings") {
  299 |       await expect(page.locator(".modelRow")).toHaveCount(2);
  300 |       const cap = page.getByLabel("gpt-5 monthly cap USD");
  301 |       await cap.fill("42");
  302 |       await expect(cap).toHaveValue("42");
  303 |       const toggle = page.getByRole("switch", { name: "Toggle gpt-5" });
  304 |       const before = await toggle.getAttribute("aria-checked");
  305 |       await toggle.click();
  306 |       expect(await toggle.getAttribute("aria-checked")).not.toBe(before);
  307 |       await page.getByRole("button", { name: "Edit routing JSON" }).click();
  308 |       await page.getByLabel("Role routing JSON").fill("{invalid");
  309 |       await page.getByRole("button", { name: "Save changes" }).click();
  310 |       await expect(page.locator(".error")).toBeVisible();
  311 |     } else {
  312 |       await expect(page.locator(".workerMetrics .miniCard")).toHaveCount(5);
  313 |       await expect(page.locator(".debateCard")).toHaveCount(1);
  314 | 
  315 |       await page.route("**/api/backends/status", (request) => fulfillJson(request, { workers: [] }));
  316 |       await page.reload({ waitUntil: "domcontentloaded" });
  317 |       await expect(page.locator(".emptyState")).toContainText("No workers registered");
  318 |       await page.unroute("**/api/backends/status");
  319 | 
  320 |       await page.route("**/api/backends/status", (request) =>
  321 |         fulfillJson(request, { detail: "worker fixture error" }, 503)
  322 |       );
  323 |       await page.reload({ waitUntil: "domcontentloaded" });
  324 |       await expect(page.locator(".error")).toBeVisible();
  325 |       await page.unroute("**/api/backends/status");
  326 |     }
  327 | 
  328 |     await expectNoHorizontalOverflow(page);
  329 |   }
  330 | });
  331 | 
  332 | test("debate route covers connecting, generating, completed, error, no-tree, and single-shot", async ({
  333 |   page
  334 | }) => {
  335 |   await page.goto("/debate/s8-delayed", { waitUntil: "domcontentloaded" });
  336 |   await expect(page.locator(".screenInner")).toContainText(/Connecting|Loading/);
  337 |   await expect(page.locator(".debateTopBar")).toBeVisible();
  338 | 
  339 |   await page.goto("/debate/s8-generating", { waitUntil: "domcontentloaded" });
  340 |   await expect(page.locator(".pill")).toContainText("Generating");
  341 |   expect(await page.locator(".node").count()).toBeGreaterThanOrEqual(4);
  342 | 
  343 |   await openCompleteDebate(page);
> 344 |   await expect(page.getByRole("button", { name: "Open synthesis and verdict" })).toBeVisible();
      |                                                                                  ^ Error: expect(locator).toBeVisible() failed
  345 | 
  346 |   await page.goto("/debate/s8-banner-error", { waitUntil: "domcontentloaded" });
  347 |   await expect(page.locator(".debateError .error")).toContainText("Claim generation failed");
  348 | 
  349 |   await page.goto("/debate/s8-no-tree", { waitUntil: "domcontentloaded" });
  350 |   await expect(page.locator(".canvasEmpty")).toContainText("No argument tree was produced");
  351 | 
  352 |   await page.goto("/debate/s8-single-shot", { waitUntil: "domcontentloaded" });
  353 |   await expect(page.locator(".debateMain")).toContainText(
  354 |     "Use single-shot mode only when rapid orientation matters"
  355 |   );
  356 |   await expectNoHorizontalOverflow(page);
  357 | });
  358 | 
  359 | test("debate views cover Thread, Split, Tree, Map, scoring states, and all zoom bands", async ({ page }) => {
  360 |   await openCompleteDebate(page);
  361 | 
  362 |   const views = [
  363 |     { name: "Thread", selector: ".thread" },
  364 |     { name: "Split", selector: ".split" },
  365 |     { name: "Tree", selector: ".canvas" },
  366 |     { name: "Map", selector: ".map" }
  367 |   ] as const;
  368 |   for (const view of views) {
  369 |     const button = page.getByRole("button", { name: view.name, exact: true });
  370 |     await expectFullyInsideViewport(button, page);
  371 |     await button.click();
  372 |     await expect(button).toHaveAttribute("aria-pressed", "true");
  373 |     await expect(page.locator(view.selector)).toBeVisible({ timeout: 3_000 });
  374 |     await expectNoHorizontalOverflow(page);
  375 |   }
  376 | 
  377 |   const scoring = page.locator("details.scoringInsightsPanel");
  378 |   await expect(scoring).toBeVisible();
  379 |   await scoring.locator("summary").click();
  380 |   await expect(scoring).toHaveAttribute("open", "");
  381 |   await scoring.locator("summary").click();
  382 |   await expect(scoring).not.toHaveAttribute("open", "");
  383 | 
  384 |   await page.getByRole("button", { name: "Tree", exact: true }).click();
  385 |   const canvas = page.locator(".canvas");
  386 |   await expect(canvas).toHaveAttribute("data-fit-policy", "column-auto");
  387 |   const columnFit = Number(await canvas.getAttribute("data-zoom"));
  388 |   expect(columnFit).toBeGreaterThanOrEqual(0.5);
  389 |   expect(columnFit).toBeLessThanOrEqual(1);
  390 | 
  391 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  392 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
  393 | 
  394 |   await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  395 |   await expect(canvas).toHaveAttribute("data-fit-policy", "overview-auto");
  396 |   const overviewFit = Number(await canvas.getAttribute("data-zoom"));
  397 |   expect(overviewFit).toBeGreaterThanOrEqual(0.1);
  398 |   expect(overviewFit).toBeLessThanOrEqual(1);
  399 | 
  400 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  401 |   for (let index = 0; index < 12; index += 1) {
  402 |     await page.getByRole("button", { name: "Zoom out" }).click();
  403 |   }
  404 |   await expect(canvas).toHaveAttribute("data-zoom", "0.1000");
  405 |   await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");
  406 | 
  407 |   for (let index = 0; index < 24; index += 1) {
  408 |     await page.getByRole("button", { name: "Zoom in" }).click();
  409 |   }
  410 |   await expect(canvas).toHaveAttribute("data-zoom", "2.0000");
  411 | 
  412 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  413 |   for (let index = 0; index < 6; index += 1) {
  414 |     await page.getByRole("button", { name: "Zoom out" }).click();
  415 |   }
  416 |   await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");
  417 |   const card = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  418 |   await card.click();
  419 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
  420 |   await expect(page.getByRole("dialog")).toHaveCount(0);
  421 | });
  422 | 
  423 | test("overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock", async ({
  424 |   page
  425 | }, testInfo) => {
  426 |   await openCompleteDebate(page);
  427 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  428 | 
  429 |   const collapsed = await visibleRects(page);
  430 |   expect(collapsed.dock).not.toBeNull();
  431 |   expect(collapsed.zoom).not.toBeNull();
  432 |   expect(collapsed.synthesis).not.toBeNull();
  433 |   expect.soft(intersects(collapsed.dock!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  434 |   expect.soft(intersects(collapsed.synthesis!, collapsed.dock!), JSON.stringify(collapsed)).toBe(false);
  435 |   expect.soft(intersects(collapsed.synthesis!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  436 | 
  437 |   await mkdir(screenshotDir, { recursive: true });
  438 |   await page.screenshot({
  439 |     path: resolve(screenshotDir, `${testInfo.project.name.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}.png`),
  440 |     fullPage: false,
  441 |     animations: "disabled"
  442 |   });
  443 | 
  444 |   const node = page.locator('.nodeWrap[data-node-id="node-1"] .node');
```