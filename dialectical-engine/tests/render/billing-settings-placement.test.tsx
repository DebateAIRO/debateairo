import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ settingsProps: [] as Record<string, unknown>[] }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("t") }));
vi.mock("@/components/SessionControls", () => ({ SessionControls: () => <div data-marker="sessions" /> }));
vi.mock("@/components/consent/ConsentSettingsPanel", () => ({ ConsentSettingsPanel: () => null }));
vi.mock("@/components/LegacyRunClaimControls", () => ({ LegacyRunClaimControls: () => null }));
vi.mock("@/components/AccountErasureControls", () => ({ AccountErasureControls: () => <div data-marker="erasure" /> }));
vi.mock("@/components/billing/SubscriptionControls", () => ({
  SubscriptionControls: ({ catalog }: { catalog: Record<string, string> }) =>
    <div data-marker="subscription">{catalog["billing.subscription.title"]}</div>
}));
vi.mock("@/components/billing/UsageBars", () => ({ UsageBars: () => <div data-marker="usage" /> }));

import { SettingsPageClient } from "../../apps/ui/components/SettingsPageClient.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

describe("P20 Settings placement (spec §2.10)", () => {
  it("puts the subscription card and the usage bars right after the identity panel, before sessions and deletion", () => {
    const html = renderToStaticMarkup(<SettingsPageClient billingCatalog={{ ...billingEnglish, "billing.subscription.title": "ABONAMENT" }} />);
    const order = ["setPanel", 'data-marker="subscription"', 'data-marker="usage"', 'data-marker="sessions"', 'data-marker="erasure"']
      .map((needle) => html.indexOf(needle));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(html).toContain("ABONAMENT");
  });
});
