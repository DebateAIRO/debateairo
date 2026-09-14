import { describe, expect, it } from "vitest";

import {
  SUPPORT_ACTION_IDS,
  type SupportActionId,
} from "../../packages/support-kb/src/catalog.js";
import { resolveSupportActions } from "../../packages/support-kb/src/navigation.js";

describe("Support navigation", () => {
  it("resolves only public first-party actions for a signed-out visitor", () => {
    // Property: authentication and resource authority are required before privileged destinations resolve.
    const actions = resolveSupportActions(SUPPORT_ACTION_IDS, { signedIn: false, language: "en" });

    expect(actions).toEqual([
      { id: "home", label: "Home", href: "/" },
      { id: "start-debate", label: "Start a debate", href: "/login?next=%2Fnew" },
      { id: "sign-in", label: "Sign in", href: "/login" },
      { id: "sign-up", label: "Create account", href: "/sign-up" },
      { id: "help", label: "Help desk", href: "/help" },
      { id: "support-status", label: "Support status", href: "/help#service-status" },
      { id: "method", label: "How it works", href: "/#method" },
      { id: "sample-transcript", label: "Sample debate", href: "/#transcripts" },
    ]);
    expect(actions.every(({ href }) => href.startsWith("/") && !href.startsWith("//"))).toBe(true);
  });

  it("uses only trusted owner and public projections for dynamic destinations", () => {
    // Property: signed-in state alone cannot authorize a private debate route or invent a public reference.
    const withoutProof = resolveSupportActions(
      ["owner-debate", "public-debate", "settings", "privacy-preferences", "public-catalog", "your-debates"],
      { signedIn: true, language: "ro" },
    );
    expect(withoutProof).toEqual([
      { id: "settings", label: "Setări", href: "/settings" },
      {
        id: "privacy-preferences",
        label: "Preferințe de confidențialitate",
        href: "/settings#consent-privacy-heading",
      },
      { id: "public-catalog", label: "Dezbateri publice", href: "/?tab=public" },
      { id: "your-debates", label: "Dezbaterile tale", href: "/?tab=yours" },
    ]);

    expect(resolveSupportActions(["owner-debate", "public-debate"], {
      signedIn: true,
      language: "en",
      ownerDebateId: "8a4e47f1-65a3-41a3-9759-c586d3eea3f5",
      publicDebateRef: "8f781594-f277-48eb-b8fe-36ce21480fc4",
    })).toEqual([
      {
        id: "owner-debate",
        label: "Open your debate",
        href: "/debate/8a4e47f1-65a3-41a3-9759-c586d3eea3f5",
      },
      {
        id: "public-debate",
        label: "Open public debate",
        href: "/public/debate/8f781594-f277-48eb-b8fe-36ce21480fc4",
      },
    ]);
  });

  it.each([
    ["unknown-action", {}],
    ["forgot-password", {}],
    ["owner-debate", { ownerDebateId: "../../settings" }],
    ["owner-debate", { ownerDebateId: "https://evil.example" }],
    ["public-debate", { publicDebateRef: "//evil.example/path" }],
    ["public-debate", { publicDebateRef: "safe?token=secret" }],
  ] as const)("drops unknown, unresolved, malformed, external, and token-bearing %s requests", (id, projection) => {
    // Property: no untrusted identifier can cross the closed resolver into an href.
    expect(resolveSupportActions([id as SupportActionId], {
      signedIn: true,
      language: "en",
      ...projection,
    })).toEqual([]);
  });

  it("deduplicates action ids and returns immutable action records", () => {
    // Property: repeated model ids cannot duplicate controls, and callers cannot rewrite trusted destinations.
    const actions = resolveSupportActions(["help", "help"], { signedIn: false, language: "en" });

    expect(actions).toEqual([{ id: "help", label: "Help desk", href: "/help" }]);
    expect(Object.isFrozen(actions)).toBe(true);
    expect(Object.isFrozen(actions[0])).toBe(true);
  });
});
