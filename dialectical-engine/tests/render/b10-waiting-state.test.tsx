// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DebatesBuffer } from "../../apps/ui/components/DebatesBuffer.js";
import { RESET_TIME_MARK, ResetSentence } from "../../apps/ui/components/billing/ResetSentence.js";
import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient.js";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { formatReset } from "../../apps/ui/lib/billing/formatReset.js";
import { t } from "../../apps/ui/lib/i18n/translate.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("t".repeat(43))
}));

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalogue = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const WAITS_UNTIL = new Date(Date.now() + 30 * 86_400_000).toISOString();
const [before] = catalogue("en", "home")["home.status.waiting"]!.split("{time}");

let root: Root | null = null;
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("sentence C in the home list", () => {
  it("shows the waiting row's sentence with its start, formatted in the browser", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<>{DebatesBuffer({
      debates: [{ id: "run:waiting", topic: "Q?", status: "waiting", created_at: "", completed_at: null, models: [], waits_until: WAITS_UNTIL }],
      catalog: catalogue("en", "home"), timeCatalog: catalogue("en", "time"), locale: "en"
    })}</>));
    expect(container.querySelector(".libStatus")?.textContent).toBe("Waiting");
    expect(container.querySelector(".libRowMeta")?.textContent).toBe(
      catalogue("en", "home")["home.status.waiting"]!.replace("{time}", formatReset(new Date(WAITS_UNTIL), new Date(), "en"))
    );
    expect(container.querySelector(".libRowMeta time")?.getAttribute("datetime")).toBe(WAITS_UNTIL);
  });
});

describe("sentence C on the debate page", () => {
  it("replaces the generic status line while the run waits, and names the state in the pill", () => {
    const html = renderToStaticMarkup(
      <DebatePageClient
        id="run:waiting"
        initialDebate={debateDetailFromRunProjection({
          run_ref: "run:waiting", question_line: "Should cities ban cars downtown?", state: "WAITING",
          terminal_reason: null, hold_until: null, waits_until: WAITS_UNTIL
        } as never)}
        initialPending
        storyLocale="en"
        storyCatalog={publicEnglish}
      />
    );
    expect(html).toContain(before!.trim());
    expect(html).toMatch(new RegExp(`<time datetime="${WAITS_UNTIL.replace(/\./gu, "\\.")}"`, "iu"));
    expect(html).toContain(">Waiting<");
  });
});

describe("a twenty-day wait still says when to the minute (formatReset's date branch keeps the time)", () => {
  const TWENTY_DAYS = new Date(Date.now() + 20 * 86_400_000).toISOString();
  // The clock time of the start in this machine's zone, as the browser would show it.
  const clock = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(TWENTY_DAYS));

  async function mounted(element: React.ReactElement): Promise<HTMLElement> {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(element));
    return container;
  }

  it("in the home list", async () => {
    const container = await mounted(<>{DebatesBuffer({
      debates: [{ id: "run:waiting", topic: "Q?", status: "waiting", created_at: "", completed_at: null, models: [], waits_until: TWENTY_DAYS }],
      catalog: catalogue("en", "home"), timeCatalog: catalogue("en", "time"), locale: "en"
    })}</>);
    const time = container.querySelector(".libRowMeta time")?.textContent ?? "";
    expect(time).toBe(formatReset(new Date(TWENTY_DAYS), new Date(), "en"));
    expect(time).toContain(clock);
  });

  it("on the debate page, whose sentence C the page renders through ResetSentence", async () => {
    const debateChrome = catalogue("en", "debateChrome");
    // The page's markup carries the instant (the static render above); mounted, the
    // same sentence fills in the date with its start time.
    const html = renderToStaticMarkup(
      <DebatePageClient
        id="run:waiting"
        initialDebate={debateDetailFromRunProjection({
          run_ref: "run:waiting", question_line: "Should cities ban cars downtown?", state: "WAITING",
          terminal_reason: null, hold_until: null, waits_until: TWENTY_DAYS
        } as never)}
        initialPending
        storyLocale="en"
        storyCatalog={publicEnglish}
      />
    );
    expect(html).toMatch(new RegExp(`<time datetime="${TWENTY_DAYS.replace(/\./gu, "\\.")}"`, "iu"));
    const container = await mounted(
      <ResetSentence text={t(debateChrome, "debateChrome.status.waiting", { time: RESET_TIME_MARK })} at={TWENTY_DAYS} locale="en" />
    );
    expect(container.textContent).toBe(
      debateChrome["debateChrome.status.waiting"]!.replace("{time}", formatReset(new Date(TWENTY_DAYS), new Date(), "en"))
    );
    expect(container.querySelector("time")?.textContent).toContain(clock);
  });
});
