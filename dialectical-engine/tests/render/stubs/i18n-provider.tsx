import type { ReactNode } from "react";
import chromeEnglish from "../../../apps/ui/messages/en/chrome.json" with { type: "json" };

export function I18nProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useChromeI18n() {
  return Object.freeze({ locale: "en" as const, catalog: chromeEnglish });
}
