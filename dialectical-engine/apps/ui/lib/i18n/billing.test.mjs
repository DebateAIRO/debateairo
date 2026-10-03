import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { LOCALES } from "./locales.ts";

import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

// The billing namespace (paid-plans spec §2.10; contract §10). B10c creates it
// with the usage bars; P18 adds its pages' keys and its files to `ownedFiles`.
const root = process.cwd();
const ownedFiles = [
  "components/billing/UsageBars.tsx", "components/billing/PricingCards.tsx", "app/pricing/page.tsx",
  "components/billing/ChargeStatusPoller.tsx", "components/billing/XMoneyCardForm.tsx",
  "components/billing/CheckoutFlow.tsx", "app/checkout/page.tsx", "app/checkout/return/page.tsx",
  "components/billing/SubscriptionControls.tsx", "components/billing/CardChangeFlow.tsx", "app/settings/card/page.tsx",
  "components/billing/CancelFlow.tsx", "app/cancel/page.tsx", "app/withdraw/page.tsx"
];
const source = (path) => readFileSync(join(root, path), "utf8");
const englishPath = join(root, "messages/en/billing.json");
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);

function hardCodedVisibleEnglish(path, fileSource) {
  const failures = [];
  const parsed = ts.createSourceFile(path, fileSource, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const add = (text) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (/[A-Za-z]{3,}/.test(normalized)) failures.push(normalized);
  };
  const inspect = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) add(node.getText(parsed));
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(parsed))
      && node.initializer && ts.isStringLiteral(node.initializer)) add(node.initializer.text);
    if (ts.isJsxExpression(node) && node.expression
      && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))) add(node.expression.text);
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
}

test("every billing key the owned sources name exists in English", () => {
  assert.ok(existsSync(englishPath), "messages/en/billing.json must exist");
  const english = JSON.parse(readFileSync(englishPath, "utf8"));
  const used = new Set(ownedFiles.flatMap((path) =>
    [...source(path).matchAll(/"(billing\.[A-Za-z0-9.]+)"/g)].map((match) => match[1])));
  assert.ok(used.size > 0, "expected the billing sources to name billing keys");
  for (const key of used) assert.ok(Object.hasOwn(english, key), `${key} exists in English`);
});

test("all 35 locales expose the exact billing contract and a translated sample", () => {
  const english = JSON.parse(readFileSync(englishPath, "utf8"));
  const locales = readdirSync(join(root, "messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.equal(locales.length, 35);
  const catalogs = new Map();
  for (const locale of locales) {
    const catalog = JSON.parse(source(`messages/${locale}/billing.json`));
    catalogs.set(locale, catalog);
    assertLocalizedCatalog({ english, localized: catalog, locale, namespace: "billing" });
    for (const [key, value] of Object.entries(catalog)) {
      assert.doesNotMatch(value, /\$|USD|€/u, `${locale}/billing:${key} shows no money`);
    }
  }
  assertTranslationSample({ catalogs, english, namespace: "billing" });
});

test("the billing sources carry no hard-coded visible English", () => {
  const failures = ownedFiles.flatMap((path) => hardCodedVisibleEnglish(path, source(path)).map((text) => `${path}: ${text}`));
  assert.deepEqual(failures, []);
});

test("the namespace is registered with the provider union and the server loader for every locale", () => {
  assert.match(source("lib/i18n/I18nProvider.tsx"), /\| "billing"/);
  const loaders = source("lib/i18n/server.ts");
  const locales = readdirSync(join(root, "messages"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const { name } of locales) {
    assert.ok(loaders.includes(`billing: () => import("../../messages/${name}/billing.json")`), `${name} billing loader`);
  }
});

const catalogue = (locale) => JSON.parse(source(`messages/${locale}/billing.json`));

// Every key P18–P21 read, beside B10c's billing.usage.* keys (the parity test above covers all of them).
const REQUIRED = [
  "billing.plans.FREE.name", "billing.plans.PLUS.name", "billing.plans.PRO.name", "billing.plans.MAX.name",
  "billing.pricing.eyebrow", "billing.pricing.title", "billing.pricing.lede", "billing.pricing.perMonth",
  "billing.pricing.plusTax", "billing.pricing.allowanceFree", "billing.pricing.allowancePlus", "billing.pricing.allowance",
  "billing.pricing.freeFeatures", "billing.pricing.paidFeatures", "billing.pricing.startFree", "billing.pricing.choose",
  "billing.pricing.unavailable", "billing.pricing.faqTitle", "billing.pricing.faqLimitsQuestion",
  "billing.pricing.faqLimitsAnswer", "billing.pricing.faqCancelQuestion", "billing.pricing.faqCancelAnswer",
  "billing.pricing.faqTaxQuestion", "billing.pricing.faqTaxAnswer", "billing.pricing.termsLink", "billing.pricing.privacyLink",
  "billing.checkout.eyebrow", "billing.checkout.title", "billing.checkout.country", "billing.checkout.region",
  "billing.checkout.postalCode", "billing.checkout.fullName", "billing.checkout.city", "billing.checkout.county",
  "billing.checkout.romaniaNote", "billing.checkout.companyToggle", "billing.checkout.companyName",
  "billing.checkout.companyVatId", "billing.checkout.companyAddress", "billing.checkout.companyIncomplete",
  "billing.checkout.showPrice", "billing.checkout.quoting",
  "billing.checkout.countryUnavailable", "billing.checkout.confirmCountry", "billing.checkout.confirmCountryYes",
  "billing.checkout.confirmCountryRequired",
  "billing.checkout.taxLabel", "billing.checkout.taxReverseCharge", "billing.checkout.noTax", "billing.checkout.total",
  "billing.consent.renewal", "billing.consent.immediateStart", "billing.checkout.continueToCard",
  "billing.checkout.cardTitle", "billing.checkout.cardNote", "billing.checkout.subscribeAndPay",
  "billing.checkout.waitingForBank", "billing.checkout.willEmail", "billing.checkout.doNotPayAgain",
  "billing.checkout.cardCountryRefused",
  "billing.checkout.refunded", "billing.checkout.succeeded", "billing.checkout.failed", "billing.checkout.tryAgain",
  "billing.checkout.startDebate",
  "billing.checkout.goToSettings", "billing.checkout.taxIdInvalid", "billing.checkout.serviceUnavailable",
  "billing.checkout.alreadySubscribed", "billing.checkout.quoteExpired", "billing.checkout.reacceptRequired",
  "billing.checkout.pageOutdated", "billing.checkout.erasurePending", "billing.checkout.rateLimited",
  "billing.checkout.genericError", "billing.checkout.formUnavailable", "billing.checkout.unknownPlan",
  "billing.checkout.pricingLink", "billing.checkout.returnTitle", "billing.checkout.returnSucceeded",
  "billing.subscription.title", "billing.subscription.free", "billing.subscription.choosePlan",
  "billing.subscription.plan", "billing.subscription.renews", "billing.subscription.renewalProcessing",
  "billing.subscription.endsOn", "billing.subscription.pastDue",
  "billing.subscription.suspended", "billing.subscription.downgradeScheduled", "billing.subscription.changePlan",
  "billing.subscription.upgradeTo", "billing.subscription.downgradeTo", "billing.subscription.upgradeQuote",
  "billing.subscription.upgradeConfirm", "billing.subscription.upgraded", "billing.subscription.upgradeFailed",
  "billing.subscription.upgradeInProgress", "billing.subscription.upgradeNotAvailableNow",
  "billing.subscription.upgradeNotHigher", "billing.subscription.downgradeNotLower",
  "billing.subscription.downgradeNotAvailableNow", "billing.subscription.downgradeConfirm", "billing.subscription.downgradeYes",
  "billing.subscription.downgraded", "billing.subscription.downgradedNoTotal", "billing.subscription.updateCard",
  "billing.subscription.cancel", "billing.subscription.cancelConfirm", "billing.subscription.cancelConfirmPastDue",
  "billing.subscription.cancelYes", "billing.subscription.keep",
  "billing.subscription.revoke", "billing.subscription.withdraw", "billing.subscription.withdrawHint",
  "billing.subscription.stepUpHint", "billing.subscription.password", "billing.subscription.code",
  "billing.subscription.stepUpExpired",
  "billing.subscription.withdrawConfirm", "billing.subscription.withdrawDone", "billing.subscription.withdrawRefused",
  "billing.subscription.withdrawNothingDue", "billing.subscription.withdrawOwnerReview",
  "billing.subscription.withdrawWindowClosed", "billing.subscription.stillConfirming",
  "billing.subscription.actionFailed", "billing.subscription.invoices", "billing.subscription.noInvoices",
  "billing.subscription.invoiceRow", "billing.subscription.creditNote", "billing.subscription.openInvoice",
  "billing.card.title", "billing.card.intro", "billing.card.holdNote", "billing.card.noHoldNote", "billing.card.save",
  "billing.card.saved", "billing.card.failed", "billing.card.countryRefused", "billing.card.tryAgainShortly",
  "billing.card.notSubscribed", "billing.card.back",
  "billing.cancelPage.title", "billing.cancelPage.lede", "billing.cancelPage.email", "billing.cancelPage.send",
  "billing.cancelPage.sent", "billing.cancelPage.confirmTitle", "billing.cancelPage.confirmLede", "billing.cancelPage.confirm",
  "billing.cancelPage.done", "billing.cancelPage.linkInvalid", "billing.cancelPage.signedInHint",
  "billing.cancelPage.nothingToCancel",
  "billing.withdrawPage.title", "billing.withdrawPage.who", "billing.withdrawPage.refund", "billing.withdrawPage.how",
  "billing.withdrawPage.byEmail", "billing.withdrawPage.signIn", "billing.withdrawPage.settings"
];

// R3-4: the colleague's legal pages and footer (PR #42) keep their own namespaces; P21 extends them there.
const NOT_BILLING = /^billing\.(?:legal|contact|legalVersions|footer)\./u;

test("the billing namespace carries every paid-plans sentence (P18–P21) in English, and none of the legal pages' or the footer's", () => {
  const english = catalogue("en");
  for (const key of REQUIRED) assert.ok(Object.hasOwn(english, key), `en/billing:${key}`);
  assert.deepEqual(Object.keys(english).filter((key) => NOT_BILLING.test(key)), []);
});

test("the spec's sentences G2, G3, B1–B5 read exactly as approved in English (§2.9)", () => {
  const english = catalogue("en");
  assert.equal(english["billing.checkout.countryUnavailable"], "Paid plans aren't available in your country yet. You can keep using the Free plan.");
  assert.equal(english["billing.checkout.confirmCountry"], "Your connection looks like it's from {ipCountry}. Do you live in {declaredCountry}?");
  assert.equal(english["billing.checkout.total"], "{plan} — {net} + {taxLabel} = {total} per month. Renews on the {day} of each month until you cancel.");
  assert.equal(english["billing.consent.renewal"], "I agree that my subscription renews automatically every month at the price shown, until I cancel. I can cancel at any time in Settings or at dezbatere.ro/cancel.");
  assert.equal(english["billing.consent.immediateStart"], "Start my plan now. I understand that if I withdraw within 14 days, I pay for the part already used: the larger of the days used or the credit used.");
  assert.equal(english["billing.checkout.subscribeAndPay"], "Subscribe and pay");
  assert.equal(english["billing.checkout.waitingForBank"], "Waiting for your bank to confirm…");
  assert.equal(english["billing.checkout.willEmail"], "We'll email you as soon as your bank confirms.");
});

test("Romanian names the order button as Terms §12 requires", () => {
  // (DB-IP's verbatim credit is the footer's, in the chrome namespace since R3-4: P21 checks it in all 35 locales.)
  assert.equal(catalogue("ro")["billing.checkout.subscribeAndPay"], "Comandă cu obligație de plată");
  assert.equal(LOCALES.length, 35);
});

test("each sentence shown before a paid click names the money it moves (A7: the announced price, A12: the hold)", () => {
  const english = catalogue("en");
  // The upgrade's new monthly price is what the next renewal charges without a notice; it must be seen first.
  assert.match(english["billing.subscription.upgradeQuote"], /\{recurringTotal\}/);
  assert.match(english["billing.subscription.downgraded"], /\{total\}/);
  // Ruling Q-7: before a downgrade, the lower plan's net price from the plans list, "+ tax", and the date it starts.
  assert.match(english["billing.subscription.downgradeConfirm"], /\{price\}.*\+ tax.*\{date\}/u);
  // Spec §1.3: "$20.00 + $4.20 VAT (21%, Romania)" — the tax amount, not only its rate.
  assert.match(english["billing.checkout.taxLabel"], /\{tax\}/);
  assert.match(english["billing.card.holdNote"], /\{amount\}/);
});

test("each refusal D6b's routes answer is worded as the server means it, in English exactly", () => {
  const english = catalogue("en");
  const expected = {
    // UPGRADE_IN_PROGRESS (409): an earlier upgrade's payment has no outcome yet.
    "billing.subscription.upgradeInProgress": "Your last upgrade payment is still being confirmed. Please wait a few minutes and try again.",
    // UPGRADE_NOT_AVAILABLE_NOW (409): inside the renewal's lead, or too little of the period is left to price.
    "billing.subscription.upgradeNotAvailableNow": "Your plan is about to renew, so an upgrade can't start right now. You can upgrade as soon as the renewal has gone through.",
    "billing.subscription.upgradeNotHigher": "That plan isn't higher than your current plan. To move to a lower plan, choose it for your next renewal.",
    "billing.subscription.downgradeNotLower": "That plan isn't lower than your current plan.",
    // DOWNGRADE_NOT_AVAILABLE_NOW (409): the renewal charge for the next period is already written at the current plan.
    "billing.subscription.downgradeNotAvailableNow": "Your plan is renewing right now, so a change can't be scheduled yet. You can change it as soon as the renewal has gone through.",
    "billing.subscription.withdrawWindowClosed": "The 14-day withdrawal period has ended, or it doesn't apply where you live. You can still cancel at any time.",
    // STEP_UP_REQUIRED (403): the grant expired or was used; the password and code were right.
    "billing.subscription.stepUpExpired": "Please confirm it's you again: that confirmation expired or was already used.",
    "billing.checkout.erasurePending": "Your account is scheduled for deletion. Cancel the deletion in Settings to subscribe or change your plan.",
    // CARD_CHANGE_NOT_AVAILABLE_NOW (409) and FAILED(CARD_CHECK_DEFERRED): a payment on the plan is still open, so
    // the new card is not saved and the hold is released; never worded as success.
    "billing.card.tryAgainShortly": "We couldn't save your new card just now because a payment on your plan is still being confirmed. Your current card stays in use; please try again in an hour.",
    // LEGAL_REACCEPTANCE_REQUIRED (403) from the checkout, and from D6b's upgrade, downgrade, undo and card routes.
    "billing.checkout.reacceptRequired": "Please accept the updated Terms first, then come back to this page.",
    // W10 (P2-M19): 429 ADMISSION_RATE_LIMITED, the hourly budgets of quotes, checkouts, plan changes, card changes
    // and the cancel link.
    "billing.checkout.rateLimited": "Too many tries in the last hour. Please try again later.",
    // W10 (P2-M18): 409 NOTHING_TO_CANCEL from the emailed cancel link; nothing was cancelled.
    "billing.cancelPage.nothingToCancel": "This link didn't cancel anything. Check your plan in Settings."
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(english[key], value, key);
  // None of them may blame the password: only a refused step-up asks to check it (billing.subscription.withdrawRefused).
  for (const key of Object.keys(expected)) assert.doesNotMatch(english[key], /password|code/iu, key);
});

test("each plan carries one name in every locale: the billing pages', /new's and the emails' (P17 ruling (c)1)", () => {
  const mailRoot = join(root, "../../packages/mail-templates/messages");
  for (const { code } of LOCALES) {
    const billing = catalogue(code);
    const newDebate = JSON.parse(source(`messages/${code}/newDebate.json`));
    const mail = JSON.parse(readFileSync(join(mailRoot, code, "mail.json"), "utf8"));
    for (const plan of ["FREE", "PLUS", "PRO", "MAX"]) {
      const name = billing[`billing.plans.${plan}.name`];
      assert.equal(name, mail[`mail.plan.${plan}`], `${code}: billing.plans.${plan}.name = mail.plan.${plan}`);
      assert.ok(newDebate[`newDebate.plan.current.${plan}`].endsWith(name), `${code}: newDebate.plan.current.${plan} names ${name}`);
    }
  }
});
