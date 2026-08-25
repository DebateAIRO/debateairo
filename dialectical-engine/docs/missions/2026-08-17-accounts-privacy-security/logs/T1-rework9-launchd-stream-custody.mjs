#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  closeSync, constants, existsSync, fsyncSync, lstatSync, openSync, readFileSync,
  realpathSync, renameSync, unlinkSync, writeSync
} from "node:fs";
import { dirname, join } from "node:path";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => { throw new Error(code); };
const same = (actual, expected, code) => {
  if (actual !== expected) fail(code);
};
const tuple = (path) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`LAUNCHD_STREAM_NOT_REGULAR:${path}`);
  return Object.freeze({ path, sha256: sha256(readFileSync(path)), size: stats.size,
    mtime_ms: stats.mtimeMs, device: stats.dev, inode: stats.ino, mode: stats.mode & 0o777,
    uid: stats.uid, gid: stats.gid });
};
const sameTuple = (actual, expected, code) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code);
};
const fsyncDirectory = (path) => {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
};
const exactPlan = (receiptDir, runTmpdir) => Object.freeze({
  controller: Object.freeze({
    stdout: Object.freeze({ launchd_path: join(runTmpdir, "controller.stdout.log"),
      receipt_path: join(receiptDir, "controller.stdout.log") }),
    stderr: Object.freeze({ launchd_path: join(runTmpdir, "controller.stderr.log"),
      receipt_path: join(receiptDir, "controller.stderr.log") })
  }),
  worker: Object.freeze({
    stdout: Object.freeze({ launchd_path: join(runTmpdir, "worker.stdout.log"),
      receipt_path: join(receiptDir, "worker.stdout.log") }),
    stderr: Object.freeze({ launchd_path: join(runTmpdir, "worker.stderr.log"),
      receipt_path: join(receiptDir, "worker.stderr.log") })
  })
});

const validatePlan = (plan, receiptDir, runTmpdir) => {
  same(JSON.stringify(plan), JSON.stringify(exactPlan(receiptDir, runTmpdir)),
    "LAUNCHD_STREAM_PLAN_MISMATCH");
  same(realpathSync(dirname(plan.controller.stdout.receipt_path)), realpathSync(receiptDir),
    "LAUNCHD_STREAM_RECEIPT_PARENT_MISMATCH");
  same(realpathSync(dirname(plan.controller.stdout.launchd_path)), realpathSync(runTmpdir),
    "LAUNCHD_STREAM_PRIVATE_PARENT_MISMATCH");
};

const sealOne = ({ sourcePath, destinationPath, receiptDir, runTmpdir }) => {
  same(realpathSync(dirname(sourcePath)), realpathSync(runTmpdir),
    `LAUNCHD_STREAM_PRIVATE_PARENT_MISMATCH:${sourcePath}`);
  same(realpathSync(dirname(destinationPath)), realpathSync(receiptDir),
    `LAUNCHD_STREAM_RECEIPT_PARENT_MISMATCH:${destinationPath}`);
  const sourceBefore = tuple(sourcePath);
  same(sourceBefore.mode, 0o600, `LAUNCHD_STREAM_SOURCE_MODE_MISMATCH:${sourcePath}`);
  same(sourceBefore.uid, process.getuid(), `LAUNCHD_STREAM_SOURCE_UID_MISMATCH:${sourcePath}`);
  same(sourceBefore.gid, process.getgid(), `LAUNCHD_STREAM_SOURCE_GID_MISMATCH:${sourcePath}`);
  const sourceFd = openSync(sourcePath, constants.O_RDONLY);
  try { fsyncSync(sourceFd); } finally { closeSync(sourceFd); }
  const bytes = readFileSync(sourcePath);
  same(sha256(bytes), sourceBefore.sha256, `LAUNCHD_STREAM_SOURCE_READ_MISMATCH:${sourcePath}`);
  const temporary = `${destinationPath}.tmp-launchd-stream-${process.pid}`;
  const destinationFd = openSync(temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeSync(destinationFd, bytes);
    fsyncSync(destinationFd);
  } finally {
    closeSync(destinationFd);
  }
  const temporaryTuple = tuple(temporary);
  same(temporaryTuple.sha256, sourceBefore.sha256,
    `LAUNCHD_STREAM_TEMP_HASH_MISMATCH:${destinationPath}`);
  same(temporaryTuple.size, sourceBefore.size,
    `LAUNCHD_STREAM_TEMP_SIZE_MISMATCH:${destinationPath}`);
  if (existsSync(destinationPath)) {
    const existing = tuple(destinationPath);
    same(existing.mode, 0o600, `LAUNCHD_STREAM_RECEIPT_MODE_MISMATCH:${destinationPath}`);
    same(existing.uid, process.getuid(), `LAUNCHD_STREAM_RECEIPT_UID_MISMATCH:${destinationPath}`);
    same(existing.gid, process.getgid(), `LAUNCHD_STREAM_RECEIPT_GID_MISMATCH:${destinationPath}`);
    same(existing.sha256, sourceBefore.sha256,
      `LAUNCHD_STREAM_RECEIPT_HASH_MISMATCH:${destinationPath}`);
    same(existing.size, sourceBefore.size,
      `LAUNCHD_STREAM_RECEIPT_SIZE_MISMATCH:${destinationPath}`);
    unlinkSync(temporary);
  } else {
    renameSync(temporary, destinationPath);
  }
  fsyncDirectory(receiptDir);
  const sourceAfter = tuple(sourcePath);
  sameTuple(sourceAfter, sourceBefore, `LAUNCHD_STREAM_CHANGED_DURING_SEAL:${sourcePath}`);
  const receipt = tuple(destinationPath);
  same(receipt.sha256, sourceAfter.sha256,
    `LAUNCHD_STREAM_FINAL_HASH_MISMATCH:${destinationPath}`);
  same(receipt.size, sourceAfter.size,
    `LAUNCHD_STREAM_FINAL_SIZE_MISMATCH:${destinationPath}`);
  return Object.freeze({ launchd: sourceAfter, receipt });
};

export const sealLaunchdStreams = ({ plan, receiptDir, runTmpdir }) => {
  validatePlan(plan, receiptDir, runTmpdir);
  return Object.freeze({
    controller: Object.freeze({
      stdout: sealOne({ sourcePath: plan.controller.stdout.launchd_path,
        destinationPath: plan.controller.stdout.receipt_path, receiptDir, runTmpdir }),
      stderr: sealOne({ sourcePath: plan.controller.stderr.launchd_path,
        destinationPath: plan.controller.stderr.receipt_path, receiptDir, runTmpdir })
    }),
    worker: Object.freeze({
      stdout: sealOne({ sourcePath: plan.worker.stdout.launchd_path,
        destinationPath: plan.worker.stdout.receipt_path, receiptDir, runTmpdir }),
      stderr: sealOne({ sourcePath: plan.worker.stderr.launchd_path,
        destinationPath: plan.worker.stderr.receipt_path, receiptDir, runTmpdir })
    })
  });
};

export const verifySealedLaunchdStreams = ({ receipt, plan, receiptDir, runTmpdir }) => {
  validatePlan(plan, receiptDir, runTmpdir);
  same(receipt?.complete, true, "LAUNCHD_STREAM_RECEIPT_INCOMPLETE");
  for (const processName of ["controller", "worker"]) {
    for (const streamName of ["stdout", "stderr"]) {
      const expectedPaths = plan[processName][streamName];
      const binding = receipt?.streams?.[processName]?.[streamName];
      if (binding === undefined) {
        fail(`LAUNCHD_STREAM_RECEIPT_BINDING_MISSING:${processName}:${streamName}`);
      }
      same(binding.launchd.path, expectedPaths.launchd_path,
        `LAUNCHD_STREAM_RECEIPT_SOURCE_PATH_MISMATCH:${processName}:${streamName}`);
      same(binding.receipt.path, expectedPaths.receipt_path,
        `LAUNCHD_STREAM_RECEIPT_DESTINATION_PATH_MISMATCH:${processName}:${streamName}`);
      const actualSource = tuple(expectedPaths.launchd_path);
      const actualReceipt = tuple(expectedPaths.receipt_path);
      sameTuple(actualSource, binding.launchd,
        `LAUNCHD_STREAM_FINAL_SOURCE_CHANGED:${processName}:${streamName}`);
      sameTuple(actualReceipt, binding.receipt,
        `LAUNCHD_STREAM_FINAL_RECEIPT_CHANGED:${processName}:${streamName}`);
      same(actualSource.sha256, actualReceipt.sha256,
        `LAUNCHD_STREAM_FINAL_HASH_DIVERGED:${processName}:${streamName}`);
      same(actualSource.size, actualReceipt.size,
        `LAUNCHD_STREAM_FINAL_SIZE_DIVERGED:${processName}:${streamName}`);
    }
  }
  return true;
};

export const expectedLaunchdStreamPlan = exactPlan;
