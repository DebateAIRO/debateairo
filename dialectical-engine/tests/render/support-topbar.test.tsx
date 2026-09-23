// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { setPathname } from "next/navigation";
import { TopBar } from "../../apps/ui/components/TopBar.js";

vi.mock("next/navigation",async () =>
  vi.importActual("./stubs/next-navigation.js")
);

function render(pathname:string): Document {
  setPathname(pathname);
  return new DOMParser().parseFromString(renderToStaticMarkup(<TopBar />),"text/html");
}

function linkByText(document:Document,label:string): HTMLAnchorElement | undefined {
  return [...document.querySelectorAll<HTMLAnchorElement>("a")]
    .find(link => link.textContent?.replace(/\s+/gu," ").trim() === label);
}

describe("Support-visible global Account navigation",() => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch",fetchMock);
  });

  it("opens the signed-in Account surface without changing the other global actions",() => {
    const document = render("/");
    const account = linkByText(document,"Account");
    const newDebate = linkByText(document,"+ New debate");
    const settings = document.querySelector<HTMLAnchorElement>('a[aria-label="Settings"]');
    const asker = [...document.querySelectorAll<HTMLElement>(".roleChip")]
      .find(element => element.textContent?.trim() === "ASKER");

    expect(account?.getAttribute("href")).toBe("/settings");
    expect(newDebate?.getAttribute("href")).toBe("/new");
    expect(settings?.getAttribute("href")).toBe("/settings");
    expect(asker?.tagName).toBe("SPAN");
    expect(asker?.closest("a,button")).toBeNull();
    expect(asker?.getAttribute("title")).toBe("Asker role placeholder");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["/login","/sign-up","/verify-email","/enroll-mfa"])(
    "retains the minimal auth top bar on %s",
    pathname => {
      const document = render(pathname);

      expect(document.querySelector(".authTopBar")).not.toBeNull();
      expect(document.querySelector(".topBar")).toBeNull();
      expect(linkByText(document,"Account")).toBeUndefined();
      expect(linkByText(document,"+ New debate")).toBeUndefined();
      expect(document.querySelector(".roleChip")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(["/debate/11111111-1111-4111-8111-111111111111","/public/debate/11111111-1111-4111-8111-111111111111"])(
    "continues suppressing the global bar on %s",
    pathname => {
      const document = render(pathname);

      expect(document.body.innerHTML).toBe("");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
