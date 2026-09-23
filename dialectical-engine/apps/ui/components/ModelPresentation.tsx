import type { CSSProperties } from "react";
import { makerIdentityLabel } from "@/lib/makerIdentity";
import { modelMeta } from "@/lib/models";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import miscEnglish from "@/messages/en/misc.json";

export function modelColor(identity: string): string {
  switch (identity.trim().toLowerCase()) {
    case "anthropic":
      return "var(--m-claude)";
    case "openai":
      return "var(--m-gpt)";
    case "google":
      return "var(--m-gemini)";
    case "xai":
      return "var(--m-grok)";
    case "alibaba":
      return "var(--m-qwen)";
    default:
      return "var(--m-default)";
  }
}

export function modelColorStyle(identity: string): CSSProperties {
  const color = modelColor(identity);
  return { "--model-color": color, "--node-model-color": color } as CSSProperties;
}

type ModelIdentityProps = {
  modelId: string | null;
  maker?: string | null;
  className?: string;
  catalog?: MessageCatalog;
};

export function ModelMetaLine({
  modelId,
  maker,
  className = "metaLine",
  catalog = miscEnglish
}: ModelIdentityProps) {
  const label = makerIdentityLabel({ maker, modelId });
  const visibleLabel = label.absence ? t(catalog, "misc.model.houseUnavailable") : label.text;
  const absenceExplanation = t(catalog, "misc.model.noRecordedHouse");
  const model = modelId === null ? null : modelMeta(modelId);
  const identity = maker ?? modelId ?? "maker-absent";
  const dot = maker === undefined && model !== null ? model.dot : modelColor(identity);
  return (
    <span
      className={className}
      style={label.absence ? undefined : ({ "--model-color": dot } as CSSProperties)}
      data-maker={maker ?? undefined}
      data-maker-absence={label.absence ? "true" : undefined}
      title={label.absence ? absenceExplanation : undefined}
      aria-label={label.absence ? absenceExplanation : undefined}
    >
      {label.absence ? null : <span className="modelDot" style={{ ["--dot" as string]: dot }} />}
      {visibleLabel}
    </span>
  );
}

export function ModelBadge({ modelId, maker, catalog = miscEnglish }: ModelIdentityProps) {
  const label = makerIdentityLabel({ maker, modelId });
  const visibleLabel = label.absence ? t(catalog, "misc.model.houseUnavailable") : label.text;
  const absenceExplanation = t(catalog, "misc.model.noRecordedHouse");
  const identity = maker ?? modelId ?? "maker-absent";
  const color = modelColor(identity);
  return (
    <span
      className="badge modelBadge"
      style={label.absence ? undefined : ({ "--model-color": color } as CSSProperties)}
      data-model-id={modelId ?? undefined}
      data-maker={maker ?? undefined}
      data-maker-absence={label.absence ? "true" : undefined}
      data-model-color={label.absence ? undefined : color}
      title={label.absence ? absenceExplanation : undefined}
      aria-label={label.absence ? absenceExplanation : undefined}
    >
      {visibleLabel}
    </span>
  );
}
