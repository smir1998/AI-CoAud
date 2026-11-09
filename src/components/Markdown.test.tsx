import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "./Markdown";

describe("Markdown link safety", () => {
  it("keeps ordinary web and relative links clickable", () => {
    const html = renderToStaticMarkup(<Markdown text="[web](https://example.com) [local](./guide.md) [email](mailto:security@example.com)" />);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="./guide.md"');
    expect(html).toContain('href="mailto:security@example.com"');
  });

  it("renders script and data URLs as inert text", () => {
    const html = renderToStaticMarkup(<Markdown text="[script](javascript:alert(1)) [data](data:text/html,boom)" />);
    expect(html).not.toContain("href=");
    expect(html).toContain(">script</span>");
    expect(html).toContain(">data</span>");
  });
});
