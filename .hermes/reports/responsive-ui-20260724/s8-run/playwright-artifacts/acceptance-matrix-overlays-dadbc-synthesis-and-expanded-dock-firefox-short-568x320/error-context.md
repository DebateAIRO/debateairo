# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock
- Location: tests\s8-closure\acceptance-matrix.spec.ts:413:5

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
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <details class="scoringInsightsPanel">…</details> intercepts pointer events
  - retrying click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <summary class="scoringInsightsSummary">…</summary> from <details class="scoringInsightsPanel">…</details> subtree intercepts pointer events
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
  55 × retrying click action
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
  - alert [ref=e102]
```

# Test source

```ts
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
  393 |   await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");
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
> 428 |   await node.click();
      |              ^ Error: locator.click: Test timeout of 120000ms exceeded.
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
  494 |   const baseCss = readFileSync(resolve(webRoot, "styles/base.css"), "utf8");
  495 |   const debateCss = readFileSync(resolve(webRoot, "styles/debate-chrome.css"), "utf8");
  496 |   const drawersCss = readFileSync(resolve(webRoot, "styles/drawers.css"), "utf8");
  497 | 
  498 |   expect(layout).toMatch(/viewportFit:\s*["']cover["']/);
  499 |   expect(baseCss).toContain("env(safe-area-inset-bottom, 0px)");
  500 |   expect(debateCss).toContain("env(safe-area-inset-bottom, 0px)");
  501 |   for (const side of ["top", "right", "bottom", "left"]) {
  502 |     expect(drawersCss).toContain(`env(safe-area-inset-${side}, 0px)`);
  503 |   }
  504 | 
  505 |   await page.goto("/debate/s8-complete", { waitUntil: "domcontentloaded" });
  506 |   const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
  507 |   expect(viewportMeta).toContain("viewport-fit=cover");
  508 |   await expectNoHorizontalOverflow(page);
  509 | });
  510 | 
  511 | test("320/375-class cells have no ordinary-English mid-word breaks across library and debate views", async ({
  512 |   page
  513 | }, testInfo) => {
  514 |   const width = page.viewportSize()?.width ?? 0;
  515 |   test.skip(![320, 375].includes(width), `mid-word detector applies only at 320/375; project=${testInfo.project.name}`);
  516 | 
  517 |   async function expectClaimsFit(selector: string) {
  518 |     const claims = page.locator(selector);
  519 |     expect(await claims.count(), `${selector} must exist`).toBeGreaterThan(0);
  520 |     const metrics = await claims.evaluateAll((elements) =>
  521 |       elements.map((claim) => {
  522 |         const element = claim as HTMLElement;
  523 |         const previousOverflowWrap = element.style.overflowWrap;
  524 |         const previousWordBreak = element.style.wordBreak;
  525 |         element.style.overflowWrap = "normal";
  526 |         element.style.wordBreak = "normal";
  527 |         const style = getComputedStyle(element);
  528 |         const rect = element.getBoundingClientRect();
```