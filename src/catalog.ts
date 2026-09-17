export const CATEGORIES = ["games", "tools", "system", "demos", "emulators", "network"] as const;
export type Category = (typeof CATEGORIES)[number];
export type AppType = "lua" | "native";

export interface CatalogApp {
  id: string; dirname: string; name: string; description: string; long_description: string;
  version: string; author: string; category: Category; app_type: AppType; min_firmware: string;
  size_kb: number; repo: string; release_tag: string; asset: string; sha256: string;
  homepage: string; removable: boolean; requirements: string[]; stars: number; pushed_at: string;
  icon: string; screenshots: string[]; keywords: string[];
}

export interface Firmware { version: string; repo: string; release_tag: string; changelog: string; size_kb: number; }
export interface Rejection { repo: string; reason: string; }
export interface Catalog { generated_at: string; firmware: Firmware | null; apps: CatalogApp[]; }
export interface DebugInfo { rejected: Rejection[]; warnings: string[]; }

export const LIMITS = { name: 40, description: 120, long_description: 1000, author: 60, changelog: 500, url: 240, default: 200 } as const;

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/"/g, "'"], [/\\/g, "/"], [/\{/g, "("], [/\}/g, ")"], [/\[/g, "("], [/\]/g, ")"],
  [/[\u0000-\u001f\u007f]/g, " "],
];

export function sanitize(value: unknown, max: number = LIMITS.default): string {
  if (typeof value !== "string") return "";
  let out = value;
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeCategory(value: unknown): { category: Category; warning: string | null } {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((CATEGORIES as readonly string[]).includes(raw)) return { category: raw as Category, warning: null };
  return { category: "demos", warning: `unknown category '${sanitize(value, 40)}' mapped to demos` };
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value);
}

function str(value: string, max: number = LIMITS.default): string {
  return `"${sanitize(value, max)}"`;
}

function int(value: number): string {
  return String(Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
}

function appEntry(a: CatalogApp): string {
  const fields: Array<[string, string]> = [
    ["id", str(a.id)], ["dirname", str(a.dirname)], ["name", str(a.name, LIMITS.name)],
    ["description", str(a.description, LIMITS.description)],
    ["long_description", str(a.long_description, LIMITS.long_description)],
    ["version", str(a.version)], ["author", str(a.author, LIMITS.author)], ["category", str(a.category)],
    ["app_type", str(a.app_type)], ["min_firmware", str(a.min_firmware)], ["size_kb", int(a.size_kb)],
    ["repo", str(a.repo)], ["release_tag", str(a.release_tag)], ["asset", str(a.asset)],
    ["sha256", str(a.sha256.toLowerCase())], ["homepage", str(a.homepage)],
    ["removable", a.removable ? "true" : "false"], ["stars", int(a.stars)], ["pushed_at", str(a.pushed_at)],
    ["requirements", "[" + a.requirements.map((r) => str(r, 40)).join(",") + "]"],
    ["icon", str(a.icon, LIMITS.url)],
    ["screenshots", "[" + a.screenshots.map((s) => str(s, LIMITS.url)).join(",") + "]"],
    ["keywords", "[" + a.keywords.map((k) => str(k, 24)).join(",") + "]"],
  ];
  return "{" + fields.map(([k, v]) => `"${k}":${v}`).join(",") + "}";
}

function firmwareEntry(f: Firmware): string {
  return `{"version":${str(f.version)},"repo":${str(f.repo)},"release_tag":${str(f.release_tag)},` +
    `"changelog":${str(f.changelog, LIMITS.changelog)},"size_kb":${int(f.size_kb)}}`;
}

export function emitCatalog(catalog: Catalog): string {
  const parts = [
    `"catalog_version":1`,
    `"meta":{"generated_at":${str(catalog.generated_at)},"app_count":${int(catalog.apps.length)},"schema":1}`,
  ];
  if (catalog.firmware) parts.push(`"firmware":${firmwareEntry(catalog.firmware)}`);
  parts.push(`"apps":[${catalog.apps.map(appEntry).join(",")}]`);
  return "{" + parts.join(",") + "}";
}

/** Debug-file bounds: reasons and warnings embed author-controlled text, so they are capped. */
export const DEBUG_REASON_MAX = 200;
export const DEBUG_WARNING_MAX = 300;

export function emitDebugCatalog(catalog: Catalog, debug: DebugInfo): string {
  const base = emitCatalog(catalog);
  const rejected = debug.rejected.map((r) => ({ repo: r.repo.slice(0, DEBUG_REASON_MAX), reason: r.reason.slice(0, DEBUG_REASON_MAX) }));
  const warnings = debug.warnings.map((w) => w.slice(0, DEBUG_WARNING_MAX));
  const extra = JSON.stringify({ rejected, warnings }).slice(1, -1);
  return base.slice(0, -1) + "," + extra + "}";
}
