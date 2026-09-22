import {
  buildFramedPrompt,
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
