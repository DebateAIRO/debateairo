import { expect, test, type Locator, type Page } from "@playwright/test";

const debateId = "s3-mobile";

const debateFixture = {
  id: debateId,
  topic: "A deliberately long debate title must ellipsize without displacing controls",
  status: "complete",
  config: {},
  direct_answer: null,
  root_node_id: "root",
  synthesis_id: null,
  created_at: "2026-07-25T00:00:00Z",
  completed_at: "2026-07-25T00:01:00Z",
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
    children: []
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
  node_count: 1
};

async function installCoordinatorRoutes(page: Page) {
  await page.route(`**/api/debates/${debateId}/events`, (route) => route.abort());
  await page.route(`**/api/debates/${debateId}/scoring/adaptive-depth/dry-run`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Unavailable in the isolated viewport fixture" })
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

test("all view controls and scoring diagnostics stay visible and clickable at phone widths", async ({
  page
}, testInfo) => {
  const viewportWidth = Number(testInfo.project.name.replace("chromium-", ""));
  await installCoordinatorRoutes(page);
  await page.goto(`/debate/${debateId}`, { waitUntil: "domcontentloaded" });

  const viewNames = ["Thread", "Split", "Tree", "Map"] as const;
  for (const viewName of viewNames) {
    const button = page.getByRole("button", { name: viewName, exact: true });
    await expectFullyVisibleTapTarget(button, viewportWidth);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }

  const diagnostics = page.getByRole("button", { name: "Open scoring diagnostics" });
  await expectFullyVisibleTapTarget(diagnostics, viewportWidth);
  await diagnostics.click();
  await expect(page.getByRole("dialog", { name: "Scoring diagnostics" })).toBeVisible();

  const mobileStatus = page.locator('[data-mobile-scoring-status="true"]');
  await expect(mobileStatus).toBeVisible();
  await expect(mobileStatus).toContainText("No independent judge is configured");
  await expect(page.locator(".topSwitchStatus")).toBeHidden();
});

test("phone header uses icon branding and the secondary-action overflow", async ({ page }) => {
  await installCoordinatorRoutes(page);
  await page.goto(`/debate/${debateId}`, { waitUntil: "domcontentloaded" });

  await expect(page.locator(".debateTopIdentityRow .brandName")).toBeHidden();
  await expect(page.locator(".debateTopIdentityRow .brandDomain")).toBeHidden();

  const moreActions = page.getByRole("button", { name: "More debate actions" });
  await expect(moreActions).toBeVisible();
  await moreActions.click();
  await expect(page.getByRole("button", { name: "Workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export debate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How it works" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
});
