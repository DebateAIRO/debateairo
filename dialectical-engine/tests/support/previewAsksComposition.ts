/**
 * The asks lock as the hosted preview's env files give it: the API's and the runner's environments parsed by their own
 * parsers (a refusal throws its code), and the preview members of buildApi's options composed from the parsed API
 * environment exactly as apps/api/src/main.ts composes them (tests/unit/lock-asks-boot.test.ts pins main's lines). A
 * test that reaches the routes through this helper meets the value as the API would, parser included.
 */
import type { PreviewAsksOpenTo, PreviewProviderTestConfig } from "@debateai/providers";
import * as runtime from "../../packages/register/src/runtime-environment.js";
import { validApiEnvironmentFixture, validRunnerEnvironmentFixture } from "./apiEnvironmentFixture.js";

/** What a hosted API file must carry beside the fixture (lock-asks-environment.test.ts's own set). */
const HOSTED_API = Object.freeze({
  DEBATEAI_DEPLOYMENT_MODE: "hosted",
  GEOIP_COUNTRY_DB_PATH: "/var/lib/debateai-geoip/dbip-country-lite.mmdb",
  TOR_EXIT_LIST_PATH: "/var/lib/debateai-geoip/tor-exit-list.txt",
  TURNSTILE_SOCKET_PATH: "/run/debateai-turnstile/siteverify.sock"
});

type AsksLock = Readonly<{ PREVIEW_ASKS_OPEN?: PreviewAsksOpenTo; PREVIEW_TEAM_USER_IDS?: readonly string[] }>;

/** The hosted preview's API file with the preview configuration and `lines`, through the API's parser. */
export function parsedPreviewApiEnvironment(previewConfigJson: string, lines: Readonly<Record<string, string>>): AsksLock {
  return runtime.parseApiEnvironment({
    ...validApiEnvironmentFixture(), ...HOSTED_API, PREVIEW_PROVIDER_TEST_CONFIG_JSON: previewConfigJson, ...lines
  }) as AsksLock;
}

/** The hosted preview's runner file with the preview configuration and `lines`, through the runner's parser. */
export function parsedPreviewRunnerEnvironment(previewConfigJson: string, lines: Readonly<Record<string, string>>): AsksLock {
  return runtime.parseRunnerEnvironment({
    ...validRunnerEnvironmentFixture(), DEBATEAI_DEPLOYMENT_MODE: "hosted", PREVIEW_PROVIDER_TEST_CONFIG_JSON: previewConfigJson, ...lines
  }) as AsksLock;
}

/** main.ts's preview members of buildApi's options (the ask application gets the same less previewAsksOpenTo). */
export function previewApiOptionsOf(config: PreviewProviderTestConfig, environment: AsksLock): Readonly<{
  previewProviderTestConfig: PreviewProviderTestConfig; previewTeamUserIds: readonly string[];
  previewAsksOpen?: true; previewAsksOpenTo?: PreviewAsksOpenTo;
}> {
  return Object.freeze({
    previewProviderTestConfig: config, previewTeamUserIds: environment.PREVIEW_TEAM_USER_IDS ?? [],
    ...(environment.PREVIEW_ASKS_OPEN === undefined ? {} : { previewAsksOpen: true as const, previewAsksOpenTo: environment.PREVIEW_ASKS_OPEN })
  });
}
