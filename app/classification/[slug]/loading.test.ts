import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ClassificationLoading from "./loading";

it("announces trade navigation immediately while hiding decorative placeholders", () => {
  const html = renderToStaticMarkup(createElement(ClassificationLoading));
  expect(html).toContain("TRADE INDEX / LOADING CONTRACTORS");
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('aria-hidden="true"');
});
