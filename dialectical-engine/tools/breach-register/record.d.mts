export type Telling = Readonly<
  | { state: "open" }
  | { state: "told"; at: Date }
  | { state: "not-required"; reason: string }
>;

export type BreachRecord = Readonly<{
  id: string;
  title: string;
  status: "open" | "closed";
  awareAt: Date | null;
  openedAt: Date | null;
  closedAt: Date | null;
  happened: string | null;
  people: Readonly<{ known: boolean; count: number | null }>;
  risk: string | null;
  keepUntil: string;
  written: ReadonlyMap<string, string>;
  regions: ReadonlyMap<string, Readonly<{
    count: Readonly<{ known: boolean; count: number | null }>;
    authority: Telling;
    people: Telling;
    finalReport: Telling | undefined;
    lateBecause: string;
  }>>;
}>;

export const RECORD_FILE: string;
export const SECTIONS: readonly (readonly [heading: string, hint: string])[];
export function newRecordText(input: Readonly<{ id: string; title: string; awareAt: Date; openedAt: Date; practice: boolean }>): string;
export function readRecord(text: string): Readonly<{ record: BreachRecord; broken: string[] }>;
export function owed(record: BreachRecord, now: Date): Readonly<{ late: string[]; next: string[]; toClose: string[] }>;
export function keepUntil(closedAt: Date): string;
export function closedText(text: string, closedAt: Date): string;
