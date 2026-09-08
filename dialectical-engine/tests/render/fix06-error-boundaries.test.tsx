// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SegmentError from "../../apps/ui/app/error.js";
import GlobalError from "../../apps/ui/app/global-error.js";
import { ScoringErrorBoundary } from "../../apps/ui/components/ScoringErrorBoundary.js";
import {
  CLIENT_REPORTS,
  installBrowserFaultReporting,
  reportClientFault,
  type ClientReportPayload,
} from "../../apps/ui/lib/obs/reporter.js";
import { createClientReportBundle } from "../../apps/api/src/obs-client-report.js";

const BUILD_REF = "build-fix06-render";
const bundle = createClientReportBundle(BUILD_REF);
const posts: unknown[] = [];
let roots: Root[] = [];

async function waitForPosts(count: number): Promise<void> {
  for (let attempt = 0; attempt < 50 && posts.length < count; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(posts).toHaveLength(count);
}

async function render(node: React.ReactNode): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(node));
}

async function renderDocument(node: React.ReactNode): Promise<void> {
  const target = document.implementation.createHTMLDocument();
  const root = createRoot(target);
  roots.push(root);
  await act(async () => root.render(node));
}

beforeEach(() => {
  posts.length = 0;
  roots = [];
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = String(input);
    if (target === "/v1/obs/client-report/enums" && init === undefined) {
      return new Response(JSON.stringify(bundle), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (target === "/v1/obs/client-report" && init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 202 });
    }
    return new Response(null, { status: 404 });
  }));
});

afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("FIX-06 browser error boundaries", () => {
  it("reports both Next boundaries and the scoring boundary through the closed transport", async () => {
    await render(<SegmentError error={new Error("CANARY-SEGMENT")} reset={() => undefined} />);
    await waitForPosts(1);
    await renderDocument(<GlobalError error={new Error("CANARY-GLOBAL")} reset={() => undefined} />);
    await waitForPosts(2);

    const scoring = new ScoringErrorBoundary({ children: <span>score</span> });
    scoring.componentDidCatch(new Error("CANARY-SCORING"));
    await waitForPosts(3);
    scoring.state = { hasError: true };
    expect(renderToStaticMarkup(scoring.render())).toContain("Scoring UI unavailable.");

    expect(posts).toEqual([
      { ...CLIENT_REPORTS.segment, build_ref: BUILD_REF },
      { ...CLIENT_REPORTS.global, build_ref: BUILD_REF },
      { ...CLIENT_REPORTS.scoring, build_ref: BUILD_REF },
    ]);
    for (const body of posts) {
      expect(Object.keys(body as object).sort()).toEqual([
        "build_ref", "code", "component", "kind", "route_template",
      ]);
      expect(JSON.stringify(body)).not.toMatch(/CANARY|message|stack|https?:\/\//u);
    }
  });

  it("drops extra fields before fetch and makes them inexpressible by type", async () => {
    const illegal: ClientReportPayload = {
      ...CLIENT_REPORTS.segment,
      // @ts-expect-error thrown-value text is outside the reporter contract.
      message: "CANARY-FIX06-MESSAGE",
    };
    expect(await reportClientFault(illegal as unknown)).toBe("dropped");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps a real window error event to an enumeration without reading its text", async () => {
    installBrowserFaultReporting();
    const event = new Event("error");
    Object.defineProperty(event, "message", { value: "FIX06_V_DRILL" });
    window.dispatchEvent(event);
    await waitForPosts(1);

    expect(posts).toEqual([{ ...CLIENT_REPORTS.windowError, build_ref: BUILD_REF }]);
    expect(JSON.stringify(posts)).not.toContain("FIX06_V_DRILL");
  });
});
