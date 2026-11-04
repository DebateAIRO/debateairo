import { t, type MessageCatalog } from "../i18n/translate.js";
import { typedGoesPublic, type PublicStage } from "./publicState.js";

/*
 * The notes where the person types something that may go on a debate's public page (owner's screen review, 3 Nov 2026):
 * under the own-view box (journey-f20, dig-f26) and in the tray (public-f26). The wave-2 review (4 Nov): they follow the
 * DEBATE's own state, never the person's plan today, so a Free person's debate that the check kept private, or an older
 * paid one, never claims to be public.
 *  - The debate's public state says it goes (or went) public (public, will be public, being checked): journey-f20's
 *    "This will be public." under the own-view box, and public-f26's "This adds to your public debate." in the tray.
 *  - It says the check kept it private: nothing.
 *  - It says nothing more than private (today's server, until its optional `public_stage` field comes) on a debate that
 *    ran on Free: dig-f26's own line, which the record words with "may", "Free debates are public, so your view may be
 *    shown on this public page.", under the own-view box only (the tray's sentence is definite, so it waits for the
 *    stage). A paid debate: nothing.
 *  - A dig made from someone else's public page: nothing (its own note says what became of it).
 * Pure: nothing here reads or keeps anything.
 */
export type TypedPublicNotes = Readonly<{ ownView: string | null; tray: string | null }>;

const NONE: TypedPublicNotes = Object.freeze({ ownView: null, tray: null });

export function typedPublicNotes(input: Readonly<{
  stage: PublicStage | null;
  /** The debate itself ran on Free (its own web mark), not the person's plan today. */
  ranOnFree: boolean;
  /** The person's own debate (not a dig made from someone else's public page). */
  ownDebate: boolean;
  catalog: MessageCatalog;
}>): TypedPublicNotes {
  const { stage, catalog } = input;
  if (!input.ownDebate) return NONE;
  if (typedGoesPublic(stage)) {
    return Object.freeze({ ownView: t(catalog, "v4.publicMark.willBePublic"), tray: t(catalog, "v4.publicMark.addsToPublic") });
  }
  if (stage !== null || !input.ranOnFree) return NONE;
  return Object.freeze({ ownView: t(catalog, "v4.suggest.ownViewPublic"), tray: null });
}
