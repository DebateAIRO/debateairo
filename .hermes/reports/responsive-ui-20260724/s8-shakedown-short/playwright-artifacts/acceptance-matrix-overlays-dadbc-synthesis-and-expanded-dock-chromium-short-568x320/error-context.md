# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock
- Location: tests\s8-closure\acceptance-matrix.spec.ts:423:5

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
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <details class="scoringInsightsPanel">…</details> intercepts pointer events
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="debateView" data-scoring-state="loaded" data-scoring-enabled="true" data-scoring-node-count="1" data-scoring-visibility="scores" data-adaptive-depth-dry-run-state="loaded">…</div> intercepts pointer events
  54 × retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <summary class="scoringInsightsSummary">…</summary> from <details class="scoringInsightsPanel">…</details> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <details class="scoringInsightsPanel">…</details> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="debateView" data-scoring-state="loaded" data-scoring-enabled="true" data-scoring-node-count="1" data-scoring-visibility="scores" data-adaptive-depth-dry-run-state="loaded">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="debateView" data-scoring-state="loaded" data-scoring-enabled="true" data-scoring-node-count="1" data-scoring-visibility="scores" data-adaptive-depth-dry-run-state="loaded">…</div> intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <summary class="scoringInsightsSummary">…</summary> from <details class="scoringInsightsPanel">…</details> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <details class="scoringInsightsPanel">…</details> intercepts pointer events
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
            - button "Reset zoom to 1:1" [active] [ref=e84] [cursor=pointer]: 1:1
            - status [ref=e85]: 100%
      - button "Open synthesis and verdict" [ref=e86] [cursor=pointer]:
        - generic [ref=e88]: Synthesis
        - generic [ref=e89]: Verdict
    - button "🔒 Unlock actions" [ref=e91] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e97] [cursor=pointer]:
    - img [ref=e98]
  - alert [ref=e101]
```

# Test source

```ts
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
  373 |     await expect(page.locator(view.selector)).toBeVisible();
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
  437 |   const node = page.locator('.nodeWrap[data-node-id="node-1"] .node');
> 438 |   await node.click();
      |              ^ Error: locator.click: Test timeout of 120000ms exceeded.
  439 |   const argumentDetail = page.getByRole("dialog", { name: "Argument detail" });
  440 |   await expect(argumentDetail).toBeVisible();
  441 |   await argumentDetail.getByRole("button", { name: /Challenge/ }).click();
  442 |   await expect(page.locator(".popCard")).toBeVisible();
  443 |   await page.locator(".popAction").first().click();
  444 |   await closeDialog(page, "Investigation");
  445 | 
  446 |   await openVisibleOverflowAction(page, "button", "Workspace");
  447 |   await closeDialog(page, "Workspace artifacts");
  448 | 
  449 |   await page.getByRole("button", { name: "Open scoring diagnostics" }).click();
  450 |   await closeDialog(page, "Scoring diagnostics");
  451 | 
  452 |   await openVisibleOverflowAction(page, "button", "How it works");
  453 |   await expect(page.getByRole("dialog")).toBeVisible();
  454 |   await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  455 | 
  456 |   const viewport = page.viewportSize();
  457 |   expect(viewport).not.toBeNull();
  458 |   const synthesisPanel =
  459 |     viewport!.width <= 920
  460 |       ? page.locator('.synthPanel[data-sheet-state="expanded"]')
  461 |       : page.locator(".synthPanel");
  462 |   if (viewport!.width <= 920) {
  463 |     await page.getByRole("button", { name: "Open synthesis and verdict" }).click();
  464 |   }
  465 |   await expect(synthesisPanel).toBeVisible();
  466 |   const synthesisBox = await synthesisPanel.boundingBox();
  467 |   expect(synthesisBox).not.toBeNull();
  468 |   expect(synthesisBox!.x).toBeGreaterThanOrEqual(-1);
  469 |   expect(synthesisBox!.x + synthesisBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
  470 |   if (viewport!.width <= 768) {
  471 |     expect(synthesisBox!.height).toBeLessThanOrEqual(viewport!.height * 0.7 + 2);
  472 |   }
  473 |   if (viewport!.width <= 920) {
  474 |     await synthesisPanel.getByRole("button", { name: "Close synthesis and verdict" }).click();
  475 |   }
  476 | 
  477 |   const exportAction = page.locator('a[aria-label="Export"]:visible').first();
  478 |   if (!(await exportAction.count())) {
  479 |     await page.getByRole("button", { name: "More debate actions" }).click();
  480 |   }
  481 |   await page.locator('a[aria-label="Export"]:visible').first().evaluate((element) => {
  482 |     element.addEventListener("click", (event) => event.preventDefault(), { once: true });
  483 |     (element as HTMLElement).click();
  484 |   });
  485 |   await expect(page.locator(".toast")).toContainText("Exported debate.md");
  486 | 
  487 |   await page.getByRole("button", { name: /Unlock actions/ }).click();
  488 |   await expect(page.getByLabel("User token")).toBeVisible();
  489 |   if (viewport!.width <= 920) {
  490 |     await expect(page.locator("[data-synth-tab]")).toBeHidden();
  491 |   }
  492 | 
  493 |   const expanded = await visibleRects(page);
  494 |   expect(expanded.dock).not.toBeNull();
  495 |   expect(expanded.zoom).not.toBeNull();
  496 |   expect(expanded.toast).not.toBeNull();
  497 |   if (viewport!.width <= 920) {
  498 |     expect.soft(expanded.synthesis, JSON.stringify(expanded)).toBeNull();
  499 |   } else {
  500 |     expect.soft(expanded.synthesis, JSON.stringify(expanded)).not.toBeNull();
  501 |   }
  502 |   expect.soft(intersects(expanded.dock!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  503 |   expect.soft(intersects(expanded.toast!, expanded.dock!), JSON.stringify(expanded)).toBe(false);
  504 |   expect.soft(intersects(expanded.toast!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  505 |   if (expanded.synthesis) {
  506 |     expect.soft(intersects(expanded.synthesis, expanded.dock!), JSON.stringify(expanded)).toBe(false);
  507 |     expect.soft(intersects(expanded.synthesis, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  508 |   }
  509 | 
  510 |   await mkdir(screenshotDir, { recursive: true });
  511 |   await page.screenshot({
  512 |     path: resolve(screenshotDir, `${testInfo.project.name.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}.png`),
  513 |     fullPage: false,
  514 |     animations: "disabled"
  515 |   });
  516 | });
  517 | 
  518 | test("safe-area support is structurally wired without claiming non-zero emulated insets", async ({ page }) => {
  519 |   const webRoot = resolve(__dirname, "../..");
  520 |   const layout = readFileSync(resolve(webRoot, "app/layout.tsx"), "utf8");
  521 |   const baseCss = readFileSync(resolve(webRoot, "styles/base.css"), "utf8");
  522 |   const debateCss = readFileSync(resolve(webRoot, "styles/debate-chrome.css"), "utf8");
  523 |   const drawersCss = readFileSync(resolve(webRoot, "styles/drawers.css"), "utf8");
  524 | 
  525 |   expect(layout).toMatch(/viewportFit:\s*["']cover["']/);
  526 |   expect(baseCss).toContain("env(safe-area-inset-bottom, 0px)");
  527 |   expect(debateCss).toContain("env(safe-area-inset-bottom, 0px)");
  528 |   for (const side of ["top", "right", "bottom", "left"]) {
  529 |     expect(drawersCss).toContain(`env(safe-area-inset-${side}, 0px)`);
  530 |   }
  531 | 
  532 |   await page.goto("/debate/s8-complete", { waitUntil: "domcontentloaded" });
  533 |   const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
  534 |   expect(viewportMeta).toContain("viewport-fit=cover");
  535 |   await expectNoHorizontalOverflow(page);
  536 | });
  537 | 
  538 | test("320/375-class cells have no ordinary-English mid-word breaks across library and debate views", async ({
```