# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock
- Location: tests\s8-closure\acceptance-matrix.spec.ts:428:5

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: locator.click: Test timeout of 120000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Reset zoom to 1:1' })
    - locator resolved to <button type="button" aria-label="Reset zoom to 1:1" class="canvasZoomButton canvasZoomOne">1:1</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="synthTab" data-synth-tab="true" aria-expanded="false" aria-controls="_R_4qatpesnelb_" aria-label="Open synthesis and verdict">…</button> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="synthTab" data-synth-tab="true" aria-expanded="false" aria-controls="_R_4qatpesnelb_" aria-label="Open synthesis and verdict">…</button> intercepts pointer events
    - retrying click action
      - waiting 100ms
    180 × waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <button type="button" class="synthTab" data-synth-tab="true" aria-expanded="false" aria-controls="_R_4qatpesnelb_" aria-label="Open synthesis and verdict">…</button> intercepts pointer events
      - retrying click action
        - waiting 500ms
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "Dialectical Engine — home" [ref=e6]:
          - /url: /
        - generic [ref=e9]:
          - generic [ref=e10]: Responsive evidence should remain readable across every supported viewport
          - generic [ref=e11]: Complete
      - generic [ref=e13]:
        - group "View" [ref=e14]:
          - button "Thread" [ref=e15] [cursor=pointer]
          - button "Split" [ref=e16] [cursor=pointer]
          - button "Tree" [pressed] [ref=e17] [cursor=pointer]
          - button "Map" [ref=e18] [cursor=pointer]
        - button "Open scoring diagnostics" [ref=e20] [cursor=pointer]: i
        - group [ref=e21]:
          - button "More debate actions" [ref=e22] [cursor=pointer]:
            - generic [ref=e23]: ⋯
    - group [ref=e24]:
      - generic "Scoring insights Real scores displayed Showing 1 persisted scored claim from the scoring response. Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC Model-assisted reasoning aid, not a truth verdict. Open" [ref=e25] [cursor=pointer]:
        - generic [ref=e26]: Scoring insights
        - generic [ref=e27]: Real scores displayed
        - generic [ref=e28]: Showing 1 persisted scored claim from the scoring response.
        - generic [ref=e29]:
          - generic [ref=e30]: Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC
          - generic [ref=e31]: Model-assisted reasoning aid, not a truth verdict.
        - text: Open
    - generic:
      - generic:
        - generic:
          - generic:
            - generic [ref=e32]:
              - checkbox "Show set-aside paths" [checked] [ref=e33]
              - text: Show set-aside paths
            - generic [ref=e35]:
              - img
              - generic [ref=e37]:
                - generic [ref=e38]: Root claim
                - generic [ref=e39]: Public decisions improve when communities examine reasons together.
                - generic [ref=e40]:
                  - generic [ref=e41]: 4 claims
                  - generic [ref=e42]: /
                  - generic [ref=e43]: depth 3
              - generic [ref=e45]:
                - generic [ref=e47]: ↑ Pro
                - generic [ref=e48]: Structured debate helps people compare ordinary reasons without losing context.
                - generic [ref=e49]:
                  - button "⚐ Challenge" [ref=e50] [cursor=pointer]
                  - button "Read ▼" [ref=e51] [cursor=pointer]:
                    - text: Read
                    - generic [ref=e52]: ▼
              - generic [ref=e54]:
                - generic [ref=e56]: ↓ Con
                - generic [ref=e57]: Careful dissent can expose hidden assumptions before a decision becomes costly.
                - generic [ref=e58]:
                  - button "⚐ Challenge" [ref=e59] [cursor=pointer]
                  - button "Read ▼" [ref=e60] [cursor=pointer]:
                    - text: Read
                    - generic [ref=e61]: ▼
              - generic [ref=e63]:
                - generic [ref=e65]: ◆ Evidence
                - generic [ref=e66]: Concrete evidence improves collective decisions when reasons remain visible.
                - generic [ref=e67]:
                  - button "⚐ Challenge" [ref=e68] [cursor=pointer]
                  - button "Read ▼" [ref=e69] [cursor=pointer]:
                    - text: Read
                    - generic [ref=e70]: ▼
              - generic [ref=e72]:
                - generic [ref=e74]: ◆ Practical
                - generic [ref=e75]: A second practical branch keeps comparison broad and tests responsive packing.
                - generic [ref=e76]:
                  - button "⚐ Challenge" [ref=e77] [cursor=pointer]
                  - button "Read ▼" [ref=e78] [cursor=pointer]:
                    - text: Read
                    - generic [ref=e79]: ▼
          - group "Canvas zoom controls" [ref=e80]:
            - button "Zoom in" [ref=e81] [cursor=pointer]: +
            - button "Zoom out" [ref=e82] [cursor=pointer]: −
            - button "Fit whole tree (overview)" [ref=e83] [cursor=pointer]: Fit
            - button "Reset zoom to 1:1" [ref=e84] [cursor=pointer]: 1:1
            - status [ref=e85]: 100%
      - button "Open synthesis and verdict" [ref=e86] [cursor=pointer]:
        - generic [ref=e88]: Synthesis
        - generic [ref=e89]: Verdict
    - button "🔒 Unlock actions" [ref=e91] [cursor=pointer]
  - alert [ref=e92]
```

# Test source

```ts
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
  378 |     await expect(page.locator(view.selector)).toBeVisible({ timeout: 3_000 });
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
> 432 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
      |                                                                 ^ Error: locator.click: Test timeout of 120000ms exceeded.
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
  479 |   expect(synthesisBox).not.toBeNull();
  480 |   expect(synthesisBox!.x).toBeGreaterThanOrEqual(-1);
  481 |   expect(synthesisBox!.x + synthesisBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
  482 |   if (viewport!.width <= 768) {
  483 |     expect(synthesisBox!.height).toBeLessThanOrEqual(viewport!.height * 0.7 + 2);
  484 |   }
  485 |   if (viewport!.width <= 920) {
  486 |     await synthesisPanel.getByRole("button", { name: "Close synthesis and verdict" }).click();
  487 |   }
  488 | 
  489 |   const exportAction = page.locator('a[aria-label="Export"]:visible').first();
  490 |   if (!(await exportAction.count())) {
  491 |     await page.getByRole("button", { name: "More debate actions" }).click();
  492 |   }
  493 |   await page.locator('a[aria-label="Export"]:visible').first().evaluate((element) => {
  494 |     element.addEventListener("click", (event) => event.preventDefault(), { once: true });
  495 |     (element as HTMLElement).click();
  496 |   });
  497 |   await expect(page.locator(".toast")).toContainText("Exported debate.md");
  498 | 
  499 |   await page.getByRole("button", { name: /Unlock actions/ }).click();
  500 |   await expect(page.getByLabel("User token")).toBeVisible();
  501 |   if (viewport!.width <= 920) {
  502 |     await expect(page.locator("[data-synth-tab]")).toBeHidden();
  503 |   }
  504 | 
  505 |   const expanded = await visibleRects(page);
  506 |   expect(expanded.dock).not.toBeNull();
  507 |   expect(expanded.zoom).not.toBeNull();
  508 |   expect(expanded.toast).not.toBeNull();
  509 |   if (viewport!.width <= 920) {
  510 |     expect.soft(expanded.synthesis, JSON.stringify(expanded)).toBeNull();
  511 |   } else {
  512 |     expect.soft(expanded.synthesis, JSON.stringify(expanded)).not.toBeNull();
  513 |   }
  514 |   expect.soft(intersects(expanded.dock!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  515 |   expect.soft(intersects(expanded.toast!, expanded.dock!), JSON.stringify(expanded)).toBe(false);
  516 |   expect.soft(intersects(expanded.toast!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  517 |   if (expanded.synthesis) {
  518 |     expect.soft(intersects(expanded.synthesis, expanded.dock!), JSON.stringify(expanded)).toBe(false);
  519 |     expect.soft(intersects(expanded.synthesis, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  520 |   }
  521 | 
  522 |   await page.screenshot({
  523 |     path: resolve(screenshotDir, `${testInfo.project.name.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}.png`),
  524 |     fullPage: false,
  525 |     animations: "disabled"
  526 |   });
  527 | });
  528 | 
  529 | test("safe-area support is structurally wired without claiming non-zero emulated insets", async ({ page }) => {
  530 |   const webRoot = resolve(__dirname, "../..");
  531 |   const layout = readFileSync(resolve(webRoot, "app/layout.tsx"), "utf8");
  532 |   const baseCss = readFileSync(resolve(webRoot, "styles/base.css"), "utf8");
```