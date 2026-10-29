export function createMemorySupportCallRecords(): Readonly<{
  reserveModelCall(input: Readonly<{
    at: Date;
    dailyCap: number;
    callId?: string;
    signal?: AbortSignal;
  }>): Promise<Readonly<{ kind: "RECORDED" | "DAILY_CAP" }>>;
  countFor(utcDay: string): number;
}> {
  let day: string | null = null;
  let count = 0;
  return Object.freeze({
    async reserveModelCall(input) {
      const nextDay = input.at.toISOString().slice(0, 10);
      if (day !== nextDay) {
        day = nextDay;
        count = 0;
      }
      if (count >= input.dailyCap) return Object.freeze({ kind: "DAILY_CAP" as const });
      count += 1;
      return Object.freeze({ kind: "RECORDED" as const });
    },
    countFor(utcDay) {
      return day === utcDay ? count : 0;
    }
  });
}
