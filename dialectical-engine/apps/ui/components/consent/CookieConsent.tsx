"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COOKIE_CATEGORIES,
  decisionFor,
  readConsent,
  subscribeToPreferenceRequests,
  writeConsent,
  type ConsentDecision,
  type ConsentToggles
} from "../../lib/consent";
import { CookieBar } from "./CookieBar";
import { CookiePreferencesCard, type ConsentChoice } from "./CookiePreferencesCard";
import { PrivacyPolicyModal } from "./PrivacyPolicyModal";

/**
 * The ONE consent state machine (cluster S01-C5).
 *
 * It is the only reader and the only writer of `debateai.consent`: `CookieBar`
 * and `CookiePreferencesCard` are presentational and prop-driven, so there is a
 * single place where a decision can be taken and a single place where the
 * surface state lives.
 *
 * **Nothing is rendered until an effect has read storage (S01-R06).** The first
 * render returns `null`, on the server and on the client alike, so a returning
 * visitor never sees the bar flash and the two markups cannot disagree. The
 * neighbouring precedent invites the opposite mistake: the mode guard at
 * `apps/ui/app/layout.tsx:36-42` DOES run a blocking pre-paint script, because a
 * wrong THEME flashes visibly. A consent bar that is briefly ABSENT is
 * invisible, so consent takes the opposite treatment and **no second pre-paint
 * script is added**.
 *
 * **The discriminator is the STORED DECISION, never the entry point**
 * (S01-R14/R17/R21, REQ-REV-01 **B1**). The card behaves identically opened from
 * the bar and from Settings → Privacy, and dismissing it re-evaluates storage
 * rather than remembering where it was opened from. Under the entry-point rule
 * this replaced, a signed-in visitor who had deleted `debateai.consent` could
 * make a consent gate disappear with one keystroke.
 */
type Surface = "silent" | "bar" | "card";

/**
 * R17's defaults, read from the category records rather than restated: whenever
 * no valid `v: 1` decision is stored the card opens Model quality telemetry ON
 * and Product analytics OFF, from EITHER entry point (S01-R28 keeps every such
 * fact in one place, so V's ruling on the category data stays a data edit).
 */
const DEFAULT_TOGGLES: ConsentToggles = {
  quality: COOKIE_CATEGORIES.find((category) => category.id === "quality")?.defaultOn === true,
  analytics: COOKIE_CATEGORIES.find((category) => category.id === "analytics")?.defaultOn === true
};

/** The toggles a freshly opened card starts from: the stored decision's, or R17's defaults. */
const togglesFor = (stored: ConsentDecision | null): ConsentToggles =>
  stored === null ? DEFAULT_TOGGLES : { quality: stored.quality, analytics: stored.analytics };

export function CookieConsent() {
  /** Undefined until the effect below has read storage — the R06 gate. */
  const [surface, setSurface] = useState<Surface | undefined>(undefined);

  /** The toggles the currently open card was given. Recomputed at every open. */
  const [initial, setInitial] = useState<ConsentToggles>(DEFAULT_TOGGLES);

  /**
   * How many times the card has been opened. It is the card's `key`, so every
   * open is a FRESH MOUNT: `initial` feeds a `useState` initialiser, which runs
   * at mount and never again, and a card kept mounted across two opens would
   * show the visitor the first open's toggles and then write a decision nobody
   * picked (CODE-REV-S01-C3C4 r1 **N6**, measured).
   */
  const [opens, setOpens] = useState(0);

  /**
   * Whether the read-only policy modal is open OVER the card (S01-R20). It is
   * this component's state rather than the card's for one reason: the modal
   * element has to be a LATER SIBLING of the card, and a child cannot render its
   * own sibling.
   *
   * **It is PER-OPEN state, and `openCard` resets it.** The flag has to be false
   * at the start of every open, and closing the POLICY is not the only way it
   * gets there: the CARD can be closed while the policy still stands over it —
   * by the card's own backdrop, and by EITHER footer control that settles it —
   * and every such route unmounts the card and the policy element together while
   * this component stays mounted, stranding the flag at `true`. The next open
   * would then render the policy over a card the visitor opened fresh
   * (CODE-REV-S01-C6 r1 **B1**, measured).
   *
   * **The list above is a CLASS, not an enumeration, and the reset is at the one
   * entry point for exactly that reason:** every route that closes the card
   * leaves this flag false at the next open, whether or not anyone has written
   * that route down. An earlier version of this comment named two routes as if
   * they were the whole set and missed `Essential only`
   * (`CookiePreferencesCard.tsx:196`), which settles the card from the same
   * footer (CODE-REV-S01-C6 r2 **N8**). The whole closing surface is driven in
   * `tests/render/consent-policy-link.test.tsx`, which also pins the footer's
   * control set so a fourth route cannot be added unnoticed.
   *
   * An earlier version of this comment argued the reset was unreachable because
   * the policy's scrim "covers every control of the card". That is a CSS claim,
   * and the rule it names does not exist in this lane: `globals.css` carries no
   * `.policy*` rule at all, and the `--z-policy-*` tokens S01-C1 declared for
   * S02's stylesheet are unconsumed — while the card's own scrim is
   * `position: fixed; inset: 0`. **A component whose correctness depends on an
   * unwritten stylesheet in another lane is not verifiable by this slice's gate.**
   */
  const [policyOpen, setPolicyOpen] = useState(false);

  /**
   * The control that asked for the card, kept so the shared modal helper can
   * return focus to it on close (S01-R18). This component never moves focus
   * itself: focus trap, initial focus, focus return, backdrop close and the Esc
   * stack are all `apps/ui/components/consent/modalSemantics.ts`'s, which S02
   * owns and cluster C6 wires in (SPEC §Out of scope bans a second one).
   *
   * Written without the literal call spelling on purpose: S01-S45's slice-wide
   * guard is grep-shaped and a grep does not know what a comment is
   * (`COMMON.md` §8).
   */
  const openerRef = useRef<HTMLElement | null>(null);

  /**
   * The bar's `Choose what to store` control, lent to the shared helper so it can put
   * focus back there when the card closes (S01-R18's bar direction, V-22).
   *
   * It is a SECOND reference and not a use of `openerRef` above, because the two hold
   * different things: `openerRef` holds the node that asked for the card, which for the
   * bar entry is unmounted by the very commit that opens the card, while this one is
   * attached by the bar and is therefore re-attached to the FRESH button when the bar
   * comes back — which happens in the layout phase of that commit, before the card's
   * cleanup reads it. This component still moves no focus itself; it lends a node and the
   * ONE helper decides (SPEC §Out of scope bans a second implementation).
   */
  const manageRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setSurface(readConsent() === null ? "bar" : "silent");
  }, []);

  /**
   * Opening the card, from either control. `initial` is recomputed from STORAGE
   * at every open — not from the last open, and never from where the request
   * came from — so the two entry points are indistinguishable to the card
   * (S01-R17, S01-R21, B1's class).
   *
   * Every piece of per-open state is set here, and `policyOpen` is the first of
   * them precisely because it is the only one whose previous value can survive a
   * close (see its declaration above).
   */
  const openCard = useCallback((opener: HTMLElement | null): void => {
    setPolicyOpen(false);
    openerRef.current = opener;
    setInitial(togglesFor(readConsent()));
    setOpens((count) => count + 1);
    setSurface("card");
  }, []);

  /**
   * The Settings → Privacy button holds no reference to this component — R07
   * mounts the surface as a SIBLING placed after `{children}`, and a sibling
   * cannot provide context to `{children}` — so the request arrives through the
   * module-level store (S01-S11). The unsubscribe is returned so a remount never
   * leaves a second listener behind.
   */
  useEffect(() => subscribeToPreferenceRequests(openCard), [openCard]);

  /** Writes one decision and leaves both surfaces closed (R04, the states table). */
  const settle = useCallback((decision: ConsentDecision): void => {
    writeConsent(decision);
    setSurface("silent");
  }, []);

  /**
   * Closing the card without deciding. It writes nothing and then asks the ONE
   * question the states table asks in every row: **is a valid decision stored?**
   * A valid decision means Silent; anything else means the bar — and it means
   * that identically for a first-visit visitor and for a signed-in visitor who
   * reached the card from Settings → Privacy with the key deleted (S01-R14,
   * S01-R21, REQ-REV-01 **B1**).
   *
   * Reading `openerRef` here to decide would be exactly the defect: `Silent` is
   * reachable only when a valid `v: 1` decision is in storage.
   */
  const dismiss = useCallback((): void => {
    setSurface(readConsent() === null ? "bar" : "silent");
  }, []);

  if (surface === undefined || surface === "silent") return null;

  if (surface === "card") {
    /**
     * **DOM ORDER IS LOAD-BEARING, and this is the whole of it.** The shared
     * helper resolves which of two unrelated open surfaces is topmost by
     * DOCUMENT POSITION — `CONTAINED_BY || FOLLOWING` — and not by the order
     * they opened in (S02 `DECISIONS.md` 2026-09-07, CODE-REV-S02-C5C6 r1 N2,
     * measured; ticket `t_457c9898`). The policy modal is therefore the card's
     * LATER SIBLING: with the two swapped, one press of the dismiss key closes
     * the CARD and leaves the policy standing over nothing. `S01-S40` is the pin.
     * (Written without spelling that key: S01-S45's slice-wide guard is
     * grep-shaped and a grep does not know what a comment is — `COMMON.md` §8,
     * and CODE-S01-C5 F1 measured a JSDoc mention counting as a hit.)
     *
     * The modal is mounted CONDITIONALLY, so every open is a fresh read (S02
     * `DECISIONS.md` 2026-09-07, the N7 ruling) — the same treatment the card
     * itself gets from `key={opens}`.
     */
    return (
      <>
        <CookiePreferencesCard
          key={opens}
          initial={initial}
          onSave={(choice: ConsentChoice): void =>
            settle(decisionFor("save-choices", { quality: choice.quality, analytics: choice.analytics }))
          }
          onEssentialOnly={(): void => settle(decisionFor("essential-only"))}
          onDismiss={dismiss}
          onRequestPolicy={(): void => setPolicyOpen(true)}
          returnFocusRef={manageRef}
        />
        {policyOpen && (
          <PrivacyPolicyModal open mode="read" onClose={(): void => setPolicyOpen(false)} />
        )}
      </>
    );
  }

  return (
    <CookieBar
      onEssentialOnly={(): void => settle(decisionFor("essential-only"))}
      onChoose={openCard}
      onAcceptAll={(): void => settle(decisionFor("accept-all"))}
      chooseRef={manageRef}
    />
  );
}
