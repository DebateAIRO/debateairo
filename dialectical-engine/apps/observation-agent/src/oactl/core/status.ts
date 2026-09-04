import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { statusSnapshotSchema } from "../../store/status.js";
import { ObservationError } from "../../core/errors.js";
import { STATUS_VIEW_PATTERN } from "../../core/types.js";

type StoredProjection = NonNullable<ReturnType<typeof statusSnapshotSchema.parse>["modules"]>[string][number];

function projectionLabel(key: string): string {
  return key.replace(/[._-]+/gu, " ");
}

function renderProjection(projection: StoredProjection): string {
  if (projection.kind === "state") return `${projection.key.padEnd(28)} ${projection.state}`;
  if (projection.kind === "metric") {
    return `${projection.key.padEnd(28)} ${projection.value} ${projection.unit.toLowerCase()}`;
  }
  if (projection.kind === "timestamp") {
    return `${projection.key.padEnd(28)} ${projection.value ?? "UNKNOWN"}`;
  }
  if (projection.template === "EVALUATOR_UNBOUND_BY_REGISTER") {
    return `${projection.key.padEnd(28)} UNBOUND by register`;
  }
  if (projection.template === "NO_SCHEDULE_RULED") {
    return `${projection.key}: NO SCHEDULE RULED (V row D10)`;
  }
  if (projection.template === "CAPTURE_NOT_WIRED") {
    return `${projection.key}: NOT WIRED (${projection.count} FLUSH_OK rows) — blind by construction`;
  }
  if (projection.template === "SLOW_QUERIES_NOT_OBSERVABLE") {
    return `${projection.key}: NOT OBSERVABLE (pg_stat_statements disabled)`;
  }
  if (projection.template === "COUNT_WINDOW_THRESHOLD") {
    return `${projectionLabel(projection.key)} ${projection.count}/${projection.window_minutes}m`;
  }
  if (projection.template === "PERCENT_MINIMUM_THRESHOLD") {
    return `${projectionLabel(projection.key)} ${projection.percent}%/${projection.minimum}`;
  }
  if (projection.template === "RATIO_WINDOW_STATE") {
    return `${projectionLabel(projection.key)}: ${projection.numerator}/${projection.denominator} over ${projection.window_minutes}m (${projection.state})`;
  }
  if (projection.template === "DURATION_WINDOW_STATE") {
    return `${projectionLabel(projection.key)}: ${projection.value_seconds}s over ${projection.window_minutes}m (${projection.state})`;
  }
  return `${projection.key}: NOT OBSERVABLE`;
}

export async function renderStatus(stateDir: string, view?: string): Promise<string> {
  if (view !== undefined && !STATUS_VIEW_PATTERN.test(view)) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  try {
    const status = statusSnapshotSchema.parse(JSON.parse(
      await readFile(join(stateDir, "status.json"), "utf8")
    ));
    const rows = Object.entries(status.components)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([component, value]) => `${component.padEnd(28)} ${value.state}`);
    const moduleRows = Object.entries(status.modules ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([, projections]) => [...projections]
        .filter((projection) => view === undefined || projection.view === view)
        .sort((left, right) => left.key.localeCompare(right.key))
        .map(renderProjection));
    if (view !== undefined && moduleRows.length === 0) {
      throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
    }
    return [
      `state_dir ${stateDir}`,
      `pid ${status.pid}`,
      `thresholds v${status.thresholds_version}`,
      ...rows,
      ...moduleRows
    ].join("\n");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new ObservationError("OBSERVATION_STATUS_UNAVAILABLE", error);
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new ObservationError("OBSERVATION_STATUS_INVALID", error);
    }
    throw error;
  }
}

import { z } from "zod";
