// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunEventSchema, type PublicDebateSummary, type RunEvent } from "@debateai/contract";
import { PublicDebatesBuffer } from "../../apps/ui/components/DebatesBuffer.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../../apps/ui/components/consent/ConsentSettingsPanel.js";
import { ConsentCatalogProvider } from "../../apps/ui/components/consent/useConsentCatalog.js";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";
import { applyRunEvent, createLiveRunState, liveTreeFromState } from "../../apps/ui/lib/v3/liveEvents.js";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

// FIX-DEBATE-CATALOGS follow-up 3: the two English leftovers found by
// follow-up 2 — the public library rows' verdict word and the consent copy's
// first paint — both come from the reader's locale now.

function catalogValue(locale: string, namespace: string, key: string): string {
  const catalog = JSON.parse(
    // Resolved from the lane root: under jsdom import.meta.url is not a file URL (TOOLING-TRAPS).
    readFileSync(resolve(process.cwd(), `apps/ui/messages/${locale}/${namespace}.json`), "utf8")
  ) as Record<string, string>;
  const value = catalog[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${locale}/${namespace} lacks ${key}`);
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function publicRow(verdict: PublicDebateSummary["verdict"], index: number): PublicDebateSummary {
  return {
    public_ref: `00000000-0000-4000-8000-00000000000${index}`,
    author_pseudonym: "reader",
    question: `Question ${index}?`,
    published_at: "2026-09-01T00:00:00.000Z",
    models: [],
    verdict,
    confidence_band: null
  };
}

const VERDICTS = [
  ["SUPPORTED", "home.verdict.supported"],
  ["CONTESTED", "home.verdict.contested"],
  ["UNSUPPORTED", "home.verdict.unsupported"],
  ["SPLIT", "home.verdict.split"]
] as const;

async function renderLibrary(locale: "en" | "ro"): Promise<string> {
  const [home, chrome, time, compose] = await Promise.all([
    loadNamespace(locale, "home"),
    loadNamespace(locale, "chrome"),
    loadNamespace(locale, "time"),
    loadNamespace(locale, "compose")
  ]);
  return renderToStaticMarkup(
    <PublicDebatesBuffer
      debates={VERDICTS.map(([verdict], index) => publicRow(verdict, index))}
      catalog={{ ...home, ...chrome }}
      timeCatalog={time}
      locale={locale}
      composeCatalog={compose}
    />
  );
}

describe("public library rows name the verdict from the locale catalogue", () => {
  it("renders every verdict word from the reader's home catalogue", async () => {
    // Every non-en locale carries the English placeholder until the translation
    // seat runs, so the assertion is that the row shows the CATALOGUE value —
    // proven by giving the locale a value the enum could never produce.
    const html = await renderLibrary("ro");
    for (const [, key] of VERDICTS) expect(html).toContain(escapeHtml(catalogValue("ro", "home", key)));
    const [home, chrome, time, compose] = await Promise.all([
      loadNamespace("ro", "home"),
      loadNamespace("ro", "chrome"),
      loadNamespace("ro", "time"),
      loadNamespace("ro", "compose")
    ]);
    const marked = renderToStaticMarkup(
      <PublicDebatesBuffer
        debates={VERDICTS.map(([verdict], index) => publicRow(verdict, index))}
        catalog={{
          ...home,
          ...chrome,
          "home.verdict.supported": "SUP-ro",
          "home.verdict.contested": "CON-ro",
          "home.verdict.unsupported": "UNS-ro",
          "home.verdict.split": "SPL-ro"
        }}
        timeCatalog={time}
        locale="ro"
        composeCatalog={compose}
      />
    );
    // MUT: restore `verdict.charAt(0) + verdict.slice(1).toLowerCase()` -> RED.
    for (const word of ["SUP-ro", "CON-ro", "UNS-ro", "SPL-ro"]) expect(marked).toContain(word);
    for (const word of ["Supported", "Contested", "Unsupported", "Close call"]) expect(marked).not.toContain(`>${word}<`);
  });

  it("keeps Supported and Unsupported as the old title-cased enum; CONTESTED reads Close call and SPLIT Contested (R2, Q1)", async () => {
    const html = await renderLibrary("en");
    for (const word of ["Supported", "Close call", "Unsupported", "Contested"]) expect(html).toContain(word);
    expect(catalogValue("en", "home", "home.verdict.supported")).toBe("Supported");
    expect(catalogValue("en", "home", "home.verdict.unsupported")).toBe("Unsupported");
    expect(catalogValue("en", "home", "home.verdict.contested")).toBe("Close call");
    expect(catalogValue("en", "home", "home.verdict.split")).toBe("Contested");
  });
});

// Upvotes (design 2026-11-26, sections 4 and 7.4): the list hands each row that carries a count to the vote box, with the
// reader's own words. The box itself is tests/render/library-vote.test.tsx's; this is the hand-over.
describe("public library rows carry the vote box in the reader's language", () => {
  const SIGN_IN = "/login?next=%2F%3Ftab%3Dpublic";
  const COUNTS = [0, 1, 2, 20, 1234];
  const plain = COUNTS.map((_, index) => publicRow("SUPPORTED", index));
  const counted = plain.map((row, index) => ({ ...row, vote_count: COUNTS[index]! }));
  const noneVoted = { signedIn: true, voted: new Set<string>(), signInHref: SIGN_IN };

  async function library(debates: readonly PublicDebateSummary[], votes?: typeof noneVoted): Promise<HTMLElement> {
    const [home, chrome, time, compose] = await Promise.all([
      loadNamespace("ro", "home"), loadNamespace("ro", "chrome"), loadNamespace("ro", "time"), loadNamespace("ro", "compose")
    ]);
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <PublicDebatesBuffer debates={debates} catalog={{ ...home, ...chrome }} timeCatalog={time} locale="ro" composeCatalog={compose}
        {...(votes === undefined ? {} : { votes })} />
    );
    return container;
  }

  it("names each box with the Romanian form for its count and writes 1234 as 1,2k", async () => {
    const list = await library(counted, { ...noneVoted, voted: new Set([counted[2]!.public_ref]) });
    const buttons = [...list.querySelectorAll("button[data-library-vote]")];
    // one: 1. few: 0 and 2. other: 20 and 1234 (the "de" form). The spoken name holds the whole number.
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Votați. 0 voturi", "Votați. 1 vot", "Votați. 2 voturi", "Votați. 20 de voturi", "Votați. 1234 de voturi"
    ]);
    expect(buttons.map((button) => button.querySelector(".libVoteCount")?.textContent)).toEqual(["0", "1", "2", "20", "1,2k"]);
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "true", "false", "false"]);
    expect(buttons.map((button) => button.getAttribute("aria-describedby"))).toEqual(counted.map((row) => `lib-claim-${row.public_ref}`));
    expect(list.querySelector("a button")).toBeNull();
    expect(list.querySelectorAll(".libVoteRow > a.libRow[data-library-row]")).toHaveLength(5);
    // MUT: hand the box the English catalogue, or "en" as its locale -> RED.
    expect(list.innerHTML).not.toContain("Upvote");
  });

  it("draws a box only for a row with a count, in a list that was given the votes", async () => {
    const before = (await library(plain)).innerHTML;
    expect(before).not.toMatch(/libVote|lib-claim-|<button/);
    // A count without the votes (every caller but the home page), and the votes without a count (an older API): the old row.
    expect((await library(counted)).innerHTML).toBe(before);
    expect((await library(plain, noneVoted)).innerHTML).toBe(before);
    // An empty list stays the one empty line.
    expect((await library([], noneVoted)).innerHTML).toBe((await library([])).innerHTML);
  });
});

describe("consent copy paints in the reader's locale on its first render", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("server-renders the consent settings copy from the served Hebrew catalogue", async () => {
    const consent = await loadNamespace("he", "consent");
    const html = renderToStaticMarkup(
      <ConsentCatalogProvider catalog={consent}>
        <ConsentSettingsPanel />
      </ConsentCatalogProvider>
    );
    for (const key of ["consent.settings.title", "consent.settings.hint", "consent.settings.button"]) {
      expect(html).toContain(escapeHtml(catalogValue("he", "consent", key)));
      expect(html).not.toContain(escapeHtml(catalogValue("en", "consent", key)));
    }
  });

  it("shows the consent bar in Hebrew on the first paint, with no chunk load in between", async () => {
    const consent = await loadNamespace("he", "consent");
    // The bar is null on the server by design (S01-R06: storage decides whether it
    // shows). Its first CLIENT paint happens in the mount effect; nothing is awaited
    // here, so an asynchronously loaded catalogue could not have arrived yet.
    act(() => {
      root!.render(
        <ConsentCatalogProvider catalog={consent}>
          <CookieConsent />
        </ConsentCatalogProvider>
      );
    });
    const bar = container!.querySelector(".consentBar");
    expect(bar, "the bar opens for a visitor with no stored decision").not.toBeNull();
    const text = bar!.textContent ?? "";
    for (const key of ["consent.bar.title", "consent.bar.body", "consent.bar.acknowledge"]) {
      expect(text).toContain(catalogValue("he", "consent", key));
      // MUT: seed the hook's first state with consentEnglish again -> RED.
      expect(text).not.toContain(catalogValue("en", "consent", key));
    }
  });
});

describe("the final scan's same-class fix: live shared-crux branches", () => {
  let sequence = 0;
  const event = (eventType: RunEvent["event_type"], payload: Record<string, unknown>, subject: string): RunEvent => {
    sequence += 1;
    return RunEventSchema.parse({
      event_id: `event:${sequence}`,
      event_type: eventType,
      run_ref: "run:live",
      subject_ref: subject,
      at_sequence: sequence,
      payload
    });
  };

  it("labels a live shared crux from the reader's compose catalogue, like the served projection", async () => {
    let state = createLiveRunState();
    state = applyRunEvent(state, event("node.spawned", {}, "node:position"));
    state = applyRunEvent(state, event("node.spawned", { parent_ref: "node:position", relation: "shared-crux" }, "node:crux"));
    const compose = await loadNamespace("he", "compose");
    const crux = liveTreeFromState(state, "run:live", "", compose)!.children[0]!.children[0]!;
    expect(crux.node_type).toBe("SHARED-CRUX");
    // MUT: restore the literal "Shared crux" in liveEvents.ts -> RED.
    expect(crux.label).toBe(catalogValue("he", "compose", "compose.v3.sharedCrux"));
    expect(liveTreeFromState(state, "run:live", "")!.children[0]!.children[0]!.label).toBe("Shared crux");
  });
});
