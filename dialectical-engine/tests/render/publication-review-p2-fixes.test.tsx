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

it("wraps unbroken refusal reasons and review questions on a narrow screen", () => {
  styled<HTMLStyleElement>("style", "").textContent = styles;
  const statement = styled<HTMLDivElement>("div", "publicationReviewStatement");
  const reason = styled<HTMLElement>("blockquote", "", statement);
  reason.textContent = "https://example.com/" + "x".repeat(500);
  const review = styled<HTMLDivElement>("div", "staffAccess");
  const question = styled<HTMLHeadingElement>("h1", "setTitle rvQuestion", review);
  question.textContent = reason.textContent;
  expect(getComputedStyle(reason).overflowWrap).toBe("anywhere");
  expect(getComputedStyle(question).overflowWrap).toBe("anywhere");
});

it("uses logical 4px start insets for Take down and its failure line", () => {
  styled<HTMLStyleElement>("style", "").textContent = styles;
  const takeDown = styled<HTMLButtonElement>("button", "libTakeDown");
  const status = styled<HTMLParagraphElement>("p", "tdStatus");
  takeDown.dir = "rtl";
  status.dir = "rtl";
  expect(getComputedStyle(takeDown).marginInlineStart).toBe("4px");
  expect(getComputedStyle(status).marginInlineStart).toBe("4px");
});

it("shows the queue timestamp at the artboard's 12px weight 600", () => {
  styled<HTMLStyleElement>("style", "").textContent = styles;
  const staff = styled<HTMLDivElement>("div", "staffAccess");
  const head = styled<HTMLDivElement>("div", "rvRowHead", staff);
  const time = styled<HTMLTimeElement>("time", "", head);
  expect(getComputedStyle(time).fontSize).toBe("12px");
  expect(getComputedStyle(time).fontWeight).toBe("600");
});
