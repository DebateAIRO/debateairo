"use client";

import type { ReactNode, ReactElement } from "react";
import { CrisisHelpNumbers } from "../CrisisSupport.js";
import { useChromeI18n } from "../../lib/i18n/I18nProvider";
import { t } from "../../lib/i18n/translate";
import { useSupportOffered } from "./availability.js";

export function HelpSupport({ chat }: Readonly<{ chat: ReactNode }>): ReactElement | null {
  const { catalog, locale } = useChromeI18n();
  const offered = useSupportOffered();
  if (offered === "unknown") return null;
  if (offered === "offered") return <>{chat}</>;
  if (offered === "not-offered") {
    return <p className="supportCountryUnavailable" role="status">{t(catalog, "support.countryUnavailable")}</p>;
  }
  return <>
    <p className="supportHelpUnavailable" role="status">{t(catalog, "support.helpUnavailable")}</p>
    <div className="supportHelpNumbers">
      <CrisisHelpNumbers catalog={catalog} locale={locale} countryHint={null} />
    </div>
  </>;
}
