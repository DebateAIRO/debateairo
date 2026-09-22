import { t, type MessageCatalog } from "./i18n/translate";

/** Disclosure copy from the design document's shared AI Notice component. */
export function aiNoticeCopy(catalog?: MessageCatalog) {
  return Object.freeze({
    strip: t(catalog, "home.aiStrip"),
    pill: t(catalog, "home.aiPill"),
    block: t(catalog, "home.aiBlock"),
    landingBlock: t(catalog, "home.aiLandingBlock"),
    banner: t(catalog, "home.aiBanner"),
    newDebate: t(catalog, "newDebate.aiNotice"),
    debate: t(catalog, "home.aiDebate")
  });
}

export const AI_NOTICE = aiNoticeCopy();

/** Additive export metadata; never modifies the recorded answer or its provenance. */
export const AI_EXPORT_DISCLOSURE = {
  version: 1,
  content_origin: "ai",
  scope: "Generated arguments, reviews, scores and verdicts; excludes the user's question and operational records.",
  human_editorial_review: false,
  notice: AI_NOTICE.block
} as const;
