"use client";

import { createContext, useContext } from "react";
import { localeDirection } from "@/lib/i18n/questionLocale";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8, ruling S2): each opening position is titled
 * "The case for {answer}, argued by {ai}" in the question's language. The page builds the
 * titles once (`positionTitlesFrom`, lib/v3/mapView.ts) and hands them down by context, so
 * every view titles a position the same way without carrying a catalogue of its own. A node
 * without a title keeps today's heading.
 */
export type PositionTitles = Readonly<{ locale: string; byNodeId: ReadonlyMap<string, string> }>;

export const NO_POSITION_TITLES: PositionTitles = Object.freeze({ locale: "en", byNodeId: new Map<string, string>() });

export const PositionTitlesContext = createContext<PositionTitles>(NO_POSITION_TITLES);

export function PositionTitle({ nodeId }: { nodeId: string }) {
  const titles = useContext(PositionTitlesContext);
  const title = titles.byNodeId.get(nodeId);
  if (title === undefined) return null;
  return (
    <p className="positionTitle" lang={titles.locale} dir={localeDirection(titles.locale)} data-ai-generated="true">
      {title}
    </p>
  );
}
