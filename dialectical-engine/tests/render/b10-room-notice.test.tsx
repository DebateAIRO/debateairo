// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";

/**
 * Budget spec §1.3/§2.11 and paid-plans spec §2.3.4, §2.9. Before asking, the
 * page reads the room and shows:
 *  - nothing when the ask FITS;
 *  - B or P5 when it is CLOSE;
 *  - A or P1–P4 when a limit is FULL. The ask button stays active, and the
 *    question will wait. The highest plan is offered no upgrade.
 *  - D when one question already waits, with a link to the waiting debate. The
 *    ask button is disabled, except for a question the crisis check flags: that one
 *    enables it, and Start opens the help numbers (crisis-support.test.tsx).
 * The room read is advisory: when it fails, nothing is shown and asking works
 * as before. When it names the server-decided plan (billing on), the Free/Premium
 * chooser is hidden and the page names that plan instead (ruling Q-8).
 */
const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(),
  validateSession: vi.fn(),
  readSession: vi.fn(),
  getAskRoom: vi.fn(),
  push: vi.fn()
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stubs/next-navigation.js")>()),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  createDebate: mocks.createDebate,
  validateSession: mocks.validateSession,
  // readSensitiveDataConsent: the colleague's first-debate consent (feat/sensitive-data-consent, R3-6)
  // asks it before a submit once that branch has merged. This account already agreed; before the
  // merge nothing reads it.
  contractClient: {
    readSession: mocks.readSession,
    getAskRoom: mocks.getAskRoom,
    readSensitiveDataConsent: async () => ({ status: "given" as const })
  }
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("test-token")
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));

import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import { LibraryComposer } from "../../apps/ui/components/LibraryComposer.js";
import { RoomNotice } from "../../apps/ui/components/billing/RoomNotice.js";
import { formatReset } from "../../apps/ui/lib/billing/formatReset.js";
import { composerRoomCatalog } from "../../apps/ui/lib/billing/roomCatalog.js";

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalogue = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const en = catalogue("en", "newDebate");
// Thirty days ahead: always the date branch, whatever the machine's clock and zone.
const RESET = new Date(Date.now() + 30 * 86_400_000).toISOString();
const timed = (key: string, locale = "en") =>
  catalogue(locale, "newDebate")[key]!.replace("{time}", formatReset(new Date(RESET), new Date(), locale));
const room = (overrides: Record<string, unknown>) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null, ...overrides
});

let root: Root | null = null;

/**
 * Several act rounds, because reads chain: a room read can name the plan, the
 * chooser then follows it, the query changes and the room is read again. Each
 * round lets the pending reads settle, and its exit flushes the effects they
 * trigger.
 */
async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
  }
}

async function mount(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await settle();
  return container;
}

async function type(field: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function click(container: HTMLElement, selector: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>(selector)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

async function submitForm(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

const newPage = () => (
  <NewDebatePage catalog={en} homeCatalog={catalogue("en", "home")} chromeCatalog={catalogue("en", "chrome")} locale="en" />
);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.createDebate.mockReset();
  mocks.validateSession.mockReset().mockResolvedValue(undefined);
  mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
  mocks.getAskRoom.mockReset().mockResolvedValue(room({}));
  mocks.push.mockReset();
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("RoomNotice picks exactly one sentence", () => {
  it.each([
    ["nothing when the room read failed", null, null],
    ["nothing when the ask fits", room({ room: "FITS" }), null]
  ])("shows %s", async (_name, value, expected) => {
    const container = await mount(<RoomNotice room={value as never} catalog={en} locale="en" />);
    expect(container.querySelector(".roomNotice")).toBe(expected);
  });

  it.each([
    ["B when the site's day is close", room({ room: "CLOSE", scope: "SITE_DAY" }), en["newDebate.room.siteClose"]],
    ["P5 when a person window is close", room({ room: "CLOSE", scope: "PERSON_WEEK", plan_id: "PLUS" }), en["newDebate.room.personClose"]],
    ["A when the site's day is full", room({ room: "FULL", scope: "SITE_DAY", resets_at: RESET }), en["newDebate.room.siteFull"]]
  ])("shows %s, with no upgrade link", async (_name, value, expected) => {
    const container = await mount(<RoomNotice room={value as never} catalog={en} locale="en" />);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(expected);
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
  });

  it.each([
    ["P1 for the day", room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, plan_id: "PLUS" }), "newDebate.room.personDayFull"],
    ["P2 for the week", room({ room: "FULL", scope: "PERSON_WEEK", resets_at: RESET, plan_id: "PRO" }), "newDebate.room.personWeekFull"],
    ["P3 for a paid month", room({ room: "FULL", scope: "PERSON_MONTH", resets_at: RESET, plan_id: "PLUS" }), "newDebate.room.personMonthFull"],
    ["P4 for Free's month", room({ room: "FULL", scope: "PERSON_MONTH", resets_at: RESET, plan_id: "FREE" }), "newDebate.room.freeMonthFull"]
  ])("shows %s with its reset time and the plans link", async (_name, value, key) => {
    const container = await mount(<RoomNotice room={value as never} catalog={en} locale="en" />);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(timed(key));
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe(RESET);
    expect(container.querySelector('a[href="/pricing"]')?.textContent).toBe(en["newDebate.room.upgradeLink"]);
  });

  it.each([
    ["the day", "PERSON_DAY", "newDebate.room.personDayFullTopPlan"],
    ["the week", "PERSON_WEEK", "newDebate.room.personWeekFullTopPlan"],
    ["the month", "PERSON_MONTH", "newDebate.room.personMonthFullTopPlan"]
  ])("offers the highest plan (Max) no upgrade when %s is full: no clause, no plans link", async (_name, scope, key) => {
    const container = await mount(<RoomNotice room={room({ room: "FULL", scope, resets_at: RESET, plan_id: "MAX" }) as never} catalog={en} locale="en" />);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(timed(key));
    expect(container.querySelector(".roomNoticeText")?.textContent).not.toContain("upgrade");
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
  });

  /**
   * Final review Part 1b, Important 1: the window is full only because of the
   * person's own running debates, so the question starts as soon as one of
   * them finishes. ONE sentence instead of P1–P4, whatever the scope or plan:
   * no time and no upgrade offer.
   */
  it.each([
    ["today's window on Plus", "PERSON_DAY", "PLUS"],
    ["this week's window on Pro", "PERSON_WEEK", "PRO"],
    ["Free's month", "PERSON_MONTH", "FREE"],
    ["the month on the highest plan", "PERSON_MONTH", "MAX"]
  ])("shows the own-debates sentence instead of P1–P4 for %s: no time, no plans link", async (_name, scope, planId) => {
    const nextTick = new Date(Date.now() + 60_000).toISOString();
    const container = await mount(<RoomNotice
      room={room({ room: "FULL", scope, resets_at: nextTick, plan_id: planId, waits_for: "OWN_DEBATES" }) as never}
      catalog={en} locale="en" />);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(en["newDebate.room.ownDebatesFull"]);
    expect(container.querySelector("time")).toBeNull();
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
    expect(container.querySelector(".roomNotice")?.getAttribute("data-room")).toBe("FULL");
  });

  it("speaks the own-debates sentence in the interface's language, through the composer's room keys", async () => {
    const ro = catalogue("ro", "newDebate");
    const container = await mount(<RoomNotice
      room={room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, plan_id: "PLUS", waits_for: "OWN_DEBATES" }) as never}
      catalog={composerRoomCatalog(ro)} locale="ro" />);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(ro["newDebate.room.ownDebatesFull"]);
  });

  it("shows D with the waiting debate's start and a link to it", async () => {
    const container = await mount(<RoomNotice
      room={room({ room: "ALREADY_WAITING", resets_at: RESET, waiting_run_ref: "run:waiting" }) as never}
      catalog={en} locale="en" />);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(timed("newDebate.room.alreadyWaiting"));
    expect(container.querySelector('a[href="/debate/run%3Awaiting"]')?.textContent).toBe(en["newDebate.room.openWaiting"]);
  });

  it("speaks the interface's language", async () => {
    const ro = catalogue("ro", "newDebate");
    const container = await mount(<RoomNotice room={room({ room: "CLOSE", scope: "SITE_DAY" }) as never} catalog={ro} locale="ro" />);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(ro["newDebate.room.siteClose"]);
  });
});

describe("/new reads the room for the ask it would send", () => {
  it("asks with the Free defaults first", async () => {
    await mount(newPage());
    expect(mocks.getAskRoom).toHaveBeenCalledWith({ plan_tier: "free", composition_budget_tier: "low", depth: 2 });
  });

  it("keeps the ask button active when a limit is full: the question will wait (A)", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ room: "FULL", scope: "SITE_DAY", resets_at: RESET }));
    const container = await mount(newPage());
    await type(container.querySelector<HTMLTextAreaElement>("#topic")!, "Cities should ban cars downtown");
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(en["newDebate.room.siteFull"]);
    expect(container.querySelector<HTMLButtonElement>(".ndStart")!.disabled).toBe(false);
  });

  it("disables the ask button while one question already waits (D)", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ room: "ALREADY_WAITING", resets_at: RESET, waiting_run_ref: "run:waiting" }));
    const container = await mount(newPage());
    await type(container.querySelector<HTMLTextAreaElement>("#topic")!, "Cities should ban cars downtown");
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(timed("newDebate.room.alreadyWaiting"));
    expect(container.querySelector<HTMLButtonElement>(".ndStart")!.disabled).toBe(true);
  });

  it("shows nothing and asks as before when the room read fails", async () => {
    mocks.getAskRoom.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down"));
    const container = await mount(newPage());
    expect(container.querySelector(".roomNotice")).toBeNull();
  });

  it("answers a 422 ASK_ALREADY_WAITING by re-reading the room and showing D, not a banner", async () => {
    mocks.getAskRoom
      .mockResolvedValueOnce(room({}))
      .mockResolvedValue(room({ room: "ALREADY_WAITING", resets_at: RESET, waiting_run_ref: "run:waiting" }));
    mocks.createDebate.mockRejectedValue(new ContractHttpError("UNPROCESSABLE", 422, "ASK_ALREADY_WAITING: x", "ASK_ALREADY_WAITING"));
    const container = await mount(newPage());
    await type(container.querySelector<HTMLTextAreaElement>("#topic")!, "Cities should ban cars downtown");
    await submitForm(container);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(timed("newDebate.room.alreadyWaiting"));
    // The session-defaults banner may show (readSession rejects here); no banner repeats D.
    expect([...container.querySelectorAll(".error")].some((banner) => banner.textContent?.includes("One question can wait")))
      .toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("shows D with its time from the 422 body when the room re-read fails", async () => {
    mocks.getAskRoom
      .mockResolvedValueOnce(room({}))
      .mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down"));
    mocks.createDebate.mockRejectedValue(new ContractHttpError(
      "UNPROCESSABLE", 422, "ASK_ALREADY_WAITING: ASK_ALREADY_WAITING", "ASK_ALREADY_WAITING",
      null, { runRef: "run:waiting", waitsUntil: RESET }
    ));
    const container = await mount(newPage());
    await type(container.querySelector<HTMLTextAreaElement>("#topic")!, "Cities should ban cars downtown");
    await submitForm(container);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(timed("newDebate.room.alreadyWaiting"));
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe(RESET);
    expect(container.querySelector('a[href="/debate/run%3Awaiting"]')).not.toBeNull();
    expect([...container.querySelectorAll(".error")].some((banner) => banner.textContent?.includes("One question can wait")))
      .toBe(false);
  });

  it("falls back to the banner only when neither the re-read nor the body carries a time", async () => {
    mocks.getAskRoom
      .mockResolvedValueOnce(room({}))
      .mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down"));
    mocks.createDebate.mockRejectedValue(new ContractHttpError("UNPROCESSABLE", 422, "ASK_ALREADY_WAITING: x", "ASK_ALREADY_WAITING"));
    const container = await mount(newPage());
    await type(container.querySelector<HTMLTextAreaElement>("#topic")!, "Cities should ban cars downtown");
    await submitForm(container);
    expect(container.querySelector(".roomNotice")).toBeNull();
    expect([...container.querySelectorAll(".error")].some((banner) =>
      banner.textContent?.includes(en["requestFailure.kind.ALREADY_WAITING"]!))).toBe(true);
  });
});

describe("/new hides the plan chooser and names the plan the server decided (spec §2.3.4, ruling Q-8)", () => {
  const chooser = (container: HTMLElement) => container.querySelector('.ndTier[role="radiogroup"]');
  const planLine = (container: HTMLElement) => container.querySelector(".ndPlanCurrent")?.textContent ?? null;
  const tierChosen = (container: HTMLElement, tier: "free" | "premium") =>
    container.querySelector(`#planTier-${tier}`)?.getAttribute("aria-checked") === "true";

  it("shows a Free person their plan instead of the chooser, keeps Free's settings disabled, and asks with them", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ plan_id: "FREE" }));
    mocks.createDebate.mockResolvedValue({ id: "run-free" });
    const container = await mount(newPage());
    expect(chooser(container)).toBeNull();
    expect(container.querySelector("#planTier-premium")).toBeNull();
    expect(planLine(container)).toBe(en["newDebate.plan.current.FREE"]);
    expect(container.querySelector<HTMLButtonElement>("#budgetTier-high")!.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#treeDepth")!.disabled).toBe(true);
    await type(container.querySelector<HTMLTextAreaElement>("#topic")!, "Cities should ban cars downtown");
    await submitForm(container);
    expect(mocks.createDebate).toHaveBeenCalledWith(
      "Cities should ban cars downtown",
      expect.objectContaining({ plan_tier: "free", risk_tier: "standard", composition_budget_tier: "low", depth: 2 }),
      "test-token"
    );
  });

  it("moves a paid person to premium once, names their plan, and leaves the settings editable", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ plan_id: "PLUS" }));
    const container = await mount(newPage());
    expect(chooser(container)).toBeNull();
    expect(planLine(container)).toBe(en["newDebate.plan.current.PLUS"]);
    expect(container.querySelector<HTMLButtonElement>("#budgetTier-high")!.disabled).toBe(false);
    await click(container, "#budgetTier-high");
    // The re-read after the move (premium's query) did not move the form again.
    expect(container.querySelector("#budgetTier-high")?.getAttribute("aria-checked")).toBe("true");
    expect(mocks.getAskRoom).toHaveBeenCalledWith({ plan_tier: "premium", composition_budget_tier: "high", depth: 2 });
  });

  it.each(["PRO", "MAX"] as const)("names %s the same way", async (planId) => {
    mocks.getAskRoom.mockResolvedValue(room({ plan_id: planId }));
    const container = await mount(newPage());
    expect(chooser(container)).toBeNull();
    expect(planLine(container)).toBe(en[`newDebate.plan.current.${planId}`]);
  });

  it("keeps today's chooser, and names no plan, when no read names one (billing off, local mode)", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ plan_id: null }));
    const container = await mount(newPage());
    expect(chooser(container)).not.toBeNull();
    expect(planLine(container)).toBeNull();
    await click(container, "#planTier-premium");
    expect(tierChosen(container, "premium")).toBe(true);
    await click(container, "#planTier-free");
    expect(tierChosen(container, "free")).toBe(true);
  });

  it("keeps the chooser hidden after a later read fails: the decided plan is remembered", async () => {
    mocks.getAskRoom
      .mockResolvedValueOnce(room({ plan_id: "PLUS" }))
      .mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down"));
    const container = await mount(newPage());
    // The move to premium changed the query, so the room was read again, and that read failed.
    expect(mocks.getAskRoom.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".roomNotice")).toBeNull();
    expect(chooser(container)).toBeNull();
    expect(planLine(container)).toBe(en["newDebate.plan.current.PLUS"]);
    expect(container.querySelector<HTMLButtonElement>("#budgetTier-high")!.disabled).toBe(false);
  });
});

describe("the home composer shows the same sentences where the person types", () => {
  const composer = (locale: "en" | "ro") => (
    <LibraryComposer
      catalog={{ ...catalogue(locale, "home"), ...catalogue(locale, "chrome") }}
      newDebateCatalog={catalogue(locale, "newDebate")}
      roomCatalog={catalogue(locale, "newDebate")}
      locale={locale}
    />
  );

  it("shows the own-debates sentence under the composer, not P1, when only the person's own debates fill the day", async () => {
    mocks.getAskRoom.mockResolvedValue(room({
      room: "FULL", scope: "PERSON_DAY", resets_at: RESET, plan_id: "PLUS", waits_for: "OWN_DEBATES"
    }));
    const container = await mount(composer("en"));
    expect(container.querySelector(".libComposer .roomNoticeText")?.textContent).toBe(en["newDebate.room.ownDebatesFull"]);
    expect(container.querySelector('.libComposer a[href="/pricing"]')).toBeNull();
  });

  it("shows P1 under the composer when today's plan limit is full", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, plan_id: "PLUS" }));
    const container = await mount(composer("en"));
    expect(container.querySelector(".libComposer .roomNoticeText")?.textContent).toBe(timed("newDebate.room.personDayFull"));
  });

  it("disables the start button while one question waits", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ room: "ALREADY_WAITING", resets_at: RESET, waiting_run_ref: "run:waiting" }));
    const container = await mount(composer("ro"));
    await type(container.querySelector<HTMLTextAreaElement>("#library-claim")!, "Cities should ban cars downtown");
    expect(container.querySelector<HTMLButtonElement>(".libStart")!.disabled).toBe(true);
    expect(container.querySelector(".roomNoticeText")?.textContent).toBe(timed("newDebate.room.alreadyWaiting", "ro"));
  });
});
