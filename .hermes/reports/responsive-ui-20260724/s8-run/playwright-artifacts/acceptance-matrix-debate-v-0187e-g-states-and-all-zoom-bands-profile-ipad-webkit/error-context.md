# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> debate views cover Thread, Split, Tree, Map, scoring states, and all zoom bands
- Location: tests\s8-closure\acceptance-matrix.spec.ts:356:5

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('.canvasInner')
Expected: "overview"
Received: "normal"
Timeout:  10000ms

Call log:
  - Expect "toHaveAttribute" with timeout 10000ms
  - waiting for locator('.canvasInner')
    22 × locator resolved to <div class="canvasInner" data-zoom-band="normal">…</div>
       - unexpected value "normal"

```

```yaml
- text: Root claim Public decisions improve when communities examine reasons together. 4 claims / depth 3 ↑ Pro Structured debate helps people compare ordinary reasons without losing context.
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
```

# Test source

```ts
  293 |       await page.waitForURL(/\/debate\/s8-complete/);
  294 |       await page.unroute("**/api/debates");
  295 |     } else if (route.path === "/settings") {
  296 |       await expect(page.locator(".modelRow")).toHaveCount(2);
  297 |       const cap = page.getByLabel("gpt-5 monthly cap USD");
  298 |       await cap.fill("42");
  299 |       await expect(cap).toHaveValue("42");
  300 |       const toggle = page.getByRole("switch", { name: "Toggle gpt-5" });
  301 |       const before = await toggle.getAttribute("aria-checked");
  302 |       await toggle.click();
  303 |       expect(await toggle.getAttribute("aria-checked")).not.toBe(before);
  304 |       await page.getByRole("button", { name: "Edit routing JSON" }).click();
  305 |       await page.getByLabel("Role routing JSON").fill("{invalid");
  306 |       await page.getByRole("button", { name: "Save changes" }).click();
  307 |       await expect(page.locator(".error")).toBeVisible();
  308 |     } else {
  309 |       await expect(page.locator(".workerMetrics .miniCard")).toHaveCount(5);
  310 |       await expect(page.locator(".debateCard")).toHaveCount(1);
  311 | 
  312 |       await page.route("**/api/backends/status", (request) => fulfillJson(request, { workers: [] }));
  313 |       await page.reload({ waitUntil: "domcontentloaded" });
  314 |       await expect(page.locator(".emptyState")).toContainText("No workers registered");
  315 |       await page.unroute("**/api/backends/status");
  316 | 
  317 |       await page.route("**/api/backends/status", (request) =>
  318 |         fulfillJson(request, { detail: "worker fixture error" }, 503)
  319 |       );
  320 |       await page.reload({ waitUntil: "domcontentloaded" });
  321 |       await expect(page.locator(".error")).toBeVisible();
  322 |       await page.unroute("**/api/backends/status");
  323 |     }
  324 | 
  325 |     await expectNoHorizontalOverflow(page);
  326 |   }
  327 | });
  328 | 
  329 | test("debate route covers connecting, generating, completed, error, no-tree, and single-shot", async ({
  330 |   page
  331 | }) => {
  332 |   await page.goto("/debate/s8-delayed", { waitUntil: "domcontentloaded" });
  333 |   await expect(page.locator(".screenInner")).toContainText(/Connecting|Loading/);
  334 |   await expect(page.locator(".debateTopTitle")).toBeVisible();
  335 | 
  336 |   await page.goto("/debate/s8-generating", { waitUntil: "domcontentloaded" });
  337 |   await expect(page.locator(".progressStrip")).toBeVisible();
  338 |   expect(await page.locator(".node").count()).toBeGreaterThanOrEqual(4);
  339 | 
  340 |   await openCompleteDebate(page);
  341 |   await expect(page.getByRole("button", { name: "Open synthesis and verdict" })).toBeVisible();
  342 | 
  343 |   await page.goto("/debate/s8-banner-error", { waitUntil: "domcontentloaded" });
  344 |   await expect(page.locator(".debateError .error")).toContainText("Claim generation failed");
  345 | 
  346 |   await page.goto("/debate/s8-no-tree", { waitUntil: "domcontentloaded" });
  347 |   await expect(page.locator(".canvasEmpty")).toContainText("No argument tree was produced");
  348 | 
  349 |   await page.goto("/debate/s8-single-shot", { waitUntil: "domcontentloaded" });
  350 |   await expect(page.locator(".debateMain")).toContainText(
  351 |     "Use single-shot mode only when rapid orientation matters"
  352 |   );
  353 |   await expectNoHorizontalOverflow(page);
  354 | });
  355 | 
  356 | test("debate views cover Thread, Split, Tree, Map, scoring states, and all zoom bands", async ({ page }) => {
  357 |   await openCompleteDebate(page);
  358 | 
  359 |   const views = [
  360 |     { name: "Thread", selector: ".thread" },
  361 |     { name: "Split", selector: ".split" },
  362 |     { name: "Tree", selector: ".canvas" },
  363 |     { name: "Map", selector: ".map" }
  364 |   ] as const;
  365 |   for (const view of views) {
  366 |     const button = page.getByRole("button", { name: view.name, exact: true });
  367 |     await expectFullyInsideViewport(button, page);
  368 |     await button.click();
  369 |     await expect(button).toHaveAttribute("aria-pressed", "true");
  370 |     await expect(page.locator(view.selector)).toBeVisible();
  371 |     await expectNoHorizontalOverflow(page);
  372 |   }
  373 | 
  374 |   const scoring = page.locator("details.scoringInsightsPanel");
  375 |   await expect(scoring).toBeVisible();
  376 |   await scoring.locator("summary").click();
  377 |   await expect(scoring).toHaveAttribute("open", "");
  378 |   await scoring.locator("summary").click();
  379 |   await expect(scoring).not.toHaveAttribute("open", "");
  380 | 
  381 |   await page.getByRole("button", { name: "Tree", exact: true }).click();
  382 |   const canvas = page.locator(".canvas");
  383 |   await expect(canvas).toHaveAttribute("data-fit-policy", "column-auto");
  384 |   const columnFit = Number(await canvas.getAttribute("data-zoom"));
  385 |   expect(columnFit).toBeGreaterThanOrEqual(0.5);
  386 |   expect(columnFit).toBeLessThanOrEqual(1);
  387 | 
  388 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  389 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
  390 | 
  391 |   await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  392 |   await expect(canvas).toHaveAttribute("data-fit-policy", "overview-auto");
> 393 |   await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");
      |                                              ^ Error: expect(locator).toHaveAttribute(expected) failed
  394 | 
  395 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  396 |   for (let index = 0; index < 24; index += 1) {
  397 |     await page.getByRole("button", { name: "Zoom out" }).click();
  398 |   }
  399 |   await expect(canvas).toHaveAttribute("data-zoom", "0.1000");
  400 | 
  401 |   for (let index = 0; index < 24; index += 1) {
  402 |     await page.getByRole("button", { name: "Zoom in" }).click();
  403 |   }
  404 |   await expect(canvas).toHaveAttribute("data-zoom", "2.0000");
  405 | 
  406 |   await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  407 |   const card = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  408 |   await card.click();
  409 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
  410 |   await expect(page.getByRole("dialog")).toHaveCount(0);
  411 | });
  412 | 
  413 | test("overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock", async ({
  414 |   page
  415 | }, testInfo) => {
  416 |   await openCompleteDebate(page);
  417 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  418 | 
  419 |   const collapsed = await visibleRects(page);
  420 |   expect(collapsed.dock).not.toBeNull();
  421 |   expect(collapsed.zoom).not.toBeNull();
  422 |   expect(collapsed.synthesis).not.toBeNull();
  423 |   expect.soft(intersects(collapsed.dock!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  424 |   expect.soft(intersects(collapsed.synthesis!, collapsed.dock!), JSON.stringify(collapsed)).toBe(false);
  425 |   expect.soft(intersects(collapsed.synthesis!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  426 | 
  427 |   const node = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  428 |   await node.click();
  429 |   const argumentDetail = page.getByRole("dialog", { name: "Argument detail" });
  430 |   await expect(argumentDetail).toBeVisible();
  431 |   await argumentDetail.getByRole("button", { name: /Challenge/ }).click();
  432 |   await expect(page.locator(".popCard")).toBeVisible();
  433 |   await page.locator(".popAction").first().click();
  434 |   await closeDialog(page, "Investigation");
  435 | 
  436 |   await openVisibleOverflowAction(page, "button", "Workspace");
  437 |   await closeDialog(page, "Workspace artifacts");
  438 | 
  439 |   await page.getByRole("button", { name: "Open scoring diagnostics" }).click();
  440 |   await closeDialog(page, "Scoring diagnostics");
  441 | 
  442 |   await openVisibleOverflowAction(page, "button", "How it works");
  443 |   await expect(page.getByRole("dialog")).toBeVisible();
  444 |   await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  445 | 
  446 |   await page.getByRole("button", { name: "Open synthesis and verdict" }).click();
  447 |   const synthesisPanel = page.locator('.synthPanel[data-sheet-state="expanded"]');
  448 |   await expect(synthesisPanel).toBeVisible();
  449 |   const synthesisBox = await synthesisPanel.boundingBox();
  450 |   const viewport = page.viewportSize();
  451 |   expect(synthesisBox).not.toBeNull();
  452 |   expect(viewport).not.toBeNull();
  453 |   expect(synthesisBox!.x).toBeGreaterThanOrEqual(-1);
  454 |   expect(synthesisBox!.x + synthesisBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
  455 |   if (viewport!.width <= 768) {
  456 |     expect(synthesisBox!.height).toBeLessThanOrEqual(viewport!.height * 0.7 + 2);
  457 |   }
  458 |   await synthesisPanel.getByRole("button", { name: "Close synthesis and verdict" }).click();
  459 | 
  460 |   const exportAction = page.locator('a[aria-label="Export"]:visible').first();
  461 |   if (!(await exportAction.count())) {
  462 |     await page.getByRole("button", { name: "More debate actions" }).click();
  463 |   }
  464 |   await page.locator('a[aria-label="Export"]:visible').first().evaluate((element) => {
  465 |     element.addEventListener("click", (event) => event.preventDefault(), { once: true });
  466 |     (element as HTMLElement).click();
  467 |   });
  468 |   await expect(page.locator(".toast")).toContainText("Exported debate.md");
  469 | 
  470 |   await page.getByRole("button", { name: /Unlock actions/ }).click();
  471 |   await expect(page.getByLabel("User token")).toBeVisible();
  472 |   await expect(page.locator("[data-synth-tab]")).toBeHidden();
  473 | 
  474 |   const expanded = await visibleRects(page);
  475 |   expect(expanded.dock).not.toBeNull();
  476 |   expect(expanded.zoom).not.toBeNull();
  477 |   expect(expanded.toast).not.toBeNull();
  478 |   expect.soft(expanded.synthesis, JSON.stringify(expanded)).toBeNull();
  479 |   expect.soft(intersects(expanded.dock!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  480 |   expect.soft(intersects(expanded.toast!, expanded.dock!), JSON.stringify(expanded)).toBe(false);
  481 |   expect.soft(intersects(expanded.toast!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  482 | 
  483 |   await mkdir(screenshotDir, { recursive: true });
  484 |   await page.screenshot({
  485 |     path: resolve(screenshotDir, `${testInfo.project.name.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}.png`),
  486 |     fullPage: false,
  487 |     animations: "disabled"
  488 |   });
  489 | });
  490 | 
  491 | test("safe-area support is structurally wired without claiming non-zero emulated insets", async ({ page }) => {
  492 |   const webRoot = resolve(__dirname, "../..");
  493 |   const layout = readFileSync(resolve(webRoot, "app/layout.tsx"), "utf8");
```