diff --git a/dialectical-engine/deploy/vps/README.md b/dialectical-engine/deploy/vps/README.md
index 43525a6ad..ed38113a9 100644
--- a/dialectical-engine/deploy/vps/README.md
+++ b/dialectical-engine/deploy/vps/README.md
@@ -19,13 +18,0 @@ a first provision, so read this list before following the section:
-- **§11's hosted provider target example** does not carry
-  `input_price_micros_per_million` / `output_price_micros_per_million`, which
-  both services now REQUIRE in hosted mode: provisioned exactly as printed,
-  each unit refuses at boot with `PROVIDER_TARGET_PRICE_REQUIRED:` and the
-  provider ref.
-- **§11's refusal-code table is incomplete.** Six codes this tree can emit are
-  missing from it: `PROVIDER_TARGET_PRICE_REQUIRED`, `PROVIDER_TARGET_PRICE_ZERO`,
-  `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`, `COST_ENVELOPE_POLICY_UNRESOLVED`,
-  `COST_ENVELOPE_POLICY_INVALID` and `SUPPORT_ADMISSION_SCOPES_NOT_SEALED`.
-- **"the daily call cap is the only ceiling" (§11, the support-chat note) is out
-  of date** as a statement of what the code does: a hosted deployment refuses to
-  start until the cost envelopes are sealed. (§10's own envelope bullet is
-  accurate — it already names `COST_ENVELOPES_NOT_SEALED`.)
@@ -712,2 +699,3 @@ Record each drill: date, artefact, `core.run` count, chain totals, and the decry
-  envelopes are V-28's (until they are sealed, a hosted runner refuses to start with
-  `COST_ENVELOPES_NOT_SEALED`).
+  envelopes are V-28's. Until V-28's cost-envelope policy is sealed at the register version a
+  hosted deployment runs, that deployment refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED`
+  or `COST_ENVELOPE_POLICY_INVALID`.
@@ -749 +737,7 @@ reports, but most vendors report no money at all, so the `cost_usd` column stays
-daily call cap is the only ceiling until the cost envelope (V-28) is published. A reply that
+deployment still needs sealed cost envelopes (V-28). A hosted deployment reads the `costEnvelopePolicy`
+row in force at its own `REGISTER_VERSION` and refuses to start with
+`COST_ENVELOPE_POLICY_UNRESOLVED` when that version sealed none, or with
+`COST_ENVELOPE_POLICY_INVALID` when the row it sealed is malformed.
+`COST_ENVELOPES_NOT_SEALED` is a check on the integrity of the build: it fires only when the
+envelope row this build ships was removed, emptied or made invalid, and the shipped source
+never reaches it at runtime. A reply that
@@ -767,0 +762,2 @@ can start without answering the question. A production unit that omits it refuse
+The paid-vendor probe spends `max_tokens: 8` per target per staleness window; the window is the `panelDiscoveryPolicy` register row's `probe_freshness_ms`, validated only as a positive integer. The development seed publishes `600000`. Hosted mode enforces no minimum, so the number an operator publishes is the whole control.
+
@@ -779 +775 @@ can start without answering the question. A production unit that omits it refuse
-| `COST_ENVELOPES_NOT_SEALED` | the per-run and daily cost envelopes (V-28) are not published yet. A hosted runner refuses to claim work until they are. |
+| `COST_ENVELOPES_NOT_SEALED` | a check on the integrity of the build: the envelope row this build ships was removed, emptied or made invalid. With the shipped source it is unreachable at runtime. The refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, the two rows below. |
@@ -782,0 +779,8 @@ can start without answering the question. A production unit that omits it refuse
+| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | one price member is declared without the other, or a declared amount is not an integer from 0 through `Number.MAX_SAFE_INTEGER`. |
+| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | hosted mode, and a debate target declares no price pair. |
+| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | hosted mode, and a declared input or output price is below 1 micro-unit per million tokens. |
+| `COST_ENVELOPE_POLICY_UNRESOLVED` | no `costEnvelopePolicy` row exists at the resolved `REGISTER_VERSION`. |
+| `COST_ENVELOPE_POLICY_INVALID` | the `costEnvelopePolicy` row exists but does not parse, or its `source_ref` is blank. |
+| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | hosted mode, and the `admissionPolicy` row in force at the resolved `REGISTER_VERSION` lacks at least one of the three support budgets: `support_reads`, `support_sessions`, `support_model_calls`. |
+
+`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed never reaches the other two.
@@ -845,0 +850,2 @@ JSON array; add one object to it. Its members:
+| `input_price_micros_per_million` | an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million input tokens. Declaring either price member without the other refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |
+| `output_price_micros_per_million` | an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million output tokens. Declaring either price member without the other refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |
@@ -848,2 +854,3 @@ JSON array; add one object to it. Its members:
-In `runner.env` the entry for the example above reads `{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","authorization_file":"/etc/debateai/runner/providers/acme.header"}`,
-and in `api.env` the same entry with `/etc/debateai/api/providers/acme.header`.
+In `runner.env` the entry for the example above reads `{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/runner/providers/acme.header"}`.
+In `api.env` it reads `{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/api/providers/acme.header"}`.
+The two illustrative amounts represent the vendor's own published rate in micro-USD per million tokens; replace them per vendor.
