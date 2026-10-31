// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";

const styles = ["apps/ui/app/globals.css", "apps/ui/components/StaffAccessPanel.css"]
  .map(path => readFileSync(`${process.cwd()}/${path}`, "utf8")).join("\n");

function styled<T extends HTMLElement>(tag: string, className: string, parent: HTMLElement = document.body): T {
  const element = document.createElement(tag) as T;
  element.className = className;
  parent.append(element);
  return element;
}

afterEach(() => document.body.replaceChildren());

it("the review queue and refusal reason use their own layout instead of the audit grid and browser textarea", () => {
  const style = styled<HTMLStyleElement>("style", "");
  style.textContent = styles;
  const staff = styled<HTMLDivElement>("div", "staffAccess");
  const queue = styled<HTMLUListElement>("ul", "rvQueue", staff);
  const row = styled<HTMLLIElement>("li", "", queue);
  const categories = styled<HTMLUListElement>("ul", "staffPermissions rvCats", row);
  const category = styled<HTMLLIElement>("li", "", categories);
  const reason = styled<HTMLDivElement>("div", "rvReason", staff);
  const textarea = styled<HTMLTextAreaElement>("textarea", "", reason);
  expect(getComputedStyle(row).display).toBe("flex");
  expect(getComputedStyle(category).display).toBe("list-item");
  expect(getComputedStyle(textarea).borderRadius).toBe("8px");
  expect(getComputedStyle(textarea).minHeight).toBe("96px");
});
