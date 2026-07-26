import { expect, test, type Page } from "@playwright/test";

async function openCanvas(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const response = await page.goto("/debate/s4-fixture", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);

  const canvas = page.locator(".canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("group", { name: "Canvas zoom controls" })).toBeVisible();
  await expect(canvas).toHaveAttribute("data-viewport-ready", "true");
  return canvas;
}

async function boxIntersection(page: Page) {
  return page.evaluate(() => {
    const cluster = document.querySelector<HTMLElement>(".canvasZoomCluster")?.getBoundingClientRect();
    const dock = document.querySelector<HTMLElement>(".tokenDock")?.getBoundingClientRect();
    if (!cluster || !dock) throw new Error("Missing zoom cluster or token dock");
    return {
      cluster: {
        left: cluster.left,
        right: cluster.right,
        top: cluster.top,
        bottom: cluster.bottom
      },
      dock: {
        left: dock.left,
        right: dock.right,
        top: dock.top,
        bottom: dock.bottom
      },
      intersects:
        cluster.left < dock.right &&
        cluster.right > dock.left &&
        cluster.top < dock.bottom &&
        cluster.bottom > dock.top
    };
  });
}

test("320px and 375px expose usable column and whole-tree geometry", async ({ page }) => {
  for (const width of [320, 375]) {
    const canvas = await openCanvas(page, width, 900);
    const initialZoom = Number(await canvas.getAttribute("data-zoom"));

    expect(initialZoom).toBeGreaterThanOrEqual(0.5);
    expect(initialZoom).toBeLessThanOrEqual(1);
    if (width === 320) expect(initialZoom).toBeLessThan(1);

    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fit whole tree (overview)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset zoom to 1:1" })).toBeVisible();

    await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
    await expect(canvas).toHaveAttribute("data-fit-policy", "overview-auto");

    const geometry = await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>(".canvas")!;
      const sizer = document.querySelector<HTMLElement>(".canvasSizer")!;
      const inner = document.querySelector<HTMLElement>(".canvasInner")!;
      return {
        available: surface.clientWidth,
        band: inner.dataset.zoomBand,
        sizerWidth: sizer.getBoundingClientRect().width,
        zoom: Number(surface.dataset.zoom)
      };
    });

    expect(geometry.band).toBe("overview");
    expect(geometry.zoom).toBeLessThan(0.5);
    expect(Math.abs(geometry.sizerWidth - geometry.available)).toBeLessThanOrEqual(2);
  }
});

test("card offsetHeight survives zoom and overview-band toggles while visual bounds scale", async ({
  page
}) => {
  const canvas = await openCanvas(page, 375, 900);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();

  const card = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  const normal = await card.evaluate((element) => ({
    offsetHeight: (element as HTMLElement).offsetHeight,
    visualHeight: element.getBoundingClientRect().height
  }));

  await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");
  const overviewZoom = Number(await canvas.getAttribute("data-zoom"));
  const overview = await card.evaluate((element) => ({
    offsetHeight: (element as HTMLElement).offsetHeight,
    visualHeight: element.getBoundingClientRect().height
  }));

  await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();
  await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "normal");
  const restored = await card.evaluate((element) => ({
    offsetHeight: (element as HTMLElement).offsetHeight,
    visualHeight: element.getBoundingClientRect().height
  }));

  expect(normal.offsetHeight).toBeGreaterThan(0);
  expect(overview.offsetHeight).toBe(normal.offsetHeight);
  expect(restored.offsetHeight).toBe(normal.offsetHeight);
  expect(overview.visualHeight).toBeCloseTo(normal.visualHeight * overviewZoom, 1);
  expect(restored.visualHeight).toBeCloseTo(normal.visualHeight, 1);
});

test("sticky toggle has no transformed ancestor after the entrance animation settles", async ({
  page
}) => {
  await openCanvas(page, 375, 900);
  await page.waitForTimeout(600);

  const stickyState = await page.evaluate(() => {
    const sticky = document.querySelector<HTMLElement>(".canvasStickyToggle");
    const sizer = document.querySelector<HTMLElement>(".canvasSizer");
    if (!sticky || !sizer) throw new Error("Missing sticky toggle or canvas sizer");

    const transformedAncestors: Array<{
      className: string;
      tagName: string;
      transform: string;
    }> = [];
    let ancestor = sticky.parentElement;
    while (ancestor) {
      const transform = getComputedStyle(ancestor).transform;
      if (transform !== "none") {
        transformedAncestors.push({
          className: ancestor.className,
          tagName: ancestor.tagName,
          transform
        });
      }
      ancestor = ancestor.parentElement;
    }

    return {
      siblingBeforeSizer:
        sticky.parentElement === sizer.parentElement &&
        sticky.nextElementSibling === sizer,
      transformedAncestors
    };
  });

  expect(stickyState.siblingBeforeSizer).toBe(true);
  expect(
    stickyState.transformedAncestors,
    JSON.stringify(stickyState.transformedAncestors)
  ).toEqual([]);
});

test("drag pans without opening the node drawer", async ({ page }) => {
  const canvas = await openCanvas(page, 375, 900);
  await page.getByRole("button", { name: "Reset zoom to 1:1" }).click();

  const card = page.locator(".node").first();
  const box = await card.boundingBox();
  if (!box) throw new Error("Root card has no visual box");

  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await canvas.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test("overview tap zooms to the card, then the same card opens at 1:1", async ({ page }) => {
  const canvas = await openCanvas(page, 375, 900);
  await page.getByRole("button", { name: "Fit whole tree (overview)" }).click();
  await expect(page.locator(".canvasInner")).toHaveAttribute("data-zoom-band", "overview");

  const card = page.locator('.nodeWrap[data-node-id="node-1"] .node');
  await card.click();

  await expect(canvas).toHaveAttribute("data-zoom", "1.0000");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await card.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("PE, WebKit GestureEvent, tier-3 touch, and precision-wheel paths each mutate once", async ({
  page
}) => {
  const canvas = await openCanvas(page, 900, 700);
  const reset = page.getByRole("button", { name: "Reset zoom to 1:1" });

  await reset.click();
  const pointerZoom = await canvas.evaluate((element) => {
    const dispatch = (type: string, init: PointerEventInit) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          ...init
        })
      );
    dispatch("pointerdown", { pointerId: 11, clientX: 100, clientY: 100 });
    dispatch("pointerdown", { pointerId: 12, clientX: 200, clientY: 100 });
    dispatch("pointermove", { pointerId: 12, clientX: 250, clientY: 100 });
    dispatch("pointerup", { pointerId: 12, clientX: 250, clientY: 100 });
    dispatch("pointerup", { pointerId: 11, clientX: 100, clientY: 100 });
    return Number((element as HTMLElement).dataset.zoom);
  });
  expect(pointerZoom).toBeCloseTo(1.5, 1);

  await reset.click();
  const touchResult = await canvas.evaluate((element) => {
    const touch = (type: string, touches: { clientX: number; clientY: number }[]) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: touches });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    touch("touchstart", [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 }
    ]);
    const prevented = touch("touchmove", [
      { clientX: 75, clientY: 100 },
      { clientX: 225, clientY: 100 }
    ]);
    touch("touchend", []);
    return { prevented, zoom: Number((element as HTMLElement).dataset.zoom) };
  });
  expect(touchResult.prevented).toBe(true);
  expect(touchResult.zoom).toBeCloseTo(1.5, 1);

  await reset.click();
  const gestureResult = await canvas.evaluate((element) => {
    const gesture = (type: string, scale: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "scale", { value: scale });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    gesture("gesturestart", 1);
    gesture("gesturechange", 1.2);
    gesture("gesturestart", 1);
    const prevented = gesture("gesturechange", 1.3);
    const zoom = Number((element as HTMLElement).dataset.zoom);
    gesture("gestureend", 1.3);
    return { prevented, zoom };
  });
  expect(gestureResult.prevented).toBe(true);
  expect(gestureResult.zoom).toBeCloseTo(1.3, 1);

  await reset.click();
  await canvas.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -160);
  await page.keyboard.up("Control");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-zoom")))
    .toBeGreaterThan(1);
});

test("zoom cluster does not intersect the expanded dock in portrait or short landscape", async ({
  page
}) => {
  for (const viewport of [
    { width: 375, height: 900 },
    { width: 900, height: 500 }
  ]) {
    await openCanvas(page, viewport.width, viewport.height);
    await page.getByRole("button", { name: /Unlock actions/ }).click();
    await expect(page.getByLabel("User token")).toBeVisible();

    const collision = await boxIntersection(page);
    expect(collision.intersects, JSON.stringify(collision)).toBe(false);
  }
});
