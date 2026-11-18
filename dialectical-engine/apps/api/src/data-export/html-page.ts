import { archiveDateTag, formatArchiveTime, type ArchiveCatalog } from "./archive-catalog.js";
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
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(archiveDateTag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(date) : "";
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

/**
 * EU AI Act Art. 50(2): the machine-readable mark on each element showing AI-generated content (the verdict, the answer,
 * the story, the arguments), as the site marks its own pages. Never on the person's question (owner's rule), never on a
 * label; an attribute only, which the style sheet never selects on, so nothing a reader sees changes.
 */
const AI = ' data-ai-generated="true"';

function renderDebate(entry: DebateEntry, catalog: ArchiveCatalog, locale: string): string {
  const date = dateText(entry.created_at, locale);
  const visibility = entry.visibility_history.at(-1)?.state;
  const visibilityLabel = visibility === "PUBLISHED" ? catalog["archive.visibilityPublic"] : catalog["archive.visibilityPrivate"];
  if (entry.content_status === "UNRECOVERABLE") {
    return `<article><p class="meta">${escapeHtml(date)} · ${escapeHtml(visibilityLabel)}</p><p class="unreadable">${escapeHtml(catalog["archive.unreadable"])}</p></article>`;
  }
  const verdict = words(object(entry.run_answer).verdict_state);
  // R2 (ruling E8, Q1): SPLIT, "no majority", says the locale's "Contested"; CONTESTED now says its "Close call".
  // OWNER WORDING — approve before R2b's upload (Q1 ships live, engine 1 included). Q1 option 1.
  const verdictKeys: Readonly<Record<string, string>> = { SUPPORTED: "archive.verdictSupported", CONTESTED: "archive.verdictContested", UNSUPPORTED: "archive.verdictUnsupported", SPLIT: "archive.verdictSplit" };
  // Only the four states' own keys: a stored "constructor" must never read the object's inherited member (R2b P7).
  const verdictKey = Object.hasOwn(verdictKeys, verdict) ? verdictKeys[verdict] : undefined;
  const answer = entry.answers?.[0];
  const latest = answer?.versions.at(-1);
  const latestCheck = answer?.synthesis_checks?.find((check) => check.answer_version === latest?.version);
  const checkVerdictKey = latestCheck === undefined ? undefined : ({
    FLAGGED: "archive.verdict.flagged", CLEAR: "archive.verdict.clear",
    NO_SYNTHESIS: "archive.verdict.noSynthesis", UNAVAILABLE: "archive.verdict.unavailable"
  } as const)[latestCheck.verdict];
  const checkCategoryKeys = {
    TERRORISM: "archive.category.terrorism", HATE_SPEECH: "archive.category.hateSpeech",
    SUICIDE_OR_HARM_TO_OTHERS: "archive.category.suicideOrHarm", WEAPONS_OR_DRUGS: "archive.category.weaponsOrDrugs"
  } as const;
  const checkCategories = latestCheck?.categories.map((category) => catalog[checkCategoryKeys[category]]).join(", ") ?? "";
  const publicationReviews = answer?.publication_reviews ?? [];
  const reviewRows = publicationReviews.map((review) => {
    const asked = `${escapeHtml(catalog["archive.reviewAsked"])} ${escapeHtml(formatArchiveTime(new Date(review.asked_at), locale))}`;
    const decision = review.outcome === "APPROVE"
      ? `${escapeHtml(catalog["archive.reviewApproved"])} ${escapeHtml(formatArchiveTime(new Date(review.decided_at!), locale))}`
      : review.outcome === "REFUSE"
        ? `${escapeHtml(catalog["archive.reviewRefused"])} ${escapeHtml(formatArchiveTime(new Date(review.decided_at!), locale))}${review.reason === null ? "" : ` · ${escapeHtml(review.reason)}`}`
        : "";
    return `<p class="check">${asked}${decision ? ` · ${decision}` : ""}</p>`;
  }).join("");
  const answerData = object(latest?.answer);
  const claims = list(answerData.nodes).map((node) => words(object(node).claim)).filter(Boolean);
  const answerText = list(answerData.composed_text).map((segment) => words(object(segment).text)).filter(Boolean).join("\n\n");
  const story = storyTexts(answer?.story);
  return `<article><p class="label">${escapeHtml(catalog["archive.question"])}</p>
    <h3>${escapeHtml(entry.question)}</h3><p class="meta">${escapeHtml(date)} · ${escapeHtml(visibilityLabel)}</p>
    ${verdictKey ? `<p class="label verdict-label">${escapeHtml(catalog["archive.verdict"])}</p><span class="pill ${verdict.toLowerCase()}"${AI}>${escapeHtml(catalog[verdictKey])}</span>` : ""}
    ${answerText ? `<div class="answer"${AI}>${escapeHtml(answerText).replace(/\n\n/g, "<br><br>")}</div>` : ""}
    ${story.length ? `<p class="label section-label">${escapeHtml(catalog["archive.story"])}</p>${story.map((text) => `<p class="story-text"${AI}>${escapeHtml(text)}</p>`).join("")}` : ""}
    ${claims.length ? `<p class="label section-label">${escapeHtml(catalog["archive.arguments"])}</p><ul${AI}>${claims.map((claim) => `<li>${escapeHtml(claim)}</li>`).join("")}</ul>` : ""}
    ${latestCheck && checkVerdictKey ? `<p class="label section-label">${escapeHtml(catalog["archive.contentCheck"])}</p><p class="check"><strong${latestCheck.verdict === "FLAGGED" ? ' class="flagged"' : ""}>${escapeHtml(catalog[checkVerdictKey])}</strong> · ${checkCategories ? `${escapeHtml(checkCategories)} · ` : ""}${escapeHtml(formatArchiveTime(new Date(latestCheck.checked_at), locale))}</p>` : ""}
    ${reviewRows ? `<p class="label section-label">${escapeHtml(catalog["archive.publicationReview"])}</p>${reviewRows}` : ""}
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
<html lang="${escapeHtml(locale)}" dir="${locale === "ar" || locale === "he" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(catalog["archive.pageTitle"])}</title>
<style>
:root{color-scheme:light;--bg:#F3F5F9;--surface:#FFFFFF;--text:#121826;--text-2:#4A5468;--muted:#5E6779;--line:#E3E7EF;--line-strong:#D3D9E4;--gold-text:#A84B05;--gold-border:#FFC08A;--agree-text:#2F7A47;--dispute:#B42318;--dispute-border:#F2B8B0}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:720px;margin:0 auto;padding:48px 24px}
header{padding-bottom:20px;border-bottom:1px solid var(--line-strong)}
h1,h2,h3{letter-spacing:-.02em}h1{margin:0;font-size:30px;font-weight:700;line-height:1.25;letter-spacing:-.02em}header p{margin:10px 0 0;font-size:13px;color:var(--text-2)}
section.account-section{margin-top:28px}section.debates-section{margin-top:32px}h2{margin:0 0 12px;font-size:20px;font-weight:700;line-height:1.25}
.account-card,article{background:var(--surface);border:1px solid var(--line);border-radius:14px}
.account-card{padding:14px 18px}.pseudonym{margin:0 0 8px;font-size:15px;font-weight:700}
dl{margin:0;display:grid;grid-template-columns:140px 1fr;row-gap:6px;font-size:14px}dt{color:var(--muted)}dd{margin:0}
article{padding:18px 22px}article+article{margin-top:16px}
.label{margin:18px 0 6px;font-size:12px;font-weight:700;color:var(--muted)}.label:first-child{margin-top:0}
h3{margin:0;font-size:22px;font-weight:700;line-height:1.3}.meta{margin:8px 0 0;font-size:13px;color:var(--text-2)}article>.meta:first-child{margin-top:0}
.pill{display:inline-block;padding:2px 10px;border:1px solid var(--gold-border);border-radius:999px;color:var(--gold-text);font-size:12px;font-weight:700;line-height:1.5}
.pill.supported{border-color:var(--agree-text);color:var(--agree-text)}.pill.unsupported{border-color:var(--dispute-border);color:var(--dispute)}
.answer{margin:10px 0 0;font-size:15px;line-height:1.6}.story-text{margin:0;font-size:15px;line-height:1.6}
.check{margin:0;font-size:15px;line-height:1.6}.check strong{font-weight:700}.check strong.flagged{color:var(--dispute)}
ul{margin:0;padding-inline-start:20px;font-size:15px;line-height:1.55}li{margin:0 0 6px}
.unreadable{margin:8px 0 0;font-size:15px;font-style:italic;color:var(--text-2)}.empty{margin:0;font-size:15px;color:var(--text-2)}
footer{margin-top:32px;padding-top:16px;border-top:1px solid var(--line-strong);font-size:13px;color:var(--muted)}
@media (prefers-color-scheme: dark){:root{color-scheme:dark;--bg:#0E131D;--surface:#171E2B;--text:#EEF2F8;--text-2:#A7B1C2;--muted:#8B95A8;--line:#263042;--line-strong:#34405A;--gold-text:#FFB374;--gold-border:#8C4510;--agree-text:#86B58D;--dispute:#FF8A7A;--dispute-border:#7A3A35}}
</style></head><body><main>
<header><h1>${escapeHtml(catalog["archive.pageTitle"])}</h1><p>${escapeHtml(generated)}</p></header>
<section class="account-section"><h2>${escapeHtml(catalog["archive.accountHeading"])}</h2><div class="account-card"><p class="pseudonym">${escapeHtml(pseudonym)}</p>
<dl><dt>${escapeHtml(catalog["archive.email"])}</dt><dd>${escapeHtml(email)}</dd>
<dt>${escapeHtml(catalog["archive.memberSince"])}</dt><dd>${escapeHtml(dateText(account.created_at, locale))}</dd></dl></div></section>
<section class="debates-section"><h2>${escapeHtml(heading)}</h2>
${debates.length ? debates.map((debate) => renderDebate(debate, catalog, locale)).join("\n") : `<p class="empty">${escapeHtml(catalog["archive.noDebates"])}</p>`}
</section><footer>${escapeHtml(catalog["archive.filesNote"])}</footer>
</main></body></html>`;
}
