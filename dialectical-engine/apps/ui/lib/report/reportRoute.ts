import { ContractHttpError, type Answer, type AnswerDisclosure, type AnswerStory, type ContractClient } from "@debateai/contract";
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
 * The answer's record (Task M6, GET /v1/answers/{id}/disclosure) is read beside
 * the story, for "About this report"; without one, About says nothing it holds.
 */
export type ReportReader = Pick<ContractClient, "readAnswer" | "readRunAnswer" | "readRun" | "readAnswerStory" | "readAnswerDisclosure">;

export type ReportRenderer = (input: Readonly<{
  answer: Answer;
  story: AnswerStory;
  disclosure: AnswerDisclosure | null;
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

function textHeaders(): Record<string, string> {
  return { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" };
}

function textResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: textHeaders() });
}

function pdfHeaders(question: string, now: Date): Record<string, string> {
  return {
    "content-type": "application/pdf",
    "content-disposition": reportContentDisposition(question, now),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
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

function signInLine(publicCatalog: MessageCatalog): string {
  return t(publicCatalog, "public.report.error.signIn");
}

function notAvailableLine(publicCatalog: MessageCatalog): string {
  return t(publicCatalog, "public.report.error.notAvailable");
}

function unsupportedLine(publicCatalog: MessageCatalog): string {
  return t(publicCatalog, "public.story.reportUnsupported");
}

function tryAgainLine(publicCatalog: MessageCatalog): string {
  return t(publicCatalog, "public.report.error.tryAgain");
}

/** A refusal: its status, the locale its line speaks, and how to word that line. */
interface Refusal {
  readonly kind: "refused";
  readonly status: 401 | 404 | 500 | 502;
  readonly locale: LocaleCode;
  readonly line: (publicCatalog: MessageCatalog) => string;
}

/** Everything a report needs from the API, read and checked. */
interface ReadyReport {
  readonly kind: "ready";
  readonly answer: Answer;
  readonly story: AnswerStory;
  /** The answer's record, or null: none, not read (HEAD), or a read that failed. */
  readonly disclosure: AnswerDisclosure | null;
  readonly questionTag: string | null;
  readonly locale: LocaleCode;
}

function refuse(status: Refusal["status"], locale: LocaleCode, line: Refusal["line"]): Refusal {
  return { kind: "refused", status, locale, line };
}

/**
 * An API read that failed. Only a real failure (502) is logged, as a fixed tag
 * and the typed contract code: never the caught message, which may carry
 * upstream detail.
 */
function upstreamRefusal(failure: unknown, locale: LocaleCode): Refusal {
  if (failure instanceof ContractHttpError && failure.code === "SESSION_REQUIRED") return refuse(401, locale, signInLine);
  if (failure instanceof ContractHttpError && failure.code === "NOT_FOUND") return refuse(404, locale, notAvailableLine);
  console.error("[STORY_REPORT_UPSTREAM_FAILED]", failure instanceof ContractHttpError ? failure.code : "UNKNOWN");
  return refuse(502, locale, tryAgainLine);
}

/**
 * The answer's record for About. It never refuses the report: an answer from
 * before the record existed has none (404), and any other failure means About
 * says nothing it holds. A real failure is logged as a fixed tag and the typed
 * code, never the caught message.
 */
async function readReportDisclosure(client: ReportReader, answerId: string): Promise<AnswerDisclosure | null> {
  try {
    return await client.readAnswerDisclosure(answerId);
  } catch (failure) {
    if (!(failure instanceof ContractHttpError && failure.code === "NOT_FOUND")) {
      console.error("[STORY_REPORT_DISCLOSURE_UNREAD]", failure instanceof ContractHttpError ? failure.code : "UNKNOWN");
    }
    return null;
  }
}

export type ReportRequestInput = Readonly<{
  id: string;
  sessionCookie: string | null;
  interfaceLocale: LocaleCode;
  client: () => ReportReader;
  now: Date;
  load?: ReportCatalogLoader;
  render?: ReportRenderer;
  supported?: (locale: string) => boolean;
}>;

/**
 * What GET and HEAD share, read with the owner's session:
 *  1. the answer (by answer id, then by run id) and its run, whose
 *     `argument_language` names the question's language;
 *  2. the question's locale (`und` or unknown falls back to the interface
 *     locale); a locale the fonts cannot print yet is refused before any
 *     further read;
 *  3. the story, which must be READY or READY_WITH_RESERVATION with a body,
 *     and, for GET only (`withDisclosure`), the answer's record beside it.
 * A refusal speaks the question's locale once the run has named it, the
 * interface locale before that.
 */
async function prepareReport(input: ReportRequestInput, withDisclosure: boolean): Promise<Refusal | ReadyReport> {
  if (input.sessionCookie === null) return refuse(401, input.interfaceLocale, signInLine);

  let client: ReportReader;
  let answer: Answer;
  let questionTag: string | null;
  try {
    client = input.client();
    answer = await readAnswerByIdOrRun(client, input.id);
    questionTag = (await client.readRun(answer.run_ref)).argument_language?.tag ?? null;
  } catch (failure) {
    return upstreamRefusal(failure, input.interfaceLocale);
  }

  const locale = questionLocale(questionTag, input.interfaceLocale);
  if (!(input.supported ?? reportSupportedForLocale)(locale)) return refuse(404, locale, unsupportedLine);

  let story: AnswerStory;
  let disclosure: AnswerDisclosure | null;
  try {
    [story, disclosure] = await Promise.all([
      client.readAnswerStory(answer.answer_id),
      withDisclosure ? readReportDisclosure(client, answer.answer_id) : Promise.resolve(null)
    ]);
  } catch (failure) {
    return upstreamRefusal(failure, locale);
  }
  if (story.story === null || (story.status !== "READY" && story.status !== "READY_WITH_RESERVATION")) {
    return refuse(404, locale, notAvailableLine);
  }
  return { kind: "ready", answer, story, disclosure, questionTag, locale };
}

/**
 * GET: the report, rendered in memory in the question's locale and streamed as
 * an attachment. Nothing is stored; a refusal is one plain catalogue line.
 */
export async function handleReportRequest(input: ReportRequestInput): Promise<Response> {
  const load = input.load ?? loadNamespace;
  const prepared = await prepareReport(input, true);
  if (prepared.kind === "refused") {
    return textResponse(prepared.status, prepared.line(await refusalCatalog(load, prepared.locale)));
  }

  let catalogs: ReportCatalogs;
  try {
    catalogs = await loadReportCatalogs({ questionTag: prepared.questionTag, interfaceLocale: input.interfaceLocale, load });
  } catch {
    console.error("[STORY_REPORT_CATALOGS_FAILED]");
    return textResponse(500, tryAgainLine(await refusalCatalog(load, prepared.locale)));
  }

  let pdf: Buffer;
  try {
    pdf = await (input.render ?? renderReportPdf)({
      answer: prepared.answer,
      story: prepared.story,
      disclosure: prepared.disclosure,
      generatedAt: input.now,
      catalogs
    });
  } catch {
    console.error("[STORY_REPORT_RENDER_FAILED]");
    return textResponse(500, tryAgainLine(catalogs.publicCatalog));
  }
  return new Response(new Uint8Array(pdf), { status: 200, headers: pdfHeaders(prepared.answer.question_line, input.now) });
}

/**
 * HEAD: the same session check and the same three reads as GET, answered with
 * GET's status and headers and no body. The PDF is never made (Next would
 * otherwise answer HEAD by running GET and dropping the bytes), so a render
 * failure, which only making it can reveal, is GET's alone. The answer's record
 * is only for the PDF's About, so HEAD never reads it.
 */
export async function handleReportHeadRequest(input: ReportRequestInput): Promise<Response> {
  const prepared = await prepareReport(input, false);
  if (prepared.kind === "refused") return new Response(null, { status: prepared.status, headers: textHeaders() });
  return new Response(null, { status: 200, headers: pdfHeaders(prepared.answer.question_line, input.now) });
}
