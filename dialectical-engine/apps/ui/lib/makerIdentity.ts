import { modelMeta } from "./models.js";
import composeEnglish from "../messages/en/compose.json" with { type: "json" };
import type { MessageCatalog } from "./i18n/translate.js";

export type MakerIdentityLabel = Readonly<{
  text: string;
  absence: boolean;
}>;

/**
 * One pure label seam for every V2 model-identity renderer. The maker is always
 * recorded contract data. The friendly family retains V2's existing
 * model-id-derived vocabulary, while the exact recorded model id stays visible.
 */
export function makerIdentityLabel({
  maker,
  modelId,
  catalog = composeEnglish
}: Readonly<{
  maker?: string | null;
  modelId: string | null;
  /** The reader's `compose` catalogue: the friendly model family ("… (local)", fallback name). */
  catalog?: MessageCatalog;
}>): MakerIdentityLabel {
  if (maker === null) return { text: "House unavailable", absence: true };
  const modelName = modelId === null ? null : modelMeta(modelId, catalog).name;
  const modelIdentity = modelId === null
    ? []
    : modelName === modelId
      ? [modelId]
      : [modelName, modelId];
  if (maker === undefined) return { text: modelIdentity.join(" · "), absence: false };
  return {
    text: [maker, ...modelIdentity].join(" · "),
    absence: false
  };
}
