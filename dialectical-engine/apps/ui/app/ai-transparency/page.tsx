import type { Metadata } from "next";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";

const AI_GENERATED_MARKING = 'data-ai-generated="true"';
const AUTOMATED_ORIGIN_MARKING = 'data-content-origin="automated"';
const AI_DISCLOSURE_FIELD = "ai_disclosure";
const DEBATEAI_BRAND = "DebateAI";
const PRODUCT_NAME = "Dialectical Engine";

async function settingsCatalog() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  return loadNamespace(locale, "settings");
}

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await settingsCatalog();
  return {
    title: t(catalog, "settings.transparency.metadataTitle", { product: PRODUCT_NAME }),
    description: t(catalog, "settings.transparency.metadataDescription", { brand: DEBATEAI_BRAND })
  };
}

export default async function AiTransparencyPage() {
  const catalog = await settingsCatalog();
  return (
    <main className="screen scroll aiTransparencyPage">
      <article>
        <p className="libEyebrow">{t(catalog, "settings.transparency.eyebrow")}</p>
        <h1>{t(catalog, "settings.transparency.title")}</h1>
        <p>{t(catalog, "settings.transparency.notice", { brand: DEBATEAI_BRAND })}</p>
        <h2>{t(catalog, "settings.transparency.readCriticallyTitle")}</h2>
        <p>{t(catalog, "settings.transparency.readCriticallyBody")}</p>
        <h2>{t(catalog, "settings.transparency.visibleLabelsTitle")}</h2>
        <p>{t(catalog, "settings.transparency.visibleLabelsBody")}</p>
        <h2>{t(catalog, "settings.transparency.machineReadableTitle")}</h2>
        <p>
          {t(catalog, "settings.transparency.machineReadableLead")}{" "}
          <code>{AI_GENERATED_MARKING}</code>.
          {" "}{t(catalog, "settings.transparency.machineReadableMiddle")}{" "}
          <code>{AUTOMATED_ORIGIN_MARKING}</code>{" "}
          {t(catalog, "settings.transparency.machineReadableTail")}
        </p>
        <p>
          {t(catalog, "settings.transparency.downloadsLead")}{" "}
          <code>{AI_DISCLOSURE_FIELD}</code>{" "}
          {t(catalog, "settings.transparency.downloadsTail")}
        </p>
        <p>{t(catalog, "settings.transparency.markingsLimit")}</p>
        <h2>{t(catalog, "settings.transparency.supportTitle")}</h2>
        <p>
          {t(catalog, "settings.transparency.supportLead")}{" "}
          <a href="/help">{t(catalog, "settings.transparency.help")}</a>{" "}
          {t(catalog, "settings.transparency.supportTail")}
        </p>
        <a className="btn" href="/">
          {t(catalog, "settings.transparency.back", { brand: DEBATEAI_BRAND })}
        </a>
      </article>
    </main>
  );
}
