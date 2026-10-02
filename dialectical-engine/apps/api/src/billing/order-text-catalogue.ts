import { renderOrderText } from "@debateai/mail-templates";
import type { BillingOrderText } from "./order-text.js";

/**
 * D6a's `BillingOrderText` over the 35-locale catalogue (packages/mail-templates/messages/<locale>/order.json): the
 * xMoney order line and the card check's line in the buyer's locale, and the invoice line. Its English equals
 * `englishOrderText` (tests/unit/mail-order-text.test.ts), so an English buyer sees exactly what P8c's tests pin.
 */
export const catalogueOrderText: BillingOrderText = (kind, locale, params) => renderOrderText(kind, locale, params);
