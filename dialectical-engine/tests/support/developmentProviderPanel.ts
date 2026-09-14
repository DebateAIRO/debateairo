import {
  buildDevelopmentProviderPanel,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL
} from "../../apps/runner/src/dev-provider-panel.js";

export const TEST_DEVELOPMENT_PROVIDER_DOCUMENT = Object.freeze({
  providers: Object.freeze([
    Object.freeze({
      provider_ref: "development:codex-premium-cli",
      maker: "OpenAI",
      base_url: "http://127.0.0.1:8795/v1",
      model: "gpt-5.6-sol",
      authorization_header: "test-codex-relay-header"
    }),
    Object.freeze({
      provider_ref: "development:claude-premium-cli",
      maker: "Anthropic",
      base_url: "http://127.0.0.1:8796/v1",
      model: "claude-opus-5",
      authorization_header: "test-claude-relay-header"
    }),
    Object.freeze({
      provider_ref: "development:grok-cli",
      maker: "xAI",
      base_url: "http://127.0.0.1:8793/v1",
      model: "grok-4.6-build",
      authorization_header: "test-grok-relay-header"
    }),
    Object.freeze({
      provider_ref: "development:openai-free-api",
      maker: "OpenAI",
      base_url: "https://api.openai.com/v1",
      model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
    }),
    Object.freeze({
      provider_ref: "development:zai-free-api",
      maker: "Z.AI",
      base_url: "https://api.z.ai/api/coding/paas/v4",
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
  })),
  TEST_DEVELOPMENT_PROVIDER_DOCUMENT.providers.map((provider) => Object.freeze({
    providerRef: provider.provider_ref,
    adapterKind: "openai-compatible-http" as const,
    maker: provider.maker
  }))
);
