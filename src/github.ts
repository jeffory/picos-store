export const SEARCH_QUERY = "topic:picos-app is:public archived:false fork:false";
const SEARCH_URL = "https://api.github.com/search/repositories";
const GRAPHQL_URL = "https://api.github.com/graphql";
const API_VERSION = "2022-11-28";
const PER_PAGE = 100, MAX_REPOS = 1000, BATCH = 25, TIMEOUT_MS = 10_000;

export interface RepoSummary {
  fullName: string; owner: string; name: string; description: string | null; stars: number; pushedAt: string | null; htmlUrl: string;
}
export interface ReleaseAsset { id: string; name: string; size: number; downloadUrl: string; }
export interface RepoRelease { tagName: string; assets: ReleaseAsset[]; }
export interface FirmwareRelease { tagName: string; body: string; assets: ReleaseAsset[]; }
export type Lookup<T> = { ok: true; value: T } | { ok: false; error: string };

export interface GitHubClient {
  searchRepos(): Promise<{ repos: RepoSummary[]; totalCount: number; truncated: boolean }>;
  fetchReleases(repos: RepoSummary[]): Promise<Map<string, Lookup<RepoRelease | null>>>;
  fetchAppJson(items: Array<{ fullName: string; tag: string }>): Promise<Map<string, Lookup<string | null>>>;
  fetchFirmwareRelease(repo: string): Promise<Lookup<FirmwareRelease>>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;
const s = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
/** Strips the two characters that could close a GraphQL string literal before interpolation. */
const ident = (v: string): string => v.replace(/["\\]/g, "");

export function createGitHubClient(fetchFn: typeof fetch, token: string): GitHubClient {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "picos-store",
    "X-GitHub-Api-Version": API_VERSION,
  };

  async function call(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await fetchFn(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async function graphql(query: string): Promise<{ data: Obj; errors: Array<{ path?: unknown[]; message?: string }> }> {
    const res = await call(GRAPHQL_URL, { method: "POST", body: JSON.stringify({ query }), headers: { "Content-Type": "application/json" } });
    if (!res.ok) throw new Error(`GitHub GraphQL failed with status ${res.status}`);
    const body: unknown = await res.json();
    if (!isObj(body)) throw new Error("GitHub GraphQL returned malformed JSON");
    const data = isObj(body.data) ? body.data : {};
    const errors = Array.isArray(body.errors) ? (body.errors as Array<{ path?: unknown[]; message?: string }>) : [];
    return { data, errors };
  }

  function errorFor(errors: Array<{ path?: unknown[]; message?: string }>, alias: string): string | null {
    const e = errors.find((err) => Array.isArray(err.path) && err.path[0] === alias);
    return e ? `github-error: ${e.message ?? "unknown"}` : null;
  }

  function parseAssets(nodes: unknown): ReleaseAsset[] {
    if (!Array.isArray(nodes)) return [];
    const out: ReleaseAsset[] = [];
    for (const a of nodes) {
      if (!isObj(a)) continue;
      const id = s(a.id) ?? (typeof a.id === "number" ? String(a.id) : null);
      const name = s(a.name), downloadUrl = s(a.downloadUrl) ?? s(a.browser_download_url);
      if (id && name && downloadUrl) out.push({ id, name, size: n(a.size), downloadUrl });
    }
    return out;
  }

  return {
    async searchRepos() {
      const repos: RepoSummary[] = [];
      let totalCount = 0, collected = 0;
      for (let page = 1; collected < MAX_REPOS; page++) {
        const url = new URL(SEARCH_URL);
        url.searchParams.set("q", SEARCH_QUERY);
        url.searchParams.set("per_page", String(PER_PAGE));
        url.searchParams.set("page", String(page));
        url.searchParams.set("sort", "stars");
        url.searchParams.set("order", "desc");
        const res = await call(url.toString(), { method: "GET" });
        if (!res.ok) throw new Error(`GitHub search failed with status ${res.status}`);
        const body: unknown = await res.json();
        if (!isObj(body) || typeof body.total_count !== "number" || !Array.isArray(body.items)) throw new Error("GitHub search returned malformed JSON");
        if (body.incomplete_results === true) throw new Error("GitHub search returned incomplete results");
        totalCount = body.total_count;
        collected += body.items.length;
        for (const item of body.items) {
          if (!isObj(item) || item.fork === true || item.archived === true || item.private === true || item.disabled === true) continue;
          const fullName = s(item.full_name), htmlUrl = s(item.html_url);
          const owner = isObj(item.owner) ? s(item.owner.login) : null;
          const name = s(item.name);
          if (!fullName || !htmlUrl || !owner || !name) continue;
          repos.push({ fullName, owner, name, description: typeof item.description === "string" ? item.description : null, stars: n(item.stargazers_count), pushedAt: s(item.pushed_at), htmlUrl });
        }
        if (collected >= totalCount || body.items.length === 0) break;
      }
      return { repos, totalCount, truncated: totalCount > collected };
    },

    async fetchReleases(repos) {
      const out = new Map<string, Lookup<RepoRelease | null>>();
      for (let i = 0; i < repos.length; i += BATCH) {
        const batch = repos.slice(i, i + BATCH);
        const fields = batch.map((r, j) =>
          `r${j}: repository(owner: "${ident(r.owner)}", name: "${ident(r.name)}") { latestRelease { tagName isDraft isPrerelease releaseAssets(first: 20) { nodes { id name size downloadUrl } } } }`);
        const { data, errors } = await graphql(`query { ${fields.join(" ")} }`);
        batch.forEach((r, j) => {
          const alias = `r${j}`, node = data[alias];
          const err = errorFor(errors, alias);
          if (err || !isObj(node)) { out.set(r.fullName, { ok: false, error: err ?? "github-error: no data" }); return; }
          const rel = node.latestRelease;
          if (!isObj(rel)) { out.set(r.fullName, { ok: true, value: null }); return; }
          const tagName = s(rel.tagName);
          // `latestRelease` should already exclude drafts and prereleases; this makes that contract explicit.
          if (!tagName || rel.isDraft === true || rel.isPrerelease === true) { out.set(r.fullName, { ok: true, value: null }); return; }
          const nodes = isObj(rel.releaseAssets) ? rel.releaseAssets.nodes : [];
          out.set(r.fullName, { ok: true, value: { tagName, assets: parseAssets(nodes) } });
        });
      }
      return out;
    },

    async fetchAppJson(items) {
      const out = new Map<string, Lookup<string | null>>();
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH);
        const fields = batch.map((it, j) => {
          const [owner, name] = it.fullName.split("/");
          const expr = ident(`${it.tag}:app.json`);
          return `r${j}: repository(owner: "${ident(owner)}", name: "${ident(name)}") { object(expression: "${expr}") { ... on Blob { text } } }`;
        });
        const { data, errors } = await graphql(`query { ${fields.join(" ")} }`);
        batch.forEach((it, j) => {
          const alias = `r${j}`, node = data[alias];
          const err = errorFor(errors, alias);
          if (err || !isObj(node)) { out.set(it.fullName, { ok: false, error: err ?? "github-error: no data" }); return; }
          const obj = node.object;
          out.set(it.fullName, { ok: true, value: isObj(obj) && typeof obj.text === "string" ? obj.text : null });
        });
      }
      return out;
    },

    async fetchFirmwareRelease(repo) {
      try {
        const res = await call(`https://api.github.com/repos/${repo}/releases/latest`, { method: "GET" });
        if (!res.ok) return { ok: false, error: `github ${res.status}` };
        const body: unknown = await res.json();
        if (!isObj(body)) return { ok: false, error: "malformed release" };
        const tagName = s(body.tag_name);
        if (!tagName) return { ok: false, error: "release has no tag" };
        return { ok: true, value: { tagName, body: typeof body.body === "string" ? body.body : "", assets: parseAssets(body.assets) } };
      } catch (e) {
        return { ok: false, error: `github-unreachable: ${e instanceof Error ? e.name : "error"}` };
      }
    },
  };
}
