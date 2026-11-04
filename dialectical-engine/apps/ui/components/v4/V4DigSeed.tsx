"use client";

import { useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { digGroupOf, useDigUndo, type DigUndoEntry } from "@/lib/v4/digUndo";
import { DigFirstQuestion } from "./V4DigUndo";

/*
 * V4 UX fixes (owner pick dig-d3 B): the map answers a dig at the click. A dashed card grows under the path at once
 * ("Your dig · Is storage cheap enough… · starting"), Undo pulls it back in, and once the dig is sent the real dig card
 * takes its place (solid, with its own state words). For people who ask for less motion it simply appears and goes.
 * The map tree inserts these leaves at the end of a group's column (V4MapTree's Leaves); the card's final look is the
 * map's (journey-f2), so the classes here are plain and local.
 */

function SeedLeaf(props: Readonly<{ entry: DigUndoEntry; catalog: MessageCatalog }>) {
  const { entry, catalog } = props;
  // Undo: the card shrinks back (0.3 s), then leaves the column.
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const leaving = entry.phase === "CANCELLED";
  return (
    <li className={`v4MapLeaf v4MapLeafSeed${leaving ? " v4MapLeafSeedLeaving" : ""}`} aria-hidden={leaving ? "true" : undefined}>
      <div className={`v4DigSeed${leaving ? " v4DigSeedLeaving" : ""}`} onAnimationEnd={leaving ? () => setGone(true) : undefined}>
        <span className="v4DigSeedTitle">
          {t(catalog, "v4.seed.yourDig")}{" · "}<DigFirstQuestion target={entry.dig.target} />
        </span>
        <span className="v4MapNote">{t(catalog, "v4.seed.starting")}</span>
      </div>
    </li>
  );
}

/** The seeds of one group (a path id, or "root") on this debate's map, while their digs wait or were just undone. */
export function V4DigSeedLeaves(props: Readonly<{ runId: string; groupKey: string; catalog: MessageCatalog }>) {
  const entries = useDigUndo();
  const seeds = entries.filter((entry) => entry.parentRunId === props.runId
    && (entry.phase === "COUNTING" || entry.phase === "SENDING" || entry.phase === "CANCELLED")
    && digGroupOf(entry.dig.target) === props.groupKey);
  if (seeds.length === 0) return null;
  return <>{seeds.map((entry) => <SeedLeaf key={entry.id} entry={entry} catalog={props.catalog} />)}</>;
}
