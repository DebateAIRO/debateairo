import { formatArchiveTime, type ArchiveCatalog } from "./archive-catalog.js";
import type { DebateEntry, ExportSnapshot } from "./types.js";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const words = (value: unknown): string => typeof value === "string" ? value : "";
const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]!);

function dateText(value: unknown, locale: string): string {
  const date = new Date(words(value));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date) : "";
}

function storyTexts(value: unknown): string[] {
  const body = object(object(value).story);
  if (!Object.keys(body).length) return [];
  const short = object(body.short);
  const why = object(body.why);
  const long = object(body.long);
  return [
    short.headline, short.summary, short.confidence,
    ...list(short.paths).map((path) => object(path).line),
    object(short.change).text,
    ...list(why.reasons).map((reason) => object(reason).text),
    ...list(long.sections).flatMap((section) => [object(section).title,
      ...list(object(section).paragraphs).map((paragraph) => object(paragraph).text)]),
    object(body.reviewer_note).text
  ].map(words).filter(Boolean);
}

function renderDebate(entry: DebateEntry, catalog: ArchiveCatalog, locale: string): string {
  const date = dateText(entry.created_at, locale);
  const visibility = entry.visibility_history.at(-1)?.state;
  const visibilityLabel = visibility === "PUBLIC" || visibility === "PUBLISHED" ? catalog["archive.visibilityPublic"] : catalog["archive.visibilityPrivate"];
  if (entry.content_status === "UNRECOVERABLE") {
    return `<article><p class="meta">${escapeHtml(date)} · ${escapeHtml(visibilityLabel)}</p><p>${escapeHtml(catalog["archive.unreadable"])}</p></article>`;
  }
  const verdict = words(object(entry.run_answer).verdict_state);
  const verdictKey = ({ SUPPORTED: "archive.verdictSupported", CONTESTED: "archive.verdictContested", UNSUPPORTED: "archive.verdictUnsupported" } as Record<string, string>)[verdict];
  const answer = entry.answers?.[0];
  const latest = answer?.versions.at(-1);
  const answerData = object(latest?.answer);
  const claims = list(answerData.nodes).map((node) => words(object(node).claim)).filter(Boolean);
  const answerText = list(answerData.composed_text).map((segment) => words(object(segment).text)).filter(Boolean).join("\n\n");
  const story = storyTexts(answer?.story);
  return `<article><p class="meta">${escapeHtml(date)} · ${escapeHtml(visibilityLabel)}</p>
    <h3>${escapeHtml(catalog["archive.question"])}: ${escapeHtml(entry.question)}</h3>
    ${verdictKey ? `<p><span class="label">${escapeHtml(catalog["archive.verdict"])}:</span> <span class="pill ${verdict.toLowerCase()}">${escapeHtml(catalog[verdictKey])}</span></p>` : ""}
    ${answerText ? `<div class="answer">${escapeHtml(answerText).replace(/\n\n/g, "<br><br>")}</div>` : ""}
    ${story.length ? `<h4>${escapeHtml(catalog["archive.story"])}</h4>${story.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}` : ""}
    ${claims.length ? `<h4>${escapeHtml(catalog["archive.arguments"])}</h4><ul>${claims.map((claim) => `<li>${escapeHtml(claim)}</li>`).join("")}</ul>` : ""}
  </article>`;
}

export function renderYourDataHtml(snapshot: ExportSnapshot, catalog: ArchiveCatalog): string {
  const locale = snapshot.locale;
  const account = object(snapshot.account.account);
  const pseudonym = words(account.pseudonym);
  const email = words(account.email);
  const generated = catalog["archive.generated"]!
    .replace("{time}", formatArchiveTime(snapshot.generatedAt, locale))
    .replace("{pseudonym}", pseudonym);
  const debates = [...snapshot.debates.debates].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const heading = catalog["archive.debatesHeading"]!.replace("{count}", String(debates.length));
  return `<!doctype html>
<html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(catalog["archive.pageTitle"])}</title>
<style>
:root{color-scheme:light;--bg:#faf7f2;--ink:#29231f;--card:#fffdf9;--line:#d7ccc1;--muted:#655b54}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,sans-serif}
main{max-width:760px;margin:auto;padding:40px 20px 80px}article,section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin:18px 0}
h1,h2,h3,h4{line-height:1.25}.meta{color:var(--muted)}.answer{white-space:normal}.pill{display:inline-block;border-radius:999px;padding:2px 10px;font-weight:600}
.supported{background:#d9ecdc;color:#215333}.contested{background:#f4e7bc;color:#654500}.unsupported{background:#f4d9d6;color:#7b2d27}
@media (prefers-color-scheme: dark){:root{color-scheme:dark;--bg:#171b1d;--ink:#f2eee7;--card:#242a2d;--line:#4b5558;--muted:#c1c8c9}}
</style></head><body><main>
<h1>${escapeHtml(catalog["archive.pageTitle"])}</h1><p>${escapeHtml(generated)}</p>
<section><h2>${escapeHtml(catalog["archive.accountHeading"])}</h2><p>${escapeHtml(pseudonym)}</p>
<p>${escapeHtml(catalog["archive.email"])}: ${escapeHtml(email)}</p>
<p>${escapeHtml(catalog["archive.memberSince"])}: ${escapeHtml(dateText(account.created_at, locale))}</p></section>
<h2>${escapeHtml(heading)}</h2>
${debates.length ? debates.map((debate) => renderDebate(debate, catalog, locale)).join("\n") : `<p>${escapeHtml(catalog["archive.noDebates"])}</p>`}
<p>${escapeHtml(catalog["archive.filesNote"])}</p>
</main></body></html>`;
}
