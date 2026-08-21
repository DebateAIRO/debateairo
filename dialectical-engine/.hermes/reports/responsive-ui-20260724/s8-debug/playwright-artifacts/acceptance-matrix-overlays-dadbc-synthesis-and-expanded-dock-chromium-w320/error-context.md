# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock
- Location: tests\s8-closure\acceptance-matrix.spec.ts:411:5

# Error details

```
Error: {"dock":{"left":41.09375,"right":302,"top":848,"bottom":882},"zoom":{"left":256,"right":308,"top":432,"bottom":660},"toast":{"left":80,"right":240,"top":104,"bottom":158},"synthesis":{"left":14,"right":122,"top":846,"bottom":882}}

expect(received).toBeNull()

Received: {"bottom": 882, "left": 14, "right": 122, "top": 846}
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
          - generic [ref=e24]:
            - link "Library" [ref=e25] [cursor=pointer]:
              - /url: /
              - text: ←Library
            - button "Replay" [ref=e26] [cursor=pointer]:
              - generic [ref=e27]: ↻
              - generic [ref=e28]: Replay
            - button "Workspace" [ref=e29] [cursor=pointer]:
              - generic [ref=e30]: ◫
              - generic [ref=e31]: Workspace
            - link "Export" [ref=e32] [cursor=pointer]:
              - /url: http://127.0.0.1:8118/api/debates/s8-complete/export.md
              - generic [ref=e33]: ↓
              - generic [ref=e34]: Export
            - button "How it works" [ref=e35] [cursor=pointer]: "?"
            - link "Settings" [ref=e36] [cursor=pointer]:
              - /url: /settings
              - text: ⚙
    - group [ref=e37]:
      - generic "Scoring insights Real scores displayed Showing 1 persisted scored claim from the scoring response. Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC Model-assisted reasoning aid, not a truth verdict. Open" [ref=e38] [cursor=pointer]:
        - generic [ref=e39]: Scoring insights
        - generic [ref=e40]: Real scores displayed
        - generic [ref=e41]: Showing 1 persisted scored claim from the scoring response.
        - generic [ref=e42]:
          - generic [ref=e43]: Fresh scores - fixture/deterministic - Last checked 2026-07-26 17:01 UTC
          - generic [ref=e44]: Model-assisted reasoning aid, not a truth verdict.
        - text: Open
    - generic [ref=e47]:
      - generic [ref=e48]:
        - generic [ref=e49]:
          - checkbox "Show set-aside paths" [checked] [ref=e50]
          - text: Show set-aside paths
        - generic [ref=e52]:
          - img
          - generic [ref=e54]:
            - generic [ref=e55]: Root claim
            - generic [ref=e56]: Public decisions improve when communities examine reasons together.
            - generic [ref=e57]:
              - generic [ref=e58]: 4 claims
              - generic [ref=e59]: /
              - generic [ref=e60]: depth 3
          - generic [ref=e62]:
            - generic [ref=e65]: Investigating
            - generic [ref=e67]: ↑ Pro
            - generic [ref=e68]: Structured debate helps people compare ordinary reasons without losing context.
            - generic [ref=e69]:
              - button "⚐ Challenge" [ref=e70] [cursor=pointer]
              - button "Read ▼" [ref=e71] [cursor=pointer]:
                - text: Read
                - generic [ref=e72]: ▼
          - generic [ref=e74]:
            - generic [ref=e76]: ↓ Con
            - generic [ref=e77]: Careful dissent can expose hidden assumptions before a decision becomes costly.
            - generic [ref=e78]:
              - button "⚐ Challenge" [ref=e79] [cursor=pointer]
              - button "Read ▼" [ref=e80] [cursor=pointer]:
                - text: Read
                - generic [ref=e81]: ▼
          - generic [ref=e83]:
            - generic [ref=e85]: ◆ Evidence
            - generic [ref=e86]: Concrete evidence improves collective decisions when reasons remain visible.
            - generic [ref=e87]:
              - button "⚐ Challenge" [ref=e88] [cursor=pointer]
              - button "Read ▼" [ref=e89] [cursor=pointer]:
                - text: Read
                - generic [ref=e90]: ▼
          - generic [ref=e92]:
            - generic [ref=e94]: ◆ Practical
            - generic [ref=e95]: A second practical branch keeps comparison broad and tests responsive packing.
            - generic [ref=e96]:
              - button "⚐ Challenge" [ref=e97] [cursor=pointer]
              - button "Read ▼" [ref=e98] [cursor=pointer]:
                - text: Read
                - generic [ref=e99]: ▼
      - group "Canvas zoom controls" [ref=e100]:
        - button "Zoom in" [ref=e101] [cursor=pointer]: +
        - button "Zoom out" [ref=e102] [cursor=pointer]: −
        - button "Fit whole tree (overview)" [ref=e103] [cursor=pointer]: Fit
        - button "Reset zoom to 1:1" [ref=e104] [cursor=pointer]: 1:1
        - status [ref=e105]: 100%
    - status [ref=e106]: Exported debate.md
    - generic [ref=e109]:
      - textbox "User token" [ref=e110]
      - button "Unlock" [ref=e111] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e117] [cursor=pointer]:
    - img [ref=e118]
  - alert [ref=e121]
```

# Test source

```ts
  376 |   await scoring.locator("summary").click();
  377 |   await expect(scoring).not.toHaveAttribute("open", "");
  378 | 
  379 |   await page.getByRole("button", { name: "Tree", exact: true }).click();
  380 |   const canvas = page.locator(".canvas");
  381 |   await expect(canvas).toHaveAttribute("data-fit-policy", "column-auto");
  382 |   const columnFit = Number(await canvas.getAttribute("data-zoom"));
  383 |   expect(columnFit).toBeGreaterThanOrEqual(0.5);
  384 |   expect(columnFit).toBeLessThanOrEqual(1);
  385 | 
  386 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  387 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
  388 | 
  389 |   await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  390 |   await expect(canvas).toHaveAttribute("data-fit-policy", "overview-auto");
  391 |   await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");
  392 | 
  393 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  394 |   for (let index = 0; index < 24; index += 1) {
  395 |     await page.getByRole("button", { name: "Zoom out" }).click();
  396 |   }
  397 |   await expect(canvas).toHaveAttribute("data-zoom", "0.1000");
  398 | 
  399 |   for (let index = 0; index < 24; index += 1) {
  400 |     await page.getByRole("button", { name: "Zoom in" }).click();
  401 |   }
  402 |   await expect(canvas).toHaveAttribute("data-zoom", "2.0000");
  403 | 
  404 |   await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  405 |   const card = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  406 |   await card.click();
  407 |   await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
  408 |   await expect(page.getByRole("dialog")).toHaveCount(0);
  409 | });
  410 | 
  411 | test("overlays and collision union cover dock, zoom, toast, synthesis, and expanded dock", async ({
  412 |   page
  413 | }, testInfo) => {
  414 |   await openCompleteDebate(page);
  415 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  416 | 
  417 |   const collapsed = await visibleRects(page);
  418 |   expect(collapsed.dock).not.toBeNull();
  419 |   expect(collapsed.zoom).not.toBeNull();
  420 |   expect(collapsed.synthesis).not.toBeNull();
  421 |   expect.soft(intersects(collapsed.dock!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  422 |   expect.soft(intersects(collapsed.synthesis!, collapsed.dock!), JSON.stringify(collapsed)).toBe(false);
  423 |   expect.soft(intersects(collapsed.synthesis!, collapsed.zoom!), JSON.stringify(collapsed)).toBe(false);
  424 | 
  425 |   const node = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  426 |   await node.click();
  427 |   const argumentDetail = page.getByRole("dialog", { name: "Argument detail" });
  428 |   await expect(argumentDetail).toBeVisible();
  429 |   await argumentDetail.getByRole("button", { name: /Challenge/ }).click();
  430 |   await expect(page.locator(".popCard")).toBeVisible();
  431 |   await page.locator(".popAction").first().click();
  432 |   await closeDialog(page, "Investigation");
  433 | 
  434 |   await openVisibleOverflowAction(page, "button", "Workspace");
  435 |   await closeDialog(page, "Workspace artifacts");
  436 | 
  437 |   await page.getByRole("button", { name: "Open scoring diagnostics" }).click();
  438 |   await closeDialog(page, "Scoring diagnostics");
  439 | 
  440 |   await openVisibleOverflowAction(page, "button", "How it works");
  441 |   await expect(page.getByRole("dialog")).toBeVisible();
  442 |   await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  443 | 
  444 |   await page.getByRole("button", { name: "Open synthesis and verdict" }).click();
  445 |   const synthesisPanel = page.locator('.synthPanel[data-sheet-state="expanded"]');
  446 |   await expect(synthesisPanel).toBeVisible();
  447 |   const synthesisBox = await synthesisPanel.boundingBox();
  448 |   const viewport = page.viewportSize();
  449 |   expect(synthesisBox).not.toBeNull();
  450 |   expect(viewport).not.toBeNull();
  451 |   expect(synthesisBox!.x).toBeGreaterThanOrEqual(-1);
  452 |   expect(synthesisBox!.x + synthesisBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
  453 |   if (viewport!.width <= 768) {
  454 |     expect(synthesisBox!.height).toBeLessThanOrEqual(viewport!.height * 0.7 + 2);
  455 |   }
  456 |   await synthesisPanel.getByRole("button", { name: "Close synthesis and verdict" }).click();
  457 | 
  458 |   const exportAction = page.locator('a[aria-label="Export"]:visible').first();
  459 |   if (!(await exportAction.count())) {
  460 |     await page.getByRole("button", { name: "More debate actions" }).click();
  461 |   }
  462 |   await page.locator('a[aria-label="Export"]:visible').first().evaluate((element) => {
  463 |     element.addEventListener("click", (event) => event.preventDefault(), { once: true });
  464 |     (element as HTMLElement).click();
  465 |   });
  466 |   await expect(page.locator(".toast")).toContainText("Exported debate.md");
  467 | 
  468 |   await page.getByRole("button", { name: /Unlock actions/ }).click();
  469 |   await expect(page.getByLabel("User token")).toBeVisible();
  470 |   await expect(page.locator("[data-synth-tab]")).toBeHidden();
  471 | 
  472 |   const expanded = await visibleRects(page);
  473 |   expect(expanded.dock).not.toBeNull();
  474 |   expect(expanded.zoom).not.toBeNull();
  475 |   expect(expanded.toast).not.toBeNull();
> 476 |   expect.soft(expanded.synthesis, JSON.stringify(expanded)).toBeNull();
      |                                                             ^ Error: {"dock":{"left":41.09375,"right":302,"top":848,"bottom":882},"zoom":{"left":256,"right":308,"top":432,"bottom":660},"toast":{"left":80,"right":240,"top":104,"bottom":158},"synthesis":{"left":14,"right":122,"top":846,"bottom":882}}
  477 |   expect.soft(intersects(expanded.dock!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  478 |   expect.soft(intersects(expanded.toast!, expanded.dock!), JSON.stringify(expanded)).toBe(false);
  479 |   expect.soft(intersects(expanded.toast!, expanded.zoom!), JSON.stringify(expanded)).toBe(false);
  480 | 
  481 |   await mkdir(screenshotDir, { recursive: true });
  482 |   await page.screenshot({
  483 |     path: resolve(screenshotDir, `${testInfo.project.name.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}.png`),
  484 |     fullPage: false,
  485 |     animations: "disabled"
  486 |   });
  487 | });
  488 | 
  489 | test("safe-area support is structurally wired without claiming non-zero emulated insets", async ({ page }) => {
  490 |   const webRoot = resolve(__dirname, "../..");
  491 |   const layout = readFileSync(resolve(webRoot, "app/layout.tsx"), "utf8");
  492 |   const baseCss = readFileSync(resolve(webRoot, "styles/base.css"), "utf8");
  493 |   const debateCss = readFileSync(resolve(webRoot, "styles/debate-chrome.css"), "utf8");
  494 |   const drawersCss = readFileSync(resolve(webRoot, "styles/drawers.css"), "utf8");
  495 | 
  496 |   expect(layout).toMatch(/viewportFit:\s*["']cover["']/);
  497 |   expect(baseCss).toContain("env(safe-area-inset-bottom, 0px)");
  498 |   expect(debateCss).toContain("env(safe-area-inset-bottom, 0px)");
  499 |   for (const side of ["top", "right", "bottom", "left"]) {
  500 |     expect(drawersCss).toContain(`env(safe-area-inset-${side}, 0px)`);
  501 |   }
  502 | 
  503 |   await page.goto("/debate/s8-complete", { waitUntil: "domcontentloaded" });
  504 |   const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
  505 |   expect(viewportMeta).toContain("viewport-fit=cover");
  506 |   await expectNoHorizontalOverflow(page);
  507 | });
  508 | 
  509 | test("320/375-class cells have no ordinary-English mid-word breaks across library and debate views", async ({
  510 |   page
  511 | }, testInfo) => {
  512 |   const width = page.viewportSize()?.width ?? 0;
  513 |   test.skip(![320, 375].includes(width), `mid-word detector applies only at 320/375; project=${testInfo.project.name}`);
  514 | 
  515 |   async function expectClaimsFit(selector: string) {
  516 |     const claims = page.locator(selector);
  517 |     expect(await claims.count(), `${selector} must exist`).toBeGreaterThan(0);
  518 |     const metrics = await claims.evaluateAll((elements) =>
  519 |       elements.map((claim) => {
  520 |         const element = claim as HTMLElement;
  521 |         const previousOverflowWrap = element.style.overflowWrap;
  522 |         const previousWordBreak = element.style.wordBreak;
  523 |         element.style.overflowWrap = "normal";
  524 |         element.style.wordBreak = "normal";
  525 |         const style = getComputedStyle(element);
  526 |         const rect = element.getBoundingClientRect();
  527 |         const contentWidth =
  528 |           rect.width -
  529 |           Number.parseFloat(style.paddingLeft) -
  530 |           Number.parseFloat(style.paddingRight) -
  531 |           Number.parseFloat(style.borderLeftWidth) -
  532 |           Number.parseFloat(style.borderRightWidth);
  533 |         const probe = document.createElement("span");
  534 |         probe.textContent = "000000000000";
  535 |         probe.style.position = "absolute";
  536 |         probe.style.visibility = "hidden";
  537 |         probe.style.whiteSpace = "nowrap";
  538 |         probe.style.fontFamily = style.fontFamily;
  539 |         probe.style.fontSize = style.fontSize;
  540 |         probe.style.fontWeight = style.fontWeight;
  541 |         probe.style.letterSpacing = style.letterSpacing;
  542 |         document.body.append(probe);
  543 |         const twelveCh = probe.getBoundingClientRect().width;
  544 |         probe.remove();
  545 |         const result = {
  546 |           text: element.textContent,
  547 |           contentWidth,
  548 |           twelveCh,
  549 |           clientWidth: element.clientWidth,
  550 |           scrollWidth: element.scrollWidth
  551 |         };
  552 |         element.style.overflowWrap = previousOverflowWrap;
  553 |         element.style.wordBreak = previousWordBreak;
  554 |         return result;
  555 |       })
  556 |     );
  557 |     for (const metric of metrics) {
  558 |       expect.soft(metric.scrollWidth, JSON.stringify(metric)).toBeLessThanOrEqual(metric.clientWidth + 1);
  559 |       expect.soft(metric.contentWidth, JSON.stringify(metric)).toBeGreaterThanOrEqual(metric.twelveCh - 1);
  560 |     }
  561 |   }
  562 | 
  563 |   await setLibraryState(page, "populated");
  564 |   await page.goto("/", { waitUntil: "domcontentloaded" });
  565 |   await expectClaimsFit(".debateCardClaim");
  566 | 
  567 |   await openCompleteDebate(page);
  568 |   await page.getByRole("button", { name: "Thread", exact: true }).click();
  569 |   await expectClaimsFit(".threadClaim");
  570 | 
  571 |   await page.getByRole("button", { name: "Split", exact: true }).click();
  572 |   await expectClaimsFit(".splitCardClaim");
  573 | 
  574 |   await page.getByRole("button", { name: "Tree", exact: true }).click();
  575 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  576 |   await expectClaimsFit(".nodeClaim");
```