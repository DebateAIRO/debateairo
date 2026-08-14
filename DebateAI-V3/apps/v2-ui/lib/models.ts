export type ModelMeta = {
  key: string;
  name: string;
  /** CSS color (oklch) for the model's identity dot. */
  dot: string;
};

const DOTS: Record<string, string> = {
  claude: "var(--m-claude)",
  gpt: "var(--m-gpt)",
  gemini: "var(--m-gemini)",
  grok: "var(--m-grok)",
  qwen: "var(--m-qwen)",
  default: "var(--m-default)"
};

const NAMES: Record<string, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
  grok: "Grok",
  qwen: "Qwen"
};

/** Normalize a backend model id (e.g. "claude-sonnet-4", "grok-4.5-high-loop") to a family key. */
export function modelKey(modelId: string): string {
  const lower = (modelId || "").toLowerCase();
  if (lower.includes("claude")) return "claude";
  if (lower.includes("gpt") || lower.includes("openai") || lower.startsWith("o1") || lower.startsWith("o3"))
    return "gpt";
  if (lower.includes("gemini")) return "gemini";
  if (lower.includes("grok")) return "grok";
  if (lower.includes("qwen")) return "qwen";
  return "default";
}

/** Friendly display name for a model id, preserving any size/variant suffix. */
export function modelMeta(modelId: string): ModelMeta {
  const key = modelKey(modelId);
  const dot = DOTS[key] ?? DOTS.default!;
  if (key === "default") {
    return { key, name: modelId || "Model", dot };
  }
  const base = NAMES[key]!;
  const isLocal = (modelId || "").toLowerCase().includes("local") || (modelId || "").toLowerCase().includes("qwen");
  const name = key === "qwen" || isLocal ? `${base}·local` : base;
  return { key, name, dot };
}

export function modelDot(modelId: string): string {
  return DOTS[modelKey(modelId)] ?? DOTS.default!;
}
