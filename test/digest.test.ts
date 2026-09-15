import { describe, it, expect, vi } from "vitest";
import { digestAsset, digestKey, MAX_DIGESTS_PER_RUN, MAX_ZIP_APP_JSON_BYTES, _deps } from "../src/digest";
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
    expect(budget.remaining).toBe(MAX_DIGESTS_PER_RUN - 1); // KV hit leaves the budget untouched
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
    const budget = { remaining: 5 };
    expect(await digestAsset(kv as never, serve("", 404).fetch, key, asset, budget)).toEqual({ transient: "asset-unreachable:404" });
    expect(kv.store.size).toBe(0);
    expect(budget.remaining).toBe(4);
  });
  it("refuses oversized bodies by header and by length", async () => {
    const byHeader = serve(goodZip(), 200, { "Content-Length": String(16 * 1024 * 1024 + 1) });
    const budget1 = { remaining: 5 };
    expect(await digestAsset(new FakeKV() as never, byHeader.fetch, key, asset, budget1)).toEqual({ transient: "asset-too-large" });
    expect(budget1.remaining).toBe(4);
    const big = new Uint8Array(16 * 1024 * 1024 + 1).buffer;
    const budget2 = { remaining: 5 };
    expect(await digestAsset(new FakeKV() as never, serve(big).fetch, key, asset, budget2)).toEqual({ transient: "asset-too-large" });
    expect(budget2.remaining).toBe(4);
  });
  it("treats an unexpected (non-ZipError) inspection failure as transient and does not cache", async () => {
    const kv = new FakeKV();
    const spy = vi.spyOn(_deps, "readZipEntries").mockImplementation(() => {
      throw new TypeError("boom");
    });
    try {
      const budget = { remaining: 5 };
      expect(await digestAsset(kv as never, serve(goodZip()).fetch, key, asset, budget)).toEqual({ transient: "digest-error:TypeError" });
      expect(kv.store.size).toBe(0);
      expect(budget.remaining).toBe(4);
    } finally {
      spy.mockRestore();
    }
  });
});

/** Rewrites the central-directory uncompressed size for one entry, as a deflate bomb would declare it. */
function declareUncompressedSize(buf: ArrayBuffer, name: string, size: number): ArrayBuffer {
  const bytes = new Uint8Array(buf), view = new DataView(buf), dec = new TextDecoder();
  for (let p = 0; p + 46 <= bytes.length; p++) {
    if (view.getUint32(p, true) !== 0x02014b50) continue;
    const nameLen = view.getUint16(p + 28, true);
    if (dec.decode(bytes.subarray(p + 46, p + 46 + nameLen)) !== name) continue;
    view.setUint32(p + 24, size, true);
    return buf;
  }
  throw new Error(`no central entry for ${name}`);
}

describe("digestAsset refuses a deflate bomb in app.json", () => {
  it("rejects on the declared size without inflating anything", async () => {
    const zip = declareUncompressedSize(goodZip(), "app.json", MAX_ZIP_APP_JSON_BYTES + 1);
    const kv = new FakeKV();
    const spy = vi.spyOn(_deps, "readZipFile");
    try {
      expect(await digestAsset(kv as never, serve(zip).fetch, key, asset, { remaining: 5 })).toEqual({ rejected: "zip-app-json-invalid" });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(JSON.parse(kv.store.get(key)!)).toEqual({ rejected: "zip-app-json-invalid" });
  });
  it("passes the inflate cap down to readZipFile", async () => {
    const spy = vi.spyOn(_deps, "readZipFile");
    try {
      await digestAsset(new FakeKV() as never, serve(goodZip()).fetch, key, asset, { remaining: 5 });
      expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "app.json" }), MAX_ZIP_APP_JSON_BYTES);
    } finally {
      spy.mockRestore();
    }
  });
  it("truncates a hostile id in the id-mismatch reason", async () => {
    const longId = "com.ex." + "a".repeat(32) + "." + "b".repeat(32) + "." + "c".repeat(32);
    const zip = buildZip([{ name: "app.json", data: JSON.stringify({ id: longId }) }, { name: "main.lua", data: "" }]);
    const rec = await digestAsset(new FakeKV() as never, serve(zip).fetch, key, asset, { remaining: 5 }, "com.ex.snake");
    expect(rec).toEqual({ rejected: `id-mismatch:${longId.slice(0, 60)}` });
    expect((rec as { rejected: string }).rejected.length).toBeLessThanOrEqual("id-mismatch:".length + 60);
  });
  it("caches the record with a 90-day expiry", async () => {
    const puts: Array<{ key: string; options?: { expirationTtl?: number } }> = [];
    class RecordingKV extends FakeKV {
      async put(k: string, v: string, options?: { expirationTtl?: number }): Promise<void> {
        puts.push({ key: k, options });
        await super.put(k, v, options);
      }
    }
    await digestAsset(new RecordingKV() as never, serve(goodZip()).fetch, key, asset, { remaining: 5 });
    expect(puts).toEqual([{ key, options: { expirationTtl: 60 * 60 * 24 * 90 } }]);
  });
});
