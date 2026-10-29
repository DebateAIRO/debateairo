import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

/** V, 2026-10-28: the question check's subjects live in one file that the API reads once at boot. */
export const QUESTION_SUBJECTS_PATH = "apps/api/src/question-check/subjects.json";

export const QUESTION_SUBJECT_SCREENS = ["REFUSE", "HELP_NUMBERS", "SENSITIVE"] as const;
export type QuestionSubjectScreen = typeof QUESTION_SUBJECT_SCREENS[number];

export type QuestionSubject = Readonly<{
  id: string;
  covers: string;
  notHealthy: string;
  healthy: string | null;
  examplesNotHealthy: readonly string[];
  examplesHealthy: readonly string[];
  whenNotHealthy: QuestionSubjectScreen;
  emergencyNumber: boolean;
  termsPhrase: string | null;
}>;
export type QuestionSubjects = readonly QuestionSubject[];

const text = z.string().refine(value => value.trim().length > 0, "empty text");
const subjectSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/u).refine(id => id !== "NONE", "NONE is the answer for no subject"),
  covers: text,
  not_healthy: text,
  healthy: text.optional(),
  examples_not_healthy: z.array(text),
  examples_healthy: z.array(text).optional(),
  when_not_healthy: z.enum(QUESTION_SUBJECT_SCREENS),
  emergency_number: z.boolean().optional(),
  terms_phrase: text.optional()
}).strict();
const fileSchema = z.object({ subjects: z.array(subjectSchema).min(1) }).strict();

function invalid(problem: string): never {
  throw new TypedDomainError("QUESTION_SUBJECTS_INVALID", `The question subjects file is invalid: ${problem}`);
}

export function parseQuestionSubjects(value: unknown): QuestionSubjects {
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) invalid(parsed.error.issues[0]?.message ?? "schema");
  const seen = new Set<string>();
  return Object.freeze(parsed.data.subjects.map(subject => {
    if (seen.has(subject.id)) invalid(`duplicate id ${subject.id}`);
    seen.add(subject.id);
    const crisis = subject.when_not_healthy === "HELP_NUMBERS";
    // A help-numbers subject has no healthy part: a crisis question never starts a debate.
    if (crisis && (subject.healthy !== undefined || (subject.examples_healthy?.length ?? 0) > 0)) {
      invalid(`${subject.id} shows help numbers and so has no healthy part`);
    }
    if (!crisis && (subject.healthy === undefined || subject.terms_phrase === undefined)) {
      invalid(`${subject.id} refuses and so needs a healthy line and a Terms phrase`);
    }
    return Object.freeze({
      id: subject.id,
      covers: subject.covers,
      notHealthy: subject.not_healthy,
      healthy: subject.healthy ?? null,
      examplesNotHealthy: Object.freeze([...subject.examples_not_healthy]),
      examplesHealthy: Object.freeze([...(subject.examples_healthy ?? [])]),
      whenNotHealthy: subject.when_not_healthy,
      emergencyNumber: subject.emergency_number ?? false,
      termsPhrase: subject.terms_phrase ?? null
    });
  }));
}

export function readQuestionSubjects(path: string = resolve(QUESTION_SUBJECTS_PATH)): QuestionSubjects {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/u, ""));
  } catch {
    invalid(`cannot read ${path} as JSON`);
  }
  return parseQuestionSubjects(value);
}
