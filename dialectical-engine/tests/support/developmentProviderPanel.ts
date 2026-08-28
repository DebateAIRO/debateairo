import {
  buildDevelopmentProviderPanel,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL
} from "../../apps/runner/src/dev-provider-panel.js";

export const TEST_DEVELOPMENT_PROVIDER_DOCUMENT = Object.freeze({
  providers: Object.freeze([
    Object.freeze({
      provider_ref: "development:codex-cli",
      maker: "OpenAI",
      base_url: "http://127.0.0.1:8791/v1",
      model: "gpt-test-real",
      authorization_header: "Bearer test-codex"
    }),
    Object.freeze({
      provider_ref: "development:claude-cli",
      maker: "Anthropic",
      base_url: "http://127.0.0.1:8792/v1",
      model: "claude-test-real",
      authorization_header: "Bearer test-claude"
    }),
    Object.freeze({
      provider_ref: "development:grok-cli",
      maker: "xAI",
      base_url: "http://127.0.0.1:8793/v1",
      model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
    })
  ])
});

export const TEST_DEVELOPMENT_PROVIDER_PANEL = buildDevelopmentProviderPanel(
  TEST_DEVELOPMENT_PROVIDER_DOCUMENT.providers.map((provider) => Object.freeze({
    providerRef: provider.provider_ref,
    baseUrl: provider.base_url,
    model: provider.model,
    ...("authorization_header" in provider
      ? { authorizationHeader: provider.authorization_header } : {})
  }))
);
