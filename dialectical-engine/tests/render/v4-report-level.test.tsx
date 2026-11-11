// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import type { ReadingLevel } from "../../apps/ui/lib/v4/types.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * The owner's level ruling (5 Nov 2026, question 15): a debate keeps the level it was asked at, and its report shows its
 * details at that level. The run read says it (`reading_level`, the start-step session's Task 75c), and the map's loader
 * hands it on as `level` (lib/v4/load.ts on that branch). No level is ever taken from the address: a debate whose run read
 * names none reads as Plain words, as its map does on that branch (7 Nov, at the start-step session's request). At "In
 * depth" the report lists every point of a path.
 */

const mocks = vi.hoisted(() => ({ load: null as unknown }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("token") }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/v4/load", async (importActual) => ({
  ...(await importActual<typeof import("../../apps/ui/lib/v4/load.js")>()),
  loadV4: async () => mocks.load,
  loadStory: async () => { throw new Error("not read in this test"); },
  loadDigView: async () => { throw new Error("no digs in this test"); },
  loadInvestigation: async () => null
}));
vi.mock("@/lib/v4/digIndex", () => ({ readQuestionIndex: async () => [], digLinksFor: () => [] }));
vi.mock("@/lib/v4/accountMemory", () => ({ readDigRecords: async () => null, mergeDigLinks: () => [] }));

import { V4ReportClient } from "../../apps/ui/components/v4/V4ReportClient.js";

const catalog = v4English as Readonly<Record<string, string>>;
const roots: Array<{ root: Root; node: HTMLElement }> = [];
afterEach(() => { for (const { root, node } of roots.splice(0)) { act(() => root.unmount()); node.remove(); } });

async function report(addressLevel: ReadingLevel | null, served: ReadingLevel | undefined): Promise<HTMLElement> {
  mocks.load = {
    kind: "SERVED", runId: "run-1", answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY"), ...(served === undefined ? {} : { level: served })
  };
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  roots.push({ root, node });
  await act(async () => { root.render(<V4ReportClient id="run-1" locale="en" initialLevel={addressLevel} catalog={catalog} newDebateCatalog={{}} />); });
  await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  return node;
}

const everyPointListed = (node: HTMLElement): boolean => node.querySelectorAll(".v4RepPoint").length > 0;

describe("the report shows its details at its debate's own level", () => {
  it("the level the run read names wins over the address's", async () => {
    expect(everyPointListed(await report("plain", "expert"))).toBe(true);
    expect(everyPointListed(await report("expert", "plain"))).toBe(false);
    expect(everyPointListed(await report(null, "expert"))).toBe(true);
  });

  it("with no level from the run read, the report shows Plain words, whatever the address says", async () => {
    expect(everyPointListed(await report("expert", undefined))).toBe(false);
    expect(everyPointListed(await report("plain", undefined))).toBe(false);
    expect(everyPointListed(await report(null, undefined))).toBe(false);
  });
});
