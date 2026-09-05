import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { isProxy } from "node:util/types";

function isOwnDataEnoent(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  try {
    if (isProxy(error)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor !== undefined
      && Object.prototype.hasOwnProperty.call(descriptor, "value")
      && typeof descriptor.value === "string"
      && descriptor.value === "ENOENT";
  } catch {
    return false;
  }
}

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
    return !isOwnDataEnoent(error);
  }
}
