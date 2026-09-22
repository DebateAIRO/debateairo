Stripe integration study for DebateAIRO — researched 14 September 2026

**Stripe can support the product, but payment processing, tax compliance, and Romanian accounting are separate responsibilities.** The first decision is whether DebateAIRO remains the merchant of record or uses Stripe Managed Payments for eligible sales. The merchant of record is the business identified as responsible for the payment transaction.

This study provisionally assumes a Romanian business selling automated web-based AI subscriptions directly to consumers and businesses. The repository's privacy policy names “DebateAIRO SRL, Bucharest, Romania”; that is product copy, not verification that the entity exists or is VAT-registered. The actual entity, tax registrations, customer countries, sales forecast, and Stripe account status remain unconfirmed. A Romanian accountant should settle the entity-specific tax treatment, and counsel should review the consumer terms before launch.

**Choose the operating model before configuring tax.**

| Route | Who is merchant of record? | Tax work | Implication for DebateAIRO |
| --- | --- | --- | --- |
| Stripe Payments + Checkout + Billing | DebateAIRO | DebateAIRO determines obligations and arranges calculation, collection, returns, and payment | Suitable when the company and accountant want direct control |
| Add Stripe Tax | DebateAIRO | Calculation and monitoring; registration/filing services depend on plan, jurisdiction, partners, and enrollment | Automation helps, but does not transfer the seller's liability |
| Stripe Managed Payments + Checkout + Billing | Stripe, through Sold through Link | Stripe takes responsibility for covered indirect taxes on eligible transactions | Strong candidate for international consumer sales; additional fees and contractual constraints |

Stripe documents these as distinct products. Adding ordinary Tax does not turn Payments into Managed Payments. [Stripe product comparison](https://docs.stripe.com/payments/managed-payments), [Tax compliance workflow](https://docs.stripe.com/tax/how-tax-works).

Romania is a supported Managed Payments business location. Eligible categories include cloud AI services, with personal-use and business-use codes `txcd_10105001` and `txcd_10105002`. These appear relevant to DebateAIRO, but classification is a recommendation requiring confirmation. Stripe reviews account eligibility; the product must meet its automation, distribution-rights, and direct-sale conditions. Human consulting bundled into the sale can change eligibility. [Managed Payments eligibility](https://docs.stripe.com/payments/managed-payments/eligibility).

Managed Payments covers customer sales in more than 80 countries, including Romania and other EU states. Coverage is not universal: in unsupported tax jurisdictions the seller still has tax responsibilities. Approval to accept a payment is not proof that its tax is covered. Map launch countries against the current coverage list. [Managed Payments tax coverage](https://docs.stripe.com/payments/managed-payments/tax-compliance).

Customers see Link branding on checkout, statements, and transaction emails. Stripe handles transaction support; DebateAIRO handles the product. Stripe can issue refunds in specified circumstances, including some unanswered support escalations. Cancellation and deletion initiated through Link must reach the application's subscription state. These are product and support tradeoffs to evaluate. [Managed Payments operation](https://docs.stripe.com/payments/managed-payments/how-it-works).

My provisional recommendation is to evaluate Managed Payments first if international B2C sales are central and tax administration is the main concern. Standard Payments + Billing + Tax is reasonable if the accountant will operate the registrations, returns, and Romanian invoicing process. This is a business recommendation, not confirmation that either account is activated.

**Prepare an onboarding packet for Stripe.** For a Romanian SRL, assemble the following; the Dashboard determines the exact documents required:

- Registered company name, registration number/CUI, registered address, business type, and VAT number if applicable.
- An authorized account representative and requested identity/contact details; identity evidence and beneficial-owner/controller information as requested.
- A payout bank account held by the seller, its IBAN and currency, and evidence of account ownership if requested.
- Website/domain, accurate product description, subscription prices and currencies, fulfillment/access timing, and requested transaction-volume information.
- Support contact details, recognizable statement descriptor, terms, privacy policy, refund and cancellation policies.

Stripe verifies the business before live use and can require updated information later. Submit identity documents through Stripe's secure onboarding flow. Use accurate registered details, including a real entity name rather than a planned brand. [Account activation](https://docs.stripe.com/get-started/account/set-up), [Verification requirements](https://support.stripe.com/questions/what-do-i-need-to-do-to-verify-my-stripe-account).

**What we grant Stripe involves both contractual authority and payment data.** Accepting the Services Agreement authorizes fee collection and settlement, including contractual credits/debits to the nominated bank account and recovery of amounts owed. It also incorporates data-processing terms and licenses for submitted content and marks. The agreement does not transfer ownership of our IP, but its content license is broad: review sections 4, 5, and 7 rather than assuming payment processing grants no rights. [Romanian account Services Agreement](https://stripe.com/en-ro/legal/ssa).

Stripe can establish reserves under applicable service terms. Managed Payments additionally authorizes Sold through Link to facilitate sales on our behalf; it is not blanket insurance against all disputes, fees, product liabilities, or tax failures. [Service terms, including Financial Services and Managed Payments](https://stripe.com/en-ro/legal/ssa-services-terms).

The proposed integration supplies billing identity, payment amounts/currency, purchased plan, tax information, and an internal account reference. Stripe's hosted checkout receives the card information directly. There is no integration reason to give Stripe repository access, database credentials, debate decryption keys, or debate transcripts. Keep product descriptions generic and metadata minimal. This is the recommended application boundary.

For developers, the authorization runs the other way: our backend receives credentials to call Stripe. Store a restricted API key with only the needed resource permissions in server secrets; configure a separate webhook-signing secret. Keep test and live credentials separate. Use individual team roles and MFA; avoid shared owner credentials. An exact permission list depends on the final endpoints. [API key practices](https://docs.stripe.com/keys-best-practices).

**Build the integration around verified billing events and server-side access control.** The following is an implementation checklist, not a claim that this code exists:

1. Define monthly/annual plans, included usage, any credits, currency, trials, cancellation timing, refunds, and upgrade/proration rules. Avoid enabling usage overages until their billing and customer authorization are explicit.
2. Create Stripe Products/Prices with the confirmed AI-service tax classification. Maintain an approved server-side mapping from plans to Price IDs. Authenticate checkout creation and derive the account/customer mapping on the server.
3. Use hosted Checkout for card entry. Configure recurring billing and required customer authentication; test a customer who must complete an additional authentication step. A saved card does not guarantee every future charge will succeed. [Strong Customer Authentication](https://docs.stripe.com/strong-customer-authentication).
4. Store a dedicated billing record: application account, Stripe Customer/Subscription identifiers, plan, payment/access status, period dates, cancellation state, and invoice references. Treat it as the authority for paid access. Never grant Premium solely because the browser returns to a success URL.
5. Verify the webhook signature against the raw request body. Persist accepted events durably, process them safely on retries, deduplicate event IDs, and handle events arriving out of order. Retrieve current Stripe state when needed instead of relying on delivery order. Acknowledge promptly after durable receipt and monitor failures. [Webhook requirements](https://docs.stripe.com/webhooks).
6. Handle paid invoices, failed or authentication-required payments, subscription updates/deletion, refunds, and relevant disputes. A subscription can exist before its first payment succeeds. Decide the grace period for failed renewals; revoke access when the applicable policy requires it. Reconcile missed events. [Subscription event handling](https://docs.stripe.com/billing/subscriptions/webhooks).
7. Provide an authenticated billing-management entry point. For standard Billing, Stripe's Customer Portal can support payment-method updates, invoice access, and subscription management; configure the permitted actions. Managed Payments also has Link management flows. [Customer Portal](https://docs.stripe.com/customer-management).
8. Test first purchase, renewal, declines, authentication, cancellation, refund, duplicate/reordered events, invalid tax IDs, missing location data, and account deletion. Confirm the accounting handoff for a sample invoice and refund before launch.

Hosted payment entry reduces PCI scope because card data bypasses our servers. It does not remove PCI responsibilities: Stripe says merchants must attest annually and follow their Dashboard's compliance requirements. Use HTTPS and the required security controls. [Integration security](https://docs.stripe.com/security/guide).

The inspected code contains a per-run `free`/`premium` tier designed for later billing use, not proof of a paid subscription. Billing authorization must be checked before accepting a premium run, while preserving the historical tier. See [ADR-0024](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/architecture/01-decisions/ADR-0024-plan-tier-storage-and-layering.md). A targeted search of application/package code found no Stripe integration; this was not a full billing audit.

**For standard Payments, VAT depends on both seller and buyer.** Assuming automated cloud AI access is an electronically supplied service, the practical decision table is:

| Customer | Usual treatment, subject to the seller's registrations and applicable exemptions |
| --- | --- |
| Romanian consumer or Romanian business | Romanian VAT when taxable; domestic small-business exemption may apply if eligible. A Romanian business VAT number does not automatically create reverse charge. |
| Consumer in another EU country | Normally the customer's country's VAT; consider the €10,000 place-of-supply exception and the separate SME exemption described below. Union OSS can simplify reporting. |
| Business in another EU country | Usually reverse charge for ordinary B2B services; verify business status, VAT details, receiving establishment, and invoice wording. |
| Customer outside the EU | Ordinary electronic services usually fall outside Romanian VAT, but local VAT/GST/sales-tax rules may apply. Check B2B/B2C treatment and jurisdiction. |

These are defaults, not a universal tax engine. The service classification and customer status determine the place of taxation. [European Commission place-of-taxation rules](https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/place-taxation_en), [Cross-border VAT](https://europa.eu/youreurope/business/finance-and-tax/vat/cross-border-vat/index_en.htm).

Romania's standard VAT rate is **21%**, effective 1 August 2025. Automated AI/SaaS would ordinarily use the standard rate when Romanian VAT applies; describing the product as educational does not establish an education exemption. Confirm classification with the accountant. [ANAF VAT rates](https://static.anaf.ro/static/10/Anaf/AsistentaContribuabili_r/Cotele_de_TVA_09.2025.pdf).

The domestic small-business exemption threshold became **395,000 RON** on 1 September 2025. ANAF says normal taxation begins with the transaction that crosses the threshold, and registration must be requested by that date. The relevant statutory turnover is not simply net Stripe payouts. A company already registered cannot assume it may stop charging VAT just because revenue falls below the threshold. [ANAF threshold notice](https://static.anaf.ro/static/3/Cluj/20250912120026_cj_%20plafon_tva_12sep2025.pdf).

The separate **€10,000 EU threshold** concerns the place of supply for qualifying cross-border consumer electronic services and intra-EU distance sales combined. It is not a general exemption from VAT, not per country, and not the Romanian registration threshold. Conditions include establishment in one Member State and the current/preceding-year test; opting for destination taxation is possible. [EU electronic-service rules](https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/provide-services-abroad/index_en.htm), [EU e-commerce threshold](https://vat-one-stop-shop.ec.europa.eu/index_en).

**Union OSS** lets a Romanian seller report eligible cross-border EU consumer VAT through Romania, generally quarterly. It does not replace domestic returns or B2B reporting. [EU OSS guidance](https://europa.eu/youreurope/business/finance-and-tax/vat/one-stop-shop/index_en.htm).

Since 2025, the separate cross-border **SME VAT exemption** can be available when EU annual turnover does not exceed **€100,000**, subject to national thresholds and other conditions. It requires the relevant procedure; it is not automatic and affects input-VAT recovery. Ask the accountant to compare it with OSS and ordinary VAT registration. Do not confuse it with Stripe's “small seller” setting. [Commission SME portal](https://sme-vat-rules.ec.europa.eu/index_en), [Scheme introduction and eligibility](https://taxation-customs.ec.europa.eu/news/new-web-portal-vat-rules-small-enterprises-2024-11-12_en).

A business below the domestic threshold can still need **special VAT registration under article 317** before certain intra-EU service supplies or purchases. Ask specifically about EU business customers and foreign software/AI suppliers. ANAF's registration instructions distinguish these cases from normal registration. Do not infer that every Stripe fee has identical VAT treatment; use the actual invoice and supplying entity. [ANAF form 700 instructions](https://static.anaf.ro/static/10/Anaf/formulare/D_700_OPANAF_252_2025.pdf).

**Configure Stripe Tax only after the registration decisions.** Enter the head-office address, applicable tax registrations/effective dates, product classification, and inclusive/exclusive pricing. Enable automatic tax on the relevant payment and subscription flows. Registrations and filing arrangements are separate from a calculation toggle. [Stripe Tax setup workflow](https://docs.stripe.com/tax/how-tax-works).

Collect billing location and business identity when applicable. Stripe can return zero tax because no registration is configured; zero is not confirmation that no tax is legally due. [Customer locations](https://docs.stripe.com/tax/customer-locations).

At Checkout, tax IDs are checked for format; EU VAT validity checking happens asynchronously. Stripe Tax can apply reverse charge based on format even when the number is invalid. Implement handling of pending/invalid verification, retain evidence, and correct affected invoices when necessary. [Tax ID collection and validation](https://docs.stripe.com/tax/checkout/tax-ids).

Stripe Tax prioritizes one address rather than resolving conflicting location evidence. Agree an evidence policy with the accountant, including whether the applicable rules require two independent consistent items. Do not reuse a self-confirmed address as a second item. [Stripe EU tax behavior](https://docs.stripe.com/tax/supported-countries/european-union), [Commission evidence guidance](https://vat-one-stop-shop.ec.europa.eu/document/download/78103105-cf0c-4949-9162-daab6f5d11d4_en?filename=explanatory_notes_2015_en_0.pdf).

**Accounting and RO e-Factura need their own implementation.** For standard Payments, connect the billing events to an accountant-approved invoice system or ANAF integration. Decide the authoritative invoice numbering, seller/buyer fields, currency conversion, credit-note process, and mapping between Stripe and fiscal invoice IDs. A Stripe receipt or PDF does not itself establish that an invoice has been transmitted and accepted by RO e-Factura.

Romania has in-scope B2B and B2C invoice-transmission requirements. From 1 January 2026, the transmission deadline is **five working days from issue**, subject to the statutory latest-issue-date limit. Applicability depends on the transaction and seller; it is not a rule that every foreign sale goes into e-Factura. Build validation, retries, accepted/rejected status, and an archive. [ANAF January 2026 changes](https://static.anaf.ro/static/3/Ploiesti/20260115111226_comunicat%20ajfp%20arges%20-%20modificari%20ro%20e-factura%20site.pdf), [ANAF reporting overview](https://static.anaf.ro/static/10/Iasi/material_informativ_27-01-2026.pdf).

Reconcile gross charges, refunds, customer VAT, Stripe fees, currency differences, disputes, and bank payouts separately. For illustration, **121 RON including 21% VAT = 100 RON sale value + 21 RON output VAT**, before payment fees. Net payouts are not the sales ledger. The final VAT payable also depends on the company's deductible input VAT and adjustments.

Managed Payments changes the customer-sale tax/invoice flow, but the Romanian company's own income, expenses, statements, and any seller-side invoicing/reporting still need accounting treatment. Ask the accountant to document the relationship with Sold through Link, including any self-billing and e-Factura implications, using the actual agreement. Corporate or microenterprise tax, payroll, and owner/dividend taxes remain outside the customer indirect-tax service. [Managed Payments coverage](https://docs.stripe.com/payments/managed-payments/tax-compliance).

**The customer contract must explain what payment buys.** Publish seller identity and contacts, features and usage limits, total consumer price and currency, billing interval, renewal, trial conversion, delivery/access timing, cancellation, refunds, and complaint handling. Have counsel check mandatory consumer rights and any required Romanian disclosures. Stripe's website checklist helps with onboarding but is not a legal certification. [Stripe website checklist](https://docs.stripe.com/get-started/checklist/website).

EU consumer distance contracts generally include a 14-day withdrawal right. Ongoing digital services and delivered digital content have different exceptions and consent requirements. Starting a SaaS subscription does not automatically eliminate withdrawal rights. Record any required request for immediate performance and contractual confirmation; avoid a blanket “digital products are non-refundable” policy. [Romanian OUG 34/2014, articles 9–16](https://legislatie.just.ro/Public/DetaliiDocument/307805), [Consumer Rights Directive](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A02011L0083-20220528).

There is also a **2026 online withdrawal-function requirement** for covered online contracts. It must be accessible during the withdrawal period, allow confirmation, and generate an acknowledgement on a durable medium. Stopping next month's renewal is a different action. The EU application date is 19 June 2026; Romania transposed the change through OUG 18/2026, adding article 11¹. Review the final workflow and wording locally. [EU amendment, article 11a and application date](https://eur-lex.europa.eu/eli/dir/2023/2673/oj/eng), [Romanian amendment](https://legislatie.just.ro/Public/DetaliiDocument/308474). The Romanian portal's full text failed to load during research; its indexed amendment and commencement extracts were available, alongside the full EU text.

**Revise privacy and account deletion before collecting money.** The current [privacy-policy data](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui/lib/privacyPolicy.ts) omits billing categories and describes broad deletion within 30 days. Add payment/billing information, purposes and legal bases, Stripe and relevant recipients, transfer safeguards, rights handling, and statutory retention exceptions. Necessary processing should have its appropriate lawful basis rather than being bundled into optional analytics consent.

Stripe's DPA describes it as both processor and controller depending on the purpose, including independent fraud and regulatory functions. Reflect those roles accurately. [Stripe DPA](https://stripe.com/legal/dpa).

For OSS, transaction records must be retained for **ten years from the end of the transaction year**, including after leaving the scheme. Agree retention for other Romanian financial documents separately. Account deletion should cancel billing and remove eligible product data while retaining only required fiscal records under controlled access. [Commission OSS retention guidance](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop/record-keeping-and-audits-oss_en).

**Budget for several fee components.** Stripe's Romanian standard price page currently lists:

| Component | Published rate |
| --- | --- |
| Standard EEA card | 1.5% + 1 RON |
| Premium EEA card | 2.8% + 1 RON |
| UK card | 2.5% + 1 RON |
| Other international card | 3.15% + 1 RON |
| Currency conversion, when required | Additional 2% |
| Billing, pay as you go | 0.7% of Billing volume |
| Tax Basic through Checkout/Billing | 0.5% per transaction where registered |
| Managed Payments | Additional 3.5% per successful transaction, above Payments fees |

These are separate price components, not an all-in quote. Confirm Billing charges, the precise fee bases, any fee taxes, filing/accounting costs, and dispute/refund costs for the selected contract. [Romanian pricing](https://stripe.com/en-ro/pricing).

**The launch decisions to assign now are concrete.**

| Owner | Decision or evidence needed |
| --- | --- |
| Founder + accountant | Actual seller entity, legal activity, ordinary/special VAT registrations, forecast, buyer types and countries |
| Founder + Stripe | Standard Payments versus Managed Payments; confirmed account/product eligibility and fee schedule |
| Accountant | VAT matrix, OSS/SME choice, imported services, invoice/e-Factura process, return deadlines and record retention |
| Founder + counsel | Consumer terms, withdrawal versus cancellation, immediate access, privacy and statutory disclosures |
| Engineering | Checkout, durable webhook processing, paid-access enforcement, portal, tax validation, invoice handoff, deletion behavior and failure tests |
| Operations + accountant | Refund/dispute ownership, payout reconciliation, retained tax funds or withheld-tax reconciliation, and compliance alerts |

The research supports selecting a route and preparing onboarding. It does not establish the company's VAT status, approve its legal terms, or prove a live payment integration. Those remaining launch decisions are explicitly identified above; no Stripe account settings or application behavior were changed in this study.
