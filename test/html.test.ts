import { describe, it, expect } from "vitest";
import { escapeHtml, formatDate, renderPage, safeUrl } from "../src/html/layout";
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

describe("safeUrl", () => {
  it("allows http and https URLs through unchanged", () => {
    expect(safeUrl("https://example.com/x", "fallback")).toBe("https://example.com/x");
    expect(safeUrl("http://example.com/x", "fallback")).toBe("http://example.com/x");
  });
  it("falls back for javascript:, data:, ftp: and garbage", () => {
    expect(safeUrl("javascript:alert(1)", "fallback")).toBe("fallback");
    expect(safeUrl("data:text/html,<script>alert(1)</script>", "fallback")).toBe("fallback");
    expect(safeUrl("ftp://example.com/x", "fallback")).toBe("fallback");
    expect(safeUrl("not a url", "fallback")).toBe("fallback");
  });
});

describe("formatDate", () => {
  it("renders ISO timestamps as a readable UTC date", () => {
    expect(formatDate("2026-09-16T22:31:23.626Z")).toBe("16 Sep 2026, 22:31 UTC");
  });
  it("passes unparseable input through", () => {
    expect(formatDate("soon")).toBe("soon");
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
  it("marks the current page in the nav and adds the footer", () => {
    const html = renderPage({ title: "T", description: "D", body: "", path: "/status" });
    expect(html).toContain('<a href="/status" aria-current="page">Status</a>');
    expect(html).not.toContain('<a href="/" aria-current="page">');
    expect(html).toContain("<footer>");
  });
  it("hides [hidden] elements even where a class sets display (the card filter relies on it)", () => {
    expect(renderPage({ title: "T", description: "D", body: "" })).toContain("[hidden]{display:none!important}");
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
    expect(html).toContain('<time datetime="');
    expect(html).not.toContain("generated 20");
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
  it("never emits a javascript: homepage link", () => {
    const app = fixtureApp({ homepage: "javascript:alert(1)" });
    const html = renderAppPage(app, fixtureCatalog([app]));
    expect(html).not.toContain("javascript:");
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
  it("wraps the rejection table so it can scroll instead of widening the page", () => {
    const html = renderStatusPage(fixtureCatalog(), { rejected: [{ repo: "a/b", reason: "no-release" }], warnings: [] });
    expect(html).toMatch(/class="[^"]*\bscroll\b[^"]*"/);
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
    expect(html).toContain("github-error");
    expect(html).toContain("zip-invalid");
  });
  it("documents the dirname claim rules and the network-error wording", () => {
    const html = renderPublishPage();
    expect(html).toContain("dirname-claimed-by:&lt;repo&gt;");
    expect(html).toContain("dirname-reserved");
    expect(html).toContain("asset-unreachable:&lt;status|error&gt;");
  });
});
