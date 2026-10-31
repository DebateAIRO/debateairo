import {
  ResearchedAddRequestSchema, ResearchedAddedSchema, ResearchedRefusedSchema, type Answer, type ResearchedAdded, type ResearchedRefused
} from "@debateai/contract";
import { exhaustive } from "@debateai/kernel";

/**
 * "ADD TO RESEARCHED", THE API'S HALF (dig-model revision task W4-4; owner Q7, Q-D9; plan 2026-10-31 decision 7): POST /v1/runs/{id}/researched
 * from the map, outside a debate. The checks, cheapest first, nothing charged before they pass:
 *  1. The body names a path and a page; anything else is 400.
 *  2. Whose debate: only its owner's. The owner's answer read answers null for anyone else (the closed 404), and the store checks again
 *     (0132's NOT_OWNED). A PUBLIC debate is no exception yet: this is the one place the Public lane opens to someone with credit of their
 *     own, and it must then charge the presser (the calls name the run, whose scope is its owner's), as 0137's public_report_charge does.
 *  3. While the debate runs: 409 NOT_NOW (its map is not settled).
 *  4. The page is one of that path's other pages, as the map shows them; else 404. A page already added answers READING again: nothing runs
 *     or is paid twice (0132 keeps one choice per page; the runner reads it once).
 *  5. Free: refused, and the page hides the button (owner: paid plans read added pages).
 *  6. New starts wait for the reset of a full day, week or month (the money rule, point 4), 409 WAITS_FOR_RESET. Once started it is never walled.
 * Then the choice is kept (the runner's sweep reads it within seconds) and the 30-day clock of "other pages" starts again (owner F12: adding is an
 * activity). A debate that was in no investigation opens one, so the clock has something to stand on. Does the page change the path? No (owner Q-D9).
 */
export interface WebResearchedPorts {
  /** The debate's answer as its owner reads it; null while it has none, or when it is not this account's. */
  readAnswer(runId: string): Promise<Answer | null>;
  /** Whether the debate is this account's (it runs, or it has settled). */
  readRunExists(runId: string): Promise<boolean>;
  /** The person's plan and whether new starts wait for a reset. */
  readRoom(): Promise<Readonly<{ planId: string | null; waitsForReset: boolean }>>;
  /** 0132's identity.record_web_researched. */
  record(ownerRef: string, runId: string, pageId: string): Promise<"RECORDED" | "ALREADY" | "NOT_OWNED" | "NOT_OTHER_PAGE">;
  /** 0133's open and touch: the investigation's last activity is now. */
  markActivity(ownerRef: string, runId: string): Promise<void>;
}

export type WebResearchedAnswer =
  | Readonly<{ kind: "ADDED"; body: ResearchedAdded }>
  | Readonly<{ kind: "REFUSED"; body: ResearchedRefused }>
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "MALFORMED" }>;

const refused = (error: ResearchedRefused["error"]): WebResearchedAnswer =>
  Object.freeze({ kind: "REFUSED", body: ResearchedRefusedSchema.parse({ error, message: error }) });
const READING: WebResearchedAnswer = Object.freeze({ kind: "ADDED", body: ResearchedAddedSchema.parse({ state: "READING" }) });

export async function addToResearched(input: Readonly<{ ownerRef: string; runId: string; body: unknown }>, ports: WebResearchedPorts): Promise<WebResearchedAnswer> {
  const body = ResearchedAddRequestSchema.safeParse(input.body);
  if (!body.success) return Object.freeze({ kind: "MALFORMED" });
  const answer = await ports.readAnswer(input.runId);
  if (answer === null) return await ports.readRunExists(input.runId) ? refused("WEB_RESEARCHED_NOT_NOW") : Object.freeze({ kind: "NOT_FOUND" });
  const page = answer.web?.paths.find((path) => path.position_ref === body.data.position_ref)?.other_pages
    .find((candidate) => candidate.page_ref === body.data.page_ref);
  if (page === undefined) return Object.freeze({ kind: "NOT_FOUND" });
  // Already added: whatever became of it, nothing starts again. (READING is the one word this route answers; the map shows the outcome.)
  if (page.researched !== undefined) return READING;
  const room = await ports.readRoom();
  if (room.planId === "FREE") return refused("WEB_RESEARCHED_NOT_ON_PLAN");
  if (room.waitsForReset) return refused("WEB_RESEARCHED_WAITS_FOR_RESET");
  const recorded = await ports.record(input.ownerRef, input.runId, body.data.page_ref);
  switch (recorded) {
    case "RECORDED":
    case "ALREADY":
      await ports.markActivity(input.ownerRef, input.runId);
      return READING;
    case "NOT_OWNED":
    case "NOT_OTHER_PAGE":
      return Object.freeze({ kind: "NOT_FOUND" });
    default:
      return exhaustive(recorded);
  }
}
