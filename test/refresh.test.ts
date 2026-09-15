import { describe, it, expect } from "vitest";
import { refresh, CATALOG_KEY, DEBUG_KEY } from "../src/refresh";
import { FakeKV, FakeR2, routeFetch, json, type Route } from "./helpers/fakes";
import { buildZip } from "./helpers/zip-writer";
import { luaParseCatalog } from "./helpers/lua-parser";
import type { Env } from "../src/types";

interface FakeRepo { owner: string; name: string; stars?: number; tag?: string | null; appJson?: string | null; zip?: ArrayBuffer; zipName?: string; }

function env(kv = new FakeKV(), r2 = new FakeR2()): { env: Env; kv: FakeKV; r2: FakeR2 } {
  return { env: { PICOS_STORE_KV: kv as never, PICOS_STORE_BUCKET: r2 as never, GITHUB_TOKEN: "tok" }, kv, r2 };
}

const zipFor = (id: string) => buildZip([{ name: "app.json", data: JSON.stringify({ id }) }, { name: "main.lua", data: "" }]);
const manifest = (id: string, name = id) => JSON.stringify({ id, name, version: "1.0.0", category: "games" });

/** A fake GitHub + release-asset backend driven by a repo list. */
function github(repos: FakeRepo[], firmware: boolean = true) {
  const routes: Record<string, Route> = {
    "GET api.github.com/search/repositories": () =>
      json({ total_count: repos.length, incomplete_results: false, items: repos.map((r, i) => ({
        id: i, full_name: `${r.owner}/${r.name}`, name: r.name, owner: { login: r.owner }, description: "d",
        stargazers_count: r.stars ?? 0, pushed_at: "2026-09-01T00:00:00Z", html_url: `https://github.com/${r.owner}/${r.name}`,
      })) }),
    "POST api.github.com/graphql": async (req) => {
      const { query } = (await req.json()) as { query: string };
      const data: Record<string, unknown> = {};
      for (const [, alias, owner, name] of query.matchAll(/(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)) {
        const r = repos.find((x) => x.owner === owner && x.name === name)!;
        const tag = r.tag === undefined ? "v1" : r.tag;
        if (query.includes("latestRelease")) {
          data[alias] = tag === null ? { latestRelease: null } : { latestRelease: { tagName: tag, releaseAssets: { nodes: [
            { id: `A-${name}`, name: r.zipName ?? `${name}.zip`, size: 100, downloadUrl: `https://github.com/${owner}/${name}/releases/download/${tag}/${r.zipName ?? `${name}.zip`}` },
          ] } } };
        } else {
          data[alias] = { object: r.appJson === null ? null : { text: r.appJson ?? manifest(`com.${owner}.${name}`) } };
        }
      }
      return json({ data });
    },
    "GET api.github.com/repos/jeffory/picOS/releases/latest": () => firmware
      ? json({ tag_name: "v0.1.0", body: "notes {x}", assets: [{ id: 1, name: "picocalc_os.bin", size: 2048, browser_download_url: "u" }, { id: 2, name: "picocalc_os.sha256", size: 65, browser_download_url: "u" }] })
      : json({}, 500),
  };
  for (const r of repos) {
    const zipName = r.zipName ?? `${r.name}.zip`;
    routes[`GET github.com/${r.owner}/${r.name}/releases/download/${r.tag ?? "v1"}/${zipName}`] = () => new Response(r.zip ?? zipFor(`com.${r.owner}.${r.name}`));
  }
  return routeFetch(routes);
}

describe("refresh", () => {
  it("indexes conforming repos into a device-parseable catalog with firmware", async () => {
    const { env: e, r2 } = env();
    const { fetch } = github([{ owner: "ex", name: "snake", stars: 5 }, { owner: "ex", name: "tetris", stars: 9 }]);
    const res = await refresh(e, { fetch, now: new Date("2026-09-15T10:00:00Z") });
    expect(res).toMatchObject({ ok: true, appCount: 2, rejected: [] });
    const cat = luaParseCatalog(r2.store.get(CATALOG_KEY)!.body);
    expect(cat.apps.map((a) => a.id)).toEqual(["com.ex.tetris", "com.ex.snake"]);
    expect(cat.apps[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(cat.apps[0].release_tag).toBe("v1");
    expect(cat.apps[0].asset).toBe("tetris.zip");
    expect(cat.firmware).toEqual({ version: "0.1.0", repo: "jeffory/picOS", release_tag: "v0.1.0", changelog: "notes (x)", size_kb: 2 });
    expect(r2.store.get(CATALOG_KEY)!.cacheControl).toBe("public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
    expect(JSON.parse(r2.store.get(DEBUG_KEY)!.body).rejected).toEqual([]);
  });
  it("records rejections with reasons and keeps good apps", async () => {
    const { env: e, r2 } = env();
    const { fetch } = github([
      { owner: "ex", name: "good" },
      { owner: "ex", name: "norel", tag: null },
      { owner: "ex", name: "nojson", appJson: null },
      { owner: "ex", name: "wrongid", zip: zipFor("com.someone.else") },
      { owner: "ex", name: "badzip", zip: buildZip([{ name: "x/app.json", data: "{}" }]) },
    ]);
    const res = await refresh(e, { fetch });
    expect(res.ok && res.appCount).toBe(1);
    expect(res.ok && res.rejected).toEqual([
      { repo: "ex/norel", reason: "no-release" },
      { repo: "ex/nojson", reason: "no-app-json" },
      { repo: "ex/badzip", reason: "zip-layout" },
      { repo: "ex/wrongid", reason: "id-mismatch:com.someone.else" },
    ]);
    expect(luaParseCatalog(r2.store.get(CATALOG_KEY)!.body).apps).toHaveLength(1);
  });
  it("enforces id claims: first repo keeps the id", async () => {
    const { env: e, kv } = env();
    const first = github([{ owner: "a", name: "app", appJson: manifest("com.shared.id"), zip: zipFor("com.shared.id") }]);
    await refresh(e, { fetch: first.fetch });
    expect(kv.store.get("claim:com.shared.id")).toBe("a/app");
    const second = github([{ owner: "b", name: "app", appJson: manifest("com.shared.id"), zip: zipFor("com.shared.id") }, { owner: "a", name: "app", appJson: manifest("com.shared.id"), zip: zipFor("com.shared.id") }]);
    const res = await refresh(e, { fetch: second.fetch });
    expect(res.ok && res.rejected).toEqual([{ repo: "b/app", reason: "id-claimed-by:a/app" }]);
    expect(res.ok && res.appCount).toBe(1);
  });
  it("applies the blocklist", async () => {
    const { env: e, kv } = env();
    await kv.put("block:ex/evil", "1");
    const { fetch } = github([{ owner: "ex", name: "evil" }, { owner: "ex", name: "fine" }]);
    const res = await refresh(e, { fetch });
    expect(res.ok && res.appCount).toBe(1);
    expect(res.ok && res.rejected).toEqual([{ repo: "ex/evil", reason: "blocked" }]);
  });
  it("defers digests beyond the per-run budget as pending-digest", async () => {
    const { env: e } = env();
    const { fetch } = github(Array.from({ length: 12 }, (_, i) => ({ owner: "ex", name: `a${i}` })));
    const res = await refresh(e, { fetch });
    expect(res.ok && res.appCount).toBe(10);
    expect(res.ok && res.rejected.filter((r) => r.reason === "pending-digest")).toHaveLength(2);
    const again = await refresh(e, { fetch });
    expect(again.ok && again.appCount).toBe(12);
  });
  it("omits firmware when the firmware lookup fails", async () => {
    const { env: e, r2 } = env();
    const { fetch } = github([{ owner: "ex", name: "snake" }], false);
    const res = await refresh(e, { fetch });
    expect(res.ok && res.warnings).toContain("firmware: github 500");
    expect(luaParseCatalog(r2.store.get(CATALOG_KEY)!.body).firmware).toBeNull();
  });
  it("never overwrites the snapshot when search fails or nothing is listable", async () => {
    const { env: e, r2 } = env();
    await r2.put(CATALOG_KEY, "OLD");
    const errors: string[] = [];
    const logger = { error: (m: string) => errors.push(m) };
    const failing = routeFetch({ "GET api.github.com/search/repositories": () => json({}, 503) });
    expect(await refresh(e, { fetch: failing.fetch, logger })).toEqual({ ok: false, error: "GitHub search failed with status 503" });
    const empty = github([]);
    expect(await refresh(e, { fetch: empty.fetch, logger })).toMatchObject({ ok: false });
    expect(r2.store.get(CATALOG_KEY)!.body).toBe("OLD");
    expect(errors).toHaveLength(2);
  });
  it("fails without a GitHub token", async () => {
    const { env: e } = env();
    e.GITHUB_TOKEN = undefined;
    expect(await refresh(e, { fetch: github([]).fetch, logger: { error() {} } })).toEqual({ ok: false, error: "GITHUB_TOKEN is not configured" });
  });
  it("retains the existing catalog when every repo is rejected", async () => {
    const { env: e, r2 } = env();
    await r2.put(CATALOG_KEY, "OLD");
    const { fetch } = github([{ owner: "ex", name: "norel", tag: null }, { owner: "ex", name: "norel2", tag: null }]);
    const res = await refresh(e, { fetch });
    expect(res).toMatchObject({ ok: true, appCount: 0 });
    expect(r2.store.get(CATALOG_KEY)!.body).toBe("OLD");
    const debug = JSON.parse(r2.store.get(DEBUG_KEY)!.body);
    expect(debug.rejected).toEqual([
      { repo: "ex/norel", reason: "no-release" },
      { repo: "ex/norel2", reason: "no-release" },
    ]);
    expect(debug.warnings).toContain("empty-result: previous catalog retained");
  });
  it("bootstraps catalog.json when every repo is rejected and none exists yet", async () => {
    const { env: e, r2 } = env();
    const { fetch } = github([{ owner: "ex", name: "norel", tag: null }]);
    const res = await refresh(e, { fetch });
    expect(res).toMatchObject({ ok: true, appCount: 0 });
    const cat = luaParseCatalog(r2.store.get(CATALOG_KEY)!.body);
    expect(cat.apps).toEqual([]);
  });
  it("does not persist id claims when publishing fails, but does once publishing succeeds", async () => {
    class ThrowOnceR2 extends FakeR2 {
      private thrown = false;
      async put(key: string, value: string, opts?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<void> {
        if (key === CATALOG_KEY && !this.thrown) { this.thrown = true; throw new Error("boom"); }
        await super.put(key, value, opts);
      }
    }
    const kv = new FakeKV();
    const r2 = new ThrowOnceR2();
    const e: Env = { PICOS_STORE_KV: kv as never, PICOS_STORE_BUCKET: r2 as never, GITHUB_TOKEN: "tok" };
    const { fetch } = github([{ owner: "a", name: "app" }]);

    const failed = await refresh(e, { fetch });
    expect(failed).toMatchObject({ ok: false });
    expect([...kv.store.keys()].some((k) => k.startsWith("claim:"))).toBe(false);

    const ok = await refresh(e, { fetch });
    expect(ok).toMatchObject({ ok: true, appCount: 1 });
    expect(kv.store.get("claim:com.a.app")).toBe("a/app");
  });
});
