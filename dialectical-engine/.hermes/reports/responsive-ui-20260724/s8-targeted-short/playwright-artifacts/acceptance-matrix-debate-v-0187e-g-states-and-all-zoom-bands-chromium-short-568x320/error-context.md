# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> debate views cover Thread, Split, Tree, Map, scoring states, and all zoom bands
- Location: tests\s8-closure\acceptance-matrix.spec.ts:364:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('.thread')
Expected: visible
Received: hidden
Timeout:  3000ms

Call log:
  - Expect "toBeVisible" with timeout 3000ms
  - waiting for locator('.thread')
    10 × locator resolved to <div class="thread scroll">…</div>
       - unexpected value "hidden"

```

```yaml
- banner:
  - link "Dialectical Engine — home":
    - /url: /
  - text: Responsive evidence should remain readable across every supported viewport Complete
  - group "View":
    - button "Thread" [pressed]
    - button "Split"
    - button "Tree"
    - button "Map"
  - button "Open scoring diagnostics": i
  - group:
    - button "More debate actions"
- group: Scoring insights Real scores displayed Showing 1 persisted scored claim from the scoring response. Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC Model-assisted reasoning aid, not a truth verdict. Open
- text: Root claim Public decisions improve when communities examine reasons together. 4 nodes / depth 3 / scroll down to follow each line of argument
- button "↑ Pro Structured debate helps people compare ordinary reasons without losing context. ⚐ Challenge – Hide":
  - text: ↑ Pro Structured debate helps people compare ordinary reasons without losing context.
  - button "⚐ Challenge"
  - button "– Hide"
- button "↓ Con Careful dissent can expose hidden assumptions before a decision becomes costly. ⚐ Challenge – Hide":
  - text: ↓ Con Careful dissent can expose hidden assumptions before a decision becomes costly.
  - button "⚐ Challenge"
  - button "– Hide"
- button "◆ Evidence Concrete evidence improves collective decisions when reasons remain visible. ⚐ Challenge":
  - text: ◆ Evidence Concrete evidence improves collective decisions when reasons remain visible.
  - button "⚐ Challenge"
- button "◆ Practical A second practical branch keeps comparison broad and tests responsive packing. ⚐ Challenge":
  - text: ◆ Practical A second practical branch keeps comparison broad and tests responsive packing.
  - button "⚐ Challenge"
- button "Open synthesis and verdict": Synthesis Verdict
- button "🔒 Unlock actions"
- alert
```

# Test source

```ts
  278 |       await expect(page.getByLabel("Topic")).toBeVisible();
  279 |       await page.getByRole("button", { name: /Options/ }).click();
  280 |       await expect(page.locator(".optionsPanel")).toBeVisible();
  281 |       await page.getByLabel("Topic").fill("A valid responsive debate topic");
  282 |       await page.getByLabel("Role overrides JSON").fill("{invalid");
  283 |       await page.getByRole("button", { name: /Start debate/ }).click();
  284 |       await expect(page.locator(".error")).toBeVisible();
  285 | 
  286 |       await page.getByLabel("Role overrides JSON").fill("");
  287 |       await page.route("**/api/debates", async (request) => {
  288 |         if (request.request().method() !== "POST") {
  289 |           await request.continue();
  290 |           return;
  291 |         }
  292 |         await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  293 |         await fulfillJson(request, { id: "s8-complete" }, 201);
  294 |       });
  295 |       await page.getByRole("button", { name: /Start debate/ }).click();
  296 |       await expect(page.getByRole("button", { name: /Starting/ })).toBeDisabled();
  297 |       await page.waitForURL(/\/debate\/s8-complete/);
  298 |       await page.unroute("**/api/debates");
  299 |     } else if (route.path === "/settings") {
  300 |       await expect(page.locator(".modelRow")).toHaveCount(2);
  301 |       const cap = page.getByLabel("gpt-5 monthly cap USD");
  302 |       await cap.fill("42");
  303 |       await expect(cap).toHaveValue("42");
  304 |       const toggle = page.getByRole("switch", { name: "Toggle gpt-5" });
  305 |       const before = await toggle.getAttribute("aria-checked");
  306 |       await toggle.click();
  307 |       expect(await toggle.getAttribute("aria-checked")).not.toBe(before);
  308 |       await page.getByRole("button", { name: "Edit routing JSON" }).click();
  309 |       await page.getByLabel("Role routing JSON").fill("{invalid");
  310 |       await page.getByRole("button", { name: "Save changes" }).click();
  311 |       await expect(page.locator(".error")).toBeVisible();
  312 |     } else {
  313 |       await expect(page.locator(".workerMetrics .miniCard")).toHaveCount(5);
  314 |       await expect(page.locator(".debateCard")).toHaveCount(1);
  315 | 
  316 |       await page.route("**/api/backends/status", (request) => fulfillJson(request, { workers: [] }));
  317 |       await page.reload({ waitUntil: "domcontentloaded" });
  318 |       await expect(page.locator(".emptyState")).toContainText("No workers registered");
  319 |       await page.unroute("**/api/backends/status");
  320 | 
  321 |       await page.route("**/api/backends/status", (request) =>
  322 |         fulfillJson(request, { detail: "worker fixture error" }, 503)
  323 |       );
  324 |       await page.reload({ waitUntil: "domcontentloaded" });
  325 |       await expect(page.locator(".error")).toBeVisible();
  326 |       await page.unroute("**/api/backends/status");
  327 |     }
  328 | 
  329 |     await expectNoHorizontalOverflow(page);
  330 |   }
  331 | });
  332 | 
  333 | test("debate route covers connecting, generating, completed, error, no-tree, and single-shot", async ({
  334 |   page
  335 | }) => {
  336 |   await page.goto("/debate/s8-delayed", { waitUntil: "domcontentloaded" });
  337 |   await expect(page.locator(".screenInner")).toContainText(/Connecting|Loading/);
  338 |   await expect(page.locator(".debateTopBar")).toBeVisible();
  339 | 
  340 |   await page.goto("/debate/s8-generating", { waitUntil: "domcontentloaded" });
  341 |   await expect(page.locator(".pill")).toContainText("Generating");
  342 |   expect(await page.locator(".node").count()).toBeGreaterThanOrEqual(4);
  343 | 
  344 |   await openCompleteDebate(page);
  345 |   if ((page.viewportSize()?.width ?? 0) <= 920) {
  346 |     await expect(page.getByRole("button", { name: "Open synthesis and verdict" })).toBeVisible();
  347 |   } else {
  348 |     await expect(page.locator(".synthPanel")).toBeVisible();
  349 |   }
  350 | 
  351 |   await page.goto("/debate/s8-banner-error", { waitUntil: "domcontentloaded" });
  352 |   await expect(page.locator(".debateError .error")).toContainText("Claim generation failed");
  353 | 
  354 |   await page.goto("/debate/s8-no-tree", { waitUntil: "domcontentloaded" });
  355 |   await expect(page.locator(".canvasEmpty")).toContainText("No argument tree was produced");
  356 | 
  357 |   await page.goto("/debate/s8-single-shot", { waitUntil: "domcontentloaded" });
  358 |   await expect(page.locator(".debateMain")).toContainText(
  359 |     "Use single-shot mode only when rapid orientation matters"
  360 |   );
  361 |   await expectNoHorizontalOverflow(page);
  362 | });
  363 | 
  364 | test("debate views cover Thread, Split, Tree, Map, scoring states, and all zoom bands", async ({ page }) => {
  365 |   await openCompleteDebate(page);
  366 | 
  367 |   const views = [
  368 |     { name: "Thread", selector: ".thread" },
  369 |     { name: "Split", selector: ".split" },
  370 |     { name: "Tree", selector: ".canvas" },
  371 |     { name: "Map", selector: ".map" }
  372 |   ] as const;
  373 |   for (const view of views) {
  374 |     const button = page.getByRole("button", { name: view.name, exact: true });
  375 |     await expectFullyInsideViewport(button, page);
  376 |     await button.click();
  377 |     await expect(button).toHaveAttribute("aria-pressed", "true");
> 378 |     await expect(page.locator(view.selector)).toBeVisible({ timeout: 3_000 });
      |                                               ^ Error: expect(locator).toBeVisible() failed
  379 |     await expectNoHorizontalOverflow(page);
  380 |   }
  381 | 
  382 |   const scoring = page.locator("details.scoringInsightsPanel");
  383 |   await expect(scoring).toBeVisible();
  384 |   await scoring.locator("summary").click();
  385 |   await expect(scoring).toHaveAttribute("open", "");
  386 |   await scoring.locator("summary").click();
  387 |   await expect(scoring).not.toHaveAttribute("open", "");
  388 | 
  389 |   await page.getByRole("button", { name: "Tree", exact: true }).click();
  390 |   const canvas = page.locator(".canvas");
  391 |   await expect(canvas).toHaveAttribute("data-fit-policy", "column-auto");
  392 |   const columnFit = Number(await canvas.getAttribute("data-zoom"));
  393 |   expect(columnFit).toBeGreaterThanOrEqual(0.5);
  394 |   expect(columnFit).toBeLessThanOrEqual(1);
  395 | 
  396 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  397 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
  398 | 
  399 |   await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  400 |   await expect(canvas).toHaveAttribute("data-fit-policy", "overview-auto");
  401 |   const overviewFit = Number(await canvas.getAttribute("data-zoom"));
  402 |   expect(overviewFit).toBeGreaterThanOrEqual(0.1);
  403 |   expect(overviewFit).toBeLessThanOrEqual(1);
  404 | 
  405 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  406 |   for (let index = 0; index < 12; index += 1) {
  407 |     await page.getByRole("button", { name: "Zoom out" }).click();
  408 |   }
  409 |   await expect(canvas).toHaveAttribute("data-zoom", "0.1000");
  410 |   await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");
  411 | 
  412 |   for (let index = 0; index < 24; index += 1) {
  413 |     await page.getByRole("button", { name: "Zoom in" }).click();
  414 |   }
  415 |   await expect(canvas).toHaveAttribute("data-zoom", "2.0000");
  416 | 
  417 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  418 |   for (let index = 0; index < 6; index += 1) {
  419 |     await page.getByRole("button", { name: "Zoom out" }).click();
  420 |   }
  421 |   await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");
  422 |   const card = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  423 |   await card.click({ timeout: 5_000 });
  424 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
  425 |   await expect(page.getByRole("dialog")).toHaveCount(0);
  426 | });
  427 | 
  428 | test("overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock", async ({
  429 |   page
  430 | }, testInfo) => {
  431 |   await openCompleteDebate(page);
  432 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  433 | 
  434 |   const collapsed = await visibleRects(page);
  435 |   expect(collapsed.dock).not.toBeNull();
  436 |   expect(collapsed.zoom).not.toBeNull();
  437 |   expect(collapsed.synthesis).not.toBeNull();
  438 |   expect.soft(intersects(collapsed.dock!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  439 |   expect.soft(intersects(collapsed.synthesis!, collapsed.dock!), JSON.stringify(collapsed)).toBe(false);
  440 |   expect.soft(intersects(collapsed.synthesis!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  441 | 
  442 |   await mkdir(screenshotDir, { recursive: true });
  443 |   await page.screenshot({
  444 |     path: resolve(screenshotDir, `${testInfo.project.name.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}.png`),
  445 |     fullPage: false,
  446 |     animations: "disabled"
  447 |   });
  448 | 
  449 |   const node = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  450 |   await node.click({ timeout: 5_000 });
  451 |   const argumentDetail = page.getByRole("dialog", { name: "Argument detail" });
  452 |   await expect(argumentDetail).toBeVisible();
  453 |   await argumentDetail.getByRole("button", { name: /Challenge/ }).click();
  454 |   await expect(page.locator(".popCard")).toBeVisible();
  455 |   await page.locator(".popAction").first().click();
  456 |   await closeDialog(page, "Investigation");
  457 | 
  458 |   await openVisibleOverflowAction(page, "button", "Workspace");
  459 |   await closeDialog(page, "Workspace artifacts");
  460 | 
  461 |   await page.getByRole("button", { name: "Open scoring diagnostics" }).click();
  462 |   await closeDialog(page, "Scoring diagnostics");
  463 | 
  464 |   await openVisibleOverflowAction(page, "button", "How it works");
  465 |   await expect(page.getByRole("dialog")).toBeVisible();
  466 |   await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  467 | 
  468 |   const viewport = page.viewportSize();
  469 |   expect(viewport).not.toBeNull();
  470 |   const synthesisPanel =
  471 |     viewport!.width <= 920
  472 |       ? page.locator('.synthPanel[data-sheet-state="expanded"]')
  473 |       : page.locator(".synthPanel");
  474 |   if (viewport!.width <= 920) {
  475 |     await page.getByRole("button", { name: "Open synthesis and verdict" }).click();
  476 |   }
  477 |   await expect(synthesisPanel).toBeVisible();
  478 |   const synthesisBox = await synthesisPanel.boundingBox();
```