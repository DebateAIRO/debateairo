"use client";

import type { V4BarJob } from "@/components/v4/V4BottomStack";
import type { V4DigChoice } from "@/components/v4/V4DigSuggest";
import { pathTitle } from "@/components/v4/V4MapTree";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { V4DigQuota } from "@/lib/v4/digQuota";
import type { DigTarget, V4DigDraft, V4Map, V4Selection } from "@/lib/v4/types";

/*
 * The map page's dig pieces that are not wiring (moved out of V4DebateClient.tsx, the wave-2 review of 4 Nov: the page
 * file keeps only a thin wiring layer, by the agreement with the start-step session). Pure functions and one DOM helper;
 * nothing here reads or keeps anything.
 */

/** What the phone's pinned dig button digs into, and whether a dig is already there. */
export type PhoneTarget = Readonly<{ target: DigTarget; again: boolean }>;

/**
 * journey-d3 / dig-f31 (owner's screen review, 3 Nov): the phone's pinned bar, in the record's two states. On a path with
 * nothing picked, "Choose what to dig ›" takes the person to the path's choices (a whole path is never dug from the bar
 * before they have seen them and the share; whether the bar may then dig the whole path is an owner question). With
 * picks, it digs them ("Dig into your pick · up to 3%"); an open question's own screen digs that one question.
 * dig-f11 / journey-f14: while new digs wait for a reset, or while the report is written (report-d2, `rest`), a button
 * that would dig stays where it is, greyed, with the visible line that says why (V4BottomStack), and pressing it shows
 * the panel's same line. A whole path keeps "Choose what to dig ›" then too (the wave-2 checks, 4 Nov): the choices show
 * the greyed button, its reason and "Add to tray", so the bar still leads there.
 */
export function phoneBarJob(phone: PhoneTarget, quota: V4DigQuota, catalog: MessageCatalog, onDig: () => void,
  show: (place: "choices" | "dig") => void, rest: string | null): V4BarJob {
  if (phone.target.kind === "path") return { kind: "choose", label: t(catalog, "v4.dig.chooseWhat"), onChoose: () => show("choices") };
  const share = quota.share(phone.target);
  if (rest !== null) return { kind: "dig", label: quota.label(phone.target), onDig: () => show("dig"), waiting: true, reason: rest };
  if (quota.waitLine !== null) {
    return { kind: "dig", label: quota.label(phone.target), onDig: () => show("dig"), waiting: true, reason: quota.waitLine };
  }
  return { kind: "dig", label: quota.label(phone.target), onDig, share, place: placeOf(phone.target) };
}

/** journey-f8: the place a dig button digs, so a share of another place is never shown as a change of this one. */
export function placeOf(target: DigTarget): string {
  return target.kind === "open" ? `open:${target.questions.map((question) => question.id).join(",")}` : `path:${target.path?.id ?? "root"}`;
}

/**
 * dig-f5: the place the person's picks wait on, named, and the way to it; null while nothing is picked. ACCESS-4 (the
 * wave-2 review): "Go to them" removes itself, so the new place opens with focus on its heading, as a keyboard press does.
 */
export function picksPlaceOf(map: V4Map, draft: V4DigDraft, catalog: MessageCatalog,
  select: (selection: V4Selection, viaKeyboard: boolean) => void): Pick<V4DigChoice, "picksPlace"> | null {
  if (draft.picks.length === 0) return null;
  const path = draft.group === null ? null : map.paths.find((candidate) => candidate.id === draft.group) ?? null;
  if (draft.group !== null && path === null) return null;
  const title = path === null ? { text: t(catalog, "v4.nest.trailRoot"), ai: false } : pathTitle(path, catalog, 40);
  return { picksPlace: { title, onGo: () => select(path === null ? "root" : `path:${path.id}`, true) } };
}

/**
 * dig-f31: brings the place's choices (a path's "Choose what to dig") or its dig block into view at once, moves focus there
 * and gives it the shared 1-second highlight (app/v4/v4-base.css). Nothing is dug. ACCESS-11: the phone's where-bar is
 * pinned to the top, so the place stops just under it instead of behind it.
 */
export function showChoices(column: HTMLElement | null, place: "choices" | "dig"): void {
  const choices = place === "choices" ? column?.querySelector<HTMLElement>(".v4Sugs") ?? null : null;
  const target = choices ?? column?.querySelector<HTMLElement>(".v4PanelDig") ?? null;
  if (target === null) return;
  const pinned = document.querySelector<HTMLElement>(".v4WhereBar");
  const room = pinned === null ? 0 : Math.ceil(pinned.getBoundingClientRect().height);
  target.style.scrollMarginTop = room > 0 ? `${room + 8}px` : "";
  if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start" });
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.classList.remove("v4Highlight");
  void target.offsetWidth;
  target.classList.add("v4Highlight");
  // dig-f11 / journey-f14: the line that says why digging cannot start now takes the highlight again too.
  for (const line of target.querySelectorAll<HTMLElement>(".v4DigWaitLine, [data-dig-rest]")) {
    line.classList.remove("v4Highlight");
    void line.offsetWidth;
    line.classList.add("v4Highlight");
  }
}
