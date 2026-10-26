import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("S05 support composition", () => {
  it("passes the register no-source deadline into the answer service", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/api/src/main.ts"), "utf8");
    expect(source).toMatch(/readSupportNoSourceCheckPolicy\(pool,\s*environment\.REGISTER_VERSION\)/u);
    expect(source).toMatch(/\?\? supportNoSourceCheckPolicyStartValues\(\)/u);
    expect(source).toMatch(/createSupportAnswerService\(\{[\s\S]*?noSourceCheck:\s*\{\s*timeoutMs:\s*supportNoSourceCheckPolicy\.timeoutMs\s*\}/u);
  });

  it("keeps the message route's fifteen decisions in the reviewed order", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/api/src/support/index.ts"), "utf8");
    const route = source.slice(source.indexOf('api.post("/v1/support/messages"'),
      source.indexOf('api.get("/v1/support/status"'));
    const anchors = [
      "closedHere(request)", "Buffer.byteLength(body.text", "Object.keys(body)",
      "recognisedSupportCrisis(body.text)", "application === undefined",
      "disabledCode(state)", "admission.observeTime", "[...body.text].length",
      "classifySupportMessage(body.text)", "application.limiter.admit",
      'publicGuideBoundary.kind === "PRIVATE_RECORD_REQUEST"', "modelShare(",
      "application.knowledge.status()", "application.answer.respond", "SUPPORT_RELAY_NOT_COMPOSED"
    ];
    const positions = anchors.map((anchor) => route.indexOf(anchor));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("composes no case or escalation module in main or the routes", () => {
    const main = readFileSync(resolve(process.cwd(), "apps/api/src/main.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "apps/api/src/support/index.ts"), "utf8");
    expect(main).not.toMatch(/from ["']\.\/support\/(?:cases|escalation)[.]js["']/u);
    expect(routes).not.toMatch(/from ["']\.\/(?:cases|escalation)[.]js["']/u);
  });

  it("starts one unref'd interval for both support memory sweeps, once a second", () => {
    const main = readFileSync(resolve(process.cwd(), "apps/api/src/main.ts"), "utf8");
    expect(main.match(/\nconst SUPPORT_COUNTER_SWEEP_MS = 1_000;\n/gu)).toHaveLength(1);
    expect(main.match(/setInterval\(\(\) => \{\s*admission\.sweep\(new Date\(\), SUPPORT_SWEPT_SCOPES\);\s*supportLimiter\.sweep\(Date\.now\(\)\);\s*\}, SUPPORT_COUNTER_SWEEP_MS\)\.unref\(\)/gu))
      .toHaveLength(1);
  });
});
