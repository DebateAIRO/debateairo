import type { CSSProperties } from "react";
import { makerIdentityLabel } from "@/lib/makerIdentity";
import { modelMeta } from "@/lib/models";

export function modelColor(identity: string): string {
  const palette = [
    "var(--m-gemini)",
    "var(--m-gpt)",
    "var(--m-claude)",
    "var(--m-qwen)",
    "var(--con-line)",
    "var(--reasoning-line)",
    "var(--pro-line)"
  ];
  let hash = 0;
  for (const char of identity) hash = (hash + char.charCodeAt(0)) % palette.length;
  return palette[hash];
}

export function modelColorStyle(identity: string): CSSProperties {
  const color = modelColor(identity);
  return { "--model-color": color, "--node-model-color": color } as CSSProperties;
}

type ModelIdentityProps = { modelId: string | null; maker?: string | null; className?: string };

export function ModelMetaLine({ modelId, maker, className = "metaLine" }: ModelIdentityProps) {
  const label = makerIdentityLabel({ maker, modelId });
  const model = modelId === null ? null : modelMeta(modelId);
  const identity = maker ?? modelId ?? "maker-absent";
  const dot = maker === undefined && model !== null ? model.dot : modelColor(identity);
  return (
    <span
      className={className}
      data-maker={maker ?? undefined}
      data-maker-absence={label.absence ? "true" : undefined}
      title={label.absence ? "No recorded house is available for this argument." : undefined}
      aria-label={label.absence ? "No recorded house is available for this argument." : undefined}
    >
      {label.absence ? null : <span className="modelDot" style={{ ["--dot" as string]: dot }} />}
      {label.text}
    </span>
  );
}

export function ModelBadge({ modelId, maker }: ModelIdentityProps) {
  const label = makerIdentityLabel({ maker, modelId });
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
      title={label.absence ? "No recorded house is available for this argument." : undefined}
      aria-label={label.absence ? "No recorded house is available for this argument." : undefined}
    >
      {label.text}
    </span>
  );
}
