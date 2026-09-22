import type { ReactNode } from "react";
import { aiNoticeCopy } from "@/lib/aiDisclosure";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

export function AiNotice({
  variant = "strip", body, language = "en", catalog
}: {
  variant?: "strip" | "pill" | "block" | "banner";
  body?: ReactNode;
  language?: "en" | "ro";
  catalog?: MessageCatalog;
}) {
  const supportRomanian = variant === "banner" && language === "ro";
  const notice = aiNoticeCopy(catalog);
  const copy = body ?? (supportRomanian
    ? "Răspunsurile sunt generate de AI, marcate într-un format citibil automat și pot fi greșite. Poți cere să vorbești cu o persoană oricând."
    : notice[variant]);
  return (
    <section className={`aiNotice aiNotice--${variant}`} aria-label={t(catalog, variant === "block" ? "chrome.aiTransparency" : "home.aiDisclosure")}>
      {variant === "block" ? <h2>{t(catalog, "home.aiTransparency")}</h2> : <span className="aiNoticeBadge" aria-hidden="true">AI</span>}
      <p>
        {variant === "banner" ? <><strong>{supportRomanian
          ? "Această conversație este cu un asistent de suport AI."
          : t(catalog, "home.aiSupportLead")}</strong>{" "}</> : null}
        {copy}
        {variant === "strip" || variant === "block" ? <>{" "}<a
          href="/ai-transparency" target="_blank" rel="noopener noreferrer"
          aria-label={t(catalog, "home.aiLinkLabel")}
        >{t(catalog, "home.aiLink")}</a></> : null}
      </p>
    </section>
  );
}
