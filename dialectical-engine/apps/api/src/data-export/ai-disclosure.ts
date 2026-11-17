import { readFileSync } from "node:fs";

/**
 * EU AI Act Art. 50(2): the machine-readable mark on the data export's files that hold AI-generated content, the same
 * scheme as the debate's JSON download (apps/ui/lib/aiDisclosure.ts AI_EXPORT_DISCLOSURE). apps/api cannot import
 * apps/ui, so the record is restated here, value for value (tests/unit/data-export-archive.test.ts A-13 compares the
 * two). Its `notice` is read from the same source as the UI's: the English `home.aiBlock` sentence, found from this
 * module (apps/api/src/data-export → apps/ui/messages), as mail-attachments.ts finds apps/ui/legal; the API runs from
 * the repository tree. It is additive metadata: it never alters a recorded value.
 */
export type ExportAiDisclosure = Readonly<{
  version: 1;
  content_origin: "ai";
  scope: string;
  human_editorial_review: false;
  notice: string;
}>;

/** debates.json: the debate download's own scope (apps/ui/lib/aiDisclosure.ts). */
export const DEBATES_AI_SCOPE = "Generated arguments, reviews, scores and verdicts; excludes the user's question and operational records.";

/**
 * support.json: what is generated there is the support assistant's replies (support.message role "assistant", also as
 * copied into a case's transcript snapshot) and the advisory case summary (apps/api/src/support/cases.ts). The person's
 * own messages and the replies a person wrote (support.case_message role "V") are not.
 */
export const SUPPORT_AI_SCOPE = "Support assistant replies (session messages with role \"assistant\", also as copied into a case's transcript_snapshot) "
  + "and case summaries; excludes the user's own messages, replies written by a person (case messages with role \"V\") and operational records.";

/**
 * account.json: the AI's words among the questions not started yet (saved questions spec 2026-11-04; the contract's
 * savedQuestionOwnWords names what is the person's). question_readings and before_start_readings hold only the time and
 * kind of each AI call (snapshot.ts KEEP_COLUMNS), so the scope says they record that an AI ran, not what it wrote.
 */
export const ACCOUNT_AI_SCOPE = "In questions_not_started: the AI's reading of each question (read_question), its clarifying questions and the "
  + "answer options picked from them (answers), and its suggested paths (paths, other_suggestions) except those the user "
  + "worded, which own_words lists; excludes the user's own question, typed answers and own words, and every other record. "
  + "question_readings and before_start_readings record only when an AI ran and which kind, not what it wrote.";

let notice: string | null = null;

/** The English `home.aiBlock` sentence, read once; a missing or empty sentence fails the build loudly. */
function aiNotice(): string {
  if (notice !== null) return notice;
  const catalog: unknown = JSON.parse(readFileSync(new URL("../../../ui/messages/en/home.json", import.meta.url), "utf8"));
  const value = catalog !== null && typeof catalog === "object" ? (catalog as Record<string, unknown>)["home.aiBlock"] : undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error("DATA_EXPORT_AI_NOTICE_MISSING");
  notice = value;
  return notice;
}

export function exportAiDisclosure(scope: string): ExportAiDisclosure {
  return { version: 1, content_origin: "ai", scope, human_editorial_review: false, notice: aiNotice() };
}
