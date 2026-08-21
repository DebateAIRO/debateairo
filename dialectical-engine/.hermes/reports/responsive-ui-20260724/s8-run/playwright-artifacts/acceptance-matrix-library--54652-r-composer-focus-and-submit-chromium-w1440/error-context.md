# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> library route covers empty, populated, error, composer focus, and submit
- Location: tests\s8-closure\acceptance-matrix.spec.ts:236:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.error')
Expected substring: "intentionally unreachable"
Received string:    "Coordinator request timed out after 100ms"
Timeout: 10000ms

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for locator('.error')
    22 × locator resolved to <div class="error">Coordinator request timed out after 100ms</div>
       - unexpected value "Coordinator request timed out after 100ms"

```

```yaml
- text: Coordinator request timed out after 100ms
```

# Test source

```ts
  151 |   const tokenInput = page.getByLabel("User token");
  152 |   const unlock = page.locator('form button[type="submit"]');
  153 |   await tokenInput.fill("invalid-s8-token");
  154 |   await unlock.evaluate((button) => (button.closest("form") as HTMLFormElement).requestSubmit());
  155 |   await expect(unlock).toContainText("Checking");
  156 |   await expect(unlock).toBeDisabled();
  157 |   releaseInvalid();
  158 |   await expect(page.getByText("Token was rejected by the coordinator.")).toBeVisible();
  159 |   await page.unroute("**/api/settings");
  160 | 
  161 |   await page.evaluate(() => window.localStorage.setItem("dialectical:userToken", "s8-valid-token"));
  162 |   let releaseValid!: () => void;
  163 |   const validGate = new Promise<void>((resolveGate) => {
  164 |     releaseValid = resolveGate;
  165 |   });
  166 |   let firstSettingsRequest = true;
  167 |   await page.route("**/api/settings", async (route) => {
  168 |     if (firstSettingsRequest) {
  169 |       firstSettingsRequest = false;
  170 |       await validGate;
  171 |     }
  172 |     await fulfillJson(route, settingsPayload);
  173 |   });
  174 |   await page.reload({ waitUntil: "domcontentloaded" });
  175 |   await expect(page.getByText("Checking token…")).toBeVisible();
  176 |   releaseValid();
  177 |   await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  178 |   await page.unroute("**/api/settings");
  179 | }
  180 | 
  181 | async function openVisibleOverflowAction(page: Page, role: "button" | "link", name: string) {
  182 |   const direct = page.getByRole(role, { name, exact: true });
  183 |   for (let index = 0; index < (await direct.count()); index += 1) {
  184 |     if (await direct.nth(index).isVisible()) {
  185 |       await direct.nth(index).click();
  186 |       return;
  187 |     }
  188 |   }
  189 |   const overflow = page.getByRole("button", { name: "More debate actions" });
  190 |   if (await overflow.isVisible()) await overflow.click();
  191 |   const visible = page.locator(
  192 |     `${role === "button" ? "button" : "a"}[aria-label="${name}"]:visible`
  193 |   );
  194 |   await visible.first().click();
  195 | }
  196 | 
  197 | async function closeDialog(page: Page, name: string) {
  198 |   const dialog = page.getByRole("dialog", { name });
  199 |   await expect(dialog).toBeVisible();
  200 |   await dialog.getByRole("button", { name: "Close", exact: true }).click();
  201 |   await expect(dialog).toBeHidden();
  202 | }
  203 | 
  204 | async function openCompleteDebate(page: Page) {
  205 |   const response = await page.goto("/debate/s8-complete", { waitUntil: "domcontentloaded" });
  206 |   expect(response?.ok()).toBe(true);
  207 |   await expect(page.locator(".debateView")).toBeVisible();
  208 |   await expect(page.locator(".canvas")).toHaveAttribute("data-viewport-ready", "true");
  209 | }
  210 | 
  211 | async function visibleRects(page: Page) {
  212 |   return page.evaluate(() => {
  213 |     const rect = (selector: string) => {
  214 |       const element = document.querySelector<HTMLElement>(selector);
  215 |       if (!element) return null;
  216 |       const style = getComputedStyle(element);
  217 |       if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
  218 |       const value = element.getBoundingClientRect();
  219 |       if (value.width === 0 || value.height === 0) return null;
  220 |       return {
  221 |         left: value.left,
  222 |         right: value.right,
  223 |         top: value.top,
  224 |         bottom: value.bottom
  225 |       };
  226 |     };
  227 |     return {
  228 |       dock: rect(".tokenDock"),
  229 |       zoom: rect(".canvasZoomCluster"),
  230 |       toast: rect(".toast"),
  231 |       synthesis: rect("[data-synth-tab]")
  232 |     };
  233 |   });
  234 | }
  235 | 
  236 | test("library route covers empty, populated, error, composer focus, and submit", async ({ page }) => {
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
> 251 |   await expect(page.locator(".error")).toContainText("intentionally unreachable");
      |                                        ^ Error: expect(locator).toContainText(expected) failed
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
```