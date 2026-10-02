"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acknowledgementNow,
  readConsent,
  subscribeToPreferenceRequests,
  writeConsent
} from "../../lib/consent";
import { CookieBar } from "./CookieBar";
import { CookiePreferencesCard } from "./CookiePreferencesCard";
import { PrivacyPolicyModal } from "./PrivacyPolicyModal";
import { useConsentCatalog } from "./useConsentCatalog";

/**
 * The ONE consent state machine.
 *
 * It is the only reader and the only writer of `debateai.consent`: `CookieBar` and
 * `CookiePreferencesCard` are presentational and prop-driven, so there is a single place
 * where the acknowledgement is written and a single place where the surface state lives.
 *
 * **Nothing is rendered until an effect has read storage.** The first render returns `null`,
 * on the server and on the client alike, so a returning visitor never sees the bar flash and
 * the two markups cannot disagree. The mode guard in `apps/ui/app/layout.tsx` runs a blocking
 * pre-paint script because a wrong THEME flashes visibly; a notice that is briefly ABSENT is
 * invisible, so no second pre-paint script is added.
 *
 * **The discriminator is the STORED VALUE, never the entry point.** The card behaves
 * identically from every door, and closing it re-evaluates storage (SPEC-v2 R06's ACK) rather
 * than remembering where it was opened from: no acknowledgement stored means the bar returns.
 */
type Surface = "silent" | "bar" | "card";

export function CookieConsent() {
  const catalog = useConsentCatalog();
  /** Undefined until the effect below has read storage. */
  const [surface, setSurface] = useState<Surface | undefined>(undefined);

  /**
   * Whether the read-only policy modal is open OVER the card. It is this component's state
   * rather than the card's because the modal element has to be a LATER SIBLING of the card,
   * and a child cannot render its own sibling.
   *
   * **It is PER-OPEN state, and `openCard` resets it.** The card can be closed while the
   * policy still stands over it — by its backdrop or by its own `Close` — and every such route
   * unmounts the card and the policy element together while this component stays mounted,
   * stranding the flag at `true`. The reset lives at the one entry point so that EVERY route
   * that closes the card, named or not, leaves the flag false at the next open (the whole
   * closing surface is driven in `tests/render/consent-policy-link.test.tsx`).
   */
  const [policyOpen, setPolicyOpen] = useState(false);

  /**
   * The bar's card button, lent to the shared helper so it can put focus back there when the
   * card closes. The bar is unmounted by the commit that opens the card, so the node that asked
   * is gone at close; this reference is re-attached to the FRESH button when the bar comes back,
   * in the layout phase of that commit, before the card's cleanup reads it. This component
   * moves no focus itself; it lends a node and the ONE helper decides.
   */
  const cardButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setSurface(readConsent() === null ? "bar" : "silent");
  }, []);

  /**
   * Opening the card, from any door. The opener is carried by the request only so the helper
   * can return focus to it; the helper captures it itself, so nothing here keeps it.
   */
  const openCard = useCallback((_opener: HTMLElement | null): void => {
    setPolicyOpen(false);
    setSurface("card");
  }, []);

  /**
   * Settings → Privacy, the footer and /cookies hold no reference to this component — it is
   * mounted as a SIBLING after `{children}` — so their requests arrive through the module-level
   * store. The unsubscribe is returned so a remount never leaves a second listener behind.
   */
  useEffect(() => subscribeToPreferenceRequests(openCard), [openCard]);

  /** The acknowledgement: one write of the v2 record, and both surfaces closed. */
  const acknowledge = useCallback((): void => {
    writeConsent(acknowledgementNow());
    setSurface("silent");
  }, []);

  /**
   * Closing the card. It writes nothing and asks the one question every row of the state
   * table asks: **is an acknowledgement stored?** Yes means Silent, anything else the bar —
   * identically for a first visit and for a signed-in visitor who reached the card from
   * Settings with the key deleted.
   */
  const dismiss = useCallback((): void => {
    setSurface(readConsent() === null ? "bar" : "silent");
  }, []);

  if (surface === undefined || surface === "silent") return null;

  if (surface === "card") {
    /**
     * The policy modal is the card's LATER SIBLING because V-20 recorded that shape; which
     * surface answers the dismiss key does not depend on it — the shared helper resolves two
     * unrelated open surfaces by the order they OPENED in (V-20 (b), ADR-0022's addenda). It
     * is mounted CONDITIONALLY, so every open is a fresh read.
     */
    return (
      <>
        <CookiePreferencesCard
          catalog={catalog}
          onDismiss={dismiss}
          onRequestPolicy={(): void => setPolicyOpen(true)}
          returnFocusRef={cardButtonRef}
        />
        {policyOpen && (
          <PrivacyPolicyModal open mode="read" onClose={(): void => setPolicyOpen(false)} />
        )}
      </>
    );
  }

  return (
    <CookieBar
      catalog={catalog}
      onAcknowledge={acknowledge}
      onOpenCard={openCard}
      cardButtonRef={cardButtonRef}
    />
  );
}
