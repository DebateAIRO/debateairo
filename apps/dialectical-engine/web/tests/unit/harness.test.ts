import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("unit-test harness", () => {
  it("provides a jsdom Testing Library environment", () => {
    render(createElement("output", null, "testing-library-ready"));

    expect(screen.getByText("testing-library-ready")).toBeInTheDocument();
  });
});
