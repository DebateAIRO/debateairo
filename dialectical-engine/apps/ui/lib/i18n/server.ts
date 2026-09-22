import "server-only";

import { DEFAULT_LOCALE, isLocale, type LocaleCode } from "./locales";
import type { I18nNamespace } from "./I18nProvider";
import type { MessageCatalog } from "./translate";

type CatalogModule = Readonly<{ default: MessageCatalog }>;
type CatalogLoader = () => Promise<CatalogModule>;

const LOADERS: Readonly<Record<LocaleCode, Readonly<Record<I18nNamespace, CatalogLoader>>>> = Object.freeze({
  bg: Object.freeze({
    chrome: () => import("../../messages/bg/chrome.json"),
    home: () => import("../../messages/bg/home.json"),
    newDebate: () => import("../../messages/bg/newDebate.json"),
    time: () => import("../../messages/bg/time.json")
  }),
  hr: Object.freeze({
    chrome: () => import("../../messages/hr/chrome.json"),
    home: () => import("../../messages/hr/home.json"),
    newDebate: () => import("../../messages/hr/newDebate.json"),
    time: () => import("../../messages/hr/time.json")
  }),
  cs: Object.freeze({
    chrome: () => import("../../messages/cs/chrome.json"),
    home: () => import("../../messages/cs/home.json"),
    newDebate: () => import("../../messages/cs/newDebate.json"),
    time: () => import("../../messages/cs/time.json")
  }),
  da: Object.freeze({
    chrome: () => import("../../messages/da/chrome.json"),
    home: () => import("../../messages/da/home.json"),
    newDebate: () => import("../../messages/da/newDebate.json"),
    time: () => import("../../messages/da/time.json")
  }),
  nl: Object.freeze({
    chrome: () => import("../../messages/nl/chrome.json"),
    home: () => import("../../messages/nl/home.json"),
    newDebate: () => import("../../messages/nl/newDebate.json"),
    time: () => import("../../messages/nl/time.json")
  }),
  en: Object.freeze({
    chrome: () => import("../../messages/en/chrome.json"),
    home: () => import("../../messages/en/home.json"),
    newDebate: () => import("../../messages/en/newDebate.json"),
    time: () => import("../../messages/en/time.json")
  }),
  et: Object.freeze({
    chrome: () => import("../../messages/et/chrome.json"),
    home: () => import("../../messages/et/home.json"),
    newDebate: () => import("../../messages/et/newDebate.json"),
    time: () => import("../../messages/et/time.json")
  }),
  fi: Object.freeze({
    chrome: () => import("../../messages/fi/chrome.json"),
    home: () => import("../../messages/fi/home.json"),
    newDebate: () => import("../../messages/fi/newDebate.json"),
    time: () => import("../../messages/fi/time.json")
  }),
  fr: Object.freeze({
    chrome: () => import("../../messages/fr/chrome.json"),
    home: () => import("../../messages/fr/home.json"),
    newDebate: () => import("../../messages/fr/newDebate.json"),
    time: () => import("../../messages/fr/time.json")
  }),
  de: Object.freeze({
    chrome: () => import("../../messages/de/chrome.json"),
    home: () => import("../../messages/de/home.json"),
    newDebate: () => import("../../messages/de/newDebate.json"),
    time: () => import("../../messages/de/time.json")
  }),
  el: Object.freeze({
    chrome: () => import("../../messages/el/chrome.json"),
    home: () => import("../../messages/el/home.json"),
    newDebate: () => import("../../messages/el/newDebate.json"),
    time: () => import("../../messages/el/time.json")
  }),
  hu: Object.freeze({
    chrome: () => import("../../messages/hu/chrome.json"),
    home: () => import("../../messages/hu/home.json"),
    newDebate: () => import("../../messages/hu/newDebate.json"),
    time: () => import("../../messages/hu/time.json")
  }),
  ga: Object.freeze({
    chrome: () => import("../../messages/ga/chrome.json"),
    home: () => import("../../messages/ga/home.json"),
    newDebate: () => import("../../messages/ga/newDebate.json"),
    time: () => import("../../messages/ga/time.json")
  }),
  it: Object.freeze({
    chrome: () => import("../../messages/it/chrome.json"),
    home: () => import("../../messages/it/home.json"),
    newDebate: () => import("../../messages/it/newDebate.json"),
    time: () => import("../../messages/it/time.json")
  }),
  lv: Object.freeze({
    chrome: () => import("../../messages/lv/chrome.json"),
    home: () => import("../../messages/lv/home.json"),
    newDebate: () => import("../../messages/lv/newDebate.json"),
    time: () => import("../../messages/lv/time.json")
  }),
  lt: Object.freeze({
    chrome: () => import("../../messages/lt/chrome.json"),
    home: () => import("../../messages/lt/home.json"),
    newDebate: () => import("../../messages/lt/newDebate.json"),
    time: () => import("../../messages/lt/time.json")
  }),
  mt: Object.freeze({
    chrome: () => import("../../messages/mt/chrome.json"),
    home: () => import("../../messages/mt/home.json"),
    newDebate: () => import("../../messages/mt/newDebate.json"),
    time: () => import("../../messages/mt/time.json")
  }),
  pl: Object.freeze({
    chrome: () => import("../../messages/pl/chrome.json"),
    home: () => import("../../messages/pl/home.json"),
    newDebate: () => import("../../messages/pl/newDebate.json"),
    time: () => import("../../messages/pl/time.json")
  }),
  pt: Object.freeze({
    chrome: () => import("../../messages/pt/chrome.json"),
    home: () => import("../../messages/pt/home.json"),
    newDebate: () => import("../../messages/pt/newDebate.json"),
    time: () => import("../../messages/pt/time.json")
  }),
  ro: Object.freeze({
    chrome: () => import("../../messages/ro/chrome.json"),
    home: () => import("../../messages/ro/home.json"),
    newDebate: () => import("../../messages/ro/newDebate.json"),
    time: () => import("../../messages/ro/time.json")
  }),
  ru: Object.freeze({
    chrome: () => import("../../messages/ru/chrome.json"),
    home: () => import("../../messages/ru/home.json"),
    newDebate: () => import("../../messages/ru/newDebate.json"),
    time: () => import("../../messages/ru/time.json")
  }),
  sk: Object.freeze({
    chrome: () => import("../../messages/sk/chrome.json"),
    home: () => import("../../messages/sk/home.json"),
    newDebate: () => import("../../messages/sk/newDebate.json"),
    time: () => import("../../messages/sk/time.json")
  }),
  sl: Object.freeze({
    chrome: () => import("../../messages/sl/chrome.json"),
    home: () => import("../../messages/sl/home.json"),
    newDebate: () => import("../../messages/sl/newDebate.json"),
    time: () => import("../../messages/sl/time.json")
  }),
  es: Object.freeze({
    chrome: () => import("../../messages/es/chrome.json"),
    home: () => import("../../messages/es/home.json"),
    newDebate: () => import("../../messages/es/newDebate.json"),
    time: () => import("../../messages/es/time.json")
  }),
  sv: Object.freeze({
    chrome: () => import("../../messages/sv/chrome.json"),
    home: () => import("../../messages/sv/home.json"),
    newDebate: () => import("../../messages/sv/newDebate.json"),
    time: () => import("../../messages/sv/time.json")
  }),
  uk: Object.freeze({
    chrome: () => import("../../messages/uk/chrome.json"),
    home: () => import("../../messages/uk/home.json"),
    newDebate: () => import("../../messages/uk/newDebate.json"),
    time: () => import("../../messages/uk/time.json")
  }),
  zh: Object.freeze({
    chrome: () => import("../../messages/zh/chrome.json"),
    home: () => import("../../messages/zh/home.json"),
    newDebate: () => import("../../messages/zh/newDebate.json"),
    time: () => import("../../messages/zh/time.json")
  }),
  hi: Object.freeze({
    chrome: () => import("../../messages/hi/chrome.json"),
    home: () => import("../../messages/hi/home.json"),
    newDebate: () => import("../../messages/hi/newDebate.json"),
    time: () => import("../../messages/hi/time.json")
  }),
  id: Object.freeze({
    chrome: () => import("../../messages/id/chrome.json"),
    home: () => import("../../messages/id/home.json"),
    newDebate: () => import("../../messages/id/newDebate.json"),
    time: () => import("../../messages/id/time.json")
  }),
  ja: Object.freeze({
    chrome: () => import("../../messages/ja/chrome.json"),
    home: () => import("../../messages/ja/home.json"),
    newDebate: () => import("../../messages/ja/newDebate.json"),
    time: () => import("../../messages/ja/time.json")
  }),
  ko: Object.freeze({
    chrome: () => import("../../messages/ko/chrome.json"),
    home: () => import("../../messages/ko/home.json"),
    newDebate: () => import("../../messages/ko/newDebate.json"),
    time: () => import("../../messages/ko/time.json")
  }),
  vi: Object.freeze({
    chrome: () => import("../../messages/vi/chrome.json"),
    home: () => import("../../messages/vi/home.json"),
    newDebate: () => import("../../messages/vi/newDebate.json"),
    time: () => import("../../messages/vi/time.json")
  }),
  ar: Object.freeze({
    chrome: () => import("../../messages/ar/chrome.json"),
    home: () => import("../../messages/ar/home.json"),
    newDebate: () => import("../../messages/ar/newDebate.json"),
    time: () => import("../../messages/ar/time.json")
  }),
  he: Object.freeze({
    chrome: () => import("../../messages/he/chrome.json"),
    home: () => import("../../messages/he/home.json"),
    newDebate: () => import("../../messages/he/newDebate.json"),
    time: () => import("../../messages/he/time.json")
  }),
  tr: Object.freeze({
    chrome: () => import("../../messages/tr/chrome.json"),
    home: () => import("../../messages/tr/home.json"),
    newDebate: () => import("../../messages/tr/newDebate.json"),
    time: () => import("../../messages/tr/time.json")
  })
});

export async function loadNamespace(
  locale: string,
  namespace: I18nNamespace
): Promise<MessageCatalog> {
  const selectedLocale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  try {
    return (await LOADERS[selectedLocale][namespace]()).default;
  } catch {
    return (await LOADERS[DEFAULT_LOCALE][namespace]()).default;
  }
}

