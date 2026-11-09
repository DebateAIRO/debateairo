/**
 * Side-by-side spec §13 (S14) — `pnpm settings:check-api <version>`: check-version's API half, run from a release's API
 * folder under that release's API env (on the preview: as the API unit's user with its env file, S15's root wiring). It
 * prints exactly one report line, `DEBATEAI_SETTINGS_CHECK <json>` (before it, V4 start step Task 42, one
 * `DEBATEAI_SETTINGS_WARNING <json>` line per note, which is never a finding), and exits 0 (PASS) or 1 (FAIL); exit 2 when it could not
 * check (a bad argument, an unreadable environment, an unreachable database), with one content-free line on stderr and
 * no report line. No AI call, no credential or key file, no write.
 *
 * Every decision lives in ./settings-check.ts and @debateai/register's settings-check-report.ts. This file only opens
 * things: the environment (after the argument), one small pool on the API's runtime login (closed whatever happens).
 */
import { pathToFileURL } from "node:url";
import { createPool } from "@debateai/db";
import { loadApiEnvironment, runSettingsCheckCommand } from "@debateai/register";
import { checkAdmissionSettingsVersion, settingsWarningLine } from "./settings-check.js";

/**
 * The whole command, its outputs injected (tests); returns the exit code. V4 start step, Task 42: each note the check
 * found (a gate pot already spent today) is printed as its own `DEBATEAI_SETTINGS_WARNING <json>` line once the check
 * has finished, before the report line; a check that could not finish prints none.
 */
export async function runApiSettingsCheckCli(
  args: readonly string[],
  output: Readonly<{ stdout(text: string): void; stderr(text: string): void }>
): Promise<0 | 1 | 2> {
  return runSettingsCheckCommand({
    args,
    output,
    check: async (version) => {
      const environment = loadApiEnvironment();
      // One reader at a time: the check's steps run one after another. Its own name in pg_stat_activity.
      const pool = createPool(environment.DATABASE_URL, { max: 2, connectionTimeoutMillis: 5000, name: "api:settings-check" });
      const warnings: string[] = [];
      try {
        const report = await checkAdmissionSettingsVersion({ pool, environment, version, onWarning: (code) => { warnings.push(code); } });
        for (const code of warnings) output.stdout(settingsWarningLine("api", code));
        return report;
      } finally {
        await pool.end().catch(() => undefined);
      }
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runApiSettingsCheckCli(process.argv.slice(2), {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); }
  });
}
