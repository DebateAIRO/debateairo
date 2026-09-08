import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { sampleFix07Switch } from "./fix07-switch-mirror.js";

export function readCaptureSwitch(controlRoot: string | undefined) {
  const marker = controlRoot === undefined ? undefined : join(controlRoot, "CAPTURE_OFF");
  return sampleFix07Switch(marker, async (path) => { await lstat(path); });
}

export async function readKillSwitch(controlRoot: string | undefined): Promise<boolean> {
  if (controlRoot === undefined || !isAbsolute(controlRoot) || normalize(controlRoot) !== controlRoot || controlRoot === "/") {
    return true;
  }
  try {
    const [canonical, root] = await Promise.all([realpath(controlRoot), lstat(controlRoot, { bigint: true })]);
    if (canonical !== controlRoot || !root.isDirectory() || root.isSymbolicLink() ||
        (Number(root.mode) & 0o7777) !== 0o751) return true;
    try {
      await lstat(join(controlRoot, "KILL"), { bigint: true });
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ENOENT";
    }
  } catch {
    return true;
  }
}
