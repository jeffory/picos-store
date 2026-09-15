export class ZipError extends Error {
  constructor(message: string) { super(message); this.name = "ZipError"; }
}

export interface ZipEntry {
  name: string; method: number; compressedSize: number; uncompressedSize: number; localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50, CEN_SIG = 0x02014b50, LOC_SIG = 0x04034b50;
const EOCD_MIN = 22, EOCD_MAX_COMMENT = 0xffff;

export function readZipEntries(buf: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  if (bytes.length < EOCD_MIN) throw new ZipError("file too small");
  let eocd = -1;
  const stop = Math.max(0, bytes.length - EOCD_MIN - EOCD_MAX_COMMENT);
  for (let i = bytes.length - EOCD_MIN; i >= stop; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError("end of central directory not found");
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError("zip64 not supported");
  if (cdOffset + cdSize > eocd) throw new ZipError("central directory out of range");
  const dec = new TextDecoder();
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || view.getUint32(p, true) !== CEN_SIG) throw new ZipError("bad central header");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new ZipError("zip64 not supported");
    if (p + 46 + nameLen > eocd) throw new ZipError("bad central header");
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export async function readZipFile(buf: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buf);
  const p = entry.localHeaderOffset;
  if (p + 30 > buf.byteLength || view.getUint32(p, true) !== LOC_SIG) throw new ZipError("bad local header");
  const nameLen = view.getUint16(p + 26, true);
  const extraLen = view.getUint16(p + 28, true);
  const start = p + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > buf.byteLength) throw new ZipError("entry data out of range");
  const data = new Uint8Array(buf, start, entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new ZipError(`unsupported compression method ${entry.method}`);
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  void writer.write(data);
  void writer.close();
  const out = new Uint8Array(await new Response(ds.readable).arrayBuffer());
  if (out.length !== entry.uncompressedSize) throw new ZipError("size mismatch after inflate");
  return out;
}
