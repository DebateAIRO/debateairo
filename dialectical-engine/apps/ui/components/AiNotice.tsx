import type { ReactNode } from "react";
import { aiNoticeCopy } from "@/lib/aiDisclosure";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

export function AiNotice({
  variant = "strip", body, catalog
}: {
  variant?: "strip" | "pill" | "block" | "banner";
  body?: ReactNode;
  catalog?: MessageCatalog;
}) {
  const notice = aiNoticeCopy(catalog);
  const copy = body ?? (variant === "banner"
    ? t(catalog,"support.bannerBody")
    : notice[variant]);
  return (
    <section className={`aiNotice aiNotice--${variant}`} aria-label={t(catalog, variant === "block" ? "chrome.aiTransparency" : "home.aiDisclosure")}>
      {variant === "block" ? <h2>{t(catalog, "home.aiTransparency")}</h2> : <span className="aiNoticeBadge" aria-hidden="true">AI</span>}
      <p>
        {variant === "banner" ? <><strong>{t(catalog,"support.bannerLead")}</strong>{" "}</> : null}
        {copy}
        {variant === "strip" || variant === "block" ? <>{" "}<a
          href="/ai-transparency" target="_blank" rel="noopener noreferrer"
          aria-label={t(catalog, "home.aiLinkLabel")}
        >{t(catalog, "home.aiLink")}</a></> : null}
      </p>
    </section>
  );
}
