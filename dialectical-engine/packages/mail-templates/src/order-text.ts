import { MAIL_LOCALES, mailLocaleOf, type MailLocale } from "./locales.js";
import { MailTemplateError, mailMessagesDirectory, readStringTable } from "./render.js";

/**
 * The sentences billing writes where a person or a tax document reads them (D6a's `BillingOrderText` port): the
 * xMoney order line (spec §2.5.3 step 5), the card check's order line (A12) and the one invoice line (P10). They
 * live in messages/<locale>/order.json (English authoritative) and are read on the first call, never at import.
 */
export const ORDER_TEXT_KINDS = Object.freeze(["ORDER_PLAN", "CARD_CHECK", "INVOICE_LINE"] as const);
export type OrderTextKindId = (typeof ORDER_TEXT_KINDS)[number];

type OrderTextTemplate = Readonly<{ key: string; params: readonly string[] }>;

/** ORDER_PLAN `{plan}`; CARD_CHECK nothing; INVOICE_LINE `{plan, from, to}`, the dates already worded by the caller. */
const ORDER_TEXT_TEMPLATES: Readonly<Record<OrderTextKindId, OrderTextTemplate>> = Object.freeze({
  ORDER_PLAN: Object.freeze({ key: "order.planDescription", params: Object.freeze(["plan"]) }),
  CARD_CHECK: Object.freeze({ key: "order.cardCheck", params: Object.freeze([]) }),
  INVOICE_LINE: Object.freeze({ key: "invoice.line", params: Object.freeze(["plan", "from", "to"]) })
});

type Catalogue = Readonly<Record<string, string>>;

export function loadOrderCatalogues(directory: string = mailMessagesDirectory()): Readonly<Record<MailLocale, Catalogue>> {
  return Object.freeze(Object.fromEntries(
    MAIL_LOCALES.map((locale) => [locale, readStringTable(directory, `${locale}/order.json`)])
  )) as Readonly<Record<MailLocale, Catalogue>>;
}

let loaded: Readonly<Record<MailLocale, Catalogue>> | null = null;

/**
 * One order or invoice sentence in the buyer's locale (an unknown locale reads English). Every param is one short
 * line: the order line is signed into xMoney's payload and the invoice line goes on a tax document, so a line break
 * or a control character is refused, with a code that names the param and never its value.
 */
export function renderOrderText(kind: OrderTextKindId, locale: string, params: Readonly<Record<string, string>>): string {
  const template = (ORDER_TEXT_TEMPLATES as Readonly<Record<string, OrderTextTemplate | undefined>>)[kind];
  if (template === undefined) throw new MailTemplateError("MAIL_TEMPLATE_UNKNOWN");
  for (const name of Object.keys(params)) {
    if (!template.params.includes(name)) throw new MailTemplateError("MAIL_TEMPLATE_PARAM_UNKNOWN", name);
  }
  for (const name of template.params) {
    const value = params[name];
    if (value === undefined) throw new MailTemplateError("MAIL_TEMPLATE_PARAM_MISSING", name);
    if (value.trim() === "" || value.length > 80 || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new MailTemplateError("MAIL_TEMPLATE_PARAM_INVALID", name);
    }
  }
  if (loaded === null) loaded = loadOrderCatalogues();
  const sentence = loaded[mailLocaleOf(locale)][template.key] ?? loaded.en[template.key];
  if (sentence === undefined) throw new MailTemplateError("MAIL_TEMPLATE_CATALOGUE_INVALID", template.key);
  return sentence.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu, (_placeholder, name: string) => {
    const value = params[name];
    if (value === undefined) throw new MailTemplateError("MAIL_TEMPLATE_CATALOGUE_INVALID", `${template.key}:${name}`);
    return value;
  });
}
