import type { Catalog, CatalogApp } from "../../src/catalog";

export const SHA = "a".repeat(64);

export function fixtureApp(over: Partial<CatalogApp> = {}): CatalogApp {
  return {
    id: "com.example.snake", dirname: "snake", name: "Snake", description: "Eat, grow, repeat",
    long_description: "A classic.", version: "1.2.0", author: "Example", category: "games", app_type: "lua",
    min_firmware: "0.1.0", size_kb: 42, repo: "example/picos-snake", release_tag: "v1.2.0", asset: "snake.zip",
    sha256: SHA, homepage: "https://github.com/example/picos-snake", removable: true, requirements: ["audio"],
    stars: 17, pushed_at: "2026-09-01T12:00:00Z", ...over,
  };
}

export function fixtureCatalog(apps: CatalogApp[] = [fixtureApp()]): Catalog {
  return {
    generated_at: "2026-09-15T10:00:00Z",
    firmware: { version: "0.1.0", repo: "jeffory/picOS", release_tag: "v0.1.0", changelog: "Fonts {and} more", size_kb: 1210 },
    apps,
  };
}
