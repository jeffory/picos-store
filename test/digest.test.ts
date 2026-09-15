import { describe, it, expect } from "vitest";
import { digestAsset, digestKey, MAX_DIGESTS_PER_RUN } from "../src/digest";
import { FakeKV, routeFetch } from "./helpers/fakes";
import { buildZip } from "./helpers/zip-writer";

const asset = { id: "A1", name: "snake.zip", size: 100, downloadUrl: "https://github.com/ex/snake/releases/download/v1/snake.zip" };
const key = digestKey("ex/snake", "v1", "A1");
const goodZip = () => buildZip([{ name: "app.json", data: '{"id":"com.ex.snake"}' }, { name: "main.lua", data: "return" }]);

async function sha(buf: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function serve(body: ArrayBuffer | string, status = 200, headers: Record<string, string> = {}) {
  return routeFetch({ "GET github.com/ex/snake/releases/download/v1/snake.zip": () => new Response(body, { status, headers }) });
}

describe("digestKey", () => {
  it("formats the KV key", () => expect(key).toBe("sha:ex/snake@v1:A1"));
});

describe("digestAsset", () => {
  it("downloads, hashes, checks layout and caches", async () => {
    const kv = new FakeKV(), zip = goodZip();
    const { fetch, calls } = serve(zip);
    const budget = { remaining: MAX_DIGESTS_PER_RUN };
    const rec = await digestAsset(kv as never, fetch, key, asset, budget);
    expect(rec).toEqual({ sha256: await sha(zip), size: zip.byteLength, appType: "lua", zipAppId: "com.ex.snake" });
    expect(budget.remaining).toBe(MAX_DIGESTS_PER_RUN - 1);
    expect(JSON.parse(kv.store.get(key)!)).toEqual(rec);
    const again = await digestAsset(kv as never, fetch, key, asset, budget);
    expect(again).toEqual(rec);
    expect(calls).toHaveLength(1);
  });
  it("detects native apps", async () => {
    const zip = buildZip([{ name: "app.json", data: '{"id":"com.ex.snake"}' }, { name: "main.elf", data: "x" }]);
    const rec = await digestAsset(new FakeKV() as never, serve(zip).fetch, key, asset, { remaining: 1 });
    expect(rec).toMatchObject({ appType: "native" });
  });
  it("returns pending when the budget is exhausted and does not fetch", async () => {
    const { fetch, calls } = serve(goodZip());
    expect(await digestAsset(new FakeKV() as never, fetch, key, asset, { remaining: 0 })).toBe("pending");
    expect(calls).toHaveLength(0);
  });
  it.each([
    ["zip-layout", buildZip([{ name: "snake/app.json", data: '{"id":"com.ex.snake"}' }, { name: "snake/main.lua", data: "" }]), undefined],
    ["zip-layout", buildZip([{ name: "app.json", data: '{"id":"com.ex.snake"}' }]), undefined],
    ["zip-app-json-invalid", buildZip([{ name: "app.json", data: "{" }, { name: "main.lua", data: "" }]), undefined],
    ["id-mismatch:com.other", buildZip([{ name: "app.json", data: '{"id":"com.other"}' }, { name: "main.lua", data: "" }]), "com.ex.snake"],
    ["zip-invalid", new Uint8Array(50).buffer, undefined],
  ] as const)("caches rejection %s", async (reason, zip, expectedId) => {
    const kv = new FakeKV();
    const { fetch, calls } = serve(zip);
    expect(await digestAsset(kv as never, fetch, key, { ...asset }, { remaining: 5 }, expectedId)).toEqual({ rejected: reason });
    expect(await digestAsset(kv as never, fetch, key, { ...asset }, { remaining: 5 }, expectedId)).toEqual({ rejected: reason });
    expect(calls).toHaveLength(1);
  });
  it("id check uses the caller-supplied expected id", async () => {
    const zip = buildZip([{ name: "app.json", data: '{"id":"com.ex.snake"}' }, { name: "main.lua", data: "" }]);
    const rec = await digestAsset(new FakeKV() as never, serve(zip).fetch, key, asset, { remaining: 1 }, "com.other");
    expect(rec).toEqual({ rejected: "id-mismatch:com.ex.snake" });
  });
  it("treats download failures as transient and does not cache", async () => {
    const kv = new FakeKV();
    expect(await digestAsset(kv as never, serve("", 404).fetch, key, asset, { remaining: 5 })).toEqual({ transient: "asset-unreachable:404" });
    expect(kv.store.size).toBe(0);
  });
  it("refuses oversized bodies by header and by length", async () => {
    const byHeader = serve(goodZip(), 200, { "Content-Length": String(16 * 1024 * 1024 + 1) });
    expect(await digestAsset(new FakeKV() as never, byHeader.fetch, key, asset, { remaining: 5 })).toEqual({ transient: "asset-too-large" });
    const big = new Uint8Array(16 * 1024 * 1024 + 1).buffer;
    expect(await digestAsset(new FakeKV() as never, serve(big).fetch, key, asset, { remaining: 5 })).toEqual({ transient: "asset-too-large" });
  });
});
