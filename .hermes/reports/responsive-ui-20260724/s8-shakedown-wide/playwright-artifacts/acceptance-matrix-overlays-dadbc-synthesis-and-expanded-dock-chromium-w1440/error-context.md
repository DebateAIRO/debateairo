# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock
- Location: tests\s8-closure\acceptance-matrix.spec.ts:416:5

# Error details

```
Error: expect(received).not.toBeNull()

Received: null
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
            - text: ←Library
          - button "Replay" [ref=e27] [cursor=pointer]:
            - generic [ref=e28]: ↻
            - generic [ref=e29]: Replay
          - button "Workspace" [ref=e30] [cursor=pointer]:
            - generic [ref=e31]: ◫
            - generic [ref=e32]: Workspace
          - link "Export" [ref=e33] [cursor=pointer]:
            - /url: http://127.0.0.1:8118/api/debates/s8-complete/export.md
            - generic [ref=e34]: ↓
            - generic [ref=e35]: Export
          - button "How it works" [ref=e36] [cursor=pointer]: "?"
          - link "Settings" [ref=e37] [cursor=pointer]:
            - /url: /settings
            - text: ⚙
    - group [ref=e38]:
      - generic "Scoring insights Real scores displayed Showing 1 persisted scored claim from the scoring response. Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC Model-assisted reasoning aid, not a truth verdict. Open" [ref=e39] [cursor=pointer]:
        - generic [ref=e40]: Scoring insights
        - generic [ref=e41]: Real scores displayed
        - generic [ref=e42]: Showing 1 persisted scored claim from the scoring response.
        - generic [ref=e43]:
          - generic [ref=e44]: Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC
          - generic [ref=e45]: Model-assisted reasoning aid, not a truth verdict.
        - text: Open
    - generic [ref=e46]:
      - generic [ref=e48]:
        - generic [ref=e49]:
          - generic [ref=e50]:
            - checkbox "Show set-aside paths" [checked] [ref=e51]
            - text: Show set-aside paths
          - generic [ref=e53]:
            - img
            - generic [ref=e55]:
              - generic [ref=e56]: Root claim
              - generic [ref=e57]: Public decisions improve when communities examine reasons together.
              - generic [ref=e58]:
                - generic [ref=e59]: 4 claims
                - generic [ref=e60]: /
                - generic [ref=e61]: depth 3
            - generic [ref=e63]:
              - generic [ref=e65]: ↑ Pro
              - generic [ref=e66]: Structured debate helps people compare ordinary reasons without losing context.
              - generic [ref=e67]:
                - button "⚐ Challenge" [ref=e68] [cursor=pointer]
                - button "Read ▼" [ref=e69] [cursor=pointer]:
                  - text: Read
                  - generic [ref=e70]: ▼
            - generic [ref=e72]:
              - generic [ref=e74]: ↓ Con
              - generic [ref=e75]: Careful dissent can expose hidden assumptions before a decision becomes costly.
              - generic [ref=e76]:
                - button "⚐ Challenge" [ref=e77] [cursor=pointer]
                - button "Read ▼" [ref=e78] [cursor=pointer]:
                  - text: Read
                  - generic [ref=e79]: ▼
            - generic [ref=e81]:
              - generic [ref=e83]: ◆ Evidence
              - generic [ref=e84]: Concrete evidence improves collective decisions when reasons remain visible.
              - generic [ref=e85]:
                - button "⚐ Challenge" [ref=e86] [cursor=pointer]
                - button "Read ▼" [ref=e87] [cursor=pointer]:
                  - text: Read
                  - generic [ref=e88]: ▼
            - generic [ref=e90]:
              - generic [ref=e92]: ◆ Practical
              - generic [ref=e93]: A second practical branch keeps comparison broad and tests responsive packing.
              - generic [ref=e94]:
                - button "⚐ Challenge" [ref=e95] [cursor=pointer]
                - button "Read ▼" [ref=e96] [cursor=pointer]:
                  - text: Read
                  - generic [ref=e97]: ▼
        - group "Canvas zoom controls" [ref=e98]:
          - button "Zoom in" [ref=e99] [cursor=pointer]: +
          - button "Zoom out" [ref=e100] [cursor=pointer]: −
          - button "Fit whole tree (overview)" [ref=e101] [cursor=pointer]: Fit
          - button "Reset zoom to 1:1" [active] [ref=e102] [cursor=pointer]: 1:1
          - status [ref=e103]: 100%
      - complementary "Synthesis" [ref=e104]:
        - generic [ref=e105]:
          - generic [ref=e108]: Synthesis
          - generic [ref=e109]: The strongest case on each side, plus a verdict.
          - generic [ref=e110]:
            - generic [ref=e111]:
              - generic [ref=e113]: ↑ Strongest Pro
              - generic [ref=e114]: Visible reasons make tradeoffs easier to inspect.
            - generic [ref=e115]:
              - generic [ref=e117]: ↓ Strongest Con
              - generic [ref=e118]: Structured formats can still omit important context.
            - generic [ref=e119]:
              - generic [ref=e120]:
                - generic [ref=e121]: Verdict
                - generic [ref=e122]: gpt-5 · Responsive fixture worker
              - generic [ref=e123]: Use structured debate while preserving dissent and source context.
              - generic [ref=e124]:
                - generic [ref=e125]: Leans
                - generic [ref=e127]: Even
            - generic [ref=e128]:
              - generic [ref=e129]:
                - generic [ref=e130]: Agreements
                - list [ref=e131]:
                  - listitem [ref=e132]: Reasons should stay visible.
              - generic [ref=e133]:
                - generic [ref=e134]: Tensions
                - list [ref=e135]:
                  - listitem [ref=e136]: Structure can simplify context.
              - generic [ref=e137]:
                - generic [ref=e138]: Evidence Gaps
                - list [ref=e139]:
                  - listitem [ref=e140]: Real-device gesture behavior remains a hardware gate.
              - generic [ref=e141]:
                - generic [ref=e142]: Key Takeaways
                - list [ref=e143]:
                  - listitem [ref=e144]: Preserve context while comparing claims.
    - button "🔒 Unlock actions" [ref=e146] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e152] [cursor=pointer]:
    - img [ref=e153]
  - alert [ref=e156]
```

# Test source

```ts
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
  412 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
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
> 425 |   expect(collapsed.synthesis).not.toBeNull();
      |                                   ^ Error: expect(received).not.toBeNull()
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
  513 | 
  514 | test("320/375-class cells have no ordinary-English mid-word breaks across library and debate views", async ({
  515 |   page
  516 | }, testInfo) => {
  517 |   const width = page.viewportSize()?.width ?? 0;
  518 |   test.skip(![320, 375].includes(width), `mid-word detector applies only at 320/375; project=${testInfo.project.name}`);
  519 | 
  520 |   async function expectClaimsFit(selector: string) {
  521 |     const claims = page.locator(selector);
  522 |     expect(await claims.count(), `${selector} must exist`).toBeGreaterThan(0);
  523 |     const metrics = await claims.evaluateAll((elements) =>
  524 |       elements.map((claim) => {
  525 |         const element = claim as HTMLElement;
```