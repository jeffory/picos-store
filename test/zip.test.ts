import { describe, it, expect } from "vitest";
import { readZipEntries, readZipFile, ZipError } from "../src/zip";
import { buildZip } from "./helpers/zip-writer";

const dec = new TextDecoder();

describe("readZipEntries", () => {
  it("lists entries with names and offsets", () => {
    const zip = buildZip([{ name: "app.json", data: '{"id":"a.b"}' }, { name: "assets/x.bin", data: new Uint8Array([1, 2, 3]) }]);
    const entries = readZipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual(["app.json", "assets/x.bin"]);
    expect(entries[1].uncompressedSize).toBe(3);
    expect(entries[0].method).toBe(0);
  });
  it("throws ZipError on garbage", () => {
    expect(() => readZipEntries(new Uint8Array(100).buffer)).toThrow(ZipError);
  });
  it("throws ZipError when the central directory points outside the file", () => {
    const zip = new Uint8Array(buildZip([{ name: "a", data: "b" }]));
    const view = new DataView(zip.buffer);
    view.setUint32(zip.length - 22 + 16, 0xfffffff0, true);
    expect(() => readZipEntries(zip.buffer)).toThrow(ZipError);
  });
});

describe("readZipFile", () => {
  it("reads a stored entry", async () => {
    const zip = buildZip([{ name: "app.json", data: '{"id":"a.b"}' }]);
    const [entry] = readZipEntries(zip);
    expect(dec.decode(await readZipFile(zip, entry))).toBe('{"id":"a.b"}');
  });
  it("reads a deflated entry", async () => {
    const raw = new TextEncoder().encode("hello hello hello hello");
    const cs = new CompressionStream("deflate-raw");
    const w = cs.writable.getWriter(); void w.write(raw); void w.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    const zip = new Uint8Array(buildZip([{ name: "t.txt", data: compressed }]));
    const v = new DataView(zip.buffer);
    v.setUint16(8, 8, true);                               // local header method
    v.setUint32(22, raw.length, true);                     // local uncompressed size
    const cd = zip.length - 22 - (46 + 5);                 // one central entry, name "t.txt"
    v.setUint16(cd + 10, 8, true);                         // central method
    v.setUint32(cd + 24, raw.length, true);                // central uncompressed size
    const [entry] = readZipEntries(zip.buffer);
    expect(entry.method).toBe(8);
    expect(dec.decode(await readZipFile(zip.buffer, entry))).toBe("hello hello hello hello");
  });
  it("rejects unsupported methods", async () => {
    const zip = new Uint8Array(buildZip([{ name: "a", data: "b" }]));
    const v = new DataView(zip.buffer);
    v.setUint16(zip.length - 22 - 47 + 10, 12, true);
    const [entry] = readZipEntries(zip.buffer);
    await expect(readZipFile(zip.buffer, entry)).rejects.toThrow(ZipError);
  });
});
