# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> debate route covers connecting, generating, completed, error, no-tree, and single-shot
- Location: tests\s8-closure\acceptance-matrix.spec.ts:329:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.progressStrip')
Expected: visible
Error: strict mode violation: locator('.progressStrip') resolved to 5 elements:
    1) <section class="progressStrip" aria-label="Scoring visibility state" data-scoring-visibility-kind="scores">…</section> aka getByLabel('Scoring visibility state')
    2) <section class="progressStrip" aria-label="Scoring issue summary">…</section> aka getByLabel('Scoring issue summary')
    ...

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.progressStrip')

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
            - generic [ref=e10]: Dialectical Engine
            - generic [ref=e11]: dezbatere.ro
        - generic [ref=e12]:
          - generic [ref=e13]: Responsive evidence should remain readable across every supported viewport
          - generic [ref=e14]: Generating
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
            - /url: http://127.0.0.1:8118/api/debates/s8-generating/export.md
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
      - generic [ref=e47]: Models arguing
      - generic [ref=e50]: 67%
    - generic [ref=e51]:
      - generic [ref=e53]:
        - generic [ref=e54]:
          - generic [ref=e55]:
            - checkbox "Show set-aside paths" [checked] [ref=e56]
            - text: Show set-aside paths
          - generic [ref=e58]:
            - img
            - generic [ref=e60]:
              - generic [ref=e61]: Root claim
              - generic [ref=e62]: Public decisions improve when communities examine reasons together.
              - generic [ref=e63]:
                - generic [ref=e64]: 3 claims
                - generic [ref=e65]: /
                - generic [ref=e66]: depth 3
            - generic [ref=e68]:
              - generic [ref=e69]:
                - generic [ref=e70]: ↑ Pro
                - generic [ref=e71]: GPT
              - generic [ref=e73]: Structured debate helps people compare
            - generic [ref=e76]:
              - generic [ref=e78]: ↓ Con
              - generic [ref=e79]: Careful dissent can expose hidden assumptions before a decision becomes costly.
              - generic [ref=e80]:
                - button "⚐ Challenge" [ref=e81] [cursor=pointer]
                - button "Read ▼" [ref=e82] [cursor=pointer]:
                  - text: Read
                  - generic [ref=e83]: ▼
            - generic [ref=e85]:
              - generic [ref=e87]: ◆ Evidence
              - generic [ref=e88]: Concrete evidence improves collective decisions when reasons remain visible.
              - generic [ref=e89]:
                - button "⚐ Challenge" [ref=e90] [cursor=pointer]
                - button "Read ▼" [ref=e91] [cursor=pointer]:
                  - text: Read
                  - generic [ref=e92]: ▼
        - group "Canvas zoom controls" [ref=e93]:
          - button "Zoom in" [ref=e94] [cursor=pointer]: +
          - button "Zoom out" [ref=e95] [cursor=pointer]: −
          - button "Fit whole tree (overview)" [ref=e96] [cursor=pointer]: Fit
          - button "Reset zoom to 1:1" [ref=e97] [cursor=pointer]: 1:1
          - status [ref=e98]: 100%
      - complementary "Synthesis" [ref=e99]:
        - generic [ref=e100]:
          - generic [ref=e103]: Synthesis
          - generic [ref=e104]: The strongest case on each side, plus a verdict.
          - generic [ref=e109]: Synthesis runs once the tree completes…
    - button "🔒 Unlock actions" [ref=e111] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e117] [cursor=pointer]:
    - img [ref=e118]
  - alert [ref=e122]
```

# Test source

```ts
  237 |   await setLibraryState(page, "empty");
  238 |   await clearToken(page);
  239 |   await page.goto("/", { waitUntil: "domcontentloaded" });
  240 |   await expect(page.locator(".emptyState")).toContainText("No debates yet");
  241 |   await expectNoHorizontalOverflow(page);
  242 | 
  243 |   await setLibraryState(page, "populated");
  244 |   await page.goto("/", { waitUntil: "domcontentloaded" });
  245 |   await expect(page.locator(".debateCard")).toHaveCount(1);
  246 |   await expect(page.locator(".debateCardClaim")).toContainText("Public decisions improve");
  247 |   await expectNoHorizontalOverflow(page, ".screenInner");
  248 | 
  249 |   await setLibraryState(page, "error");
  250 |   await page.goto("/", { waitUntil: "domcontentloaded" });
  251 |   await expect(page.locator(".error")).toContainText("intentionally unreachable");
  252 |   await expectNoHorizontalOverflow(page);
  253 | 
  254 |   await setLibraryState(page, "empty");
  255 |   await page.goto("/", { waitUntil: "domcontentloaded" });
  256 |   await page.waitForLoadState("networkidle");
  257 |   const composer = page.getByLabel("Debate claim");
  258 |   await composer.focus();
  259 |   await expect(composer).toBeFocused();
  260 |   await composer.fill("Ordinary reasons should stay visible during careful debate");
  261 |   const start = page.getByRole("button", { name: /^Start/ });
  262 |   await expect(start).toBeEnabled();
  263 |   await start.click();
  264 |   await expect(page).toHaveURL(/\/new\?topic=/);
  265 |   await expect(page.getByLabel("User token")).toBeVisible();
  266 |   await expectNoHorizontalOverflow(page);
  267 | });
  268 | 
  269 | test("protected routes cover AuthGate and route lifecycle states", async ({ page }) => {
  270 |   for (const route of protectedRoutes) {
  271 |     await expectProtectedShellAuthStates(page, route.path, route.heading);
  272 | 
  273 |     if (route.path === "/new") {
  274 |       await expect(page.getByLabel("Topic")).toBeVisible();
  275 |       await page.getByRole("button", { name: /Options/ }).click();
  276 |       await expect(page.locator(".optionsPanel")).toBeVisible();
  277 |       await page.getByLabel("Topic").fill("A valid responsive debate topic");
  278 |       await page.getByLabel("Role overrides JSON").fill("{invalid");
  279 |       await page.getByRole("button", { name: /Start debate/ }).click();
  280 |       await expect(page.locator(".error")).toBeVisible();
  281 | 
  282 |       await page.getByLabel("Role overrides JSON").fill("");
  283 |       await page.route("**/api/debates", async (request) => {
  284 |         if (request.request().method() !== "POST") {
  285 |           await request.continue();
  286 |           return;
  287 |         }
  288 |         await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  289 |         await fulfillJson(request, { id: "s8-complete" }, 201);
  290 |       });
  291 |       await page.getByRole("button", { name: /Start debate/ }).click();
  292 |       await expect(page.getByRole("button", { name: /Starting/ })).toBeDisabled();
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
> 337 |   await expect(page.locator(".progressStrip")).toBeVisible();
      |                                                ^ Error: expect(locator).toBeVisible() failed
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
```