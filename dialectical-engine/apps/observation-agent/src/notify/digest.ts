import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { renderImpact, signalSchema } from "../core/signals.js";

export async function appendDigest(stateDir: string, input: unknown): Promise<void> {
  const signal = signalSchema.parse(input);
  const directory = join(stateDir, "digest");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const day = signal.detected_at.slice(0, 10);
  const time = `${signal.detected_at.slice(11, 19)}Z`;
  const line = `${time} · ${signal.severity} · ${signal.component} · ${signal.class} · ${renderImpact(signal)} · ${signal.signal_id}\n`;
  const handle = await open(join(directory, `${day}.md`), "a", 0o600);
  try {
    await handle.writeFile(line, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
