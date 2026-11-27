### Task T11: The vote button (`LibraryVote`) and its render test

The small client component that draws one public row's vote box (design §4, §7.4): a real button beside the row's
link, the press shown at once, and the two status lines. This task mounts it on no page (T12 does), writes no CSS
(T10) and no words (T09).

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: **T03** and **T09**. May run alongside T07 (no shared file). If another task shares your working tree,
run your typecheck, `generate:contract` and commit steps while no other task is in the middle of an edit, and read
every `git status` and typecheck expectation below as "nothing else of yours".

**Files:**
- Create: `apps/ui/components/LibraryVote.tsx`
- Create: `tests/render/library-vote.test.tsx`
- Modify: none
- Test: `tests/render/library-vote.test.tsx`

**Interfaces:**
- Consumes:
  - From T03 (`@debateai/contract`, after `pnpm run generate:contract`): the type
    `PublicVoteAnswer = { voted: boolean; vote_count: number }`, and on the browser client `contractClient`
    (`apps/ui/lib/api.ts:256`) the methods `castPublicVote(publicationRef: string): Promise<PublicVoteAnswer>` and
    `withdrawPublicVote(publicationRef: string): Promise<PublicVoteAnswer>`. Every refusal (401, 403, 404, 429, a
    network failure) is a thrown error; none comes back as data. A refusal with an HTTP answer is a
    `ContractHttpError` whose `status` is the answer's status (404 for `DEBATE_NOT_FOUND`).
  - From T07, behaviour only: a withdrawal for a debate that is no longer public deletes the vote and then answers
    404; a cast for it stores nothing and answers 404. So after any 404 no vote of this account is stored.
  - From T09: `apps/ui/lib/upvoteWords.ts` exporting `shortVoteCount(locale: string, count: number): string`
    (999 → `999`, 1249 → `1.2k`, Romanian `1,2k`) and
    `upvoteMessageCatalog(catalog: MessageCatalog): MessageCatalog` (the `home.upvote.*` entries, frozen). And these
    keys in `apps/ui/messages/<locale>/home.json`, with the owner's wording:
    en `home.upvote.label.one` "Upvote. {count} vote", `home.upvote.label.other` "Upvote. {count} votes",
    `home.upvote.signedOut` "Sign in to upvote", `home.upvote.failed` "Your vote could not be saved. Try again.";
    ro `label.one` "Votați. {count} vot", `label.few` "Votați. {count} voturi", `label.other`
    "Votați. {count} de voturi", `signedOut` "Autentificați-vă pentru a vota", `failed`
    "Votul dvs. nu a putut fi salvat. Încercați din nou."
  - Already in the tree: `holdsNoSession()` (`apps/ui/lib/api.ts:105-107`); `t`, `tPlural`, `MessageCatalog`
    (`apps/ui/lib/i18n/translate.ts:7`, `:24-30`, `:32-53`); `announce(message: string): void`
    (`apps/ui/components/Toast.tsx:13-20`), which says a line through the layout's always-mounted live region
    `#app-announcer` (`apps/ui/app/layout.tsx:160`); the test helper `holdSessionCookies()`
    (`tests/support/sessionCookie.ts:39-42`).
  - From T10, names only (no code is imported; T10 runs in parallel): the classes `libVoteRow`, `libVote`,
    `libVoteArrow`, `libVoteCount`, `libVoteNote`.
- Produces, for T12 (the rows and the page). The file has this one export and no default export:

```tsx
export function LibraryVote(props: Readonly<{
  publicRef: string;          // the row's public_ref
  initialCount: number;       // the list's vote_count for this row
  initialVoted: boolean;      // is this ref among the reader's own upvotes
  signedIn: boolean;          // the page's sessionConfirmed
  signInHref: string;         // where "Sign in to upvote" leads
  catalog: MessageCatalog;    // required, no default: the picked home.upvote.* entries
  locale: string;             // required, no default
  describedBy?: string;       // the id of the row's question, set as aria-describedby
  send?: (publicRef: string, vote: boolean) => Promise<PublicVoteAnswer>;  // vote: the state the reader asks for
  children: ReactNode;        // the row's unchanged link
}>)
```

  - No return type is written (as `V4PublicFlag.tsx:49-58`). T12 renders it as JSX and never calls it.

  - The DOM it renders, which T10's rules and T12's tests rely on:

```
div.libVoteRow
├─ button.libVote[type=button][data-library-vote][aria-pressed][aria-label][aria-describedby?]
│  ├─ svg.libVoteArrow[aria-hidden=true][focusable=false]
│  └─ span.libVoteCount            the short count
├─ {children}                      exactly as given
└─ p.libVoteNote[role=status]      only while there is a line to show
```

  - Neither the wrapper nor the button carries `data-library-row` or `data-bezel`. The button is never inside an
    anchor and is never switched off.

  - Four amendments to the fixed interface, made after review and recorded in the plan's index. The fixed text
    said "on any error put both back and show the failure line" and "state starts from the props".
    1. **A session that ended on the server.** When a send throws and `holdsNoSession()` is then true, state and
       count go back and the line is the sign-in link, not the failure line. (On 401 `SESSION_REQUIRED` the
       website's own fetch removes the readable cookie before the caller sees the refusal,
       `apps/ui/lib/api.ts:130-141`, `:237`. The error itself is not read for this.)
    2. **A withdrawal answered 404.** The box ends not upvoted, keeps the lowered count, and shows no line: the
       vote is gone on the server. A cast answered 404 goes back to not upvoted with the failure line, as any
       failed cast does.
    3. **Back from a debate.** The file keeps, in module scope, the server's last answer per `publicRef` together
       with the props the row had when that answer came. A row that mounts with those same props starts from the
       remembered answer; with any other props it starts from the props. Next 15.5.29 (`apps/ui/package.json:23`)
       hands the page its kept payload on Back, whatever `force-dynamic` says, and the row is a link to the debate.
    4. **Both lines are also spoken.** Whenever a line is shown, the same text goes to `announce()`.

**Before you start:**

Read these as templates.
- `apps/ui/components/v4/V4PublicFlag.tsx:49-58` and `:103-114`: a client component with an injectable `send` that
  defaults to a `contractClient` call, a required `catalog` prop, and a `try / catch / finally` around the send.
  Copy that shape.
- `apps/ui/components/ModeToggle.tsx:53-64`: a `type="button"` with `aria-pressed` and a catalogue-built
  `aria-label`. `apps/ui/components/v4/V4PublicMark.tsx:20-28`: a decorative inline `<svg>` with
  `aria-hidden="true" focusable="false"`.
- `apps/ui/components/Toast.tsx:5-20`: `announce()` and why it exists.
- `tests/render/v4-public-flag.test.tsx:13-32` and `:90-101`: the render-test harness (jsdom, `createRoot`, `act`,
  the `next/link` mock, a send that settles later). `tests/render/data-export-card.test.tsx:13-16`: holding a
  session's cookies in jsdom.

Traps.
- The words come only through the `catalog` prop, with `t` and `tPlural`. Do not call `useChromeI18n()`: under
  vitest that provider is a stub that always answers English (`vitest.config.ts:7-10`,
  `tests/render/stubs/i18n-provider.tsx:11-13`), and the Romanian cases below would be impossible.
- `catalog` and `locale` are required and have no default. An optional or English-defaulted catalogue prop falls
  under `apps/ui/lib/i18n/catalogThreading.test.mjs:84-96`.
- No JSX text and no string literal in `aria-label`: `apps/ui/scripts/no-hardcoded-english.test.mjs:16-21`,
  `:33-48` scans every `.tsx` under `apps/ui` and its allow-list is empty.
- Import `shortVoteCount` from `@/lib/upvoteWords`. Do not define or re-export it, or the picker, in this file:
  T12's server component calls the picker, and a server module may not call an export of a `"use client"` file
  (`apps/ui/scripts/server-client-boundary.source-test.mjs:173-175`).
- Never `disabled`, never `aria-disabled`, also while a request runs: a control switched off under keyboard focus
  drops focus (`apps/ui/lib/focusGuard.ts:4-8`). A press during a request is ignored through a `useRef` flag.
- Call `holdsNoSession()` only inside the press handler, never while rendering. On the server it is always false
  (`apps/ui/lib/api.ts:99-107`), so a render that depends on it would not match in the browser.
- Send nothing from a browser with no session. A 401 makes the browser forget the site password
  (`apps/ui/lib/api.ts:117-129`).
- `contractClient` is a Proxy that refuses writes (`apps/ui/lib/v3/releaseWatch.ts:112-122`), so a test cannot
  spy on its methods. The test below replaces the `contractClient` export of `@/lib/api` and keeps the rest real.
- jsdom will not store a `__Host-` cookie; the test uses `holdSessionCookies()`
  (`tests/support/sessionCookie.ts:25-42`).
- Not in this task: `router.refresh()` (it would cost one `publicReads` and one `publicVotes` unit per vote),
  browser storage, a `useEffect` of any kind. State is read once, when the row mounts: from the remembered answer
  if the props are the ones it was seeded from, otherwise from the props.
- The remembered answers are written ONLY inside the press handler, never while rendering. A `"use client"` file
  is also rendered on the server, where a module-scope `Map` is shared by every request; a write during render
  would leak one person's vote into another person's page. Written from the press handler alone, the server's map
  stays empty for ever, and a first render in the browser (hydration) finds it empty too, so the markup matches.
- `announce()` is called from the press handler, where the line is set, not from an effect. The paragraph keeps
  `role="status"` (the fixed DOM); a reader that speaks an inserted region may say the line twice, which is the
  lesser fault than saying nothing (`apps/ui/components/Toast.tsx:8-12`).
- The test gives every case a row of its own (`REF` changes in `beforeEach`): with one shared ref, a case would
  start from what an earlier case's server answered.
- Not this task's files: `apps/ui/components/DebatesBuffer.tsx`, `apps/ui/app/page.tsx` (T12),
  `apps/ui/app/globals.css` (T10), `apps/ui/lib/upvoteWords.ts` and the catalogues (T09),
  `tests/support/shipped-corpus.manifest.txt` (T15 alone edits it). After this task
  `tests/unit/s1-1-depth-contract.test.ts` reports `apps/ui/components/LibraryVote.tsx` under `added` until T15;
  that is expected.
- The root `pnpm run typecheck` reads neither file (`tsconfig.json:27-41` takes `tests/**/*.ts` only and excludes
  `apps/ui`). The component is checked by `pnpm --filter dialectical-engine-v2ui typecheck`; the test file by
  running it.

- [ ] **Step 1: Check that what this task consumes is in the tree**

Run each line with the prefix
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`:

| Command | Expected |
|---|---|
| `pnpm run generate:contract` | exit 0 (the generated client is not in git; T03 changed its source) |
| `grep -c -e castPublicVote -e withdrawPublicVote packages/contract/src/client.ts` | `4` or more (each is in the interface and in the implementation; the generated file only re-exports this one) |
| `grep -c "export type PublicVoteAnswer" packages/contract/src/web.ts` | `1` |
| `grep -n "^export function" apps/ui/lib/upvoteWords.ts` | two lines: `upvoteMessageCatalog` and `shortVoteCount` |
| `grep -n '"home\.upvote\.' apps/ui/messages/en/home.json` | four lines, with the English wording quoted under Consumes |
| `grep -n '"home\.upvote\.' apps/ui/messages/ro/home.json` | five lines, with the Romanian wording quoted under Consumes |

If any of these is missing, stop and report it: T03 or T09 has not landed. Do not create their files here.

- [ ] **Step 2: Write the failing test**

Create `tests/render/library-vote.test.tsx` with exactly this content.

```tsx
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
```

- [ ] **Step 3: Run it and see it fail for the missing file**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/library-vote.test.tsx`

Expected: `Error: Failed to resolve import "../../apps/ui/components/LibraryVote.js" from
"tests/render/library-vote.test.tsx". Does the file exist?`, then `Test Files  1 failed (1)` and `Tests  no tests`.
If the unresolved import is `upvoteWords.js` or a `home.json` instead, go back to Step 1.

- [ ] **Step 4: Create the file with its signature and an empty box**

Create `apps/ui/components/LibraryVote.tsx`. Line 1 is `"use client";`. Imports, exactly:

```tsx
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import type { PublicVoteAnswer } from "@debateai/contract";
import { announce } from "@/components/Toast";
import { contractClient, holdsNoSession } from "@/lib/api";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { shortVoteCount } from "@/lib/upvoteWords";
```

Then a module constant that is not exported, the default of `send` (`vote` is the state the reader asks for:
`true` casts, `false` takes the vote back):

```tsx
const defaultSend = (publicRef: string, vote: boolean): Promise<PublicVoteAnswer> =>
  vote ? contractClient.castPublicVote(publicRef) : contractClient.withdrawPublicVote(publicRef);
```

Then `export function LibraryVote(...)` with the props type under Produces, destructured, `send = defaultSend`.
For this step its body is only `return <div className="libVoteRow">{children}</div>;`.

Above the function, one comment in the file's neighbours' style (`V4PublicFlag.tsx:11-25`) that says: upvotes on
public debates, design of 26 Nov 2026, section 4; the button sits beside the row's link because a button may not
sit inside an anchor; it is never switched off (the focus guard); a browser with no session sends nothing, because
a 401 costs the reader the site password; the words are handed in, not read from the layout's provider, so a test
can render any language; the box remembers the server's last answer per row for as long as the page's code lives,
so coming back from a debate shows the vote as the person left it, and it writes that memory from the press alone.

- [ ] **Step 5: Run it and see every case fail by assertion**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/library-vote.test.tsx`

Expected: `Tests  28 failed (28)`. The first reads `expected [ 'A' ] to deeply equal [ 'BUTTON', 'A' ]`; the
others are `Cannot read properties of null` (there is no button yet).

- [ ] **Step 6: The box: button, arrow, count, name**

Two pieces of state, each read once when the row mounts (a `useState` initialiser): `voted` and `count`. In this
step they start from `initialVoted` and `initialCount`; Step 8 puts the remembered answer in front of them.
The returned JSX, exactly (the press handler comes in Step 8):

```tsx
<div className="libVoteRow">
  <button type="button" className="libVote" data-library-vote aria-pressed={voted}
    aria-label={tPlural(catalog, "home.upvote.label", count, locale)} aria-describedby={describedBy}>
    <svg className="libVoteArrow" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d="M12 3.5 21 13h-5.2v7.5H8.2V13H3z" />
    </svg>
    <span className="libVoteCount" suppressHydrationWarning>{shortVoteCount(locale, count)}</span>
  </button>
  {children}
</div>
```

- The name carries the exact count (`tPlural` writes the raw number); the box shows the short one.
- `aria-describedby={describedBy}`: React leaves the attribute out when the prop is absent.
- No `fill`, `stroke` or `style` on the `<svg>` or its `<path>`: T10's `.libVoteArrow` rule colours it, and an
  attribute on the path would beat that rule.
- `suppressHydrationWarning` on the count only: from 1000 up it is written by `Intl.NumberFormat`, and the
  server's and the browser's number data can differ (the precedent and its reason:
  `apps/ui/app/new/NewDebatePageClient.tsx:821-833`).

- [ ] **Step 7: Run it and see the cases that need no press pass**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/library-vote.test.tsx`

Expected: `Tests  14 failed | 14 passed (28)`. Passing: "is a real button…", the two "starts from the page's
props", the eight "the spoken name for…", "the box shows the short count…", "points at the row's question…", and
"a failed send is not remembered…" (it only says that nothing is kept, which is true of a box that keeps nothing).
Failing: the fourteen other cases that press.

- [ ] **Step 8: The press, the two lines, and what the box remembers**

Module scope, not exported, above the component:

```tsx
/** The server's last answer for a row, and the props that row had when the answer came. Written by the press handler only. */
const settled = new Map<string, Readonly<{ fromVoted: boolean; fromCount: number; voted: boolean; count: number }>>();
```

- The two `useState` initialisers now read it: when `settled.get(publicRef)` exists and its `fromVoted` and
  `fromCount` equal `initialVoted` and `initialCount`, start from its `voted` and `count`; otherwise from the props.
  Nothing is written to the map while rendering, and a stale entry is not deleted there either.
- `settle(voted, count)`, a function inside the component: sets both pieces of state and writes
  `settled.set(publicRef, { fromVoted: initialVoted, fromCount: initialCount, voted, count })`.
- `say(line)`, a function inside the component, `line` being `"SIGN_IN"` or `"FAILED"`: sets the note and calls
  `announce(t(catalog, line === "SIGN_IN" ? "home.upvote.signedOut" : "home.upvote.failed"))`.

Add to the component: `note`, a state of `"NONE" | "SIGN_IN" | "FAILED"` starting at `"NONE"`; `inFlight`, a
`useRef(false)`; an async `press()`; and `onClick={() => { void press(); }}` on the button. `press()` does this, in
this order:

1. If `!signedIn || holdsNoSession()`: `say("SIGN_IN")` and return. Nothing is sent; `voted` and `count` stay.
2. If `inFlight.current`: return. Nothing changes.
3. Remember `voted` and `count` as they are now. Let `vote = !voted` and `shown = count + 1` for a vote or
   `Math.max(0, count - 1)` for taking it back. Set `inFlight.current = true`, the note to `"NONE"`, `voted` to
   `vote` and `count` to `shown`.
4. `await send(publicRef, vote)`. On an answer: `settle(answer.voted, answer.vote_count)`.
5. On a throw, the first of these that applies:
   - `holdsNoSession()` is true now (the session ended on the server and the website dropped its cookie): put the
     remembered `voted` and `count` back, `say("SIGN_IN")`.
   - the thrown value is an object whose `status` is `404`, and this press was taking a vote back
     (`vote === false`): `settle(false, shown)`. No line. The vote is gone on the server.
   - anything else (a cast answered 404 included): put the remembered `voted` and `count` back, `say("FAILED")`.
     Nothing is remembered.
   Only `status` is read from the error; nothing is logged.
6. In `finally`: `inFlight.current = false`.

After `{children}`, only while the note is not `"NONE"`, one `<p className="libVoteNote" role="status">`. For
`"SIGN_IN"` its only child is `<Link href={signInHref}>{t(catalog, "home.upvote.signedOut")}</Link>` (the whole
line is the link). For `"FAILED"` its only child is the text `t(catalog, "home.upvote.failed")`.

- [ ] **Step 9: Run it and see it pass**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/library-vote.test.tsx`

Expected: `Test Files  1 passed (1)`, `Tests  28 passed (28)`, and no React warning about `act` in the output.

- [ ] **Step 10: Verify**

Each command with the prefix
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`:

| Command | Expected |
|---|---|
| `pnpm exec vitest run tests/render/library-vote.test.tsx` | `Tests  28 passed (28)` |
| `pnpm --filter dialectical-engine-v2ui typecheck` | exit 0 (no `error TS` line) |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test --test-concurrency=1 scripts/no-hardcoded-english.test.mjs scripts/server-client-boundary.source-test.mjs lib/i18n/catalogThreading.test.mjs lib/i18n/catalogNamespaces.test.mjs` | `ℹ pass 13`, `ℹ fail 0`, files unedited |
| `pnpm run audit:text-bytes` | `REPOSITORY_TEXT_CONTROL_BYTES=0` (the test holds Romanian letters as plain UTF-8, LF line ends) |
| `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` | one failure, the shipped-file manifest: `missing` is `[]` and `added` holds only files this slice created, `apps/ui/components/LibraryVote.tsx` among them. T15 lists them; do not edit the manifest here |
| `grep -c -e "disabled=" -e aria-disabled -e useChromeI18n -e useEffect -e Storage -e "router\." apps/ui/components/LibraryVote.tsx` | `0` (keep these names out of the comment too, so the count means what it says) |
| `grep -c "settled.set(" apps/ui/components/LibraryVote.tsx` | `1`: one writer, inside `settle`, which only the press handler calls |
| `git status --short` | the two paths of this task, and nothing else of yours |

- [ ] **Step 11: Commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add apps/ui/components/LibraryVote.tsx tests/render/library-vote.test.tsx
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "A public debate's row gets its vote box: a button beside the row's link that shows a press at once and puts it back when the vote cannot be saved." -m "LibraryVote is a client component that wraps the row's unchanged link. Its words are handed in, so it renders in any language; it is never switched off; a browser with no session, or one whose session ended on the server, sends nothing more and is shown the sign-in link. A vote taken back on a debate that left the list ends not upvoted. The box remembers the server's last answer per row, so coming back from a debate shows the vote as the person left it. Both lines are also said through the layout's live region. No page mounts it yet: the rows and the home page do, in their own task. Test: tests/render/library-vote.test.tsx." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Never `git add -A` or `git add .`: the tree holds untracked plan and design files that are not this task's. The
commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The last
`-m` is the attribution line; if your session's instructions give another one, use theirs.
