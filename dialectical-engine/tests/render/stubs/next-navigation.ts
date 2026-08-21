let calls = 0;

export function notFound(): never {
  calls += 1;
  throw new Error("NEXT_NOT_FOUND");
}

export function resetNotFoundCalls(): void {
  calls = 0;
}

export function readNotFoundCalls(): number {
  return calls;
}
