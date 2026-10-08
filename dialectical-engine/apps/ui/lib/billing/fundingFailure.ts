import { t,type MessageCatalog } from "../i18n/translate.js";
/** A private funded queue refusal has its own prose; customer failures keep their existing renderer. */
export function fundingFailureMessage(reason:string|null,catalog:MessageCatalog):string|null {
  return reason === "RUN_SETUP_FAILED:FUNDING_ENDED" ? t(catalog,"debateChrome.error.fundingEnded") : null;
}
