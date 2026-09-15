import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReplayedOpenSignal } from "../../core/lifecycle.js";

const IMPACT = "Error capture is not wired into the product: no failure is recorded anywhere.";

export type DailyImpactResult =
  | "APPENDED"
  | "ALREADY_PRESENT"
  | "OPEN_IDENTITY_MISSING";

export async function appendDailyNotWiredImpact(
  input: Readonly<{
    stateDir: string;
    runtime: string;
    now: Date;
    openSignals: readonly ReplayedOpenSignal[];
  }>
): Promise<DailyImpactResult> {
  const matches = input.openSignals.filter((open) => {
    const evidence = open.signal.evidence as Readonly<Record<string, unknown>>;
    return open.lifecycle?.owner === "capture-health"
      && open.lifecycle.correlationKey === `not-wired:${input.runtime}`
      && open.signal.state === "OPEN"
      && open.signal.component === "obs_capture"
      && open.signal.class === "CAPTURE_NOT_WIRED"
      && open.signal.impact_code === "IMPACT_CAPTURE_NOT_WIRED"
      && evidence.runtime === input.runtime;
  });
  if (matches.length !== 1) return "OPEN_IDENTITY_MISSING";

  const signalId = matches[0]!.signal.signal_id;
  const timestamp = input.now.toISOString();
  const day = timestamp.slice(0, 10);
  const directory = join(input.stateDir, "digest");
  const path = join(directory, `${day}.md`);
  try {
    const current = await readFile(path, "utf8");
    if (current.split("\n").some((line) =>
      line.includes(" · obs_capture · CAPTURE_NOT_WIRED · ")
      && line.endsWith(` · ${signalId}`))) {
      return "ALREADY_PRESENT";
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const line = `${timestamp.slice(11, 19)}Z · INFO · obs_capture · CAPTURE_NOT_WIRED · ${IMPACT} · ${signalId}\n`;
  const handle = await open(path, "a", 0o600);
  try {
    await handle.writeFile(line, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return "APPENDED";
}
