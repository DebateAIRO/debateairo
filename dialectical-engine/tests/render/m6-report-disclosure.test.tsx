import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, type AnswerDisclosure, type AnswerStory, type RunProjection } from "@debateai/contract";
import {
  handleReportHeadRequest,
  handleReportRequest,
  type ReportReader,
  type ReportRenderer
} from "../../apps/ui/lib/report/reportRoute.js";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";

/**
 * Task M6 (spec 2026-09-26 §14.4.5): the PDF route reads the answer's record
 * beside the story, and hands it to the report, whose "About this report" says
 * which models wrote and checked the answer and what cut it short. A missing
 * or failed read means none of those lines, never a failed report.
 */

const SESSION = "s".repeat(43);
const NOW = new Date("2026-09-26T12:00:00.000Z");
const FAKE_PDF = Buffer.from("%PDF-1.3 fake");

const RUN: RunProjection = {
  run_ref: STORY_FIXTURE_ANSWER.run_ref,
  question_line: STORY_FIXTURE_ANSWER.question_line,
  state: "SETTLED",
  terminal_reason: null,
  hold_until: null,
  argument_language: { tag: "ro", name: "Romanian" }
};

const RECORD: AnswerDisclosure = {
  answer_id: STORY_FIXTURE_DEBATE_ID,
  answer_version: 1,
  floor: null,
  floor_reason: null,
  writer: null,
  checker: null,
  checker_same_as_writer: false,
  digest: null,
  cut_short: { arguing: "MONEY", answer_writing: null }
};

function reader(overrides: Partial<ReportReader> = {}): ReportReader {
  return {
    readAnswer: async () => STORY_FIXTURE_ANSWER,
    readRunAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_SERVED"); },
    readRun: async () => RUN,
    readAnswerStory: async () => storyFixture("READY"),
    readAnswerDisclosure: async () => RECORD,
    ...overrides
  };
}

async function get(client: ReportReader, render: ReportRenderer): Promise<Response> {
  return handleReportRequest({
    id: STORY_FIXTURE_DEBATE_ID,
    sessionCookie: SESSION,
    interfaceLocale: "en",
    client: () => client,
    now: NOW,
    render
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the PDF route reads the answer's record (GET)", () => {
  it("reads it beside the story, not after it, and hands it to the report", async () => {
    const started: string[] = [];
    let releaseStory: (() => void) | null = null;
    const client = reader({
      readAnswerStory: () => {
        started.push("story");
        return new Promise<AnswerStory>((done) => { releaseStory = () => done(storyFixture("READY")); });
      },
      readAnswerDisclosure: async (id: string) => { started.push(`disclosure:${id}`); return RECORD; }
    });
    const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
    const pending = get(client, render);
    for (let index = 0; index < 20 && releaseStory === null; index += 1) await Promise.resolve();
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    expect(started).toEqual(["story", `disclosure:${STORY_FIXTURE_DEBATE_ID}`]);
    releaseStory!();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(render.mock.calls[0]![0].disclosure).toEqual(RECORD);
  });

  it("makes the report without the lines when the answer has no record, and logs nothing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
    const response = await get(reader({
      readAnswerDisclosure: async () => { throw new ContractHttpError("NOT_FOUND", 404, "DISCLOSURE_NOT_FOUND"); }
    }), render);
    expect(response.status).toBe(200);
    expect(render.mock.calls[0]![0].disclosure).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("makes the report without the lines when the read fails, and logs a fixed tag and the typed code only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
    const response = await get(reader({
      readAnswerDisclosure: async () => { throw new ContractHttpError("SERVER_FAILURE", 500, "secret upstream detail"); }
    }), render);
    expect(response.status).toBe(200);
    expect(render.mock.calls[0]![0].disclosure).toBeNull();
    expect(log.mock.calls).toEqual([["[STORY_REPORT_DISCLOSURE_UNREAD]", "SERVER_FAILURE"]]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret upstream detail");
  });

  it("still refuses a story that is not ready, whatever the record says", async () => {
    const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
    const response = await get(reader({ readAnswerStory: async () => storyFixture("WRITING") }), render);
    expect(response.status).toBe(404);
    expect(render).not.toHaveBeenCalled();
  });
});

describe("HEAD never reads the record: it makes no PDF", () => {
  it("answers without the read", async () => {
    const readAnswerDisclosure = vi.fn(async () => RECORD);
    const response = await handleReportHeadRequest({
      id: STORY_FIXTURE_DEBATE_ID,
      sessionCookie: SESSION,
      interfaceLocale: "en",
      client: () => reader({ readAnswerDisclosure }),
      now: NOW
    });
    expect(response.status).toBe(200);
    expect(readAnswerDisclosure).not.toHaveBeenCalled();
  });
});
