import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { PromptPacket } from "@debateai/providers";
import * as runner from "@debateai/runner";

const CANARY = "CANARY-PARSE-8812";
const REPAIR_MESSAGE = [
  "The prior provider response did not match the declared JSON contract.",
  "code=PROVIDER_CONTENT_UNACCEPTED",
  "safe_template_id=tpl.PROVIDER_CONTENT_UNACCEPTED",
  "template_parameters={}",
  "Return strict JSON that follows the system schema.",
].join("\n");

describe("FIX-03 C3 repair packet", () => {
  it("uses the closed repair template without copying Zod parser text", () => {
    const parsed = z.string().refine(() => false, {
      message: `${CANARY}: planted schema detail`,
    }).safeParse("bad-provider-content");
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.message).toContain(CANARY);

    const build = Reflect.get(runner, "buildSchemaRepairPacket") as unknown;
    expect(build).toBeTypeOf("function");
    if (typeof build !== "function") return;

    const originalMessage = Object.freeze({
      role: "system" as const,
      content: "Return the declared JSON schema.",
    });
    const packet: PromptPacket = Object.freeze({
      messages: Object.freeze([originalMessage]),
    });
    const repaired = (build as (input: PromptPacket, parseError: string) => PromptPacket)(
      packet,
      parsed.error.message,
    );

    expect(repaired.messages).toHaveLength(2);
    expect(repaired.messages[0]).toBe(originalMessage);
    expect(repaired.messages[1]).toEqual({
      role: "user",
      content: REPAIR_MESSAGE,
    });
    expect(JSON.stringify(repaired)).not.toContain(CANARY);
  });
});
