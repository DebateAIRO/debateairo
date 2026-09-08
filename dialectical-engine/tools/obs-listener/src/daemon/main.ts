import {
  createFixagentDeliveryGeneration,
  type FixagentDeliveryGeneration,
  type FixagentDeliveryNotification,
} from "@debateai/obs-capture/chain/fixagent-delivery";
import { deliverOccurrence } from "./fold.js";
import { readKillSwitch } from "../control/reader.js";

export interface DaemonConfig {
  readonly databaseUrl: string;
  readonly pollIntervalMs: number;
  readonly consumer: "fixagent-daemon";
}

export interface DaemonControl {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface DaemonSafety {
  killed(): Promise<boolean>;
  abortLocal(): Promise<void>;
  releaseLease?(): Promise<void>;
}

export type DeliveryGenerationFactory = (
  databaseUrl: string,
) => FixagentDeliveryGeneration;
// Retained as an opaque compatibility seam for the frozen C3 adjacent test.
// Non-generation values are never used as database capabilities.
export type ClientFactory = (databaseUrl: string) => unknown;

function environmentDaemonSafety(): DaemonSafety {
  return Object.freeze({
    killed: async () => readKillSwitch(process.env.OBS_CONTROL_DIR),
    // The current delivery worker has no child process or local model executor;
    // invalidating its generation is its complete local abort boundary.
    abortLocal: async () => undefined,
  });
}

interface ClientGeneration {
  readonly id: number;
  readonly client: FixagentDeliveryGeneration;
  readonly notification: (message: FixagentDeliveryNotification) => void;
  readonly error: (error: Error) => void;
  readonly end: () => void;
  leader: boolean;
  connected: boolean;
}

const CHANNEL = "obs_occurrence_inserted" as const;
export function isValidNotificationPayload(payload: string | undefined): boolean {
  if (payload === undefined || !/^[1-9][0-9]*$/.test(payload)) return false;
  return Number.isSafeInteger(Number(payload));
}

export function readDaemonConfig(env: NodeJS.ProcessEnv): DaemonConfig {
  const databaseUrl = env.OBS_LISTENER_DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new TypeError("OBS_LISTENER_DATABASE_URL_REQUIRED");
  }
  const interval = env.OBS_LISTENER_POLL_INTERVAL_MS;
  if (interval === undefined || !/^[1-9][0-9]*$/.test(interval)) {
    throw new TypeError("OBS_LISTENER_POLL_INTERVAL_MS_INVALID");
  }
  const pollIntervalMs = Number(interval);
  if (!Number.isSafeInteger(pollIntervalMs)) {
    throw new TypeError("OBS_LISTENER_POLL_INTERVAL_MS_INVALID");
  }
  return Object.freeze({ databaseUrl, pollIntervalMs, consumer: "fixagent-daemon" });
}

export function createDaemon(
  config: DaemonConfig,
  generations: ClientFactory = createFixagentDeliveryGeneration,
  safety: DaemonSafety = environmentDaemonSafety(),
): DaemonControl {
  let running = false;
  let generationCounter = 0;
  let current: ClientGeneration | undefined;
  let wakeRequested = false;
  let serialLoop: Promise<void> | undefined;
  let connecting: Promise<void> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const stopForKill = async (): Promise<boolean> => {
    if (!running || !await safety.killed()) return false;
    if (!running) return true;
    running = false;
    if (pollTimer !== undefined) clearInterval(pollTimer);
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    pollTimer = undefined;
    reconnectTimer = undefined;
    await safety.abortLocal();
    if (safety.releaseLease !== undefined) await safety.releaseLease().catch(() => undefined);
    wakeRequested = false;
    return true;
  };

  const generationIsCurrent = (generation: ClientGeneration): boolean =>
    running && current?.id === generation.id;

  const detach = (generation: ClientGeneration): void => {
    generation.client.removeNotification(generation.notification);
    generation.client.removeError(generation.error);
    generation.client.removeEnd(generation.end);
  };

  const scheduleReconnect = (): void => {
    if (!running || reconnectTimer !== undefined) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connectFresh();
    }, config.pollIntervalMs);
  };

  const invalidate = (generation: ClientGeneration): void => {
    if (current?.id !== generation.id) return;
    current = undefined;
    generation.leader = false;
    generation.connected = false;
    detach(generation);
    void generation.client.close().catch(() => undefined);
    scheduleReconnect();
  };

  const selectPending = async (generation: ClientGeneration): Promise<string | undefined> => {
    return generation.client.selectPending();
  };

  const tryLeadership = async (generation: ClientGeneration): Promise<boolean> => {
    generation.leader = await generation.client.tryLeadership();
    return generation.leader;
  };

  const runSerial = async (): Promise<void> => {
    while (running && wakeRequested) {
      wakeRequested = false;
      const generation = current;
      if (generation === undefined || !generation.connected) {
        scheduleReconnect();
        continue;
      }
      try {
        if (await stopForKill()) {
          invalidate(generation);
          continue;
        }
        if (!generation.leader && !await tryLeadership(generation)) continue;
        while (generationIsCurrent(generation) && generation.leader) {
          if (await stopForKill()) {
            invalidate(generation);
            break;
          }
          const occurrenceId = await selectPending(generation);
          if (occurrenceId === undefined) break;
          if (await stopForKill()) {
            invalidate(generation);
            break;
          }
          await deliverOccurrence(generation.client, occurrenceId);
        }
      } catch {
        invalidate(generation);
      }
    }
  };

  const kick = (): void => {
    if (!running) return;
    wakeRequested = true;
    if (serialLoop !== undefined) return;
    serialLoop = runSerial().finally(() => {
      serialLoop = undefined;
      if (running && wakeRequested) kick();
    });
  };

  async function connectFresh(): Promise<void> {
    if (!running || current !== undefined || connecting !== undefined) return connecting;
    const attempt = (async () => {
      if (await stopForKill()) return;
      const supplied = generations(config.databaseUrl);
      const client = supplied !== null && typeof supplied === "object"
        && "withDelivery" in supplied && "selectPending" in supplied
        ? supplied as FixagentDeliveryGeneration
        : createFixagentDeliveryGeneration(config.databaseUrl);
      const id = ++generationCounter;
      let generation!: ClientGeneration;
      generation = {
        id,
        client,
        leader: false,
        connected: false,
        notification: (message) => {
          if (generationIsCurrent(generation)
            && message.channel === CHANNEL
            && isValidNotificationPayload(message.payload)) kick();
        },
        error: () => invalidate(generation),
        end: () => invalidate(generation)
      };
      current = generation;
      client.onNotification(generation.notification);
      client.onError(generation.error);
      client.onEnd(generation.end);
      try {
        await client.connect();
        if (!generationIsCurrent(generation)) return;
        generation.connected = true;
        await client.listen();
        if (!generationIsCurrent(generation)) return;
        await tryLeadership(generation);
        if (generation.leader) kick();
      } catch {
        invalidate(generation);
      }
    })();
    connecting = attempt.finally(() => { connecting = undefined; });
    return connecting;
  }

  return Object.freeze({
    async start(): Promise<void> {
      if (running) return;
      running = true;
      pollTimer = setInterval(() => {
        void stopForKill().then((killed) => {
          if (killed && current !== undefined) invalidate(current);
          else if (!killed) kick();
        });
      }, config.pollIntervalMs);
      await connectFresh();
      while (serialLoop !== undefined) await serialLoop;
    },
    async stop(): Promise<void> {
      if (!running) return;
      running = false;
      wakeRequested = false;
      if (pollTimer !== undefined) clearInterval(pollTimer);
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      pollTimer = undefined;
      reconnectTimer = undefined;
      const generation = current;
      current = undefined;
      if (generation !== undefined) {
        generation.leader = false;
        generation.connected = false;
        detach(generation);
        await generation.client.close().catch(() => undefined);
      }
      if (connecting !== undefined) await connecting;
      if (serialLoop !== undefined) await serialLoop;
    }
  });
}
