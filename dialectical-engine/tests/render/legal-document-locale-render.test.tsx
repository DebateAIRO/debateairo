// @vitest-environment jsdom

import { createContext, useContext, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";
import type { LegalDocument } from "../../apps/ui/lib/legalDocument.js";
import consentEnglish from "../../apps/ui/messages/en/consent.json" with { type: "json" };
import consentJapanese from "../../apps/ui/messages/ja/consent.json" with { type: "json" };

const I18nTestContext = createContext<Readonly<{
  locale: LocaleCode;
  catalog: MessageCatalog;
}> | null>(null);

vi.mock("@/lib/i18n/I18nProvider", () => ({
  I18nProvider({ locale, catalog, children }: Readonly<{
    locale: LocaleCode;
    catalog: MessageCatalog;
    children: ReactNode;
  }>) {
    return <I18nTestContext.Provider value={{ locale, catalog }}>{children}</I18nTestContext.Provider>;
  },
  useChromeI18n() {
    const context = useContext(I18nTestContext);
    if (context === null) throw new Error("Missing test I18nProvider");
    return context;
  }
}));

import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { LegalDocumentsProvider } from "../../apps/ui/components/consent/LegalDocumentsProvider.js";
import { PrivacyPolicyModal } from "../../apps/ui/components/consent/PrivacyPolicyModal.js";
import { TermsOfServiceModal } from "../../apps/ui/components/consent/TermsOfServiceModal.js";
// FIX-DEBATE-CATALOGS follow-up 3: the root layout serves the locale's consent
// catalogue next to the legal documents, so a non-English mount carries it the
// way the app does (the hook no longer paints English while a chunk loads).
import { ConsentCatalogProvider } from "../../apps/ui/components/consent/useConsentCatalog.js";

const localizedPrivacy: LegalDocument = {
  key: "privacy",
  eyebrow: "プライバシー",
  title: "保存する情報",
  lede: "日本語の説明",
  endMarker: "終了",
  contact: "privacy@dezbatere.ro",
  bodyLabel: "プライバシー本文",
  sectionIdPrefix: "policy-section-",
  titleId: "policy-modal-title",
  gateHintId: "policy-modal-gate-hint",
  jumps: [{ label: "管理者", target: "policy-section-01" }],
  sections: [{
    no: "01",
    title: "データ管理者",
    accent: "--ok-dot",
    blocks: [{ kind: "p", text: "ローカライズされた本文" }]
  }]
};

const localizedTerms: LegalDocument = {
  ...localizedPrivacy,
  key: "terms",
  eyebrow: "利用規約",
  title: "同意事項",
  contact: "[legal@dezbatere.ro]",
  bodyLabel: "利用規約本文",
  sectionIdPrefix: "terms-section-",
  titleId: "terms-modal-title",
  gateHintId: "terms-modal-gate-hint",
  jumps: [{ label: "運営者", target: "terms-section-01" }]
};

let root: Root;
let container: HTMLDivElement;

async function render(children: ReactNode): Promise<void> {
  await act(async () => {
    root.render(children);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("legal documents follow the interface locale", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the provider's Japanese section title and jump label", async () => {
    await render(
      <I18nProvider locale="ja" catalog={consentEnglish}>
        <ConsentCatalogProvider catalog={consentJapanese}>
          <LegalDocumentsProvider
            locale="ja"
            privacy={localizedPrivacy}
            terms={localizedTerms}
          >
            <PrivacyPolicyModal open mode="read" onClose={vi.fn()} />
          </LegalDocumentsProvider>
        </ConsentCatalogProvider>
      </I18nProvider>
    );

    expect(container.textContent).toContain("データ管理者");
    expect(container.textContent).toContain("管理者");
    // One source for the policy header: the privacy modal is the Terms twin over
    // LegalDocumentModal, so eyebrow, title, lede, end marker and body label come from the
    // localized document, never from a second copy in the consent catalogue.
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector(".policyEyebrow")?.textContent).toBe("プライバシー");
    expect(dialog.querySelector(".policyTitle")?.textContent).toBe("保存する情報");
    expect(dialog.querySelector(".policyLede")?.textContent).toBe("日本語の説明");
    expect(dialog.querySelector(".policyBody")?.lastElementChild?.textContent).toBe("終了");
    expect(dialog.querySelector(".policyBody")?.getAttribute("aria-label")).toBe("プライバシー本文");
  });

  it("falls back to English when no legal-document provider is present", async () => {
    await render(
      <I18nProvider locale="en" catalog={consentEnglish}>
        <PrivacyPolicyModal open mode="read" onClose={vi.fn()} />
      </I18nProvider>
    );

    expect(container.textContent).toContain("In short");
    expect(container.textContent).toContain("CONTROLLER");
  });

  it("inherits RTL direction without setting dir on the dialog", async () => {
    await render(
      <div dir="rtl">
        <I18nProvider locale="ja" catalog={consentEnglish}>
          <ConsentCatalogProvider catalog={consentJapanese}>
            <LegalDocumentsProvider
              locale="ja"
              privacy={localizedPrivacy}
              terms={localizedTerms}
            >
              <TermsOfServiceModal open mode="read" onClose={vi.fn()} />
            </LegalDocumentsProvider>
          </ConsentCatalogProvider>
        </I18nProvider>
      </div>
    );

    expect(container.querySelector('[role="dialog"]')?.hasAttribute("dir")).toBe(false);
  });
});
