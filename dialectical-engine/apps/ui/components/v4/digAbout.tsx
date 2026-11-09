"use client";

import type { ReactNode } from "react";
import { pathTitle, shortText } from "@/components/v4/V4MapTree";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { DigTarget } from "@/lib/v4/types";

/*
 * dig-f9 (owner's screen review, 3 Nov 2026): the question check's screen can only come with the server's answer to a
 * sent dig, about 10 seconds after its click, so it opens with the place the dig is about: "About your dig on “Mostly
 * renewables”:". One piece for the map's digs and a public page's dig box; only the place's words are marked as AI text.
 */

/** Stands in for the place's words while the sentence around them is read from the catalogue (they may be AI text). */
const PLACE_SLOT = "\u0000place\u0000";

/** "About your dig on “…”:" around the place's own words. */
export function placeAboutLine(place: Readonly<{ text: string; ai: boolean }>, catalog: MessageCatalog): ReactNode {
  const [before = "", after = ""] = t(catalog, "v4.dig.checkAbout", { path: PLACE_SLOT }).split(PLACE_SLOT);
  return <>{before}<span data-ai-generated={place.ai ? "true" : undefined}>{shortText(place.text)}</span>{after}</>;
}

/** The map's dig: the place is the dig's path (its label), or its first open question, else the main question. */
export function digAboutLine(target: DigTarget, catalog: MessageCatalog): ReactNode {
  const path = target.kind === "open" ? null : target.path;
  const place = path !== null
    ? pathTitle(path, catalog, 70)
    : target.kind === "open" && target.questions[0] !== undefined
      ? { text: target.questions[0].text, ai: true }
      : { text: t(catalog, "v4.panel.crumbRoot"), ai: false };
  return placeAboutLine(place, catalog);
}
