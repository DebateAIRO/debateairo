import type { DiscoveredPanelMember } from "@debateai/db";

/** Test-layer fixture only; production panels always come from provider probes. */
export function fixtureDiscoveredPanel(size: number): readonly DiscoveredPanelMember[] {
  const providerRefs = [
    "provider:test-layer",
    "provider:test-layer:secondary",
    "provider:test-layer:third"
  ] as const;
  return Object.freeze(Array.from({ length: size }, (_, index) => Object.freeze({
    provider_ref: providerRefs[index] ?? `provider:test-layer:${index + 1}`,
    maker: `maker:${index + 1}`,
    model_id: `model:${index + 1}`,
    probe_evidence_ref: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    probed_at: "2026-08-14T12:00:00.000Z"
  })));
}

export function fixtureStructuralCeiling(maxModelAttempts: number, panelSize = 1, depth = 1) {
  return Object.freeze({
    kind: "COMPUTED_STRUCTURAL_CEILING" as const,
    max_model_attempts: maxModelAttempts,
    panel_size: panelSize,
    depth,
    per_site_attempts: { judge: 1, organ: 1 },
    hold_cap: 1,
    final_retry_attempts: 1,
    formula_version: "test-v1",
    bounds_source_ref: "test:engine+register"
  });
}
