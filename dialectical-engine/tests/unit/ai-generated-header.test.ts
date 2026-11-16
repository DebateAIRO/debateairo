import { describe, expect, it } from "vitest";
import { authorizationPolicyInventory } from "@debateai/api";
import {
  AI_GENERATED_HEADER,
  AI_GENERATED_HEADER_VALUE,
  AI_GENERATED_HEADERS,
  AI_GENERATED_ROUTES,
  carriesAiGeneratedContent
} from "../../apps/api/src/ai-generated.js";
import { SUPPORT_ROUTE_PATHS } from "../../apps/api/src/support/index.js";

/**
 * EU AI Act Art. 50(2) (owner decision, 16 Nov 2026): the API's table of routes whose successful body carries
 * AI-generated content. The routes themselves are exercised over HTTP in s8-publication-http (public debates),
 * m5-answer-disclosure (answer, story, disclosure), s7-authorization (run events, refusals), dl1-f7-support-origin-and-share
 * (support), ask-clarify, start-step-routes (lists, merge, combine, fit) and question-language-submit (the 409 offer).
 */
describe("the AI-generated mark", () => {
  it("is one header with one value, the UI's", () => {
    expect(AI_GENERATED_HEADER).toBe("x-ai-generated");
    expect(AI_GENERATED_HEADER_VALUE).toBe("true");
    expect(AI_GENERATED_HEADERS).toEqual({ "x-ai-generated": "true" });
  });

  it("names only declared routes", () => {
    const declared = new Set<string>([...authorizationPolicyInventory.map((row) => row.route), ...SUPPORT_ROUTE_PATHS]);
    for (const route of AI_GENERATED_ROUTES.keys()) expect(declared.has(route), route).toBe(true);
  });

  it("leaves out the routes that carry no AI-generated content", () => {
    for (const route of [
      "GET /v1/answers/{id}/disclosure", "GET /v1/answers/{id}/inspection", "GET /v1/answers/{id}/ledger-digest",
      "GET /v1/runs/{id}/dig-links", "GET /v1/runs/{id}/last-visit", "GET /v1/runs/{id}/visibility",
      "POST /v1/asks", "GET /v1/asks/room", "GET /v1/support/status", "GET /v1/public/ai-providers", "GET /v1/session"
    ]) {
      expect(AI_GENERATED_ROUTES.has(route), route).toBe(false);
      expect(carriesAiGeneratedContent(route, { anything: true }), route).toBe(false);
    }
  });

  it("marks the calls before Start only when the AI answered", () => {
    for (const route of ["POST /v1/asks/clarify", "POST /v1/asks/paths/combine", "POST /v1/asks/paths/fit"]) {
      expect(carriesAiGeneratedContent(route, { source: "AI" }), route).toBe(true);
      expect(carriesAiGeneratedContent(route, { source: "NONE", reason: "OFF" }), route).toBe(false);
    }
  });

  it("marks support's grounded model reply only, never a fixed template", () => {
    expect(carriesAiGeneratedContent("POST /v1/support/messages", { outcome: "ANSWER_GROUNDED", text: "x" })).toBe(true);
    for (const outcome of ["CRISIS", "REFUSE_ZONE", "REFUSE_INJECTION", "REFUSE_SAFETY", "DISABLED", "DEGRADED", "NO_SOURCE",
      "OFF_TOPIC", "THREAT", "TOO_LONG", "RATE_LIMITED", "ANSWER_INCIDENT", "NO_INCIDENT"]) {
      expect(carriesAiGeneratedContent("POST /v1/support/messages", { outcome, text: "x" }), outcome).toBe(false);
    }
  });

  it("marks a list only when it lists something, and a run once it carries the AIs' paths or findings", () => {
    expect(carriesAiGeneratedContent("GET /v1/public/debates", { items: [], total: 0 })).toBe(false);
    expect(carriesAiGeneratedContent("GET /v1/public/debates", { items: [{}], total: 1 })).toBe(true);
    expect(carriesAiGeneratedContent("GET /v1/answers", { items: [], open_runs: [{}], limit: 1, offset: 0, total: 0 })).toBe(false);
    expect(carriesAiGeneratedContent("GET /v1/answers", { items: [{}], open_runs: [], limit: 1, offset: 0, total: 1 })).toBe(true);
    expect(carriesAiGeneratedContent("GET /v1/runs/{id}", { run_ref: "r", question_line: "q", state: "QUEUED" })).toBe(false);
    for (const member of ["branches", "path_progress", "found"]) {
      expect(carriesAiGeneratedContent("GET /v1/runs/{id}", { state: "RUNNING", [member]: [] }), member).toBe(true);
    }
  });

  it("marks a story and an investigation only once the AIs wrote one", () => {
    expect(carriesAiGeneratedContent("GET /v1/answers/{id}/story", { status: "WRITING", story: null })).toBe(false);
    expect(carriesAiGeneratedContent("GET /v1/answers/{id}/story", { status: "READY", story: {} })).toBe(true);
    expect(carriesAiGeneratedContent("GET /v1/runs/{id}/investigation", { state: "OPEN", versions: [] })).toBe(false);
    expect(carriesAiGeneratedContent("GET /v1/runs/{id}/investigation", { versions: [{ state: "WRITING" }, { state: "FAILED" }] })).toBe(false);
    expect(carriesAiGeneratedContent("GET /v1/runs/{id}/investigation", { versions: [{ state: "READY" }] })).toBe(true);
    expect(carriesAiGeneratedContent("GET /v1/runs/{id}/investigation", { versions: [{ state: "READY_WITH_RESERVATION" }] })).toBe(true);
  });

  it("marks the team's pages that carry the AIs' work or the AI check's findings, and no other team page", () => {
    expect(carriesAiGeneratedContent("GET /v1/admin/publication-reviews", { items: [], order: "ASKED_AT_ASC" })).toBe(false);
    expect(carriesAiGeneratedContent("GET /v1/admin/publication-reviews", { items: [{ categories: ["TERRORISM"] }] })).toBe(true);
    expect(carriesAiGeneratedContent("GET /v1/admin/publication-reviews/{reviewRef}", { answer: {} })).toBe(true);
    const page = { question: "the person's", snapshot: [], updates: [], reports: [] };
    expect(carriesAiGeneratedContent("GET /v1/admin/public-review/{id}", page)).toBe(false);
    expect(carriesAiGeneratedContent("GET /v1/admin/public-review/{id}", { ...page, snapshot: [{ original: "x" }] })).toBe(true);
    expect(carriesAiGeneratedContent("GET /v1/admin/public-review/{id}", { ...page, updates: [{ before: "x", pieces: [] }] })).toBe(true);
    expect(carriesAiGeneratedContent("GET /v1/admin/public-review/{id}", { ...page, updates: [{ before: null, pieces: [{}] }] })).toBe(true);
    expect(carriesAiGeneratedContent("GET /v1/admin/public-review/{id}", { ...page, reports: [{ pieces: [{}] }] })).toBe(true);
    expect(carriesAiGeneratedContent("GET /v1/admin/public-reports", { reports: [] })).toBe(false);
    expect(carriesAiGeneratedContent("GET /v1/admin/public-reports", { reports: [{ verdict: null, claim: "typed" }, { verdict: "UNAVAILABLE" }] })).toBe(false);
    for (const verdict of ["AGREE", "NOT_FOUND", "UNSURE"]) {
      expect(carriesAiGeneratedContent("GET /v1/admin/public-reports", { reports: [{ verdict }] }), verdict).toBe(true);
    }
    expect(carriesAiGeneratedContent("GET /v1/runs/{id}/publication-review", { flagged: false, categories: [] })).toBe(false);
    expect(carriesAiGeneratedContent("GET /v1/runs/{id}/publication-review", { flagged: true, categories: ["HATE_SPEECH"] })).toBe(true);
    for (const route of ["GET /v1/admin/public-review", "GET /v1/admin/threat-reports", "GET /v1/admin/threat-reports/summary",
      "GET /v1/admin/threat-reports/{reportRef}", "GET /v1/admin/audit", "GET /v1/admin/team", "GET /v1/admin/team-limit",
      "GET /v1/admin/team-allowances", "GET /v1/admin/enrollment", "POST /v1/admin/publication-reviews/{reviewRef}/approve",
      "POST /v1/admin/public-review/{id}/step", "POST /v1/admin/public-reports/{id}/dismiss"]) {
      expect(AI_GENERATED_ROUTES.has(route), route).toBe(false);
    }
  });

  it("marks a statement of reasons only when it carries the AI check's quote of the page", () => {
    const route = "GET /v1/account/moderation-statements";
    expect(carriesAiGeneratedContent(route, { statements: [] })).toBe(false);
    expect(carriesAiGeneratedContent(route, { statements: [{ facts: ["typed by staff"], quote: null }] })).toBe(false);
    expect(carriesAiGeneratedContent(route, { statements: [{ facts: [], quote: null }, { facts: [], quote: "the page's words" }] })).toBe(true);
  });
});
