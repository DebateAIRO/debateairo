# Provider contract facts for the Model providers page

Read on 2026-11-17 from each vendor's own pages and contract documents. These are the sources behind
the DeepInfra and Perplexity rows in `apps/ui/lib/legal/pages.ts`. The Anthropic and Google facts of
`2026-10-10-preview-provider-facts.md` still stand; this note adds to them.

It continues `2026-11-16-deepinfra-perplexity-facts.md`, which read the vendors' public pages a day
earlier. The two agree on DeepInfra; this note adds the text of its agreement. On Perplexity they
differ in one place: the earlier note found no terms specific to the Search API and so recorded "no
training" from the general API Terms. The Search Addendum below is those terms, and the row follows
it. Where Perplexity processes and how to contact it come from the earlier note.

These notes are not legal advice; the owner (and counsel, before the public site) confirms them.

## Is a data processing agreement in place?

Each of these is accepted together with the vendor's terms. None needs a signature or a request.

| Vendor | How the agreement is accepted | Source |
| --- | --- | --- |
| DeepInfra | Its Terms section 5(a) incorporate the agreement by reference; the agreement says it "is accepted by Customer upon Customer's acceptance of the Agreement, without the need for a separate signature" | https://deepinfra.com/terms (last modified 15 October 2026); the agreement, file dated 2026-10-05, from https://trust.deepinfra.com |
| Perplexity | Its API Terms section 6.1 incorporate the Data Processing Addendum by reference | https://www.perplexity.ai/hub/legal/perplexity-api-terms-of-service (updated 23 January 2026); https://www.perplexity.ai/hub/legal/dpa (updated 13 August 2026) |
| Anthropic | Its Commercial Terms incorporate the Data Processing Addendum by reference | https://www.anthropic.com/legal/data-processing-addendum |

## DeepInfra

| Fact | Value on the page | Source |
| --- | --- | --- |
| Where it processes | United States. "Serverless API and dedicated deployments both run in the US only. There is no EU or other non-US region" | Trust centre FAQ, https://trust.deepinfra.com |
| How long it keeps data | Not stored. Terms 7(b): it "will not retain, store, or log any Customer Data ... beyond the period strictly necessary to process and return the applicable request". The exceptions are data kept at the customer's written request for a support case (deleted within 30 days), metadata that holds no content, and records the law requires | https://deepinfra.com/terms, section 7(b) |
| Zero data retention | Yes, for the models DeepInfra hosts. We use neither its batch API nor longer cache retention, which are the two features with their own storage | Terms 7(b); trust centre FAQ |
| May it train on your data? | No. Agreement 3(g): it "will not use the Personal Information to train, fine-tune, develop, validate, or improve any artificial intelligence or machine learning model" | The agreement, section 3(g) |
| Transfer basis | EU standard contractual clauses, Modules 1 to 3, Irish law (agreement, Exhibit B). DeepInfra is not on the EU–US Data Privacy Framework list (searched 2026-11-17, no result), and its own FAQ says it is not certified | The agreement, section 7 and Exhibit B; https://www.dataprivacyframework.gov/list |
| Sub-processors | AWS and Google Cloud (infrastructure) and Stripe (payments), all in the United States | https://trust.deepinfra.com |
| Contact | policy@deepinfra.com; the agreement names dpo@deepinfra.com as the contact for people whose data it holds | https://deepinfra.com/privacy; the agreement, Exhibit A |

### Open: "Partner" models

The facts above cover only the models DeepInfra hosts itself. Its FAQ says models tagged "Partner" on
their model page "run on the partner's infrastructure, and the partner's data policy applies", and
names Qwen3.8-Flash as one of them. Its Terms 7(b) say the same: zero data retention "applies to
models hosted by Provider", and a third-party model is governed by "the applicable third party's
terms". The agreement, section 3(g), adds that by choosing such a model the customer instructs
DeepInfra to send the text to that third party.

`https://deepinfra.com/Qwen/Qwen3.8-Flash` carries the "Partner" tag (read 2026-11-17), and
Qwen3.8-Flash is in the line-up. DeepInfra does not say which company the partner is, where it
processes, or how long it keeps text. The owner asks DeepInfra. Until the answer is in, the partner
has a row of its own on the page (`DEEPINFRA_PARTNER_PROVIDER`), with every fact "[to confirm]".
(24 November 2026: Qwen3.8-Flash left the line-up and the row went; see `2026-11-24-partner-model-out.md`.)

## Perplexity (web search)

We call `POST https://api.perplexity.ai/search`. Perplexity's Search Addendum overrides its API Terms
for that endpoint, so the general API promises (no training, zero retention) do not apply to it.

| Fact | Value on the page | Source |
| --- | --- | --- |
| Company | Perplexity AI, Inc., United States | https://www.perplexity.ai/hub/legal/perplexity-api-terms-of-service |
| How long it keeps data | No period stated. Addendum 2.2: Perplexity "may retain, copy, distribute and otherwise use Search Data for its lawful business purposes, including the improvement and development of products and services". Search Data is the questions sent and the results returned | https://www.perplexity.ai/hub/legal/perplexity-api-terms-of-service-search (updated 22 September 2025), sections 1.1.1 and 2.2 |
| Zero data retention | No. Addendum 1.2.2: obligations for its other products, "e.g., ... zero data retention obligations", "do not apply to the Search Services" | Same page, section 1.2.2 |
| May it train on your data? | Yes, in the sense of the page's question: section 2.2 allows use to improve and develop its products. The Data Processing Addendum, section 5, says personal data "will not be used for training of Perplexity's large language models" | Same page, section 2.2; https://www.perplexity.ai/hub/legal/dpa, section 5 |
| Transfer basis | EU standard contractual clauses, Modules 2 and 3, Irish law (Data Processing Addendum, section 11). Perplexity is not on the EU–US Data Privacy Framework list (searched 2026-11-17, no result) | https://www.perplexity.ai/hub/legal/dpa; https://www.dataprivacyframework.gov/list |
| Where it processes | No region is named. The page says the United States, where Perplexity and every company its trust centre lists as working for it are | `2026-11-16-deepinfra-perplexity-facts.md` |
| Contact | legal-notices@perplexity.ai, the address the API Terms give for notices (section 11.6). Its privacy notice says it does not cover the API | `2026-11-16-deepinfra-perplexity-facts.md`; https://www.perplexity.ai/hub/legal/privacy-notice (updated 23 October 2026) |

### What a search carries

The models write each search themselves: 6 to 12 plain words that name the thing to find, "such as a
report, a statistic, a law, a study or an event", and the instruction ends "never put anything about
the person asking into a search" (`packages/judgement/src/web-prompts.ts`). The search adapter then
holds back any search that carries an email, phone, bank, card or ID number, or a web address with a
query string (`packages/providers/src/perplexity-search.ts`). So Perplexity receives a short phrase
about the topic, which can contain words from the person's question, and nothing that says who asked.

### Applied: the English texts say what web search is

The English Terms (the summary and section 8) and Privacy Policy (the summary, section 4 and section
5) said that the terms of DeepInfra, Anthropic and Perplexity do not allow training on your content.
That was not true of web search. They now say it of DeepInfra and Anthropic, and say of web search
what it receives (the short search phrases the models write) and what Perplexity's terms let it do
(keep them and the results, and use them for its own business, such as improving its search). The
register's intro and the Perplexity row say the same. English only: the version numbers stay 2.18 and
3.12. The other 34 languages still name Perplexity in the no-training sentences, and their Perplexity
row still gives the 30 days of the earlier note; they follow before release.

### Open: names of people in a search

Addendum 2.3: "Customer shall not submit Personal Data ... to the Search Services unless explicitly
authorized by Perplexity in writing". A person's name is personal data, and nothing holds a name back:
a debate about a politician's record produces searches that name the politician. Either Perplexity
authorises that in writing (the owner asks), or the adapter holds such searches back, which would
leave debates about public figures without web evidence.

## Google (kept for later)

Google LLC is listed as active under the EU–US Data Privacy Framework, covering non-HR data
(https://www.dataprivacyframework.gov/list, searched 2026-11-17). The Google row's transfer basis can
be filled from this when a build offers a Google model; today no row for Google is shown.

## Amazon Bedrock, for OpenAI's GPT Luna (the gate and the Register entry are built)

Read in full on 2026-11-17: the AWS Service Terms (last updated 5 November 2026), sections 1.14, 1.23,
1.24 and 50; the AWS Data Processing Addendum and its Supplementary Addendum; the OpenAI Services
Agreement - Amazon Bedrock (version June 2026); the Bedrock pages on data protection, data retention
and abuse detection; the model cards of GPT-5.6 Luna and GPT-6 Luna; the AWS sub-processor list; the
EU–US Data Privacy Framework list. The Register entry was added with the gate (see the end of this
section), from the table below.

### Two contracts, both accepted without a signature

| Contract | With whom | How it is accepted | Source |
| --- | --- | --- | --- |
| AWS Customer Agreement, with the Service Terms and the Data Processing Addendum | Amazon Web Services EMEA SARL, Luxembourg, for an account in Romania; the addendum also binds Amazon Web Services, Inc. | Service Terms 1.14.1: they "incorporate the AWS Data Processing Addendum ... when you use AWS Services to process Customer Data". 1.14.2 adds the Supplementary Addendum, 1.14.3 the EU standard contractual clauses | https://aws.amazon.com/service-terms/; https://aws.amazon.com/agreement/; https://aws.amazon.com/legal/aws-emea-countries |
| OpenAI Services Agreement - Amazon Bedrock | OpenAI Ireland Ltd., for a customer in the EEA | Effective "when Customer first accesses or uses the Services through Amazon Bedrock". Service Terms 50.12.1: "By using a third-party model, you agree to the applicable terms" | https://aws.amazon.com/legal/bedrock/third-party-models/ |

The OpenAI agreement carries no data processing addendum and no sentence on training. It does not need
one for our text, because OpenAI does not receive it (next table): Amazon is the only company that
processes what we send. The OpenAI agreement does bind us to OpenAI's usage policies and to its list of
supported countries, and its section 2.3 forbids, without written approval, a product that gives
third parties "general access to OpenAI models on a pass-through basis". A debate is not that, but a
feature that let a person chat freely with the model would come close.

### Facts for the row

| Fact | Value for the page | Source |
| --- | --- | --- |
| Company | Amazon Web Services EMEA SARL, Luxembourg | AWS Customer Agreement, section 12; AWS EMEA countries page (lists Romania) |
| Does OpenAI see the text? | No. "Users' inputs and model outputs are not shared with any model providers". The data retention page: "Amazon Bedrock does not share your content with model providers for any current mode". The data protection page: model providers "don't have access to Amazon Bedrock logs or to customer prompts and completions" | https://aws.amazon.com/bedrock/faqs/; https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html; https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html |
| May it train on your data? | No. "AWS and the third-party model providers will not use any inputs to or outputs from Amazon Bedrock to train Amazon Nova, Amazon Titan, or any third-party models". Bedrock is also absent from Service Terms 50.3, the list of AI services whose content Amazon may use to improve them. Addendum section 3: AWS "will not access or use, or disclose to any third party, any Customer Data, except ... as necessary to maintain or provide the Services" or to comply with the law | https://aws.amazon.com/bedrock/faqs/; Service Terms 50.3; the addendum, section 3 |
| How long it keeps data | Up to 30 days, and only for requests an automatic filter flags: "For all OpenAI models other than [the open-weight ones], classifier-flagged traffic will be retained for up to 30 days for automated offline abuse detection". Service Terms 50.12.2 add that, on a suspected violation, Amazon "may review the Service inputs and outputs". Kept by Amazon, in the Region that answered the request, not passed to OpenAI | https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html; Service Terms 50.12.2 |
| Zero data retention | No. For these models it exists only on request: "Eligible customers may request full ZDR through their AWS account team" | Same abuse detection page |
| Where it processes | Outside the EEA, whichever way we call it. Neither Luna model has an EU Region or an EU routing profile. In-Region exists only in the United States (GPT-5.6 Luna: N. Virginia, Ohio, Oregon; GPT-6 Luna: N. Virginia). The `us.` profile routes within the United States (and Canada when called from there). From an EU Region only the `global.` profile works, and it sends each request to any commercial AWS Region in the world | https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-luna.html; https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-luna.html; https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html |
| Transfer basis | For the United States: Amazon Web Services, Inc. is an active participant in the EU–US Data Privacy Framework, non-HR data, as a covered entity of Amazon.com, Inc. (list searched 2026-11-17). For any other country outside the EEA: the EU standard contractual clauses, which Service Terms 1.14.3 and the addendum's section 12.2 apply automatically | https://www.dataprivacyframework.gov/list; Service Terms 1.14.3; the addendum, section 12 |
| Sub-processors | Amazon's own companies that run each Region, listed per country. OpenAI is not on the list. A new one is announced 30 days ahead | https://aws.amazon.com/compliance/sub-processors/; the addendum, section 6.1 |
| Contact | aws-EU-privacy@amazon.com | https://aws.amazon.com/privacy/ (updated 17 November 2026) |

### Three settings the facts above depend on

1. Which way we call the model decides the "where" cell. With the United States only (in-Region, or the
   `us.` profile) the row can say "United States" and rest on the Data Privacy Framework. With the
   `global.` profile it has to say "any AWS Region in the world", on standard contractual clauses.
2. The retention mode stays `default` (or `inherit`, which falls back to it). The modes `aws_review`
   and `provider_data_share` allow more than the table says. Under `none` Bedrock blocks any model that
   requires retention, and the abuse detection page lists these models among them. Not tried on an
   account: the model's `allowed_modes`, read from `GET /v1/models/<model>`, settles it.
3. On the Responses API, `store` defaults to `true` under the `default` mode, which keeps every answer
   at Amazon so it can be fetched again. Each request sends `store: false`. The data retention page
   warns that this alone "does not guarantee zero data retention": the 30-day abuse copy of flagged
   requests still applies.

Also to know: Amazon writes to the email address of the AWS account when its abuse detection finds
something, and "may suspend your access" if nobody answers. That address has to be one somebody reads.

### How the build calls the model (20 November 2026)

The Amazon Bedrock gate (`deploy/preview-gate/v3/README-bedrock.md`) settles the three settings above this way:

1. The route is the United States one: the model id `us.openai.gpt-6-luna`, called from the Region `us-east-1`. The
   gate and the app refuse any other id, the worldwide route's included. The model card, read again that day: in-Region
   is "Not supported" in every European Region and there is no `eu.` route; from a European Region only the worldwide
   route can be called. So the row says "United States".
2. Nothing in the build touches the retention mode: it stays what the account has (`default`).
3. The gate calls the Chat Completions API, not the Responses API. Chat Completions has no stored answers, so the
   `store` setting does not exist there and nothing is kept for fetching again. The data retention page ties `store`
   to the Responses API throughout. The 30-day abuse copy of flagged requests applies either way.

The Register entry (`AMAZON_BEDROCK_PROVIDER` in `apps/ui/lib/legal/pages.ts`) carries the wording the owner approved on
20 November 2026; the page shows it once the API's targets reach Bedrock's address. The paragraphs of the Privacy Policy
and the Terms that name Amazon, approved the same day, follow in their own change.
