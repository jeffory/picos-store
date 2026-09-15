import { describe, it, expect } from "vitest";
import { validateRepo, MAX_ASSET_BYTES } from "../src/validate";
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
    });
    expect(r.app.warnings).toEqual([]);
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
