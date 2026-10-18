// @vitest-environment jsdom
/*
 * a11y repair (2026-10-17): while a modal is open, everything outside it is hidden from
 * assistive technology (useHideOutside), so VoiceOver cannot leave the dialog with
 * VO-Shift-Up or through the rotor. Live regions stay exposed, nested surfaces undo only
 * their own hiding, and markup that was already aria-hidden is never un-hidden.
 */
import { act, useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DocumentTitle } from "../../apps/ui/components/DocumentTitle.js";
import { useHideOutside } from "../../apps/ui/components/dialogSurface.js";
import { mount, unmount } from "./task11-harness.js";

function Surface({ label, children }: { label: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useHideOutside(ref);
  return (
    <div role="dialog" aria-label={label} ref={ref}>
      {children}
    </div>
  );
}

function Page({ outer, inner }: { outer: boolean; inner: boolean }) {
  return (
    <div>
      <header id="top">Top</header>
      <main id="main">
        <p id="text">Background</p>
        {outer ? (
          <Surface label="outer">
            <button type="button" id="in-outer">In outer</button>
            {inner ? <Surface label="inner" /> : null}
          </Surface>
        ) : null}
      </main>
      <div id="live" role="status" aria-live="polite" />
      <span id="decor" aria-hidden="true">decor</span>
    </div>
  );
}

const hidden = (id: string): boolean => document.getElementById(id)?.getAttribute("aria-hidden") === "true";

let mounted: Awaited<ReturnType<typeof mount>> | null = null;
afterEach(async () => {
  if (mounted) await unmount(mounted.root, mounted.host);
  mounted = null;
});

describe("useHideOutside", () => {
  it("hides the page around an open dialog and restores it on close", async () => {
    mounted = await mount(<Page outer={false} inner={false} />);
    expect(hidden("top")).toBe(false);

    await act(async () => mounted!.root.render(<Page outer inner={false} />));
    expect(hidden("top")).toBe(true);
    expect(hidden("text")).toBe(true);
    // The dialog's own ancestors stay exposed, and so does the live region.
    expect(hidden("main")).toBe(false);
    expect(hidden("live")).toBe(false);
    expect(document.querySelector('[role="dialog"]')?.closest('[aria-hidden="true"]')).toBeNull();

    await act(async () => mounted!.root.render(<Page outer={false} inner={false} />));
    expect(hidden("top")).toBe(false);
    expect(hidden("text")).toBe(false);
    // Hidden by its own markup before any dialog opened: still hidden after.
    expect(hidden("decor")).toBe(true);
  });

  it("lets a nested dialog undo only its own hiding", async () => {
    mounted = await mount(<Page outer inner={false} />);
    expect(hidden("in-outer")).toBe(false);

    await act(async () => mounted!.root.render(<Page outer inner />));
    expect(hidden("in-outer")).toBe(true);
    expect(hidden("top")).toBe(true);

    await act(async () => mounted!.root.render(<Page outer inner={false} />));
    expect(hidden("in-outer")).toBe(false);
    // The outer dialog is still open, so the page behind it stays hidden.
    expect(hidden("top")).toBe(true);

    await act(async () => mounted!.root.render(<Page outer={false} inner={false} />));
    expect(hidden("top")).toBe(false);
  });
});

describe("the tab title under an open dialog (2026-10-18)", () => {
  function TitledPage({ open }: { open: boolean }) {
    return (
      <div>
        <DocumentTitle brand="Brand" />
        <header id="top">Top</header>
        <main id="main-content">
          <h1>Question of the page</h1>
          {open ? <Surface label="drawer" /> : null}
        </main>
      </div>
    );
  }
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  it("keeps the page's h1 in the title while a dialog hides the page", async () => {
    mounted = await mount(<TitledPage open={false} />);
    await settle();
    expect(document.title).toBe("Question of the page — Brand");

    await act(async () => mounted!.root.render(<TitledPage open />));
    await settle();
    expect(document.querySelector("h1")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.title).toBe("Question of the page — Brand");
  });

  it("still skips an h1 hidden by its own markup", async () => {
    mounted = await mount(
      <div>
        <DocumentTitle brand="Brand" />
        <main id="main-content">
          <div aria-hidden="true"><h1>Decorative heading</h1></div>
        </main>
      </div>
    );
    await settle();
    expect(document.title).toBe("Brand");
  });
});
