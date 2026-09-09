import { execFile } from "node:child_process";

type Executor = (file: string, args: readonly string[], timeoutMs: number) => Promise<void>;

async function execute(file: string, args: readonly string[], timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(file, [...args], { timeout: timeoutMs }, (error) => {
      if (error === null) resolve();
      else reject(error);
    });
  });
}

export async function deliverJournalFailureDirect(input: Readonly<{
  execute?: Executor;
  timeoutMs: number;
}>): Promise<void> {
  const expression = "display notification \"ObservationAgent cannot write its journal: signals may be lost until storage is restored.\" with title \"dialectical-engine: observation_agent SEVERE\" subtitle \"AGENT_SELF\"";
  await (input.execute ?? execute)("/usr/bin/osascript", ["-e", expression], input.timeoutMs);
}
