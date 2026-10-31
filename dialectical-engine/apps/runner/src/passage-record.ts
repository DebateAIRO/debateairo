// apps/runner/src/passage-record.ts
/**
 * PASSAGES OUT OF THE CALL RECORDS (plan 2026-10-31 decisions 6 and 7; migration 0139).
 *
 * Plain words: the AI call records are append-only and replay exactly, so a passage must never enter them, or it could never
 * be deleted. Every prompt of a debate that carries a checked extract (a leg's pack, a reviewer's, grader's, judge's, writer's
 * or storyteller's cited extract, a rewrite's sources) is built over the real text, so the fence is checked against it, and
 * is RECORDED with `webExtractTextRef(extractId)` in its place; only the vendor gets the text (`vendorPacketOf`).
 *
 * The one place: `passageRecordedRequest`, at the bottom of every call of every lane (`createPostgresProviderGateway`), so no
 * prompt builder can forget it; and the replay book's fingerprint reads the same form (`passageRecordedPacket`), since that is
 * what the record holds. A debate's passages are held here from the moment its packs are read until its work item's stages
 * end (`holdRunPassages`, `releaseRunPassages`); a run holding none is today's, the same request object.
 */
import { packetWithPageTexts, packetWithPassageRefs, type PromptPacket, type ProviderCallRequest, type ProviderGateway } from "@debateai/providers";

const held = new Map<string, ReadonlyMap<string, string>>();

/** Reference to text, for one run. Added to what it already holds (a dig's rewrite adds to its packs). */
export function holdRunPassages(runId: string, passages: ReadonlyMap<string, string>): void {
  if (passages.size === 0) return;
  held.set(runId, new Map([...(held.get(runId) ?? []), ...passages]));
}

export function releaseRunPassages(runId: string): void {
  held.delete(runId);
}

/** The packet as the record holds it. */
export function passageRecordedPacket(runId: string | null, packet: PromptPacket): PromptPacket {
  const passages = runId === null ? undefined : held.get(runId);
  return passages === undefined ? packet : packetWithPassageRefs(packet, passages);
}

/** The request with its packet (and every repair packet) in the recorded form; the same request when it carries no passage. */
export function passageRecordedRequest(request: ProviderCallRequest): ProviderCallRequest {
  const passages = request.runId === null ? undefined : held.get(request.runId);
  if (passages === undefined) return request;
  const packet = packetWithPassageRefs(request.packet, passages);
  const repair = request.buildRepairPacket;
  if (packet === request.packet && repair === undefined) return request;
  const inner = request.vendorPacketOf;
  return Object.freeze({
    ...request,
    packet,
    ...(repair === undefined ? {} : { buildRepairPacket: (rejected: Parameters<typeof repair>[0]) => packetWithPassageRefs(repair(rejected), passages) }),
    vendorPacketOf: async (recorded: PromptPacket) => packetWithPageTexts(inner === undefined ? recorded : await inner(recorded), passages)
  });
}

/** A gateway whose every call is recorded in that form. */
export function passageRecordingGateway(gateway: ProviderGateway): ProviderGateway {
  return Object.freeze({ call: (request: ProviderCallRequest) => gateway.call(passageRecordedRequest(request)) });
}
