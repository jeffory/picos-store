import type { Env } from "./types";
import { createGitHubClient, type GitHubClient, type RepoSummary } from "./github";
import { validateRepo, type ValidatedApp } from "./validate";
import { digestAsset, digestKey, MAX_DIGESTS_PER_RUN, type DigestBudget } from "./digest";
import { emitCatalog, emitDebugCatalog, type Catalog, type CatalogApp, type Firmware, type Rejection } from "./catalog";

export const CATALOG_KEY = "catalog.json";
export const DEBUG_KEY = "catalog-debug.json";
export const FIRMWARE_REPO = "jeffory/picOS";
export const CATALOG_CACHE_CONTROL = "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600";

export type RefreshResult =
  | { ok: true; appCount: number; rejected: Rejection[]; warnings: string[]; generatedAt: string }
  | { ok: false; error: string };

export interface RefreshOptions { fetch?: typeof fetch; now?: Date; logger?: Pick<Console, "error">; }

export async function refresh(env: Env, options: RefreshOptions = {}): Promise<RefreshResult> {
  const logger = options.logger ?? console;
  try {
    const token = env.GITHUB_TOKEN?.trim();
    if (!token) throw new Error("GITHUB_TOKEN is not configured");
    const fetchFn = options.fetch ?? fetch;
    const gh = createGitHubClient(fetchFn, token);
    const now = options.now ?? new Date();

    const search = await gh.searchRepos();
    const warnings: string[] = [];
    if (search.truncated) warnings.push(`GitHub returned ${search.totalCount} results; only ${search.repos.length} were collected.`);

    const { apps, rejected, claims } = await collectApps(env, gh, fetchFn, search.repos, warnings);
    if (apps.length === 0 && rejected.length === 0) throw new Error("GitHub returned no repositories tagged picos-app");

    const firmware = await loadFirmware(gh, warnings);
    const catalog: Catalog = { generated_at: now.toISOString(), firmware, apps };
    const meta = { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: CATALOG_CACHE_CONTROL } };

    let writeCatalog = true;
    if (apps.length === 0) {
      const existing = await env.PICOS_STORE_BUCKET.head(CATALOG_KEY);
      if (existing) {
        writeCatalog = false;
        warnings.push("empty-result: previous catalog retained");
      }
    }

    if (writeCatalog) await env.PICOS_STORE_BUCKET.put(CATALOG_KEY, emitCatalog(catalog), meta);
    await env.PICOS_STORE_BUCKET.put(DEBUG_KEY, emitDebugCatalog(catalog, { rejected, warnings }), meta);
    for (const claim of claims) await env.PICOS_STORE_KV.put(claim.key, claim.owner);
    return { ok: true, appCount: apps.length, rejected, warnings, generatedAt: catalog.generated_at };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown refresh error";
    logger.error(`picos-store refresh failed: ${message}`);
    return { ok: false, error: message };
  }
}

async function collectApps(env: Env, gh: GitHubClient, fetchFn: typeof fetch, repos: RepoSummary[], warnings: string[]) {
  const rejected: Rejection[] = [];
  const blocked = await listKeys(env.PICOS_STORE_KV, "block:");
  const candidates = repos.filter((r) => {
    if (blocked.has(r.fullName.toLowerCase())) { rejected.push({ repo: r.fullName, reason: "blocked" }); return false; }
    return true;
  });

  const releases = await gh.fetchReleases(candidates);
  const withTag = candidates.flatMap((r) => { const l = releases.get(r.fullName); return l?.ok && l.value ? [{ fullName: r.fullName, tag: l.value.tagName }] : []; });
  const manifests = await gh.fetchAppJson(withTag);

  const validated: ValidatedApp[] = [];
  for (const repo of candidates) {
    const result = validateRepo(repo, releases.get(repo.fullName) ?? { ok: false, error: "github-error: no data" }, manifests.get(repo.fullName) ?? { ok: true, value: null });
    if (result.ok) validated.push(result.app); else rejected.push({ repo: repo.fullName, reason: result.reason });
  }
  validated.sort((a, b) => b.repo.stars - a.repo.stars || a.manifest.name.localeCompare(b.manifest.name) || a.repo.fullName.localeCompare(b.repo.fullName));

  const apps: CatalogApp[] = [];
  const claims: Array<{ key: string; owner: string }> = [];
  const pendingOwners = new Map<string, string>();
  const budget: DigestBudget = { remaining: MAX_DIGESTS_PER_RUN };
  for (const app of validated) {
    try {
      const claimKey = `claim:${app.manifest.id}`;
      const existingOwner = await env.PICOS_STORE_KV.get(claimKey);
      const owner = existingOwner ?? pendingOwners.get(claimKey) ?? null;
      if (owner && owner !== app.repo.fullName) { rejected.push({ repo: app.repo.fullName, reason: `id-claimed-by:${owner}` }); continue; }

      // The store deletes /apps/<dirname> before extracting, so a dirname is as load-bearing as an id.
      // The device's FAT32 filesystem is case-insensitive, so the claim key is lower-cased to match
      // (the emitted catalog dirname keeps the author's original spelling).
      const dirKey = `claim:dir:${app.manifest.dirname.toLowerCase()}`;
      const existingDirOwner = await env.PICOS_STORE_KV.get(dirKey);
      const dirOwner = existingDirOwner ?? pendingOwners.get(dirKey) ?? null;
      if (dirOwner && dirOwner !== app.repo.fullName) { rejected.push({ repo: app.repo.fullName, reason: `dirname-claimed-by:${dirOwner}` }); continue; }

      const key = digestKey(app.repo.fullName, app.release.tagName, app.asset.id);
      const outcome = await digestAsset(env.PICOS_STORE_KV, fetchFn, key, app.asset, budget, app.manifest.id);
      if (outcome === "pending") { rejected.push({ repo: app.repo.fullName, reason: "pending-digest" }); continue; }
      if ("transient" in outcome) { rejected.push({ repo: app.repo.fullName, reason: outcome.transient }); continue; }
      if ("rejected" in outcome) { rejected.push({ repo: app.repo.fullName, reason: outcome.rejected }); continue; }

      if (!existingOwner) { pendingOwners.set(claimKey, app.repo.fullName); claims.push({ key: claimKey, owner: app.repo.fullName }); }
      if (!existingDirOwner) { pendingOwners.set(dirKey, app.repo.fullName); claims.push({ key: dirKey, owner: app.repo.fullName }); }
      for (const w of app.warnings) warnings.push(`${app.repo.fullName}: ${w}`);
      apps.push({
        id: app.manifest.id, dirname: app.manifest.dirname, name: app.manifest.name, description: app.manifest.description,
        long_description: app.manifest.long_description, version: app.manifest.version, author: app.manifest.author,
        category: app.manifest.category, app_type: outcome.appType, min_firmware: app.manifest.min_firmware,
        size_kb: Math.ceil(outcome.size / 1024), repo: app.repo.fullName, release_tag: app.release.tagName,
        asset: app.asset.name, sha256: outcome.sha256, homepage: app.manifest.homepage ?? app.repo.htmlUrl,
        removable: app.manifest.removable, requirements: app.manifest.requirements, stars: app.repo.stars,
        pushed_at: app.repo.pushedAt ?? "",
      });
    } catch (e) {
      // One repo's unexpected failure must not abort the run; the rest of the catalog still publishes.
      rejected.push({ repo: app.repo.fullName, reason: `digest-error:${e instanceof Error ? e.name : "error"}` });
    }
  }
  return { apps, rejected, claims };
}

async function loadFirmware(gh: GitHubClient, warnings: string[]): Promise<Firmware | null> {
  const r = await gh.fetchFirmwareRelease(FIRMWARE_REPO);
  if (!r.ok) { warnings.push(`firmware: ${r.error}`); return null; }
  const bin = r.value.assets.find((a) => a.name === "picocalc_os.bin");
  const sha = r.value.assets.find((a) => a.name === "picocalc_os.sha256");
  if (!bin || !sha) { warnings.push("firmware: release is missing picocalc_os.bin or picocalc_os.sha256"); return null; }
  return {
    version: r.value.tagName.replace(/^v/, ""), repo: FIRMWARE_REPO, release_tag: r.value.tagName,
    changelog: r.value.body.slice(0, 500), size_kb: Math.ceil(bin.size / 1024),
  };
}

async function listKeys(kv: KVNamespace, prefix: string): Promise<Set<string>> {
  const out = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const k of page.keys) out.add(k.name.slice(prefix.length).trim().toLowerCase());
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
