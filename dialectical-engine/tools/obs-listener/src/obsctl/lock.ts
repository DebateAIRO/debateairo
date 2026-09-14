import { constants } from "node:fs";
import { lstat, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ControlRoot } from "./control-root.js";

const CLOEXEC = (constants as typeof constants & Record<string, number>).O_CLOEXEC ?? (process.platform === "darwin" ? 0x01000000 : 0);

export async function withObsctlLock<T>(root: ControlRoot, callback: () => Promise<T>): Promise<T> {
  const path = join(root.path, "outbox", ".obsctl.lock");
  let handle;
  try { handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW | CLOEXEC, 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new TypeError("OBSCTL_BUSY");
    throw error;
  }
  try {
    await handle.chmod(0o600);
    const opened = await handle.stat({ bigint: true });
    const named = await lstat(path, { bigint: true });
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() || opened.nlink !== 1n ||
        opened.dev !== named.dev || opened.ino !== named.ino || (Number(opened.mode) & 0o7777) !== 0o600) {
      throw new TypeError("FIX10_LOCK_INVALID");
    }
    await handle.sync();
    return await callback();
  }
  finally {
    try {
      const before = await handle.stat({ bigint: true });
      const named = await lstat(path, { bigint: true });
      if (named.dev !== before.dev || named.ino !== before.ino || named.nlink !== 1n) {
        throw new TypeError("FIX10_LOCK_REPLACED");
      }
      await unlink(path);
      const after = await handle.stat({ bigint: true });
      if (after.dev !== before.dev || after.ino !== before.ino || after.nlink !== 0n) {
        throw new TypeError("FIX10_LOCK_REMOVE");
      }
    } finally {
      await handle.close();
    }
    const directory = await open(join(root.path, "outbox"), constants.O_RDONLY | CLOEXEC);
    try { await directory.sync(); } finally { await directory.close(); }
  }
}
