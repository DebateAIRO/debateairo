// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../../apps/ui/lib/consent.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../../apps/ui/components/consent/ConsentSettingsPanel.js";
import consentEnglish from "../../apps/ui/messages/en/consent.json" with { type: "json" };

/**
 * **Why the card is wrapped rather than driven through the keyboard.**
 *
 * S01-S30/S31/S32 are written as "press Esc", but the Esc listener is not this
 * cluster's to write and does not exist in this lane yet: SPEC §Out of scope
 * bans a second document-level Esc listener, S01-R18 gives the card's Esc,
 * focus trap and focus return to the ONE shared helper
 * `apps/ui/components/consent/modalSemantics.ts`, S02 owns and writes that file,
 * and `S01-C6` — the cluster that consumes it — starts only after the
 * orchestrator merges `slice/consent-s02` into this lane. Measured below in
 * `dispatches Escape into a lane that has no listener yet`: an Escape keydown
 * changes nothing today, and S01-S45's slice-wide guard forbids this cluster
 * from making it change anything.
 *
 * So this cluster pins the DISMISSAL, which is its own, and cluster C6's
 * S01-S40 pins the EVENT, which is the helper's. `onDismiss` is the exact
 * callback `useModalSurface` will invoke; the double below records the props the
 * machine passes and then renders the REAL card, so every other assertion in
 * this file — the scrim, the eight rows, the footer labels — is still made
 * against the shipped component.
 */
const recorder = vi.hoisted(() => ({ props: [] as { onDismiss: () => void }[] }));

vi.mock("../../apps/ui/components/consent/CookiePreferencesCard.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../../apps/ui/components/consent/CookiePreferencesCard.js"
  );
  const Real = actual.CookiePreferencesCard as (props: Record<string, unknown>) => ReactNode;
  return {
    ...actual,
    CookiePreferencesCard: (props: Record<string, unknown>): ReactNode => {
      recorder.props.push(props as unknown as { onDismiss: () => void });
      return createElement(Real, props);
    }
  };
});

// The acceptance command is pinned to the lane root, so source fixtures resolve
// from process.cwd(); `import.meta.url` can carry a non-file scheme under vitest
// (TOOLING-TRAPS, CODE-T1C3 / CODE-T5C1).
const layoutSource = (): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/app/layout.tsx"), "utf8");
const settingsSource = (): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/components/SettingsPageClient.tsx"), "utf8");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// vitest.config.ts:19 sets fileParallelism:false and there is no shared setup
// file, so a leaked key survives into later test files in the same worker.
// Precedent: tests/render/t1-canvas.test.tsx:105,133.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  recorder.props.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const bar = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    `[role="region"][aria-label="${(consentEnglish as Record<string, string>)["consent.bar.label"]}"]`
  );
const card = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');
const scrims = (): number => document.querySelectorAll(".consentScrim").length;

const ACK_AT = "2026-09-29T00:00:00.000Z";

/** A v2 acknowledgement, as `writeConsent(acknowledgementNow())` would leave it (SPEC-v2 R06). */
const seed = (acknowledgedAt = ACK_AT): string => {
  const value = JSON.stringify({ v: 2, acknowledgedAt });
  localStorage.setItem(CONSENT_KEY, value);
  return value;
};

/**
 * SPEC-v2 R06's fourteen STORED fixtures whose ACK is false (all "bar" fixtures but the absent
 * key): each is PRESENT under `debateai.consent` and is still not an acknowledgement, so the
 * machine shows the bar at mount and after every dismissal. The absent key is covered by the
 * cases above; the two ACK fixtures by `consent-storage.test.tsx`.
 */
const INVALID_SEEDS: [string, string][] = [
  ["the old three-choice record", '{"v":1,"essential":true,"quality":true,"analytics":false,"decidedAt":"2026-09-01T00:00:00.000Z"}'],
  ["a v1 record without toggles", '{"v":1,"essential":true,"decidedAt":"2026-09-01T00:00:00.000Z"}'],
  ["v1 with acknowledgedAt", '{"v":1,"acknowledgedAt":"2026-09-29T00:00:00.000Z"}'],
  ["v2 with no acknowledgedAt", '{"v":2}'],
  ["v2 with a date-only acknowledgedAt", '{"v":2,"acknowledgedAt":"2026-09-29"}'],
  ["v2 with a third member", '{"v":2,"acknowledgedAt":"2026-09-29T00:00:00.000Z","quality":false}'],
  ["v as the string \"2\"", '{"v":"2","acknowledgedAt":"2026-09-29T00:00:00.000Z"}'],
  ["v2 with decidedAt instead", '{"v":2,"decidedAt":"2026-09-29T00:00:00.000Z"}'],
  ["an acknowledged flag", '{"acknowledged":true}'],
  ["an array", "[]"],
  ["the null literal", "null"],
  ["a JSON string", '"ok"'],
  ["not JSON", "ok"],
  ["the true literal", "true"]
];

const raw = (): string | null => localStorage.getItem(CONSENT_KEY);
const parsed = (): Record<string, unknown> => JSON.parse(raw() ?? "null") as Record<string, unknown>;

/** The bar's card button (DONE.md 10a: the strong ghost pill), clicked. */
function openFromBar(): void {
  const button = document.querySelector<HTMLButtonElement>(".consentBar button.consentGhostStrong");
  expect(button, "the bar renders its card button").not.toBeNull();
  act(() => button!.click());
}

/** The bar's acknowledgement (DONE.md 10a: the dark primary pill), clicked. */
function acknowledgeOnBar(): void {
  const button = document.querySelector<HTMLButtonElement>(".consentBar button.consentPrimary");
  expect(button, "the bar renders its acknowledgement").not.toBeNull();
  act(() => button!.click());
}

function mountConsent(): void {
  act(() => {
    root!.render(<CookieConsent />);
  });
}

/**
 * The Settings entry, mounted TOGETHER with the machine exactly as the app
 * mounts them: the panel is inside `{children}` and `CookieConsent` is its
 * sibling after it (S01-R07), which is why the request travels through the
 * module-level store in `apps/ui/lib/consent.ts` and not through React context —
 * a sibling cannot provide context to `{children}`.
 */
function mountSettings(): void {
  act(() => {
    root!.render(
      <div className="appShell">
        <ConsentSettingsPanel />
        <CookieConsent />
      </div>
    );
  });
}

/** What the shared helper's Esc arm and backdrop arm will call (S01-R14, R18). */
function dismissCard(): void {
  const latest = recorder.props.at(-1);
  expect(latest, "the machine passed the card an onDismiss").toBeDefined();
  act(() => {
    latest!.onDismiss();
  });
}

function pressEscape(): void {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
}

describe("S01-C5 the consent state machine, its mount and the Settings re-entry", () => {
  it("renders nothing on the server and nothing on the first client pass, and no second pre-paint script", () => {
    // PROPERTY (S01-R06): the surface contributes nothing to server-rendered
    // markup and nothing to the first client render, so a returning visitor
    // never sees the bar flash and the server and client markup cannot disagree.
    // The neighbouring precedent invites the opposite mistake: layout.tsx:36-42
    // DOES run a blocking pre-paint script, because a wrong THEME flashes
    // visibly. A consent bar that is briefly ABSENT is invisible, so consent
    // gets the opposite treatment — render nothing until an effect has read
    // storage. jsdom has no paint: the flash itself is V's, acceptance step 1.
    expect(renderToStaticMarkup(<CookieConsent />), "server-rendered markup").toBe("");

    let firstPass = "unset";
    act(() => {
      // flushSync completes the render pass; passive effects still run at the
      // end of `act`, so this reads the DOM between the two.
      flushSync(() => {
        root!.render(<CookieConsent />);
      });
      firstPass = container!.innerHTML;
    });

    expect(firstPass, "the first client render pass").toBe("");
    expect(bar(), "the bar after the effect has read storage").not.toBeNull();

    // No second pre-paint reader: the mode guard is still the only inline
    // script in the document, so `t9-mode-tokens` -> "keeps the pre-paint
    // storage guard inside head and before body" keeps its single subject.
    expect(layoutSource().split("<script").length - 1, "inline scripts in layout.tsx").toBe(1);
  });

  it("is mounted exactly once, app-wide, after {children} and never before <TopBar />", () => {
    // PROPERTY (S01-R07): the consent surface is mounted exactly once, app-wide,
    // in a position that leaves `<TopBar />` the immediately adjacent first child
    // of `.appShell`. That placement is not taste: `t3-library.test.tsx:236`
    // asserts `/<div className="appShell">\s*<TopBar \/>/` and mounting between
    // them is the one position that would break it. Whether the bar appears on
    // every ROUTE is V's, acceptance step 12 (`/`, `/sign-up`, `/settings`).
    const source = layoutSource();

    expect(source, "the mount sits immediately after {children}").toMatch(
      /\{children\}<\/AuthCatalogProvider>\s*<CookieConsent \/>/
    );
    expect(source.split("<CookieConsent").length - 1, "exactly one mount").toBe(1);
    expect(source.split("import { CookieConsent }").length - 1, "exactly one import").toBe(1);
    expect(source, "TopBar is still the first child of appShell").toMatch(
      /<div className="appShell">\s*<TopBar \/>/
    );

    // `t3-library.test.tsx:244` and `t9-landing.test.tsx:121-125` assert on the
    // ordered set of landing markers; the consent surface carries none, so both
    // stay green (they are named in SPEC §Tests to update for this reason).
    expect(
      document.querySelectorAll("[data-landing-section]").length,
      "the consent surface carries no landing marker"
    ).toBe(0);
    act(() => {
      root!.render(<CookieConsent />);
    });
    expect(
      document.querySelectorAll("[data-landing-section]").length,
      "still none once the bar is rendered"
    ).toBe(0);
  });

  it("makes the bar a function of storage alone: clearing site data restores the first visit", () => {
    // PROPERTY (S01-R05): the bar's presence is a function of storage and of
    // nothing else — no session flag, no module-level "already shown" boolean —
    // so removing the key and remounting reproduces a first visit exactly.
    // jsdom's `localStorage.clear()` is the stand-in for the browser's own
    // "Clear site data"; the real one is V's, acceptance step 5.
    seed();
    mountConsent();
    expect(bar(), "a stored acknowledgement keeps the bar away").toBeNull();

    localStorage.clear();
    act(() => root!.unmount());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mountConsent();

    expect(bar(), "the bar is back after the key is cleared").not.toBeNull();
    expect(raw(), "nothing was re-written by the remount").toBeNull();
  });

  it("opens the card over a hidden bar, and the acknowledgement writes the v2 record and lands in silence", () => {
    // PROPERTY (S01-R14, SPEC-v2 R06): the machine's three states are mutually exclusive —
    // with the card open the bar is not rendered ANYWHERE in the app — and the one terminal
    // control, the bar's acknowledgement, writes exactly the v2 record and lands in Silent.
    mountConsent();
    expect(bar(), "first visit shows the bar").not.toBeNull();
    expect(scrims(), "no scrim before the card is opened").toBe(0);

    openFromBar();
    expect(bar(), "the bar is not rendered while the card is open").toBeNull();
    expect(card(), "the card is open").not.toBeNull();
    expect(scrims(), "exactly one scrim").toBe(1);

    dismissCard();
    expect(bar(), "closing the card without acknowledging returns the bar").not.toBeNull();
    expect(raw(), "and writes nothing").toBeNull();

    acknowledgeOnBar();
    expect(bar(), "the acknowledgement leaves no bar").toBeNull();
    expect(card(), "and no card").toBeNull();
    expect(Object.keys(parsed()).sort(), "exactly the two members of the v2 record").toEqual(["acknowledgedAt", "v"]);
    expect(parsed().v, "v is the number 2").toBe(2);
    expect(String(parsed().acknowledgedAt), "acknowledgedAt is ISO_UTC_MS").toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it("returns the bar when the card is dismissed from the first-visit entry, and writes nothing", () => {
    // PROPERTY (S01-R14, S01-S30): dismissing the card without deciding is NOT a
    // decision — it restores the state the visitor was in, and storage is
    // untouched. A backdrop click takes the same route (`onDismiss`); which
    // gestures reach it is the shared helper's, pinned in C6 and by V's
    // acceptance step 11.
    mountConsent();
    openFromBar();
    expect(card(), "the card is open").not.toBeNull();

    dismissCard();

    expect(bar(), "the bar is back").not.toBeNull();
    expect(card(), "the card is gone").toBeNull();
    expect(raw(), "a dismissal writes nothing").toBeNull();
  });

  it("dispatches Escape into a lane that now HAS the shared listener, and records what it does", () => {
    // NOT a requirement — a MEASUREMENT, kept so the reason the three dismissal
    // cases above and below drive `onDismiss` instead of the keyboard is a fact
    // in the record rather than a claim in a handoff.
    //
    // **CHANGED BY C6, exactly as this case said it would be.** In C5 the lane had
    // no document-level listener at all and this case recorded that an Escape
    // keydown changed nothing. Cluster C6 wired `CookiePreferencesCard` to the ONE
    // shared helper `modalSemantics.ts` (S02's), so the same keydown now reaches
    // the card's `onClose` — which is the very `onDismiss` the cases around it
    // call directly. Both routes therefore land on the same callback, and the
    // three dismissal cases still exercise it directly because THIS file's subject
    // is the state machine, not the keystroke. The keystroke's own contract — one
    // Escape moves the visitor exactly ONE surface, with the policy modal open
    // over the card — is S01-S40's, pinned in `tests/render/consent-policy-link.test.tsx`.
    mountConsent();
    openFromBar();

    pressEscape();

    expect(card(), "the shared helper's Esc arm reaches onDismiss").toBeNull();
    expect(bar(), "so the bar returns, because nothing valid is stored").not.toBeNull();
    expect(raw(), "and nothing was written").toBeNull();
  });

  it("gives Settings one Privacy panel whose button opens the same card", () => {
    // PROPERTY (R07, S01-R21): Settings keeps one Privacy panel, present whether or not an
    // acknowledgement is stored, whose hint and button promise no choice, and whose button opens
    // the same read-only card without writing anything. Whether the panel LOOKS like the rest
    // of the page is V's, DONE.md step 11.
    const before = seed();
    mountSettings();

    const catalog = consentEnglish as Record<string, string>;
    expect(document.querySelector(".setSectionTitle")?.textContent, "section title").toBe("Privacy");
    expect(catalog["consent.settings.title"]).toBe("Privacy");
    expect(document.querySelector(".setSectionHint")?.textContent, "section hint").toBe(
      catalog["consent.settings.hint"]
    );
    expect(catalog["consent.settings.hint"]).toBe(
      "This browser keeps only what DebateAI needs to work. See the full list here any time."
    );
    const opener = document.querySelector<HTMLButtonElement>("button.setBtn");
    expect(opener, "one .setBtn opener").not.toBeNull();
    expect(opener!.textContent?.trim(), "its label").toBe(catalog["consent.settings.button"]);
    expect(catalog["consent.settings.button"]).toBe("What we store");
    expect(card(), "no card before the button is pressed").toBeNull();

    act(() => opener!.click());

    expect(card(), "the same card opens").not.toBeNull();
    expect(card()!.querySelectorAll(".consentCatRow").length, "the eight items").toBe(8);
    expect(raw(), "opening the card writes nothing").toBe(before);

    // One panel, mounted once, in the page the SPEC names.
    const source = settingsSource();
    expect(source.split("<ConsentSettingsPanel").length - 1, "exactly one panel element").toBe(1);
    expect(source.split("import { ConsentSettingsPanel }").length - 1, "exactly one import").toBe(1);
  });

  it("returns the bar when the card is dismissed from the SETTINGS entry with nothing stored", () => {
    // PROPERTY (S01-R14, S01-R21, S01-S31 — the REQ-REV-01 **B1** pin):
    // **the discriminator is the stored decision, never the entry point.** A
    // signed-in visitor who deletes `debateai.consent` in DevTools still holds an
    // HttpOnly session cookie, so they can reach `/settings` → Privacy →
    // `What we store` with nothing stored. Under the entry-point rule this
    // replaced, dismissing there made a consent gate disappear in one gesture.
    mountSettings();
    expect(bar(), "the bar is showing behind Settings, because nothing is stored").not.toBeNull();

    act(() => document.querySelector<HTMLButtonElement>("button.setBtn")!.click());
    expect(card(), "the card opened from Settings").not.toBeNull();
    expect(bar(), "and the bar is not rendered while it is open").toBeNull();

    dismissCard();

    expect(bar(), "the bar returns HERE TOO").not.toBeNull();
    expect(card(), "the card is gone").toBeNull();
    expect(raw(), "and storage is still empty").toBeNull();
  });

  it("stays silent when the card is dismissed from the SETTINGS entry WITH a valid decision", () => {
    // PROPERTY (S01-R14, S01-S32): the same rule read the other way — a valid
    // stored decision means no surface returns, from any entry point, and the
    // stored bytes are the ones that were there before.
    const before = seed();
    mountSettings();
    expect(bar(), "a stored decision means no bar").toBeNull();

    act(() => document.querySelector<HTMLButtonElement>("button.setBtn")!.click());
    expect(card(), "the card opened from Settings").not.toBeNull();

    dismissCard();

    expect(bar(), "no bar").toBeNull();
    expect(card(), "no card").toBeNull();
    expect(raw(), "byte-for-byte what was seeded").toBe(before);
  });

  it.each(INVALID_SEEDS)(
    "shows the bar at mount with %s stored — present is not valid",
    (_shape, value) => {
      // PROPERTY (S01-R14, S01-R02, V-19 — the CODE-REV-S01-C5 r1 **N1** pin, the
      // FIRST of the machine's two decision points, `CookieConsent.tsx:87`): the
      // mount asks whether an acknowledgement (R06 ACK) is stored, never whether the
      // key is merely present. A value this product cannot write but a future
      // version, a hand edit or an extension can — the old three-choice record is the concrete
      // one — is no decision, so the bar is shown and the caller re-asks. Under
      // the presence mutant the same value silences the bar from the first paint
      // and R02's "the caller re-asks" is unpinned at the machine level.
      // Nothing is rewritten: reading storage is not deciding.
      localStorage.setItem(CONSENT_KEY, value);
      mountConsent();

      expect(bar(), "an invalid stored value is no decision: re-ask").not.toBeNull();
      expect(card(), "and the card is not opened by a mount").toBeNull();
      expect(raw(), "the invalid value is left exactly as it was found").toBe(value);
    }
  );

  it.each(INVALID_SEEDS)(
    "returns the bar when the card is dismissed from the SETTINGS entry with %s stored",
    (_shape, value) => {
      // PROPERTY (S01-R14, S01-R21, V-19 — the same pin at the SECOND decision
      // point, `CookieConsent.tsx:130`): dismissing without deciding asks the same
      // VALID question, so a signed-in visitor whose `debateai.consent` holds an
      // invalid value cannot reach Silence through Settings → Privacy →
      // `What we store` → back out. That is B1's own failure mode reached by
      // a different route: under the presence mutant the bar never returns and no
      // valid decision is stored. The bar showing BEHIND Settings is the same
      // predicate read at mount, which is why one case can carry both halves.
      localStorage.setItem(CONSENT_KEY, value);
      mountSettings();
      expect(bar(), "the bar is showing, because nothing VALID is stored").not.toBeNull();

      act(() => document.querySelector<HTMLButtonElement>("button.setBtn")!.click());
      expect(card(), "the card opened from Settings").not.toBeNull();
      expect(bar(), "and the bar is not rendered while it is open").toBeNull();

      dismissCard();

      expect(bar(), "R14 says VALID, not PRESENT: the bar returns HERE TOO").not.toBeNull();
      expect(card(), "the card is gone").toBeNull();
      expect(raw(), "and a dismissal wrote nothing over it").toBe(value);
    }
  );
});
