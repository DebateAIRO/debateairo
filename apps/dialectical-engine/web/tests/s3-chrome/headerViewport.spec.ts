import { expect, test, type Locator, type Page } from "@playwright/test";

const debateId = "s3-responsive-chrome";

const debateFixture = {
  id: debateId,
  topic: "A deliberately long debate title must ellipsize without displacing controls",
  status: "complete",
  config: {},
  direct_answer: null,
  root_node_id: "root",
  synthesis_id: null,
  created_at: "2026-07-26T00:00:00Z",
  completed_at: "2026-07-26T00:01:00Z",
  tree: {
    id: "root",
    debate_id: debateId,
    parent_id: null,
    node_type: "ROOT_CLAIM",
    depth: 0,
    position: 0,
    claim: "Responsive controls remain usable",
    status: "complete",
    materialized_path: "root",
    active_generation_id: null,
    active_generation: null,
    children: [
      {
        id: "short-height-card",
        debate_id: debateId,
        parent_id: "root",
        node_type: "PRO",
        depth: 1,
        position: 0,
        claim: "Short-height tree cards remain clickable",
        status: "complete",
        materialized_path: "root/pro",
        active_generation_id: null,
        active_generation: null,
        children: []
      }
    ]
  },
  scoring: null,
  synthesis: null,
  active_synthesis: null,
  branch_lineage: [],
  analyzer_runs: [{ id: "analysis-1" }],
  verdict: undefined,
  selected_skills: [],
  selected_agents: [],
  agent_outputs: [],
  agent_runs: [],
  skills_used: [],
  provenance_records: [],
  workers: [],
  models: [],
  node_count: 2
};

async function installCoordinatorRoutes(page: Page) {
  await page.route(`**/api/debates/${debateId}/events`, (route) => route.abort());
  await page.route(`**/api/debates/${debateId}/scoring/adaptive-depth/dry-run`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Unavailable in the isolated S3 viewport fixture" })
    })
  );
  await page.route(`**/api/debates/${debateId}/scoring`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        debate_id: debateId,
        status: "unavailable",
        node_ids: ["root"],
        items: [],
        reason: "No independent judge is configured"
      })
    })
  );
  await page.route(`**/api/debates/${debateId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(debateFixture)
    })
  );
}

async function expectFullyVisibleTapTarget(locator: Locator, viewportWidth: number) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
}

async function shortHeightGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box
        ? {
            x: Math.round(box.x * 100) / 100,
            y: Math.round(box.y * 100) / 100,
            width: Math.round(box.width * 100) / 100,
            height: Math.round(box.height * 100) / 100,
            bottom: Math.round(box.bottom * 100) / 100
          }
        : null;
    };

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      header: rect(".debateTopBar"),
      insights: rect(".scoringInsightsPanel"),
      main: rect(".debateMain"),
      thread: rect(".thread"),
      card: rect(".node")
    };
  });
}

test.beforeEach(async ({ page }) => {
  await installCoordinatorRoutes(page);
  await page.goto(`/debate/${debateId}`, { waitUntil: "domcontentloaded" });
});

test("@phone phone header uses two rows with ellipsized identity content", async ({ page }) => {
  const identityRow = page.locator(".debateTopIdentityRow");
  const controlRow = page.locator(".debateTopControlRow");
  const identityBox = await identityRow.boundingBox();
  const controlBox = await controlRow.boundingBox();

  expect(identityBox).not.toBeNull();
  expect(controlBox).not.toBeNull();
  expect(identityBox!.y + identityBox!.height).toBeLessThanOrEqual(controlBox!.y);
  await expect(page.locator(".debateTopIdentityRow .brandText")).toBeHidden();
  await expect(page.locator(".debateTopTitle")).toHaveCSS("text-overflow", "ellipsis");
});

test("@phone all view controls and scoring diagnostics are visible and clickable at phone widths", async ({
  page
}, testInfo) => {
  const viewportWidth = Number(testInfo.project.name.replace("chromium-", ""));

  for (const viewName of ["Thread", "Split", "Tree", "Map"] as const) {
    const button = page.getByRole("button", { name: viewName, exact: true });
    await expectFullyVisibleTapTarget(button, viewportWidth);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }

  const diagnostics = page.getByRole("button", { name: "Open scoring diagnostics" });
  await expectFullyVisibleTapTarget(diagnostics, viewportWidth);
  await diagnostics.click();
  await expect(page.getByRole("dialog", { name: "Scoring diagnostics" })).toBeVisible();
});

test("@phone scoring status is visible in the insights strip instead of the header", async ({ page }) => {
  const mobileStatus = page.locator('[data-mobile-scoring-status="true"]');

  await expect(mobileStatus).toBeVisible();
  await expect(mobileStatus).toContainText("No independent judge is configured");
  await expect(page.locator(".topSwitch")).not.toContainText("No independent judge is configured");
});

test("@phone overflow keeps every desktop action reachable on phones", async ({ page }, testInfo) => {
  const viewportWidth = Number(testInfo.project.name.replace("chromium-", ""));
  const moreActions = page.getByRole("button", { name: "More debate actions" });

  await expectFullyVisibleTapTarget(moreActions, viewportWidth);
  await moreActions.click();
  await expect(page.locator(".debateOverflow")).toHaveAttribute("open", "");

  await expect(page.getByRole("link", { name: "Library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How it works" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
});

test("@wide actions stay inline above the phone overflow breakpoint", async ({ page }, testInfo) => {
  const viewportWidth = Number(testInfo.project.name.replace("chromium-", ""));
  const identityBox = await page.locator(".debateTopIdentityRow").boundingBox();
  const controlBox = await page.locator(".debateTopControlRow").boundingBox();

  await expect(page.getByRole("button", { name: "More debate actions" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How it works" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

  expect(identityBox).not.toBeNull();
  expect(controlBox).not.toBeNull();
  if (viewportWidth <= 920) {
    expect(identityBox!.y + identityBox!.height).toBeLessThanOrEqual(controlBox!.y);
  } else {
    expect(identityBox!.y).toBeLessThan(controlBox!.y + controlBox!.height);
    expect(controlBox!.y).toBeLessThan(identityBox!.y + identityBox!.height);
  }
});

test("@short selected views retain a visible interaction surface at 568x320", async ({ page }, testInfo) => {
  const threadButton = page.getByRole("button", { name: "Thread", exact: true });

  await threadButton.click();
  await expect(threadButton).toHaveAttribute("aria-pressed", "true");
  console.log(`F02 ${testInfo.project.name} thread geometry ${JSON.stringify(await shortHeightGeometry(page))}`);

  const thread = page.locator(".thread");
  await expect(thread).toBeVisible();
  const threadBox = await thread.boundingBox();
  expect(threadBox).not.toBeNull();
  expect(threadBox!.height).toBeGreaterThanOrEqual(44);
});

test("@short scoring insights do not intercept tree-card clicks at 568x320", async ({ page }, testInfo) => {
  const treeCard = page.locator(".node").filter({ hasText: "Short-height tree cards remain clickable" });

  await expect(treeCard).toBeVisible();
  console.log(`F02 ${testInfo.project.name} tree geometry ${JSON.stringify(await shortHeightGeometry(page))}`);
  await treeCard.click({ timeout: 3_000 });
  await expect(page.getByRole("dialog", { name: "Argument detail" })).toBeVisible();
});
