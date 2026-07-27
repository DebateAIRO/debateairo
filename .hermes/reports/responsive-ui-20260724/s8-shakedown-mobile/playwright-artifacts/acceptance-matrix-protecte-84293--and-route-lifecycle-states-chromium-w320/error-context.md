# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: acceptance-matrix.spec.ts >> protected routes cover AuthGate and route lifecycle states
- Location: tests\s8-closure\acceptance-matrix.spec.ts:272:5

# Error details

```
Error: html overflowed horizontally: {"clientWidth":320,"scrollWidth":339,"offenders":[{"tag":"DIV","className":"topBarActions","left":200.96875,"right":339.359375,"width":138.390625},{"tag":"A","className":"iconBtn","left":307.359375,"right":339.359375,"width":32}]}

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 321
Received:    339
```

```
Error: html overflowed horizontally: {"clientWidth":320,"scrollWidth":339,"offenders":[{"tag":"DIV","className":"topBarActions","left":200.96875,"right":339.359375,"width":138.390625},{"tag":"A","className":"iconBtn","left":307.359375,"right":339.359375,"width":32}]}

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 321
Received:    339
```

```
Error: html overflowed horizontally: {"clientWidth":320,"scrollWidth":339,"offenders":[{"tag":"DIV","className":"topBarActions","left":200.96875,"right":339.359375,"width":138.390625},{"tag":"A","className":"iconBtn","left":307.359375,"right":339.359375,"width":32}]}

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 321
Received:    339
```

```
Error: html overflowed horizontally: {"clientWidth":320,"scrollWidth":339,"offenders":[{"tag":"DIV","className":"topBarActions","left":200.96875,"right":339.359375,"width":138.390625},{"tag":"A","className":"iconBtn","left":307.359375,"right":339.359375,"width":32}]}

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 321
Received:    339
```

```
Error: html overflowed horizontally: {"clientWidth":320,"scrollWidth":339,"offenders":[{"tag":"DIV","className":"topBarActions","left":200.96875,"right":339.359375,"width":138.390625},{"tag":"A","className":"iconBtn","left":307.359375,"right":339.359375,"width":32}]}

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 321
Received:    339
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - link "Dialectical Engine — home" [ref=e4] [cursor=pointer]:
        - /url: /
        - generic [ref=e7]:
          - generic [ref=e8]: Dialectical Engine
          - generic [ref=e9]: dezbatere.ro
      - generic [ref=e10]: Workers
      - generic [ref=e11]:
        - link "+ New debate" [ref=e12] [cursor=pointer]:
          - /url: /new
        - link "Settings" [ref=e13] [cursor=pointer]:
          - /url: /settings
          - text: ⚙
    - generic [ref=e15]:
      - generic [ref=e16]: Infrastructure
      - heading "Workers" [level=1] [ref=e17]
      - paragraph [ref=e18]: Live status, capabilities, current job, and heartbeat for every connected worker.
      - generic [ref=e19]:
        - generic [ref=e20]:
          - generic [ref=e21]: Online
          - generic [ref=e22]: "0"
        - generic [ref=e23]:
          - generic [ref=e24]: Degraded
          - generic [ref=e25]: "0"
        - generic [ref=e26]:
          - generic [ref=e27]: Offline
          - generic [ref=e28]: "0"
        - generic [ref=e29]:
          - generic [ref=e30]: Capabilities
          - generic [ref=e31]: "0"
        - generic [ref=e32]:
          - generic [ref=e33]: Refreshed
          - generic [ref=e34]: —
      - generic [ref=e35]: "{\"detail\":\"worker fixture error\"}"
      - generic [ref=e36]:
        - heading "Connected workers" [level=2] [ref=e37]
        - generic [ref=e38]: 0 total
      - generic [ref=e40]: No workers registered.
  - button "Open Next.js Dev Tools" [ref=e46] [cursor=pointer]:
    - img [ref=e47]
  - alert [ref=e50]
```

# Test source

```ts
  17  |   configured_models: ["gpt-5", "claude-opus-4.1"],
  18  |   enabled_models: ["gpt-5", "claude-opus-4.1"],
  19  |   grok_monthly_cap_usd: 25,
  20  |   grok_monthly_spend_usd: 3,
  21  |   model_monthly_caps_usd: {
  22  |     "gpt-5": 30,
  23  |     "claude-opus-4.1": 20
  24  |   },
  25  |   model_monthly_spend_usd: {
  26  |     "gpt-5": 4.25,
  27  |     "claude-opus-4.1": 2.5
  28  |   }
  29  | };
  30  | 
  31  | const workerPayload = {
  32  |   workers: [
  33  |     {
  34  |       id: "worker-1",
  35  |       name: "Responsive fixture worker",
  36  |       status: "online",
  37  |       capabilities: ["debate", "scoring"],
  38  |       current_job_id: null,
  39  |       last_seen: "2026-07-26T18:00:00Z"
  40  |     }
  41  |   ]
  42  | };
  43  | 
  44  | const protectedRoutes = [
  45  |   { path: "/new", heading: "What should we debate?" },
  46  |   { path: "/settings", heading: "Settings" },
  47  |   { path: "/admin/workers", heading: "Workers" }
  48  | ] as const;
  49  | 
  50  | function intersects(
  51  |   first: { left: number; right: number; top: number; bottom: number },
  52  |   second: { left: number; right: number; top: number; bottom: number }
  53  | ) {
  54  |   return (
  55  |     first.left < second.right &&
  56  |     first.right > second.left &&
  57  |     first.top < second.bottom &&
  58  |     first.bottom > second.top
  59  |   );
  60  | }
  61  | 
  62  | async function fulfillJson(route: Route, body: unknown, status = 200) {
  63  |   await route.fulfill({
  64  |     status,
  65  |     contentType: "application/json",
  66  |     body: JSON.stringify(body)
  67  |   });
  68  | }
  69  | 
  70  | async function setLibraryState(page: Page, state: "empty" | "populated" | "error") {
  71  |   const response = await page.request.get(`${mockURL}/control/library?state=${state}`);
  72  |   expect(response.ok()).toBe(true);
  73  | }
  74  | 
  75  | async function clearToken(page: Page) {
  76  |   await page.goto("/", { waitUntil: "domcontentloaded" });
  77  |   await page.waitForLoadState("networkidle");
  78  |   await page.evaluate(() => window.localStorage.removeItem("dialectical:userToken"));
  79  | }
  80  | 
  81  | async function setToken(page: Page, token = "s8-valid-token") {
  82  |   await page.goto("/", { waitUntil: "domcontentloaded" });
  83  |   await page.evaluate((value) => window.localStorage.setItem("dialectical:userToken", value), token);
  84  | }
  85  | 
  86  | async function expectNoHorizontalOverflow(page: Page, selector = "html") {
  87  |   const geometry = await page.locator(selector).evaluate((element) => {
  88  |     const root = element as HTMLElement;
  89  |     const rootRect = root.getBoundingClientRect();
  90  |     const offenders = Array.from(root.querySelectorAll<HTMLElement>("*"))
  91  |       .filter((candidate) => {
  92  |         const style = getComputedStyle(candidate);
  93  |         if (style.display === "none" || style.visibility === "hidden") return false;
  94  |         const rect = candidate.getBoundingClientRect();
  95  |         return rect.width > 0 && (rect.left < rootRect.left - 1 || rect.right > rootRect.right + 1);
  96  |       })
  97  |       .slice(0, 12)
  98  |       .map((candidate) => {
  99  |         const rect = candidate.getBoundingClientRect();
  100 |         return {
  101 |           tag: candidate.tagName,
  102 |           className: candidate.className,
  103 |           left: rect.left,
  104 |           right: rect.right,
  105 |           width: rect.width
  106 |         };
  107 |       });
  108 |     return {
  109 |       clientWidth: root.clientWidth,
  110 |       scrollWidth: root.scrollWidth,
  111 |       offenders
  112 |     };
  113 |   });
  114 |   expect.soft(
  115 |     geometry.scrollWidth,
  116 |     `${selector} overflowed horizontally: ${JSON.stringify(geometry)}`
> 117 |   ).toBeLessThanOrEqual(geometry.clientWidth + 1);
      |     ^ Error: html overflowed horizontally: {"clientWidth":320,"scrollWidth":339,"offenders":[{"tag":"DIV","className":"topBarActions","left":200.96875,"right":339.359375,"width":138.390625},{"tag":"A","className":"iconBtn","left":307.359375,"right":339.359375,"width":32}]}
  118 | }
  119 | 
  120 | async function expectFullyInsideViewport(locator: Locator, page: Page) {
  121 |   await expect(locator).toBeVisible();
  122 |   const box = await locator.boundingBox();
  123 |   const viewport = page.viewportSize();
  124 |   expect(box).not.toBeNull();
  125 |   expect(viewport).not.toBeNull();
  126 |   expect.soft(box!.x).toBeGreaterThanOrEqual(-1);
  127 |   expect.soft(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  128 |   expect.soft(box!.y).toBeGreaterThanOrEqual(-1);
  129 |   expect.soft(box!.y + Math.min(box!.height, viewport!.height)).toBeLessThanOrEqual(viewport!.height + 1);
  130 | }
  131 | 
  132 | async function expectProtectedShellAuthStates(
  133 |   page: Page,
  134 |   path: string,
  135 |   heading: string
  136 | ) {
  137 |   await clearToken(page);
  138 |   await page.goto(path, { waitUntil: "domcontentloaded" });
  139 |   await page.waitForLoadState("networkidle");
  140 |   await expect(page.getByRole("heading", { name: "Enter your user token" })).toBeVisible();
  141 |   await expectNoHorizontalOverflow(page);
  142 | 
  143 |   let releaseInvalid!: () => void;
  144 |   const invalidGate = new Promise<void>((resolveGate) => {
  145 |     releaseInvalid = resolveGate;
  146 |   });
  147 |   await page.route("**/api/settings", async (route) => {
  148 |     await invalidGate;
  149 |     await fulfillJson(route, { detail: "invalid token" }, 401);
  150 |   });
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
  213 |     const rect = (...selectors: string[]) => {
  214 |       for (const selector of selectors) {
  215 |         const element = document.querySelector<HTMLElement>(selector);
  216 |         if (!element) continue;
  217 |         const style = getComputedStyle(element);
```