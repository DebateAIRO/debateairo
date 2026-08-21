export const BLIND_SAMPLE_EXCERPT_MAX_BYTES = 4_096 as const;

export interface BlindEvaluationSample {
  readonly sampleId: string;
  readonly questionExcerpt: string;
  readonly taskExcerpt: string;
  readonly grade: string;
  readonly reasons: readonly string[];
}

function truncateUtf8Excerpt(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= BLIND_SAMPLE_EXCERPT_MAX_BYTES) return value;
  let excerpt = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > BLIND_SAMPLE_EXCERPT_MAX_BYTES) break;
    excerpt += character;
    bytes += characterBytes;
  }
  return excerpt;
}

export function createBlindEvaluationSample(input: {
  readonly sampleId: string;
  readonly questionExcerpt: string;
  readonly taskExcerpt: string;
  readonly grade: string;
  readonly reasons: readonly string[];
  readonly [key: string]: unknown;
}): BlindEvaluationSample {
  for (const [field, value] of [
    ["sampleId", input.sampleId],
    ["questionExcerpt", input.questionExcerpt],
    ["taskExcerpt", input.taskExcerpt],
    ["grade", input.grade]
  ] as const) {
    if (value.trim() === "") throw new TypeError(`BLIND_SAMPLE_${field.toUpperCase()}_INVALID`);
  }
  if (!input.reasons.every((reason) => reason.trim() !== "")) {
    throw new TypeError("BLIND_SAMPLE_REASONS_INVALID");
  }
  return Object.freeze({
    sampleId: input.sampleId,
    questionExcerpt: truncateUtf8Excerpt(input.questionExcerpt),
    taskExcerpt: truncateUtf8Excerpt(input.taskExcerpt),
    grade: input.grade,
    reasons: Object.freeze([...input.reasons])
  });
}
