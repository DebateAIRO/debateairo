# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> 320/375-class cells have no ordinary-English mid-word breaks across library and debate views
- Location: tests\s8-closure\acceptance-matrix.spec.ts:511:5

# Error details

```
Error: .debateCardClaim must exist

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - link "Dialectical Engine — home" [ref=e4] [cursor=pointer]:
      - /url: /
      - generic [ref=e7]:
        - generic [ref=e8]: Dialectical Engine
        - generic [ref=e9]: dezbatere.ro
    - generic [ref=e11]: Library
    - generic [ref=e12]:
      - link "+ New debate" [ref=e13] [cursor=pointer]:
        - /url: /new
      - link "Settings" [ref=e14] [cursor=pointer]:
        - /url: /settings
        - text: ⚙
  - generic [ref=e16]:
    - generic [ref=e17]: A reasoning instrument
    - heading "What should we debate?" [level=1] [ref=e18]
    - paragraph [ref=e19]: Post a claim. Several different AI models argue it out against each other in a structured tree — so you can see how the strongest case for and against actually holds up.
    - generic [ref=e20]:
      - generic [ref=e21]:
        - textbox "Debate claim" [ref=e22]:
          - /placeholder: e.g. Remote work should be the default for knowledge workers.
        - button "Start" [disabled] [ref=e23]:
          - text: Start
          - generic [ref=e24]: →
      - button "⚙ Advanced options — depth, branching, model roles" [ref=e25] [cursor=pointer]
    - generic [ref=e26]: Coordinator request timed out after 100ms
    - generic [ref=e27]:
      - heading "Recent debates" [level=2] [ref=e28]
      - generic [ref=e29]: 0 total
    - generic [ref=e31]: No debates yet — post the first claim above.
```

# Test source

```ts
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
> 519 |     expect(await claims.count(), `${selector} must exist`).toBeGreaterThan(0);
      |                                                            ^ Error: .debateCardClaim must exist
  520 |     const metrics = await claims.evaluateAll((elements) =>
  521 |       elements.map((claim) => {
  522 |         const element = claim as HTMLElement;
  523 |         const previousOverflowWrap = element.style.overflowWrap;
  524 |         const previousWordBreak = element.style.wordBreak;
  525 |         element.style.overflowWrap = "normal";
  526 |         element.style.wordBreak = "normal";
  527 |         const style = getComputedStyle(element);
  528 |         const rect = element.getBoundingClientRect();
  529 |         const contentWidth =
  530 |           rect.width -
  531 |           Number.parseFloat(style.paddingLeft) -
  532 |           Number.parseFloat(style.paddingRight) -
  533 |           Number.parseFloat(style.borderLeftWidth) -
  534 |           Number.parseFloat(style.borderRightWidth);
  535 |         const probe = document.createElement("span");
  536 |         probe.textContent = "000000000000";
  537 |         probe.style.position = "absolute";
  538 |         probe.style.visibility = "hidden";
  539 |         probe.style.whiteSpace = "nowrap";
  540 |         probe.style.fontFamily = style.fontFamily;
  541 |         probe.style.fontSize = style.fontSize;
  542 |         probe.style.fontWeight = style.fontWeight;
  543 |         probe.style.letterSpacing = style.letterSpacing;
  544 |         document.body.append(probe);
  545 |         const twelveCh = probe.getBoundingClientRect().width;
  546 |         probe.remove();
  547 |         const result = {
  548 |           text: element.textContent,
  549 |           contentWidth,
  550 |           twelveCh,
  551 |           clientWidth: element.clientWidth,
  552 |           scrollWidth: element.scrollWidth
  553 |         };
  554 |         element.style.overflowWrap = previousOverflowWrap;
  555 |         element.style.wordBreak = previousWordBreak;
  556 |         return result;
  557 |       })
  558 |     );
  559 |     for (const metric of metrics) {
  560 |       expect.soft(metric.scrollWidth, JSON.stringify(metric)).toBeLessThanOrEqual(metric.clientWidth + 1);
  561 |       expect.soft(metric.contentWidth, JSON.stringify(metric)).toBeGreaterThanOrEqual(metric.twelveCh - 1);
  562 |     }
  563 |   }
  564 | 
  565 |   await setLibraryState(page, "populated");
  566 |   await page.goto("/", { waitUntil: "domcontentloaded" });
  567 |   await expectClaimsFit(".debateCardClaim");
  568 | 
  569 |   await openCompleteDebate(page);
  570 |   await page.getByRole("button", { name: "Thread", exact: true }).click();
  571 |   await expectClaimsFit(".threadClaim");
  572 | 
  573 |   await page.getByRole("button", { name: "Split", exact: true }).click();
  574 |   await expectClaimsFit(".splitCardClaim");
  575 | 
  576 |   await page.getByRole("button", { name: "Tree", exact: true }).click();
  577 |   await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  578 |   await expectClaimsFit(".nodeClaim");
  579 | });
  580 | 
```