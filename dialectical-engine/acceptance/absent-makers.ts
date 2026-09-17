/**
 * F-GROK-SANDBOX-PROFILE: the ONE announcer of a configured maker that did not
 * reach the debate.
 *
 * It lives in its own module because BOTH entry paths that start the relays must
 * use it and neither may import the other: `run-acceptance.ts` already imports
 * `createAcceptanceRuntime` and `loadAcceptanceCeremonyEnvironment` from
 * `main.ts`, so a `main.ts` → `run-acceptance.ts` import would close a cycle.
 * A shared leaf module is the only direction that is not one.
 *
 * The closing run of 2026-09-08 debated on two of three configured makers and
 * its own log could not say so: a rejected relay start became an ABSENT provider
 * probe in a TEMPORARY database and printed nothing at all. A run's log must
 * never pass silently on a maker it was configured to use.
 */

/** One configured maker that did not reach the debate, and why. */
export interface AbsentMaker {
  readonly providerRef: string;
  readonly maker: string;
  readonly failureCode: string;
}

/**
 * One relay start, named by the provider it belongs to.
 *
 * The pairing is the CALLER's knowledge and nothing else can supply it: the
 * ceremony starts three relays [codex, claude, grok] while the standalone boot
 * starts two [claude, grok], against the same three-row configured provider
 * set. An announcer that indexed the provider list by array position would be
 * correct for the ceremony and would report `MAKER ABSENT OpenAI
 * CLAUDE_CLI_FAILED` for the boot — a wrong maker named loudly, which is worse
 * than the silence this whole ticket exists to remove.
 */
export interface NamedRelayStart {
  readonly providerRef: string;
  readonly start: PromiseSettledResult<unknown>;
}

/**
 * Announces every rejected relay start and returns the rows an ABSENT provider
 * probe is recorded from. Announcement and record come from ONE call, so a
 * caller cannot keep the database row while losing the line its log is read
 * from — and the line survives when the database does not.
 */
export function announceAbsentMakers(
  relayStarts: readonly NamedRelayStart[],
  configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[],
  emit: (line: string) => void = (line) => { process.stdout.write(`${line}\n`); }
): readonly AbsentMaker[] {
  const makerByRef = new Map(
    configuredProviders.map((provider) => [provider.providerRef, provider.maker])
  );
  const absent: AbsentMaker[] = [];
  for (const { providerRef, start } of relayStarts) {
    if (start.status === "fulfilled") continue;
    const maker = makerByRef.get(providerRef);
    // A relay the register does not configure has no maker to name and no
    // provider row to record against; the configured-provider set is the
    // authority, exactly as it was before this function existed.
    if (maker === undefined) continue;
    const failureCode = start.reason instanceof Error && start.reason.message.trim() !== ""
      ? start.reason.message
      : "PROVIDER_RELAY_START_FAILED";
    emit(`MAKER ABSENT ${maker} ${failureCode}`);
    absent.push(Object.freeze({ providerRef, maker, failureCode }));
  }
  return Object.freeze(absent);
}
