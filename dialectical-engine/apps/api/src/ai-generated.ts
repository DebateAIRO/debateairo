import type { FastifyReply } from "fastify";

/**
 * EU AI Act Art. 50(2) (owner decision, 16 Nov 2026): the machine-readable mark on every response whose body carries
 * AI-generated content. A header only: no body, contract or visible text changes. The same name and value as the UI's
 * AI_GENERATED_HEADER / AI_GENERATED_HEADER_VALUE (apps/ui/lib/aiDisclosure.ts), which its same-origin proxy lets through.
 */
export const AI_GENERATED_HEADER = "x-ai-generated";
export const AI_GENERATED_HEADER_VALUE = "true";
/** The pair for a raw `writeHead` (the event streams), which bypasses the hooks that mark every other response. */
export const AI_GENERATED_HEADERS: Readonly<Record<typeof AI_GENERATED_HEADER, typeof AI_GENERATED_HEADER_VALUE>> =
  Object.freeze({ [AI_GENERATED_HEADER]: AI_GENERATED_HEADER_VALUE });

export function markAiGenerated(reply: FastifyReply): void {
  reply.header(AI_GENERATED_HEADER, AI_GENERATED_HEADER_VALUE);
}

/** Whether a route's successful body carries AI-generated content: some routes always, some only for some answers. */
type CarriesAi = (body: unknown) => boolean;
const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Readonly<Record<string, unknown>>)[name] : undefined;
const always: CarriesAi = () => true;
const arrayOf = (body: unknown, name: string): readonly unknown[] => {
  const value = field(body, name);
  return Array.isArray(value) ? value : [];
};
const nonEmptyArray = (name: string): CarriesAi => (body) => arrayOf(body, name).length > 0;
/** A list carries the AIs' work only when it lists something (an empty page is a count and nothing else). */
const listsItems: CarriesAi = nonEmptyArray("items");
/** The calls before Start (clarify, combine, fit) say so themselves: `source: "AI"`, never `NONE`. */
const sourceIsAi: CarriesAi = (body) => field(body, "source") === "AI";

/**
 * The routes whose 2xx JSON body carries AI-generated content, by their canonical name (as the authorization inventory
 * names them), each with what decides it. The API's preSerialization hook reads this table; a refusal (4xx, 5xx) is
 * never marked. Deliberately absent: the disclosure record (GET /v1/answers/{id}/disclosure, provenance codes about the
 * AIs, not their content), the inspection and the ledger digest (codes and ids), the dig links and the last visit (ids),
 * the ask's acceptance (POST /v1/asks: a run reference) and the room read (GET /v1/asks/room: shares and limits); on the
 * team's side the public-review list, the audit,
 * the team and its limits, and every team action's answer (an operation id and an outcome).
 * Marked elsewhere, because they bypass this table: the run-event stream and the lists and merge streams (their own
 * writeHead), and the question-language offer (a 409 whose `proposed_question` is the AI's rewrite, in the error handler).
 */
export const AI_GENERATED_ROUTES: ReadonlyMap<string, CarriesAi> = new Map<string, CarriesAi>([
  // Readable without signing in: the published debates and their list (verdicts, confidence, the AIs' answers).
  ["GET /v1/public/debates", listsItems],
  ["GET /v1/public/debates/{id}", always],
  // The owner's own debates: the library's answered rows (verdicts; an open run's row is the person's question), the
  // answer, its story, map and nodes; the run once it carries the AIs' paths, findings or what they found; the run's
  // answer and the final report over an investigation once a version is written.
  ["GET /v1/answers", listsItems],
  ["GET /v1/answers/{id}", always],
  ["GET /v1/answers/{id}/story", (body) => field(body, "story") !== null && field(body, "story") !== undefined],
  ["GET /v1/answers/{id}/map", always],
  ["GET /v1/answers/{id}/nodes/{nodeId}", always],
  ["GET /v1/runs/{id}", (body) => ["branches", "path_progress", "found"].some((name) => field(body, name) !== undefined)],
  ["GET /v1/runs/{id}/answer", always],
  ["GET /v1/runs/{id}/investigation", (body) => {
    const versions = field(body, "versions");
    return Array.isArray(versions) && versions.some((version) => {
      const state = field(version, "state");
      return state === "READY" || state === "READY_WITH_RESERVATION";
    });
  }],
  // The calls before Start: only an answer the AI wrote.
  ["POST /v1/asks/clarify", sourceIsAi],
  ["POST /v1/asks/paths/combine", sourceIsAi],
  ["POST /v1/asks/paths/fit", sourceIsAi],
  // Support: only the model's grounded reply; crisis, refusals, disabled, degraded and the other outcomes are fixed templates.
  ["POST /v1/support/messages", (body) => field(body, "outcome") === "ANSWER_GROUNDED"],
  // The owner's publication-review state: the AI synthesis check's categories, shown once it flagged the debate (a refusal's
  // reason is typed by staff).
  ["GET /v1/runs/{id}/publication-review", nonEmptyArray("categories")],
  // The team's pages (owner rule, 16 Nov 2026: "everything has to be machine-readable"). The publication-review queue lists
  // the AI check's categories for each debate held, and a review is the held debate itself (the AIs' answer) with them.
  ["GET /v1/admin/publication-reviews", listsItems],
  ["GET /v1/admin/publication-reviews/{reviewRef}", always],
  // A public debate under review: its pieces are the AI-written page, its digs' updates and its reports (the question is
  // the person's; a snapshot that cannot be read shows no piece). The list (refs, log rows) carries none.
  ["GET /v1/admin/public-review/{id}", (body) =>
    nonEmptyArray("snapshot")(body)
    || arrayOf(body, "updates").some((update) => nonEmptyArray("pieces")(update) || typeof field(update, "before") === "string")
    || arrayOf(body, "reports").some(nonEmptyArray("pieces"))],
  // The Report button's queue: `verdict` and `reason` are the AI check's findings (`where` and `claim` are the reporter's
  // words); a report the check did not judge (null) or could not judge (UNAVAILABLE) carries no finding.
  ["GET /v1/admin/public-reports", (body) => arrayOf(body, "reports").some((report) => {
    const verdict = field(report, "verdict");
    return verdict === "AGREE" || verdict === "NOT_FOUND" || verdict === "UNSURE";
  })],
  // A statement of reasons: grounds are fixed codes and facts are typed by staff; the automatic hide's quote is the words
  // the AI check copied from the published (AI-written) page, so only a statement carrying a quote is marked.
  ["GET /v1/account/moderation-statements", (body) => {
    const statements = field(body, "statements");
    return Array.isArray(statements) && statements.some((statement) => typeof field(statement, "quote") === "string");
  }]
]);

/** Whether a 2xx body of `route` (canonical name, e.g. "GET /v1/answers/{id}") carries AI-generated content. */
export function carriesAiGeneratedContent(route: string, body: unknown): boolean {
  return AI_GENERATED_ROUTES.get(route)?.(body) === true;
}
