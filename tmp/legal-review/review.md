# DebateAI Terms Review and Country Requirements

Research and drafting recommendations updated 21 September 2026

**Expanded country review.** This edition adds mainland China, Japan, Singapore and South Korea to the earlier comparison. It also adds proposed local terms, checks provider territory restrictions and distinguishes serving users in a country from sending data to a provider there. It supersedes the earlier generated review; the supplied PDF remains unchanged.

**Recommendation.** Revise before publication. The supplied 13-page draft is a useful Romania and EU starting point, especially its AI Provider Register concept. Its largest weaknesses are unresolved operational choices, technical statements that have not been evidenced, consumer liability exclusions, and insufficient separation of user terms from provider procurement. The separate revised terms address those points without changing the original PDF.

**Scope.** Reviewed every page of Terms of Service.pdf, dated 20 September 2026, and the checklist supplied in this request. The referenced “second tab” was not included in the PDF and was not reviewed. Document instructions were treated as drafting material, not authority to act. No live product, company registration, signed provider agreement, provider dashboard, Privacy Notice or existing Provider Register was audited. No policy has been published and no contract has been signed.

**Assumptions.** DebateAIRO is the Romanian operator; accounts are intended for adults; users can publish AI debates; free and possible paid access are contemplated. Romania and the EU are the proposed base. The comparison covers Germany, France, the UK, the US with California examples, Canada with Quebec examples, Australia, Brazil, mainland China, Japan, Singapore and South Korea. The four added markets were requested for research; their actual launch status and provider arrangements remain unconfirmed. China here means mainland China; Hong Kong and Macao require separate assessments. This is a targeted research and drafting aid, not a legal opinion or an exhaustive launch assessment. Romanian and relevant local counsel should settle applicability, local versions and unresolved launch conditions.

## 1 What should change

### Provider disclosures need evidence behind them

Original sections 7 and 15, pages 5 and 12, already cover most of the requested disclosure fields. Keep them, but verify the exact entity, account, endpoint, model, tools and routing configuration. “No training”, a short abuse-log period, and ZDR are different claims. ZDR is scoped and may have exceptions; it does not mean DebateAI stores nothing. Signed contracts and account evidence are still missing. [S01] [S02] [S03]

The revised terms retain a proposed no-training commitment. This is a commitment to implement and verify, not a finding that existing providers already satisfy it. If any proposed route allows general model training on private content, change the route or accurately redesign the offer before adopting that commitment.

### Publication and deletion must have one clear policy

Original section 8, pages 6–7, exposes both Option A and Option B. Section 10, page 9, promises key destruction but admits exceptions for logs and older records. Do not publish competing options or imply universal erasure. The proposed revision chooses **Option B**: account closure removes public snapshots without undue delay, with a 30-day outer limit, subject to faster legal duties. This is a proposed product-policy change requiring implementation, not a description of the current system.

If you retain Option A instead, commission a separate basis for continued publication, post-closure removal access, retention limits and individual rights. Retiring a pseudonym does not necessarily anonymise the debate. Encryption-key destruction is not proven erasure if keys, plaintext, recoverable backups or provider copies remain. [S04]

### Consumer protections cannot depend on a savings sentence

Original section 13, page 11, excludes responsibility for decisions based on outputs and proposes an undefined cap and broad indirect-loss exclusions. A sentence preserving statutory rights may not cure unfair drafting. The revision removes the general consumer cap and blanket exclusions and preserves conformity remedies. Any negotiated business allocation belongs in a separate order form. Provider failure is not automatically force majeure. Original section 17 should not automatically replace an unfair term with its nearest enforceable equivalent. [S05] [S06]

### Paid access needs a complete checkout and withdrawal flow

Original section 11, pages 9–10, is explicitly unfinished. The revision makes paid terms conditional on a real offer, requires full price and renewal information, and adds a withdrawal form and online route. Romania’s current OUG 34/2014 includes Article 11¹, applicable from 19 June 2026: an accessible withdrawal function, confirmation step and durable acknowledgement. Subscription cancellation and statutory withdrawal are distinct functions. A first AI answer does not fully perform an ongoing subscription. [S07]

### The service description cannot substitute for a technical audit

Original sections 3–5, 7–10 make absolute statements about mandatory 2FA, immutable pseudonyms, only debate text leaving the service, fully automated content, separate authentication for publication and cryptographic deletion. The revision avoids hard-coding undocumented implementation details. Verify actual data payloads, logs, recovery, exports, backups and authentication before turning any proposed text into a factual promise.

### Separate the three regulatory roles

The company can simultaneously be a data controller, a host of user-selected material, and a provider or deployer of an AI system. Assess each function. Original section 9 should not assume that every engine decision is outside GDPR Article 22; the effect on an individual and actual processing matter. Hosting protections also cannot simply be assumed for content the service itself creates or develops. [S04] [S08]

Public publishing makes DSA classification important. Some additional online-platform obligations have micro/small enterprise exemptions, but that does not exempt all hosting duties. The revision voluntarily retains a six-month human appeal route. DSA certified dispute settlement and ANPC consumer ADR are different routes. Verify the operator’s classification and applicable Romanian ANCOM notification/contact duties. [S08] [S09]

### AI labels and liability require product action

Article 50 transparency obligations apply from 2 August 2026. The Commission distinguishes interaction disclosures, provider-side marking and deployer disclosure of public-interest AI text. Its current guidance provides a limited transition to 2 December 2026 for Article 50(2) marking for systems placed on the market before 2 August; that is not a general delay of all disclosures. Assess DebateAI’s own role and exports. “No named person holds editorial responsibility” does not remove company responsibility. [S10]

### Output licences must match feature rights

Original sections 7 and 14 grant broad output use but also prohibit competing engines and training on public output. The revision clarifies private input rights, third-party material, limited public quoting and the right to use competing services. It does not promise rights the operator lacks. Review provider restrictions on cross-model critique, caching, publication and output survival before offering these functions. Google Search grounding is a particular concern, discussed in section 4. [S11]

### Privacy information is not blanket consent

Original sections 2, 15 and 17 treat the Privacy Notice inconsistently as a contract with an unresolved priority clause. The revision gives it an informational role without using acceptance as universal processing consent. Actual privacy commitments can still bind the operator. Prohibiting user submission of personal data does not eliminate the operator’s duties when it receives or generates it. Public-figure content may still reveal protected personal information. [S04]

## 2 How country changes affect the policies

**Four locations matter.** The operator’s establishment, a customer’s residence or targeted market, the provider’s contracting entity, and the actual processing/access countries can all produce different obligations. Nationality or a server region alone is not the legal test. A Romanian company can still owe mandatory protections abroad. Hosting in the EU does not establish that all support, inference or subprocessing stays there. [S04] [S12]

### Romania and the wider EU

Use Romanian consumer information for the Romanian offer, complete trader identity and contact details, and provide durable order confirmation. OUG 141/2021 governs relevant digital-service conformity and modification remedies, including a 30-day exit window for qualifying adverse modifications. Some free services supplied in exchange for personal data can fall within digital-service consumer rules; do not assume that a zero price removes them. [S06] [S13]

GDPR applies to processing in the context of the Romanian establishment, including relevant processing concerning users elsewhere. Identify lawful purposes, recipients and transfers and use an Article 28 arrangement where the provider acts as processor. Public debate topics can reveal political opinions or other special-category information. Assess that risk before accepting sensitive content. [S04]

EU transfer safeguards are route-specific. Adequacy only covers its stated recipients and scope. For a US recipient, verify current EU–US Data Privacy Framework participation and coverage if relying on it; otherwise assess an appropriate alternative. SCCs require correct roles, completed annexes and an assessment of whether supplementary measures are needed. A DPA by itself is not necessarily a Chapter V transfer mechanism. [S12]

**Germany.** BGB §312k requires a specific accessible cancellation process for qualifying paid continuing contracts concluded through websites. Standard terms are also subject to renewal restrictions in §309(9). A blanket annual automatic renewal may need redesign. [S14] [S15]

**France.** Qualifying online service subscriptions need the accessible online cancellation process commonly described as “three clicks”. Check applicable renewal reminders and supply appropriate French-facing contractual information before targeting France. A generic English cancellation sentence is not implementation. [S16]

The revised Romanian baseline does not certify all 27 EU jurisdictions or the EEA states. Local language, consumer procedure and public-content rules need a launch check for each targeted market. Choice of Romanian law remains subject to mandatory conflict-of-law and consumer-jurisdiction rules.

### United Kingdom

Where UK GDPR applies, UK restricted transfers need their own valid route: UK adequacy or suitable safeguards such as the IDTA or EU SCCs with the UK Addendum, with the applicable data-protection test. EU SCCs alone are not a UK instrument. Assess whether a UK representative is required for targeted offering or monitoring. [S17]

The public-debate function needs Online Safety Act scoping: Ofcom treats user-shared AI content as user-generated content for user-to-user services. An “18+ accounts” clause does not answer whether public pages are likely to be accessed by children. Complete the applicable access/risk assessments rather than relying on an age statement. [S18]

Preserve UK mandatory consumer rights and local cancellation rules. The government currently anticipates commencement of the new DMCC subscription-contract regime in spring 2027. Do not present every future requirement as already operative; recheck commencement before paid UK launch. [S19]

### United States with California examples

GDPR obligations arising from the Romanian establishment do not disappear when the customer is American. Add applicable state privacy disclosures and rights after checking each law’s scope. California’s CCPA is threshold-based: the current adjusted gross-revenue threshold is $26.625 million; other triggers include buying, selling or sharing information of 100,000 consumers or households, or deriving at least 50% of revenue from selling or sharing personal information. Do not use an obsolete $25 million threshold. [S20] [S21]

If covered, assess notice at collection, access/deletion/correction, sale/sharing opt-outs and signal recognition, and service-provider contract conditions. Sharing data with an AI provider is not automatically a statutory “sale” or “sharing”; its role, purposes and contract matter. Other state laws can apply below California’s thresholds. [S21]

For subscriptions, ROSCA requires disclosure, express informed consent and a simple cancellation mechanism for covered online negative-option offers. California’s amended automatic-renewal provisions apply to relevant contracts entered into, amended or extended on or after 1 July 2025, with consent, recordkeeping, reminders and cancellation requirements. Do not add US arbitration or class waivers to global consumer terms without separate assessment. [S22] [S23]

### Canada and Quebec

Assess PIPEDA and applicable provincial laws. Under the federal outsourcing framework, the organisation remains accountable for processing abroad, uses contractual protection and explains foreign access risks; an EU SCC form is not the whole Canadian analysis. [S24]

Quebec’s private-sector law requires a privacy impact assessment before communicating personal information outside Quebec and an appropriate written agreement; the assessment must support adequate protection. Its notice and governance rules also need local treatment. [S25]

Where Quebec’s adhesion-contract language rules apply, a French version generally must be supplied before an express choice of another language, subject to the statutory exceptions. Do not assume an English-priority clause satisfies this requirement. Check provincial cancellation rights separately instead of assuming that one EU-style rule covers all Canadian offers. [S26]

### Australia

Australian consumer guarantees can apply to an overseas business selling directly to Australian consumers. Preserve due care and skill and other applicable guarantees, remedies and unfair-term protections; a liability disclaimer or Romanian-law clause cannot simply displace them. [S27]

Where the Privacy Act applies, APP 8 requires reasonable steps concerning overseas recipients and can leave the disclosing entity accountable. The Privacy Act generally exempts many small businesses with annual turnover of A$3 million or less, but exceptions exist, including some personal-information trading and other regulated activities. Assess coverage instead of automatically claiming either exemption or compliance. [S28] [S29]

### Brazil

Assess LGPD territorial scope, provide understandable Portuguese-facing information and rights procedures, and preserve applicable consumer protections. Article 49 of the Consumer Defence Code provides a seven-day withdrawal rule for covered off-premises/distance contracts; classification and local implementation still need review. [S30]

The transfer position changed in 2026: the EU and Brazil adopted mutual adequacy decisions. Brazil-to-EU transfers can use the applicable ANPD adequacy decision, and EU-to-Brazil transfers can use the applicable EU decision. This does not automatically authorise a later transfer from Romania to a US model provider. [S31] [S32]

For routes without applicable adequacy, assess an LGPD mechanism. ANPD’s Resolution 19/2024 provides Brazilian standard clauses, with its 12-month incorporation period now elapsed. ANPD currently reports no recognition of foreign standard clauses as equivalent. Do not assume bare EU SCCs cover every Brazilian transfer. [S31]

### Mainland China

**Serving local users.** PIPL can apply to an overseas operator offering services to people in mainland China or analysing their behaviour. Where Article 3(2) applies, Article 53 requires a mainland establishment or designated representative and reporting of its details. Use a local privacy notice that identifies purposes, data, retention and rights. Map each operation to a PIPL basis; GDPR legitimate interests is not a transferable legal basis. Assess sensitive data, entrusted processing and public disclosure separately. A terms checkbox is not the required separate consent for every affected operation. [S38]

**Exports from China.** Assess PIPL notice, separate consent where required, impact assessment and the applicable export route. The 2024 rules relax procedural requirements: for example, a qualifying non-critical-infrastructure operator exporting fewer than 100,000 individuals' non-sensitive data since 1 January can be exempt from the security assessment, Chinese standard contract and certification routes. Important data, sensitive information, higher volumes and other exceptions change the analysis. This is not a blanket PIPL exemption. EU SCCs are not the Chinese standard contract. Do not describe all Chinese data as subject to universal local storage, or all small-volume exports as unrestricted. [S39]

**Public AI service.** The Generative AI Interim Measures cover services supplying generated content to the mainland public; they also address noncompliant services supplied from abroad. Content controls, personal-information protection and complaints handling need operational implementation. Services with public-opinion or social-mobilisation attributes require the applicable security assessment and algorithm filing. **Assessment for DebateAI:** public debates and political discussion make this a material scoping issue; an overseas company and an upstream model's filing do not establish readiness. Resolve the applicable service registration/filing and licensing route before enabling a mainland offer. [S40]

The AI content-labeling measures have applied since 1 September 2025. They cover visible notices and file metadata, with duties for generation and dissemination. Article 8 specifically requires user agreements to explain labeling methods and formats. Exports and public snapshots need compatible labels; a footer disclaimer alone is insufficient. The revised terms propose a text label and metadata approach that must be implemented and checked against the mandatory technical standard. [S41]

**Consumer terms.** Provide understandable local terms and prominent material restrictions. The 2024 consumer regulations require conspicuous automatic-renewal warnings before acceptance and renewal. Implement cancellation and prepaid-service remedies under the applicable rules. Do not transplant a general seven-day goods-return rule into an AI subscription without classifying the service. [S42]

**Launch conclusion.** A separate mainland product and operating assessment is needed. The candidate API territory restrictions in section 4 are an additional dependency. This review does not establish that a mainland launch is legally or contractually available.

### Japan

**Privacy and overseas processing.** APPI can apply to an overseas business handling personal information in connection with offering goods or services to people in Japan. Specify use purposes, supervise entrusted processors, address security and rights, and assess sensitive information. Under Article 28, foreign third-party transfers generally need informed consent unless an applicable exception, recognised destination or recipient system providing continuing equivalent measures applies. Consent-route information includes the foreign privacy system and recipient safeguards. The equivalent-measures route entails continuing checks and information on request. Distinguish outsourcing from a provider's independent training use. [S43]

EU adequacy for Japan has a defined scope, including the Supplementary Rules for covered EU-origin data. Those rules address onward transfers: Japanese processing followed by US or Chinese processing is not automatically covered by the first transfer's adequacy. Maintain the data's provenance and downstream safeguards. [S44] [S46]

**Checkout and consumer terms.** Prepare an accessible Japanese disclosure under the Specified Commercial Transactions Act, including seller identity, address, telephone, responsible representative, price, payment, service timing and cancellation conditions. Display subscription duration, charges and cancellation clearly on the final confirmation screen. [S45]

Ordinary internet mail-order transactions do not have the Act's general cooling-off right. This does not eliminate rescission for misleading conduct or other mandatory remedies. State the actual cancellation/refund policy and any voluntarily offered cooling-off benefit; do not market the EEA 14-day rule as an automatic Japanese entitlement. [S59]

**AI governance.** Japan's Cabinet Office publishes AI development and use guidance and links the March 2026 business guidelines. Use these to guide transparency, risk management and accountability, while separating guidance from binding privacy and consumer duties. They are not evidence that a provider has permission to train on private debates. [S60]

**Draft change.** Add the Japanese statutory disclosure link and local cancellation explanation. The current requirement to have legal capacity still needs a local eligibility check; an age gate alone does not answer every capacity issue.

### Singapore

**Privacy and accountability.** Where the PDPA applies, identify the organisation and public data-protection contact, explain collection/use/disclosure purposes, apply consent or a valid exception, protect the data, and stop retaining it when business or legal purposes no longer justify retention. Overseas transfers require comparable protection under the Transfer Limitation Obligation. Record the applicable mechanism and enforceable provider obligations; a list of overseas locations is not sufficient. Singapore does not impose a general requirement that all data remain in Singapore. [S47]

**Recent GenAI guidance.** The PDPC issued final GenAI personal-data guidelines on 20 July 2026. They distinguish model providers, system providers and deployers. When consent is needed for large-scale training or fine-tuning, the notice must explain the AI-development purpose; a generic product-improvement statement is insufficient. Exceptions require their own assessment. Apply data minimisation and procedures for access/correction, including data in retrieval stores. These are regulatory guidelines explaining PDPA duties, not a new stand-alone AI licensing statute. The proposed no-training commitment remains stricter than merely having a possible statutory exception. [S48]

**Subscriptions.** Explain recurring charges, conversion conditions and cancellation before acceptance. Singapore's competition and consumer authority has enforced against concealed subscription enrolment. Avoid preselected paid conversion and misleading cancellation flows. The statutory cooling-off regime covers specified contract types; an ordinary online AI subscription should not be presented as automatically carrying an EEA-style withdrawal right. Preserve applicable unfair-practice remedies and clearly state any voluntary refund policy. [S49] [S50]

**Draft change.** Publish the data-protection officer's business contact and add local privacy and payment information. Hosting or a provider entity in Singapore does not, by itself, establish EU transfer adequacy or active ZDR.

### South Korea

**Territorial scope and notices.** PIPC guidance explains when PIPA reaches overseas businesses, including targeted services and processing with a direct, significant effect on Korean individuals. It specifically warns against grouping independent third-party provision and entrusted processing under an undifferentiated “sharing” label. Provide a readable Korean privacy notice identifying each role and actual foreign recipient. Assess whether a domestic agent is required; that obligation is threshold-dependent, not universal for every foreign startup. [S52]

**Transfers and sensitive content.** PIPA Article 28-8 permits specific transfer bases, including separate consent and necessary contractual entrustment/storage with prescribed disclosure or notification. These are not interchangeable. Disclose data items, destination, timing/method, recipient/contact, purpose, retention and refusal consequences where required. Apply Article 28-11 to onward transfers. Political opinions are sensitive information under Article 23; debate prompts, scores and inferred views need particular scrutiny. Avoid collecting unnecessary sensitive data and assess any required separate consent. [S51]

EU adequacy for the Republic of Korea can support covered EU-to-Korea transfers. It does not itself establish the basis for a Korean user's data going to Romania or an onward model provider. Confirm the applicable direction and recipient scope. [S46]

**AI transparency now in force.** The AI Basic Act and decree took effect on 22 January 2026. MSIT's guidance reaches overseas operators supplying AI services to Korean users. It requires prior AI-use disclosure and distinguishes labels inside the service from labels on downloaded or shared outputs. Exported text can use human-readable marking or notified machine-readable marking; realistic synthetic content has stronger visibility requirements. DebateAI's own interface and exports need assessment. [S53]

MSIT announced a grace period of at least one year and is reviewing implementation. This is not a reason to describe the Act as unenacted or assume that privacy and consumer duties are suspended. Recheck the precise enforcement timetable and any changes before launch. Separately scope high-impact uses and any AI-specific domestic-representative requirement; do not assume that the PIPA representative test answers the AI-law question. [S54]

**Paid services.** The e-commerce law generally allows cancellation within seven days, subject to its starting rules and exceptions. Begun services/digital content require careful treatment, including divisible unprovided portions and the statutory safeguards for restricting withdrawal. A single generated answer does not justify a blanket no-refund clause. Recurring-price increases and free-to-paid recurring conversion require prior consent and specified information; a 30-day notice alone is insufficient. Implement electronic cancellation and the applicable refund process. [S55]

**Draft change.** Add a Korean transfer/consent workflow, AI labeling and local payment rights. Keep the no-automatic-conversion promise; obtain fresh consent where required for a recurring price increase.

### Transfers to providers in these four countries

The provider's brand, contracting address, inference location, support access and user market are different facts. A Chinese-origin open model hosted entirely in the EEA is not automatically a transfer to China. A Japanese or Singaporean contracting entity does not establish that all processing stays there. Map the actual recipients and remote access before applying this comparison.

| Destination from the EEA | Transfer position and required action |
| --- | --- |
| Mainland China | No EU adequacy decision. Identify a valid GDPR route, usually an appropriate Article 46 instrument plus transfer assessment and effective supplementary measures where needed. |
| Japan | EU adequacy within its scope. Verify the covered recipient and Supplementary Rules; assess onward processing separately. |
| Singapore | No EU adequacy decision. Assess the actual entity and transfer safeguards; a Singapore hosting region is not an adequacy mechanism. |
| South Korea | EU adequacy within its scope. Check the covered recipient/data and subsequent processing destinations. |

This table addresses the EEA export leg only. Local export law and contracts may impose additional requirements. Adequacy does not remove GDPR processor-contract, minimisation, security or transparency duties. SCCs require a meaningful assessment; if the necessary protection cannot be achieved, use a different route. Encryption during transport does not prevent the inference provider from seeing plaintext that it must process. [S04] [S12] [S44] [S46]

None of these country rules establishes a provider's retention period, training prohibition or ZDR status. Those remain separate contract, feature and configuration questions. Do not turn a country's adequacy status into a “no retention” claim.

## 3 Where the requested checklist belongs

| Document or control | What it should contain |
| --- | --- |
| Customer Terms of Service | Eligibility; service and AI limitations; plans and trial terms; rate limits; model changes; support and availability; input/output rights; confidentiality; publishing; cancellation and termination; consumer remedies; governing law; non-exclusivity |
| Privacy Notice | Controller and contacts; actual data categories; purposes and legal bases; recipients; retention criteria; transfers and safeguard access; applicable rights and complaint routes; sensitive-data, cookies and automation treatment where relevant |
| Public AI Provider Register | Actual recipient entities and routes; purposes; data; countries; retention and training; ZDR status and exceptions; transfer route; last verification date |
| Internal provider evidence file | Accepted DPA; transfer instrument and annexes; risk assessment; subprocessor notices; endpoint settings; deletion evidence; incident and rights-assistance terms; audit/security material |
| Provider pilot agreement | Exact interface and automation permission; users and volume; business purpose; operational commitments and price; output/cache/publication rights; precise waivers; precedence; termination; confidentiality and liability |

The public register is a transparency tool, not a replacement for the Privacy Notice or the signed agreements. Not every checklist item is a separately enumerated GDPR disclosure duty: verified ZDR status and a verification date are especially useful accuracy controls. Privacy law requires the applicable information in substance; it does not prescribe this exact document title or layout.

## 4 Provider policy research

**Status of every provider below: candidate only.** Public documentation checked on 21 September 2026. Actual use, signed terms, live processing countries and active ZDR were not established. Brand names are not sufficient recipient identities. A reseller, Azure, Amazon Bedrock or another cloud route needs its own entry.

### OpenAI API

The current agreement identifies **OpenAI Ireland Ltd.** for customers located in the EEA or Switzerland, and **OpenAI OpCo, LLC** for customers outside those areas, with a public-sector entity possible by order form. The UK contracting-entity wording is not identical to the governing-law wording; verify the accepted agreement rather than reusing an older regional summary. A Romanian direct customer would ordinarily fall under the Irish entity, subject to its actual order. [S02] [S33]

API inputs are not used for training by default unless the customer opts in. Default abuse-monitoring retention can be up to 30 days, with legal or protective exceptions. Application state has separate rules. ZDR needs approval and configuration; incompatible tools or features can retain state. The documentation flags background processing, files and extended caching, among other distinctions. Regional storage and regional inference have separate scope and exclusions. Actual DebateAI settings remain unverified. [S01]

### Anthropic API

Commercial terms identify **Anthropic Ireland, Limited** for EEA, Switzerland and UK customers and **Anthropic, PBC** elsewhere. Confirm the actual direct or cloud-provider arrangement. The DPA supplies a contractual framework, not evidence that a specific DebateAI transfer or setting is configured correctly. [S03] [S34]

The commercial privacy policy describes default API deletion within 30 days with exceptions for stateful features, contractual arrangements, policy enforcement and law. Current platform documentation describes qualified ZDR arrangements, endpoint and feature exceptions and models requiring retention unless expressly authorised otherwise. These pages have different scopes; obtain written confirmation for the exact model and workspace instead of generalising a retention period to every route. [S35] [S36]

### Gemini API and Google Search grounding

For paid services, the contracting entity follows Google’s regional entity table; a Romanian billing address ordinarily maps to **Google Cloud EMEA Limited**, subject to an existing agreement. Other possible entities depend on billing region and service. [S37]

Gemini’s terms distinguish paid and unpaid data use. They require Paid Services for API clients made available in the EEA, Switzerland or UK; a separate clause extends paid data-use protections where the developer is in those regions. Do not infer eligibility solely from an end user’s IP. Paid protections exclude using prompts/responses for product improvement but allow limited security retention and international processing. They do not establish active ZDR. [S11]

Search grounding has additional restrictions on analysis, caching, redisplay and the audience that receives a result, with narrow storage exceptions; it also specifies 30-day storage for grounding purposes. **Inference for DebateAI:** passing grounded results to competing models, transforming them into argument graphs, or publishing permanent public snapshots may conflict with those conditions. Obtain written rights or use a compatible feature and source-licensing route. This finding does not prohibit ordinary ungrounded Gemini output. [S11]

### Provider territory eligibility for the added markets

The official direct-service availability lists checked on 21 September 2026 include Japan, Singapore and South Korea for the OpenAI API, Anthropic commercial API and Gemini API. Mainland China is absent from those lists. This is a service-policy finding, not a conclusion that every AI provider is prohibited in China. OpenAI warns that offering access outside supported territories can lead to blocking or suspension; Gemini's terms expressly restrict where API clients may be made available. Anthropic also applies ownership-related eligibility conditions. [S56] [S57] [S58] [S11]

**Action.** Verify end-user territories, corporate eligibility and the exact direct/cloud product before routing traffic. A Romanian billing account or server does not itself establish permission to serve mainland users. Obtain an eligible, documented route before launch; do not promise all candidate models in every market. No Chinese, Japanese, Singaporean or Korean local provider is treated as approved by this review. Add any such provider only after its actual entity, contracts, locations and retention settings are checked.

## 5 AI Provider Register template

Create a separate record for each materially different direct, reseller or cloud route. Publish only actual enabled or genuinely available fallback recipients. Keep confidential account identifiers and security reports in the internal evidence file.

| Public field | Required record before enabling the route |
| --- | --- |
| Provider and role | Full recipient legal entity; country of establishment; processor or separately assessed controller role |
| Service scope | Interface; model family/version; endpoint; included tools, caching and storage features; direct or intermediary route |
| Purpose and data | Generation, critique, moderation or retrieval; exact text/context and metadata sent; whether earlier model output is forwarded |
| Processing locations | Inference, storage, logging, support and subprocessor access countries/regions; global fallback conditions; known limits |
| Training | Contractual prohibition/default; opt-in state; evaluation/feedback exceptions; scope of any permitted use |
| Retention | Content, abuse logs, application state, files, caches and backups separately; time limits or objective criteria; legal holds and deletion route |
| ZDR | Active, inactive, or not verified; scope by model/endpoint/feature; enablement date; all material exceptions |
| Transfer safeguards | Adequacy decision and covered entity/scope, or exact SCC/other instrument; how users obtain safeguards information |
| Local market requirements | Enabled user territories; separate-consent triggers; transfer timing/method and refusal consequences where required; local representative or DPO contact; onward-transfer conditions |
| Subprocessors | Link to relevant list and locations; change-notice process; material route changes |
| Verification | Date of public-source check AND separate date of contract/configuration check; review owner; source links |

**Preliminary recipient inventory.** OpenAI Ireland Ltd.; Anthropic Ireland, Limited; and Google Cloud EMEA Limited are candidates for a Romanian direct contracting arrangement, not confirmed actual recipients. All three currently have **actual processing countries pending**, **transfer implementation not verified**, **ZDR not verified** and **contract/settings verification not performed** in this review. Their public terms were checked on 21 September 2026. Do not publish this inventory as if the missing checks were complete. [S02] [S03] [S37]

The internal evidence record should identify the DPA version, correct SCC modules/annexes or adequacy scope, assessment of onward access, subprocessor notifications, deletion test results, and date-stamped evidence of the active project/workspace settings. No private credentials belong in the public register.

## 6 Proposed provider pilot schedule

This is a **negotiation template**, not a signed agreement or a waiver granted by any supplier. Attach it to the provider agreement; complete each field and have both parties agree to any departures. A conversation with a sales representative should not be treated as a waiver unless the provider’s authorised contracting process makes it binding.

### Parties scope and permission

**Parties and term.** [DEBATEAI ENTITY] and [PROVIDER LEGAL ENTITY]. Pilot starts [DATE] and ends [DATE]. No automatic paid conversion; post-pilot service requires the pricing and commitment expressly accepted below.

**Authorised use.** Provider authorises [OFFICIAL API OR SPECIFIED INTERFACE] for automated generation, multi-model argument assessment, scoring, storage/replay and [PRIVATE OR PUBLIC] display within DebateAI. Permitted users are [EMPLOYEES, TESTERS, PAYING END USERS, TERRITORIES]. Traffic limits are [REQUESTS, TOKENS, CONCURRENCY, DAILY/MONTHLY SPEND]. The purpose is [COMMERCIAL PRODUCT AND PILOT OBJECTIVE].

**Consumer-interface exception.** If a consumer interface is exceptionally proposed, identify the exact subscription/account, interface and permitted automation. State each conflicting clause by document, version and clause number, and the precise replacement permission. Unlisted restrictions remain in force. The schedule does not waive law, safety rules or third-party rights. Use the authorised API route unless the provider expressly agrees otherwise.

### Operations and commercial terms

**Models and changes.** List model versions and features, regional routing, fallback rules and feature eligibility. Seek [30/60/90] days’ advance deprecation notice where feasible, an agreed replacement process, and a termination/refund remedy where a material dependency disappears.

**Capacity and support.** Record quotas, rate-limit handling, maintenance, support contact/hours, incident escalation and response targets. Define any uptime calculation, exclusions, credits and remedies. Avoid promising customers greater availability than the product can supply.

**Price.** State pilot credits, included usage, overage approval and cap, currency/tax treatment, post-pilot unit rates, minimum spend, renewal and price-change notice. No undefined “price to be agreed later” authorises continued billable production use.

### Data rights and safeguards

**Rights.** Confirm rights to send provider outputs to other named providers for critique; combine results; store/replay; maintain permitted caches; publish snapshots; and let end users use outputs. Identify excluded third-party/grounding material. Specify which output and cache rights survive expiry, for how long, and subject to which deletion and licence conditions.

**No exclusivity.** Neither party is required to use one provider exclusively. DebateAI may use and evaluate competing providers and publish permitted comparisons, subject to specifically agreed confidentiality or benchmark restrictions.

**Data protection.** Attach the DPA and, where needed, transfer instrument with completed annexes. Identify processing locations, approved subprocessors, advance change notices and a meaningful objection/remedy process. Describe retention by data type, model/feature ZDR exceptions, deletion/return and backup treatment, legal holds, and prohibit model training except for expressly agreed separate opt-in use. Record each permitted user territory, the local transfer basis in each direction, consent/notice responsibilities, and onward-transfer restrictions. A general worldwide licence does not establish territorial service permission.

**Incidents and assistance.** Require notification without undue delay after awareness, a negotiated initial target [HOURS], updates and cooperation, without representing the target as every jurisdiction’s statutory deadline. Include rights-request and regulator assistance, security controls, audit documentation and proportionate audit rights. Address confidentiality and compelled disclosure.

### Exit liability and precedence

**Termination.** Specify expiry, breach/cure, urgent suspension, convenience termination, export and deletion, refunds for unused commitments, and survival of output licences, permitted caches, confidentiality and accrued claims. Prevent loss of public-output rights merely because a pilot ends unless that limit was expressly designed into the product.

**Liability and precedence.** Negotiate caps, exclusions, non-excludable liability, IP claims and data/security exposure. Record governing law and dispute route. This schedule prevails over specifically identified conflicting commercial or consumer clauses; mandatory SCC wording and non-waivable law retain their required priority. Obtain signatures or another valid, evidenced acceptance by authorised representatives.

## 7 Decisions before adopting the revised terms

1. Verify the company’s registered name, address, registration, VAT status, capital and staffed contacts. Replace all bracketed fields and confirm every URL.
2. Accept and implement the proposed Option B for post-closure unpublishing, or commission a coherent replacement for Option A. Test removal, privacy requests, export and recovery.
3. Verify the no-training commitment and every active/fallback provider route. Do not describe an unverified ZDR setting as enabled.
4. Complete the Privacy Notice and public register using actual logs, payloads, purposes and retention schedules. Assess political/sensitive data, cookies and user rights separately.
5. Complete DPAs, transfer safeguards, risk assessments and subprocessor evidence as applicable. Verify the current scope of any adequacy or certification relied upon.
6. Decide actual markets and provide local-language versions and interfaces before targeting them. Complete UK public-content scoping. Resolve mainland China's public-AI operating route and supplier availability; Japan's statutory sales disclosure; Singapore's DPO and PDPA safeguards; and Korea's privacy, transfer and AI-transparency requirements. Check local legal capacity and representative triggers separately.
7. Verify DSA classification, exemptions, moderation reasons, human appeals and the relevant ANCOM and consumer-ADR arrangements.
8. Implement AI labels and applicable marking for the actual service and exports. Do not treat an upstream model’s compliance statement as completing DebateAI’s duties.
9. Before paid access, complete plan prices/limits, consumer trial and renewal disclosures, cancellation, online withdrawal, durable confirmations and statutory remedies. Five-working-day support and 30-day planned-change notices are proposed service commitments.
10. Resolve Google grounding and any other source/tool restrictions before enabling cross-model reuse, permanent public snapshots or long-lived caches. Verify that labels survive export and republication. Have counsel approve the final terms and market-specific addenda. Section 18 of the revised terms is proposed customer language; it does not certify market readiness.

## Sources checked

Official sources were checked on 21 September 2026. “Checked” means public-source research, not verification of DebateAI’s contracts or implementation. Each source below is linked. Some legislative portals exposed indexed extracts but rejected a full-page fetch; this review does not claim a complete consolidation audit. Recheck law and supplier terms when the final policy is adopted.

{{SOURCES}}
