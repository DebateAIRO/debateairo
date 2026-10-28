// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadingLevel } from "../../apps/ui/lib/v4/types.js";
import { useReadingLevel } from "../../apps/ui/lib/v4/useReadingLevel.js";

/*
 * V4 fix wave 2 (R2TIME-2): the reading level follows the page address. It starts from `?level=` (the server's reading
 * is only the fallback), follows the address when Back/Forward changes it, and is written with
 * history.replaceState(null, "", href) so Next's router follows the change.
 */

/** Puts the page at this address (as a load or a Back traversal would). */
function goTo(href: string): void {
  window.history.replaceState(null, "", href);
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let seen: { level: ReadingLevel | null; choose: (level: ReadingLevel) => void } | null = null;

function Probe({ initial }: { initial: ReadingLevel | null }) {
  const [level, choose] = useReadingLevel(initial);
  seen = { level, choose };
  return <span>{level ?? "none"}</span>;
}

async function mount(initial: ReadingLevel | null): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Probe initial={initial} />));
}

beforeEach(() => {
  seen = null;
  goTo("/v4/debate/run-1?x=1#part");
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

describe("useReadingLevel (R2TIME-2)", () => {
  it("starts from the address, with the server's reading as the fallback", async () => {
    goTo("/v4/debate/run-1?level=expert");
    await mount("plain");
    expect(seen?.level).toBe("expert");
  });

  it("uses the server's reading when the address has no level, and null when neither has one", async () => {
    await mount("plain");
    expect(seen?.level).toBe("plain");
    await act(async () => root?.unmount());
    host?.remove();
    await mount(null);
    expect(seen?.level).toBeNull();
  });

  it("writes a chosen level with replaceState(null, …), keeping the other parameters and the #part", async () => {
    await mount(null);
    const replace = vi.spyOn(window.history, "replaceState");
    await act(async () => seen?.choose("background"));
    expect(seen?.level).toBe("background");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0]).toEqual([null, "", "/v4/debate/run-1?x=1&level=background#part"]);
    expect(window.location.search).toBe("?x=1&level=background");
  });

  it("ignores a value that is not a level", async () => {
    await mount("plain");
    const replace = vi.spyOn(window.history, "replaceState");
    await act(async () => seen?.choose("loud" as ReadingLevel));
    expect(seen?.level).toBe("plain");
    expect(replace).not.toHaveBeenCalled();
  });

  it("follows the address on Back/Forward (popstate), and keeps its level when the address has none", async () => {
    goTo("/v4/debate/run-1?level=expert");
    await mount("expert");
    await act(async () => {
      goTo("/v4/debate/run-1?level=plain");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(seen?.level).toBe("plain");
    expect(host?.textContent).toBe("plain");
    await act(async () => {
      goTo("/v4/debate/run-1?x=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(seen?.level).toBe("plain");
  });

  it("a page mounted again with stale server props shows the address's level", async () => {
    goTo("/v4/debate/run-1?level=expert");
    await mount("background");
    expect(host?.textContent).toBe("expert");
  });
});
