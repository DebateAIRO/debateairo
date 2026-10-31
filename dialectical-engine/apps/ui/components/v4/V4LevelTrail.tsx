"use client";

import Link from "next/link";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { DigTrail } from "@/lib/v4/load";
import { levelHref } from "@/lib/v4/storage";
import type { ReadingLevel } from "@/lib/v4/types";
import { shortText } from "./V4MapTree";

/*
 * Dig model revision W4-6 (draft 5.5, "Nesting"): on a dig's own map, where it sits: the main question, then each path
 * that was dug on the way down ("Main question › {path} › …"), and "Level {n} of 10". Each part opens that map at that
 * path. The dig level counts the digs above this debate (owner Q-D12), never how far one debate's argument tree grows.
 * Until the debates above are read (or when one cannot be), the trail shows what it knows: the level, and "…" for the
 * part it could not read.
 */

function mapHref(runId: string, pathRef: string | null, level: ReadingLevel | null): string {
  const base = `/v4/debate/${encodeURIComponent(runId)}`;
  return levelHref(pathRef === null ? base : `${base}?path=${encodeURIComponent(pathRef)}`, level);
}

export function V4LevelTrail(props: Readonly<{
  /** This dig's level (1 to DIG_LEVEL_MAX). */
  level: number;
  /** The debates above it, top first; null while they are being read. */
  trail: DigTrail | null;
  linkLevel: ReadingLevel | null;
  catalog: MessageCatalog;
}>) {
  const { trail, catalog } = props;
  const steps = trail?.steps ?? [];
  const root = trail !== null && trail.complete ? steps[0] ?? null : null;
  return (
    <nav className="v4Trail" aria-label={t(catalog, "v4.nest.trailLabel")}>
      {trail === null ? null : (
        <ol className="v4TrailParts">
          {root !== null ? (
            <li><Link className="v4Link" href={mapHref(root.runId, null, props.linkLevel)}>{t(catalog, "v4.nest.trailRoot")}</Link></li>
          ) : <li aria-hidden="true">…</li>}
          {steps.map((step) => step.pathRef === null ? null : (
            <li key={`${step.runId}/${step.pathRef}`}>
              <Link className="v4Link" href={mapHref(step.runId, step.pathRef, props.linkLevel)}>
                {step.line === null || step.line.trim().length === 0
                  ? t(catalog, "v4.map.pathUntitled")
                  : <span data-ai-generated="true">{shortText(step.line, 40)}</span>}
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="v4TrailLevel">{t(catalog, "v4.nest.level", { n: props.level })}</p>
    </nav>
  );
}
