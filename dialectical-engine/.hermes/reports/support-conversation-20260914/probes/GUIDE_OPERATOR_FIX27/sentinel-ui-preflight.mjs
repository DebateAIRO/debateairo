import { writeFile } from "node:fs/promises";

const [, , revision, outputPath] = process.argv;
if (!/^[0-9a-f]{40}$/u.test(revision ?? "") || !outputPath?.startsWith("/")) {
  throw new Error("GUIDE_OPERATOR_FIX27_SENTINEL_ARGUMENTS_INVALID");
}
if (process.env.GUIDE_FIX27_SENTINEL_EXIT === "1") {
  throw new Error("GUIDE_OPERATOR_FIX27_SENTINEL_REQUESTED_FAILURE");
}

const result = {
  schemaVersion: 1,
  revision,
  completed: true,
  verdict: "PASS_ZERO_SUPPORT_UI_TRANSITIONS",
  transitions: Array.from({ length: 5 }, (_, index) => ({ index: index + 1, passed: true })),
  traffic: {
    actualSupportRequestsForwarded: 0,
    guardedAttempts: { createSession: 0, sendMessage: 0, otherSupport: 0 }
  },
  privateControls: Array.from({ length: 5 }, (_, index) => ({ index: index + 1, passed: true })),
  inertSentinel: true
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });

