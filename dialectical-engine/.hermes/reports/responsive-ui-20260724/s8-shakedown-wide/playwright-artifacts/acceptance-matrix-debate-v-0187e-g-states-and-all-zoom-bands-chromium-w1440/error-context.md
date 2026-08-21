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

Locator:  locator('.canvas')
Expected: "1.0000"
Received: "0.6667"
Timeout:  10000ms

Call log:
  - Expect "toHaveAttribute" with timeout 10000ms
  - waiting for locator('.canvas')
    23 × locator resolved to <div data-zoom="0.6667" class="canvas scroll" data-gesture-owner="none" data-viewport-ready="true" data-fit-policy="overview-auto">…</div>
       - unexpected value "0.6667"

```

```yaml
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
```

# Test source

```ts
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
  334 |   await expect(page.locator(".debateTopBar")).toBeVisible();
  335 | 
  336 |   await page.goto("/debate/s8-generating", { waitUntil: "domcontentloaded" });
  337 |   await expect(page.getByLabel("Scoring visibility state")).toBeVisible();
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
  393 |   const overviewFit = Number(await canvas.getAttribute("data-zoom"));
  394 |   expect(overviewFit).toBeGreaterThanOrEqual(0.1);
  395 |   expect(overviewFit).toBeLessThanOrEqual(1);
  396 | 
  397 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  398 |   for (let index = 0; index < 12; index += 1) {
  399 |     await page.getByRole("button", { name: "Zoom out" }).click();
  400 |   }
  401 |   await expect(canvas).toHaveAttribute("data-zoom", "0.1000");
  402 |   await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");
  403 | 
  404 |   for (let index = 0; index < 24; index += 1) {
  405 |     await page.getByRole("button", { name: "Zoom in" }).click();
  406 |   }
  407 |   await expect(canvas).toHaveAttribute("data-zoom", "2.0000");
  408 | 
  409 |   await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  410 |   const card = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  411 |   await card.click();
> 412 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
      |                        ^ Error: expect(locator).toHaveAttribute(expected) failed
  413 |   await expect(page.getByRole("dialog")).toHaveCount(0);
  414 | });
  415 | 
  416 | test("overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock", async ({
  417 |   page
  418 | }, testInfo) => {
  419 |   await openCompleteDebate(page);
  420 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  421 | 
  422 |   const collapsed = await visibleRects(page);
  423 |   expect(collapsed.dock).not.toBeNull();
  424 |   expect(collapsed.zoom).not.toBeNull();
  425 |   expect(collapsed.synthesis).not.toBeNull();
  426 |   expect.soft(intersects(collapsed.dock!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  427 |   expect.soft(intersects(collapsed.synthesis!, collapsed.dock!), JSON.stringify(collapsed)).toBe(false);
  428 |   expect.soft(intersects(collapsed.synthesis!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  429 | 
  430 |   const node = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  431 |   await node.click();
  432 |   const argumentDetail = page.getByRole("dialog", { name: "Argument detail" });
  433 |   await expect(argumentDetail).toBeVisible();
  434 |   await argumentDetail.getByRole("button", { name: /Challenge/ }).click();
  435 |   await expect(page.locator(".popCard")).toBeVisible();
  436 |   await page.locator(".popAction").first().click();
  437 |   await closeDialog(page, "Investigation");
  438 | 
  439 |   await openVisibleOverflowAction(page, "button", "Workspace");
  440 |   await closeDialog(page, "Workspace artifacts");
  441 | 
  442 |   await page.getByRole("button", { name: "Open scoring diagnostics" }).click();
  443 |   await closeDialog(page, "Scoring diagnostics");
  444 | 
  445 |   await openVisibleOverflowAction(page, "button", "How it works");
  446 |   await expect(page.getByRole("dialog")).toBeVisible();
  447 |   await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  448 | 
  449 |   await page.getByRole("button", { name: "Open synthesis and verdict" }).click();
  450 |   const synthesisPanel = page.locator('.synthPanel[data-sheet-state="expanded"]');
  451 |   await expect(synthesisPanel).toBeVisible();
  452 |   const synthesisBox = await synthesisPanel.boundingBox();
  453 |   const viewport = page.viewportSize();
  454 |   expect(synthesisBox).not.toBeNull();
  455 |   expect(viewport).not.toBeNull();
  456 |   expect(synthesisBox!.x).toBeGreaterThanOrEqual(-1);
  457 |   expect(synthesisBox!.x + synthesisBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
  458 |   if (viewport!.width <= 768) {
  459 |     expect(synthesisBox!.height).toBeLessThanOrEqual(viewport!.height * 0.7 + 2);
  460 |   }
  461 |   await synthesisPanel.getByRole("button", { name: "Close synthesis and verdict" }).click();
  462 | 
  463 |   const exportAction = page.locator('a[aria-label="Export"]:visible').first();
  464 |   if (!(await exportAction.count())) {
  465 |     await page.getByRole("button", { name: "More debate actions" }).click();
  466 |   }
  467 |   await page.locator('a[aria-label="Export"]:visible').first().evaluate((element) => {
  468 |     element.addEventListener("click", (event) => event.preventDefault(), { once: true });
  469 |     (element as HTMLElement).click();
  470 |   });
  471 |   await expect(page.locator(".toast")).toContainText("Exported debate.md");
  472 | 
  473 |   await page.getByRole("button", { name: /Unlock actions/ }).click();
  474 |   await expect(page.getByLabel("User token")).toBeVisible();
  475 |   await expect(page.locator("[data-synth-tab]")).toBeHidden();
  476 | 
  477 |   const expanded = await visibleRects(page);
  478 |   expect(expanded.dock).not.toBeNull();
  479 |   expect(expanded.zoom).not.toBeNull();
  480 |   expect(expanded.toast).not.toBeNull();
  481 |   expect.soft(expanded.synthesis, JSON.stringify(expanded)).toBeNull();
  482 |   expect.soft(intersects(expanded.dock!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  483 |   expect.soft(intersects(expanded.toast!, expanded.dock!), JSON.stringify(expanded)).toBe(false);
  484 |   expect.soft(intersects(expanded.toast!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  485 | 
  486 |   await mkdir(screenshotDir, { recursive: true });
  487 |   await page.screenshot({
  488 |     path: resolve(screenshotDir, `${testInfo.project.name.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}.png`),
  489 |     fullPage: false,
  490 |     animations: "disabled"
  491 |   });
  492 | });
  493 | 
  494 | test("safe-area support is structurally wired without claiming non-zero emulated insets", async ({ page }) => {
  495 |   const webRoot = resolve(__dirname, "../..");
  496 |   const layout = readFileSync(resolve(webRoot, "app/layout.tsx"), "utf8");
  497 |   const baseCss = readFileSync(resolve(webRoot, "styles/base.css"), "utf8");
  498 |   const debateCss = readFileSync(resolve(webRoot, "styles/debate-chrome.css"), "utf8");
  499 |   const drawersCss = readFileSync(resolve(webRoot, "styles/drawers.css"), "utf8");
  500 | 
  501 |   expect(layout).toMatch(/viewportFit:\s*["']cover["']/);
  502 |   expect(baseCss).toContain("env(safe-area-inset-bottom, 0px)");
  503 |   expect(debateCss).toContain("env(safe-area-inset-bottom, 0px)");
  504 |   for (const side of ["top", "right", "bottom", "left"]) {
  505 |     expect(drawersCss).toContain(`env(safe-area-inset-${side}, 0px)`);
  506 |   }
  507 | 
  508 |   await page.goto("/debate/s8-complete", { waitUntil: "domcontentloaded" });
  509 |   const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
  510 |   expect(viewportMeta).toContain("viewport-fit=cover");
  511 |   await expectNoHorizontalOverflow(page);
  512 | });
```