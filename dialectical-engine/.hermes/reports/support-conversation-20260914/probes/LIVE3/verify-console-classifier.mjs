import assert from "node:assert/strict";
import { classifyConsoleError,emptyConsoleErrorCounts } from "./console-classifier.mjs";

const hostile = "https://example.invalid/?token=do-not-retain user@example.invalid raw-value";
const samples = [
  "Failed to load resource: the server responded with a status of 401",
  "Failed to load resource: 404 Not Found",
  "Uncaught TypeError during hydration",
  hostile
];
const counts = emptyConsoleErrorCounts();
for (const sample of samples) counts[classifyConsoleError(sample)] += 1;
assert.deepEqual(counts,{ HTTP_401: 1,HTTP_404: 1,JS_OR_HYDRATION: 1,OTHER: 1 });
const serialized = JSON.stringify(counts);
assert.equal(serialized.includes(hostile),false);
assert.deepEqual(Object.keys(counts),["HTTP_401","HTTP_404","JS_OR_HYDRATION","OTHER"]);
process.stdout.write(`${serialized}\n`);
