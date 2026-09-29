import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { observeProviderTarget } from "../../packages/providers/src/provider-probe.js";

const PROBE_MESSAGES = [{
  role: "user", content: "DR-181 discovery health probe. Reply exactly: OK"
}];

function probeBodyIsLiteral(body: string): boolean {
  const decoded = JSON.parse(body) as { messages: unknown; max_tokens: unknown };
  return isDeepStrictEqual(decoded.messages, PROBE_MESSAGES)
    && decoded.max_tokens === 8
    && !body.includes("CONTENT RULE");
}

async function captureProbe(): Promise<string[]> {
  const bodies: string[] = [];
  await observeProviderTarget({
    target: { providerRef: "p:1", maker: "test-maker", baseUrl: "http://127.0.0.1:1/v1", model: "m" },
    timeoutMs: 1_000,
    fetchImplementation: async (_url, init) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ model: "m", choices: [{ message: { content: "OK" } }] }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    },
    clock: () => new Date(0)
  });
  return bodies;
}

describe("S01 R6 unframed health probes", () => {
  // Property: the real probe makes one call with one fixed user message,
  // eight output tokens and no content rule. Any extra prompt material fails.
  it("R6-a — sends only the literal health probe", async () => {
    expect((await captureProbe()).map(probeBodyIsLiteral)).toEqual([true]);
  });

  // Property: the checker refuses appended debate text, an extra turn, a
  // different budget, or a rule hidden elsewhere in the request body.
  it("R6-a-neg — rejects contaminated requests", async () => {
    const [body] = await captureProbe();
    const decoded = JSON.parse(body!);
    const mutations = [
      { ...decoded, messages: [{ ...PROBE_MESSAGES[0], content: PROBE_MESSAGES[0]!.content + " Also answer the debate question." }] },
      { ...decoded, messages: [...PROBE_MESSAGES, { role: "user", content: "extra" }] },
      { ...decoded, max_tokens: 9 },
      { ...decoded, extra: "CONTENT RULE" }
    ];
    expect(mutations.map((value) => probeBodyIsLiteral(JSON.stringify(value)))).toEqual([false, false, false, false]);
  });

  // Property: the acceptance twin contains exactly one literal probe and no
  // content rule. This is the source-shape pin required by S01-15.
  it("R6-a2 — pins the acceptance discovery twin", async () => {
    const source = await readFile(new URL("../../acceptance/discovery.ts", import.meta.url), "utf8");
    const literal = 'messages: [{ role: "user", content: "DR-181 discovery health probe. Reply: OK" }]';
    expect({ occurrences: source.split(literal).length - 1, ruleFree: !source.includes("CONTENT RULE") })
      .toEqual({ occurrences: 1, ruleFree: true });
  });
});
