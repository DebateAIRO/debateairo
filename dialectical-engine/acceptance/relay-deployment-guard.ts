import {
  DeploymentModeInvalidError,
  DeploymentModeUnresolvedError,
  resolveDeploymentMode
} from "@debateai/register";

/**
 * V-9(c): the command-line relays ARE the local mode — anyone running this
 * repository on their own computer, with their own subscriptions — and the
 * hosted site never runs them. Every entry point that can start a relay calls
 * `assertRelayRuntime` FIRST, before it reads a file or starts a CLI:
 *
 * - `dev:auth:up` — apps/runner/src/dev-auth-stack-cli.ts, and the CLI panel it
 *   starts (apps/runner/src/dev-cli-provider-panel.ts)
 * - the acceptance boot, ceremony and dual-maker proof — acceptance/main.ts,
 *   acceptance/run-acceptance.ts and acceptance/dual-maker-proof.ts
 *
 * The relay core (relay-core.ts) calls it again as a backstop, on the process's
 * own environment, at the only two doors every relay passes through: `invokeCli`,
 * where a CLI is started, and `startCliRelayServer`, where a relay listens. A
 * forgotten entry point therefore still starts no CLI and serves no relay; what
 * the backstop cannot stop is a relay's own work before those doors (the Hermes
 * relay reads its credential file first), which is why the entry points check.
 *
 * `hosted` refuses with RELAY_HOST_REFUSED_IN_HOSTED. `resolveDeploymentMode`
 * itself refuses a production process that names no deployment
 * (DEPLOYMENT_MODE_UNRESOLVED) and a mode it does not know
 * (DEPLOYMENT_MODE_INVALID). No mode outside production is `local`.
 */
export class RelayRefusedInHostedError extends TypeError {
  readonly code = "RELAY_HOST_REFUSED_IN_HOSTED";

  constructor() {
    super("RELAY_HOST_REFUSED_IN_HOSTED");
    this.name = "RelayRefusedInHostedError";
  }
}

export function assertRelayRuntime(environment: Readonly<Record<string, string | undefined>>): void {
  if (resolveDeploymentMode(environment.DEBATEAI_DEPLOYMENT_MODE, environment.NODE_ENV) === "hosted") {
    throw new RelayRefusedInHostedError();
  }
}

/**
 * The code of one of the guard's three refusals, or null for anything else. The
 * error's class decides, never its text: a message that merely reads like a
 * refusal code is not one.
 */
export function relayRuntimeRefusalCode(error: unknown): string | null {
  return error instanceof RelayRefusedInHostedError
    || error instanceof DeploymentModeUnresolvedError
    || error instanceof DeploymentModeInvalidError
    ? error.code
    : null;
}
