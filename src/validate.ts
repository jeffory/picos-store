import type { RepoSummary, RepoRelease, ReleaseAsset, Lookup } from "./github";
import { normalizeCategory, sanitize, LIMITS, type Category } from "./catalog";

/** Bounded on purpose: the id becomes the `claim:<id>` KV key, and KV keys are limited to 512 bytes. */
export const APP_ID_RE = /^[a-z0-9]{1,32}(\.[a-z0-9_-]{1,32}){1,4}$/;
export const DIRNAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
export const MAX_ASSET_BYTES = 16 * 1024 * 1024;

/** Directories the store itself owns on the device; a third party claiming one would overwrite them. */
export const RESERVED_DIRNAMES = new Set(["store", "updater", "filemanager", "editor", "terminal_example", "calculator", "system", "data", ".staging"]);
/** The first-party repository, allowed to publish the reserved dirnames above. */
export const FIRST_PARTY_REPO = "jeffory/picOS";

/** Field caps applied at ingest so no author string can grow a KV key, a reason or the catalog without bound. */
const VERSION_MAX = 40, ASSET_MAX = 100, REQUIREMENT_MAX = 40, REASON_MAX = 60;

export interface AppManifest {
  id: string; name: string; version: string; description: string; long_description: string; author: string;
  category: Category; min_firmware: string; requirements: string[]; dirname: string; homepage: string | null;
  removable: boolean; asset: string | null;
}
export interface ValidatedApp { repo: RepoSummary; release: RepoRelease; asset: ReleaseAsset; manifest: AppManifest; warnings: string[]; }
export type ValidationResult = { ok: true; app: ValidatedApp } | { ok: false; reason: string };

const reject = (reason: string): ValidationResult => ({ ok: false, reason });
const optStr = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const hasText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export function validateRepo(repo: RepoSummary, release: Lookup<RepoRelease | null>, appJson: Lookup<string | null>): ValidationResult {
  if (!release.ok) return reject(release.error);
  if (!release.value) return reject("no-release");
  if (!appJson.ok) return reject(appJson.error);
  if (appJson.value === null) return reject("no-app-json");

  let raw: unknown;
  try { raw = JSON.parse(appJson.value); } catch { return reject("app-json-invalid"); }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return reject("app-json-invalid");
  const m = raw as Record<string, unknown>;

  // Required fields are checked on the raw value, before any capping, so a blank string never becomes a valid name.
  for (const field of ["id", "name", "version"] as const) {
    if (typeof m[field] !== "string" || (m[field] as string).trim().length === 0) return reject(`missing-field:${field}`);
  }
  const id = m.id as string;
  if (!APP_ID_RE.test(id)) return reject("bad-id");
  if (m.dirname !== undefined && (typeof m.dirname !== "string" || !DIRNAME_RE.test(m.dirname))) return reject("bad-dirname");
  const dirname = sanitize(optStr(m.dirname, id.split(".").pop() ?? id), LIMITS.default);
  if (RESERVED_DIRNAMES.has(dirname.toLowerCase()) && repo.fullName.toLowerCase() !== FIRST_PARTY_REPO.toLowerCase()) return reject("dirname-reserved");

  const zips = release.value.assets.filter((a) => a.name.toLowerCase().endsWith(".zip"));
  const wanted = typeof m.asset === "string" ? sanitize(m.asset, ASSET_MAX) || null : null;
  let asset: ReleaseAsset | undefined;
  if (wanted) {
    asset = release.value.assets.find((a) => a.name === wanted);
    if (!asset) return reject(`asset-not-found:${sanitize(wanted, REASON_MAX)}`);
    if (!asset.name.toLowerCase().endsWith(".zip")) return reject(`asset-not-zip:${sanitize(wanted, REASON_MAX)}`);
  } else {
    if (zips.length === 0) return reject("no-zip-asset");
    if (zips.length > 1) return reject("multiple-zip-assets");
    asset = zips[0];
  }
  if (asset.size > MAX_ASSET_BYTES) return reject("asset-too-large");

  const warnings: string[] = [];
  const { category, warning } = normalizeCategory(m.category);
  if (warning) warnings.push(warning);

  const requirements = Array.isArray(m.requirements)
    ? m.requirements.filter((r): r is string => typeof r === "string").map((r) => sanitize(r, REQUIREMENT_MAX)).filter((r) => r.length > 0)
    : [];
  const homepage = sanitize(hasText(m.homepage) ? m.homepage : repo.htmlUrl, LIMITS.default) || repo.htmlUrl;
  const manifest: AppManifest = {
    id,
    name: sanitize(m.name, LIMITS.name),
    version: sanitize(m.version, VERSION_MAX),
    description: sanitize(optStr(m.description, repo.description ?? ""), LIMITS.description),
    long_description: sanitize(optStr(m.long_description, ""), LIMITS.long_description),
    author: sanitize(optStr(m.author, repo.owner), LIMITS.author),
    category,
    min_firmware: sanitize(optStr(m.min_firmware, "0.0.0"), VERSION_MAX),
    requirements,
    dirname,
    homepage,
    removable: m.removable === false ? false : true,
    asset: wanted,
  };
  return { ok: true, app: { repo, release: release.value, asset, manifest, warnings } };
}
