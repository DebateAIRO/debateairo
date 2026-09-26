import type { ReactNode } from "react";
import chromeEnglish from "../../../apps/ui/messages/en/chrome.json" with { type: "json" };
import debateViewsEnglish from "../../../apps/ui/messages/en/debateViews.json" with { type: "json" };

const catalog = Object.freeze({ ...chromeEnglish, ...debateViewsEnglish });

export function I18nProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useChromeI18n() {
  return Object.freeze({ locale: "en" as const, catalog });
}
