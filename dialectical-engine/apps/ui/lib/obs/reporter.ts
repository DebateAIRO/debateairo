"use client";

import {
  isClientReportBundle,
  isClientReportPayload,
  type ClientReportBundle,
  type ClientReportPayload,
} from "./enums.js";

export type { ClientReportPayload } from "./enums.js";

export const CLIENT_REPORTS = Object.freeze({
  segment: Object.freeze({
    code: "OBS_CAPTURE_SELF",
    component: "ui-app",
    route_template: "/:segment",
    kind: "error_boundary",
  }),
  global: Object.freeze({
    code: "OBS_CAPTURE_SELF",
    component: "ui-app",
    route_template: "/",
    kind: "global_error_boundary",
  }),
  scoring: Object.freeze({
    code: "SCORING_OPERATOR_UNRESOLVED",
    component: "ui-scoring",
    route_template: "/debate/:id",
    kind: "scoring_error_boundary",
  }),
  windowError: Object.freeze({
    code: "OBS_CAPTURE_SELF",
    component: "ui-app",
    route_template: "/:segment",
    kind: "window_error",
  }),
  unhandledRejection: Object.freeze({
    code: "OBS_CAPTURE_SELF",
    component: "ui-app",
    route_template: "/:segment",
    kind: "unhandled_rejection",
  }),
} as const satisfies Readonly<Record<string, ClientReportPayload>>);

let bundlePromise: Promise<ClientReportBundle | undefined> | undefined;
let listenersInstalled = false;

async function loadBundle(): Promise<ClientReportBundle | undefined> {
  bundlePromise ??= fetch("/v1/obs/client-report/enums")
    .then(async (response) => response.ok ? response.json() as Promise<unknown> : undefined)
    .then((value) => isClientReportBundle(value) ? value : undefined)
    .catch(() => undefined);
  return bundlePromise;
}

function bundleAccepts(bundle: ClientReportBundle, payload: ClientReportPayload): boolean {
  return bundle.codes.includes(payload.code)
    && bundle.components.includes(payload.component)
    && bundle.route_templates.includes(payload.route_template)
    && bundle.kinds.includes(payload.kind);
}

export async function reportClientFault(candidate: unknown): Promise<"reported" | "dropped"> {
  if (!isClientReportPayload(candidate)) return "dropped";
  const bundle = await loadBundle();
  if (bundle === undefined || !bundleAccepts(bundle, candidate)) return "dropped";
  const body = Object.freeze({
    code: candidate.code,
    component: candidate.component,
    route_template: candidate.route_template,
    kind: candidate.kind,
    build_ref: bundle.build_ref,
  });
  try {
    const response = await fetch("/v1/obs/client-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      keepalive: true,
    });
    return response.status === 202 || response.status === 204 ? "reported" : "dropped";
  } catch {
    return "dropped";
  }
}

export function installBrowserFaultReporting(): void {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  window.addEventListener("error", () => {
    void reportClientFault(CLIENT_REPORTS.windowError);
  });
  window.addEventListener("unhandledrejection", () => {
    void reportClientFault(CLIENT_REPORTS.unhandledRejection);
  });
}

installBrowserFaultReporting();
