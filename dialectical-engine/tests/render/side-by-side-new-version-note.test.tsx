// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };

/**
 * Side-by-side uploads spec 2026-10-21 §7 (plan C13): a page opened under another release shows one small, plain,
 * non-blocking line — "The site was updated. Please reload the page." with a Reload button — instead of failing; a public
 * debate made by a newer release says so in a plain sentence instead of "not found".
 */
const mocks = vi.hoisted(() => ({ readPublicDebate: vi.fn() }));
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ readPublicDebate: mocks.readPublicDebate })
}));

type ReleaseWatch = typeof import("../../apps/ui/lib/v3/releaseWatch.js");
type NoteModule = typeof import("../../apps/ui/components/NewVersionNote.js");

const NEWER = chromeEnglish["chrome.release.newerVersion"];
const MADE_BY_NEWER = chromeEnglish["chrome.release.madeByNewer"];

let root: Root | null = null;
let container: HTMLElement;

/** A fresh page: the reason is page-wide state, so each case loads the watch and the note anew. */
async function freshPage(): Promise<{ watch: ReleaseWatch; NewVersionNote: NoteModule["NewVersionNote"] }> {
  vi.resetModules();
  const watch = await import("../../apps/ui/lib/v3/releaseWatch.js");
  const { NewVersionNote } = await import("../../apps/ui/components/NewVersionNote.js");
  return { watch, NewVersionNote };
}

async function mount(element: ReactElement): Promise<void> {
  root = createRoot(container);
  await act(async () => { root!.render(element); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(async () => {
  if (root !== null) await act(async () => { root!.unmount(); });
  root = null;
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NewVersionNote", () => {
  it("English strings say it plainly", () => {
    // Final fix wave W4: neutral — after a way back the site is older, so the note never says "newer".
    expect(NEWER).toBe("The site was updated. Please reload the page.");
    expect(chromeEnglish["chrome.release.reload"]).toBe("Reload");
    expect(MADE_BY_NEWER).toBe("This was made by a newer version of the site. Reload the page, or try again in a few minutes.");
  });

  it("renders nothing while no newer version is known", async () => {
    const { NewVersionNote } = await freshPage();
    await mount(<NewVersionNote />);
    expect(container.innerHTML).toBe("");
  });

  it("after a newer build is announced, shows one status line with the sentence and a Reload button that reloads", async () => {
    const { watch, NewVersionNote } = await freshPage();
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    await mount(<NewVersionNote />);
    await act(async () => { watch.announceNewerVersion("NEWER_BUILD"); });
    const status = container.querySelectorAll('[role="status"]');
    expect(status).toHaveLength(1);
    expect(status[0]!.textContent).toContain(NEWER);
    const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === "Reload");
    expect(button).toBeDefined();
    expect(button!.type).toBe("button");
    await act(async () => { button!.click(); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("says a newer version made it when that is the reason", async () => {
    const { watch, NewVersionNote } = await freshPage();
    watch.announceNewerVersion("MADE_BY_NEWER");
    await mount(<NewVersionNote />);
    expect(container.textContent).toContain(MADE_BY_NEWER);
    expect(container.textContent).not.toContain(NEWER);
  });

  it("renders nothing on the server, so the first paint matches every page", async () => {
    const { watch, NewVersionNote } = await freshPage();
    watch.announceNewerVersion("NEWER_BUILD");
    expect(renderToStaticMarkup(<NewVersionNote />)).toBe("");
  });
});

describe("the public debate page", () => {
  /** The page's own module graph; `failure` is built from that graph's error class (instanceof holds within one). */
  async function publicPage(failure: (contract: typeof import("@debateai/contract")) => unknown): Promise<string> {
    vi.resetModules();
    mocks.readPublicDebate.mockReset();
    mocks.readPublicDebate.mockRejectedValue(failure(await import("@debateai/contract")));
    const { default: PublicDebatePage } = await import("../../apps/ui/app/public/debate/[id]/page.js");
    const element = await PublicDebatePage({ params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) });
    return renderToStaticMarkup(element as ReactElement);
  }

  it("says plainly that a newer version made a debate this page cannot read, instead of 'not found'", async () => {
    for (const failure of [
      ({ ContractHttpError }: typeof import("@debateai/contract")) =>
        new ContractHttpError("NOT_FOUND", 409, "x", "MADE_BY_NEWER_RELEASE"),
      ({ ContractHttpError }: typeof import("@debateai/contract")) => new ContractHttpError("INVALID_RESPONSE", 200, "x")
    ]) {
      // The render stub's notFound() throws NEXT_NOT_FOUND, so reaching the markup proves it was not called.
      const html = await publicPage(failure);
      expect(html).toContain(MADE_BY_NEWER);
      expect(html).toContain('role="status"');
    }
  });

  it("keeps 'not found' for every other refusal", async () => {
    for (const failure of [
      ({ ContractHttpError }: typeof import("@debateai/contract")) => new ContractHttpError("NOT_FOUND", 404, "x"),
      () => new Error("network")
    ]) {
      await expect(publicPage(failure)).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });
});
