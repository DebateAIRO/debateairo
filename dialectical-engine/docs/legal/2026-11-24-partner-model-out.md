# Qwen3.8-Flash leaves the line-up, and the partner entry leaves the texts

Written on 24 November 2026. It continues `2026-11-16-deepinfra-perplexity-facts.md` ("The partner model") and
`2026-11-17-provider-contract-facts.md` ("Open: Partner models").

These notes are not legal advice.

## The facts

- Through DeepInfra the site's debates use GLM-5.3-Flash, DeepSeek-V4.1-Flash and MiMo-V2.6-Pro, and until this
  change also Qwen3.8-Flash; Claude Haiku 5.5 comes through Anthropic.
- DeepInfra runs GLM, DeepSeek and MiMo on its own servers. Qwen3.8-Flash carries a "Partner" tag on its DeepInfra
  model page: "This model is served by a partner. Your requests are forwarded to them. Their privacy policy applies."
  The tag was read there on 16 and 17 November 2026 and reported still there on 24 November 2026
  (https://deepinfra.com/Qwen/Qwen3.8-Flash).
- DeepInfra does not name that company, its country, how long it keeps text or its terms. So the Provider Register gave
  it an entry with every fact "[to confirm]", and the Privacy Policy and the Terms said that DeepInfra passes one
  model's requests to a partner company it does not name, and that training was not confirmed for that company.

## The decision

The owner's decision of 24 November 2026: Qwen3.8-Flash leaves the line-up until DeepInfra says who serves it. With it,
the Register's partner entry and every sentence about the partner go: they confuse readers, and once no partner model
is seated they are no longer true.

## What changed

- **The Provider Register (`/providers`).** No entry for DeepInfra's partner. DeepInfra's "where it processes" reads
  "The United States only", and its "how long it keeps data" no longer adds "This covers the models DeepInfra runs on
  its own servers". The DeepInfra row's facts (`2026-11-16` and `2026-11-17` notes) are unchanged and now cover every
  model a debate is given through DeepInfra.
- **The Privacy Policy and the Terms.** The sentences about the partner company are removed: in the summaries ("section
  5 / section 8 says for which company we have not confirmed this yet"), in the paragraph on DeepInfra, in the paragraph
  on training, and in the Privacy Policy's section 4. Nothing is added. The repository's release check refuses a changed
  text under a version number the archive already holds, so the change is a new version of each document (Privacy Policy
  1.1, Terms 1.1), with its own effective date and a summary of what changed.
- **The line-up stays true (code).** Qwen3.8-Flash's preview row is marked `partnerServed`
  (`packages/providers/src/preview-models.ts`). No new settings version may seat a partner-served model: the publish
  kits refuse it in a list of AIs, given or carried from the active version
  (`PREVIEW_LINE_UP_POLICY_INVALID:<list>:partner_served`), and in an answer seat (`answer-seat-partner-served`), and
  check-version names a version an older code sealed with it (`SETTINGS_GATE_PARTNER_SERVED:Qwen/Qwen3.8-Flash`), so the
  release that carries this change never activates one. The row, its prices, its maker and its ref stay, so debates
  already recorded with Qwen read, show and price as before, and a debate admitted on an older version still finishes on
  it. `tests/unit/partner-served-line-up.test.ts` ties the mark to the Register: the Register carries a partner entry if
  and only if a model a new version may seat is partner-served.
- **The order on the server** (`deploy/preview-release/v1/README.md`, "Taking Qwen out of the live line-up"): first an
  activation of a line-up without Qwen, with the release that runs now; then the upload that carries the new texts (its
  practice and its SB3 stop, with the site unchanged, while the active version still seats Qwen); last, Qwen out of the
  DeepInfra gate's `enabled_models` once nothing can still call it.

## What was left, and why

- The website's build lists `multi-model` and `all-models` (`deploy/preview-auth-dev/v1/environment.mjs`) still name
  Qwen. They are only the fallback list a page shows when an older API gives no line-up, and the page that showed them
  (`/new`) now sends visitors to `/v4`. Changing a list would change `ui.env`'s required value at the upload; a later
  upload can drop Qwen from them.
- The website's copy of the makers (`apps/ui/lib/previewPlanRoster.ts`), the colours and the map's maker names keep
  Qwen and Alibaba: they label debates already recorded with it.
- The cost estimate's reader and planner price sets (`apps/api/src/preview-budget-estimate.ts`,
  `packages/budget/src/web-estimate.ts`) still count Qwen among the dearest choices. They only price; who is called comes
  from the line-up.
- The Register's hosted placeholder row "Qwen" (`MODEL_PROVIDERS`, own servers) never shows on the page and is not about
  DeepInfra's partner.

## The letter

A letter asking DeepInfra to name the company that serves Qwen3.8-Flash, where it processes, how long it keeps text,
whether it may train on it, the transfer basis and a contact was drafted on 24 November 2026, for the owner to send.
Bringing Qwen back needs that answer, checked and recorded here, then the company's entry in the Register and in a new
version of both documents, then the code (the release guide's "Bringing Qwen back").
