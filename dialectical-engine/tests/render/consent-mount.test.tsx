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
 * this file — the scrim, the three switches, the footer labels — is still made
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
  readFileSync(resolve(process.cwd(), "apps/ui/app/settings/page.tsx"), "utf8");

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
  document.querySelector<HTMLElement>('[role="region"][aria-label="Cookie consent"]');
const card = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');
const scrims = (): number => document.querySelectorAll(".consentScrim").length;
const switches = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="switch"]')];
const checked = (): string[] =>
  switches().map((control) => control.getAttribute("aria-checked") ?? "");

/** A valid `v: 1` decision, as `writeConsent` would leave it. */
const seed = (quality: boolean, analytics: boolean, decidedAt = "2026-01-01T00:00:00.000Z"): string => {
  const value = JSON.stringify({ v: 1, essential: true, quality, analytics, decidedAt });
  localStorage.setItem(CONSENT_KEY, value);
  return value;
};

/**
 * V-19's strict shape read in the FAILURE direction: ten values that are PRESENT
 * under `debateai.consent` and are still not a decision.
 *
 * Every other case in this file seeds `null` or a valid decision, so the suite
 * could tell *absent* from *valid* and could not tell *invalid* from *valid* —
 * `readConsent()` answers "is a valid `v: 1` decision stored?" while
 * `localStorage.getItem(CONSENT_KEY) !== null` answers "is anything stored?",
 * and the two agree on every seed the file had (CODE-REV-S01-C5 r1 **N1**,
 * measured: the presence mutants at `CookieConsent.tsx:87` and `:130` left this
 * file at `11 passed (11)` and `CMD-C5` at verdict 0). S01-R14 and S01-R02 are
 * written on the VALID predicate, so these ten seeds are what makes the
 * assertions below derive from the requirement rather than from the narrative of
 * the finding that produced them.
 *
 * The shapes are the class the reviewer's promoted probe
 * (`.hermes/reports/consent-ui/probes/code-rev-s01-c5-r1-rev-state-machine.test.tsx`)
 * enumerates; the property is re-expressed here in this file's own idiom rather
 * than copied, so the seeds run through `mountConsent` / `mountSettings` /
 * `dismissCard` and are read by the same helpers as every other case.
 */
const INVALID_SEEDS: [string, string][] = [
  ["a future version", JSON.stringify({ v: 2, essential: true, quality: true, analytics: true, decidedAt: "2026-01-01T00:00:00.000Z" })],
  ["essential denied", JSON.stringify({ v: 1, essential: false, quality: true, analytics: true, decidedAt: "2026-01-01T00:00:00.000Z" })],
  ["a sixth member", JSON.stringify({ v: 1, essential: true, quality: true, analytics: true, decidedAt: "2026-01-01T00:00:00.000Z", tracking: true })],
  ["a missing member", JSON.stringify({ v: 1, essential: true, quality: true, decidedAt: "2026-01-01T00:00:00.000Z" })],
  ["a non-boolean toggle", JSON.stringify({ v: 1, essential: true, quality: "yes", analytics: true, decidedAt: "2026-01-01T00:00:00.000Z" })],
  ["a non-ISO instant", JSON.stringify({ v: 1, essential: true, quality: true, analytics: true, decidedAt: "yesterday" })],
  ["a local-time instant", JSON.stringify({ v: 1, essential: true, quality: true, analytics: true, decidedAt: "2026-01-01T00:00:00+02:00" })],
  ["malformed JSON", "{not json"],
  ["a bare string", JSON.stringify("accepted")],
  ["an array", JSON.stringify([1, true, true])]
];

const raw = (): string | null => localStorage.getItem(CONSENT_KEY);
const parsed = (): Record<string, unknown> => JSON.parse(raw() ?? "null") as Record<string, unknown>;

function clickLabelled(label: string): void {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label
  );
  expect(button, `missing rendered control ${label}`).toBeDefined();
  act(() => {
    (button as HTMLButtonElement).click();
  });
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
      /\{children\}\s*<CookieConsent \/>/
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
    seed(true, true);
    mountConsent();
    expect(bar(), "a stored decision keeps the bar away").toBeNull();

    localStorage.clear();
    act(() => root!.unmount());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mountConsent();

    expect(bar(), "the bar is back after the key is cleared").not.toBeNull();
    expect(raw(), "nothing was re-written by the remount").toBeNull();
  });

  it("opens the card over a hidden bar, and each terminal control writes R04's own row", () => {
    // PROPERTY (S01-R14, S01-R04): the machine's three states are mutually
    // exclusive — with the card open the bar is not rendered ANYWHERE in the
    // app — and each terminal control writes the object R04's table names and
    // lands in Silent. The z-order between scrim and card, and whether the scrim
    // actually dims, are V's: acceptance step 6.
    mountConsent();
    expect(bar(), "first visit shows the bar").not.toBeNull();
    expect(scrims(), "no scrim before the card is opened").toBe(0);

    clickLabelled("Choose what to store");
    expect(bar(), "the bar is not rendered while the card is open").toBeNull();
    expect(card(), "the card is open").not.toBeNull();
    expect(scrims(), "exactly one scrim").toBe(1);

    // R04 row 4 — `Save choices` writes the CURRENT toggles.
    const [, quality, analytics] = switches() as [HTMLElement, HTMLElement, HTMLElement];
    act(() => quality.click());
    act(() => analytics.click());
    clickLabelled("Save choices");
    expect(card(), "Save choices closes the card").toBeNull();
    expect(bar(), "Save choices leaves no bar behind").toBeNull();
    expect(parsed(), "R04 row 4").toMatchObject({
      v: 1,
      essential: true,
      quality: false,
      analytics: true
    });
    expect(Object.keys(parsed()).sort(), "the five members and no others").toEqual([
      "analytics",
      "decidedAt",
      "essential",
      "quality",
      "v"
    ]);
    expect(String(parsed().decidedAt), "decidedAt is an ISO-8601 UTC instant").toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );

    // R04 row 1 — `Accept all`, from the bar.
    localStorage.clear();
    act(() => root!.unmount());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mountConsent();
    clickLabelled("Accept all");
    expect(bar(), "Accept all closes the bar").toBeNull();
    expect(parsed(), "R04 row 1").toMatchObject({
      v: 1,
      essential: true,
      quality: true,
      analytics: true
    });

    // R04 row 2 — `Essential only`, from the bar.
    localStorage.clear();
    act(() => root!.unmount());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mountConsent();
    clickLabelled("Essential only");
    expect(bar(), "Essential only closes the bar").toBeNull();
    expect(parsed(), "R04 row 2").toMatchObject({
      v: 1,
      essential: true,
      quality: false,
      analytics: false
    });
  });

  it("returns the bar when the card is dismissed from the first-visit entry, and writes nothing", () => {
    // PROPERTY (S01-R14, S01-S30): dismissing the card without deciding is NOT a
    // decision — it restores the state the visitor was in, and storage is
    // untouched. A backdrop click takes the same route (`onDismiss`); which
    // gestures reach it is the shared helper's, pinned in C6 and by V's
    // acceptance step 11.
    mountConsent();
    clickLabelled("Choose what to store");
    expect(card(), "the card is open").not.toBeNull();

    dismissCard();

    expect(bar(), "the bar is back").not.toBeNull();
    expect(card(), "the card is gone").toBeNull();
    expect(raw(), "a dismissal writes nothing").toBeNull();
  });

  it("dispatches Escape into a lane that has no listener yet, and records that it does nothing", () => {
    // NOT a requirement — a MEASUREMENT, so the reason the three dismissal cases
    // above and below drive `onDismiss` instead of the keyboard is a fact in the
    // record rather than a claim in a handoff. The Esc listener belongs to the
    // ONE shared helper `modalSemantics.ts` (S02's, arriving with the C6 merge);
    // S01-R18 and SPEC §Out of scope forbid this cluster from writing a second
    // one, and S01-S45's guard asserts that no file under
    // `apps/ui/components/consent/` except that helper contains `addEventListener`
    // or the string Escape. This case is expected to CHANGE in C6, where
    // S01-S40 makes one Escape close exactly one surface.
    mountConsent();
    clickLabelled("Choose what to store");

    pressEscape();

    expect(card(), "no listener exists in this lane yet, so the card stands").not.toBeNull();
    expect(raw(), "and nothing was written").toBeNull();
  });

  it("gives Settings one Privacy panel whose button opens the same card, pre-filled", () => {
    // PROPERTY (S01-R21, S01-S33): the promise the 10b lede makes — `Revisit any
    // time from Settings → Privacy` — is kept by a real surface, in the page's
    // own vocabulary, and the panel is present whether or not a decision is
    // stored. It is its own component and not inline JSX because
    // `AccountSettingsScreen` is a non-exported local function inside a page
    // wrapped in `<AuthGate>`: an inline panel could only be tested by mounting
    // the whole page through the auth gate, and a cluster whose test needs the
    // whole app is not independently verifiable. Whether the panel LOOKS like the
    // rest of the page is V's, acceptance step 9.
    seed(false, true);
    mountSettings();

    expect(document.querySelector(".setSectionTitle")?.textContent, "section title").toBe("Privacy");
    expect(document.querySelector(".setSectionHint")?.textContent, "section hint").toBe(
      "Choose what this browser stores. Asked once; change it here any time."
    );
    const opener = document.querySelector<HTMLButtonElement>("button.setBtn");
    expect(opener, "one .setBtn opener").not.toBeNull();
    expect(opener!.textContent?.trim(), "its label").toBe("Cookie preferences");
    expect(card(), "no card before the button is pressed").toBeNull();

    act(() => opener!.click());

    expect(card(), "the same card opens").not.toBeNull();
    expect(checked(), "pre-filled from the stored decision").toEqual(["true", "false", "true"]);
    expect(raw(), "opening the card writes nothing").toBe(
      JSON.stringify({
        v: 1,
        essential: true,
        quality: false,
        analytics: true,
        decidedAt: "2026-01-01T00:00:00.000Z"
      })
    );

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
    // `Cookie preferences` with nothing stored. Under the entry-point rule this
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
    const before = seed(true, true);
    mountSettings();
    expect(bar(), "a stored decision means no bar").toBeNull();

    act(() => document.querySelector<HTMLButtonElement>("button.setBtn")!.click());
    expect(card(), "the card opened from Settings").not.toBeNull();

    dismissCard();

    expect(bar(), "no bar").toBeNull();
    expect(card(), "no card").toBeNull();
    expect(raw(), "byte-for-byte what was seeded").toBe(before);
  });

  it("opens at R17's defaults from EITHER entry when nothing is stored", () => {
    // PROPERTY (S01-R17, S01-R21, S01-S34 — the second member of B1's class):
    // with no valid stored decision the card opens at R17's defaults regardless
    // of which control opened it. Asserted against BOTH openers in one case, so
    // a divergence cannot hide in the gap between two tests. It does not assert
    // that the defaults are the RIGHT ones — `consent-card.test.tsx` does.
    mountSettings();
    act(() => document.querySelector<HTMLButtonElement>("button.setBtn")!.click());
    const fromSettings = checked();
    dismissCard();

    clickLabelled("Choose what to store");
    const fromBar = checked();

    expect(fromSettings, "the Settings opener, nothing stored").toEqual(["true", "true", "false"]);
    expect(fromBar, "the bar opener, nothing stored").toEqual(fromSettings);
  });

  it("mounts a FRESH card per open, so a reopen shows what was last saved", () => {
    // PROPERTY (CODE-REV-S01-C3C4 r1 **N6**): `initial` feeds a `useState`
    // initialiser and is therefore read at MOUNT and never again. The concrete
    // failure this pins: the visitor saves {quality:false, analytics:true},
    // reopens from Settings → Privacy, is shown the OLD {true,false}, presses
    // `Save choices` — and a consent record the visitor never chose is written.
    // The reviewer's probe measured the card side ("a remount DOES pick the new
    // initial up (the shape C5 must use)"); this is that shape, asserted through
    // the machine that mounts it.
    mountSettings();
    act(() => document.querySelector<HTMLButtonElement>("button.setBtn")!.click());
    expect(checked(), "first open, nothing stored").toEqual(["true", "true", "false"]);

    const [, quality, analytics] = switches() as [HTMLElement, HTMLElement, HTMLElement];
    act(() => quality.click());
    act(() => analytics.click());
    clickLabelled("Save choices");
    expect(parsed(), "the decision the visitor actually made").toMatchObject({
      quality: false,
      analytics: true
    });

    act(() => document.querySelector<HTMLButtonElement>("button.setBtn")!.click());
    expect(checked(), "the reopened card shows what was saved, not what was there first").toEqual([
      "true",
      "false",
      "true"
    ]);

    // And re-saving it unchanged rewrites the SAME booleans, which is the write
    // the stale-initial defect would have corrupted.
    clickLabelled("Save choices");
    expect(parsed(), "re-saving an untouched reopened card changes no boolean").toMatchObject({
      quality: false,
      analytics: true
    });
  });

  it.each(INVALID_SEEDS)(
    "shows the bar at mount with %s stored — present is not valid",
    (_shape, value) => {
      // PROPERTY (S01-R14, S01-R02, V-19 — the CODE-REV-S01-C5 r1 **N1** pin, the
      // FIRST of the machine's two decision points, `CookieConsent.tsx:87`): the
      // mount asks whether a VALID `v: 1` decision is stored, never whether the
      // key is merely present. A value this product cannot write but a future
      // version, a hand edit or an extension can — `{"v":2,…}` is the concrete
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
      // `Cookie preferences` → back out. That is B1's own failure mode reached by
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
