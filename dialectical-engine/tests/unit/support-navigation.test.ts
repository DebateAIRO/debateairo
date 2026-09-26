import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
  it("keeps the committed UI-label artifact current with a fresh isolated generation", () => {
    // Regression: editing a locale catalogue without regenerating all three tables must fail this gate.
    const temporaryRoot = mkdtempSync(resolve(tmpdir(), "support-ui-labels-"));
    const packageRoot = resolve(temporaryRoot, "packages/support-kb");
    try {
      mkdirSync(resolve(packageRoot, "scripts"), { recursive: true });
      mkdirSync(resolve(packageRoot, "src"), { recursive: true });
      mkdirSync(resolve(temporaryRoot, "apps/ui"), { recursive: true });
      copyFileSync(
        resolve(process.cwd(), "packages/support-kb/scripts/generate-ui-labels.mjs"),
        resolve(packageRoot, "scripts/generate-ui-labels.mjs"),
      );
      symlinkSync(
        resolve(process.cwd(), "apps/ui/messages"),
        resolve(temporaryRoot, "apps/ui/messages"),
        "dir",
      );

      execFileSync(process.execPath, [resolve(packageRoot, "scripts/generate-ui-labels.mjs")]);

      expect(readFileSync(resolve(process.cwd(), "packages/support-kb/src/ui-labels.ts"), "utf8"))
        .toBe(readFileSync(resolve(packageRoot, "src/ui-labels.ts"), "utf8"));
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("keeps every generated action label byte-equal to its UI catalogue source",() => {
    for (const locale of SUPPORT_LOCALES) for (const [id,[namespace,key]] of Object.entries(LABEL_SOURCES)) {
      const catalogue = JSON.parse(readFileSync(resolve(
        process.cwd(),"apps/ui/messages",locale,`${namespace}.json`
      ),"utf8")) as Record<string,string>;
      expect(SUPPORT_UI_LABELS[locale][id as keyof typeof LABEL_SOURCES]).toBe(catalogue[key]);
    }
  });

  it("labels a new interface locale's actions from the generated UI catalogue only", () => {
    // Scope audit B6: en/ro keep dev's reviewed catalog labels (pinned below);
    // the 33 new locales name the control the reader sees in their catalogue.
    for (const language of SUPPORT_LOCALES.filter((code) => code !== "en" && code !== "ro")) {
      const actions = resolveSupportActions(SUPPORT_ACTION_IDS, { signedIn: false, language });
      expect(actions.map(({ id }) => id)).toEqual([
        "home","start-debate","sign-in","sign-up","help","support-status","method","sample-transcript"
      ]);
      for (const action of actions) {
        expect(action.label).toBe(SUPPORT_UI_LABELS[language][action.id as keyof typeof LABEL_SOURCES]);
      }
    }
  });

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

  it("resolves the three static Settings sections only for signed-in visitors", () => {
    const ids = ["active-sessions","claim-legacy","delete-account"] as const;
    expect(resolveSupportActions(ids,{ signedIn:false,language:"en" })).toEqual([]);
    expect(resolveSupportActions(ids,{ signedIn:true,language:"ro" })).toEqual([
      { id:"active-sessions",label:"Sesiuni active",href:"/settings#active-sessions-heading" },
      { id:"claim-legacy",label:"Revendică dezbaterile vechi",href:"/settings#legacy-run-claim-heading" },
      { id:"delete-account",label:"Șterge contul",href:"/settings#account-deletion-heading" }
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

    expect(actions).toEqual([{ id: "help", label: "Help desk", href: "/help" }]);
    expect(Object.isFrozen(actions)).toBe(true);
    expect(Object.isFrozen(actions[0])).toBe(true);
  });
});
