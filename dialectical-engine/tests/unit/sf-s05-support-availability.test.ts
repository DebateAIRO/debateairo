// @vitest-environment jsdom

// The root typecheck does not resolve the UI workspace's React dependency from tests/unit.
// Vitest resolves both imports at runtime; the focused render assertions below exercise them.
// @ts-expect-error React is supplied by apps/ui for this jsdom test.
import { act, createElement } from "react";
// @ts-expect-error React DOM is supplied by apps/ui for this jsdom test.
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUPPORT_OFFERED_STORAGE_KEY,
  markSupportNotOffered,
  resetSupportOfferedForTests,
  useSupportOffered
} from "../../apps/ui/components/support/availability.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Surface({ name }: { name: string }) {
  const state = useSupportOffered();
  return createElement("output", { "data-surface": name }, state);
}

const reply = (status: number, body: unknown) => ({
  ok: status === 200,
  status,
  json: async () => body
});

function fetchAnswers(...answers: Array<unknown | Error>) {
  const spy = vi.fn();
  for (const answer of answers) {
    if (answer instanceof Error) spy.mockRejectedValueOnce(answer);
    else spy.mockResolvedValueOnce(answer);
  }
  vi.stubGlobal("fetch", spy);
  return spy;
}

async function mountPage(...names: string[]): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let renderError: unknown;
  try {
    await act(async () => {
      root!.render(createElement("div", null, names.map((name) => createElement(Surface, { key: name, name }))));
    });
  } catch (error) {
    renderError = error;
  }
  expect(renderError, "the availability hook mounts").toBeUndefined();
}

function states(): string[] {
  return [...document.querySelectorAll("output[data-surface]")].map((node) => node.textContent ?? "");
}

async function leavePage(): Promise<void> {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  container = null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  resetSupportOfferedForTests();
});

afterEach(async () => {
  await leavePage();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("S05-C13 the tab's kept support availability", () => {
  it("A1 one page with two surfaces sends one request and both read its answer", async () => {
    // PROPERTY: all consumers on one page share one country check and its answer.
    const fetch = fetchAnswers(reply(200, { service: true }));
    await mountPage("widget", "footer");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/v1/geo/availability", {
      method: "GET", cache: "no-store", credentials: "same-origin"
    });
    expect(states()).toEqual(["offered", "offered"]);
  });

  it("A2 a second page and reload in the same tab send no request", async () => {
    // PROPERTY: the one check made after the spy is installed serves later pages and reloads.
    const fetch = fetchAnswers(reply(200, { service: true }));
    await mountPage("first");
    expect(states()).toEqual(["offered"]);
    await leavePage();
    resetSupportOfferedForTests();
    await mountPage("second");
    expect(states()).toEqual(["offered"]);
    await leavePage();
    resetSupportOfferedForTests();
    await mountPage("reload");
    expect(states()).toEqual(["offered"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a network failure", new Error("offline")],
    ["a 429", reply(429, { service: true })],
    ["a 500", reply(500, { service: true })],
    ["a 200 whose body has no service boolean", reply(200, { service: "true" })],
    ["a 200 whose body is not JSON", { ok: true, status: 200, json: async () => { throw new SyntaxError("JSON"); } }]
  ])("A3 %s keeps nothing and the next page asks again", async (_name, failure) => {
    // PROPERTY: a failed or shapeless response is never a tab answer.
    const fetch = fetchAnswers(failure, reply(200, { service: true }));
    await mountPage("first");
    expect(states()).toEqual(["failed"]);
    expect(sessionStorage.getItem(SUPPORT_OFFERED_STORAGE_KEY)).toBeNull();
    await leavePage();
    resetSupportOfferedForTests();
    await mountPage("next");
    expect(states()).toEqual(["offered"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("A4 a 200 with service:false keeps not-offered", async () => {
    // PROPERTY: an explicit service refusal is a reusable negative answer.
    fetchAnswers(reply(200, { service: false }));
    await mountPage("widget");
    expect(states()).toEqual(["not-offered"]);
    expect(sessionStorage.getItem(SUPPORT_OFFERED_STORAGE_KEY)).toBe("false");
  });

  it("A5 markSupportNotOffered keeps not-offered and updates every surface at once", async () => {
    // PROPERTY: a later route refusal immediately hides all surfaces and persists the refusal.
    fetchAnswers(reply(200, { service: true }));
    await mountPage("widget", "footer");
    expect(states()).toEqual(["offered", "offered"]);
    await act(async () => markSupportNotOffered());
    expect(states()).toEqual(["not-offered", "not-offered"]);
    expect(sessionStorage.getItem(SUPPORT_OFFERED_STORAGE_KEY)).toBe("false");
  });

  it("A6 storage holds only the service boolean under the named key", async () => {
    // PROPERTY: neither country nor address nor response fields enter browser storage.
    fetchAnswers(reply(200, { service: true, country: "RO", address: "192.0.2.5" }));
    await mountPage("widget");
    expect(states()).toEqual(["offered"]);
    expect(Object.keys(sessionStorage)).toEqual([SUPPORT_OFFERED_STORAGE_KEY]);
    expect(sessionStorage.getItem(SUPPORT_OFFERED_STORAGE_KEY)).toBe("true");
  });

  it("A7 blocked session storage sends one request per page and throws nothing", async () => {
    // PROPERTY: inaccessible storage cannot break rendering, and each new page can try again.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const fetch = fetchAnswers(reply(200, { service: true }), reply(200, { service: true }));
    await mountPage("widget", "footer");
    expect(states()).toEqual(["offered", "offered"]);
    await leavePage();
    resetSupportOfferedForTests();
    await mountPage("next");
    expect(states()).toEqual(["offered"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
