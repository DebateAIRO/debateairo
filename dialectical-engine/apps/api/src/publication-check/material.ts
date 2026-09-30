import type { PublicDebate, PublicationPartKind } from "../../../../packages/contract/src/index.js";

export const CHECKED_TEXT_PATHS: readonly { path: string; kind: PublicationPartKind }[] = [
  { path: "question", kind: "QUESTION" },
  ...["confidence_band", "summary_segments[].text", "badges[]", "residual_objections[]", "reversal_point"]
    .map(path => ({ path: `answer.${path}`, kind: "SUMMARY" as const })),
  ...["claim", "base_score.kind", "base_score.source", "base_score.producer", "base_score.replay_handle",
    "final_strength.kind", "final_strength.source", "final_strength.producer", "final_strength.replay_handle",
    "locator", "abstention.question_class", "abstention.register_row_key", "abstention.unlock_condition"]
    .map(path => ({ path: `answer.nodes[].${path}`, kind: "ARGUMENTS" as const })),
  { path: "answer.nodes[].review.reasons[]", kind: "REVIEWS" },
  ...["headline", "summary", "confidence", "paths[].line", "change.text", "reviewer_note.text"]
    .map(path => ({ path: `story_short.${path}`, kind: "STORY" as const }))
];

export function isExcludedTextPath(path: string, schemaType: string): boolean {
  if (schemaType === "enum" || schemaType === "literal") return true;
  if (["public_ref", "published_at", "author_pseudonym", "language", "answer.as_of"].includes(path)) return true;
  if (path === "floor" || path.startsWith("floor.") || path === "answer.edges" || path.startsWith("answer.edges[]")) return true;
  const segments = path.split(".").map(segment => segment.replace(/\[\]$/, ""));
  return segments.some(segment => segment === "maker_lineage" || segment === "reviewer_lineage"
    || /_(ref|refs|id|at|as_of)$/.test(segment));
}

export type CheckedText = Readonly<{ kind: PublicationPartKind; text: string }>;

function leavesAt(value: unknown, segments: readonly string[]): string[] {
  if (segments.length === 0) return typeof value === "string" ? [value] : [];
  if (value === null || typeof value !== "object") return [];
  const segment = segments[0]!;
  const array = segment.endsWith("[]");
  const child = (value as Record<string, unknown>)[array ? segment.slice(0, -2) : segment];
  if (array) return Array.isArray(child) ? child.flatMap(item => leavesAt(item, segments.slice(1))) : [];
  return leavesAt(child, segments.slice(1));
}

export function extractCheckedText(snapshot: PublicDebate): readonly CheckedText[] {
  return CHECKED_TEXT_PATHS.flatMap(({ path, kind }) => leavesAt(snapshot, path.split(".")).map(text => ({ kind, text })));
}

/**
 * FIX-HS2-t (TEST rehearsal, supersedes D-S02-15's cross-kind packing): every judge call carries exactly ONE part
 * kind. Measured on the real judge: the §5 fallback question alone was BLOCK 4/4, packed in one call with a refuting
 * summary it was ALLOW 3/4 — the other parts of a call dilute a part's verdict. With one kind per call no other part
 * shares the call, so no other part can lower that part's verdict; R6 still combines the calls BLOCK > UNSURE >
 * UNAVAILABLE > ALLOW. Leaves of one kind stay together in path order and are split only by the code-point budget.
 */
export function packJudgeCalls(leaves: readonly CheckedText[], maxCodePoints = 12_000): readonly {
  fields: readonly { name: string; content: string }[];
}[] {
  if (!Number.isSafeInteger(maxCodePoints) || maxCodePoints < 1) throw new RangeError("Invalid material budget");
  const calls: { fields: { name: string; content: string }[] }[] = [];
  let fields: { name: string; content: string }[] = [], size = 0;
  const flush = () => { if (fields.length) calls.push({ fields }); fields = []; size = 0; };
  for (const leaf of leaves) {
    const points = [...leaf.text], name = leaf.kind.toLowerCase();
    if (fields.length && fields[0]!.name !== name) flush();
    if (points.length > maxCodePoints) {
      flush();
      for (let offset = 0; offset < points.length; offset += maxCodePoints) {
        fields = [{ name, content: points.slice(offset, offset + maxCodePoints).join("") }];
        size = Math.min(maxCodePoints, points.length - offset);
        if (size === maxCodePoints) flush();
      }
      continue;
    }
    const existing = fields.find(field => field.name === name);
    if (size + points.length + (existing ? 2 : 0) > maxCodePoints) flush();
    const field = fields.find(field => field.name === name);
    if (field) { field.content += "\n\n" + leaf.text; size += 2; }
    else fields.push({ name, content: leaf.text });
    size += points.length;
  }
  flush();
  return calls;
}
