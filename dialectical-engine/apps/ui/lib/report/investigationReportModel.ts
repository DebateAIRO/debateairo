import type { InvestigationReportVersion } from "@debateai/contract";
import { formatDate, formatNumber, t } from "../i18n/translate.js";
import type { LocaleCode } from "../i18n/locales.js";
import { apartFromQuestion } from "../v4/reportPaths.js";
import { pathTrustWord } from "./pathTrust.js";
import type { ReportCatalogs } from "./reportLanguage.js";

/**
 * What the report's PDF prints (plan 2026-10-31 decision 17): the current version of the final report over an investigation, in
 * the question's language. Earlier versions stay readable on the report page. It is made by code from the stored version
 * alone, so a finished report stays as written whatever is erased later (decision 16). Its parts, plain: the question, what
 * the debate points to, what would change it, the paths, how the investigation went, what is still open, the sources with their
 * addresses. Decision 27: "much larger, with as much useful information as possible": each path at every level with its points and
 * their trust words and the sources they cite, what each dig was about, what it changed, and the person's own views, all of it what
 * the AIs already wrote, with no extra AI call. Only words: the version holds no score, no round count and no engine number, and this
 * model reads nothing else. The numbers beside a point are its sources' places in the list at the end.
 * Round 2 (owner, 3 Nov 2026): r2-20, each path prints ONE trust word worked out from its points (lib/report/pathTrust.ts),
 * never an outcome tag ("Held up", "Partly held", "Set aside", "Fell"); r2-13, a Free debate prints "Not checked on the web.",
 * the honest half of the screen's line.
 * V4 start step, Task 55f: the digs on the main question print after every path, under a row that is the question itself, so they sit
 * one step in as every follow-up debate does, never under the last path (lib/v4/reportPaths.ts apartFromQuestion, the page's split).
 * A version written before the mark prints as it always did.
 * Pure data, so it is tested without drawing a PDF; InvestigationReportDocument turns it into pages.
 */
export type FinishedInvestigationReport = Extract<InvestigationReportVersion, { state: "READY" | "READY_WITH_RESERVATION" }>;

export type InvestigationReportPdfSource = Readonly<{ number: string; site: string; title: string | null; note: string | null; quote: string; link: string | null }>;
export type InvestigationReportPdfPoint = Readonly<{ trustWords: string | null; sideWords: string | null; text: string; marks: string | null }>;
/** What a dig's first path opens with: what was dug, the person's own view and what became of it, what the dig changed. */
export type InvestigationReportPdfDig = Readonly<{
  title: string;
  picks: readonly string[];
  ownView: Readonly<{ title: string; words: readonly string[]; verdict: string | null }> | null;
  changed: Readonly<{ title: string; items: readonly string[] }> | null;
}>;
export type InvestigationReportPdfPath = Readonly<{
  /** r2-20: the path's one trust word (null: no point of it was checked). */
  level: number; trustWords: string | null; line: string; summary: string | null;
  points: readonly InvestigationReportPdfPoint[];
  dig: InvestigationReportPdfDig | null;
}>;

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
  /** r2-13: on Free, "Not checked on the web."; null on a paid plan. */
  webNote: string | null;
  shortened: string | null;
  pointsTo: Readonly<{ title: string; lead: string | null; paragraphs: readonly string[]; reservation: string | null }>;
  wouldChange: Readonly<{ title: string; text: string }> | null;
  paths: Readonly<{ title: string; intro: string; items: readonly InvestigationReportPdfPath[] }> | null;
  howItWent: Readonly<{ title: string; paragraphs: readonly string[] }> | null;
  stillOpen: Readonly<{ title: string; items: readonly string[] }> | null;
  sources: Readonly<{ title: string; items: readonly InvestigationReportPdfSource[] }> | null;
}>;

const TRUST_KEYS = Object.freeze({
  SURE: "public.report.trust.SURE", SURE_FOR_CASE: "public.report.trust.SURE_FOR_CASE", STILL_ARGUED: "public.report.trust.STILL_ARGUED", DIDNT_HOLD: "public.report.trust.DIDNT_HOLD"
} as const);
const VIEW_KEYS = Object.freeze({
  HELPED: "public.report.investigation.viewHelped", DID_NOT_HELP: "public.report.investigation.viewDidNotHelp", NOT_SETTLED: "public.report.investigation.viewNotSettled"
} as const);

type StoredPath = NonNullable<FinishedInvestigationReport["paths"]>[number];

function pdfDigOf(dig: NonNullable<StoredPath["dig"]>, catalogs: ReportCatalogs): InvestigationReportPdfDig {
  const { publicCatalog } = catalogs;
  const verdict = dig.view === null ? null : `${t(publicCatalog, VIEW_KEYS[dig.view.outcome])} ${dig.view.reason}`;
  return Object.freeze({
    title: t(publicCatalog, "public.report.investigation.followUp"),
    picks: Object.freeze([...dig.picks]),
    ownView: dig.own_words.length === 0 ? null
      : Object.freeze({ title: t(publicCatalog, "public.report.investigation.ownView"), words: Object.freeze([...dig.own_words]), verdict }),
    changed: dig.changed.length === 0 ? null
      : Object.freeze({ title: t(publicCatalog, "public.report.investigation.changed"), items: Object.freeze([...dig.changed]) })
  });
}

function pdfPathOf(path: StoredPath, catalogs: ReportCatalogs): InvestigationReportPdfPath {
  const { publicCatalog, locale } = catalogs;
  const word = pathTrustWord(path.fate, (path.points ?? []).map((point) => point.trust));
  return Object.freeze({
    level: path.level,
    trustWords: word === null ? null : t(publicCatalog, TRUST_KEYS[word]),
    line: path.line,
    summary: path.summary,
    points: Object.freeze((path.points ?? []).map((point) => Object.freeze({
      trustWords: point.trust === null ? null : t(publicCatalog, TRUST_KEYS[point.trust]),
      sideWords: point.side === null ? null : t(publicCatalog, point.side === "for" ? "public.report.investigation.sideFor" : "public.report.investigation.sideAgainst"),
      text: point.text,
      marks: point.sources.length === 0 ? null : `[${point.sources.map((at) => formatNumber(locale, at + 1)).join(", ")}]`
    }))),
    dig: path.dig === undefined ? null : pdfDigOf(path.dig, catalogs)
  });
}

export function buildInvestigationReportPdfModel(input: Readonly<{
  question: string;
  version: FinishedInvestigationReport;
  catalogs: ReportCatalogs;
  /** r2-13: the debate ran on the Free plan, which never looks anything up on the web. */
  free?: boolean;
}>): InvestigationReportPdfModel {
  const { question, version, catalogs } = input;
  const { publicCatalog, locale } = catalogs;
  const { story, answer, sources } = version;
  const paths = version.paths ?? [];
  const { tree, question: onQuestion } = apartFromQuestion(paths);
  const questionRow: InvestigationReportPdfPath = Object.freeze({ level: 0, trustWords: null, line: question, summary: null, points: Object.freeze([]), dig: null });
  const items = [...tree.map((path) => pdfPathOf(path, catalogs)),
    ...(onQuestion.length === 0 ? [] : [questionRow, ...onQuestion.map((path) => pdfPathOf(path, catalogs))])];
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
    webNote: input.free === true ? t(publicCatalog, "public.report.investigation.notOnWeb") : null,
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
      items: Object.freeze(items)
    }),
    howItWent: story === null || story.how_it_went.length === 0 ? null
      : Object.freeze({ title: t(publicCatalog, "public.report.investigation.howItWent"), paragraphs: Object.freeze(story.how_it_went.map((entry) => entry.paragraph)) }),
    stillOpen: story === null || story.still_open.length === 0 ? null
      : Object.freeze({ title: t(publicCatalog, "public.report.investigation.stillOpen"), items: Object.freeze([...story.still_open]) }),
    sources: sources.length === 0 ? null : Object.freeze({
      title: t(publicCatalog, "public.report.investigation.sources"),
      items: Object.freeze(sources.map((source, at) => Object.freeze({ number: formatNumber(locale, at + 1), site: source.site, title: source.title, note: source.line, quote: source.quote, link: source.link ?? null })))
    })
  });
}
