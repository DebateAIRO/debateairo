import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "m"));
  assert.ok(match?.groups?.body, `Missing CSS block for ${selector}`);
  return match.groups.body;
}

test("score badges wrap inside narrow argument card headers", () => {
  const headerBlock = blockFor(".nodeHeader");
  assert.match(headerBlock, /flex-wrap:\s*wrap;/);

  const buttonBlock = blockFor(".scoreBadgeButton");
  assert.match(buttonBlock, /max-width:\s*100%;/);
  assert.match(buttonBlock, /flex-wrap:\s*wrap;/);
  assert.match(buttonBlock, /justify-content:\s*flex-end;/);
});
