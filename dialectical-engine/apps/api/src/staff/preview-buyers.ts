import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as contract from "@debateai/contract";
import type { ActionBinding } from "@debateai/kernel";
import type { PostgresPreviewBuyerRepository, PreviewBuyerList } from "@debateai/db";
import { PREVIEW_TEAM_MAX_MEMBERS } from "@debateai/providers";
import { parseCanonicalRegisterJson } from "@debateai/register";
import type { StaffAccessApplication, StaffAuthentication } from "./access.js";
import type { StaffAlertIntentProducer } from "./alerts.js";

/**
 * THE PREVIEW'S APPROVED BUYERS over HTTP (migration 0186). While the site is open to everyone with test payments and
 * buying kept to listed accounts, the Owner allows more accounts to buy on the Team page, or stops them, with no restart.
 *
 * Only the Owner: every route asks TEAM_GRANT and the owner designation before it reads anything, so nobody else learns
 * whether an address has an account or who is listed. A change needs the Owner's fresh hardware-key proof, made by the
 * existing key ceremony under the action TEAM_GRANT and bound by the server to the change, the account, the list's
 * revision and the operation (`canonicalPreviewBuyerBinding`); the database computes the same digest again. An addition
 * needs the team tools unlocked and sends the independent alert; a removal is containment and goes on while they are
 * locked. The typed address only travels in POST bodies: it is turned into the blind index and dropped, and never enters a
 * proof, a row, an answer or a log. The list shows each account's address shortened (`maskedAddress`).
 */
export type PreviewBuyerIntent = Extract<contract.StaffActionIntent, { action: "PREVIEW_BUYER_ADD" | "PREVIEW_BUYER_REMOVE" }>;
export const isPreviewBuyerIntent = (intent: { action: string }): intent is PreviewBuyerIntent =>
  intent.action === "PREVIEW_BUYER_ADD" || intent.action === "PREVIEW_BUYER_REMOVE";
export class PreviewBuyerHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export interface PreviewBuyerStaffService {
  repository: Pick<PostgresPreviewBuyerRepository, "readList" | "findAccount" | "act">;
  /** Opens an account's address on the system login (main.ts: accountEmailReader on X39); null when there is none. */
  readEmail(userId: string): Promise<string | null>;
  /** The address's blind index under the API's key, as sign-up and sign-in compute it; throws on a malformed address. */
  blindIndex(address: string): Buffer;
  /** The team line as this API read it at start: those accounts buy anyway and are never added to the list. */
  teamUserIds: readonly string[];
  /** Whether the list counts on this API now: asks open to everyone with buying kept to listed accounts, on the sandbox. */
  applies: boolean;
}

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const canonical = (body: unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(body)));
const DOTS = "•••";

/**
 * The address as the Owner's list shows it: the part before the @ shortened, the domain in full. The local part is cut
 * into a first, a middle and a last piece of the same size, with three dots between them whatever is left out, so the
 * length never shows; each size leaves out at least two characters:
 *   long, 11 characters or more: pieces of 3 (stefan.nour@example.com reads ste•••n.n•••our@example.com);
 *   medium, 8 to 10: pieces of 2 (anabella@example.com reads an•••be•••la@example.com);
 *   short, 5 to 7: pieces of 1 (maria@example.com reads m•••i•••a@example.com);
 *   very short, 1 to 4: the first character and the dots (anna@example.com reads a•••@example.com).
 * Counting from 0, the middle piece starts half its size (rounded down) before character n/2 (rounded up) of a name of
 * n characters. Characters are code points, so an accented or non-Latin name is cut between characters, never inside
 * one. Null for anything that is not local@domain.
 */
export function maskedAddress(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  const local = Array.from(address.slice(0, at)), domain = address.slice(at + 1);
  if (/[\s@]/u.test(domain) || local.some((character) => /[\s@]/u.test(character))) return null;
  const length = local.length;
  if (length <= 4) return `${local[0]}${DOTS}@${domain}`;
  const size = length >= 11 ? 3 : length >= 8 ? 2 : 1;
  const middle = Math.ceil(length / 2) - Math.floor(size / 2);
  const piece = (from: number) => local.slice(from, from + size).join("");
  return `${piece(0)}${DOTS}${piece(middle)}${DOTS}${piece(length - size)}@${domain}`;
}

/**
 * The proof's binding: the existing action TEAM_GRANT, the account as its target, the list's revision and the operation;
 * the body names the change. A proof made for this list therefore never matches 0085's grant or 0142's partner, whose
 * targets are staff records and whose bodies differ, and theirs never matches this one.
 */
export function canonicalPreviewBuyerBinding(intent: PreviewBuyerIntent["action"], targetUserId: string, expectedRevision: number, operationId: string): ActionBinding {
  const body = { action: "TEAM_GRANT", intent, target_id: targetUserId, expected_revision: expectedRevision, operation_id: operationId };
  return { action: "TEAM_GRANT", targetId: targetUserId, expectedRevision, operationId, bodySha256: sha(canonical(body)) };
}

/**
 * The account a typed address names, for an addition: active, not on the team line, not listed already, and with room
 * (the team line, the list and this account together at most PREVIEW_TEAM_MAX_MEMBERS). Each refusal by name; an
 * address with no account and an account that is not active read the same, PREVIEW_BUYER_ACCOUNT_UNKNOWN.
 */
export async function previewBuyerCandidate(service: PreviewBuyerStaffService, list: PreviewBuyerList, address: string): Promise<string> {
  if (!service.applies) throw new PreviewBuyerHttpError(409, "PREVIEW_BUYERS_NOT_OPEN");
  let index: Buffer;
  try { index = service.blindIndex(address); } catch { throw new PreviewBuyerHttpError(422, "STAFF_INPUT_INVALID"); }
  const account = await service.repository.findAccount(index);
  if (account === null || !account.active) throw new PreviewBuyerHttpError(404, "PREVIEW_BUYER_ACCOUNT_UNKNOWN");
  if (service.teamUserIds.includes(account.userId)) throw new PreviewBuyerHttpError(409, "PREVIEW_BUYER_ON_TEAM");
  if (list.buyers.some((row) => row.userId === account.userId)) throw new PreviewBuyerHttpError(409, "PREVIEW_BUYER_ALREADY");
  if (new Set([...service.teamUserIds, ...list.buyers.map((row) => row.userId), account.userId]).size > PREVIEW_TEAM_MAX_MEMBERS) {
    throw new PreviewBuyerHttpError(409, "PREVIEW_BUYERS_FULL");
  }
  return account.userId;
}

/** The binding for a change the Owner asks for, against the list as it is now: a page looking at another revision is stale before any key is touched. */
export async function previewBuyerBinding(service: PreviewBuyerStaffService, authentication: StaffAuthentication, intent: PreviewBuyerIntent): Promise<ActionBinding> {
  const list = await service.repository.readList(authentication.context, authentication.baseSession.tokenHash);
  if (intent.expected_revision !== list.revision) throw new PreviewBuyerHttpError(409, "PREVIEW_BUYERS_STALE");
  const target = intent.action === "PREVIEW_BUYER_ADD" ? await previewBuyerCandidate(service, list, intent.address)
    : list.buyers.find((row) => row.ref === intent.buyer_ref)?.userId;
  if (target === undefined) throw new PreviewBuyerHttpError(404, "PREVIEW_BUYER_NOT_LISTED");
  return canonicalPreviewBuyerBinding(intent.action, target, list.revision, intent.operation_id);
}

type Route = (method: "GET" | "POST" | "DELETE", path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
function parsed<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PreviewBuyerHttpError(422, "STAFF_INPUT_INVALID");
  return result.data;
}
/** The database's own words for a change it would not make; anything else stays the generic refusal. */
const PLAIN_REFUSALS: Readonly<Record<string, readonly [number, string]>> = Object.freeze({
  PREVIEW_BUYERS_STALE: [409, "PREVIEW_BUYERS_STALE"], PREVIEW_BUYER_ALREADY: [409, "PREVIEW_BUYER_ALREADY"], PREVIEW_BUYERS_FULL: [409, "PREVIEW_BUYERS_FULL"],
  PREVIEW_BUYER_NOT_LISTED: [404, "PREVIEW_BUYER_NOT_LISTED"], PREVIEW_BUYER_ACCOUNT_INVALID: [404, "PREVIEW_BUYER_ACCOUNT_UNKNOWN"],
  STAFF_OPERATION_CONFLICT: [409, "STAFF_OPERATION_CONFLICT"]
});
async function plainRefusals<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    const known = PLAIN_REFUSALS[error instanceof Error ? error.message : ""];
    if (known !== undefined) throw new PreviewBuyerHttpError(known[0], known[1]);
    throw error;
  }
}
const REFUSED = () => new PreviewBuyerHttpError(403, "STAFF_REQUEST_REFUSED");

export function registerPreviewBuyerRoutes(route: Route, service: () => PreviewBuyerStaffService | undefined, access: () => StaffAccessApplication,
  intents: () => Pick<StaffAlertIntentProducer, "mutation">, auth: (request: FastifyRequest) => StaffAuthentication, unlocked: () => Promise<boolean>,
  actionAuthority: (request: FastifyRequest, intent: PreviewBuyerIntent) => Promise<{ authentication: StaffAuthentication; binding: ActionBinding }>): void {
  /** The Owner and nobody else, before anything is read. */
  async function owner(request: FastifyRequest): Promise<StaffAuthentication> {
    const authentication = auth(request);
    await access().requireCapability(authentication, "TEAM_GRANT");
    if (authentication.context.designation !== "OWNER") throw REFUSED();
    return authentication;
  }
  /** Off the preview, or with real payments, there is no list: main.ts hands no service. */
  const present = (): PreviewBuyerStaffService => {
    const value = service();
    if (value === undefined) throw new PreviewBuyerHttpError(404, "NOT_FOUND");
    return value;
  };
  async function proved(request: FastifyRequest, intent: PreviewBuyerIntent, proofHandle: string) {
    const { authentication, binding } = await actionAuthority(request, intent);
    const proof = await access().readActionProof(authentication, proofHandle, binding);
    if (proof === null) throw REFUSED();
    // An addition has come through actionAuthority's lock check; a removal never waits for the alert channel.
    const alertIntent = intent.action === "PREVIEW_BUYER_REMOVE" && !await unlocked() ? null
      : await intents().mutation({ event: intent.action === "PREVIEW_BUYER_ADD" ? "PREVIEW_BUYER_ADDED" : "PREVIEW_BUYER_REMOVED", operationId: binding.operationId,
        keyUserId: authentication.context.userId, actorStaffId: authentication.context.staffId, subjectStaffId: authentication.context.staffId, reason: { code: "GRANT_CHANGE" } });
    const receipt = await present().repository.act({ actor: authentication.context, proof, intent: intent.action, targetUserId: binding.targetId,
      expectedRevision: binding.expectedRevision, operationId: binding.operationId, alertIntent });
    return { operation_id: receipt.operationId, outcome: receipt.outcome, recorded_at: receipt.recordedAt.toISOString() };
  }
  route("GET", "/v1/admin/preview-buyers", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authentication = await owner(request);
    const value = present();
    const list = await value.repository.readList(authentication.context, authentication.baseSession.tokenHash);
    const buyers = [];
    for (const row of list.buyers) {
      let address: string | null = null;
      try { address = await value.readEmail(row.userId); } catch { address = null; }
      buyers.push({ ref: row.ref, masked_address: address === null ? null : maskedAddress(address), since: row.since.toISOString() });
    }
    const page = contract.PreviewBuyersPageSchema.safeParse({ applies: value.applies, team_count: value.teamUserIds.length, cap: PREVIEW_TEAM_MAX_MEMBERS,
      revision: list.revision, buyers });
    if (!page.success) throw new PreviewBuyerHttpError(503, "STAFF_UNAVAILABLE");
    return page.data;
  });
  route("POST", "/v1/admin/preview-buyers/find", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authentication = await owner(request);
    const input = parsed(contract.PreviewBuyerFindRequestSchema, request.body);
    const value = present();
    const list = await value.repository.readList(authentication.context, authentication.baseSession.tokenHash);
    const userId = await previewBuyerCandidate(value, list, input.address);
    const address = await value.readEmail(userId);
    const masked = address === null ? null : maskedAddress(address);
    if (masked === null) throw new PreviewBuyerHttpError(503, "STAFF_UNAVAILABLE");
    return contract.PreviewBuyerFindResponseSchema.parse({ masked_address: masked });
  });
  route("POST", "/v1/admin/preview-buyers", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const input = parsed(contract.PreviewBuyerAddRequestSchema, request.body);
    return plainRefusals(() => proved(request, { action: "PREVIEW_BUYER_ADD", address: input.address, expected_revision: input.expected_revision,
      operation_id: input.operation_id }, input.proof_handle));
  });
  route("DELETE", "/v1/admin/preview-buyers/:ref", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { ref } = parsed(contract.PreviewBuyerRefParamsSchema, request.params);
    const input = parsed(contract.PreviewBuyerRemoveRequestSchema, request.body);
    return plainRefusals(() => proved(request, { action: "PREVIEW_BUYER_REMOVE", buyer_ref: ref, expected_revision: input.expected_revision,
      operation_id: input.operation_id }, input.proof_handle));
  });
}
