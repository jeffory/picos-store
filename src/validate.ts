import type { RepoSummary, RepoRelease, ReleaseAsset, Lookup } from "./github";
import { normalizeCategory, type Category } from "./catalog";

export const APP_ID_RE = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/;
export const DIRNAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
export const MAX_ASSET_BYTES = 16 * 1024 * 1024;

export interface AppManifest {
  id: string; name: string; version: string; description: string; long_description: string; author: string;
  category: Category; min_firmware: string; requirements: string[]; dirname: string; homepage: string | null;
  removable: boolean; asset: string | null;
}
export interface ValidatedApp { repo: RepoSummary; release: RepoRelease; asset: ReleaseAsset; manifest: AppManifest; warnings: string[]; }
export type ValidationResult = { ok: true; app: ValidatedApp } | { ok: false; reason: string };

const reject = (reason: string): ValidationResult => ({ ok: false, reason });
const optStr = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);

export function validateRepo(repo: RepoSummary, release: Lookup<RepoRelease | null>, appJson: Lookup<string | null>): ValidationResult {
  if (!release.ok) return reject(release.error);
  if (!release.value) return reject("no-release");
  if (!appJson.ok) return reject(appJson.error);
  if (appJson.value === null) return reject("no-app-json");

  let raw: unknown;
  try { raw = JSON.parse(appJson.value); } catch { return reject("app-json-invalid"); }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return reject("app-json-invalid");
  const m = raw as Record<string, unknown>;

  for (const field of ["id", "name", "version"] as const) {
    if (typeof m[field] !== "string" || (m[field] as string).length === 0) return reject(`missing-field:${field}`);
  }
  const id = m.id as string;
  if (!APP_ID_RE.test(id)) return reject("bad-id");
  if (m.dirname !== undefined && (typeof m.dirname !== "string" || !DIRNAME_RE.test(m.dirname))) return reject("bad-dirname");

  const zips = release.value.assets.filter((a) => a.name.toLowerCase().endsWith(".zip"));
  const wanted = typeof m.asset === "string" ? m.asset : null;
  let asset: ReleaseAsset | undefined;
  if (wanted) {
    asset = release.value.assets.find((a) => a.name === wanted);
    if (!asset) return reject(`asset-not-found:${wanted}`);
    if (!asset.name.toLowerCase().endsWith(".zip")) return reject(`asset-not-zip:${wanted}`);
  } else {
    if (zips.length === 0) return reject("no-zip-asset");
    if (zips.length > 1) return reject("multiple-zip-assets");
    asset = zips[0];
  }
  if (asset.size > MAX_ASSET_BYTES) return reject("asset-too-large");

  const warnings: string[] = [];
  const { category, warning } = normalizeCategory(m.category);
  if (warning) warnings.push(warning);

  const requirements = Array.isArray(m.requirements) ? m.requirements.filter((r): r is string => typeof r === "string") : [];
  const manifest: AppManifest = {
    id,
    name: m.name as string,
    version: m.version as string,
    description: optStr(m.description, repo.description ?? ""),
    long_description: optStr(m.long_description, ""),
    author: optStr(m.author, repo.owner),
    category,
    min_firmware: optStr(m.min_firmware, "0.0.0"),
    requirements,
    dirname: optStr(m.dirname, id.split(".").pop() ?? id),
    homepage: optStr(m.homepage, repo.htmlUrl),
    removable: m.removable === false ? false : true,
    asset: wanted,
  };
  return { ok: true, app: { repo, release: release.value, asset, manifest, warnings } };
}
