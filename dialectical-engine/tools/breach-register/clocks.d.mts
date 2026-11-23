export type BreachDeadline = Readonly<
  | { kind: "hours"; amount: number; words: string }
  | { kind: "days"; amount: number; words: string }
  | { kind: "soon"; words: string }
>;

export type BreachClock = Readonly<{
  id: string;
  name: string;
  countries: readonly string[];
  authority: Readonly<{ name: string; trigger: string; deadline: BreachDeadline; how: string }>;
  people: Readonly<{ trigger: string; deadline: BreachDeadline }>;
  finalReport?: Readonly<{ deadline: BreachDeadline }>;
  record: string;
  source: string;
}>;

export const WORKING_TARGET_HOURS: number;
export const RECORD_KEEP_YEARS: number;
export const BREACH_CLOCKS: readonly BreachClock[];
export function deadlineMoment(awareAt: Date, deadline: BreachDeadline): Date | null;
