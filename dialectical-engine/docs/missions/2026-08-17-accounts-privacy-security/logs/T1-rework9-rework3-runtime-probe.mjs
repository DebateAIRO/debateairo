#!/Users/vladmihaimiron/.hermes/node/bin/node
import {
  closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";

const expectedRuntime = "/Users/vladmihaimiron/.hermes/node/bin/node";
const probeDirectory = "/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/debateai-t1gate-runtime-probe-586303c8-f8de-4118-b888-9730abf902be";
const sentinelPath = join(probeDirectory, "ok");
if (realpathSync(process.execPath) !== realpathSync(expectedRuntime)) {
  throw new Error("RUNTIME_PROBE_EXECUTABLE_MISMATCH");
}
mkdirSync(probeDirectory, { mode: 0o700 });
const directoryStats = lstatSync(probeDirectory);
const expectedProbeRealpath = join(realpathSync(dirname(probeDirectory)), basename(probeDirectory));
if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()
  || realpathSync(probeDirectory) !== expectedProbeRealpath
  || directoryStats.uid !== process.getuid() || directoryStats.gid !== process.getgid()
  || (directoryStats.mode & 0o777) !== 0o700) {
  throw new Error("RUNTIME_PROBE_DIRECTORY_CUSTODY_MISMATCH");
}
const fd = openSync(sentinelPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
try {
  writeFileSync(fd, "ok\n");
  fsyncSync(fd);
} finally {
  closeSync(fd);
}
const directoryFd = openSync(dirname(sentinelPath), constants.O_RDONLY);
try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
