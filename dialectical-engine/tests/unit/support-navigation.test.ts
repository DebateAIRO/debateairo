import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import enAuth from "../../apps/ui/messages/en/auth.json" with { type: "json" };
import enChrome from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import enHome from "../../apps/ui/messages/en/home.json" with { type: "json" };
import enSupport from "../../apps/ui/messages/en/support.json" with { type: "json" };
import roChrome from "../../apps/ui/messages/ro/chrome.json" with { type: "json" };
import roConsent from "../../apps/ui/messages/ro/consent.json" with { type: "json" };
import roHome from "../../apps/ui/messages/ro/home.json" with { type: "json" };
import roSettings from "../../apps/ui/messages/ro/settings.json" with { type: "json" };

import {
  SUPPORT_ACTION_IDS,
  type SupportActionId,
} from "../../packages/support-kb/src/catalog.js";
import { resolveSupportActions } from "../../packages/support-kb/src/navigation.js";
import { SUPPORT_LOCALES } from "../../packages/support-kb/src/locale.js";
import { SUPPORT_UI_LABELS } from "../../packages/support-kb/src/ui-labels.js";

const LABEL_SOURCES = {
  home: ["chrome","chrome.brandHome"],"start-debate": ["home","home.startDebateLabel"],
  "sign-in": ["chrome","chrome.account"],"sign-up": ["auth","auth.login.createOne"],
  help: ["chrome","chrome.help"],"support-status": ["support","support.serviceStatus"],
  method: ["chrome","chrome.howItWorks"],"sample-transcript": ["chrome","chrome.transcripts"],
  settings: ["chrome","chrome.settings"],"active-sessions": ["settings","settings.sessions.title"],
  "privacy-preferences": ["consent","consent.settings.title"],
  "claim-legacy": ["settings","settings.legacy.title"],
  "delete-account": ["settings","settings.erasure.title"],
  "public-catalog": ["home","home.publicDebates"],"your-debates": ["home","home.yourDebates"],
  "owner-debate": ["support","support.action.openYourDebate"],
  "public-debate": ["support","support.action.openPublicDebate"]
} as const;

describe("Support navigation", () => {
  it("keeps every generated action label byte-equal to its UI catalogue source",() => {
    for (const locale of SUPPORT_LOCALES) for (const [id,[namespace,key]] of Object.entries(LABEL_SOURCES)) {
      const catalogue = JSON.parse(readFileSync(resolve(
        process.cwd(),"apps/ui/messages",locale,`${namespace}.json`
      ),"utf8")) as Record<string,string>;
      expect(SUPPORT_UI_LABELS[locale][id as keyof typeof LABEL_SOURCES]).toBe(catalogue[key]);
    }
  });

  it("resolves only public first-party actions for a signed-out visitor", () => {
    // Property: authentication and resource authority are required before privileged destinations resolve.
    const actions = resolveSupportActions(SUPPORT_ACTION_IDS, { signedIn: false, language: "en" });

    expect(actions).toEqual([
      { id: "home", label: enChrome["chrome.brandHome"], href: "/" },
      { id: "start-debate", label: enHome["home.startDebateLabel"], href: "/login?next=%2Fnew" },
      { id: "sign-in", label: enChrome["chrome.account"], href: "/login" },
      { id: "sign-up", label: enAuth["auth.login.createOne"], href: "/sign-up" },
      { id: "help", label: enChrome["chrome.help"], href: "/help" },
      { id: "support-status", label: enSupport["support.serviceStatus"], href: "/help#service-status" },
      { id: "method", label: enChrome["chrome.howItWorks"], href: "/#method" },
      { id: "sample-transcript", label: enChrome["chrome.transcripts"], href: "/#transcripts" },
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
      { id: "settings", label: roChrome["chrome.settings"], href: "/settings" },
      {
        id: "privacy-preferences",
        label: roConsent["consent.settings.title"],
        href: "/settings#consent-privacy-heading",
      },
      { id: "public-catalog", label: roHome["home.publicDebates"], href: "/?tab=public" },
      { id: "your-debates", label: roHome["home.yourDebates"], href: "/?tab=yours" },
    ]);

    expect(resolveSupportActions(["owner-debate", "public-debate"], {
      signedIn: true,
      language: "en",
      ownerDebateId: "8a4e47f1-65a3-41a3-9759-c586d3eea3f5",
      publicDebateRef: "8f781594-f277-48eb-b8fe-36ce21480fc4",
    })).toEqual([
      {
        id: "owner-debate",
        label: enSupport["support.action.openYourDebate"],
        href: "/debate/8a4e47f1-65a3-41a3-9759-c586d3eea3f5",
      },
      {
        id: "public-debate",
        label: enSupport["support.action.openPublicDebate"],
        href: "/public/debate/8f781594-f277-48eb-b8fe-36ce21480fc4",
      },
    ]);
  });

  it("resolves the three static Settings sections only for signed-in visitors", () => {
    const ids = ["active-sessions","claim-legacy","delete-account"] as const;
    expect(resolveSupportActions(ids,{ signedIn:false,language:"en" })).toEqual([]);
    expect(resolveSupportActions(ids,{ signedIn:true,language:"ro" })).toEqual([
      { id:"active-sessions",label:roSettings["settings.sessions.title"],href:"/settings#active-sessions-heading" },
      { id:"claim-legacy",label:roSettings["settings.legacy.title"],href:"/settings#legacy-run-claim-heading" },
      { id:"delete-account",label:roSettings["settings.erasure.title"],href:"/settings#account-deletion-heading" }
    ]);
  });

  it.each([
    ["unknown-action", {}],
    ["forgot-password", {}],
    ["owner-debate", { ownerDebateId: "../../settings" }],
    ["owner-debate", { ownerDebateId: "https://evil.example" }],
    ["public-debate", { publicDebateRef: "//evil.example/path" }],
    ["public-debate", { publicDebateRef: "safe?token=secret" }],
    ["active-sessions", { signedIn: false }],
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

    expect(actions).toEqual([{ id: "help", label: enChrome["chrome.help"], href: "/help" }]);
    expect(actions[0]?.label).not.toBe("Help desk");
    expect(actions[0]?.label).not.toBe("Centrul de ajutor");
    expect(Object.isFrozen(actions)).toBe(true);
    expect(Object.isFrozen(actions[0])).toBe(true);
  });
});
