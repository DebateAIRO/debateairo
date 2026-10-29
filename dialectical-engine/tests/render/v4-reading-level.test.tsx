// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadingLevel } from "../../apps/ui/lib/v4/types.js";
import { useReadingLevel, type LevelMemory } from "../../apps/ui/lib/v4/useReadingLevel.js";

/*
 * V4 fix wave 2 (R2TIME-2): the reading level follows the page address. It starts from `?level=` (the server's reading
 * is only the fallback), follows the address when Back/Forward changes it, and is written with
 * history.replaceState(null, "", href) so Next's router follows the change. N7 (2026-10-29): with no level in the
 * address, the account's level is used once read; a choice is saved to the account; a level in the address wins.
 */

/** Puts the page at this address (as a load or a Back traversal would). */
function goTo(href: string): void {
  window.history.replaceState(null, "", href);
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let seen: { level: ReadingLevel | null; choose: (level: ReadingLevel) => void; settled: boolean } | null = null;

/** An account with nothing saved, answering at once; the account tests below pass their own. */
const NOTHING_SAVED: LevelMemory = { read: async () => null, save: async () => true };

function Probe({ initial, memory }: { initial: ReadingLevel | null; memory: LevelMemory }) {
  const [level, choose, settled] = useReadingLevel(initial, memory);
  seen = { level, choose, settled };
  return <span>{level ?? "none"}</span>;
}

async function mount(initial: ReadingLevel | null, memory: LevelMemory = NOTHING_SAVED): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Probe initial={initial} memory={memory} />));
}

/** A memory whose read answers only when the test says so. */
function slowMemory(): { memory: LevelMemory; answer: (level: ReadingLevel | null) => Promise<void>; fail: () => Promise<void>; saved: ReadingLevel[]; reads: () => number } {
  let resolve: (level: ReadingLevel | null) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  let reads = 0;
  const saved: ReadingLevel[] = [];
  const memory: LevelMemory = {
    read: () => { reads += 1; return new Promise((ok, no) => { resolve = ok; reject = no; }); },
    save: async (level) => { saved.push(level); return true; }
  };
  return {
    memory, saved, reads: () => reads,
    answer: async (level) => { await act(async () => resolve(level)); },
    fail: async () => { await act(async () => reject(new Error("offline"))); }
  };
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

describe("useReadingLevel and the account (N7)", () => {
  it("uses the account's level when the address has none, and says when it is known", async () => {
    const account = slowMemory();
    await mount(null, account.memory);
    expect(seen?.level).toBeNull();
    expect(seen?.settled).toBe(false);
    await account.answer("expert");
    expect(seen?.level).toBe("expert");
    expect(seen?.settled).toBe(true);
    // Using the account's level writes nothing anywhere: no address rewrite, no save.
    expect(window.location.search).toBe("?x=1");
    expect(account.saved).toEqual([]);
  });

  it("lets a level in the address win for that view, without reading the account", async () => {
    goTo("/v4/debate/run-1?level=plain");
    const account = slowMemory();
    await mount("plain", account.memory);
    expect(seen?.level).toBe("plain");
    expect(seen?.settled).toBe(true);
    expect(account.reads()).toBe(0);
  });

  it("saves a choice to the account, and a late account answer never overrides it", async () => {
    const account = slowMemory();
    await mount(null, account.memory);
    await act(async () => seen?.choose("background"));
    expect(account.saved).toEqual(["background"]);
    expect(seen?.settled).toBe(true);
    await account.answer("expert");
    expect(seen?.level).toBe("background");
  });

  it("settles on a failed read and keeps the page as it was; a failed save is quiet", async () => {
    const account = slowMemory();
    await mount(null, account.memory);
    await account.fail();
    expect(seen?.level).toBeNull();
    expect(seen?.settled).toBe(true);
    const failingSave: LevelMemory = { read: async () => null, save: async () => { throw new Error("503"); } };
    await act(async () => root?.unmount());
    host?.remove();
    await mount(null, failingSave);
    await act(async () => seen?.choose("plain"));
    expect(seen?.level).toBe("plain");
  });
});
