/**
 * TEST-LAYER SHARED WIRE SHAPE — T5/S3-1 review responses (TINT1).
 *
 * The review artifact carries one bearing per edge the reviewed node sources,
 * and the count is pinned to the edges THAT CALL offered. A scripted string
 * cannot know that count, so a fixture declares a POLICY and the provider
 * double expands it against the live request.
 *
 * The default is `cannot-assess`: these doubles do not assess bearings, and
 * they say so in the goal's own vocabulary rather than claiming to have
 * measured zero edges. Null bearings leave their edges UNKNOWN, contribute
 * nothing to propagation, and therefore leave every landed lane's numbers
 * exactly as they were — which is what makes this a contract repair rather
 * than a change to any lane's assertions.
 */
export type ReviewBearingPolicy = "cannot-assess" | { readonly support: number; readonly attack: number };

export interface RequestedReviewEdge {
  readonly ordinal: number;
  readonly relation: "support" | "attack";
  readonly target_statement: string;
}

/** The edges THIS review call offered, read off the wire, never assumed. */
export function requestedReviewEdges(body: string): readonly RequestedReviewEdge[] {
  let request: { messages?: readonly { role: string; content: string }[] };
  try {
    request = JSON.parse(body) as typeof request;
  } catch {
    return [];
  }
  for (const message of request.messages ?? []) {
    if (message.role !== "user") continue;
    try {
      const envelope = JSON.parse(message.content) as {
        fields?: readonly { name: string; content: string }[];
      };
      const field = (envelope.fields ?? []).find((entry) => entry.name === "edges_sourced_by_this_node");
      if (field !== undefined) return JSON.parse(field.content) as readonly RequestedReviewEdge[];
    } catch { /* a non-envelope user message is not the one carrying the edges */ }
  }
  return [];
}

/** One bearing per offered edge, honouring each edge's own polarity. */
export function bearingsForRequest(
  body: string,
  policy: ReviewBearingPolicy = "cannot-assess"
): readonly (number | null)[] {
  return requestedReviewEdges(body).map((edge) => policy === "cannot-assess" ? null : policy[edge.relation]);
}

/** Merges request-derived bearings into a scripted `{outcome, reasons}` body. */
export function withRequestDerivedBearings(content: string, body: string): string {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return content;
  }
  const declared = value["edge_bearings"] as { __policy?: ReviewBearingPolicy } | undefined;
  // A fixture that scripted a literal array means it; only a policy is expanded.
  if (declared?.__policy === undefined) return content;
  return JSON.stringify({ ...value, edge_bearings: bearingsForRequest(body, declared.__policy) });
}

/** A scripted review body whose bearings are resolved against the real request. */
export function reviewArtifact(
  outcome: "agree" | "dispute" | "cannot-assess",
  reasons: readonly string[],
  bearings: ReviewBearingPolicy = "cannot-assess"
): string {
  return JSON.stringify({ outcome, reasons, edge_bearings: { __policy: bearings } });
}
