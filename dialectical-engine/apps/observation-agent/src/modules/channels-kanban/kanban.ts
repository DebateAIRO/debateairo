import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { z } from "zod";
import { ObservationError } from "../../core/errors.js";
import { renderImpact, signalSchema } from "../../core/signals.js";
import type { RoutedChannelExecutor } from "../routing/router.js";

const execFileAsync = promisify(execFile);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const CREATED_TASK = /^Created ([A-Za-z0-9][A-Za-z0-9._-]{0,63})  \(running, assignee=-\)\r?\n?$/u;
const listItemSchema = z.object({
  id: z.string().regex(SAFE_IDENTIFIER),
  title: z.string().min(1).max(256)
}).passthrough();

export type KanbanExecute = (
  file: string,
  args: readonly string[],
  timeoutMs: number
) => Promise<Readonly<{ stdout: string; stderr: string }>>;

async function executeHermes(
  file: string,
  args: readonly string[],
  timeoutMs: number
): Promise<Readonly<{ stdout: string; stderr: string }>> {
  const result = await execFileAsync(file, [...args], {
    timeout: timeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    env: {
      HOME: homedir(),
      PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    }
  });
  return Object.freeze({ stdout: result.stdout, stderr: result.stderr });
}

export function parseKanbanList(source: string): readonly Readonly<{ id: string; title: string }>[] {
  try {
    const value: unknown = JSON.parse(source);
    if (!Array.isArray(value)) throw new Error("not top-level array");
    return Object.freeze(z.array(listItemSchema).parse(value).map(({ id, title }) =>
      Object.freeze({ id, title })));
  } catch (error) {
    throw new ObservationError("OBSERVATION_KANBAN_LIST_INVALID", error);
  }
}

function ticketId(stdout: string): string {
  try {
    const parsed: unknown = JSON.parse(stdout);
    const id = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Readonly<{ id?: unknown }>).id
      : undefined;
    if (typeof id === "string" && SAFE_IDENTIFIER.test(id)) return id;
  } catch {}
  const human = CREATED_TASK.exec(stdout);
  if (human?.[1] !== undefined) return human[1];
  throw new ObservationError("OBSERVATION_KANBAN_RESPONSE_INVALID");
}

export function createKanbanDeliveryExecutor(input: Readonly<{
  board: string;
  hermesPath: string;
  execute?: KanbanExecute;
}>): RoutedChannelExecutor {
  if (!SAFE_IDENTIFIER.test(input.board)
    || !/^\/[A-Za-z0-9_@+./-]+$/u.test(input.hermesPath)
    || input.hermesPath.split("/").includes("..")) {
    throw new ObservationError("OBSERVATION_KANBAN_CONFIG_INVALID");
  }
  const execute = input.execute ?? executeHermes;
  return async (candidate, now, context) => {
    const signal = signalSchema.safeParse(candidate);
    if (!signal.success || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new ObservationError("OBSERVATION_KANBAN_SIGNAL_INVALID");
    }
    const common = ["kanban", "--board", input.board] as const;
    if (signal.data.state === "CLEARED") {
      if (context.openExternalRef === null || !SAFE_IDENTIFIER.test(context.openExternalRef)) {
        throw new ObservationError("OBSERVATION_KANBAN_REFERENCE_INVALID");
      }
      await execute(input.hermesPath, [
        ...common, "comment", context.openExternalRef, renderImpact(signal.data),
        "--author", "observation-agent"
      ], 2_000);
      return Object.freeze({ deliveredAt: now, externalRef: context.openExternalRef });
    }
    const title = `dialectical-engine ${signal.data.severity} ${signal.data.component} ${signal.data.class}`;
    const result = await execute(input.hermesPath, [
      ...common, "create", title, "--body", renderImpact(signal.data),
      "--created-by", "observation-agent", "--idempotency-key",
      `${signal.data.component}:${signal.data.class}:${signal.data.signal_id}`, "--json"
    ], 2_000);
    return Object.freeze({ deliveredAt: now, externalRef: ticketId(result.stdout) });
  };
}
