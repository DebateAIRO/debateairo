// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_KEY,
  CONSENT_VERSION,
  COOKIE_CATEGORIES,
  decisionFor,
  readConsent,
  requestPreferences,
  subscribeToPreferenceRequests,
  writeConsent,
  type ConsentDecision
} from "../../apps/ui/lib/consent.js";

// The acceptance command is pinned to the lane root, so source fixtures resolve
// from process.cwd(); `import.meta.url` can carry a non-file scheme under vitest
// (TOOLING-TRAPS, CODE-T1C3 / CODE-T5C1).
const MODULE_PATH = resolve(process.cwd(), "apps/ui/lib/consent.ts");
const moduleSource = (): string => readFileSync(MODULE_PATH, "utf8");

const ISO_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DECISION_MEMBERS = ["analytics", "decidedAt", "essential", "quality", "v"];

function stored(): Record<string, unknown> {
  const raw = localStorage.getItem(CONSENT_KEY);
  expect(raw, `${CONSENT_KEY} is present`).not.toBeNull();
  return JSON.parse(raw!) as Record<string, unknown>;
}

// vitest.config.ts:19 sets fileParallelism:false and there is no shared setup
// file, so a leaked key survives into later test files in the same worker.
// Precedent: tests/render/t1-canvas.test.tsx:105,133.
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("S01-C2 consent storage contract", () => {
  it("round-trips one decision under debateai.consent with exactly the five members of R01", () => {
    // PROPERTY (S01-R01): a written decision round-trips as an object with
    // exactly the five members R01 names and no others, its `v` is the integer
    // schema version, and its `decidedAt` survives the codec byte-for-byte as an
    // ISO-8601 UTC instant with milliseconds.
    const decidedAt = new Date().toISOString();
    const decision: ConsentDecision = {
      v: CONSENT_VERSION,
      essential: true,
      quality: true,
      analytics: false,
      decidedAt
    };

    writeConsent(decision);

    expect(CONSENT_KEY).toBe("debateai.consent");
    expect(CONSENT_VERSION).toBe(1);
    expect(stored(), "the stored object").toEqual({
      v: 1,
      essential: true,
      quality: true,
      analytics: false,
      decidedAt
    });
    expect(Object.keys(stored()).sort(), "the stored member set").toEqual(DECISION_MEMBERS);
    expect(String(stored().decidedAt), "decidedAt is an ISO-8601 UTC instant").toMatch(ISO_UTC_MS);
    expect(readConsent(), "readConsent round-trips its own write").toEqual(decision);
  });

  it("treats a stored value whose v is not 1 as no decision, and carries no migration code", () => {
    // PROPERTY (S01-R02): a stored value whose `v` is not the integer 1 is
    // indistinguishable from no decision, so the caller re-asks; and no branch
    // exists for any other version, because migration code for a case that
    // cannot occur would be untested code.
    localStorage.setItem(
      CONSENT_KEY,
      '{"v":0,"essential":true,"quality":true,"analytics":true,"decidedAt":"2026-01-01T00:00:00.000Z"}'
    );
    expect(readConsent(), "a v:0 value is no decision").toBeNull();

    localStorage.setItem(
      CONSENT_KEY,
      '{"v":2,"essential":true,"quality":true,"analytics":true,"decidedAt":"2026-01-01T00:00:00.000Z"}'
    );
    expect(readConsent(), "a v:2 value is no decision").toBeNull();

    localStorage.setItem(
      CONSENT_KEY,
      '{"v":"1","essential":true,"quality":true,"analytics":true,"decidedAt":"2026-01-01T00:00:00.000Z"}'
    );
    expect(readConsent(), "the string \"1\" is not the integer 1").toBeNull();

    const source = moduleSource();
    expect(source, "no branch on a version other than 1").not.toMatch(/\bv\s*===\s*(?!1\b)\d/);
    expect(source.toLowerCase(), "no migration code").not.toContain("migrat");
  });

  it("re-asks for an absent, unparseable, non-object or short value, and never throws on any access", () => {
    // PROPERTY (S01-R03, S01-R05): every localStorage access is inside try/catch
    // (house precedent apps/ui/components/ModeToggle.tsx:23-27,
    // apps/ui/app/layout.tsx:39-42), so a read failure is reported as "no
    // decision" and a write failure is swallowed; neither propagates to a caller.
    expect(readConsent(), "absent key").toBeNull();

    for (const [label, raw] of [
      ["unparseable", "not json"],
      ["an array, not an object", "[]"],
      ["null literal", "null"],
      ["missing four of the five members", '{"v":1}'],
      ["missing decidedAt", '{"v":1,"essential":true,"quality":true,"analytics":false}'],
      ["essential omitted", '{"v":1,"quality":true,"analytics":false,"decidedAt":"2026-01-01T00:00:00.000Z"}'],
      // R01 declares `essential` always true; a record saying otherwise was not
      // written by this module, so it is no decision — the conservative reading.
      [
        "essential not true",
        '{"v":1,"essential":false,"quality":true,"analytics":false,"decidedAt":"2026-01-01T00:00:00.000Z"}'
      ]
    ] as const) {
      localStorage.setItem(CONSENT_KEY, raw);
      expect(readConsent(), label).toBeNull();
    }

    localStorage.clear();
    expect(readConsent(), "clearing site data restores the first-visit state").toBeNull();

    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("refused", "SecurityError");
    });
    expect(() => readConsent(), "a refused read raises nothing").not.toThrow();
    expect(readConsent(), "a refused read is no decision").toBeNull();
    getItem.mockRestore();

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(
      () =>
        writeConsent({
          v: CONSENT_VERSION,
          essential: true,
          quality: false,
          analytics: false,
          decidedAt: new Date().toISOString()
        }),
      "a refused write raises nothing"
    ).not.toThrow();
    setItem.mockRestore();
  });

  it("writes exactly the four control rows of R04, stamping v and the moment of the call", () => {
    // PROPERTY (S01-R04): `Accept all` writes true/true/true; both `Essential
    // only` entry points write the byte-identical object true/false/false
    // whatever the card's toggles currently say; `Save choices` writes true plus
    // the two current toggle values; and every one sets `v` to 1 and `decidedAt`
    // to the moment of the call, never a value cached earlier.
    const before = Date.now();

    // R04 row 1 — `Accept all`, from the bar.
    const acceptAll = decisionFor("accept-all");
    // R04 row 2 — `Essential only`, from the bar, which carries no toggles.
    const essentialFromBar = decisionFor("essential-only");
    // R04 row 3 — `Essential only`, from the card, which does carry toggles and
    // must ignore them: the entry point is never a discriminator of behaviour.
    const essentialFromCard = decisionFor("essential-only", { quality: true, analytics: true });
    // R04 row 4 — `Save choices`, from the card, at the current toggles.
    const saveChoices = decisionFor("save-choices", { quality: false, analytics: true });

    const after = Date.now();

    expect(acceptAll, "R04 row 1 — Accept all (bar)").toMatchObject({
      v: 1,
      essential: true,
      quality: true,
      analytics: true
    });
    expect(essentialFromBar, "R04 row 2 — Essential only (bar)").toMatchObject({
      v: 1,
      essential: true,
      quality: false,
      analytics: false
    });
    expect(essentialFromCard, "R04 row 3 — Essential only (card)").toMatchObject({
      v: 1,
      essential: true,
      quality: false,
      analytics: false
    });
    expect(saveChoices, "R04 row 4 — Save choices (card)").toMatchObject({
      v: 1,
      essential: true,
      quality: false,
      analytics: true
    });

    const withoutStamp = ({ decidedAt: _stamp, ...rest }: ConsentDecision): unknown => rest;
    expect(
      withoutStamp(essentialFromBar),
      "Essential only is one object, whichever control produced it"
    ).toEqual(withoutStamp(essentialFromCard));

    for (const decision of [acceptAll, essentialFromBar, essentialFromCard, saveChoices]) {
      expect(Object.keys(decision).sort(), "the member set of every row").toEqual(DECISION_MEMBERS);
      expect(decision.decidedAt, "decidedAt is an ISO-8601 UTC instant").toMatch(ISO_UTC_MS);
      const taken = Date.parse(decision.decidedAt);
      expect(taken, "decidedAt is read at the moment of the call, not cached").toBeGreaterThanOrEqual(
        before
      );
      expect(taken, "decidedAt is read at the moment of the call, not cached").toBeLessThanOrEqual(
        after
      );
    }

    writeConsent(saveChoices);
    expect(readConsent(), "the written row round-trips").toEqual(saveChoices);
    expect(String(stored().decidedAt)).toMatch(ISO_UTC_MS);
  });

  it("carries the three category records with the twelve strings byte-exact, in the design's order", () => {
    // PROPERTY (S01-R28, S01-R16): the three category records carry the twelve
    // strings of SPEC §Copy verbatim, in `cookieCats` order, and they live in
    // exactly one place — so the contested cookie-name ruling (row Q7-01) is a
    // one-line data edit rather than a component change.
    expect(COOKIE_CATEGORIES, "the three records, in the design's order").toEqual([
      {
        id: "essential",
        name: "Essential",
        tag: "ALWAYS ON",
        description:
          "Session, MFA state and the device record that lets you spot a login you do not recognise.",
        detail: "de_session · de_mfa · de_device — 30 days",
        locked: true,
        defaultOn: true
      },
      {
        id: "quality",
        name: "Model quality telemetry",
        tag: "OPTIONAL",
        description:
          "Which arguments you challenge or flag, used to tune judge panels. Never tied to your debates’ text.",
        detail: "de_quality — 90 days · first-party",
        locked: false,
        defaultOn: true
      },
      {
        id: "analytics",
        name: "Product analytics",
        tag: "OPTIONAL",
        description:
          "Aggregate page and feature usage. No cross-site tracking, no advertising, never sold.",
        detail: "de_analytics — 90 days · first-party",
        locked: false,
        defaultOn: false
      }
    ]);

    // The extract at design-data.js:89 holds the six-character ASCII escape
    // ’ where the reader must see ’. Copying that escape into a TypeScript
    // literal is correct (the language decodes it); copying it into JSON, a raw
    // template literal or JSX text ships six visible characters. These two
    // assertions fail either way round.
    expect(COOKIE_CATEGORIES[1]!.description, "the apostrophe is decoded").toContain(
      "debates’ text"
    );
    for (const category of COOKIE_CATEGORIES) {
      for (const value of [category.name, category.tag, category.description, category.detail]) {
        expect(value, `${category.id}: no undecoded escape reaches the reader`).not.toMatch(
          /\\u[0-9a-fA-F]{4}/
        );
      }
    }

    // The three ids are the three decision members, so a category and the
    // boolean it governs cannot drift apart.
    expect(COOKIE_CATEGORIES.map((category) => category.id), "ids are the decision members").toEqual([
      "essential",
      "quality",
      "analytics"
    ]);
    expect(COOKIE_CATEGORIES[0]!.locked, "Essential is the one locked category").toBe(true);
    expect(
      COOKIE_CATEGORIES.filter((category) => category.locked).length,
      "exactly one locked category"
    ).toBe(1);

    // Containment: every one of the twelve strings occurs in the module exactly
    // as many times as the records use it — once each, except `OPTIONAL`, which
    // two categories share. That is what makes a V ruling on the cookie names a
    // one-line data edit rather than a component change.
    const source = moduleSource();
    const strings = COOKIE_CATEGORIES.flatMap((category) => [
      category.name,
      category.tag,
      category.description,
      category.detail
    ]);
    expect(strings, "twelve strings").toHaveLength(12);
    for (const value of new Set(strings)) {
      const used = strings.filter((candidate) => candidate === value).length;
      expect(source.split(value).length - 1, `"${value}" occurs ${used}x in consent.ts`).toBe(used);
    }
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
