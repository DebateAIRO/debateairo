import { parseReplaySelfTestEnvironment } from "@debateai/register";

/**
 * L5-F3: the ceremony's connection string arrives on `process.argv`, so it never passed the
 * register loader that floors production database URLs — a remote replay target could carry the
 * operator's credential and every replayed verdict in clear. Routing it through the loader gives
 * it the same floor as every other `*_DATABASE_URL`: in production a non-loopback URL must pin
 * verified TLS, and the URL shape is validated in every environment.
 */
export function replayCeremonyDatabaseUrl(
  databaseUrl: string,
  source: Readonly<Record<string, string | undefined>> = process.env
): string {
  return parseReplaySelfTestEnvironment({
    REPLAY_SELF_TEST_DATABASE_URL: databaseUrl,
    NODE_ENV: source.NODE_ENV
  }).REPLAY_SELF_TEST_DATABASE_URL;
}
