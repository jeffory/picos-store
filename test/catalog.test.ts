import { describe, it, expect } from "vitest";
import { sanitize, normalizeCategory, emitCatalog, emitDebugCatalog, isSha256 } from "../src/catalog";
import { luaParseCatalog } from "./helpers/lua-parser";
import { SHA, fixtureApp, fixtureCatalog } from "./helpers/fixtures";

describe("sanitize", () => {
  it("removes characters the device parser cannot handle", () => {
    expect(sanitize('He said "hi" \\ {x} [y]\n\ttab')).toBe("He said 'hi' / (x) (y) tab");
  });
  it("collapses whitespace, trims and truncates", () => {
    expect(sanitize("  a   b  ", 3)).toBe("a b");
  });
  it("returns empty for non-strings", () => {
    expect(sanitize(42)).toBe("");
    expect(sanitize(undefined)).toBe("");
  });
});

describe("normalizeCategory", () => {
  it("lower-cases known categories", () => {
    expect(normalizeCategory("Games")).toEqual({ category: "games", warning: null });
  });
  it("maps unknown to demos with a warning", () => {
    expect(normalizeCategory("puzzles")).toEqual({ category: "demos", warning: "unknown category 'puzzles' mapped to demos" });
  });
});

describe("isSha256", () => {
  it("accepts 64 hex chars only", () => {
    expect(isSha256(SHA)).toBe(true);
    expect(isSha256(SHA.toUpperCase())).toBe(true);
    expect(isSha256("a".repeat(63))).toBe(false);
    expect(isSha256("g".repeat(64))).toBe(false);
  });
});

describe("emitCatalog", () => {
  it("round-trips through the device parser", () => {
    const json = emitCatalog(fixtureCatalog());
    const parsed = luaParseCatalog(json);
    expect(parsed.catalog_version).toBe(1);
    expect(parsed.firmware).toEqual({ version: "0.1.0", repo: "jeffory/picOS", release_tag: "v0.1.0", changelog: "Fonts (and) more", size_kb: 1210 });
    expect(parsed.apps).toHaveLength(1);
    const a = parsed.apps[0];
    expect(a.id).toBe("com.example.snake");
    expect(a.sha256).toBe(SHA);
    expect(a.requirements).toEqual(["audio"]);
    expect(a.removable).toBe(true);
    expect(a.stars).toBe(17);
    expect(a.size_kb).toBe(42);
  });
  it("is valid JSON with firmware before apps and meta first", () => {
    const json = emitCatalog(fixtureCatalog());
    const obj = JSON.parse(json);
    expect(Object.keys(obj)).toEqual(["catalog_version", "meta", "firmware", "apps"]);
    expect(obj.meta).toEqual({ generated_at: "2026-09-15T10:00:00Z", app_count: 1, schema: 1 });
  });
  it("sanitises hostile strings so neighbouring fields survive", () => {
    const evil = fixtureApp({ description: 'x", "sha256": "' + "b".repeat(64) + '", "z": "', name: "{brace}" });
    const parsed = luaParseCatalog(emitCatalog(fixtureCatalog([evil])));
    expect(parsed.apps[0].sha256).toBe(SHA);
    expect(parsed.apps[0].name).toBe("(brace)");
  });
  it("omits firmware when null", () => {
    const cat = { ...fixtureCatalog(), firmware: null };
    const obj = JSON.parse(emitCatalog(cat));
    expect(obj.firmware).toBeUndefined();
    expect(luaParseCatalog(emitCatalog(cat)).firmware).toBeNull();
  });
  it("emits removable false", () => {
    const parsed = luaParseCatalog(emitCatalog(fixtureCatalog([fixtureApp({ removable: false })])));
    expect(parsed.apps[0].removable).toBe(false);
  });
});

describe("emitDebugCatalog", () => {
  it("truncates author-controlled reasons, repos and warnings", () => {
    const json = emitDebugCatalog(fixtureCatalog(), {
      rejected: [{ repo: "r".repeat(5 * 1024), reason: "asset-not-found:" + "z".repeat(5 * 1024) }],
      warnings: ["w".repeat(5 * 1024)],
    });
    const obj = JSON.parse(json);
    expect(obj.rejected[0].reason).toHaveLength(200);
    expect(obj.rejected[0].repo).toHaveLength(200);
    expect(obj.warnings[0]).toHaveLength(300);
    expect(obj.rejected[0].reason.startsWith("asset-not-found:")).toBe(true);
    expect(luaParseCatalog(json).apps).toHaveLength(1);
  });
  it("adds rejected and warnings and still parses on device", () => {
    const json = emitDebugCatalog(fixtureCatalog(), { rejected: [{ repo: "a/b", reason: "no-release" }], warnings: ["w"] });
    const obj = JSON.parse(json);
    expect(obj.rejected).toEqual([{ repo: "a/b", reason: "no-release" }]);
    expect(obj.warnings).toEqual(["w"]);
    expect(luaParseCatalog(json).apps).toHaveLength(1);
  });
});
