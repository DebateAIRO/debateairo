import { inflateSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { ContractHttpError, InvestigationReportVersionSchema, type Answer, type InvestigationReports } from "@debateai/contract";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";
import { buildInvestigationReportPdfModel, type FinishedInvestigationReport } from "../../apps/ui/lib/report/investigationReportModel.js";
import { loadReportCatalogs, REPORT_UNPRINTABLE_LOCALES, type ReportCatalogs } from "../../apps/ui/lib/report/reportLanguage.js";
import { renderInvestigationReportPdf } from "../../apps/ui/lib/report/renderReport.js";
import {
  handleInvestigationReportHeadRequest, handleInvestigationReportRequest, type InvestigationReportReader, type InvestigationReportRequestInput
} from "../../apps/ui/lib/report/reportRoute.js";
import { ReportRenderGate } from "../../apps/ui/lib/report/reportRenderGate.js";

/*
 * R22 decision 17 — the report's PDF: a plain layout for the current version, made by code from the stored version, in the
 * question's language. What the words prove: every part prints, the sources' addresses are real links, nothing beyond what the
 * version holds. What the drawing proves, for each script the site prints: real pages, no empty box (a glyph 0 is the font's
 * .notdef), its own face embedded. Arabic stays refused, as the debate's own report is. Made-up texts only.
 */
const LINK = "https://city.example.org/ferry-ridership?year=2025";

function versionWith(text: Readonly<{ answer: string; path: string; note: string }>, over: Partial<FinishedInvestigationReport> = {}): FinishedInvestigationReport {
  return InvestigationReportVersionSchema.parse({
    report_version: 2, closed_at: "2026-10-31T10:00:00.000Z", state: "READY", written_at: "2026-10-31T10:08:00.000Z",
    answer: { segments: [text.answer] },
    story: { short_answer: text.path, what_would_change: text.note, how_it_went: [{ dig_run_id: "33333333-3333-4333-8333-333333333333", paragraph: text.note }], still_open: [text.note] },
    sources: [{ site: "city.example.org", title: "Ferry ridership", quote: text.note, line: text.path, link: LINK }],
    paths: [{ line: text.path, summary: text.note, fate: "PARTLY_HELD", level: 0 }, { line: text.note, summary: null, fate: "HELD_UP", level: 1 }],
    shortened: false, ...over
  }) as FinishedInvestigationReport;
}

const SCRIPTS = Object.freeze([
  { locale: "en", face: "PlusJakartaSans", question: "Should the city build a second pier?", answer: "The whole debate points to building it for rush hour.", path: "Partly: it helps at rush hour.", note: "Winter ridership falls by half." },
  { locale: "ro", face: "PlusJakartaSans", question: "Ar trebui să construim un debarcader?", answer: "Întreaga dezbatere arată spre orele de vârf; țărmul rămâne așa.", path: "Parțial: ajută la orele de vârf.", note: "Iarna călătorii scad la jumătate." },
  { locale: "ru", face: "NotoSans", question: "Нужен ли второй причал?", answer: "Все дебаты указывают на час пик.", path: "Отчасти: помогает в час пик.", note: "Зимой пассажиров вдвое меньше." },
  { locale: "el", face: "NotoSans", question: "Χρειάζεται δεύτερη προβλήτα;", answer: "Όλη η συζήτηση δείχνει τις ώρες αιχμής.", path: "Εν μέρει: βοηθά στις ώρες αιχμής.", note: "Τον χειμώνα οι επιβάτες μειώνονται." },
  { locale: "he", face: "NotoSansHebrew", question: "האם צריך מזח שני?", answer: "הדיון כולו מצביע על שעות העומס. Zoom 35%.", path: "חלקית: עוזר בשעות העומס.", note: "בחורף מספר הנוסעים יורד בחצי." },
  { locale: "hi", face: "NotoSansDevanagari", question: "क्या दूसरा घाट चाहिए?", answer: "पूरी बहस भीड़ के समय की ओर इशारा करती है।", path: "आंशिक रूप से: भीड़ के समय मदद करता है।", note: "सर्दियों में यात्री आधे रह जाते हैं।" },
  { locale: "zh", face: "NotoSansSC", question: "需要第二个码头吗?", answer: "整场辩论指向高峰时段。Zoom 35%。", path: "部分成立:高峰时段有帮助。", note: "冬季客流减少一半。" },
  { locale: "ja", face: "NotoSansJP", question: "二つ目の桟橋は必要ですか?", answer: "討論全体はラッシュ時を示しています。", path: "一部成立:ラッシュ時に役立ちます。", note: "冬の乗客数は半分に減ります。" },
  { locale: "ko", face: "NotoSansKR", question: "두 번째 부두가 필요할까요?", answer: "토론 전체는 출퇴근 시간을 가리킵니다.", path: "부분적으로: 출퇴근 시간에 도움이 됩니다.", note: "겨울 승객은 절반으로 줄어듭니다." }
] as const);

function streams(pdf: Buffer): string[] {
  const raw = pdf.toString("latin1");
  const out: string[] = [];
  const marker = /stream\r?\n/gu;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try { out.push(inflateSync(pdf.subarray(start, end)).toString("latin1").toLowerCase()); } catch { /* not a deflate stream */ }
  }
  return out;
}
function drawnGlyphs(pdf: Buffer): string[] {
  return streams(pdf).flatMap((stream) => Array.from(stream.matchAll(/\[([^\]]*)\]\s*tj/gu)).flatMap((array) =>
    Array.from(array[1]!.matchAll(/<([0-9a-f]*)>/gu)).flatMap((hex) => hex[1]!.match(/.{4}/gu) ?? [])));
}
const embedded = (pdf: Buffer): string[] => [...new Set(Array.from(pdf.toString("latin1").matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([A-Za-z0-9-]+)/gu), (match) => match[1]!))];

const catalogsOf = (locale: string): Promise<ReportCatalogs> => loadReportCatalogs({ questionTag: locale, interfaceLocale: "en", load: loadNamespace });

describe("the report's PDF, in every script the report prints", () => {
  it.each(SCRIPTS)("$locale: real pages in its own face, no empty box, the source's address a real link", async ({ locale, face, question, answer, path, note }) => {
    const pdf = await renderInvestigationReportPdf({ question, version: versionWith({ answer, path, note }), catalogs: await catalogsOf(locale) });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(embedded(pdf).some((name) => name.startsWith(face))).toBe(true);
    const glyphs = drawnGlyphs(pdf);
    expect(glyphs.length).toBeGreaterThan(100);
    expect(glyphs.filter((glyph) => glyph === "0000")).toEqual([]);
    const raw = pdf.toString("latin1");
    expect(raw).toContain(`/URI (${LINK})`);
    expect(raw.match(/\/URI \(/gu)).toHaveLength(1);
  }, 120_000);

  it("Arabic stays refused rather than printed with its dots in the wrong place", async () => {
    expect(REPORT_UNPRINTABLE_LOCALES).toEqual(["ar"]);
    const catalogs = { locale: "ar", publicCatalog: {}, composeCatalog: {}, metadataCatalog: {} } as unknown as ReportCatalogs;
    await expect(renderInvestigationReportPdf({ question: "هل نحتاج إلى رصيف ثانٍ؟", version: versionWith(SCRIPTS[0]), catalogs }))
      .rejects.toThrow("REPORT_LOCALE_UNSUPPORTED");
  });
});

describe("what the report's PDF prints", () => {
  let english: ReportCatalogs;
  beforeAll(async () => { english = await catalogsOf("en"); });
  const words = { answer: "The whole debate points to rush hour.", path: "Partly: it helps at rush hour.", note: "Winter ridership falls." };

  it("the question, what the debate points to, the paths by level, the parts of the story, the sources", () => {
    const model = buildInvestigationReportPdfModel({ question: "Should the city build a pier?", version: versionWith(words), catalogs: english });
    expect(model).toMatchObject({
      question: "Should the city build a pier?", versionLine: "Version 2 · October 31, 2026", shortened: null,
      pointsTo: { title: "What the debate points to", lead: words.path, paragraphs: [words.answer], reservation: null },
      wouldChange: { title: "What would change the answer", text: words.note },
      paths: { title: "The paths", items: [{ level: 0, fateWords: "Partly held", line: words.path, summary: words.note }, { level: 1, fateWords: "Held up", line: words.note, summary: null }] },
      howItWent: { title: "How the investigation went", paragraphs: [words.note] },
      stillOpen: { title: "What is still open", items: [words.note] },
      sources: { title: "Sources", items: [{ site: "city.example.org", title: "Ferry ridership", note: words.path, quote: words.note, link: LINK }] }
    });
  });

  it("says when a version kept a reservation or was shortened; a version from before R22 has no paths and no addresses, and still prints", async () => {
    const reserved = buildInvestigationReportPdfModel({ question: "Q?", catalogs: english,
      version: versionWith(words, { state: "READY_WITH_RESERVATION", shortened: true }) });
    expect(reserved.pointsTo.reservation).toBe("Parts of this summary could not be fully double-checked.");
    expect(reserved.shortened).toBe("The investigation was very large, so the report was written from a shortened version of it.");

    const { paths: _paths, ...older } = versionWith(words);
    const before = { ...older, story: null, sources: [{ site: "city.example.org", title: null, quote: words.note, line: null }] } as FinishedInvestigationReport;
    const model = buildInvestigationReportPdfModel({ question: "Q?", version: before, catalogs: english });
    expect(model.paths).toBeNull();
    expect(model.wouldChange).toBeNull();
    expect(model.pointsTo.lead).toBeNull();
    expect(model.sources!.items[0]!.link).toBeNull();
    const pdf = await renderInvestigationReportPdf({ question: "Q?", version: before, catalogs: english });
    expect(pdf.toString("latin1")).not.toContain("/URI (");
  }, 120_000);

  it("holds nothing the version does not: no score, no number but its version and date", () => {
    const model = buildInvestigationReportPdfModel({ question: "Q?", version: versionWith(words), catalogs: english });
    const strings: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === "string") strings.push(value);
      else if (typeof value === "object" && value !== null) Object.values(value).forEach(visit);
    };
    visit({ ...model, versionLine: null, footer: null, metadataSubject: null, sources: { ...model.sources, items: model.sources!.items.map((source) => ({ ...source, link: null })) } });
    const printed = strings.join("\n");
    expect(printed).toContain(words.answer);
    expect(printed).not.toMatch(/[0-9%]/u);
    expect(printed).not.toMatch(/score|ladder|round|lineage|judge/iu);
  });
});

describe("GET and HEAD /v4/debate/{id}/report/pdf", () => {
  const ROOT = "11111111-1111-4111-8111-111111111111";
  const DIG = "33333333-3333-4333-8333-333333333333";
  const session = "a".repeat(43);
  const answerOf = (runId: string, line: string) => ({ answer_id: `${runId}`, run_ref: runId, question_line: line }) as unknown as Answer;
  const reports = (over: Partial<InvestigationReports> = {}): InvestigationReports => ({
    investigation_id: "22222222-2222-4222-8222-222222222222", root_run_id: ROOT, state: "CLOSED", digs: 0,
    versions: [versionWith({ answer: "Old answer.", path: "Old path.", note: "Old." }, { report_version: 1 }),
      versionWith({ answer: "Newest answer.", path: "New path.", note: "New." })], current: 2, ...over });
  const reader = (over: Partial<InvestigationReportReader> = {}, tag = "en"): InvestigationReportReader => ({
    readAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "NOT_FOUND"); },
    readRunAnswer: async (id: string) => answerOf(id, id === ROOT ? "Should the city build a pier?\n\nAdded line." : "A dig's own question"),
    readRun: async () => ({ argument_language: { tag } }) as never,
    readInvestigation: async () => reports(),
    ...over
  });
  const load = (locale: string, namespace: "public" | "compose") => loadNamespace(locale as never, namespace);
  const input = (over: Partial<InvestigationReportRequestInput> = {}): InvestigationReportRequestInput => ({
    id: ROOT, sessionCookie: session, interfaceLocale: "en", client: () => reader(), now: new Date("2026-10-31T12:00:00.000Z"),
    load, gate: new ReportRenderGate({ concurrent: 2, waiting: 2, waitMs: 1000, retryAfterSeconds: 5 }), ...over });

  it("sends the CURRENT version, the first debate's own words as the question, as an attachment", async () => {
    let rendered: { question: string; version: FinishedInvestigationReport } | null = null;
    const response = await handleInvestigationReportRequest(input({ id: DIG, render: async (made) => { rendered = made; return Buffer.from("%PDF-"); } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("debate-should-the-city-build-a-pier-2026-10-31.pdf");
    expect(rendered!.question).toBe("Should the city build a pier?");
    expect(rendered!.version.report_version).toBe(2);
    expect(rendered!.version.answer.segments).toEqual(["Newest answer."]);
  });

  it("refuses without a session (401), with no finished version (404), and for another account's debate (404), in plain words", async () => {
    const noSession = await handleInvestigationReportRequest(input({ sessionCookie: null }));
    expect([noSession.status, await noSession.text()]).toEqual([401, "Sign in to download this report."]);
    const none = await handleInvestigationReportRequest(input({ client: () => reader({ readInvestigation: async () => reports({ versions: [], current: null, state: "OPEN" }) }) }));
    expect([none.status, await none.text()]).toEqual([404, "This report isn't available."]);
    const other = await handleInvestigationReportRequest(input({ client: () => reader({ readRunAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "NOT_FOUND"); } }) }));
    expect(other.status).toBe(404);
  });

  it("a question in Arabic: 404 with the plain line, nothing made; HEAD says the same, so the page offers Print instead", async () => {
    let made = false;
    const arabic = input({ client: () => reader({}, "ar"), render: async () => { made = true; return Buffer.from(""); } });
    const refused = await handleInvestigationReportRequest(arabic);
    expect(refused.status).toBe(404);
    expect(await refused.text()).not.toBe("");
    expect(made).toBe(false);
    expect((await handleInvestigationReportHeadRequest(arabic)).status).toBe(404);
  });

  it("HEAD answers GET's status and headers and never makes the PDF", async () => {
    let made = false;
    const head = await handleInvestigationReportHeadRequest(input({ render: async () => { made = true; return Buffer.from(""); } }));
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("application/pdf");
    expect(made).toBe(false);
  });
});
