import type { PublicDebate } from "@debateai/contract";
import { AI_EXPORT_DISCLOSURE } from "../aiDisclosure";
import publicEnglish from "../../messages/en/public.json" with { type: "json" };
import { t, type MessageCatalog } from "../i18n/translate.js";

export type PublicAnswerExport = Readonly<{
  available: true;
  href: string;
  filename: string;
}>;

export function buildPublicAnswerExport(
  debate: PublicDebate,
  catalog: MessageCatalog = publicEnglish
): PublicAnswerExport {
  const payload = {
    ai_disclosure: AI_EXPORT_DISCLOSURE,
    public_ref: debate.public_ref,
    question: debate.question,
    author_pseudonym: debate.author_pseudonym,
    published_at: debate.published_at,
    answer: debate.answer
  };
  return {
    available: true,
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`,
    filename: t(catalog, "public.export.filename", { publicRef: debate.public_ref })
  };
}
