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
  "components/billing/ChargeStatusPoller.tsx",
  "components/billing/CheckoutFlow.tsx", "app/checkout/page.tsx", "app/checkout/return/page.tsx",
  "components/billing/SubscriptionControls.tsx", "components/billing/CardChangeFlow.tsx", "app/settings/card/page.tsx",
  "components/billing/CancelFlow.tsx", "app/cancel/page.tsx", "app/withdraw/page.tsx",
  "components/billing/BillingDetailsFields.tsx"
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
  "billing.checkout.postalCode", "billing.checkout.city", "billing.checkout.county",
  "billing.checkout.billingTitle", "billing.checkout.billingNote", "billing.checkout.firstName", "billing.checkout.lastName",
  "billing.checkout.phone", "billing.checkout.street", "billing.checkout.postalCodeOptional", "billing.checkout.phoneInvalid",
  "billing.checkout.detailsRequired", "billing.checkout.upgradeSucceeded", "billing.subscription.upgradePay",
  "billing.card.checkCard", "billing.card.taxPlaceNote",
  "billing.checkout.companyToggle", "billing.checkout.companyName",
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
  "billing.subscription.cancelConfirmSuspended", "billing.subscription.wontRenew",
  "billing.subscription.cancelYes", "billing.subscription.keep",
  "billing.subscription.revoke", "billing.subscription.withdraw", "billing.subscription.withdrawHint",
  "billing.subscription.stepUpHint", "billing.subscription.password", "billing.subscription.code",
  "billing.subscription.stepUpExpired",
  "billing.subscription.withdrawConfirm", "billing.subscription.withdrawDone", "billing.subscription.withdrawRefused",
  "billing.subscription.withdrawNothingDue", "billing.subscription.withdrawOwnerReview",
  "billing.subscription.withdrawWindowClosed", "billing.subscription.stillConfirming",
  "billing.subscription.actionFailed", "billing.subscription.invoices", "billing.subscription.noInvoices",
  "billing.subscription.invoiceRow", "billing.subscription.creditNote", "billing.subscription.openInvoice",
  "billing.card.title", "billing.card.intro", "billing.card.noHoldNote", "billing.card.save",
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
  assert.equal(english["billing.consent.renewal"], "I agree that NETOPIA Payments keeps my card and that {total} is charged to it every month until I cancel. I can cancel at any time in Settings or at dezbatere.ro/cancel.");
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
  assert.match(english["billing.consent.renewal"], /\{total\}/);
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

test("a plan paused by a payment dispute is cancelled with true words, in English exactly (P2-W10)", () => {
  const english = catalogue("en");
  // Its paid features stay paused: no sentence may promise them until a date, or offer an undo the server refuses.
  assert.equal(english["billing.subscription.cancelConfirmSuspended"],
    "Cancel your plan? It won't renew. Its paid features stay paused while the payment dispute is open.");
  assert.equal(english["billing.subscription.wontRenew"], "Your plan won't renew. You won't be charged again.");
  for (const code of LOCALES.map(({ code: locale }) => locale)) {
    const billing = catalogue(code);
    for (const key of ["billing.subscription.cancelConfirmSuspended", "billing.subscription.wontRenew"]) {
      assert.doesNotMatch(billing[key], /\{date\}/u, `${code}: ${key} names no date`);
    }
  }
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

// Part 3b S4d (P3-M12 and P3-I2's text half; the owner's rulings of 3 October 2026): /pricing says what is true.
// A paid debate starts on Balanced (Balanced stays the paid default), so the paid line names the three strengths a
// paid person chooses from instead of promising "the best models"; Free runs on low-cost models chosen for the most
// value inside Free's own cost cap (S4b), not on "the cheapest models". The lines below are the retired wording of
// every locale, which no catalogue may show again.
const RETIRED_PLAN_LINES = {
  ar: ["مناظِران، أرخص النماذج، إعدادات ثابتة", "3 مناظرين، كل الإعدادات، أفضل النماذج"],
  bg: ["2 участници в дебата, най-евтините модели, фиксирани настройки", "3 участници в дебата, всички настройки, най-добрите модели"],
  cs: ["2 účastníci debaty, nejlevnější modely, pevné nastavení", "3 účastníci debaty, všechna nastavení, nejlepší modely"],
  da: ["2 debattører, de billigste modeller, faste indstillinger", "3 debattører, alle indstillinger, de bedste modeller"],
  de: ["2 Debattierende, die günstigsten Modelle, feste Einstellungen", "3 Debattierende, alle Einstellungen, die besten Modelle"],
  el: ["2 συμμετέχοντες στην αντιπαράθεση, τα φθηνότερα μοντέλα, σταθερές ρυθμίσεις", "3 συμμετέχοντες στην αντιπαράθεση, όλες οι ρυθμίσεις, τα καλύτερα μοντέλα"],
  en: ["2 debaters, the cheapest models, fixed settings", "3 debaters, all settings, the best models"],
  es: ["2 participantes en el debate, los modelos más económicos, ajustes fijos", "3 participantes en el debate, todos los ajustes, los mejores modelos"],
  et: ["2 väitlejat, kõige odavamad mudelid, fikseeritud seaded", "3 väitlejat, kõik seaded, parimad mudelid"],
  fi: ["2 väittelijää, edullisimmat mallit, kiinteät asetukset", "3 väittelijää, kaikki asetukset, parhaat mallit"],
  fr: ["2 débatteurs, les modèles les moins chers, des réglages fixes", "3 débatteurs, tous les réglages, les meilleurs modèles"],
  ga: ["2 dhíospóireoir, na samhlacha is saoire, socruithe seasta", "3 dhíospóireoir, gach socrú, na samhlacha is fearr"],
  he: ["2 משתתפים בדיון, המודלים הזולים ביותר, הגדרות קבועות", "3 משתתפים בדיון, כל ההגדרות, המודלים הטובים ביותר"],
  hi: ["2 वाद-विवादकर्ता, सबसे सस्ते मॉडल, तय सेटिंग्स", "3 वाद-विवादकर्ता, सभी सेटिंग्स, सबसे अच्छे मॉडल"],
  hr: ["2 sudionika rasprave, najjeftiniji modeli, fiksne postavke", "3 sudionika rasprave, sve postavke, najbolji modeli"],
  hu: ["2 vitázó, a legolcsóbb modellek, rögzített beállítások", "3 vitázó, minden beállítás, a legjobb modellek"],
  id: ["2 pendebat, model termurah, pengaturan tetap", "3 pendebat, semua pengaturan, model terbaik"],
  it: ["2 partecipanti al dibattito, i modelli più economici, impostazioni fisse", "3 partecipanti al dibattito, tutte le impostazioni, i modelli migliori"],
  ja: ["ディベーター 2 名、最も安価なモデル、固定設定", "ディベーター 3 名、すべての設定、最高のモデル"],
  ko: ["토론자 2명, 가장 저렴한 모델, 고정 설정", "토론자 3명, 모든 설정, 최고의 모델"],
  lt: ["2 debatų dalyviai, pigiausi modeliai, fiksuoti nustatymai", "3 debatų dalyviai, visi nustatymai, geriausi modeliai"],
  lv: ["2 debatētāji, lētākie modeļi, fiksēti iestatījumi", "3 debatētāji, visi iestatījumi, labākie modeļi"],
  mt: ["2 dibattenti, l-irħas mudelli, settings fissi", "3 dibattenti, is-settings kollha, l-aqwa mudelli"],
  nl: ["2 debaters, de goedkoopste modellen, vaste instellingen", "3 debaters, alle instellingen, de beste modellen"],
  pl: ["2 uczestników debaty, najtańsze modele, stałe ustawienia", "3 uczestników debaty, wszystkie ustawienia, najlepsze modele"],
  pt: ["2 debatedores, os modelos mais baratos, definições fixas", "3 debatedores, todas as definições, os melhores modelos"],
  ro: ["2 participanți la dezbatere, cele mai ieftine modele, setări fixe", "3 participanți la dezbatere, toate setările, cele mai bune modele"],
  ru: ["2 участника дебатов, самые дешёвые модели, фиксированные настройки", "3 участника дебатов, все настройки, лучшие модели"],
  sk: ["2 účastníci debaty, najlacnejšie modely, pevné nastavenia", "3 účastníci debaty, všetky nastavenia, najlepšie modely"],
  sl: ["2 udeleženca razprave, najcenejši modeli, fiksne nastavitve", "3 udeleženci razprave, vse nastavitve, najboljši modeli"],
  sv: ["2 debattörer, de billigaste modellerna, fasta inställningar", "3 debattörer, alla inställningar, de bästa modellerna"],
  tr: ["2 tartışmacı, en ucuz modeller, sabit ayarlar", "3 tartışmacı, tüm ayarlar, en iyi modeller"],
  uk: ["2 учасники дебатів, найдешевші моделі, фіксовані налаштування", "3 учасники дебатів, усі налаштування, найкращі моделі"],
  vi: ["2 người tranh luận, các mô hình rẻ nhất, cài đặt cố định", "3 người tranh luận, mọi cài đặt, các mô hình tốt nhất"],
  zh: ["2 位辩手，最经济的模型，固定设置", "3 位辩手，全部设置，最好的模型"],
};

test("/pricing's plan lines say what is true: Free's low-cost models, and the paid choice of strengths (S4d)", () => {
  const english = catalogue("en");
  assert.equal(english["billing.pricing.freeFeatures"], "2 debaters, carefully chosen low-cost models, fixed settings");
  assert.equal(english["billing.pricing.paidFeatures"], "3 debaters, all settings, and your pick of Best, Balanced or Economy models for each debate");
  assert.deepEqual(Object.keys(RETIRED_PLAN_LINES).sort(), LOCALES.map(({ code }) => code).sort());
  for (const { code } of LOCALES) {
    const billing = catalogue(code);
    const newDebate = JSON.parse(source(`messages/${code}/newDebate.json`));
    const [retiredFree, retiredPaid] = RETIRED_PLAN_LINES[code];
    assert.notEqual(billing["billing.pricing.freeFeatures"], retiredFree, `${code}: Free's line no longer promises the cheapest models`);
    assert.notEqual(billing["billing.pricing.paidFeatures"], retiredPaid, `${code}: the paid line no longer promises the best models`);
    // The paid line names the strengths with the very labels of /new's Model strength chooser.
    for (const strength of ["Best", "Balanced", "Economy"]) {
      const label = newDebate[`newDebate.modelStrength${strength}`];
      assert.ok(billing["billing.pricing.paidFeatures"].includes(label), `${code}: the paid line names ${strength} as /new does (${label})`);
    }
  }
});

// N20 (spec 2026-10-05 §2.18, §2.22): the card processor is NETOPIA Payments in every locale, and the card-saving
// agreement names it with the monthly total; nothing a customer reads names the previous card processor or a hold.
const PREVIOUS_PROCESSOR = new RegExp(["x", "money"].join(""), "iu");
test("every locale names NETOPIA Payments where it names the card processor, and never the previous one", () => {
  const english = catalogue("en");
  assert.equal(english["billing.checkout.cardNote"], "You pay on NETOPIA Payments' secure page. Your card number never reaches our servers.");
  assert.equal(english["billing.checkout.continueToCard"], "Continue to payment");
  assert.equal(english["billing.checkout.formUnavailable"], "The payment page could not be opened. Please try again in a minute.");
  assert.equal(catalogue("ro")["billing.checkout.continueToCard"], "Comandă cu obligație de plată");
  assert.equal(english["billing.card.countryRefused"], "We can't accept cards issued in that card's country. Nothing was charged, and your plan keeps the card it had.");
  assert.equal(catalogue("ro")["billing.card.countryRefused"], "Nu putem accepta carduri emise în țara acestui card. Nu s-a încasat nimic, iar abonamentul dvs. păstrează cardul pe care îl avea.");
  for (const { code } of LOCALES) {
    const billing = catalogue(code);
    const legal = JSON.parse(source(`messages/${code}/legal.json`));
    for (const key of ["billing.checkout.cardNote", "billing.consent.renewal"]) {
      assert.ok(billing[key].includes("NETOPIA Payments"), `${code}: ${key} names NETOPIA Payments`);
    }
    assert.ok(legal["legal.notice.s04.payments"].includes("NETOPIA Payments"), `${code}: legal.notice.s04.payments`);
    assert.ok(billing["billing.consent.renewal"].includes("dezbatere.ro/cancel"), `${code}: the cancel address`);
    assert.equal(Object.hasOwn(billing, "billing.card.holdNote"), false, `${code}: no hold sentence`);
    for (const [key, value] of [...Object.entries(billing), ...Object.entries(legal)]) {
      assert.doesNotMatch(value, PREVIOUS_PROCESSOR, `${code}: ${key}`);
    }
  }
});
