import type { CaptureSwitchSample } from "./types.js";

export async function sampleFix07Switch(
  markerPath: string | undefined,
  probe: (path: string) => Promise<void>,
): Promise<CaptureSwitchSample> {
  if (markerPath === undefined || markerPath.length === 0 || markerPath.includes("\0")) {
    return Object.freeze({ effective: "ON", reason: "UNDEFINED_PATH" });
  }
  try {
    await probe(markerPath);
    return Object.freeze({ effective: "OFF", reason: "MARKER_PRESENT" });
  } catch (error) {
    if (error !== null && typeof error === "object" && Object.hasOwn(error, "code") &&
        (error as { code?: unknown }).code === "ENOENT") return Object.freeze({ effective: "ON", reason: "MARKER_MISSING" });
    return Object.freeze({ effective: "OFF", reason: "READ_ERROR" });
  }
}
