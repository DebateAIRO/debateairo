import { describe, expect, it } from "vitest";
import { appendFramedRejection, buildFramedPrompt } from "@debateai/providers";
import {
  FIXTURE_PROMPT_CONTRACT,
  framedField,
  framedFixture,
  readFramedMaterial,
  wirePacket
} from "../support/framed-packet.js";

/**
 * V-11 addendum, fix round 4 — THE ONE READER a test may use on a model packet.
 *
 * Three rounds of string sweeps missed shape assumptions inside test doubles:
 * `JSON.parse(message.content)` on a user message that is now a fenced block
 * (it threw into a `catch` and returned `[]` SILENTLY), a payload key read off
 * the bare envelope, and a route on `system.startsWith(...)` where the system
 * message now opens with the owners' instruction. Each was a private copy of
 * the packet's shape, and each rotted the moment the shape moved.
 *
 * These cases pin the reader those doubles now share: it reads the frame the
 * shipped door reads, it never returns an empty default, and it fails LOUDLY on
 * anything that is not a framed packet.
 */
describe("readFramedMaterial — the one packet reader for test doubles", () => {
  it("reads the contract id and every field off a packet the shipped builder made", () => {
    const framed = buildFramedPrompt({
      contract: FIXTURE_PROMPT_CONTRACT,
      material: [
        { name: "question_line", content: "Is the reader honest?" },
        { name: "statement", content: "It reads what the door reads." }
      ]
    });

    const material = readFramedMaterial(framed.packet);

    expect(material.contractId).toBe(FIXTURE_PROMPT_CONTRACT.contractId);
    expect(material.fields).toEqual([
      { name: "question_line", content: "Is the reader honest?" },
      { name: "statement", content: "It reads what the door reads." }
    ]);
  });

  it("reads the fields of EVERY block, so a repair turn does not hide the material", () => {
    const framed = framedFixture("the question");
    const repaired = appendFramedRejection(framed.packet, { code: "SCHEMA_FAILED", path: "edge_bearings" });

    const material = readFramedMaterial(repaired);

    expect(material.fields.map((field) => field.name)).toEqual([
      "question_line", "machine_rejection_code", "machine_rejection_path"
    ]);
    expect(framedField(material, "machine_rejection_path")).toBe("edge_bearings");
  });

  it("names a field by its engine vocabulary and FAILS on an absent one — never an empty default", () => {
    const material = readFramedMaterial(framedFixture("the question").packet);

    expect(framedField(material, "question_line")).toBe("the question");
    expect(() => framedField(material, "edges_sourced_by_this_node"))
      .toThrow(/FRAMED_FIELD_ABSENT:edges_sourced_by_this_node/u);
  });

  it("reads the body a provider double receives on the wire, model and max_tokens included", () => {
    const framed = framedFixture("on the wire");
    const body = JSON.stringify({ model: "test-layer/model", max_tokens: 64, messages: framed.packet.messages });

    const material = readFramedMaterial(wirePacket(body));

    expect(material.contractId).toBe(FIXTURE_PROMPT_CONTRACT.contractId);
    expect(framedField(material, "question_line")).toBe("on the wire");
  });

  it("refuses a body that carries no messages array rather than reading nothing", () => {
    expect(() => wirePacket(JSON.stringify({ model: "test-layer/model" })))
      .toThrow(/WIRE_PACKET_MESSAGES_ABSENT/u);
    expect(() => wirePacket("not json")).toThrow(/WIRE_PACKET_NOT_JSON/u);
  });

  it("refuses an unframed packet with the door's own code — the failure the silent catch used to swallow", () => {
    expect(() => readFramedMaterial({ messages: [{ role: "user", content: "{\"fields\":[]}" }] }))
      .toThrow(expect.objectContaining({ code: "PROMPT_FRAME_ABSENT" }));
  });
});
