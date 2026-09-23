import {
  buildFramedPrompt,
  readPromptFrame,
  type FramedMaterialField,
  type FramedPrompt,
  type PromptContract,
  type PromptPacket
} from "@debateai/providers";

/**
 * V-11 addendum, layer 1: after RUN1 the provider gateway refuses any packet the
 * frame builder did not make, so a TRANSPORT test — backoff, the byte cap, the
 * response cap, a length failure — needs a real framed packet to exercise the
 * transport at all. These helpers exist so those tests say "a framed fixture"
 * once instead of rebuilding the frame by hand and drifting from it.
 *
 * Deliberately NOT a second frame builder: every helper here calls
 * `buildFramedPrompt`, so a test can never assert against a shape the shipped
 * code does not produce.
 */

export const FIXTURE_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: "test.fixture.v1",
  instruction: "Fixture instruction for a transport test.",
  answerForm: "Return only one JSON object."
});

export function framedFixture(content: string): FramedPrompt {
  return buildFramedPrompt({
    contract: FIXTURE_PROMPT_CONTRACT,
    material: [{ name: "question_line", content }]
  });
}

export function framedFixturePacket(content: string): PromptPacket {
  return framedFixture(content).packet;
}

/**
 * A framed packet whose wire size, measured by the caller's own `wireBytes`, is
 * exactly `totalBytes`. The padding is plain ASCII, so one added character is
 * one added byte through both levels of JSON escaping.
 */
export function framedPacketOfWireSize(
  totalBytes: number,
  wireBytes: (messages: PromptPacket["messages"]) => number
): PromptPacket {
  const overhead = wireBytes(framedFixturePacket("").messages);
  return framedFixturePacket("a".repeat(totalBytes - overhead));
}

/* ------------------------------------------------------------ the reader */

/**
 * Fix round 4 — THE ONE READER a test double or helper may use on a model
 * packet.
 *
 * Three rounds of string sweeps missed shape assumptions INSIDE test doubles:
 * `JSON.parse(message.content)` on a user message that is now a fenced block
 * (it threw into a `catch` and returned `[]` silently, so every review fixture
 * answered with zero edge bearings), a payload key read off the bare envelope,
 * and a route on `system.startsWith(...)` where the system message now opens
 * with the owners' editable instruction. Each was a private copy of the
 * packet's shape; each rotted, unrun, the moment the shape moved.
 *
 * This reader has no private copy. It calls `readPromptFrame` — the exact code
 * the gateway's door runs — so what a test reads is what the provider was sent,
 * and a packet the door would refuse is refused here with the door's own code
 * instead of being read as nothing. `tests/architecture/packet-read-through-the-frame.test.ts`
 * forbids the three shapes above under `tests/integration/` and `acceptance/`,
 * so the next prompt change cannot break a suite silently again.
 */
export interface FramedMaterial {
  /** The prompt contract the packet was built for, e.g. `serve.synthesizer.v1`. */
  readonly contractId: string;
  /** Every material field of every block, in wire order — a repair turn's included. */
  readonly fields: readonly FramedMaterialField[];
}

/** A packet as a double sees it before the type is known: any role string, any content string. */
export interface WirePacket {
  readonly messages: readonly { readonly role: string; readonly content: string }[];
}

export function readFramedMaterial(packet: PromptPacket | WirePacket): FramedMaterial {
  const frame = readPromptFrame(packet as PromptPacket);
  return Object.freeze({ contractId: frame.contractId, fields: frame.fields });
}

/**
 * SYNC3 — THE OWNERS' INSTRUCTION SLOT of a packet the door accepted.
 *
 * dev's support tests read what the model was TOLD — the reviewed context and
 * its OUTPUT CONTRACT — off a `system` string the hardened port no longer has.
 * That text is the instruction slot of the framed system message now, so a
 * double reads it here, after `readPromptFrame` (the door) has accepted the
 * packet, and without the code-owned frame that follows it. The builder
 * refuses an instruction carrying the frame banner (a reserved token), so the
 * FIRST banner is the frame's own, and everything before it is the owners'.
 */
export function framedInstruction(packet: PromptPacket | WirePacket): string {
  readPromptFrame(packet as PromptPacket);
  const system = packet.messages[0]!.content;
  const frameAt = system.indexOf("\n\n--- SAFETY FRAME");
  if (frameAt < 0) throw new TypeError("FRAMED_INSTRUCTION_ABSENT");
  return system.slice(0, frameAt);
}

/**
 * The content of ONE named field. A field that is not there is a loud failure,
 * never an empty default — the empty default is exactly what let ~40 review
 * fixtures emit `edge_bearings: []` without a test going red.
 */
export function framedField(material: FramedMaterial, name: string): string {
  const field = material.fields.find((entry) => entry.name === name);
  if (field === undefined) {
    throw new TypeError(`FRAMED_FIELD_ABSENT:${name}`);
  }
  return field.content;
}

/**
 * The packet inside the body a provider double received on the wire
 * (`{ model, max_tokens, messages }`). Only the messages are returned; a body
 * without them is refused rather than read as an empty packet.
 */
export function wirePacket(body: string): WirePacket {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new TypeError("WIRE_PACKET_NOT_JSON");
  }
  const messages = (parsed as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages)) {
    throw new TypeError("WIRE_PACKET_MESSAGES_ABSENT");
  }
  return Object.freeze({ messages: messages as WirePacket["messages"] });
}
