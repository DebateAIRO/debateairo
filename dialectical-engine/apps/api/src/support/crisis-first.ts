import { detectCrisis } from "@debateai/contract";
import { supportSelfHarmPatternMatch } from "./classify.js";

export function recognisedSupportCrisis(message: string): "PHRASE_CHECK" | "SUPPORT_PATTERN" | null {
  if (detectCrisis(message).crisis) return "PHRASE_CHECK";
  return supportSelfHarmPatternMatch(message) ? "SUPPORT_PATTERN" : null;
}
