// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as consentModule from "../../apps/ui/lib/consent.js";
import {
  CONSENT_KEY,
  requestPreferences,
  subscribeToPreferenceRequests
} from "../../apps/ui/lib/consent.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";

// The acceptance command is pinned to the lane root, so source fixtures resolve
// from process.cwd(); `import.meta.url` can carry a non-file scheme under vitest
// (TOOLING-TRAPS, CODE-T1C3 / CODE-T5C1).
const MODULE_PATH = resolve(process.cwd(), "apps/ui/lib/consent.ts");
const moduleSource = (): string => readFileSync(MODULE_PATH, "utf8");

const ISO_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * SPEC-v2 R06's seventeen fixtures, verbatim: each is a stored `raw` (null = the key is absent)
 * and the surface R06 expects. Only the last two are ACK.
 */
const R06_FIXTURES: [label: string, raw: string | null, expected: "bar" | "no bar"][] = [
  ["absent key", null, "bar"],
  [
    "the old three-choice record",
    '{"v":1,"essential":true,"quality":true,"analytics":false,"decidedAt":"2026-09-01T00:00:00.000Z"}',
    "bar"
  ],
  ["a v1 record without toggles", '{"v":1,"essential":true,"decidedAt":"2026-09-01T00:00:00.000Z"}', "bar"],
  ["v1 with acknowledgedAt", '{"v":1,"acknowledgedAt":"2026-09-29T00:00:00.000Z"}', "bar"],
  ["v2 with no acknowledgedAt", '{"v":2}', "bar"],
  ["v2 with a date-only acknowledgedAt", '{"v":2,"acknowledgedAt":"2026-09-29"}', "bar"],
  [
    "v2 with a third member",
    '{"v":2,"acknowledgedAt":"2026-09-29T00:00:00.000Z","quality":false}',
    "bar"
  ],
  ["v as the string \"2\"", '{"v":"2","acknowledgedAt":"2026-09-29T00:00:00.000Z"}', "bar"],
  ["v2 with decidedAt instead", '{"v":2,"decidedAt":"2026-09-29T00:00:00.000Z"}', "bar"],
  ["an acknowledged flag", '{"acknowledged":true}', "bar"],
  ["an array", "[]", "bar"],
  ["the null literal", "null", "bar"],
  ["a JSON string", '"ok"', "bar"],
  ["not JSON", "ok", "bar"],
  ["the true literal", "true", "bar"],
  ["the v2 acknowledgement", '{"v":2,"acknowledgedAt":"2026-09-29T00:00:00.000Z"}', "no bar"],
  [
    "the v2 acknowledgement, keys reversed",
    '{"acknowledgedAt":"2026-09-29T00:00:00.000Z","v":2}',
    "no bar"
  ]
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function freshRoot(): void {
  if (root !== null) act(() => root!.unmount());
  container?.remove();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
}

// vitest.config.ts:19 sets fileParallelism:false and there is no shared setup
// file, so a leaked key survives into later test files in the same worker.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  freshRoot();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (root !== null) act(() => root!.unmount());
  root = null;
  container = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const bar = (): HTMLElement | null => document.querySelector<HTMLElement>('.consentBar[role="region"]');

function mountConsent(): void {
  act(() => {
    root!.render(<CookieConsent />);
  });
}

/** The bar's primary control: the acknowledgement (DONE.md 10a: the dark pill, last). */
function acknowledge(): void {
  const primary = document.querySelector<HTMLButtonElement>(".consentBar button.consentPrimary");
  expect(primary, "the bar renders its primary control").not.toBeNull();
  act(() => primary!.click());
}

const stored = (): Record<string, unknown> =>
  JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null") as Record<string, unknown>;

// Non-comment lines, with the comment rule of SPEC-v2 R03(a): a line whose stripped text starts
// with a line-comment, a block-comment opener, or an asterisk is a comment line.
const codeLines = (source: string): string[] =>
  source.split("\n").filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line));

describe("S01 consent storage: one acknowledgement record, one predicate (SPEC-v2 R06)", () => {
  it.each(R06_FIXTURES)(
    "shows the bar exactly when the stored value is not ACK: %s",
    (_label, raw, expected) => {
      // PROPERTY (R06): the mount shows the bar iff ACK(raw) is false, and reading is not
      // writing — the stored value is left exactly as it was found.
      if (raw !== null) localStorage.setItem(CONSENT_KEY, raw);
      mountConsent();

      if (expected === "bar") expect(bar(), "ACK is false: the bar shows").not.toBeNull();
      else expect(bar(), "ACK is true: no bar").toBeNull();
      expect(localStorage.getItem(CONSENT_KEY), "the stored value is left as found").toBe(raw);
    }
  );

  it("shows the bar when reading storage throws", () => {
    // PROPERTY (R06): a read that throws is ACK false.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("refused", "SecurityError");
    });
    mountConsent();
    expect(bar(), "a refused read shows the bar").not.toBeNull();
  });

  it("closes the bar for the page's life when the write throws, and shows it again on the next mount", () => {
    // PROPERTY (R06, last bullet): a refused write is swallowed and still closes the bar; the
    // bar returns on the next full load because nothing was stored.
    mountConsent();
    expect(bar(), "first visit").not.toBeNull();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => acknowledge(), "a refused write raises nothing").not.toThrow();
    expect(bar(), "the bar closes for this page's life").toBeNull();
    setItem.mockRestore();

    freshRoot();
    mountConsent();
    expect(localStorage.getItem(CONSENT_KEY), "nothing was stored").toBeNull();
    expect(bar(), "the next mount shows the bar again").not.toBeNull();
  });

  it("writes exactly {v:2, acknowledgedAt} on the acknowledgement, and the next mount shows no bar", () => {
    // PROPERTY (R06, the value): the press writes an object with exactly the two own members
    // `v` (the number 2) and `acknowledgedAt` (ISO_UTC_MS), taken at the moment of the press.
    mountConsent();
    const before = Date.now();
    acknowledge();
    const after = Date.now();

    expect(bar(), "the acknowledgement closes the bar").toBeNull();
    const value = stored();
    expect(Object.keys(value).sort(), "own keys exactly v and acknowledgedAt").toEqual(["acknowledgedAt", "v"]);
    expect(value.v, "v is the number 2").toBe(2);
    expect(String(value.acknowledgedAt), "acknowledgedAt is ISO_UTC_MS").toMatch(ISO_UTC_MS);
    const taken = Date.parse(String(value.acknowledgedAt));
    expect(taken, "stamped at the press, not cached").toBeGreaterThanOrEqual(before);
    expect(taken, "stamped at the press, not cached").toBeLessThanOrEqual(after);

    freshRoot();
    mountConsent();
    expect(bar(), "the next mount shows no bar").toBeNull();
  });

  it("overwrites the old three-choice record with the v2 value on the acknowledgement", () => {
    // PROPERTY (R06, browser step 9): the old record is not ACK, so the bar shows, and the
    // press overwrites the key with the v2 value.
    localStorage.setItem(
      CONSENT_KEY,
      '{"v":1,"essential":true,"quality":true,"analytics":false,"decidedAt":"2026-09-01T00:00:00.000Z"}'
    );
    mountConsent();
    expect(bar(), "the old record shows the bar").not.toBeNull();
    acknowledge();
    expect(Object.keys(stored()).sort(), "the key now holds the v2 value").toEqual(["acknowledgedAt", "v"]);
    expect(stored().v).toBe(2);
  });

  it("exports no category data and no quality or analytics member", () => {
    // PROPERTY (R03 c): the module carries no category records, no control mapper, the v2
    // schema version, and no code line naming quality or analytics.
    const namespace = consentModule as Record<string, unknown>;
    expect("COOKIE_CATEGORIES" in namespace, "COOKIE_CATEGORIES is exported").toBe(false);
    expect("decisionFor" in namespace, "decisionFor is exported").toBe(false);
    expect(namespace.CONSENT_VERSION, "CONSENT_VERSION").toBe(2);
    const hits = codeLines(moduleSource()).filter((line) => /\b(quality|analytics)\b/.test(line));
    expect(hits, "code lines of lib/consent.ts naming quality or analytics").toEqual([]);
  });

  it("delivers a preference request to its subscriber with the opener, and stops on unsubscribe", () => {
    // PROPERTY (S01-R21): a caller holding no reference to the consent component
    // can still ask it to open the card, and the opener element travels with the
    // request so focus can be returned to it. A store rather than React context,
    // because S01-R07 pins the mount as a SIBLING placed after {children} and a
    // sibling cannot provide context to {children} — forced by the requirement.
    const opener = document.createElement("button");

    expect(() => requestPreferences(opener), "a request with no subscriber raises nothing").not.toThrow();

    const seen: Array<HTMLElement | null> = [];
    const unsubscribe = subscribeToPreferenceRequests((element) => {
      seen.push(element);
    });

    requestPreferences(opener);
    expect(seen, "exactly one call, carrying the opener").toEqual([opener]);

    requestPreferences(null);
    expect(seen, "a request with no opener still arrives").toEqual([opener, null]);

    unsubscribe();
    requestPreferences(opener);
    expect(seen, "unsubscribe stops further delivery").toEqual([opener, null]);

    // A second unsubscribe is harmless, so a component's effect cleanup running
    // twice under StrictMode cannot throw.
    expect(() => unsubscribe(), "unsubscribing twice raises nothing").not.toThrow();
  });
});
