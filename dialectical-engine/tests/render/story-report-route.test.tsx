import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, type Answer, type AnswerStory, type RunProjection } from "@debateai/contract";
import { GET, HEAD } from "../../apps/ui/app/debate/[id]/report/route.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { reportSupportedForLocale, type ReportCatalogLoader } from "../../apps/ui/lib/report/reportLanguage.js";
import {
  handleReportHeadRequest,
  handleReportRequest,
  interfaceLocaleFromCookieHeader,
  reportContentDisposition,
  reportFilename,
  reportSlug,
  reportUnicodeSlug,
  sessionFromCookieHeader,
  type ReportReader,
  type ReportRenderer
} from "../../apps/ui/lib/report/reportRoute.js";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_DEBATE_ID,
  STORY_FIXTURE_LANGUAGE,
  STORY_FIXTURE_QUESTION,
  storyFixture
} from "../../apps/ui/lib/v3/storyFixture.js";

/**
 * GET /debate/{id}/report (spec 2026-09-26 §10, Task 15): the owner's full
 * report as a PDF attachment, in the QUESTION's language, and every refusal a
 * short plain line from the catalogue.
 */

const SESSION = "s".repeat(43);
const NOW = new Date("2026-09-26T12:00:00.000Z");
const FAKE_PDF = Buffer.from("%PDF-1.3 fake");
const JAPANESE_QUESTION = "日本に引っ越すべきですか？";

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const publicWords = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, "public.json"), "utf8")) as Record<string, string>;
const words = (locale: string, key: string): string => {
  const value = publicWords(locale)[key];
  if (value === undefined) throw new Error(`catalogue ${locale}/public has no ${key}`);
  return value;
};

/** The run as the API serves it, with the question's language tag (or none). */
function runWithTag(tag: string | null): RunProjection {
  return {
    run_ref: STORY_FIXTURE_ANSWER.run_ref,
    question_line: STORY_FIXTURE_ANSWER.question_line,
    state: "SETTLED",
    terminal_reason: null,
    hold_until: null,
    argument_language: tag === null ? null : { tag, name: tag === STORY_FIXTURE_LANGUAGE.tag ? STORY_FIXTURE_LANGUAGE.name : "Other" }
  };
}

function reader(overrides: Partial<ReportReader> = {}): ReportReader {
  return {
    readAnswer: async () => STORY_FIXTURE_ANSWER,
    readRunAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_SERVED"); },
    readRun: async () => runWithTag(STORY_FIXTURE_LANGUAGE.tag),
    readAnswerStory: async () => storyFixture("READY"),
    // An answer with no record (Task M6): the report's About then says nothing it holds.
    readAnswerDisclosure: async () => { throw new ContractHttpError("NOT_FOUND", 404, "DISCLOSURE_NOT_FOUND"); },
    ...overrides
  };
}

type HandleOptions = Partial<Pick<Parameters<typeof handleReportRequest>[0], "interfaceLocale" | "render" | "supported" | "load">> & {
  sessionCookie?: string | null;
};

async function handle(client: ReportReader, options: HandleOptions = {}): Promise<Response> {
  return handleReportRequest({
    id: STORY_FIXTURE_DEBATE_ID,
    sessionCookie: options.sessionCookie === undefined ? SESSION : options.sessionCookie,
    interfaceLocale: options.interfaceLocale ?? "en",
    client: () => client,
    now: NOW,
    render: options.render ?? (async () => FAKE_PDF),
    ...(options.supported === undefined ? {} : { supported: options.supported }),
    ...(options.load === undefined ? {} : { load: options.load })
  });
}

function textHeaders(response: Response): void {
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(response.headers.get("cache-control")).toBe("no-store");
}

afterEach(() => {
  delete process.env.DIALECTICAL_API_BASE;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PDF download route helpers (spec §10)", () => {
  it("reads exactly one well-formed session cookie from the header", () => {
    expect(sessionFromCookieHeader(null)).toBeNull();
    expect(sessionFromCookieHeader(`__Host-debateai-session=${SESSION}; __Host-debateai-csrf=${"c".repeat(43)}`)).toBe(SESSION);
    expect(sessionFromCookieHeader(`__Host-debateai-session=${SESSION}; __Host-debateai-session=${SESSION}`)).toBeNull();
    expect(sessionFromCookieHeader("__Host-debateai-session=short")).toBeNull();
    expect(sessionFromCookieHeader(`__Host-debateai-session=${SESSION}\r\nx: y`)).toBeNull();
  });

  it("reads the interface locale from the locale cookie, the way Next's cookie store does, and defaults to English", () => {
    expect(interfaceLocaleFromCookieHeader(null)).toBe("en");
    expect(interfaceLocaleFromCookieHeader("debateai.locale=de")).toBe("de");
    expect(interfaceLocaleFromCookieHeader(`__Host-debateai-session=${SESSION}; debateai.locale=ro`)).toBe("ro");
    expect(interfaceLocaleFromCookieHeader("debateai.locale=xx")).toBe("en");
    expect(interfaceLocaleFromCookieHeader("debateai.locale=")).toBe("en");
    expect(interfaceLocaleFromCookieHeader("other=fr")).toBe("en");
    // Next's cookie store keeps the last of two same-named cookies; the debate page reads it there.
    expect(interfaceLocaleFromCookieHeader("debateai.locale=fr; debateai.locale=it")).toBe("it");
  });

  it("names the file with an ASCII fallback slug of the question and the date", () => {
    expect(reportSlug(STORY_FIXTURE_QUESTION)).toBe("ar-trebui-sa-ne-mutam-cu-familia-din-bucuresti-la-cluj");
    expect(reportSlug("???")).toBe("report");
    expect(reportSlug("")).toBe("report");
    expect(reportSlug("x".repeat(80))).toBe("x".repeat(60));
    expect(reportFilename(STORY_FIXTURE_QUESTION, NOW))
      .toBe("debate-ar-trebui-sa-ne-mutam-cu-familia-din-bucuresti-la-cluj-2026-09-26.pdf");
  });

  it("keeps a Romanian question's own letters in the real slug", () => {
    expect(reportUnicodeSlug(STORY_FIXTURE_QUESTION)).toBe("ar-trebui-să-ne-mutăm-cu-familia-din-bucurești-la-cluj");
  });

  it("gives a Japanese question the ASCII fallback 'report' and keeps its own letters in the real slug", () => {
    expect(reportSlug(JAPANESE_QUESTION)).toBe("report");
    expect(reportUnicodeSlug(JAPANESE_QUESTION)).toBe("日本に引っ越すべきですか");
    // No spaces to break at: a long question is cut at 60 characters, never mid-character.
    expect(reportUnicodeSlug("あ".repeat(80))).toBe("あ".repeat(60));
  });

  it("keeps the real slug short enough for any file system, and never splits a character", () => {
    const hindi = "क्या ".repeat(40);
    const slug = reportUnicodeSlug(hindi);
    expect(Buffer.byteLength(slug, "utf8")).toBeLessThanOrEqual(180);
    expect(slug.length).toBeGreaterThan(0);
    expect(slug.endsWith("-")).toBe(false);
    expect(hindi.replaceAll(" ", "-").startsWith(slug)).toBe(true);
    // A broken UTF-16 pair in a question is dropped, so the filename can always be encoded.
    expect(reportUnicodeSlug(`a${String.fromCharCode(0xd800)}b`)).toBe("a-b");
  });

  it("answers 'report' for an empty or punctuation-only question in both slugs", () => {
    for (const question of ["", "   ", "?!…", "«»—"]) {
      expect(reportSlug(question)).toBe("report");
      expect(reportUnicodeSlug(question)).toBe("report");
    }
  });

  it("writes the attachment header with the ASCII filename and the RFC 5987 UTF-8 filename", () => {
    expect(reportContentDisposition(STORY_FIXTURE_QUESTION, NOW)).toBe(
      'attachment; filename="debate-ar-trebui-sa-ne-mutam-cu-familia-din-bucuresti-la-cluj-2026-09-26.pdf"; ' +
      "filename*=UTF-8''debate-ar-trebui-s%C4%83-ne-mut%C4%83m-cu-familia-din-bucure%C8%99ti-la-cluj-2026-09-26.pdf"
    );
    expect(reportContentDisposition("?!", NOW)).toBe(
      "attachment; filename=\"debate-report-2026-09-26.pdf\"; filename*=UTF-8''debate-report-2026-09-26.pdf"
    );
    const japanese = reportContentDisposition(JAPANESE_QUESTION, NOW);
    expect(japanese.startsWith('attachment; filename="debate-report-2026-09-26.pdf"; filename*=UTF-8\'\'')).toBe(true);
    const encoded = japanese.slice(japanese.indexOf("UTF-8''") + "UTF-8''".length);
    // RFC 5987 attr-chars only: letters, digits, "-", "." and the percent escapes.
    expect(encoded).toMatch(/^[A-Za-z0-9.%-]+$/u);
    expect(decodeURIComponent(encoded)).toBe("debate-日本に引っ越すべきですか-2026-09-26.pdf");
  });
});

describe("handleReportRequest", () => {
  it("answers 401 without a session, in the interface's language, and never builds a client", async () => {
    const client = vi.fn(() => reader());
    const response = await handleReportRequest({
      id: STORY_FIXTURE_DEBATE_ID, sessionCookie: null, interfaceLocale: "de", client, now: NOW
    });
    expect(response.status).toBe(401);
    textHeaders(response);
    expect(await response.text()).toBe(words("de", "public.report.error.signIn"));
    expect(client).not.toHaveBeenCalled();
  });

  it("answers 401 when the API no longer accepts the session", async () => {
    const response = await handle(reader({
      readAnswer: async () => { throw new ContractHttpError("SESSION_REQUIRED", 401, "SESSION_REQUIRED"); }
    }));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe(words("en", "public.report.error.signIn"));
  });

  it("answers 404 in the question's language while the story is still being written", async () => {
    const response = await handle(reader({ readAnswerStory: async () => storyFixture("WRITING") }));
    expect(response.status).toBe(404);
    textHeaders(response);
    expect(await response.text()).toBe(words("ro", "public.report.error.notAvailable"));
  });

  it("answers 404 when the story is unavailable", async () => {
    const response = await handle(reader({ readAnswerStory: async () => storyFixture("UNAVAILABLE") }));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(words("ro", "public.report.error.notAvailable"));
  });

  it("answers 404 for a ready status that carries no story body", async () => {
    const story = storyFixture("READY");
    story.story = null;
    expect((await handle(reader({ readAnswerStory: async () => story }))).status).toBe(404);
  });

  it("answers 404 in the interface's language for a debate that is not the caller's", async () => {
    const notFound = async (): Promise<Answer> => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND"); };
    const response = await handle(reader({ readAnswer: notFound, readRunAnswer: notFound }), { interfaceLocale: "fr" });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(words("fr", "public.report.error.notAvailable"));
  });

  it("resolves a run id the way the debate page does, and reads the question's language from its run", async () => {
    const readRunAnswer = vi.fn(async (): Promise<Answer> => STORY_FIXTURE_ANSWER);
    const readRun = vi.fn(async () => runWithTag("ro"));
    const response = await handle(reader({
      readAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND"); },
      readRunAnswer,
      readRun
    }));
    expect(response.status).toBe(200);
    expect(readRunAnswer).toHaveBeenCalledWith(STORY_FIXTURE_DEBATE_ID);
    expect(readRun).toHaveBeenCalledWith(STORY_FIXTURE_ANSWER.run_ref);
  });

  it("answers 502 with a fixed message for any other upstream failure", async () => {
    const response = await handle(reader({
      readAnswerStory: async () => { throw new ContractHttpError("SERVER_FAILURE", 500, "secret upstream detail"); }
    }));
    expect(response.status).toBe(502);
    textHeaders(response);
    const body = await response.text();
    expect(body).toBe(words("ro", "public.report.error.tryAgain"));
    expect(body).not.toContain("secret upstream detail");
  });

  it("answers 502 in the interface's language when the run cannot be read", async () => {
    const response = await handle(reader({
      readRun: async () => { throw new Error("secret socket detail"); }
    }), { interfaceLocale: "it" });
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toBe(words("it", "public.report.error.tryAgain"));
    expect(body).not.toContain("secret socket detail");
  });

  it("logs an upstream failure as a fixed tag and its typed code, never the caught message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await handle(reader({
      readAnswerStory: async () => { throw new ContractHttpError("SERVER_FAILURE", 500, "secret upstream detail"); }
    }));
    await handle(reader({ readRun: async () => { throw new Error("secret socket detail"); } }));
    expect(log.mock.calls).toEqual([
      ["[STORY_REPORT_UPSTREAM_FAILED]", "SERVER_FAILURE"],
      ["[STORY_REPORT_UPSTREAM_FAILED]", "UNKNOWN"]
    ]);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("secret upstream detail");
    expect(logged).not.toContain("secret socket detail");
  });

  it("logs nothing for a refusal that is not a failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const notFound = async (): Promise<Answer> => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND"); };
    await handle(reader({ readAnswer: notFound, readRunAnswer: notFound }));
    await handle(reader({ readAnswerStory: async () => { throw new ContractHttpError("SESSION_REQUIRED", 401, "SESSION_REQUIRED"); } }));
    await handle(reader({ readAnswerStory: async () => storyFixture("WRITING") }));
    expect(log).not.toHaveBeenCalled();
  });

  it("streams a ready story as a PDF attachment", async () => {
    const story: AnswerStory = storyFixture("READY_WITH_RESERVATION");
    const readAnswerStory = vi.fn(async () => story);
    const response = await handle(reader({ readAnswerStory }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(reportContentDisposition(STORY_FIXTURE_QUESTION, NOW));
    expect(response.headers.get("content-disposition")).toContain(
      'attachment; filename="debate-ar-trebui-sa-ne-mutam-cu-familia-din-bucuresti-la-cluj-2026-09-26.pdf"'
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(readAnswerStory).toHaveBeenCalledWith(STORY_FIXTURE_ANSWER.answer_id);
  });

  it("prints a Romanian question's report with the Romanian catalogues under an English interface", async () => {
    const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
    const story = storyFixture("READY");
    const response = await handle(reader({ readAnswerStory: async () => story }), { interfaceLocale: "en", render });
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledTimes(1);
    const input = render.mock.calls[0]![0];
    expect(input.answer).toBe(STORY_FIXTURE_ANSWER);
    expect(input.story).toBe(story);
    expect(input.generatedAt).toBe(NOW);
    expect(input.catalogs.locale).toBe("ro");
    expect(input.catalogs.publicCatalog["public.report.title.story"]).toBe(words("ro", "public.report.title.story"));
    expect(input.catalogs.composeCatalog).toBeDefined();
    // The PDF metadata's disclosure stays English (controller ruling, R2).
    expect(input.catalogs.metadataCatalog["public.report.disclosure"]).toBe(words("en", "public.report.disclosure"));
  });

  it("falls back to the interface locale for an 'und' question, and for a run with no language recorded", async () => {
    for (const tag of ["und", null, "tlh"]) {
      const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
      const response = await handle(reader({ readRun: async () => runWithTag(tag) }), { interfaceLocale: "fr", render });
      expect(response.status, String(tag)).toBe(200);
      expect(render.mock.calls[0]![0].catalogs.locale, String(tag)).toBe("fr");
    }
  });

  it("answers 404 with 'not available in this language yet', in that language, when the fonts cannot print it", async () => {
    const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
    const response = await handle(reader({ readRun: async () => runWithTag("ja") }), {
      interfaceLocale: "en",
      render,
      supported: (locale) => locale !== "ja"
    });
    expect(response.status).toBe(404);
    textHeaders(response);
    expect(await response.text()).toBe(words("ja", "public.story.reportUnsupported"));
    expect(render).not.toHaveBeenCalled();
  });

  it("refuses by default exactly the languages the report cannot print yet", async () => {
    // No list is pinned here: the route must agree with reportSupportedForLocale, whatever it holds.
    for (const { code } of LOCALES) {
      const response = await handle(reader({ readRun: async () => runWithTag(code) }));
      if (reportSupportedForLocale(code)) {
        expect(response.status, code).toBe(200);
      } else {
        expect(response.status, code).toBe(404);
        expect(await response.text(), code).toBe(words(code, "public.story.reportUnsupported"));
      }
    }
  });

  it("answers 500 with a fixed message when rendering fails", async () => {
    const response = await handle(reader(), { render: async () => { throw new Error("font exploded"); } });
    expect(response.status).toBe(500);
    textHeaders(response);
    const body = await response.text();
    expect(body).toBe(words("ro", "public.report.error.tryAgain"));
    expect(body).not.toContain("font exploded");
  });

  it("answers 500 in English when no catalogue can be loaded, and never the caught text", async () => {
    const load: ReportCatalogLoader = async () => { throw new Error("catalogue exploded"); };
    const response = await handle(reader(), { load });
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toBe(words("en", "public.report.error.tryAgain"));
    expect(body).not.toContain("catalogue exploded");
  });
});

describe("HEAD: the same answer as GET, without making the PDF (review polish)", () => {
  async function both(client: ReportReader, options: HandleOptions = {}): Promise<{ get: Response; head: Response; render: ReturnType<typeof vi.fn<ReportRenderer>> }> {
    const get = await handle(client, options);
    const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
    const head = await handleReportHeadRequest({
      id: STORY_FIXTURE_DEBATE_ID,
      sessionCookie: options.sessionCookie === undefined ? SESSION : options.sessionCookie,
      interfaceLocale: options.interfaceLocale ?? "en",
      client: () => client,
      now: NOW,
      render,
      ...(options.supported === undefined ? {} : { supported: options.supported })
    });
    return { get, head, render };
  }

  it("answers a ready story with GET's status and headers, no body, and never calls the renderer", async () => {
    const { get, head, render } = await both(reader({ readAnswerStory: async () => storyFixture("READY_WITH_RESERVATION") }));
    expect(head.status).toBe(200);
    expect(get.status).toBe(200);
    for (const name of ["content-type", "content-disposition", "cache-control", "x-content-type-options"]) {
      expect(head.headers.get(name), name).toBe(get.headers.get(name));
    }
    expect(head.headers.get("content-type")).toBe("application/pdf");
    expect(head.body).toBeNull();
    expect(render).not.toHaveBeenCalled();
  });

  it("answers 401 without a session, with no body, and never builds a client", async () => {
    const client = vi.fn(() => reader());
    const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
    const head = await handleReportHeadRequest({
      id: STORY_FIXTURE_DEBATE_ID, sessionCookie: null, interfaceLocale: "de", client, now: NOW, render
    });
    expect(head.status).toBe(401);
    textHeaders(head);
    expect(head.body).toBeNull();
    expect(client).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("gives every refusal GET's status and headers, with no body", async () => {
    const notFound = async (): Promise<Answer> => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND"); };
    const cases: Array<[string, ReportReader, HandleOptions]> = [
      ["session no longer accepted", reader({ readAnswer: async () => { throw new ContractHttpError("SESSION_REQUIRED", 401, "x"); } }), {}],
      ["foreign debate", reader({ readAnswer: notFound, readRunAnswer: notFound }), {}],
      ["story being written", reader({ readAnswerStory: async () => storyFixture("WRITING") }), {}],
      ["story unavailable", reader({ readAnswerStory: async () => storyFixture("UNAVAILABLE") }), {}],
      ["run read failed", reader({ readRun: async () => { throw new Error("down"); } }), {}],
      ["story read failed", reader({ readAnswerStory: async () => { throw new ContractHttpError("SERVER_FAILURE", 500, "x"); } }), {}],
      ["unprintable language", reader({ readRun: async () => runWithTag("ja") }), { supported: (locale: string) => locale !== "ja" }]
    ];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const [name, client, options] of cases) {
      const { get, head, render } = await both(client, options);
      expect(head.status, name).toBe(get.status);
      expect(head.status, name).not.toBe(200);
      expect(head.headers.get("content-type"), name).toBe(get.headers.get("content-type"));
      expect(head.headers.get("cache-control"), name).toBe(get.headers.get("cache-control"));
      expect(head.body, name).toBeNull();
      expect(render, name).not.toHaveBeenCalled();
    }
  });

  it("is exported by the route: a HEAD with no session answers 401 with no body", async () => {
    const response = await HEAD(new Request(`http://localhost/debate/${STORY_FIXTURE_DEBATE_ID}/report`, {
      method: "HEAD",
      headers: { cookie: "debateai.locale=de" }
    }), { params: Promise.resolve({ id: STORY_FIXTURE_DEBATE_ID }) });
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.body).toBeNull();
  });
});

describe("GET /debate/{id}/report", () => {
  const request = (cookie?: string) => new Request(`http://localhost/debate/${STORY_FIXTURE_DEBATE_ID}/report`, {
    headers: cookie === undefined ? {} : { cookie }
  });
  const params = { params: Promise.resolve({ id: STORY_FIXTURE_DEBATE_ID }) };

  it("answers 401 to a request with no session cookie", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe(words("en", "public.report.error.signIn"));
  });

  it("answers the 401 in German for a German interface cookie", async () => {
    const response = await GET(request("debateai.locale=de"), params);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe(words("de", "public.report.error.signIn"));
  });

  it("answers 401 to a malformed session cookie", async () => {
    const response = await GET(request("__Host-debateai-session=short; debateai.locale=ro"), params);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe(words("ro", "public.report.error.signIn"));
  });

  it("forwards the session cookie and the browser's user-agent, and renders the real PDF", async () => {
    process.env.DIALECTICAL_API_BASE = "http://api.internal:8000";
    const seen: Array<{ path: string; cookie: string | null; userAgent: string | null }> = [];
    // Only the API is faked. Everything else goes to the real fetch: the PDF layout engine
    // (yoga) loads its WebAssembly through fetch, and must keep working.
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: URL | string, init?: RequestInit) => {
      if (!String(url).startsWith("http://api.internal:8000/")) return realFetch(url, init);
      const target = new URL(String(url));
      const headers = new Headers(init?.headers);
      seen.push({ path: target.pathname, cookie: headers.get("cookie"), userAgent: headers.get("user-agent") });
      if (target.pathname === `/v1/answers/${STORY_FIXTURE_DEBATE_ID}`) return Response.json(STORY_FIXTURE_ANSWER);
      if (target.pathname === `/v1/runs/${STORY_FIXTURE_ANSWER.run_ref}`) return Response.json(runWithTag("ro"));
      if (target.pathname === `/v1/answers/${STORY_FIXTURE_DEBATE_ID}/story`) return Response.json(storyFixture("READY"));
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    });
    const response = await GET(new Request(`http://localhost/debate/${STORY_FIXTURE_DEBATE_ID}/report`, {
      headers: { cookie: `__Host-debateai-session=${SESSION}; debateai.locale=en`, "user-agent": "story-route-test/1" }
    }), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''debate-ar-trebui-s%C4%83-ne-mut%C4%83m");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Task M6: the answer's record is read beside the story (the fake API has none: a 404).
    expect(seen.map((call) => call.path)).toEqual([
      `/v1/answers/${STORY_FIXTURE_DEBATE_ID}`,
      `/v1/runs/${STORY_FIXTURE_ANSWER.run_ref}`,
      `/v1/answers/${STORY_FIXTURE_DEBATE_ID}/story`,
      `/v1/answers/${STORY_FIXTURE_DEBATE_ID}/disclosure`
    ]);
    for (const call of seen) {
      expect(call.cookie).toBe(`__Host-debateai-session=${SESSION}`);
      expect(call.userAgent).toBe("story-route-test/1");
    }
  }, 60_000);
});
