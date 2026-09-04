import { lstat } from "node:fs/promises";
import { join } from "node:path";

export function captureOffMarkerPath(
  controlDir: string | undefined,
): string | undefined {
  return controlDir === undefined ? undefined : join(controlDir, "CAPTURE_OFF");
}

export async function readCaptureOff(
  markerPath: string | undefined,
): Promise<boolean> {
  if (markerPath === undefined) return false;
  try {
    await lstat(markerPath);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}
