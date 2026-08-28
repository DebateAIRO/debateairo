import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function serviceBlock(source, service) {
  const marker = `  ${service}:\n`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`DEV_COMPOSE_SERVICE_REQUIRED:${service}`);
  const remainder = source.slice(start + marker.length);
  const nextService = remainder.search(/^  [a-zA-Z0-9_-]+:\s*$/m);
  return nextService === -1 ? remainder : remainder.slice(0, nextService);
}

export function validateDevPostgresCompose(source) {
  const postgres = serviceBlock(source, "postgres");
  const hatchet = serviceBlock(source, "hatchet-lite");

  const ports = postgres.match(/\n    ports:\n((?:      - [^\n]+\n?)+)/)?.[1]
    ?.trim().split("\n").map((line) => line.trim().replace(/^- /, "")) ?? [];
  if (ports.length !== 1 || ports[0] !== '"127.0.0.1:55432:5432"'
    || /^\s*network_mode:\s*(?:"host"|'host'|host)\s*(?:#.*)?$/m.test(postgres)) {
    throw new Error("DEV_POSTGRES_LOOPBACK_PORT_REQUIRED");
  }

  const healthCommand = "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB";
  if (!postgres.includes("healthcheck:")
    || !postgres.includes(`test: [\"CMD-SHELL\", \"${healthCommand}\"]`)) {
    throw new Error("DEV_POSTGRES_HEALTHCHECK_REQUIRED");
  }
  if (!/depends_on:\n      postgres:\n        condition: service_healthy\b/.test(hatchet)) {
    throw new Error("DEV_POSTGRES_HEALTH_DEPENDENCY_REQUIRED");
  }

  return Object.freeze({ host: "127.0.0.1", hostPort: 55432, containerPort: 5432, healthCommand });
}

const invokedPath = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  const composePath = resolve(process.cwd(), process.argv[2] ?? "compose.dev.yaml");
  const validated = validateDevPostgresCompose(await readFile(composePath, "utf8"));
  console.log(`DEV_POSTGRES_COMPOSE_VERIFIED=${validated.host}:${validated.hostPort}:${validated.containerPort}`);
}
