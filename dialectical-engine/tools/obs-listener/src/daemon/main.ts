import type { Client, Notification } from "pg";
import {
  createFixagentDeliveryGeneration,
  type FixagentDeliveryGeneration,
} from "@debateai/obs-capture/chain/fixagent-delivery";
import { deliverOccurrence } from "./fold.js";

export interface DaemonConfig {
  readonly databaseUrl: string;
  readonly pollIntervalMs: number;
  readonly consumer: "fixagent-daemon";
}

export interface DaemonControl {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type DaemonClient = Pick<Client, "connect" | "query" | "on" | "removeListener" | "end">;
export type ClientFactory = (databaseUrl: string) => DaemonClient;

interface ClientGeneration {
  readonly id: number;
  readonly client: FixagentDeliveryGeneration;
  readonly notification: (message: Notification) => void;
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

export function createDaemon(config: DaemonConfig, clients: ClientFactory): DaemonControl {
  let running = false;
  let generationCounter = 0;
  let current: ClientGeneration | undefined;
  let wakeRequested = false;
  let serialLoop: Promise<void> | undefined;
  let connecting: Promise<void> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

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
        if (!generation.leader && !await tryLeadership(generation)) continue;
        while (generationIsCurrent(generation) && generation.leader) {
          const occurrenceId = await selectPending(generation);
          if (occurrenceId === undefined) break;
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
      const client = createFixagentDeliveryGeneration(clients(config.databaseUrl));
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
      pollTimer = setInterval(kick, config.pollIntervalMs);
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
