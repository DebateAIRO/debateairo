import { dateLocale, formatDate, t, tPlural, type MessageCatalog } from "./i18n/translate.js";

/**
 * An English date older than five weeks is written in words ("20 Oct 2020"), never all in numbers: since English pages
 * write the day first (owner's answer to question 5, 5 Nov 2026), "05/11/2026" would read as May 11 to a reader of United
 * States English. Every other language keeps its own short form.
 */
const ENGLISH_OLDER_DATE: Intl.DateTimeFormatOptions = Object.freeze({ dateStyle: "medium" });

export function relativeTime(
  input: string | null | undefined,
  catalog?: MessageCatalog,
  locale = "en"
): string {
  if (!input) return "";
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return t(catalog, "time.justNow");
  const min = Math.round(sec / 60);
  if (min < 60) return tPlural(catalog, "time.minutes", min, locale);
  const hr = Math.round(min / 60);
  if (hr < 24) return tPlural(catalog, "time.hours", hr, locale);
  const day = Math.round(hr / 24);
  if (day === 1) return t(catalog, "time.yesterday");
  if (day < 7) return tPlural(catalog, "time.days", day, locale);
  const week = Math.round(day / 7);
  if (week < 5) return tPlural(catalog, "time.weeks", week, locale);
  return formatDate(locale, input, dateLocale(locale) === dateLocale("en") ? ENGLISH_OLDER_DATE : undefined);
}

export function statusLabel(status: string, catalog?: MessageCatalog): string {
  const s = (status || "").toLowerCase();
  if (s === "complete" || s === "completed" || s === "done") return t(catalog, "time.status.complete");
  if (s === "queued") return t(catalog, "time.status.queued");
  if (s === "claimed") return t(catalog, "time.status.claimed");
  if (s === "running") return t(catalog, "time.status.running");
  if (s === "holding") return t(catalog, "time.status.holding");
  if (s === "waiting") return t(catalog, "time.status.waiting");
  if (s === "settled") return t(catalog, "time.status.settled");
  if (s === "generating" || s === "in_progress" || s === "pending") return t(catalog, "time.status.generating");
  if (s === "failed" || s === "error") return t(catalog, "time.status.failed");
  if (s === "draft") return t(catalog, "time.status.draft");
  return status || "—";
}

export function isComplete(status: string): boolean {
  const s = (status || "").toLowerCase();
  return s === "complete" || s === "completed" || s === "done";
}
