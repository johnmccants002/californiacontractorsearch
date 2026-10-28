import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightedName } from "./highlighted-name";
describe("safe result highlighting", () => {
  it("highlights tokens without trusting HTML or regex syntax", () => {
    const html = renderToStaticMarkup(createElement(HighlightedName, { text: '<img src=x onerror=alert(1)> A+B BUILDERS', tokens: ['<img src=x onerror=alert(1)>', 'A+B'] }));
    expect(html).not.toContain('<img');
    expect(html).toContain('<mark>A+B</mark>');
    expect(html).toContain('&lt;img');
  });
});
