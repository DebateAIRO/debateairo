import type { CSSProperties } from "react";
import { modelMeta } from "@/lib/models";

export function modelColor(modelId: string): string {
  const palette = ["#1f6f8b", "#7a4d1d", "#6f5d9a", "#168050", "#b43c37", "#8062b5", "#2f6f5f"];
  let hash = 0;
  for (const char of modelId) hash = (hash + char.charCodeAt(0)) % palette.length;
  return palette[hash];
}

export function modelColorStyle(modelId: string): CSSProperties {
  const color = modelColor(modelId);
  return { "--model-color": color, "--node-model-color": color } as CSSProperties;
}

export function ModelMetaLine({ modelId, className = "metaLine" }: { modelId: string; className?: string }) {
  const model = modelMeta(modelId);
  return (
    <span className={className}>
      <span className="modelDot" style={{ ["--dot" as string]: model.dot }} />
      {model.name}
    </span>
  );
}

export function ModelBadge({ modelId }: { modelId: string }) {
  const color = modelColor(modelId);
  return (
    <span
      className="badge modelBadge"
      style={{ "--model-color": color } as CSSProperties}
      data-model-id={modelId}
      data-model-color={color}
    >
      {modelId}
    </span>
  );
}
