import { describe, it, expect } from "vitest";
import { escapeHtml, renderPage } from "../src/html/layout";
import { renderIndexPage } from "../src/html/index";
import { renderAppPage } from "../src/html/app";
import { renderStatusPage } from "../src/html/status";
import { renderPublishPage } from "../src/html/publish";
import { fixtureApp, fixtureCatalog } from "./helpers/fixtures";

const evil = fixtureApp({ id: "com.evil.app", name: '<script>alert(1)</script>"', description: "a & b", author: "<b>x</b>" });

describe("escapeHtml", () => {
  it("escapes the five characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });
});

describe("renderPage", () => {
  it("wraps body with title and theme meta", () => {
    const html = renderPage({ title: "T", description: "D", body: "<p>hi</p>" });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>T</title>");
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain("<p>hi</p>");
  });
});

describe("renderIndexPage", () => {
  it("lists every app escaped, with filter data and links", () => {
    const html = renderIndexPage(fixtureCatalog([fixtureApp(), evil]));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;");
    expect(html).toContain('href="/apps/com.example.snake"');
    expect(html).toContain('href="https://github.com/example/picos-snake"');
    expect(html).toContain('href="https://github.com/example/picos-snake/releases/download/v1.2.0/snake.zip"');
    expect(html).toContain('data-category="games"');
    expect(html).toContain('data-stars="17"');
    expect(html).toContain("Firmware 0.1.0");
    expect(html).toContain('href="/publish"');
    expect(html.match(/class="card"/g)).toHaveLength(2);
  });
  it("handles an empty catalog", () => {
    const html = renderIndexPage(fixtureCatalog([]));
    expect(html).toContain("No apps listed yet");
  });
});

describe("renderAppPage", () => {
  it("shows details escaped", () => {
    const html = renderAppPage(evil, fixtureCatalog([evil]));
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("a".repeat(64));
    expect(html).toContain("audio");
    expect(html).toContain("v1.2.0");
  });
});

describe("renderStatusPage", () => {
  it("lists rejections and warnings escaped", () => {
    const html = renderStatusPage(fixtureCatalog(), { rejected: [{ repo: "a/<b>", reason: "no-release" }], warnings: ["w&"] });
    expect(html).toContain("a/&lt;b&gt;");
    expect(html).toContain("no-release");
    expect(html).toContain("w&amp;");
  });
  it("says so when nothing is rejected", () => {
    expect(renderStatusPage(fixtureCatalog(), { rejected: [], warnings: [] })).toContain("No repositories were rejected");
  });
});

describe("renderPublishPage", () => {
  it("documents the topic and rules", () => {
    const html = renderPublishPage();
    expect(html).toContain("picos-app");
    expect(html).toContain("app.json");
    expect(html).toContain("16 MB");
    expect(html).toContain("30 minutes");
  });
  it("documents the extra rejection reasons", () => {
    const html = renderPublishPage();
    expect(html).toContain("bad-dirname");
    expect(html).toContain("asset-not-zip");
  });
});
