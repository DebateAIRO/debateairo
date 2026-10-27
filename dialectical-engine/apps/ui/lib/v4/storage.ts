"use client";

import { useCallback, useEffect, useState } from "react";
import { DIG_MODES, READING_LEVELS, type DigLink, type DigMode, type ReadingLevel, type SeenSnapshot } from "./types.js";

/*
 * V4 initial (spec 2026-10-28, B2): what V4 keeps in THIS browser only — the reading level, the dig links (the API has
 * no link field yet), what the map looked like at the last visit, and the asks started from /v4. Every read and write is
 * guarded: a private window, blocked storage or a full quota leaves the page working, just without memory. Everything
 * read is checked; anything malformed is ignored, never trusted.
 */

const READING_LEVEL_KEY = "v4.readingLevel";
const DIGS_PREFIX = "v4.digs.";
const DIG_PARENTS_KEY = "v4.digParents";
const SEEN_PREFIX = "v4.seen.";
const STARTED_KEY = "v4.started";
/** Same-tab news of a new reading level (the "storage" event only reaches OTHER tabs). */
const READING_LEVEL_EVENT = "v4:readingLevel";

const DIG_LINKS_PER_PARENT = 50;
const SEEN_SNAPSHOTS_MAX = 30;
const STARTED_RUNS_MAX = 20;
/** The child → parent index is kept to the dig links that can still exist (an assumption: 500 is ample). */
const DIG_PARENTS_MAX = 500;

export type StartedRun = Readonly<{ runId: string; question: string; startedAt: string }>;

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    // Full or blocked storage: V4 works on without remembering.
  }
}

function removeRaw(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    // As above.
  }
}

function readJson(key: string): unknown {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isReadingLevel(value: unknown): value is ReadingLevel {
  return typeof value === "string" && (READING_LEVELS as readonly string[]).includes(value);
}

function isDigMode(value: unknown): value is DigMode {
  return typeof value === "string" && (DIG_MODES as readonly string[]).includes(value);
}

function isTime(value: unknown): value is string {
  return isText(value) && !Number.isNaN(Date.parse(value));
}

function digLinkOf(value: unknown): DigLink | null {
  if (!isRecord(value)) return null;
  const { parentRunId, childRunId, openQuestionIds, questions, mode, startedAt } = value;
  if (!isText(parentRunId) || !isText(childRunId) || !isTextList(openQuestionIds) || !isTextList(questions)
    || !isDigMode(mode) || !isTime(startedAt)) return null;
  return Object.freeze({
    parentRunId, childRunId, openQuestionIds: Object.freeze([...openQuestionIds]),
    questions: Object.freeze([...questions]), mode, startedAt
  });
}

function seenOf(value: unknown): SeenSnapshot | null {
  if (!isRecord(value) || !isTime(value.at) || !isRecord(value.items)) return null;
  const items: Record<string, string> = {};
  for (const [id, word] of Object.entries(value.items)) {
    if (typeof word === "string") items[id] = word;
  }
  return Object.freeze({ at: value.at, items: Object.freeze(items) });
}

function startedOf(value: unknown): StartedRun | null {
  if (!isRecord(value)) return null;
  const { runId, question, startedAt } = value;
  if (!isText(runId) || typeof question !== "string" || !isTime(startedAt)) return null;
  return Object.freeze({ runId, question, startedAt });
}

// ── Reading level ──────────────────────────────────────────────────────────────────────────────────────────────────

export function readReadingLevel(): ReadingLevel | null {
  const raw = readRaw(READING_LEVEL_KEY);
  return isReadingLevel(raw) ? raw : null;
}

export function writeReadingLevel(level: ReadingLevel): void {
  if (!isReadingLevel(level)) return;
  writeRaw(READING_LEVEL_KEY, level);
  try {
    window.dispatchEvent(new Event(READING_LEVEL_EVENT));
  } catch {
    // No window (server) or no Event: nothing else to tell.
  }
}

/**
 * The saved reading level. null with loaded=false on the server and the first render (so both render the same), then
 * the saved value (or null when none) once read. The setter saves it; other tabs and other users of this hook follow.
 */
export function useReadingLevel(): readonly [ReadingLevel | null, (level: ReadingLevel) => void, boolean] {
  const [level, setLevel] = useState<ReadingLevel | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLevel(readReadingLevel());
    setLoaded(true);
    const reread = (): void => setLevel(readReadingLevel());
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || event.key === READING_LEVEL_KEY) reread();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(READING_LEVEL_EVENT, reread);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(READING_LEVEL_EVENT, reread);
    };
  }, []);
  const choose = useCallback((next: ReadingLevel): void => {
    if (!isReadingLevel(next)) return;
    setLevel(next);
    writeReadingLevel(next);
  }, []);
  return [level, choose, loaded] as const;
}

// ── Dig links ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The digs started from this debate, oldest first (the order they were started). */
export function readDigLinks(parentRunId: string): readonly DigLink[] {
  const stored = readJson(`${DIGS_PREFIX}${parentRunId}`);
  if (!Array.isArray(stored)) return [];
  const links: DigLink[] = [];
  const seen = new Set<string>();
  for (const item of stored) {
    const link = digLinkOf(item);
    if (link === null || link.parentRunId !== parentRunId || seen.has(link.childRunId)) continue;
    seen.add(link.childRunId);
    links.push(link);
  }
  return links.slice(-DIG_LINKS_PER_PARENT);
}

function readDigParents(): Record<string, string> {
  const stored = readJson(DIG_PARENTS_KEY);
  const parents: Record<string, string> = {};
  if (!isRecord(stored)) return parents;
  for (const [child, parent] of Object.entries(stored)) {
    if (isText(child) && isText(parent)) parents[child] = parent;
  }
  return parents;
}

/** Keeps the link (replacing one for the same follow-up) and the follow-up's way back to its parent. */
export function addDigLink(link: DigLink): void {
  const checked = digLinkOf(link);
  if (checked === null) return;
  const kept = readDigLinks(checked.parentRunId).filter((existing) => existing.childRunId !== checked.childRunId);
  const links = [...kept, checked].slice(-DIG_LINKS_PER_PARENT);
  writeRaw(`${DIGS_PREFIX}${checked.parentRunId}`, JSON.stringify(links));
  const parents = readDigParents();
  delete parents[checked.childRunId];
  parents[checked.childRunId] = checked.parentRunId;
  const entries = Object.entries(parents).slice(-DIG_PARENTS_MAX);
  writeRaw(DIG_PARENTS_KEY, JSON.stringify(Object.fromEntries(entries)));
}

/** The link that started this debate as a dig, or null when it was not started as one from this browser. */
export function findDigParent(childRunId: string): DigLink | null {
  const parentRunId = readDigParents()[childRunId];
  if (parentRunId === undefined) return null;
  return readDigLinks(parentRunId).find((link) => link.childRunId === childRunId) ?? null;
}

// ── What this browser saw last time ────────────────────────────────────────────────────────────────────────────────

export function readSeen(runId: string): SeenSnapshot | null {
  return seenOf(readJson(`${SEEN_PREFIX}${runId}`));
}

/** Keeps the snapshot; past 30 debates, the ones seen longest ago (and any malformed ones) are dropped. */
export function writeSeen(runId: string, snapshot: SeenSnapshot): void {
  const checked = seenOf(snapshot);
  if (checked === null) return;
  writeRaw(`${SEEN_PREFIX}${runId}`, JSON.stringify(checked));
  const storage = store();
  if (storage === null) return;
  const kept: Array<Readonly<{ key: string; at: number }>> = [];
  const malformed: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null || !key.startsWith(SEEN_PREFIX)) continue;
      const seen = seenOf(readJson(key));
      if (seen === null) malformed.push(key);
      else kept.push({ key, at: Date.parse(seen.at) });
    }
  } catch {
    return;
  }
  // Removed after the walk: removing while walking shifts the indexes.
  for (const key of malformed) removeRaw(key);
  kept.sort((a, b) => b.at - a.at);
  const own = `${SEEN_PREFIX}${runId}`;
  const keep = new Set([own, ...kept.filter((entry) => entry.key !== own).slice(0, SEEN_SNAPSHOTS_MAX - 1).map((entry) => entry.key)]);
  for (const entry of kept) {
    if (!keep.has(entry.key)) removeRaw(entry.key);
  }
}

// ── Asks started from /v4 ──────────────────────────────────────────────────────────────────────────────────────────

/** The asks started from /v4 in this browser, newest first, at most 20. */
export function readStartedRuns(): readonly StartedRun[] {
  const stored = readJson(STARTED_KEY);
  if (!Array.isArray(stored)) return [];
  const runs: StartedRun[] = [];
  const seen = new Set<string>();
  for (const item of stored) {
    const run = startedOf(item);
    if (run === null || seen.has(run.runId)) continue;
    seen.add(run.runId);
    runs.push(run);
  }
  runs.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return runs.slice(0, STARTED_RUNS_MAX);
}

export function addStartedRun(entry: StartedRun): void {
  const checked = startedOf(entry);
  if (checked === null) return;
  const runs = [checked, ...readStartedRuns().filter((run) => run.runId !== checked.runId)].slice(0, STARTED_RUNS_MAX);
  writeRaw(STARTED_KEY, JSON.stringify(runs));
}
