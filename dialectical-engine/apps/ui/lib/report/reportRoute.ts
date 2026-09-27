import { ContractHttpError, type Answer, type AnswerStory, type ContractClient } from "@debateai/contract";
import publicEnglish from "../../messages/en/public.json" with { type: "json" };
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type LocaleCode } from "../i18n/locales.js";
import { questionLocale } from "../i18n/questionLocale.js";
import { loadNamespace } from "../i18n/server.js";
import { t, type MessageCatalog } from "../i18n/translate.js";
import { USER_TOKEN_COOKIE, sessionCookieValue } from "../serverApi.js";
import { renderReportPdf } from "./renderReport.js";
import {
  loadReportCatalogs,
  reportSupportedForLocale,
  type ReportCatalogLoader,
  type ReportCatalogs
} from "./reportLanguage.js";

/**
 * GET /debate/{id}/report (spec 2026-09-26 §10, §14.3): the owner's full report
 * as a PDF attachment, printed in the QUESTION's language. Only READY and
 * READY_WITH_RESERVATION stories have one. Nothing is stored; every refusal is
 * one short plain line from the `public` catalogue, never the caught text.
 */
export type ReportReader = Pick<ContractClient, "readAnswer" | "readRunAnswer" | "readRun" | "readAnswerStory">;

export type ReportRenderer = (input: Readonly<{
  answer: Answer;
  story: AnswerStory;
  generatedAt: Date;
  catalogs: ReportCatalogs;
}>) => Promise<Buffer>;

/**
 * The slug's limits. 60 characters (as a reader counts them) keeps the name
 * readable; 180 UTF-8 bytes keeps "debate-<slug>-<yyyy-mm-dd>.pdf" within the
 * 255-byte file-name limit of common file systems, whatever the script.
 */
const SLUG_LIMITS = Object.freeze({ characters: 60, utf8Bytes: 180 });
const SLUG_FALLBACK = "report";

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
  });
}

/**
 * Every value of one cookie in a raw `cookie` header, in order; null when the
 * header is absent or carries a line break or NUL (the /api proxy's rule).
 */
function cookieValues(header: string | null, name: string): string[] | null {
  if (header === null || /[\r\n\0]/.test(header)) return null;
  return header.split(";").flatMap((member) => {
    const index = member.indexOf("=");
    if (index < 1 || member.slice(0, index).trim() !== name) return [];
    return [member.slice(index + 1).trim()];
  });
}

/** The session exactly as the /api proxy accepts it: one occurrence, the 43-character grammar. */
export function sessionFromCookieHeader(header: string | null): string | null {
  const values = cookieValues(header, USER_TOKEN_COOKIE);
  return values !== null && values.length === 1 ? sessionCookieValue(values[0]) : null;
}

/**
 * The reader's interface locale, from the same cookie the debate page reads.
 * Of two same-named cookies the last wins, as in Next's own cookie store; an
 * absent or unknown value is English.
 */
export function interfaceLocaleFromCookieHeader(header: string | null): LocaleCode {
  const value = cookieValues(header, LOCALE_COOKIE)?.at(-1);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * A slug cut to SLUG_LIMITS: whole characters only, at the last word break in
 * reach when there is one, and the fallback when nothing is left.
 */
function limitSlug(slug: string): string {
  const pieces = Array.from(graphemes.segment(slug), ({ segment }) => segment);
  let kept = 0;
  let bytes = 0;
  while (kept < pieces.length && kept < SLUG_LIMITS.characters) {
    const size = Buffer.byteLength(pieces[kept]!, "utf8");
    if (bytes + size > SLUG_LIMITS.utf8Bytes) break;
    bytes += size;
    kept += 1;
  }
  let cut = pieces;
  if (kept < pieces.length) {
    const lastBreak = pieces[kept] === "-" ? kept : pieces.lastIndexOf("-", kept - 1);
    cut = pieces.slice(0, lastBreak > 0 ? lastBreak : kept);
  }
  const result = cut.join("").replace(/-+$/u, "");
  return result.length === 0 ? SLUG_FALLBACK : result;
}

/**
 * The ASCII fallback slug for `filename="…"`: the Latin letters and digits
 * that survive dropping their accents (no transliteration), lower-case,
 * joined by hyphens; "report" when none survive.
 */
export function reportSlug(question: string): string {
  return limitSlug(question
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""));
}

/**
 * The real slug for `filename*=UTF-8''…`: the question's own letters, marks
 * and digits in any script, lower-case, joined by hyphens; "report" when none
 * are left. A broken UTF-16 pair is not a letter, so it never reaches the
 * percent-encoding.
 */
export function reportUnicodeSlug(question: string): string {
  return limitSlug(question
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, ""));
}

function datedName(slug: string, now: Date): string {
  return `debate-${slug}-${now.toISOString().slice(0, 10)}.pdf`;
}

/** The ASCII file name: `debate-<slug>-<yyyy-mm-dd>.pdf`. */
export function reportFilename(question: string, now: Date): string {
  return datedName(reportSlug(question), now);
}

/** RFC 5987 value-chars: percent-encode everything but the attr-chars encodeURIComponent would let through. */
function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * The attachment header: the ASCII name for every browser, and the real name
 * (RFC 6266 / RFC 5987) for the browsers that read it, so a Romanian or
 * Japanese question keeps readable letters.
 */
export function reportContentDisposition(question: string, now: Date): string {
  const unicodeName = datedName(reportUnicodeSlug(question), now);
  return `attachment; filename="${reportFilename(question, now)}"; filename*=UTF-8''${rfc5987(unicodeName)}`;
}

/** The same resolution as lib/serverApi.ts getDebateServer: an answer id first, then a run id. */
async function readAnswerByIdOrRun(client: ReportReader, id: string): Promise<Answer> {
  try {
    return await client.readAnswer(id);
  } catch (failure) {
    if (!(failure instanceof ContractHttpError) || failure.code !== "NOT_FOUND") throw failure;
    return client.readRunAnswer(id);
  }
}

/** The `public` catalogue for the refusal line; English when even that cannot be loaded. */
async function refusalCatalog(load: ReportCatalogLoader, locale: LocaleCode): Promise<MessageCatalog> {
  try {
    return await load(locale, "public");
  } catch {
    return publicEnglish;
  }
}

function signInResponse(publicCatalog: MessageCatalog): Response {
  return textResponse(401, t(publicCatalog, "public.report.error.signIn"));
}

function notAvailableResponse(publicCatalog: MessageCatalog): Response {
  return textResponse(404, t(publicCatalog, "public.report.error.notAvailable"));
}

function unsupportedResponse(publicCatalog: MessageCatalog): Response {
  return textResponse(404, t(publicCatalog, "public.story.reportUnsupported"));
}

function tryAgainResponse(status: 500 | 502, publicCatalog: MessageCatalog): Response {
  return textResponse(status, t(publicCatalog, "public.report.error.tryAgain"));
}

function upstreamFailureResponse(failure: unknown, publicCatalog: MessageCatalog): Response {
  if (failure instanceof ContractHttpError && failure.code === "SESSION_REQUIRED") return signInResponse(publicCatalog);
  if (failure instanceof ContractHttpError && failure.code === "NOT_FOUND") return notAvailableResponse(publicCatalog);
  return tryAgainResponse(502, publicCatalog);
}

/**
 * The report for debate `id`, read with the owner's session:
 *  1. the answer (by answer id, then by run id) and its run, whose
 *     `argument_language` names the question's language;
 *  2. the question's locale (`und` or unknown falls back to the interface
 *     locale); a locale the fonts cannot print yet is refused before any
 *     further read;
 *  3. the story, which must be READY or READY_WITH_RESERVATION with a body;
 *  4. the PDF, rendered in memory in that locale.
 * A refusal speaks the question's locale once the run has named it, the
 * interface locale before that.
 */
export async function handleReportRequest(input: Readonly<{
  id: string;
  sessionCookie: string | null;
  interfaceLocale: LocaleCode;
  client: () => ReportReader;
  now: Date;
  load?: ReportCatalogLoader;
  render?: ReportRenderer;
  supported?: (locale: string) => boolean;
}>): Promise<Response> {
  const load = input.load ?? loadNamespace;
  if (input.sessionCookie === null) return signInResponse(await refusalCatalog(load, input.interfaceLocale));

  let client: ReportReader;
  let answer: Answer;
  let questionTag: string | null;
  try {
    client = input.client();
    answer = await readAnswerByIdOrRun(client, input.id);
    questionTag = (await client.readRun(answer.run_ref)).argument_language?.tag ?? null;
  } catch (failure) {
    return upstreamFailureResponse(failure, await refusalCatalog(load, input.interfaceLocale));
  }

  const locale = questionLocale(questionTag, input.interfaceLocale);
  if (!(input.supported ?? reportSupportedForLocale)(locale)) {
    return unsupportedResponse(await refusalCatalog(load, locale));
  }
  let catalogs: ReportCatalogs;
  try {
    catalogs = await loadReportCatalogs({ questionTag, interfaceLocale: input.interfaceLocale, load });
  } catch {
    console.error("[STORY_REPORT_CATALOGS_FAILED]");
    return tryAgainResponse(500, await refusalCatalog(load, locale));
  }
  const publicCatalog = catalogs.publicCatalog;

  let story: AnswerStory;
  try {
    story = await client.readAnswerStory(answer.answer_id);
  } catch (failure) {
    return upstreamFailureResponse(failure, publicCatalog);
  }
  if (story.story === null || (story.status !== "READY" && story.status !== "READY_WITH_RESERVATION")) {
    return notAvailableResponse(publicCatalog);
  }

  let pdf: Buffer;
  try {
    pdf = await (input.render ?? renderReportPdf)({ answer, story, generatedAt: input.now, catalogs });
  } catch {
    console.error("[STORY_REPORT_RENDER_FAILED]");
    return tryAgainResponse(500, publicCatalog);
  }
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": reportContentDisposition(answer.question_line, input.now),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
