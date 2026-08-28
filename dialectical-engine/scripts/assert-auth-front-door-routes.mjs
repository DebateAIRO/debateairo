import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_AUTH_ROUTES = Object.freeze([
  "/login",
  "/sign-up",
  "/verify-email",
  "/enroll-mfa"
]);

export async function assertProductionAuthRoutes(appRoot, appName) {
  const nextRoot = resolve(appRoot, ".next");
  const appPaths = JSON.parse(await readFile(
    resolve(nextRoot, "server/app-paths-manifest.json"),
    "utf8"
  ));
  const routes = JSON.parse(await readFile(resolve(nextRoot, "routes-manifest.json"), "utf8"));
  const staticRoutes = new Set(routes.staticRoutes.map((route) => route.page));

  for (const route of REQUIRED_AUTH_ROUTES) {
    const compiledPath = appPaths[`${route}/page`];
    assert.equal(
      typeof compiledPath,
      "string",
      `${appName}: ${route} is absent from the production app-path manifest`
    );
    assert(
      staticRoutes.has(route),
      `${appName}: ${route} is absent from the production static-route manifest`
    );
    await access(resolve(nextRoot, "server", compiledPath));
  }

  return REQUIRED_AUTH_ROUTES;
}

const invokedPath = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  const appRoot = resolve(process.cwd(), process.argv[2] ?? ".");
  const appName = process.argv[3] ?? appRoot;
  const verified = await assertProductionAuthRoutes(appRoot, appName);
  console.log(`AUTH_PRODUCTION_ROUTES_VERIFIED=${appName}:${verified.join(",")}`);
}
