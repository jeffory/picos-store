import { describe, it, expect } from "vitest";
import { validateRepo, MAX_ASSET_BYTES } from "../src/validate";
import { LIMITS } from "../src/catalog";
import type { RepoSummary, RepoRelease, Lookup } from "../src/github";

const repo: RepoSummary = { fullName: "ex/snake", owner: "ex", name: "snake", description: "d", stars: 3, pushedAt: "2026-09-01T00:00:00Z", htmlUrl: "https://github.com/ex/snake" };
const asset = (name: string, size = 1000) => ({ id: "A1", name, size, downloadUrl: `https://github.com/ex/snake/releases/download/v1/${name}` });
const rel = (assets = [asset("snake.zip")]): Lookup<RepoRelease | null> => ({ ok: true, value: { tagName: "v1", assets } });
const manifest = (over: Record<string, unknown> = {}): Lookup<string | null> =>
  ({ ok: true, value: JSON.stringify({ id: "com.ex.snake", name: "Snake", version: "1.0.0", category: "Games", requirements: ["audio", 7], ...over }) });

describe("validateRepo", () => {
  it("accepts a conforming repo and fills defaults", () => {
    const r = validateRepo(repo, rel(), manifest());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.app.asset.name).toBe("snake.zip");
    expect(r.app.manifest).toEqual({
      id: "com.ex.snake", name: "Snake", version: "1.0.0", description: "d", long_description: "", author: "ex",
      category: "games", min_firmware: "0.0.0", requirements: ["audio"], dirname: "snake",
      homepage: "https://github.com/ex/snake", removable: true, asset: null,
      icon: "", screenshots: [], keywords: [],
    });
    expect(r.app.warnings).toEqual([]);
  });

  it("turns icon and screenshot paths into raw URLs at the release tag", () => {
    const r = validateRepo(repo, rel(), manifest({ icon: "./art/icon.png", screenshots: ["a.png", "b/c.webp"] }));
    expect(r.ok && r.app.manifest.icon).toBe("https://raw.githubusercontent.com/ex/snake/v1/art/icon.png");
    expect(r.ok && r.app.manifest.screenshots).toEqual([
      "https://raw.githubusercontent.com/ex/snake/v1/a.png",
      "https://raw.githubusercontent.com/ex/snake/v1/b/c.webp",
    ]);
    expect(r.ok && r.app.warnings).toEqual([]);
  });

  it.each([
    ["absolute path", "/etc/passwd.png"],
    ["parent traversal", "../../secret.png"],
    ["a full URL", "https://evil.example/x.png"],
    ["a non-image", "payload.svg"],
    ["a non-string", 7],
  ])("warns and drops an icon that is %s, without rejecting the app", (_label, icon) => {
    const r = validateRepo(repo, rel(), manifest({ icon }));
    expect(r.ok).toBe(true);
    expect(r.ok && r.app.manifest.icon).toBe("");
    expect(r.ok && r.app.warnings.join(" ")).toMatch(/icon ignored/);
  });

  it("caps screenshots at four and keywords at eight, lower-cased and deduped", () => {
    const shots = ["a.png", "b.png", "c.png", "d.png", "e.png"];
    const words = ["Arcade", "arcade", "Retro", "k3", "k4", "k5", "k6", "k7", "k8", "k9"];
    const r = validateRepo(repo, rel(), manifest({ screenshots: shots, keywords: words }));
    expect(r.ok && r.app.manifest.screenshots).toHaveLength(4);
    expect(r.ok && r.app.manifest.keywords).toEqual(["arcade", "retro", "k3", "k4", "k5", "k6", "k7", "k8"]);
    expect(r.ok && r.app.warnings.join(" ")).toMatch(/first 4 screenshots/);
  });

  it("ignores keywords and screenshots that are not arrays, with a warning", () => {
    const r = validateRepo(repo, rel(), manifest({ keywords: "arcade", screenshots: "a.png" }));
    expect(r.ok && r.app.manifest.keywords).toEqual([]);
    expect(r.ok && r.app.manifest.screenshots).toEqual([]);
    expect(r.ok && r.app.warnings.join(" ")).toMatch(/keywords ignored/);
  });
  it("warns on unknown category", () => {
    const r = validateRepo(repo, rel(), manifest({ category: "puzzles" }));
    expect(r.ok && r.app.manifest.category).toBe("demos");
    expect(r.ok && r.app.warnings[0]).toMatch(/unknown category/);
  });
  it.each([
    ["github-error: boom", { ok: false, error: "github-error: boom" } as Lookup<RepoRelease | null>, manifest()],
    ["no-release", { ok: true, value: null } as Lookup<RepoRelease | null>, manifest()],
    ["no-app-json", rel(), { ok: true, value: null } as Lookup<string | null>],
    ["app-json-invalid", rel(), { ok: true, value: "{nope" } as Lookup<string | null>],
    ["missing-field:name", rel(), manifest({ name: undefined })],
    ["missing-field:version", rel(), manifest({ version: 3 })],
    ["bad-id", rel(), manifest({ id: "Snake" })],
    ["bad-id", rel(), manifest({ id: "snake" })],
    ["bad-id", rel(), manifest({ id: "com.ex.sn/ake" })],
    ["bad-id", rel(), manifest({ id: "com." + "a".repeat(600) })],
    ["bad-id", rel(), manifest({ id: "com.ex." + "a".repeat(33) })],
    ["bad-id", rel(), manifest({ id: "a.b.c.d.e.f" })],
    ["missing-field:name", rel(), manifest({ name: "   " })],
    ["dirname-reserved", rel(), manifest({ dirname: "store" })],
    ["dirname-reserved", rel(), manifest({ dirname: "System" })],
    ["dirname-reserved", rel(), manifest({ id: "com.ex.data" })],
    ["no-zip-asset", rel([asset("snake.tar.gz")]), manifest()],
    ["multiple-zip-assets", rel([asset("a.zip"), asset("b.zip")]), manifest()],
    ["asset-not-found:other.zip", rel(), manifest({ asset: "other.zip" })],
    ["asset-too-large", rel([asset("snake.zip", MAX_ASSET_BYTES + 1)]), manifest()],
    ["bad-dirname", rel(), manifest({ dirname: "../../system" })],
    ["bad-dirname", rel(), manifest({ dirname: "a/b" })],
    ["bad-dirname", rel(), manifest({ dirname: "a".repeat(33) })],
    ["asset-not-zip:README.txt", rel([asset("snake.zip"), asset("README.txt")]), manifest({ asset: "README.txt" })],
  ])("rejects with %s", (reason, release, appJson) => {
    expect(validateRepo(repo, release, appJson)).toEqual({ ok: false, reason });
  });
  it("uses the asset named in app.json when several zips exist", () => {
    const r = validateRepo(repo, rel([asset("a.zip"), asset("b.zip")]), manifest({ asset: "b.zip" }));
    expect(r.ok && r.app.asset.name).toBe("b.zip");
  });
  it("carries optional fields through", () => {
    const r = validateRepo(repo, rel(), manifest({ description: "x", long_description: "y", author: "Me", min_firmware: "0.2.0", dirname: "sn", homepage: "https://ex.com", removable: false }));
    expect(r.ok && r.app.manifest).toMatchObject({ description: "x", long_description: "y", author: "Me", min_firmware: "0.2.0", dirname: "sn", homepage: "https://ex.com", removable: false });
  });
});

describe("validateRepo bounds every author-controlled string", () => {
  it("caps a huge long_description at the catalog limit", () => {
    const r = validateRepo(repo, rel(), manifest({ long_description: "x".repeat(10 * 1024) }));
    expect(r.ok && r.app.manifest.long_description.length).toBe(LIMITS.long_description);
  });
  it("caps name, description, author, version and min_firmware", () => {
    const r = validateRepo(repo, rel(), manifest({
      name: "n".repeat(5000), description: "d".repeat(5000), author: "a".repeat(5000),
      version: "v".repeat(5000), min_firmware: "m".repeat(5000),
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.app.manifest.name.length).toBe(LIMITS.name);
    expect(r.app.manifest.description.length).toBe(LIMITS.description);
    expect(r.app.manifest.author.length).toBe(LIMITS.author);
    expect(r.app.manifest.version.length).toBe(40);
    expect(r.app.manifest.min_firmware.length).toBe(40);
  });
  it("caps requirement entries and drops ones that sanitise away", () => {
    const r = validateRepo(repo, rel(), manifest({ requirements: ["r".repeat(500), "   ", "audio"] }));
    expect(r.ok && r.app.manifest.requirements).toEqual(["r".repeat(40), "audio"]);
  });
  it("keeps a 5 KB asset name out of the rejection reason", () => {
    const r = validateRepo(repo, rel(), manifest({ asset: "z".repeat(5 * 1024) }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason.startsWith("asset-not-found:")).toBe(true);
    expect(r.reason.length).toBeLessThanOrEqual("asset-not-found:".length + 60);
  });
  it("sanitises quotes out of the asset-not-zip reason too", () => {
    const r = validateRepo(repo, rel([asset("snake.zip"), asset("notes.txt")]), manifest({ asset: "notes.txt" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("asset-not-zip:notes.txt");
  });
  it("accepts an id at the longest permitted shape", () => {
    const id = ["a".repeat(32), "b".repeat(32), "c".repeat(32), "d".repeat(32), "e".repeat(32)].join(".");
    const r = validateRepo(repo, rel(), manifest({ id, dirname: "sn" }));
    expect(r.ok && r.app.manifest.id).toBe(id);
    expect(`claim:${id}`.length).toBeLessThan(512);
  });
  it("lets the first-party repo use a reserved dirname", () => {
    const firstParty = { ...repo, fullName: "jeffory/picOS", owner: "jeffory", name: "picOS" };
    const r = validateRepo(firstParty, rel(), manifest({ dirname: "store" }));
    expect(r.ok && r.app.manifest.dirname).toBe("store");
  });
  it("falls back to the repo URL for a blank homepage", () => {
    const blank = validateRepo(repo, rel(), manifest({ homepage: "   " }));
    expect(blank.ok && blank.app.manifest.homepage).toBe("https://github.com/ex/snake");
    // Text that survives the blank check but sanitises away still falls back.
    const stripped = validateRepo(repo, rel(), manifest({ homepage: "\u0001\u0002" }));
    expect(stripped.ok && stripped.app.manifest.homepage).toBe("https://github.com/ex/snake");
  });
});
