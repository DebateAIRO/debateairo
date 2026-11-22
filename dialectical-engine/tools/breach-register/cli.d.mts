export function parseArguments(argv: readonly string[]): Readonly<{ command: string | undefined; options: Map<string, string> }>;
export function run(
  argv: readonly string[],
  dependencies?: Readonly<{
    env?: Readonly<Record<string, string | undefined>>;
    now?: () => Date;
    out?: (...lines: string[]) => void;
  }>
): number;
