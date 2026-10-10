# Private preview: provider facts for the Model providers page

Read on 2026-10-10 from the vendors' public pages, for the private preview's model list:
GLM-5.3-Flash (Z.AI), DeepSeek-V4.1-Flash (DeepSeek), MiMo-V2.6-Pro (Xiaomi) and Qwen3.8-Flash
(Alibaba), all served by DeepInfra; Claude Haiku 5.5 through Anthropic's own API; and, kept for
later, Gemini 3.8 Flash through Google's Gemini API, paid tier only.

On 10 October 2026 the owner swapped Gemini for Qwen: "please change the Google Gemeni-3.8-flash
with Qwen3.8-Flash from DeepInfra, since Google is too expensive at the moment (we will use it in
the future)". The Gemini facts below stay for that future; the page shows them only on a build
whose flag names `gemini-3.8-flash`, and no reviewed flag does.

The facts below are what `apps/ui/lib/legal/pages.ts` shows on `/providers` when a preview build
offers the model. A fact we could not check on a public page stays "[to confirm]" on the page.
These notes are not legal advice; the owner (and counsel, before the public site) confirms them.

## Anthropic API (Claude Haiku 5.5)

| Fact | Value on the page | Source (read 2026-10-10) |
| --- | --- | --- |
| Company we contract with | Anthropic Ireland, Limited (for a customer in the EEA, Switzerland or the UK; Anthropic PBC elsewhere) | https://www.anthropic.com/legal/commercial-terms (effective 17 June 2025) |
| Home country | Ireland (Dublin) | https://www.anthropic.com/legal/privacy (effective 10 September 2026) |
| Where it processes | The United States, Europe, Asia or Australia (Anthropic picks the route); stored in the United States | https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers |
| How long it keeps data | Deleted within 30 days; up to 2 years if flagged by its safety checks; longer only when the law requires; the safety-check results (trust and safety classification scores) up to 7 years | https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data |
| Zero data retention | No: available only on Anthropic's approval of a request, and the preview has none on record | https://privacy.claude.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to |
| May it train on your data? | No ("Anthropic may not train models on Customer Content from Services") | https://www.anthropic.com/legal/commercial-terms, section B |
| Transfer basis | EU standard contractual clauses (Modules 2 and 3); the DPA does not rely on the EU–US Data Privacy Framework | https://www.anthropic.com/legal/data-processing-addendum (effective 24 February 2025) |
| Contact | privacy@anthropic.com (the privacy policy also names dpo@anthropic.com) | https://www.anthropic.com/legal/privacy |

## Google Gemini API, paid tier (Gemini 3.8 Flash)

| Fact | Value on the page | Source (read 2026-10-10) |
| --- | --- | --- |
| Company we contract with | Google Cloud EMEA Limited (Ireland) — **to confirm by the owner**: the page maps "Gemini API Paid Services" with a billing address in EMEA (except France, Italy and Poland) to this entity, so it holds only if the preview's Cloud Billing account has a Romanian billing address and no other agreement with Google says otherwise. Shown on the page because the mapping itself was read | https://cloud.google.com/terms/google-entity, linked from the Gemini API terms' definition of "Google" for Paid Services |
| Home country | Ireland (70 Sir John Rogerson's Quay, Dublin 2) | https://cloud.google.com/terms/google-entity |
| Where it processes | Any country where Google or its agents have facilities | https://ai.google.dev/gemini-api/terms (last updated 2026-04-28), Paid Services |
| How long it keeps data | Prompts, context and responses kept 55 days, only to detect and prevent misuse and when the law requires (the terms add safety and security of the service and required legal or regulatory disclosures) | https://ai.google.dev/gemini-api/docs/usage-policies; https://ai.google.dev/gemini-api/terms |
| Zero data retention | No: Google says guaranteed zero data retention needs Vertex AI, not this API | https://ai.google.dev/gemini-api/docs/zdr |
| May it train on your data? | No: on Paid Services Google "doesn't use your prompts … or responses to improve our products" | https://ai.google.dev/gemini-api/terms |
| Transfer basis | [to confirm] — Google's processor terms say Google uses a Data Transfer Solution such as the EU–US Data Privacy Framework, else standard contractual clauses; the official DPF list (dataprivacyframework.gov) needs JavaScript and could not be read, so the page keeps the bracketed "DPF or SCCs — to confirm" line | https://business.safety.google/processorterms/ (section 7, European transfers), linked from the Gemini API terms |
| Contact | legal-notices@google.com (the contact Google's processor terms give, section 12.1) | https://business.safety.google/processorterms/ |

Feature limits that keep these facts true: no Grounding with Google Search or Maps (stored 30 days,
cannot be turned off), no File API uploads, no explicit context caching, and the Interactions API
(if used) with `store` set to false. See https://ai.google.dev/gemini-api/docs/zdr.

## DeepInfra (GLM-5.3-Flash, DeepSeek-V4.1-Flash, MiMo-V2.6-Pro) — recheck

The row checked on 2026-10-05 is kept as it is (training "No"; company Deep Infra Inc.; contact
policy@deepinfra.com; location, retention, zero retention and transfer basis bracketed). Rechecked
2026-10-10:

| Fact | Finding | Source (read 2026-10-10) |
| --- | --- | --- |
| Company | DeepInfra, Inc., a Delaware corporation, Palo Alto, United States | https://deepinfra.com/privacy (last modified 15 August 2026) |
| Training | "We do not use data you submit to our APIs for training models" | https://docs.deepinfra.com/account/data-privacy |
| Retention | Standard inference: inputs and outputs are not stored on disk; bulk inference may be stored briefly | https://docs.deepinfra.com/account/data-privacy |
| Where it processes | The privacy policy says data may be processed "specifically in the United States"; the data page names no region | https://deepinfra.com/privacy |
| Transfer basis | The privacy policy names neither the DPF nor SCCs | https://deepinfra.com/privacy |
| Contact | policy@deepinfra.com; DPO dpo@deepinfra.com | https://deepinfra.com/privacy |

The retention and location findings are candidates for filling those two bracketed facts; the
2026-10-05 review deliberately left them for operational and contract checks, so this change does
not fill them.

## Qwen3.8-Flash through DeepInfra

| Fact | Finding | Source (read 2026-10-10) |
| --- | --- | --- |
| Model id and maker | `Qwen/Qwen3.8-Flash`, described as "Qwen's fast, low-cost model"; the page names the Qwen team, not Alibaba, and the register labels it "Qwen3.8-Flash (Alibaba)" (Qwen is Alibaba's model family) | https://deepinfra.com/Qwen/Qwen3.8-Flash |
| Context window | 1,000,000 tokens | https://deepinfra.com/Qwen/Qwen3.8-Flash |
| Price | $0.113 per million input tokens, $0.382 output, $0.014 cached | https://deepinfra.com/Qwen/Qwen3.8-Flash |
| Licence, data handling, hosting place | Not stated on the model page | https://deepinfra.com/Qwen/Qwen3.8-Flash |
| "Partner" badge | The page shows a "Partner" badge next to the price, with no explanation. DeepInfra's data page says it forwards data to other companies only for Google and Anthropic models; it names neither Qwen nor Alibaba nor "Partner" models | https://deepinfra.com/Qwen/Qwen3.8-Flash; https://docs.deepinfra.com/account/data-privacy |

**Owner to confirm with DeepInfra:** whether "Partner" means DeepInfra forwards Qwen3.8-Flash
requests to another company (for example Alibaba Cloud). If it does, that company receives debate
text and needs its own row on the page before Qwen is switched on. Until then the page names Qwen
only inside the DeepInfra row, under DeepInfra's terms.

On a build that sends Qwen to DeepInfra, the page drops the hosted-site Qwen row, which says Qwen
runs on our own servers in London: on the preview it does not, and showing both would mislead.

## Which jobs each preview provider gets

Read from the multi-model preview register (branch feat/2026-10-10-preview-mm-a-app,
`deploy/preview-auth-dev/v1/publish-register-v2.ts` and `packages/register/src/story-policy.ts`):
every panel member writes and judges arguments; the answer writer and the storyteller is GLM
(`preview:fixture-a`); the answer checker and the story checker is DeepSeek
(`preview:deepseek-v4-1-flash`). So on a per-plan build DeepInfra always receives text for GLM and
DeepSeek, even when the plans list only Anthropic and Google, and the page names them. The DeepInfra
row's jobs (arguments, judging, verdict story) are confirmed. On the first preview's build GLM does
all three alone.

## Still "[to confirm]"

- Google: transfer basis (DPF listing not readable).
- DeepInfra: where it processes, how long it keeps data, zero data retention, transfer basis.
- Anthropic and Google rows: which jobs (arguments, judging, verdict story) each model is given;
  zero data retention is shown as "No" because no zero-retention agreement is on record.
