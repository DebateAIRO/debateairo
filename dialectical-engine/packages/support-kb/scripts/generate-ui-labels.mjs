import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const messagesRoot = resolve(repositoryRoot, "apps/ui/messages");
const outputPath = resolve(packageRoot, "src/ui-labels.ts");

const actionKeys = Object.freeze({
  home: ["chrome", "chrome.footer.home"],
  "start-debate": ["home", "home.startDebateLabel"],
  "sign-in": ["home", "home.logIn"],
  "sign-up": ["home", "home.createAccount"],
  "forgot-password": ["auth", "auth.login.recoveryAccess"],
  help: ["chrome", "chrome.help"],
  "support-status": ["support", "support.serviceStatus"],
  method: ["chrome", "chrome.method"],
  "sample-transcript": ["chrome", "chrome.transcripts"],
  settings: ["chrome", "chrome.settings"],
  "active-sessions": ["settings", "settings.sessions.title"],
  "privacy-preferences": ["consent", "consent.settings.title"],
  security: ["chrome", "chrome.security"],
  "delete-account": ["settings", "settings.erasure.title"],
  "public-catalog": ["home", "home.publicDebates"],
  "your-debates": ["home", "home.yourDebates"],
  "owner-debate": ["support", "support.action.openYourDebate"],
  "public-debate": ["support", "support.action.openPublicDebate"],
});

// cookie-compliance S05 (SPEC-v5 R10): the chip keys above changed for home, sign-in and sign-up; their aliases keep
// the keys they had, so every alias set stays byte-identical (what a visitor types still routes).
const aliasKeys = Object.freeze({
  home: [["chrome", "chrome.brandHome"]],
  "sign-in": [["chrome", "chrome.account"]],
  "sign-up": [["auth", "auth.login.createOne"]],
  "start-debate": [
    ["home", "home.startDebateLabel"],
    ["chrome", "chrome.newDebate"],
    ["chrome", "chrome.startRound"],
  ],
  method: [
    ["chrome", "chrome.howItWorks"],
    ["chrome", "chrome.method"],
  ],
});

// cookie-compliance S05 (SPEC-v5 R03): the 53 controls of the S05 lexicon, each with the message key whose value the
// control shows on the screen; start-debate takes its named exception's key (V-19/V-20). Source of SUPPORT_CONTROL_NAMES.
const controlKeys = Object.freeze({
  "talk-to-human": ["support", "support.talkToHuman"],
  "escalate": ["support", "support.escalate"],
  "report-bug": ["support", "support.reportBug"],
  "service-status": ["support", "support.serviceStatus"],
  "debate-engine": ["support", "support.debateEngine"],
  "scoring-queue": ["support", "support.scoringQueue"],
  "model-fleet": ["support", "support.modelFleet"],
  "use-recovery-code": ["auth", "auth.login.useRecoveryCode"],
  "create-account": ["home", "home.createAccount"],
  "log-in": ["home", "home.logIn"],
  "start-debate": ["home", "home.startDebateLabel"],
  "your-debates": ["home", "home.yourDebates"],
  "public-debates": ["home", "home.publicDebates"],
  "ai-label": ["home", "home.aiLink"],
  "topic": ["newDebate", "newDebate.topic"],
  "start-run": ["newDebate", "newDebate.startRun"],
  "risk-tier": ["newDebate", "newDebate.riskTier"],
  "free": ["newDebate", "newDebate.free"],
  "premium": ["newDebate", "newDebate.premium"],
  "low": ["newDebate", "newDebate.low"],
  "medium": ["newDebate", "newDebate.medium"],
  "high": ["newDebate", "newDebate.high"],
  "casual": ["newDebate", "newDebate.casual"],
  "standard": ["newDebate", "newDebate.standard"],
  "high-stakes": ["newDebate", "newDebate.highStakes"],
  "method": ["chrome", "chrome.method"],
  "transcripts": ["chrome", "chrome.transcripts"],
  "pricing": ["chrome", "chrome.pricing"],
  "start-round": ["chrome", "chrome.startRound"],
  "new-debate": ["chrome", "chrome.newDebate"],
  "home": ["chrome", "chrome.footer.home"],
  "account": ["chrome", "chrome.account"],
  "settings": ["chrome", "chrome.settings"],
  "help": ["chrome", "chrome.help"],
  "thread": ["chrome", "chrome.thread"],
  "split": ["chrome", "chrome.split"],
  "tree": ["chrome", "chrome.tree"],
  "map": ["chrome", "chrome.map"],
  "library": ["chrome", "chrome.library"],
  "replay": ["chrome", "chrome.replay"],
  "workspace": ["chrome", "chrome.workspace"],
  "honesty": ["chrome", "chrome.honesty"],
  "export": ["chrome", "chrome.export"],
  "how-it-works": ["chrome", "chrome.howItWorks"],
  "cookies-we-store": ["chrome", "chrome.footer.cookiePreferences"],
  "what-we-store": ["consent", "consent.settings.button"],
  "privacy": ["consent", "consent.settings.title"],
  "active-sessions": ["settings", "settings.sessions.title"],
  "delete-account": ["settings", "settings.erasure.title"],
  "challenge": ["debateDrawers", "debateDrawers.node.challenge"],
  "open-your-debate": ["support", "support.action.openYourDebate"],
  "open-public-debate": ["support", "support.action.openPublicDebate"],
});

// cookie-compliance S05 (SPEC-v5 R13, V-22): the 10 KEY rows of the capability table of record — the page link the
// screen shows for that product area. The other 10 capability names are written by hand in src/capability-names.ts.
// Paid plans (P24, merge with #62): five of the nine paid-plan pages have such a link — the footer's Pricing, Cancel a
// plan and Withdraw from a plan, the Settings card's Update card, and the privacy policy's All versions of this policy;
// the other four (checkout, its return page, the two archived texts) are TRANSLATE rows in src/capability-names.ts.
const capabilityKeys = Object.freeze({
  "ai-transparency": ["chrome", "chrome.aiTransparency"],
  "legal-notice": ["chrome", "chrome.legal.notice"],
  "legal-terms": ["chrome", "chrome.legal.terms"],
  "legal-terms-versions": ["chrome", "chrome.legal.versions"],
  "legal-privacy": ["chrome", "chrome.legal.privacy"],
  "legal-health-data": ["chrome", "chrome.legal.health"],
  "legal-cookies": ["chrome", "chrome.legal.cookies"],
  "legal-providers": ["chrome", "chrome.legal.providers"],
  "sign-up": ["home", "home.createAccount"],
  "settings": ["chrome", "chrome.settings"],
  "billing-pricing": ["chrome", "chrome.footer.pricing"],
  "billing-card-change": ["billing", "billing.subscription.updateCard"],
  "billing-cancel": ["chrome", "chrome.footer.cancel"],
  "billing-withdraw": ["chrome", "chrome.footer.withdraw"],
  "legal-privacy-versions": ["legal", "legal.privacyVersions.link"],
});

const topicSources = Object.freeze({
  "support.topic.gettingStarted.prompt": [
    "getting-started-debate", "risk-tier-choice", "budget-tier-choice",
  ],
  "support.topic.reading.prompt": ["guide-how-it-works"],
  "support.topic.scores.prompt": [],
  "support.topic.publishing.prompt": [
    "unpublish-a-debate", "delete-a-private-debate", "public-answer-disclosure",
  ],
  "support.topic.account.prompt": ["settings-help-menus", "account-settings"],
  "support.topic.privacy.prompt": [
    "app-navigation", "settings-help-menus", "support-cases",
  ],
});

function readCatalogue(locale, namespace, cache) {
  const cacheKey = `${locale}/${namespace}`;
  if (!cache.has(cacheKey)) {
    const path = resolve(messagesRoot, locale, `${namespace}.json`);
    cache.set(cacheKey, JSON.parse(readFileSync(path, "utf8")));
  }
  return cache.get(cacheKey);
}

function value(locale, namespace, key, cache) {
  const found = readCatalogue(locale, namespace, cache)[key];
  if (typeof found !== "string" || found.length === 0) {
    throw new Error(`Missing UI catalogue value ${locale}/${namespace}.json:${key}`);
  }
  return found;
}

const locales = readdirSync(messagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "en"));
const cache = new Map();
const labels = {};
const aliases = {};
const prompts = {};
const controlNames = {};
const capabilityKeyNames = {};
const strip = (text) => text.replace(/\s*[↗→]\s*$/u, "").trim();
const enNames = Object.fromEntries(Object.entries(controlKeys).map(([control, [namespace, key]]) =>
  [control, strip(value("en", namespace, key, cache))]));

for (const locale of locales) {
  labels[locale] = Object.fromEntries(Object.entries(actionKeys).map(([id, [namespace, key]]) =>
    [id, value(locale, namespace, key, cache)]));
  aliases[locale] = Object.fromEntries(Object.keys(actionKeys).map((id) => {
    const keys = aliasKeys[id] ?? [actionKeys[id]];
    return [id, [...new Set(keys.map(([namespace, key]) =>
      value(locale, namespace, key, cache)))]];
  }));
  prompts[locale] = Object.entries(topicSources).map(([key, sourceIds]) => ({
    prompt: value(locale, "support", key, cache),
    sourceIds,
  }));
  const legacy = locale === "en" || locale === "ro";
  controlNames[locale] = legacy ? [] : Object.entries(controlKeys)
    .map(([control, [namespace, key]]) => [enNames[control], strip(value(locale, namespace, key, cache))])
    .filter(([en, local]) => en !== local)
    .sort(([left], [right]) => right.length - left.length || left.localeCompare(right, "en"));
  capabilityKeyNames[locale] = legacy ? {} : Object.fromEntries(Object.entries(capabilityKeys)
    .map(([id, [namespace, key]]) => [id, strip(value(locale, namespace, key, cache))]));
}

const generated = `// Generated by scripts/generate-ui-labels.mjs. Do not edit by hand.\n`
  + `import type { SupportActionId } from "./catalog.js";\n`
  + `import type { SupportLanguage } from "./locale.js";\n\n`
  + `export const SUPPORT_UI_LABELS = ${JSON.stringify(labels, null, 2)} as const satisfies `
  + `Readonly<Record<SupportLanguage, Readonly<Record<SupportActionId, string>>>>;\n\n`
  + `export const SUPPORT_UI_LABEL_ALIASES = ${JSON.stringify(aliases, null, 2)} as const satisfies `
  + `Readonly<Record<SupportLanguage, Readonly<Record<SupportActionId, readonly string[]>>>>;\n\n`
  + `export const SUPPORT_TOPIC_PROMPTS = ${JSON.stringify(prompts, null, 2)} as const satisfies `
  + `Readonly<Record<SupportLanguage, readonly Readonly<{ prompt: string; sourceIds: readonly string[] }>[]>>;\n\n`
  + `export const SUPPORT_CONTROL_NAMES = ${JSON.stringify(controlNames, null, 2)} as const satisfies `
  + `Readonly<Record<SupportLanguage, readonly (readonly [string, string])[]>>;\n\n`
  + `export const SUPPORT_CAPABILITY_KEY_NAMES = ${JSON.stringify(capabilityKeyNames, null, 2)} as const satisfies `
  + `Readonly<Record<SupportLanguage, Readonly<Record<string, string>>>>;\n`;

writeFileSync(outputPath, generated);
