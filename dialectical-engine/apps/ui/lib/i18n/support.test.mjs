import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { LOCALES } from "./locales.ts";
import { assertLocalizedCatalog } from "./catalogContractAssertions.mjs";

const root = process.cwd();
const source = (path) => readFileSync(join(root, path), "utf8");
const english = JSON.parse(source("messages/en/support.json"));
const expectedKeys = [
  "support.fullPage",
  "support.message",
  "support.send",
  "support.talkToHuman",
  "support.yes",
  "support.no",
  "support.close",
  "support.ratingQuestion",
  "support.placeholder",
  "support.sources",
  "support.actions",
  "support.unavailable",
  "support.topic.gettingStarted",
  "support.topic.gettingStarted.prompt",
  "support.topic.reading",
  "support.topic.reading.prompt",
  "support.topic.scores",
  "support.topic.scores.prompt",
  "support.topic.publishing",
  "support.topic.publishing.prompt",
  "support.topic.account",
  "support.topic.account.prompt",
  "support.topic.privacy",
  "support.topic.privacy.prompt",
  "support.suggestion.bug",
  "support.suggestion.condition",
  "support.suggestion.unpublish",
  "support.browseByTopic",
  "support.serviceStatus",
  "support.debateEngine",
  "support.scoringQueue",
  "support.modelFleet",
  "support.status.unavailable",
  "support.status.checking",
  "support.status.online",
  "support.status.check",
  "support.status.normal",
  "support.status.inApp",
  "support.agentTitle",
  "support.aiLead",
  "support.newConversation",
  "support.timestamp",
  "support.conversation",
  "support.suggestions",
  "support.thisConversation",
  "support.reference",
  "support.opened",
  "support.thisVisit",
  "support.data",
  "support.publicGuidance",
  "support.needPerson",
  "support.escalateBody",
  "support.escalate",
  "support.shortcuts",
  "support.summaryAdvisory",
  "support.case.reply",
  "support.case.state",
  "support.case.yours",
  "support.case.region",
  "support.bannerLead",
  "support.bannerBody",
  "support.action.openYourDebate",
  "support.action.openPublicDebate"
].sort();

test("all 35 locales expose the exact 63-key support chrome contract", () => {
  assert.deepEqual(Object.keys(english).sort(), expectedKeys);
  const locales = readdirSync(join(root, "messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(locales, LOCALES.map(({ code }) => code).sort());
  for (const locale of locales) {
    const localized = JSON.parse(source(`messages/${locale}/support.json`));
    assertLocalizedCatalog({ english, localized, locale, namespace: "support" });
  }
});

test("support chrome uses the shared catalogue and removes the language override", () => {
  const assistant = source("components/support/Assistant.tsx");
  const widget = source("components/support/SupportWidget.tsx");
  const caseView = source("components/support/CaseView.tsx");
  const notice = source("components/AiNotice.tsx");
  const help = source("app/help/page.tsx");

  assert.doesNotMatch(`${assistant}\n${widget}\n${caseView}`, /Language override/);
  assert.doesNotMatch(assistant, /const (?:DISCLOSURE|WORDS|REQUEST_UNAVAILABLE)\b/);
  assert.doesNotMatch(caseView, /const COPY\b/);
  assert.doesNotMatch(notice, /language\s*===\s*"ro"|language\?:/);
  assert.doesNotMatch(help, /["'][A-Za-z][^"']*\s[^"']*["']/);
  assert.doesNotMatch(
    source("lib/i18n/english-allowlist.txt"),
    /^(?:components\/support\/\*\*|app\/help\/page\.tsx)$/m
  );
});

test("the root shared catalogue and English fallback include support", () => {
  const layout = source("app/layout.tsx");
  const translate = source("lib/i18n/translate.ts");
  assert.match(layout, /loadNamespace\(locale, "support"\)/);
  assert.match(layout, /\.\.\.support/);
  assert.match(translate, /import supportEnglish from "\.\.\/\.\.\/messages\/en\/support\.json"/);
  assert.match(translate, /\.\.\.supportEnglish/);
});
