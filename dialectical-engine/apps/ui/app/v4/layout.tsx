import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { V4DigUndoHost } from "@/components/v4/V4DigUndo";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import "./v4-base.css";
import "./v4-ask.css";
import "./v4-map.css";
import "./v4-debate.css";
import "./v4-wait.css";
import "./v4-report.css";
import "./v4-map-looks.css";
import "./v4-undo.css";

/* V4 initial (2026-10-28): the V4 pages live beside V3 under /v4 and share only the site's tokens (globals.css). */

/**
 * The words the site-wide dig note uses: the catalogue's "undo", "dig" and "digMode" groups only (v4.<group>.…), so the
 * layout does not send the whole catalogue a second time.
 */
const HOST_GROUPS: ReadonlySet<string> = new Set(["undo", "dig", "digMode"]);

/*
 * V4 UX fixes (owner pick dig-d3, 3 Nov): the layout stays mounted while the person moves between V4 pages, so it holds
 * the site-wide dig note: a dig pressed on the map keeps its 10 seconds and its Undo on the report or the ask page. A page
 * that draws the notes in its own bottom stack (the map) claims them, and this holder steps back.
 */
export default async function V4Layout({ children }: { children: ReactNode }) {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "v4");
  const words = Object.fromEntries(Object.entries(catalog).filter(([key]) => HOST_GROUPS.has(key.split(".")[1] ?? "")));
  return (
    <div className="v4Root">
      {children}
      <V4DigUndoHost catalog={words} locale={locale} />
    </div>
  );
}
