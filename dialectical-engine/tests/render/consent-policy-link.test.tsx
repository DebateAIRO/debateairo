// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../../apps/ui/lib/consent.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../../apps/ui/components/consent/ConsentSettingsPanel.js";
import { openSurfaceCount } from "../../apps/ui/components/consent/modalSemantics.js";

/**
 * Cluster S01-C6 — the cross-slice cluster.
 *
 * Everything asserted here is a property of S01's WIRING, never of S02's two
 * files: `apps/ui/components/consent/modalSemantics.ts` and
 * `PrivacyPolicyModal.tsx` are S02's, are consumed unchanged, and have their own
 * suites (`consent-modal-semantics.test.tsx`, `consent-policy-modal-*.test.tsx`).
 * What S01 owns is: that the card asks for the modal in READ mode and hands it no
 * `onAcknowledge`; that the modal element is rendered AFTER the card so the
 * helper's document-order stack puts it on top; and that the card takes its own
 * modal semantics from the same helper instead of writing a second copy.
 */

// The acceptance command is pinned to the lane root, so source fixtures resolve
// from process.cwd(); `import.meta.url` can carry a non-file scheme under vitest
// (TOOLING-TRAPS, CODE-T1C3 / CODE-T5C1). Same idiom as consent-mount.test.tsx.
const consentSource = (): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/components/consent/CookieConsent.tsx"), "utf8");
const cardSource = (): string =>
  readFileSync(
    resolve(process.cwd(), "apps/ui/components/consent/CookiePreferencesCard.tsx"),
    "utf8"
  );

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// vitest.config.ts:19 sets fileParallelism:false and there is no shared setup
// file, so a leaked key survives into later test files in the same worker.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
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
  // The helper's stack is MODULE-level state shared by every surface in the
  // worker, and `fileParallelism:false` means the next file inherits it. An
  // unmounted root has run every cleanup, so this is a measurement of that fact
  // rather than a repair of it: a non-zero count here would mean a surface leaked.
  expect(openSurfaceCount(), "no surface leaks out of a case").toBe(0);
});

const bar = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="region"][aria-label="Cookie consent"]');
const card = (): HTMLElement | null => document.querySelector<HTMLElement>(".consentCard");
const policy = (): HTMLElement | null => document.querySelector<HTMLElement>(".policyBezel");
const dialogs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
const switches = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="switch"]')];
const checked = (): string[] =>
  switches().map((control) => control.getAttribute("aria-checked") ?? "");
const raw = (): string | null => localStorage.getItem(CONSENT_KEY);

/** The one control in the document whose trimmed own text is exactly `label`. */
function labelled(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => button.textContent?.trim() === label
  );
  expect(found.length, `expected exactly one control labelled ${label}`).toBe(1);
  return found[0]!;
}

/**
 * Click the opener the way a pointer does: a real browser focuses the control it
 * activates, and the helper returns focus to whatever `document.activeElement`
 * held when the surface opened. jsdom's `click()` does NOT move focus, so a test
 * that only clicks would be asserting focus return from `document.body` and would
 * pass against a helper that returns focus nowhere.
 */
function activate(button: HTMLButtonElement): void {
  act(() => {
    button.focus();
    button.click();
  });
}

function mountBar(): void {
  act(() => {
    root!.render(<CookieConsent />);
  });
}

/**
 * The Settings entry, mounted exactly as the app mounts it: the panel inside
 * `{children}` and `CookieConsent` its sibling after it (S01-R07). The panel is
 * NOT unmounted when the card opens, which is the one structural difference from
 * the bar entry.
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

function press(key: string, options: KeyboardEventInit = {}): void {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })
    );
  });
}

describe("S01-C6 the Privacy notice link, the read-mode policy modal and the card's modal semantics", () => {
  it("opens the policy modal in READ mode over the card: a Close button, and no I have read it", () => {
    // PROPERTY (S01-R20, S01-S37/S38): `Privacy notice` opens S02's modal in the
    // read-only shape S01's states table depends on. S01 can only rely on that
    // shape if it can catch its absence, so the CONSUMER pins it too — the
    // `Close` control was pinned on S02's side alone in v1 (REQ-REV-01 **N9**).
    // The modal is S02's file and is consumed unchanged; what S01 owns is which
    // props it is handed.
    mountBar();
    activate(labelled("Choose what to store"));
    expect(card(), "the card is open").not.toBeNull();
    expect(policy(), "and no policy modal yet").toBeNull();

    activate(labelled("Privacy notice"));

    expect(policy(), "the policy modal is open").not.toBeNull();
    expect(card(), "over the card, which is still there").not.toBeNull();
    expect(dialogs().length, "two dialogs, the card and the policy").toBe(2);

    const inPolicy = [...policy()!.querySelectorAll("button")].map((button) => button.textContent);
    expect(inPolicy, "read mode renders a Close button").toContain("Close");
    expect(inPolicy, "and no acknowledgement, because read mode never consents").not.toContain(
      "I have read it"
    );

    // The props, pinned in the SOURCE so an accidental `onAcknowledge` cannot
    // ship: a runtime assertion cannot see a prop the component ignores in read
    // mode, and `onAcknowledge` is exactly such a prop.
    const source = consentSource();
    expect(source.split("<PrivacyPolicyModal").length - 1, "exactly one modal element").toBe(1);
    expect(source, "mounted CONDITIONALLY, so each open is a fresh read").toMatch(
      /\{policyOpen && \(?\s*<PrivacyPolicyModal/
    );
    const element = source.slice(source.indexOf("<PrivacyPolicyModal"));
    const props = element.slice(0, element.indexOf("/>") + 2);
    expect(props, "read mode").toContain('mode="read"');
    expect(props, "the modal is told it is open").toMatch(/<PrivacyPolicyModal\s+open\s/);
    expect(props, "and given a close route").toContain("onClose=");
    expect(source, "no onAcknowledge anywhere in S01's wiring").not.toContain("onAcknowledge");
  });

  it("changes nothing behind it when the policy is closed", () => {
    // PROPERTY (S01-R20, S01-S39): the read-only modal owns no consent state and
    // touches no storage, so the card it came from is byte-identical after it
    // closes. S01 passes `onClose` and asserts the EFFECT; the close route itself
    // is the helper's `backdropCloseHandler` and Esc arm, which S02 implements.
    mountBar();
    activate(labelled("Choose what to store"));
    const [, quality] = switches() as [HTMLElement, HTMLElement, HTMLElement];
    act(() => quality.click());

    const before = checked();
    const storedBefore = raw();
    expect(before, "a toggle was flipped first, so an unchanged read is not vacuous").toEqual([
      "true",
      "false",
      "false"
    ]);

    activate(labelled("Privacy notice"));
    expect(policy(), "the policy is open").not.toBeNull();
    activate(labelled("Close"));

    expect(policy(), "the policy is gone").toBeNull();
    expect(card(), "and the card it came from is still there").not.toBeNull();
    expect(checked(), "with every toggle exactly as it was").toEqual(before);
    expect(raw(), "and storage untouched").toBe(storedBefore);
    expect(raw(), "which is still nothing at all").toBeNull();
    expect(bar(), "the bar stays away while the card is open").toBeNull();
  });

  it("moves the visitor exactly ONE surface per Escape, with the policy over the card", () => {
    // PROPERTY (S01-R20's Esc stack, REQ-REV-01 **B3**, S01-S40): the topmost open
    // surface consumes Escape and no other surface acts on the same event.
    //
    // The mechanism is DOCUMENT ORDER, not open order (S02 DECISIONS 2026-09-07,
    // CODE-REV-S02-C5C6 r1 N2): `topmostSurface()` resolves unrelated siblings
    // with `CONTAINED_BY || FOLLOWING`. So the arrangement is the requirement —
    // the `<PrivacyPolicyModal>` element is rendered AFTER the card, and with the
    // two swapped one Escape closes the CARD and leaves the policy open.
    mountBar();
    activate(labelled("Choose what to store"));
    const [, quality] = switches() as [HTMLElement, HTMLElement, HTMLElement];
    act(() => quality.click());
    const before = checked();
    activate(labelled("Privacy notice"));

    expect(policy(), "the policy is open over the card").not.toBeNull();
    expect(
      card()!.compareDocumentPosition(policy()!) & Node.DOCUMENT_POSITION_FOLLOWING,
      "the policy element FOLLOWS the card in document order — the helper's own topmost rule"
    ).not.toBe(0);
    expect(openSurfaceCount(), "two surfaces on the stack").toBe(2);

    press("Escape");

    expect(policy(), "(a) the policy dialog is gone").toBeNull();
    expect(card(), "(b) the preferences card is STILL in the document").not.toBeNull();
    expect(checked(), "with its toggle values unchanged").toEqual(before);
    expect(bar(), "(c) and the bar is still absent").toBeNull();
    expect(openSurfaceCount(), "one surface left").toBe(1);
    expect(raw(), "and nothing was written by a dismissal").toBeNull();
  });

  it("closes the card on Escape when the card is the only open surface, and the bar returns", () => {
    // PROPERTY (S01-R14/R18, the other half of the stack): with only the card open
    // the card IS the topmost surface, so Escape reaches `onDismiss` — and the B1
    // pin is untouched by C6: `dismiss` re-reads storage, so the bar returns iff no
    // valid decision is stored, never because of where the card was opened from.
    mountBar();
    activate(labelled("Choose what to store"));
    expect(card(), "the card is open").not.toBeNull();

    press("Escape");

    expect(card(), "Escape closes the card through the shared helper").toBeNull();
    expect(bar(), "and the bar returns, because nothing valid is stored").not.toBeNull();
    expect(raw(), "a dismissal writes nothing").toBeNull();
    expect(openSurfaceCount(), "the stack is empty").toBe(0);
  });

  it("stays silent on Escape from the Settings entry when a valid decision is stored", () => {
    // PROPERTY (S01-R14/R21, B1 read through the NEW Escape route): the same
    // keystroke, the same helper, and the discriminator is still the stored
    // decision. C6 gives Esc a real route for the first time, so B1's pin is
    // re-asserted through it rather than assumed to survive.
    const stored = JSON.stringify({
      v: 1,
      essential: true,
      quality: false,
      analytics: true,
      decidedAt: "2026-01-01T00:00:00.000Z"
    });
    localStorage.setItem(CONSENT_KEY, stored);
    mountSettings();
    expect(bar(), "a valid decision means no bar").toBeNull();
    activate(labelled("Cookie preferences"));
    expect(card(), "the card opened from Settings").not.toBeNull();

    press("Escape");

    expect(card(), "the card is gone").toBeNull();
    expect(bar(), "and no bar returns").toBeNull();
    expect(raw(), "byte-for-byte what was stored").toBe(stored);
  });

  it("gives the card its initial focus and its Tab wrap from the shared helper", () => {
    // PROPERTY (S01-R18, S01-S41): initial focus lands on the first OPERABLE
    // toggle — Essential is locked and is not a choice — and Tab cycles within the
    // card. Neither is implemented here: the card hands the helper a container and
    // an initial-focus target and the helper does the rest.
    mountBar();
    activate(labelled("Choose what to store"));

    const controls = switches() as [HTMLElement, HTMLElement, HTMLElement];
    expect(controls[0].getAttribute("aria-disabled"), "Essential is the locked one").toBe("true");
    expect(
      document.activeElement,
      "initial focus is Model quality telemetry, the first operable toggle"
    ).toBe(controls[1]);

    const focusable = [
      ...card()!.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ];
    expect(focusable.length, "the card's focusable set: three switches and three footer controls").toBe(6);

    act(() => focusable[focusable.length - 1]!.focus());
    press("Tab");
    expect(document.activeElement, "Tab from the last focusable wraps to the first").toBe(
      focusable[0]
    );

    press("Tab", { shiftKey: true });
    expect(document.activeElement, "and Shift+Tab from the first wraps back to the last").toBe(
      focusable[focusable.length - 1]
    );
  });

  it("returns focus to the Settings opener when the card closes", () => {
    // PROPERTY (S01-R18, S01-S41, the Settings direction): the helper returns focus
    // to the element that held it when the surface opened. The Settings panel lives
    // inside `{children}` and is NOT unmounted by the card, so the opener is still
    // the same node when the card closes.
    mountSettings();
    const opener = labelled("Cookie preferences");
    activate(opener);
    expect(card(), "the card is open").not.toBeNull();
    expect(document.activeElement, "focus moved into the card").not.toBe(opener);

    press("Escape");

    expect(card(), "the card is gone").toBeNull();
    expect(document.activeElement, "focus is back on `Cookie preferences`").toBe(opener);
  });

  it("does NOT return focus to the bar opener, and records exactly why (FINDING C6-F1)", () => {
    // NOT a requirement met — a MEASUREMENT, in the idiom `consent-mount.test.tsx`
    // used for the Esc listener that did not exist yet, so the gap is a fact in
    // the record rather than a claim in a handoff.
    //
    // S01-R18 asks for focus to return to `Choose what to store` (`CookieBar.tsx:61`).
    // It cannot, and no edit inside C6's file surface can make it:
    //   * the helper returns focus to whatever `document.activeElement` held when
    //     the surface REGISTERED, and it registers in a `React.useEffect`
    //     (`modalSemantics.ts:165-178`), i.e. after the commit;
    //   * S01-R14 and the states table make the bar and the card mutually
    //     exclusive, so that same commit REMOVED the bar — asserted below — and
    //     the platform moves focus to `document.body` when the focused element
    //     leaves the document;
    //   * so the captured opener is `document.body`, and even a captured
    //     reference to the old button would be a DETACHED node: the bar that
    //     returns is a fresh mount with a fresh button.
    // Every lawful remedy is outside this cluster: a fourth `ModalSurface` member
    // (S02's file, a cross-slice interface change), a focus move written in S01
    // (banned — the ONE helper owns focus), or the returning bar taking focus
    // itself (`CookieBar.tsx`, cluster C3). Reported as C6-F1; the SETTINGS
    // direction, where the opener survives, is asserted GREEN in the case above.
    mountBar();
    const opener = labelled("Choose what to store");
    activate(opener);
    expect(card(), "the card is open").not.toBeNull();
    expect(opener.isConnected, "and the bar that owned the opener is gone with it").toBe(false);

    press("Escape");

    expect(card(), "the card is gone").toBeNull();
    expect(bar(), "and the bar is back").not.toBeNull();
    expect(
      labelled("Choose what to store"),
      "as a FRESH node, so no captured reference could have been restored"
    ).not.toBe(opener);
    expect(document.activeElement, "focus is on the body — R18's bar direction is UNMET").toBe(
      document.body
    );
  });

  it("writes no modal machinery of its own: the card imports all of it", () => {
    // PROPERTY (S01-R18, SPEC §Out of scope, S01-S41): exactly ONE focus trap and
    // ONE document-level Escape listener exist across the two slices, and the card
    // gets its semantics by consuming them. The guard is grep-shaped and a grep
    // does not know what a comment is (`COMMON.md` §8; CODE-S01-C5 F1 measured a
    // JSDoc mention counting as a hit), so the tokens may not appear in a comment
    // either. C7's S01-S45 runs the same class over the whole directory; this is
    // the two wiring files, at the moment they are wired.
    for (const [name, source] of [
      ["CookiePreferencesCard.tsx", cardSource()],
      ["CookieConsent.tsx", consentSource()]
    ] as const) {
      expect(source, `${name} registers no listener`).not.toContain("addEventListener");
      expect(source, `${name} moves no focus itself`).not.toContain(".focus()");
      expect(source, `${name} names no key`).not.toContain("Escape");
    }

    expect(cardSource(), "the card imports the ONE helper").toMatch(
      /import\s*\{[^}]*useModalSurface[^}]*\}\s*from\s*"\.\/modalSemantics"/
    );
    expect(cardSource(), "and its backdrop route").toContain("backdropCloseHandler");
    expect(cardSource(), "the helper is asked for the card's semantics").toMatch(
      /useModalSurface\(\s*true\s*,/
    );
  });

  it("does not bring the policy back with a reopened card", () => {
    // PROPERTY (S01-R20 read across two opens): the policy is a surface the
    // visitor asked for, not a state of the card, so a card opened afresh opens
    // without it. The flag lives one level up, in the machine, and outlives the
    // card's unmount — this is the case that walks the whole loop and shows it is
    // nonetheless clean, because every exit the policy has runs through the one
    // `onClose` that clears it.
    //
    // **This is the CONTROL for the two cases below it**, and it is the clean
    // path: the policy is closed by its own route FIRST, so the reset in
    // `openCard` is not what makes this case green and it stays green with that
    // line removed. It was originally declared here as pinning no mutant of its
    // own, on the premise that the reset was unobservable; CODE-REV-S01-C6 r1
    // **B1** measured the premise false — the mutant needs a case that closes the
    // CARD while the policy is open, which is what the two cases below drive.
    mountSettings();
    activate(labelled("Cookie preferences"));
    activate(labelled("Privacy notice"));
    expect(policy(), "the policy is open").not.toBeNull();

    press("Escape");
    press("Escape");
    expect(policy(), "both surfaces closed, one keystroke each").toBeNull();
    expect(card(), "the card too").toBeNull();

    activate(labelled("Cookie preferences"));

    expect(card(), "the card is open again").not.toBeNull();
    expect(policy(), "and the policy did not come back with it").toBeNull();
    expect(dialogs().length, "one dialog, not two").toBe(1);
  });

  it("opens a CLEAN card after the card was closed by its scrim under an open policy", () => {
    // PROPERTY (S01-R20 read across two opens; CODE-REV-S01-C6 r1 **B1**):
    // `policyOpen` is PER-OPEN state of the card surface, so every open starts
    // with no policy over it — WHATEVER closed the previous card, not only the
    // routes that run the policy's own `onClose`.
    //
    // The route is reachable TODAY. The card's scrim is `position: fixed;
    // inset: 0` (`globals.css:7384-7393`) and the policy's scrim has no rule in
    // this lane at all — a line-scan of `globals.css` for
    // `^\s*\.policy[A-Za-z]*\s*[,{]` returns `[]`, and the `--z-policy-*` tokens
    // S01-C1 declared for that stylesheet are unconsumed — so a pointer click
    // lands on the CARD's backdrop while the policy stands over it. The card and
    // the policy element unmount together; the flag lives one level up, in this
    // still-mounted component, and outlives both.
    mountBar();
    activate(labelled("Choose what to store"));
    activate(labelled("Privacy notice"));
    expect(policy(), "the policy is open over the card").not.toBeNull();
    expect(dialogs().length, "two dialogs while the visitor has both open").toBe(2);

    const scrim = document.querySelector<HTMLElement>(".consentScrim")!;
    act(() => scrim.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(card(), "the CARD is dismissed from under the open policy").toBeNull();
    expect(policy(), "and the policy element unmounts with it").toBeNull();
    expect(bar(), "the bar returns, because nothing valid is stored").not.toBeNull();
    expect(raw(), "a backdrop dismissal writes nothing").toBeNull();

    activate(labelled("Choose what to store"));

    expect(card(), "the card is open again").not.toBeNull();
    expect(policy(), "and it is CLEAN — no policy the visitor did not ask for").toBeNull();
    expect(dialogs().length, "exactly one dialog on a freshly opened card").toBe(1);
    expect(openSurfaceCount(), "and exactly one surface on the stack").toBe(1);
  });

  it("opens a CLEAN card after the card was settled by Save choices under an open policy", () => {
    // PROPERTY: the same per-open property through the OTHER exit class. The case
    // above leaves by a DISMISSAL (writes nothing, re-reads storage); this one
    // leaves by a SETTLE (writes a decision and goes Silent), from the Settings
    // entry, where the opener survives the card. Two exits, two routes to the same
    // stranded flag — a reset written into `dismiss` instead of `openCard` fixes
    // the case above and leaves this one red, which is why both are here.
    //
    // `Save choices` sits behind the open policy in paint order and is in the
    // document and enabled; nothing in this lane's stylesheet covers it.
    const stored = JSON.stringify({
      v: 1,
      essential: true,
      quality: true,
      analytics: false,
      decidedAt: "2026-02-02T00:00:00.000Z"
    });
    localStorage.setItem(CONSENT_KEY, stored);
    mountSettings();
    activate(labelled("Cookie preferences"));
    activate(labelled("Privacy notice"));
    expect(policy(), "the policy is open over the card").not.toBeNull();

    // Clicked WITHOUT focusing it, unlike `activate`: the point of the case is
    // that this control settles the card from behind the policy.
    act(() => labelled("Save choices").click());

    expect(card(), "the card settled and closed").toBeNull();
    expect(policy(), "and the policy element unmounts with it").toBeNull();
    expect(raw(), "the settle wrote a decision").not.toBeNull();

    activate(labelled("Cookie preferences"));

    expect(card(), "reopened from Settings").not.toBeNull();
    expect(policy(), "CLEAN — the settle route left no policy behind either").toBeNull();
    expect(dialogs().length, "one dialog, not two").toBe(1);
    expect(openSurfaceCount(), "and one surface on the stack").toBe(1);
  });

  it("closes the card on a backdrop click through the shared helper, and not on a click inside it", () => {
    // PROPERTY (S01-R14/R18, S01-S41): the backdrop route is
    // `backdropCloseHandler(scrim, onClose)` — it closes only when the click landed
    // ON the scrim, never on a descendant. The negative half is what separates a
    // real backdrop from a click-anywhere dismissal that would eat every control.
    mountBar();
    activate(labelled("Choose what to store"));
    const scrim = document.querySelector<HTMLElement>(".consentScrim")!;

    act(() => card()!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(card(), "a click INSIDE the card changes nothing").not.toBeNull();

    act(() => scrim.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(card(), "a click on the backdrop closes it").toBeNull();
    expect(bar(), "and the bar returns, because nothing valid is stored").not.toBeNull();
    expect(raw(), "a backdrop dismissal writes nothing").toBeNull();
  });
});
