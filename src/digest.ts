import { readZipEntries, readZipFile, ZipError } from "./zip";
import type { ReleaseAsset } from "./github";
import type { AppType } from "./catalog";
import { MAX_ASSET_BYTES, APP_ID_RE } from "./validate";

export const MAX_DIGESTS_PER_RUN = 10;
const DOWNLOAD_TIMEOUT_MS = 25_000;

export type DigestRecord = { sha256: string; size: number; appType: AppType; zipAppId: string } | { rejected: string };
export interface DigestBudget { remaining: number; }
/**
 * "pending": budget exhausted, not fetched.
 * { transient: "asset-unreachable:<status|name>" }: download failed (HTTP error or fetch exception), not cached.
 * { transient: "asset-too-large" }: body exceeds MAX_ASSET_BYTES (by header or actual length), not cached.
 * { transient: "digest-error:<ErrorName>" }: an unexpected (non-ZipError/SyntaxError) exception during ZIP
 *   inspection — a likely bug rather than a malformed asset, so it is never cached and is retried next run.
 */
export type DigestOutcome = DigestRecord | "pending" | { transient: string };

/** Injectable so tests can force an unexpected (non-ZipError) throw out of ZIP inspection. */
export const _deps = { readZipEntries, readZipFile };

export function digestKey(fullName: string, tag: string, assetId: string): string {
  return `sha:${fullName}@${tag}:${assetId}`;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isRecord(v: unknown): v is DigestRecord {
  return typeof v === "object" && v !== null && ("sha256" in v || "rejected" in v);
}

async function inspectZip(buf: ArrayBuffer, expectedId: string | undefined): Promise<{ appType: AppType; zipAppId: string } | { rejected: string }> {
  let entries;
  try {
    entries = _deps.readZipEntries(buf);
  } catch (e) {
    if (e instanceof ZipError) return { rejected: "zip-invalid" };
    throw e;
  }
  const names = new Set(entries.map((e) => e.name));
  const hasLua = names.has("main.lua"), hasElf = names.has("main.elf");
  if (!names.has("app.json") || (!hasLua && !hasElf)) return { rejected: "zip-layout" };
  let zipAppId: string;
  try {
    const text = new TextDecoder().decode(await _deps.readZipFile(buf, entries.find((e) => e.name === "app.json")!));
    const parsed: unknown = JSON.parse(text);
    const id = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>).id : undefined;
    if (typeof id !== "string" || !APP_ID_RE.test(id)) return { rejected: "zip-app-json-invalid" };
    zipAppId = id;
  } catch (e) {
    if (e instanceof ZipError || e instanceof SyntaxError) return { rejected: "zip-app-json-invalid" };
    throw e;
  }
  if (expectedId !== undefined && zipAppId !== expectedId) return { rejected: `id-mismatch:${zipAppId}` };
  return { appType: hasElf ? "native" : "lua", zipAppId };
}

export async function digestAsset(
  kv: KVNamespace, fetchFn: typeof fetch, key: string, asset: ReleaseAsset, budget: DigestBudget, expectedId?: string,
): Promise<DigestOutcome> {
  const cached = await kv.get(key);
  if (cached) {
    try { const parsed: unknown = JSON.parse(cached); if (isRecord(parsed)) return parsed; } catch { /* fall through and recompute */ }
  }
  if (budget.remaining <= 0) return "pending";
  budget.remaining -= 1;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  let buf: ArrayBuffer;
  try {
    const res = await fetchFn(asset.downloadUrl, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "picos-store" } });
    if (!res.ok) return { transient: `asset-unreachable:${res.status}` };
    const len = Number(res.headers.get("Content-Length") ?? "0");
    if (len > MAX_ASSET_BYTES) return { transient: "asset-too-large" };
    buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_ASSET_BYTES) return { transient: "asset-too-large" };
  } catch (e) {
    return { transient: `asset-unreachable:${e instanceof Error ? e.name : "error"}` };
  } finally {
    clearTimeout(timer);
  }

  let inspected: { appType: AppType; zipAppId: string } | { rejected: string };
  try {
    inspected = await inspectZip(buf, expectedId);
  } catch (e) {
    return { transient: `digest-error:${e instanceof Error ? e.name : "error"}` };
  }
  const record: DigestRecord = "rejected" in inspected
    ? inspected
    : { sha256: hex(await crypto.subtle.digest("SHA-256", buf)), size: buf.byteLength, appType: inspected.appType, zipAppId: inspected.zipAppId };
  await kv.put(key, JSON.stringify(record));
  return record;
}
