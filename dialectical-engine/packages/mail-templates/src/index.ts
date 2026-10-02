export { MAIL_LOCALES, mailDirectionOf, mailLocaleOf, type MailLocale } from "./locales.js";
export { ORDER_TEXT_KINDS, loadOrderCatalogues, renderOrderText, type OrderTextKindId } from "./order-text.js";
export {
  MAIL_ATTACHMENT_FACTS,
  MAIL_TEMPLATES,
  MAIL_TEMPLATE_IDS,
  RESERVED_MAIL_PARAMS,
  TERMS_ATTACHMENT_FILENAME,
  WITHDRAWAL_FORM_ATTACHMENT_FILENAME,
  mailAttachmentFactsOf,
  type MailAttachmentFact,
  type MailParagraph,
  type MailParamKind,
  type MailParamTest,
  type MailTemplateDefinition,
  type MailTemplateId
} from "./templates.js";
export {
  MailTemplateError,
  companyFacts,
  companyFactsOf,
  loadMailCatalogues,
  mailLinkOf,
  mailMessagesDirectory,
  renderMail,
  renderWithdrawalForm,
  type CompanyFacts,
  type MailRenderOptions,
  type RenderedMail
} from "./render.js";
