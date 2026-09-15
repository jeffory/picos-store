import { describe, it, expect, vi } from "vitest";
import worker, { handleRequest } from "../src/index";
import { emitCatalog, emitDebugCatalog } from "../src/catalog";
import { CATALOG_KEY, DEBUG_KEY } from "../src/refresh";
import { FakeKV, FakeR2 } from "./helpers/fakes";
import { fixtureCatalog } from "./helpers/fixtures";
import type { Env } from "../src/types";

function env(withCatalog = true) {
  const r2 = new FakeR2(), kv = new FakeKV();
  if (withCatalog) {
    void r2.put(CATALOG_KEY, emitCatalog(fixtureCatalog()), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    void r2.put(DEBUG_KEY, emitDebugCatalog(fixtureCatalog(), { rejected: [{ repo: "a/b", reason: "no-release" }], warnings: [] }));
  }
  const e: Env = { PICOS_STORE_BUCKET: r2 as never, PICOS_STORE_KV: kv as never, GITHUB_TOKEN: "t", REFRESH_TOKEN: "secret" };
  return { e, r2 };
}
const get = (path: string, e: Env, headers: Record<string, string> = {}) => handleRequest(new Request(`https://picos.jeffory.dev${path}`, { headers }), e);

describe("API routes", () => {
  it("serves catalog.json from R2 with cache headers and etag", async () => {
    const { e } = env();
    const res = await get("/catalog.json", e);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(JSON.parse(await res.text()).apps).toHaveLength(1);
  });
  it("returns 304 on matching If-None-Match", async () => {
    const { e } = env();
    const first = await get("/catalog.json", e);
    const res = await get("/catalog.json", e, { "If-None-Match": first.headers.get("ETag")! });
    expect(res.status).toBe(304);
  });
  it("serves catalog-debug.json and health", async () => {
    const { e } = env();
    expect((await get("/catalog-debug.json", e)).status).toBe(200);
    const health = await get("/health", e);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, generatedAt: "2026-09-15T10:00:00Z", apps: 1, rejected: 1 });
  });
  it("returns 503 when no snapshot exists yet", async () => {
    const { e } = env(false);
    expect((await get("/catalog.json", e)).status).toBe(503);
    expect((await get("/", e)).status).toBe(503);
    expect((await get("/health", e)).status).toBe(503);
  });
  it("404s unknown paths with no-store", async () => {
    const { e } = env();
    const res = await get("/nope", e);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("HTML routes", () => {
  it("renders index, app, status and publish pages", async () => {
    const { e } = env();
    for (const p of ["/", "/apps/com.example.snake", "/status", "/publish"]) {
      const res = await get(p, e);
      expect(res.status, p).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      expect(await res.text()).toContain("<!doctype html>");
    }
    expect((await get("/", e)).headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
  });
  it("404s an unknown app id", async () => {
    const { e } = env();
    expect((await get("/apps/com.nope", e)).status).toBe(404);
  });
  it("404s a malformed app id path", async () => {
    const { e } = env();
    const res = await get("/apps/%", e);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  it("404s an empty app id path", async () => {
    const { e } = env();
    expect((await get("/apps/", e)).status).toBe(404);
  });
});

describe("POST /refresh", () => {
  it("requires the bearer token", async () => {
    const { e } = env();
    const res = await handleRequest(new Request("https://picos.jeffory.dev/refresh", { method: "POST" }), e);
    expect(res.status).toBe(401);
  });
  it("runs refresh and returns its result", async () => {
    const { e } = env();
    const fake = vi.fn().mockResolvedValue({ ok: true, appCount: 3, rejected: [], warnings: [], generatedAt: "x" });
    const res = await handleRequest(new Request("https://picos.jeffory.dev/refresh", { method: "POST", headers: { Authorization: "Bearer secret" } }), e, { refresh: fake });
    expect(res.status).toBe(200);
    expect(fake).toHaveBeenCalledWith(e);
    expect(await res.json()).toMatchObject({ ok: true, appCount: 3 });
  });
  it("returns 500 when refresh fails", async () => {
    const { e } = env();
    const fake = vi.fn().mockResolvedValue({ ok: false, error: "boom" });
    const res = await handleRequest(new Request("https://picos.jeffory.dev/refresh", { method: "POST", headers: { Authorization: "Bearer secret" } }), e, { refresh: fake });
    expect(res.status).toBe(500);
  });
});

describe("scheduled", () => {
  it("runs refresh via waitUntil", async () => {
    const { e } = env();
    const fake = vi.fn().mockResolvedValue({ ok: true });
    const waited: Promise<unknown>[] = [];
    worker.scheduled({} as never, e, { waitUntil: (p: Promise<unknown>) => waited.push(p) } as never, { refresh: fake });
    expect(waited).toHaveLength(1);
    await waited[0];
    expect(fake).toHaveBeenCalledWith(e);
  });
});
