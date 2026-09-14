import { createDaemon, readDaemonConfig, type DaemonControl } from "./daemon/main.js";
import { createDaemonHeartbeat, type DaemonHeartbeat } from "./daemon/heartbeat.js";

async function stop(
  daemon: DaemonControl,
  heartbeat: DaemonHeartbeat,
  timer: ReturnType<typeof setInterval> | undefined,
  serial: Promise<void>,
): Promise<void> {
  if (timer !== undefined) clearInterval(timer);
  await daemon.stop();
  await serial;
  await heartbeat.close();
  process.exitCode = 0;
}

async function main(): Promise<void> {
  const config = readDaemonConfig(process.env);
  const heartbeat = createDaemonHeartbeat(config.databaseUrl);
  const daemon = createDaemon(config);
  let timer: ReturnType<typeof setInterval> | undefined;
  let serial = Promise.resolve();
  let stopping: Promise<void> | undefined;
  const requestStop = () => {
    stopping ??= stop(daemon, heartbeat, timer, serial);
    stopping.catch((_error) => { process.exitCode = 78; });
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  try {
    await heartbeat.refresh();
    await daemon.start();
    timer = setInterval(() => {
      serial = serial.then(() => heartbeat.refresh(), () => heartbeat.refresh()).catch(() => undefined);
    }, config.pollIntervalMs);
  } catch (error) {
    await daemon.stop().catch(() => undefined);
    await heartbeat.close().catch(() => undefined);
    throw error;
  }
}

main().catch((_error) => {
  process.exitCode = 78;
});
