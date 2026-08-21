/**
 * DR-146: V2-only mutation controls remain visible, but V3 cannot execute
 * them. These are capability facts, not generic refusal copy, and every
 * disabled affordance reads from this one vocabulary so its tooltip cannot
 * drift into a fabricated reason or a fake success path.
 */
export const V3_MISSING_CAPABILITIES = {
  nodeRegeneration: "V3 exposes no node-regeneration resource.",
  scoringFeedback: "V3 exposes no scoring-feedback resource.",
  settingsWrite: "V3 exposes no settings-write resource; deployment configuration is register-governed.",
  adaptiveDepthApproval: "V3 exposes no adaptive-depth approval resource."
} as const;
