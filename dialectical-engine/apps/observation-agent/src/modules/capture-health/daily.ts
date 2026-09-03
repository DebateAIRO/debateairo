import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";

const IMPACT = "Error capture is not wired into the product: no failure is recorded anywhere.";

export async function appendDailyNotWiredImpact(
  stateDir: string,
  runtime: string,
  now: Date
): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const directory = join(stateDir, "digest");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const line = `00:00:00Z · INFO · obs_capture · CAPTURE_NOT_WIRED · ${IMPACT} · daily:${runtime}:${day}\n`;
  const handle = await open(join(directory, `${day}.md`), "a", 0o600);
  try {
    await handle.writeFile(line, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
