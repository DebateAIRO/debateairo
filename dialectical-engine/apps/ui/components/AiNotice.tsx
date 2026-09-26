import type { ReactNode } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * The shared AI notice. Its copy lives in `home` (plus `chrome.aiTransparency`
 * for the block's label), so the catalogue handed in must carry those keys:
 * the home page and landing pass home + chrome, the debate workspace passes the
 * locale's home merged with the shared chrome catalogue (FIX-DEBATE-CATALOGS
 * follow-up 4, review F1). Each variant reads only its own sentence.
 */
const VARIANT_KEYS = {
  strip: "home.aiStrip",
  pill: "home.aiPill",
  block: "home.aiBlock"
} as const;

export function AiNotice({
  variant = "strip", body, catalog
}: {
  variant?: "strip" | "pill" | "block";
  body?: ReactNode;
  catalog?: MessageCatalog;
}) {
  const copy = body ?? t(catalog, VARIANT_KEYS[variant]);
  return (
    <section className={`aiNotice aiNotice--${variant}`} aria-label={t(catalog, variant === "block" ? "chrome.aiTransparency" : "home.aiDisclosure")}>
      {variant === "block" ? <h2>{t(catalog, "home.aiTransparency")}</h2> : <span className="aiNoticeBadge" aria-hidden="true">AI</span>}
      <p>
        {copy}
        {variant === "strip" || variant === "block" ? <>{" "}<a
          href="/ai-transparency" target="_blank" rel="noopener noreferrer"
          aria-label={t(catalog, "home.aiLinkLabel")}
        >{t(catalog, "home.aiLink")}</a></> : null}
      </p>
    </section>
  );
}

/**
 * The support surfaces' AI banner (widget and /help). It reads `support` keys
 * only, because those surfaces carry the shared chrome + debateViews + support
 * catalogue, which has no `home`; its label used to be `home.aiDisclosure` and
 * so read English through t()'s backstop (review F1/F4).
 */
export function AiBanner({ catalog }: { catalog?: MessageCatalog }) {
  return (
    <section className="aiNotice aiNotice--banner" aria-label={t(catalog, "support.aiDisclosure")}>
      <span className="aiNoticeBadge" aria-hidden="true">AI</span>
      <p>
        <strong>{t(catalog, "support.bannerLead")}</strong>{" "}
        {t(catalog, "support.aiBanner")}
      </p>
    </section>
  );
}
