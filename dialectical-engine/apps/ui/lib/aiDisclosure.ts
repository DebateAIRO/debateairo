import { t } from "./i18n/translate.js";
import homeEnglish from "../messages/en/home.json" with { type: "json" };

// The interface's AI notices read their sentences straight from the reader's
// catalogue (components/AiNotice.tsx); the old all-variants `aiNoticeCopy`
// bundle read `home` and `newDebate` keys through whatever catalogue it was
// handed, which is how the debate page came to show English (review F1).

/** Additive export metadata; never modifies the recorded answer or its provenance. */
export const AI_EXPORT_DISCLOSURE = {
  version: 1,
  content_origin: "ai",
  scope: "Generated arguments, reviews, scores and verdicts; excludes the user's question and operational records.",
  human_editorial_review: false,
  // The download's machine-readable disclosure record is written in one fixed
  // language, like its field names and `scope`; it is a record, not interface
  // copy (FIX-DEBATE-CATALOGS follow-up 3 keeps its bytes and names the choice).
  notice: t(homeEnglish, "home.aiBlock")
} as const;
