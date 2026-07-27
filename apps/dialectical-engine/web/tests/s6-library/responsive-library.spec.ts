import { expect, test, type Page, type Route } from "@playwright/test";

const protectedRoutes = [
  { path: "/new", heading: "What should we debate?" },
  { path: "/settings", heading: "Settings" },
  { path: "/admin/workers", heading: "Workers" }
] as const;

const topBarRoutes = ["/", ...protectedRoutes.map((route) => route.path)] as const;

const settingsPayload = {
  routing: {
    proposer: ["gpt-5"],
    opponent: ["claude-opus-4.1"]
  },
  configured_models: ["gpt-5", "claude-opus-4.1"],
  enabled_models: ["gpt-5", "claude-opus-4.1"],
  grok_monthly_cap_usd: 25,
  grok_monthly_spend_usd: 3,
  model_monthly_caps_usd: {
    "gpt-5": 30,
    "claude-opus-4.1": 20
  },
  model_monthly_spend_usd: {
    "gpt-5": 4.25,
    "claude-opus-4.1": 2.5
  }
};

const workerPayload = {
  workers: [
    {
      id: "worker-1",
      name: "Responsive fixture worker",
      status: "online",
      capabilities: ["debate", "scoring"],
      current_job_id: null,
      last_seen: new Date().toISOString()
    }
  ]
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

async function installStoredToken(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("dialectical:userToken", "s6-test-token");
  });
}

async function mockValidSettings(page: Page) {
  await page.route("**/api/settings", (route) => fulfillJson(route, settingsPayload));
}

test("global TopBar keeps every 320px shell inside the document", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-320", "The F-01 regression is specific to the 320px tier.");

  const shellGeometry = [];
  for (const path of topBarRoutes) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);
    await expect(page.locator(".topBar")).toHaveCount(1);

    shellGeometry.push(
      await page.evaluate((routePath) => {
        const actions = document.querySelector(".topBarActions")!.getBoundingClientRect();
        const settings = document.querySelector<HTMLAnchorElement>('.topBarActions a[href="/settings"]')!
          .getBoundingClientRect();
        return {
          path: routePath,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          actionsRight: actions.right,
          settingsRight: settings.right
        };
      }, path)
    );
  }

  expect.soft(
    shellGeometry.map(({ path, clientWidth, scrollWidth }) => ({ path, clientWidth, scrollWidth }))
  ).toEqual(topBarRoutes.map((path) => ({ path, clientWidth: 320, scrollWidth: 320 })));
  expect(
    shellGeometry.flatMap(({ path, actionsRight, settingsRight }) =>
      actionsRight <= 320 && settingsRight <= 320 ? [] : [{ path, actionsRight, settingsRight }]
    )
  ).toEqual([]);
});

test("library cards preserve a 12ch ordinary-English claim column without mid-word breaks", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);

  const ordinaryEnglish = "Evidence improves decisions when people examine reasons together";
  await page.locator(".recentList").evaluate((list, topic) => {
    list.innerHTML = `
      <a class="debateCard" href="#">
        <div class="debateCardBody">
          <div class="debateCardClaim">${topic}</div>
          <div class="debateCardMeta">
            <span>just now</span><span class="sep">·</span><span>5 models</span>
          </div>
        </div>
        <div class="modelStack" aria-hidden="true">
          <span class="modelDot"></span><span class="modelDot"></span><span class="modelDot"></span>
        </div>
        <div class="pill pillGen"><span class="dot"></span>generating</div>
        <span class="debateCardArrow" aria-hidden="true">→</span>
      </a>
    `;
  }, ordinaryEnglish);

  const metric = await page.locator(".debateCardClaim").evaluate((claim) => {
    const element = claim as HTMLElement;
    const previousOverflowWrap = element.style.overflowWrap;
    const previousWordBreak = element.style.wordBreak;
    element.style.overflowWrap = "normal";
    element.style.wordBreak = "normal";

    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const contentWidth =
      rect.width -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight) -
      Number.parseFloat(style.borderLeftWidth) -
      Number.parseFloat(style.borderRightWidth);
    const probe = document.createElement("span");
    probe.textContent = "000000000000";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "nowrap";
    probe.style.fontFamily = style.fontFamily;
    probe.style.fontSize = style.fontSize;
    probe.style.fontWeight = style.fontWeight;
    probe.style.letterSpacing = style.letterSpacing;
    document.body.append(probe);
    const twelveCh = probe.getBoundingClientRect().width;
    probe.remove();

    const result = {
      contentWidth,
      twelveCh,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    };
    element.style.overflowWrap = previousOverflowWrap;
    element.style.wordBreak = previousWordBreak;
    return result;
  });

  expect(metric.scrollWidth, "ordinary words fit after overflow-wrap:anywhere is neutralized").toBeLessThanOrEqual(
    metric.clientWidth + 1
  );
  expect(metric.contentWidth, "claim content box is at least 12ch").toBeGreaterThanOrEqual(metric.twelveCh - 1);

  const cardFlow = await page.locator(".debateCard").evaluate((card) => {
    const claim = card.querySelector(".debateCardClaim")!.getBoundingClientRect();
    const pill = card.querySelector(".pill")!.getBoundingClientRect();
    return {
      claimBottom: claim.bottom,
      pillTop: pill.top
    };
  });
  expect(cardFlow.pillTop, "the pill/meta band wraps below the claim at phone widths").toBeGreaterThanOrEqual(
    cardFlow.claimBottom
  );
});

test("settings model controls stay fully inside the model table and rows stack", async ({ page }) => {
  await installStoredToken(page);
  await mockValidSettings(page);

  const response = await page.goto("/settings", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  await expect(page.locator(".modelRow")).toHaveCount(2);

  const geometry = await page.locator(".modelTable").evaluate((table) => {
    const tableRect = table.getBoundingClientRect();
    return {
      rowDirections: Array.from(table.querySelectorAll(".modelRow")).map(
        (row) => getComputedStyle(row).flexDirection
      ),
      controls: Array.from(table.querySelectorAll(".capInput, .switch")).map((control) => {
        const rect = control.getBoundingClientRect();
        return {
          selector: control.className,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          inside:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.left >= tableRect.left - 1 &&
            rect.right <= tableRect.right + 1 &&
            rect.top >= tableRect.top - 1 &&
            rect.bottom <= tableRect.bottom + 1
        };
      })
    };
  });

  expect(geometry.rowDirections).toEqual(["column", "column"]);
  expect(geometry.controls.filter((control) => !control.inside)).toEqual([]);
});

test("new-debate option rows put labels above controls", async ({ page }) => {
  await installStoredToken(page);
  await mockValidSettings(page);

  await page.goto("/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Options/ }).click();

  const rows = page.locator(".optionRow");
  await expect(rows).toHaveCount(5);
  await expect
    .poll(() => rows.evaluateAll((items) => items.map((item) => getComputedStyle(item).flexDirection)))
    .toEqual(["column", "column", "column", "column", "column"]);

  const misplacedControls = await rows.evaluateAll((items) =>
    items.flatMap((item, index) => {
      const label = item.firstElementChild!.getBoundingClientRect();
      const control = item.querySelector(".optionControl")!.getBoundingClientRect();
      return control.top >= label.bottom - 1 ? [] : [{ index, labelBottom: label.bottom, controlTop: control.top }];
    })
  );
  expect(misplacedControls).toEqual([]);
});

test("small screens use the 32px by 16px screen padding tier", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const padding = await page.locator(".screenInner").evaluate((inner) => {
    const style = getComputedStyle(inner);
    return {
      top: Number.parseFloat(style.paddingTop),
      right: Number.parseFloat(style.paddingRight),
      bottom: Number.parseFloat(style.paddingBottom),
      left: Number.parseFloat(style.paddingLeft)
    };
  });

  expect(padding).toEqual({ top: 32, right: 16, bottom: 32, left: 16 });
});

test("admin metrics remain inside their grid at phone widths", async ({ page }) => {
  await installStoredToken(page);
  await mockValidSettings(page);
  await page.route("**/api/backends/status", (route) => fulfillJson(route, workerPayload));

  await page.goto("/admin/workers", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".workerMetrics .miniCard")).toHaveCount(5);

  const metrics = await page.locator(".workerMetrics").evaluate((grid) => {
    const gridRect = grid.getBoundingClientRect();
    const clippedCards = Array.from(grid.querySelectorAll(".miniCard")).flatMap((card, index) => {
      const rect = card.getBoundingClientRect();
      return rect.left >= gridRect.left - 1 && rect.right <= gridRect.right + 1
        ? []
        : [{ index, left: rect.left, right: rect.right, gridLeft: gridRect.left, gridRight: gridRect.right }];
    });
    return {
      scrollWidth: grid.scrollWidth,
      clientWidth: grid.clientWidth,
      clippedCards
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.clippedCards).toEqual([]);
});

for (const route of protectedRoutes) {
  test(`${route.path} exercises checking, locked, invalid-token, and submitting AuthGate states`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Enter your user token" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    let releaseRejectedRequest!: () => void;
    const rejectedRequestGate = new Promise<void>((resolve) => {
      releaseRejectedRequest = resolve;
    });
    await page.route("**/api/settings", async (request) => {
      await rejectedRequestGate;
      await fulfillJson(request, { detail: "invalid token" }, 401);
    });

    const unlockButton = page.locator('form button[type="submit"]');
    await page.getByLabel("User token").fill("invalid-s6-token");
    await expect(unlockButton).toHaveClass(/ready/);
    await unlockButton.click();
    await expect(unlockButton).toContainText("Checking");
    await expect(unlockButton).toBeDisabled();
    releaseRejectedRequest();
    await expect(page.getByText("Token was rejected by the coordinator.")).toBeVisible();

    await page.unroute("**/api/settings");
    await page.evaluate(() => {
      window.localStorage.setItem("dialectical:userToken", "valid-s6-token");
    });

    let releaseValidRequest!: () => void;
    const validRequestGate = new Promise<void>((resolve) => {
      releaseValidRequest = resolve;
    });
    await page.route("**/api/settings", async (request) => {
      await validRequestGate;
      await fulfillJson(request, settingsPayload);
    });
    if (route.path === "/admin/workers") {
      await page.route("**/api/backends/status", (request) => fulfillJson(request, workerPayload));
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Checking token…")).toBeVisible();
    releaseValidRequest();
    await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
  });
}
