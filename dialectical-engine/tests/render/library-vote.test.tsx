// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryVote } from "../../apps/ui/components/LibraryVote.js";
import { upvoteMessageCatalog } from "../../apps/ui/lib/upvoteWords.js";
import enHome from "../../apps/ui/messages/en/home.json" with { type: "json" };
import roHome from "../../apps/ui/messages/ro/home.json" with { type: "json" };
import { holdSessionCookies } from "../support/sessionCookie.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>
}));
// The default `send` goes to the browser's contract client; everything else of lib/api stays real (holdsNoSession).
const wire = vi.hoisted(() => ({
  castPublicVote: vi.fn(async (_ref: string) => ({ voted: true, vote_count: 5 })),
  withdrawPublicVote: vi.fn(async (_ref: string) => ({ voted: false, vote_count: 4 }))
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/api.js")>()), contractClient: wire
}));

/**
 * Upvotes on public debates (design 2026-11-26, section 4): the vote box of one public row. A real button beside the
 * row's link, never inside it; a press shows at once and the server's answer settles it; a browser with no session
 * sends nothing. The words are the owner's, read from the en and ro catalogues.
 */
// Each case gets a row of its own: the box remembers the server's last answer per row for as long as the page's code lives.
let REF = "";
let rows = 0;
const SIGN_IN = "/login?next=%2F%3Ftab%3Dpublic";
const WORDS = { en: upvoteMessageCatalog(enHome), ro: upvoteMessageCatalog(roHome) };
type Answer = Readonly<{ voted: boolean; vote_count: number }>;
type Send = (publicRef: string, vote: boolean) => Promise<Answer>;
const row = (): ReactNode => (
  <a className="libRow" href={`/public/debate/${REF}`} data-library-row data-bezel="shell">
    <div className="libRowCore" data-bezel="core"><div className="libRowBody"><div className="libRowClaim" id="claim-1">Is tea better than coffee?</div></div></div>
  </a>
);

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let session: Readonly<{ drop(): void }>;
beforeEach(() => { session = holdSessionCookies(); rows += 1; REF = `11111111-1111-4111-8111-${String(rows).padStart(12, "0")}`; });
afterEach(() => { unmount(); session.drop(); vi.clearAllMocks(); });
function unmount(): void { act(() => root?.unmount()); host?.remove(); root = undefined; host = undefined; }
async function mount(props: Partial<{ ref: string; count: number; voted: boolean; signedIn: boolean; locale: "en" | "ro"; describedBy: string; send: Send }> = {}): Promise<void> {
  const locale = props.locale ?? "en";
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <LibraryVote publicRef={props.ref ?? REF} initialCount={props.count ?? 4} initialVoted={props.voted ?? false} signedIn={props.signedIn ?? true}
        signInHref={SIGN_IN} catalog={WORDS[locale]} locale={locale}
        {...(props.describedBy === undefined ? {} : { describedBy: props.describedBy })} {...(props.send === undefined ? {} : { send: props.send })}>
        {row()}
      </LibraryVote>
    );
  });
}
const button = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>("button[data-library-vote]")!;
const shown = (): string => host!.querySelector(".libVoteCount")!.textContent ?? "";
const pressed = (): string | null => button().getAttribute("aria-pressed");
const name = (): string | null => button().getAttribute("aria-label");
const note = (): HTMLElement | null => host!.querySelector<HTMLElement>("p.libVoteNote");
const press = (): Promise<void> => act(async () => { button().click(); });
/** The layout's always-mounted live region (apps/ui/app/layout.tsx:160), which announce() writes 50 ms after it is asked. */
async function said(region: HTMLElement): Promise<string> {
  await act(async () => { await new Promise((done) => setTimeout(done, 60)); });
  return region.textContent ?? "";
}
function deferred() {
  let yes!: (answer: Answer) => void;
  let no!: (reason: unknown) => void;
  const send = vi.fn<Send>(() => new Promise<Answer>((resolve, reject) => { yes = resolve; no = reject; }));
  return { send, settle: (answer: Answer) => act(async () => { yes(answer); }), fail: () => act(async () => { no(new Error("down")); }) };
}
function neverSwitchedOff(): void {
  expect(button().disabled).toBe(false);
  expect(button().hasAttribute("disabled")).toBe(false);
  expect(button().hasAttribute("aria-disabled")).toBe(false);
}

describe("the vote box of a public row", () => {
  it("is a real button beside the row's link, never inside it, and leaves the link as it was given", async () => {
    await mount();
    const wrapper = host!.firstElementChild!;
    expect(`${wrapper.tagName}.${wrapper.className}`).toBe("DIV.libVoteRow");
    expect([...wrapper.children].map((child) => child.tagName)).toEqual(["BUTTON", "A"]);
    expect(button().type).toBe("button");
    expect(button().className).toBe("libVote");
    expect(button().closest("a")).toBeNull();
    expect(host!.querySelector("a button")).toBeNull();
    for (const element of [wrapper, button()]) {
      expect(element.hasAttribute("data-library-row")).toBe(false);
      expect(element.hasAttribute("data-bezel")).toBe(false);
    }
    expect(host!.querySelectorAll("[data-library-row]")).toHaveLength(1);
    expect(host!.querySelector("a.libRow")!.outerHTML).toBe(renderToStaticMarkup(row()));
    expect([...button().children].map((child) => `${child.tagName.toLowerCase()}.${child.getAttribute("class")}`)).toEqual(["svg.libVoteArrow", "span.libVoteCount"]);
    const arrow = button().querySelector("svg")!;
    expect([arrow.getAttribute("aria-hidden"), arrow.getAttribute("focusable"), arrow.getAttribute("viewBox")]).toEqual(["true", "false", "0 0 24 24"]);
    expect(host!.querySelector("[role=status]")).toBeNull();
    neverSwitchedOff();
  });
  it.each([[false, 0, "false", "0"], [true, 12, "true", "12"]] as const)("starts from the page's props: voted %s, count %i", async (voted, count, ariaPressed, text) => {
    await mount({ voted, count });
    expect([pressed(), shown()]).toEqual([ariaPressed, text]);
  });
  it.each([
    ["en", 0, "Upvote. 0 votes"], ["en", 1, "Upvote. 1 vote"], ["en", 2, "Upvote. 2 votes"],
    ["ro", 0, "Votați. 0 voturi"], ["ro", 1, "Votați. 1 vot"], ["ro", 2, "Votați. 2 voturi"], ["ro", 20, "Votați. 20 de voturi"], ["ro", 101, "Votați. 101 voturi"]
  ] as const)("%s: the spoken name for %i is \"%s\"", async (locale, count, words) => {
    await mount({ locale, count });
    expect(name()).toBe(words);
  });
  it("the box shows the short count with the reader's decimal mark; the name keeps the exact count", async () => {
    await mount({ count: 1249 });
    expect([shown(), name()]).toEqual(["1.2k", "Upvote. 1249 votes"]);
    unmount();
    await mount({ count: 1249, locale: "ro" });
    expect([shown(), name()]).toEqual(["1,2k", "Votați. 1249 de voturi"]);
  });
  it("points at the row's question when the page names it, and at nothing otherwise", async () => {
    await mount({ describedBy: "claim-1" });
    expect(button().getAttribute("aria-describedby")).toBe("claim-1");
    unmount();
    await mount();
    expect(button().hasAttribute("aria-describedby")).toBe(false);
  });
  it("a press shows at once, before the server answers, and then takes the server's count", async () => {
    const { send, settle } = deferred();
    await mount({ send });
    await press();
    expect(send.mock.calls).toEqual([[REF, true]]);
    expect([pressed(), shown(), name()]).toEqual(["true", "5", "Upvote. 5 votes"]);
    neverSwitchedOff();
    await settle({ voted: true, vote_count: 9 });
    expect([pressed(), shown(), name()]).toEqual(["true", "9", "Upvote. 9 votes"]);
    expect(note()).toBeNull();
  });
  it("a second press takes the vote back", async () => {
    const send = vi.fn<Send>(async (_ref, vote) => ({ voted: vote, vote_count: vote ? 5 : 4 }));
    await mount({ send });
    await press();
    expect([pressed(), shown()]).toEqual(["true", "5"]);
    await press();
    expect(send.mock.calls).toEqual([[REF, true], [REF, false]]);
    expect([pressed(), shown()]).toEqual(["false", "4"]);
  });
  it("taking a vote back never shows a count below zero while it waits", async () => {
    const { send, settle } = deferred();
    await mount({ voted: true, count: 0, send });
    await press();
    expect(send.mock.calls).toEqual([[REF, false]]);
    expect([pressed(), shown(), name()]).toEqual(["false", "0", "Upvote. 0 votes"]);
    await settle({ voted: false, vote_count: 0 });
    expect(shown()).toBe("0");
  });
  it("a send that fails puts the state and the count back and says so in a status line", async () => {
    const { send, fail } = deferred();
    await mount({ send });
    await press();
    expect(pressed()).toBe("true");
    await fail();
    expect([pressed(), shown(), name()]).toEqual(["false", "4", "Upvote. 4 votes"]);
    expect(note()!.getAttribute("role")).toBe("status");
    expect(note()!.textContent).toBe("Your vote could not be saved. Try again.");
    expect(note()!.querySelector("a")).toBeNull();
    expect(host!.querySelectorAll("[role=status]")).toHaveLength(1);
    expect([...host!.firstElementChild!.children].map((child) => child.tagName)).toEqual(["BUTTON", "A", "P"]);
    neverSwitchedOff();
  });
  it("a failed withdrawal puts the vote back, in Romanian words", async () => {
    await mount({ voted: true, count: 2, locale: "ro", send: vi.fn<Send>(async () => { throw new Error("down"); }) });
    await press();
    expect([pressed(), shown()]).toEqual(["true", "2"]);
    expect(note()!.textContent).toBe("Votul dvs. nu a putut fi salvat. Încercați din nou.");
  });
  it("the failure line goes away on the next press that is sent", async () => {
    const send = vi.fn<Send>().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ voted: true, vote_count: 5 });
    await mount({ send });
    await press();
    expect(note()).not.toBeNull();
    await press();
    expect(note()).toBeNull();
    expect([pressed(), shown()]).toEqual(["true", "5"]);
  });
  it("a press while one is in flight sends nothing, and the button stays on", async () => {
    const { send, settle } = deferred();
    await mount({ send });
    await press();
    await press();
    await press();
    expect(send).toHaveBeenCalledTimes(1);
    expect([pressed(), shown()]).toEqual(["true", "5"]);
    neverSwitchedOff();
    await settle({ voted: true, vote_count: 5 });
    await press();
    expect(send.mock.calls).toEqual([[REF, true], [REF, false]]);
  });
  it("with no send given, a vote goes to the contract client's cast and taking it back to its withdraw", async () => {
    await mount();
    await press();
    expect(wire.castPublicVote.mock.calls).toEqual([[REF]]);
    expect(wire.withdrawPublicVote).not.toHaveBeenCalled();
    expect([pressed(), shown()]).toEqual(["true", "5"]);
    await press();
    expect(wire.withdrawPublicVote.mock.calls).toEqual([[REF]]);
    expect(wire.castPublicVote).toHaveBeenCalledTimes(1);
    expect([pressed(), shown()]).toEqual(["false", "4"]);
  });
  it("signed out: a press sends nothing and shows one line that is the sign-in link", async () => {
    const send = vi.fn<Send>();
    await mount({ signedIn: false, send });
    await press();
    await press();
    expect(send).not.toHaveBeenCalled();
    expect([pressed(), shown()]).toEqual(["false", "4"]);
    expect(host!.querySelectorAll("p.libVoteNote")).toHaveLength(1);
    expect(note()!.getAttribute("role")).toBe("status");
    expect([...note()!.querySelectorAll("a")].map((link) => [link.getAttribute("href"), link.textContent])).toEqual([[SIGN_IN, "Sign in to upvote"]]);
    expect(note()!.textContent).toBe("Sign in to upvote");
    neverSwitchedOff();
  });
  it("no session cookie in this browser: the same, although the page said signed in", async () => {
    session.drop();
    const send = vi.fn<Send>();
    await mount({ signedIn: true, locale: "ro", send });
    await press();
    expect(send).not.toHaveBeenCalled();
    expect(wire.castPublicVote).not.toHaveBeenCalled();
    expect(pressed()).toBe("false");
    expect(note()!.querySelector("a")!.getAttribute("href")).toBe(SIGN_IN);
    expect(note()!.textContent).toBe("Autentificați-vă pentru a vota");
  });
  it("a session that ended on the server: the refused press puts the box back and shows the sign-in link, not the retry line", async () => {
    // What the website's own fetch does on 401 SESSION_REQUIRED before the caller sees it (apps/ui/lib/api.ts:130-141, :237).
    const send = vi.fn<Send>(async () => { session.drop(); throw Object.assign(new Error("SESSION_REQUIRED"), { status: 401 }); });
    await mount({ send });
    await press();
    expect(send).toHaveBeenCalledTimes(1);
    expect([pressed(), shown()]).toEqual(["false", "4"]);
    expect([...note()!.querySelectorAll("a")].map((link) => [link.getAttribute("href"), link.textContent])).toEqual([[SIGN_IN, "Sign in to upvote"]]);
    await press();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("a withdrawal answered 404 (the debate left the list while the page was open) ends not upvoted, and the next press asks to vote", async () => {
    const gone = Object.assign(new Error("DEBATE_NOT_FOUND"), { name: "ContractHttpError", code: "NOT_FOUND", status: 404 });
    const send = vi.fn<Send>(async () => { throw gone; });
    await mount({ voted: true, count: 2, send });
    await press();
    expect([pressed(), shown()]).toEqual(["false", "1"]);
    expect(note()).toBeNull();
    await press();
    expect(send.mock.calls.map(([, vote]) => vote)).toEqual([false, true]);
    // The vote that was asked for could not be stored either: not upvoted, the same count, and now the failure line.
    expect([pressed(), shown()]).toEqual(["false", "1"]);
    expect(note()!.textContent).toBe("Your vote could not be saved. Try again.");
  });
  it("coming back to the list with the props from before the vote shows the vote as the person left it", async () => {
    const BACK = "22222222-2222-4222-8222-222222222222";   // its own row, so what is remembered reaches no other case
    await mount({ ref: BACK, send: vi.fn<Send>(async () => ({ voted: true, vote_count: 5 })) });
    await press();
    expect([pressed(), shown()]).toEqual(["true", "5"]);
    unmount();
    await mount({ ref: BACK });                          // Back: voted false and count 4 again
    expect([pressed(), shown(), name()]).toEqual(["true", "5", "Upvote. 5 votes"]);
    unmount();
    await mount({ ref: BACK, voted: true, count: 7 });   // a fresh load: the server's props win
    expect([pressed(), shown()]).toEqual(["true", "7"]);
  });
  it("a failed send is not remembered: coming back shows the page's own props", async () => {
    const BACK = "33333333-3333-4333-8333-333333333333";
    await mount({ ref: BACK, send: vi.fn<Send>(async () => { throw new Error("down"); }) });
    await press();
    unmount();
    await mount({ ref: BACK });
    expect([pressed(), shown()]).toEqual(["false", "4"]);
    expect(note()).toBeNull();
  });
  it("each line is also said through the layout's live region, which screen readers do not skip", async () => {
    const region = document.body.appendChild(Object.assign(document.createElement("div"), { id: "app-announcer" }));
    try {
      await mount({ signedIn: false });
      await press();
      expect(await said(region)).toBe("Sign in to upvote");
      unmount();
      await mount({ locale: "ro", send: vi.fn<Send>(async () => { throw new Error("down"); }) });
      await press();
      expect(await said(region)).toBe("Votul dvs. nu a putut fi salvat. Încercați din nou.");
    } finally { region.remove(); }
  });
});
