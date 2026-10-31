import type { InvestigationReportVersion } from "@debateai/contract";
import { formatDate, t } from "../i18n/translate.js";
import type { LocaleCode } from "../i18n/locales.js";
import type { ReportCatalogs } from "./reportLanguage.js";

/**
 * What the report's PDF prints (plan 2026-10-31 decision 17): the current version of the final report over an investigation, in
 * the question's language. Earlier versions stay readable on the report page. It is made by code from the stored version
 * alone, so a finished report stays as written whatever is erased later (decision 16). Its parts, plain: the question, what
 * the debate points to, what would change it, the paths, how the investigation went, what is still open, the sources with their
 * addresses. Only words: the version holds no score, no round count and no engine number, and this model reads nothing else.
 * Pure data, so it is tested without drawing a PDF; InvestigationReportDocument turns it into pages.
 */
export type FinishedInvestigationReport = Extract<InvestigationReportVersion, { state: "READY" | "READY_WITH_RESERVATION" }>;

export type InvestigationReportPdfSource = Readonly<{ site: string; title: string | null; note: string | null; quote: string; link: string | null }>;
export type InvestigationReportPdfPath = Readonly<{ level: number; fateWords: string | null; line: string; summary: string | null }>;

export type InvestigationReportPdfModel = Readonly<{
  language: LocaleCode;
  documentTitle: string;
  /** The English disclosure in the file's metadata, whatever language the pages are in (as the debate's report). */
  metadataSubject: string;
  footer: Readonly<{ text: string; pageWords: string }>;
  notAdvice: string;
  eyebrow: string;
  question: string;
  versionLine: string;
  disclosure: string;
  shortened: string | null;
  pointsTo: Readonly<{ title: string; lead: string | null; paragraphs: readonly string[]; reservation: string | null }>;
  wouldChange: Readonly<{ title: string; text: string }> | null;
  paths: Readonly<{ title: string; intro: string; items: readonly InvestigationReportPdfPath[] }> | null;
  howItWent: Readonly<{ title: string; paragraphs: readonly string[] }> | null;
  stillOpen: Readonly<{ title: string; items: readonly string[] }> | null;
  sources: Readonly<{ title: string; items: readonly InvestigationReportPdfSource[] }> | null;
}>;

const FATE_KEYS = Object.freeze({
  HELD_UP: "public.story.fate.heldUp", PARTLY_HELD: "public.story.fate.partlyHeld", FELL: "public.story.fate.fell", SET_ASIDE: "public.story.fate.setAside"
} as const);

export function buildInvestigationReportPdfModel(input: Readonly<{
  question: string;
  version: FinishedInvestigationReport;
  catalogs: ReportCatalogs;
}>): InvestigationReportPdfModel {
  const { question, version, catalogs } = input;
  const { publicCatalog, locale } = catalogs;
  const { story, answer, sources } = version;
  const paths = version.paths ?? [];
  return Object.freeze({
    language: locale,
    documentTitle: t(publicCatalog, "public.report.documentTitle", { question }),
    metadataSubject: t(catalogs.metadataCatalog, "public.report.disclosure"),
    footer: Object.freeze({ text: t(publicCatalog, "public.report.footer"), pageWords: t(publicCatalog, "public.report.pageOf") }),
    notAdvice: t(publicCatalog, "public.report.notAdvice"),
    eyebrow: t(publicCatalog, "public.report.eyebrow"),
    question,
    versionLine: t(publicCatalog, "public.report.investigation.version", { n: version.report_version,
      date: formatDate(locale, version.written_at, { dateStyle: "long" }) }),
    disclosure: t(publicCatalog, "public.report.disclosure"),
    shortened: version.shortened ? t(publicCatalog, "public.report.investigation.shortened") : null,
    pointsTo: Object.freeze({
      title: t(publicCatalog, "public.report.investigation.pointsTo"),
      lead: story?.short_answer ?? null,
      paragraphs: Object.freeze([...answer.segments]),
      reservation: version.state === "READY_WITH_RESERVATION" ? t(publicCatalog, "public.story.reservation") : null
    }),
    wouldChange: story === null ? null : Object.freeze({ title: t(publicCatalog, "public.story.changeLead"), text: story.what_would_change }),
    paths: paths.length === 0 ? null : Object.freeze({
      title: t(publicCatalog, "public.report.investigation.paths"),
      intro: t(publicCatalog, "public.report.investigation.pathsIntro"),
      items: Object.freeze(paths.map((path) => Object.freeze({ level: path.level, fateWords: path.fate === null ? null : t(publicCatalog, FATE_KEYS[path.fate]), line: path.line, summary: path.summary })))
    }),
    howItWent: story === null || story.how_it_went.length === 0 ? null
      : Object.freeze({ title: t(publicCatalog, "public.report.investigation.howItWent"), paragraphs: Object.freeze(story.how_it_went.map((entry) => entry.paragraph)) }),
    stillOpen: story === null || story.still_open.length === 0 ? null
      : Object.freeze({ title: t(publicCatalog, "public.report.investigation.stillOpen"), items: Object.freeze([...story.still_open]) }),
    sources: sources.length === 0 ? null : Object.freeze({
      title: t(publicCatalog, "public.report.investigation.sources"),
      items: Object.freeze(sources.map((source) => Object.freeze({ site: source.site, title: source.title, note: source.line, quote: source.quote, link: source.link ?? null })))
    })
  });
}
