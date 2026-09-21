import assert from "node:assert/strict";
import { projectGuideApiResponse,readGuidePublicResponse } from "./controls.mjs";

const forbidden = ["private-body-marker", "private-parse-exception", "cookie-marker", "header-marker"];
const malformed = await readGuidePublicResponse({
  status: () => 502,
  json: async () => { throw new Error(forbidden[1]); },
});
assert.deepEqual(malformed, { body: null, status: 502 });
assert.equal(forbidden.some((value) => JSON.stringify(malformed).includes(value)), false);

const parsedBody = {
  outcome: "ANSWER_GROUNDED",
  text: "Public answer",
  sources: [],
  actions: [],
};
const parsed = await readGuidePublicResponse({ status: () => 200, json: async () => parsedBody });
assert.deepEqual(parsed, { body: parsedBody, status: 200 });

assert.deepEqual(projectGuideApiResponse({
  outcome: "REFUSE_INJECTION",
  text: "Fixed refusal",
}, 200, "DETERMINISTIC_INJECTION_REFUSAL"), {
  status: 200,
  outcome: "REFUSE_INJECTION",
  text: "Fixed refusal",
  sources: [],
  actions: [],
});

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  result: "PASS",
  controls: 3,
  passed: 3,
  names: [
    "actual response-read boundary preserves JSON rejection as a non-object sentinel",
    "actual response-read boundary preserves a legitimate parsed public body",
    "legacy deterministic omitted decorations still normalize to empty arrays",
  ],
  retained: { numericStatus: true, rawResponse: false, parseException: false, headers: false, cookies: false },
  traffic: { browser: 0, runtime: 0, http: 0, capacity: 0, database: 0, supportRequests: 0, modelRequests: 0 },
}, null, 2)}\n`);
