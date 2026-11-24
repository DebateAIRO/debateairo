# Qwen3.8-Flash leaves the line-up, and the partner entry leaves the texts

Written on 24 November 2026. It continues `2026-11-16-deepinfra-perplexity-facts.md` ("The partner model") and
`2026-11-17-provider-contract-facts.md` ("Open: Partner models").

These notes are not legal advice.

## The facts

- Through DeepInfra the site's debates use GLM-5.3-Flash, DeepSeek-V4.1-Flash and MiMo-V2.6-Pro, and until this
  change also Qwen3.8-Flash; Claude Haiku 5.5 comes through Anthropic.
- DeepInfra runs GLM, DeepSeek and MiMo on its own servers. Qwen3.8-Flash carries a "Partner" tag on its DeepInfra
  model page: "This model is served by a partner. Your requests are forwarded to them. Their privacy policy applies."
  The tag was read there on 16 and 17 November 2026 and seen there again on 24 November 2026
  (https://deepinfra.com/Qwen/Qwen3.8-Flash).
- DeepInfra does not name that company, its country, how long it keeps text or its terms. Its list of subprocessors,
  read on 24 November 2026, names AWS, GCP and Stripe, and not that company. So the Provider Register gave it an entry
  with every fact "[to confirm]", and the Privacy Policy and the Terms said that DeepInfra passes one model's requests
  to a partner company it does not name, and that training was not confirmed for that company.

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
  1.1, Terms 1.1). Each says in section 14 what changed, without bringing the partner back: section 5 of the Privacy
  Policy (section 8 of the Terms) now says that DeepInfra runs on its own servers every model a debate is given through
  it, and the summary (and the Privacy Policy's section 4) were changed to match. Their effective day is the upload day,
  set in every place at once with `pnpm run legal:redate --date YYYY-MM-DD` (`deploy/preview-release/v1/README.md`, "The
  legal texts' day").
- **The line-up stays true (code).** Qwen3.8-Flash's preview row is marked `partnerServed`
  (`packages/providers/src/preview-models.ts`). No new settings version may seat a partner-served model: the publish
  kits refuse it in a list of AIs, given or carried from the active version
  (`PREVIEW_LINE_UP_POLICY_INVALID:<list>:partner_served`, which the native operator prints in full), and in an answer
  seat (`answer-seat-partner-served`), and check-version names a version an older code sealed with it
  (`SETTINGS_GATE_PARTNER_SERVED:Qwen/Qwen3.8-Flash`), so the release that carries this change never activates one. The
  row, its maker and its ref stay, so debates already recorded with Qwen read and show as before, and a debate admitted
  on an older version still finishes on it. `tests/unit/partner-served-line-up.test.ts` pins the set
  of partner-served models (Qwen3.8-Flash alone): taking one off needs the provider's facts checked and recorded here,
  and the Register entry filled, first.
- **The order on the server** (`deploy/preview-release/v1/README.md`, "Taking Qwen out of the live line-up"): first an
  activation of a line-up without Qwen, with the release that runs now; then the upload that carries the new texts, once
  QWENOUT shows that neither the active version nor an open debate can still call Qwen (its practice and its SB3 stop,
  with the site unchanged, while the active version still seats Qwen); last, Qwen out of the DeepInfra gate's
  `enabled_models` once nothing can still call it.
- **The activation, done.** On 24 November 2026 the owner activated, on the release that runs, settings version 27: Free
  GLM-5.3-Flash, DeepSeek-V4.1-Flash and Claude Haiku 5.5; Premium the same and MiMo-V2.6-Pro. The thinking table was left
  as it was and still has an entry for Qwen3.8-Flash, which seats nothing; the answer seats were not changed. The upload
  and the gate step are still to come.

## What was left, and why

- The website's build lists `multi-model` and `all-models` (`deploy/preview-auth-dev/v1/environment.mjs`) still name
  Qwen. They are only the fallback list a page shows when an older API gives no line-up, and the page that showed them
  (`/new`) now sends visitors to `/v4`. Changing a list would change `ui.env`'s required value at the upload; a later
  upload can drop Qwen from them.
- The website's copy of the makers (`apps/ui/lib/previewPlanRoster.ts`), the colours and the map's maker names keep
  Qwen and Alibaba: they label debates already recorded with it.
- The estimate's reader and planner sets (`apps/api/src/preview-budget-estimate.ts`, `packages/budget/src/web-estimate.ts`)
  still include Qwen. They only estimate; who is called comes from the line-up.
- The Register's hosted placeholder row "Qwen" (`MODEL_PROVIDERS`, own servers) never shows on the page and is not about
  DeepInfra's partner.

## Terms section 14 and this change

- **What the section says.** For a change that does not reduce anyone's rights, the Terms promise to post the new version
  with a summary of what changed and to email account holders at least 30 days before it takes effect; using the
  service after that day means accepting it. A change that reduces rights needs express acceptance at the next sign-in.
  No change is ever retroactive. Unlike the Privacy Policy's section 14, which lets a clarification that changes nothing
  about what is done simply be posted, the Terms have no exception for such a change. The rule itself is not changed.
- **The accounts on the day of this change.** On 24 November 2026 the only accounts on the site are the operator's own.
  No outside person has accepted Terms 1.0, so nobody outside the operator would receive the email.
- **What 1.1 changes.** It removes the description of a company DeepInfra forwarded one model's requests to, which no
  longer receives anything. It changes no right or duty of anyone, and the re-acceptance floors stay at 1.0.
- **The choice.** Whether Terms 1.1 takes effect on the upload day without the 30-day wait is the owner's choice. It is
  recorded in the line below before the upload that carries 1.1 (the release guide's "The legal texts' day" asks for
  it before SB1). The two possible answers, and what the upload then does with today's tools:
  - "Terms 1.1 takes effect on the upload day, posted with its summary and without the email". The upload runs
    `legal:redate` with the upload day, as the release guide says.
  - "Terms 1.0 stays in force for 30 days after the email to account holders, and Terms 1.1 takes effect then". The
    email goes from the operator to every account holder first. `legal:redate` sets one day for both documents, so the
    upload runs it with the day 30 days after the email, and Privacy Policy 1.1 and Terms 1.1 both carry that day. The
    1.0 texts stay in force until then; they only say more than is needed (they still describe the partner, which no
    longer receives anything).
- **Not reviewed by counsel.** This reading of section 14 has not been reviewed by counsel.

The owner's answer: OPEN (not yet given).

## The letter

A letter asking DeepInfra to name the company that serves Qwen3.8-Flash, where it processes, how long it keeps text,
whether it may train on it, the transfer basis and a contact, and to send that company's terms, was sent on 24 November
2026 to DeepInfra's privacy and policy addresses. Bringing Qwen back needs that answer, checked and recorded here, then
the company's entry in the Register and in a new version of both documents, then the code (the release guide's
"Bringing Qwen back").
