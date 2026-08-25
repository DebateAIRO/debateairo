import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const uiRoot = new URL("../", import.meta.url);
const nextRoot = new URL(".next/", uiRoot);
const appPaths = JSON.parse(await readFile(
  new URL("server/app-paths-manifest.json", nextRoot),
  "utf8"
));
const routes = JSON.parse(await readFile(new URL("routes-manifest.json", nextRoot), "utf8"));

const requiredRoutes = Object.freeze([
  "/login",
  "/sign-up",
  "/verify-email",
  "/enroll-mfa"
]);
const staticRoutes = new Set(routes.staticRoutes.map((route) => route.page));

for (const route of requiredRoutes) {
  const appPath = `${route}/page`;
  const compiledPath = appPaths[appPath];
  assert.equal(typeof compiledPath, "string", `${route} is absent from the production app-path manifest`);
  assert(staticRoutes.has(route), `${route} is absent from the production static-route manifest`);
  await access(new URL(`server/${compiledPath}`, nextRoot));
}

console.log(`AUTH_PRODUCTION_ROUTES_VERIFIED=${requiredRoutes.join(",")}`);
