// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import { CouldNotLoadRetry } from "../../apps/ui/app/public/debate/[id]/CouldNotLoad.js";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };
import * as nav from "./stubs/next-navigation.js";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (DEB2-12): "Try again" on the public page's "couldn't load" note. A retry that
 * works swaps the note for the debate page, and Try again goes with the note: focus goes to the debate's question
 * heading, never to the whole main area. A retry that fails keeps focus on Try again (W2L-4). The page's server
 * component is stood in by a parent that swaps on refresh, as the refresh's new read does; the debate is made up.
 */
const debate = PublicDebateSchema.parse({
  public_ref: "22222222-2222-4222-8222-222222222222", author_pseudonym: "Made-up Author", question: "A made-up public question?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: { terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true, confidence_band: "moderate", summary_segments: [{ text: "A made-up summary." }],
    badges: [], residual_objections: [], reversal_point: "A made-up turn.", as_of: "2026-08-24T00:00:00.000Z" }
});

let root: Root | null = null;
let stop: () => void = () => undefined;
// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in this test"); }));
  nav.resetRefreshes();
  stop = guarded ? startFocusGuard() : installFocusFixup();
});
afterEach(async () => {
  stop();
  stop = () => undefined;
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  nav.resetRefreshes();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
async function settle() { await act(async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); }); }

/** The page: the note with Try again until a refresh reads the debate (`works`), then the debate page. */
function Page({ works }: Readonly<{ works: boolean }>) {
  const [loaded, setLoaded] = useState(false);
  nav.setRefreshEffect(() => { if (works) setLoaded(true); });
  return loaded
    ? <PublicDebatePageClient debate={debate} locale="en" storyLocale="en" storyCatalog={publicEnglish} publicCatalog={publicEnglish} homeCatalog={{}} v4Catalog={v4English} />
    : <div className="v4Root v4PubNotePage"><div className="v4PubNoteMain" data-public-note="could-not-load"><p role="status">{v4English["v4.public.couldNotLoad"]}</p><CouldNotLoadRetry catalog={v4English} /></div></div>;
}
async function mount(works: boolean) {
  const main = document.createElement("main");
  main.id = "main-content";
  main.tabIndex = -1;
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<Page works={works} />); });
  await settle();
}

describe("DEB2-12: Try again on the public page", () => {
  it("a retry that brings the debate lands on its question heading", async () => {
    await mount(true);
    pressByKeyboard(document.querySelector<HTMLButtonElement>(".v4PubRetry")!);
    await settle();
    await guardSettled();
    expect(document.querySelector(".v4PubRetry")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(document.querySelector("h1.v4PubTitle"));
  });

  it("a retry that fails keeps focus on Try again, and a later fresh debate page takes no focus of its own", async () => {
    await mount(false);
    const retry = document.querySelector<HTMLButtonElement>(".v4PubRetry")!;
    pressByKeyboard(retry);
    await settle();
    await guardSettled();
    expect(document.activeElement).toBe(retry);
    // The person leaves with the pointer (the guard then owes nothing), and the page goes.
    document.dispatchEvent(new Event("pointerdown"));
    await act(async () => root!.unmount());
    document.body.replaceChildren();
    // Another public page opened later, with nothing focused: it starts at its top as a fresh load does.
    const main = document.createElement("main");
    document.body.append(main);
    root = createRoot(main);
    await act(async () => { root!.render(<PublicDebatePageClient debate={debate} locale="en" storyLocale="en" storyCatalog={publicEnglish} publicCatalog={publicEnglish} homeCatalog={{}} v4Catalog={v4English} />); });
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  /** A debate page opened afresh in a new main area, with nothing focused. */
  async function openAfresh() {
    document.dispatchEvent(new Event("pointerdown"));
    await act(async () => root!.unmount());
    document.body.replaceChildren();
    const main = document.createElement("main");
    document.body.append(main);
    root = createRoot(main);
    await act(async () => { root!.render(<PublicDebatePageClient debate={debate} locale="en" storyLocale="en" storyCatalog={publicEnglish} publicCatalog={publicEnglish} homeCatalog={{}} v4Catalog={v4English} />); });
    await settle();
  }

  it("a retry still on its way when the note goes leaves nothing behind: a debate page opened later takes no focus", async () => {
    await mount(false);
    // The press and the person leaving happen before the retry has ended: the note goes while its retry is pending.
    await act(async () => {
      document.querySelector<HTMLButtonElement>(".v4PubRetry")!.click();
      root!.unmount();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    root = createRoot(document.createElement("div"));
    await openAfresh();
    expect(document.querySelector("h1.v4PubTitle")).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("a debate page at another address never takes the retry of this one", async () => {
    const here = window.location.pathname;
    try {
      await mount(false);
      // The person follows a link to another debate while the retry runs: its page mounts as this note goes.
      await act(async () => {
        document.querySelector<HTMLButtonElement>(".v4PubRetry")!.click();
        window.history.pushState({}, "", "/public/debate/another");
        root!.render(<PublicDebatePageClient debate={debate} locale="en" storyLocale="en" storyCatalog={publicEnglish} publicCatalog={publicEnglish} homeCatalog={{}} v4Catalog={v4English} />);
      });
      await settle();
      expect(document.querySelector("h1.v4PubTitle")).not.toBeNull();
      expect(document.activeElement).toBe(document.body);
    } finally {
      window.history.pushState({}, "", here);
    }
  });
});
