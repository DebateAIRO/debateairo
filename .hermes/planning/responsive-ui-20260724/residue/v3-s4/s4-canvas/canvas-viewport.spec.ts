import { expect, test, type Page } from "@playwright/test";

const generation = {
  id: "generation",
  model_id: "test-model",
  role: "argument",
  argument: "A fully rendered argument used for viewport geometry.",
  worker_id: "test-worker",
  created_at: "2026-07-25T00:00:00Z"
};

function node(id: string, parentId: string | null, depth: number, position: number, claim: string, children = []) {
  return {
    id,
    debate_id: "s4-fixture",
    parent_id: parentId,
    node_type: parentId === null ? "ROOT_CLAIM" : position % 2 ? "PRO" : "CON",
    depth,
    position,
    claim,
    status: "complete",
    materialized_path: id,
    active_generation_id: generation.id,
    active_generation: generation,
    children
  };
}

const deepLeaf = node("node-depth-3", "node-depth-2", 3, 1, "A depth-three claim");
const depthTwo = node("node-depth-2", "node-a", 2, 2, "A depth-two claim", [deepLeaf]);
const childA = node("node-a", "root", 1, 1, "Openable child argument", [depthTwo]);
const childB = node("node-b", "root", 1, 2, "Counterargument on the second branch");
const root = node("root", null, 0, 0, "The root claim remains measurable", [childA, childB]);

const debate = {
  id: "s4-fixture",
  topic: "S4 canvas viewport fixture",
  status: "complete",
  config: {},
  direct_answer: null,
  root_node_id: "root",
  synthesis_id: null,
  created_at: "2026-07-25T00:00:00Z",
  completed_at: "2026-07-25T00:01:00Z",
  tree: root,
  synthesis: null,
  active_synthesis: null,
  branch_lineage: [],
  analyzer_runs: [],
  selected_skills: [],
  selected_agents: [],
  agent_outputs: [],
  agent_runs: [],
  skills_used: [],
  provenance_records: [],
  workers: [],
  models: [],
  node_count: 5
};

const scoringUnavailable = {
  debate_id: "s4-fixture",
  status: "unavailable",
  node_ids: [],
  items: [],
  errors: [],
  pending: [],
  reason: "S4 browser fixture"
};

const adaptiveUnavailable = {
  debate_id: "s4-fixture",
  status: "unavailable",
  reason: "S4 browser fixture",
  plan: {
    policy: { mode: "fixed" },
    candidate_count: 0,
    expansion_count: 0,
    items: []
  }
};

async function openFixture(page: Page) {
  await page.route("**/api/debates/s4-fixture**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/events")) {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: ":\n\n" });
    } else if (pathname.endsWith("/scoring/adaptive-depth/dry-run")) {
      await route.fulfill({ status: 200, json: adaptiveUnavailable });
    } else if (pathname.endsWith("/scoring")) {
      await route.fulfill({ status: 200, json: scoringUnavailable });
    } else {
      await route.fulfill({ status: 200, json: debate });
    }
  });
  const response = await page.goto("/debate/s4-fixture", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  await expect(page.locator(".canvas")).toBeVisible();
  await expect(page.getByRole("group", { name: "Canvas zoom controls" })).toBeVisible();
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test.beforeEach(async ({ page }) => {
  await openFixture(page);
});

test("320/375 defaults to a readable column fit instead of an unusable unzoomed tree", async ({ page }) => {
  const canvas = page.locator(".canvas");
  const zoom = Number((await page.getByTestId("canvas-zoom-percent").textContent())?.replace("%", ""));
  const card = page.locator('[data-canvas-node-id="root"] .node');
  const canvasBox = await canvas.boundingBox();
  const cardBox = await card.boundingBox();

  expect(zoom).toBeGreaterThanOrEqual(50);
  expect(zoom).toBeLessThan(100);
  expect(canvasBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(cardBox!.width).toBeLessThanOrEqual(canvasBox!.width);
});

test("keeps offsetHeight stable while visual bounds scale and overview band toggles", async ({ page }) => {
  const card = page.locator('[data-canvas-node-id="root"] .node');
  const canvas = page.locator(".canvas");
  const before = await card.evaluate((element) => ({
    offsetHeight: (element as HTMLElement).offsetHeight,
    visualHeight: element.getBoundingClientRect().height
  }));

  await page.getByRole("button", { name: "Zoom in" }).click();
  const zoomed = await card.evaluate((element) => ({
    offsetHeight: (element as HTMLElement).offsetHeight,
    visualHeight: element.getBoundingClientRect().height
  }));
  expect(zoomed.offsetHeight).toBe(before.offsetHeight);
  expect(zoomed.visualHeight).toBeGreaterThan(before.visualHeight);

  await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  await expect(canvas).toHaveAttribute("data-zoom-band", "overview");
  const overviewOffsetHeight = await card.evaluate((element) => (element as HTMLElement).offsetHeight);
  expect(overviewOffsetHeight).toBe(before.offsetHeight);
});

test("drag pans without opening the argument drawer", async ({ page }) => {
  await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  const card = page.locator('[data-canvas-node-id="node-a"] .node');
  const box = await card.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - 60, box!.y + box!.height / 2 - 20, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByRole("dialog", { name: "Argument detail" })).toHaveCount(0);
});

test("overview tap zooms to 1:1 before the same tap opens the card", async ({ page }) => {
  const canvas = page.locator(".canvas");
  await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  await expect(canvas).toHaveAttribute("data-zoom-band", "overview");

  await page.locator('[data-canvas-node-id="node-a"] .node').click();

  await expect(page.getByTestId("canvas-zoom-percent")).toHaveText("100%");
  await expect(page.getByRole("dialog", { name: "Argument detail" })).toBeVisible();
});

test("zoom cluster never intersects the expanded dock in vertical or short-height horizontal mode", async ({
  page
}) => {
  for (const viewport of [
    { width: 320, height: 600, direction: "column" },
    { width: 640, height: 360, direction: "row" }
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const unlock = page.getByRole("button", { name: /Unlock actions/ });
    if (await unlock.isVisible()) await unlock.click();
    const cluster = page.locator(".canvasZoomCluster");
    const dock = page.locator(".tokenDock");
    await expect(page.getByLabel("User token")).toBeVisible();
    await expect(cluster).toHaveCSS("flex-direction", viewport.direction);
    const clusterBox = await cluster.boundingBox();
    const dockBox = await dock.boundingBox();

    expect(clusterBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(intersects(clusterBox!, dockBox!)).toBe(false);
  }
});
