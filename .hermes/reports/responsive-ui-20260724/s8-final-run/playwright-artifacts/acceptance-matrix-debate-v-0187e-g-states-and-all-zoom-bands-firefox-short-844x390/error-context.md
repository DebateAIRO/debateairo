# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> debate views cover Thread, Split, Tree, Map, scoring states, and all zoom bands
- Location: tests\s8-closure\acceptance-matrix.spec.ts:359:5

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: locator.click: Test timeout of 120000ms exceeded.
Call log:
  - waiting for locator('.nodeWrap[data-node-id="node-1"] .node')
    - locator resolved to <div class="node" data-score-filter-match="true">…</div>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <label class="canvasStickyToggle">…</label> intercepts pointer events
  54 × retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button type="button" aria-label="Zoom in" class="canvasZoomButton">+</button> from <div role="group" class="canvasZoomCluster" aria-label="Canvas zoom controls">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button type="button" aria-label="Zoom in" class="canvasZoomButton">+</button> from <div role="group" class="canvasZoomCluster" aria-label="Canvas zoom controls">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <label class="canvasStickyToggle">…</label> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <label class="canvasStickyToggle">…</label> intercepts pointer events
  2 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" aria-label="Zoom in" class="canvasZoomButton">+</button> from <div role="group" class="canvasZoomCluster" aria-label="Canvas zoom controls">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "Dialectical Engine — home" [ref=e6] [cursor=pointer]:
          - /url: /
          - generic [ref=e9]:
            - generic [ref=e10]: Dialectical Engine
            - generic [ref=e11]: dezbatere.ro
        - generic [ref=e12]:
          - generic [ref=e13]: Responsive evidence should remain readable across every supported viewport
          - generic [ref=e14]: Complete
      - generic [ref=e16]:
        - group "View" [ref=e17]:
          - button "Thread" [ref=e18] [cursor=pointer]
          - button "Split" [ref=e19] [cursor=pointer]
          - button "Tree" [pressed] [ref=e20] [cursor=pointer]
          - button "Map" [ref=e21] [cursor=pointer]
        - generic [ref=e22]:
          - generic [ref=e23]: Scoring
          - button "Open scoring diagnostics" [ref=e24] [cursor=pointer]: i
        - generic [ref=e25]:
          - link "Library" [ref=e26] [cursor=pointer]:
            - /url: /
            - text: ←
          - button "Replay" [ref=e27] [cursor=pointer]:
            - generic [ref=e28]: ↻
          - button "Workspace" [ref=e29] [cursor=pointer]:
            - generic [ref=e30]: ◫
          - link "Export" [ref=e31] [cursor=pointer]:
            - /url: http://127.0.0.1:8118/api/debates/s8-complete/export.md
            - generic [ref=e32]: ↓
          - button "How it works" [ref=e33] [cursor=pointer]: "?"
          - link "Settings" [ref=e34] [cursor=pointer]:
            - /url: /settings
            - text: ⚙
    - group [ref=e35]:
      - generic "Scoring insights Real scores displayed Showing 1 persisted scored claim from the scoring response. Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC Model-assisted reasoning aid, not a truth verdict. Open" [ref=e36] [cursor=pointer]:
        - generic [ref=e37]: Scoring insights
        - generic [ref=e38]: Real scores displayed
        - generic [ref=e39]: Showing 1 persisted scored claim from the scoring response.
        - generic [ref=e40]:
          - generic [ref=e41]: Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC
          - generic [ref=e42]: Model-assisted reasoning aid, not a truth verdict.
        - text: Open
    - generic [ref=e43]:
      - generic [ref=e45]:
        - generic [ref=e46]:
          - generic [ref=e47]:
            - checkbox "Show set-aside paths" [checked] [ref=e48]
            - text: Show set-aside paths
          - generic [ref=e50]:
            - img
            - generic [ref=e52]:
              - generic [ref=e53]: Root claim
              - generic [ref=e54]: Public decisions improve when communities examine reasons together.
            - generic [ref=e57]: Structured debate helps people compare ordinary reasons without losing context.
            - generic [ref=e60]: Careful dissent can expose hidden assumptions before a decision becomes costly.
            - generic [ref=e63]: Concrete evidence improves collective decisions when reasons remain visible.
            - generic [ref=e66]: A second practical branch keeps comparison broad and tests responsive packing.
        - group "Canvas zoom controls" [ref=e67]:
          - button "Zoom in" [ref=e68] [cursor=pointer]: +
          - button "Zoom out" [active] [ref=e69] [cursor=pointer]: −
          - button "Fit whole tree (overview)" [ref=e70] [cursor=pointer]: Fit
          - button "Reset zoom to 1:1" [ref=e71] [cursor=pointer]: 1:1
          - status [ref=e72]: 40%
      - button "Open synthesis and verdict" [ref=e73] [cursor=pointer]:
        - generic [ref=e75]: Synthesis
        - generic [ref=e76]: Verdict
    - button "🔒 Unlock actions" [ref=e78] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e84] [cursor=pointer]:
    - img [ref=e85]
  - alert [ref=e89]
```

# Test source

```ts
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
  344 |   await expect(page.getByRole("button", { name: "Open synthesis and verdict" })).toBeVisible();
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
> 418 |   await card.click();
      |              ^ Error: locator.click: Test timeout of 120000ms exceeded.
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
  445 |   await node.click({ timeout: 5_000 });
  446 |   const argumentDetail = page.getByRole("dialog", { name: "Argument detail" });
  447 |   await expect(argumentDetail).toBeVisible();
  448 |   await argumentDetail.getByRole("button", { name: /Challenge/ }).click();
  449 |   await expect(page.locator(".popCard")).toBeVisible();
  450 |   await page.locator(".popAction").first().click();
  451 |   await closeDialog(page, "Investigation");
  452 | 
  453 |   await openVisibleOverflowAction(page, "button", "Workspace");
  454 |   await closeDialog(page, "Workspace artifacts");
  455 | 
  456 |   await page.getByRole("button", { name: "Open scoring diagnostics" }).click();
  457 |   await closeDialog(page, "Scoring diagnostics");
  458 | 
  459 |   await openVisibleOverflowAction(page, "button", "How it works");
  460 |   await expect(page.getByRole("dialog")).toBeVisible();
  461 |   await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  462 | 
  463 |   const viewport = page.viewportSize();
  464 |   expect(viewport).not.toBeNull();
  465 |   const synthesisPanel =
  466 |     viewport!.width <= 920
  467 |       ? page.locator('.synthPanel[data-sheet-state="expanded"]')
  468 |       : page.locator(".synthPanel");
  469 |   if (viewport!.width <= 920) {
  470 |     await page.getByRole("button", { name: "Open synthesis and verdict" }).click();
  471 |   }
  472 |   await expect(synthesisPanel).toBeVisible();
  473 |   const synthesisBox = await synthesisPanel.boundingBox();
  474 |   expect(synthesisBox).not.toBeNull();
  475 |   expect(synthesisBox!.x).toBeGreaterThanOrEqual(-1);
  476 |   expect(synthesisBox!.x + synthesisBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
  477 |   if (viewport!.width <= 768) {
  478 |     expect(synthesisBox!.height).toBeLessThanOrEqual(viewport!.height * 0.7 + 2);
  479 |   }
  480 |   if (viewport!.width <= 920) {
  481 |     await synthesisPanel.getByRole("button", { name: "Close synthesis and verdict" }).click();
  482 |   }
  483 | 
  484 |   const exportAction = page.locator('a[aria-label="Export"]:visible').first();
  485 |   if (!(await exportAction.count())) {
  486 |     await page.getByRole("button", { name: "More debate actions" }).click();
  487 |   }
  488 |   await page.locator('a[aria-label="Export"]:visible').first().evaluate((element) => {
  489 |     element.addEventListener("click", (event) => event.preventDefault(), { once: true });
  490 |     (element as HTMLElement).click();
  491 |   });
  492 |   await expect(page.locator(".toast")).toContainText("Exported debate.md");
  493 | 
  494 |   await page.getByRole("button", { name: /Unlock actions/ }).click();
  495 |   await expect(page.getByLabel("User token")).toBeVisible();
  496 |   if (viewport!.width <= 920) {
  497 |     await expect(page.locator("[data-synth-tab]")).toBeHidden();
  498 |   }
  499 | 
  500 |   const expanded = await visibleRects(page);
  501 |   expect(expanded.dock).not.toBeNull();
  502 |   expect(expanded.zoom).not.toBeNull();
  503 |   expect(expanded.toast).not.toBeNull();
  504 |   if (viewport!.width <= 920) {
  505 |     expect.soft(expanded.synthesis, JSON.stringify(expanded)).toBeNull();
  506 |   } else {
  507 |     expect.soft(expanded.synthesis, JSON.stringify(expanded)).not.toBeNull();
  508 |   }
  509 |   expect.soft(intersects(expanded.dock!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  510 |   expect.soft(intersects(expanded.toast!, expanded.dock!), JSON.stringify(expanded)).toBe(false);
  511 |   expect.soft(intersects(expanded.toast!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  512 |   if (expanded.synthesis) {
  513 |     expect.soft(intersects(expanded.synthesis, expanded.dock!), JSON.stringify(expanded)).toBe(false);
  514 |     expect.soft(intersects(expanded.synthesis, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  515 |   }
  516 | 
  517 |   await page.screenshot({
  518 |     path: resolve(screenshotDir, `${testInfo.project.name.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}.png`),
```