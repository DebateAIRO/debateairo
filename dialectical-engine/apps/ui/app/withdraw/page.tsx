import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { billingPageFooter } from "@/lib/billing/footerBilling";
import { billingIsOn } from "@/lib/billing/serverBilling";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { COMPANY } from "@/lib/legal/pages";

/** The model withdrawal form's lines, in order: the same lines the confirmation email attaches. */
const FORM_LINES = ["instruction", "to", "notice", "orderedOn", "name", "address", "signature", "date"] as const;

/**
 * A step's sentence with the button's label set apart as a label, not a control: the label is the very text the
 * Settings button carries, read from the same key, so the page and the button never disagree.
 */
function stepWithLabel(catalog: MessageCatalog, key: string, placeholder: string, label: string): ReactNode {
  const [before, ...after] = t(catalog, key).split(`{${placeholder}}`);
  if (after.length === 0) return before;
  return <>{before}<span className="withdrawLabel">{label}</span>{after.join(label)}</>;
}

/**
 * /withdraw tells anyone, signed in or not, how to withdraw: the two steps in Settings with the buttons' own labels,
 * the email route and the model withdrawal form. It takes no withdrawal itself. Not found while billing is off, like
 * /pricing.
 */
export default async function WithdrawPage() {
  if (!(await billingIsOn())) notFound();
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const billingCatalog = await loadNamespace(locale, "billing");
  const company = { merchantName: COMPANY.legalName, merchantAddress: COMPANY.registeredOffice, merchantEmail: COMPANY.emails.general };
  return (
    <div className="screen scroll billingPage">
      <div className="billingInner narrow">
        <h1 className="setTitle">{t(billingCatalog, "billing.withdrawPage.title")}</h1>
        <p>{t(billingCatalog, "billing.withdrawPage.who")}</p>
        <p>{t(billingCatalog, "billing.withdrawPage.refund")}</p>
        <p>{t(billingCatalog, "billing.withdrawPage.intro")}</p>
        <h2 className="setSubtitle">{t(billingCatalog, "billing.withdrawPage.onlineTitle")}</h2>
        <ol className="withdrawSteps" data-withdraw-steps>
          <li>{stepWithLabel(billingCatalog, "billing.withdrawPage.step1", "withdraw", t(billingCatalog, "billing.subscription.withdraw"))}</li>
          <li>{stepWithLabel(billingCatalog, "billing.withdrawPage.step2", "confirm", t(billingCatalog, "billing.subscription.withdrawConfirm"))}</li>
        </ol>
        <p data-withdraw-after-confirm>{t(billingCatalog, "billing.withdrawPage.afterConfirm")}</p>
        <div className="billingActions">
          <a className="btn btnDark" href={`/login?next=${encodeURIComponent("/settings")}`}>{t(billingCatalog, "billing.withdrawPage.signIn")}</a>
          <a className="btn" href="/settings">{t(billingCatalog, "billing.withdrawPage.settings")}</a>
        </div>
        <h2 className="setSubtitle">{t(billingCatalog, "billing.withdrawPage.byEmailTitle")}</h2>
        <p data-withdraw-by-email>{t(billingCatalog, "billing.withdrawPage.byEmail", { email: COMPANY.emails.general })}</p>
        <p data-withdraw-in-time>{t(billingCatalog, "billing.withdrawPage.inTime")}</p>
        <h2 className="setSubtitle">{t(billingCatalog, "billing.withdrawPage.formTitle")}</h2>
        <div className="withdrawForm" data-withdraw-form>
          {FORM_LINES.map((line) => <p key={line}>{t(billingCatalog, `billing.withdrawPage.form.${line}`, company)}</p>)}
        </div>
      </div>
      <SiteFooter variant="full" billing={billingPageFooter()} />
    </div>
  );
}
