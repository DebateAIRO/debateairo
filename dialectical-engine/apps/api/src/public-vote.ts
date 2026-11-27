import { z } from "zod";
import type { PostgresPublicDebateUpvoteRepository } from "@debateai/db";

/**
 * UPVOTES ON PUBLIC DEBATES (design 2026-11-26; migration 0194). One vote per account per debate: casting twice changes
 * nothing, and taking it back removes it. The database decides whether a debate is public right now and whose row it is;
 * the API only hands it the session's account. The three calls run on the request pool under the caller's session, never
 * in a cross-account frame, where the database's "is this connection that owner?" question is answered yes for everyone.
 */
export type PublicVotePorts = Readonly<{
  repository: Pick<PostgresPublicDebateUpvoteRepository, "cast" | "withdraw" | "readOwn">;
}>;

const OwnVoteRefsSchema = z.array(z.uuid()).min(1).max(100);

/** The `refs` query member as Fastify hands it. Null for anything but ONE string of 1 to 100 comma-separated uuids. */
export function ownVoteRefsOf(raw: unknown): readonly string[] | null {
  // A repeated `refs=` arrives as an array, and is refused like any other shape.
  if (typeof raw !== "string") return null;
  // As they are: no trimming, and the limit counts the pieces before duplicates go.
  const pieces = OwnVoteRefsSchema.safeParse(raw.split(","));
  if (!pieces.success) return null;
  return Object.freeze([...new Set(pieces.data.map((ref) => ref.toLowerCase()))]);
}
