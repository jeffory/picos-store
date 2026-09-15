import { describe, it, expect } from "vitest";
import { createGitHubClient, SEARCH_QUERY, type RepoSummary } from "../src/github";
import { routeFetch, json } from "./helpers/fakes";
import { validateRepo } from "../src/validate";

function repoItem(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: i, full_name: `owner${i}/repo${i}`, name: `repo${i}`, owner: { login: `owner${i}` },
    description: `desc ${i}`, stargazers_count: i, pushed_at: "2026-09-01T00:00:00Z",
    html_url: `https://github.com/owner${i}/repo${i}`, archived: false, fork: false, private: false, ...extra,
  };
}

describe("searchRepos", () => {
  it("paginates and normalises", async () => {
    const pages: Record<string, unknown[]> = { "1": Array.from({ length: 100 }, (_, i) => repoItem(i)), "2": [repoItem(100)] };
    const { fetch, calls } = routeFetch({
      "GET api.github.com/search/repositories": (req, url) => {
        expect(req.headers.get("Authorization")).toBe("Bearer tok");
        expect(url.searchParams.get("q")).toBe(SEARCH_QUERY);
        return json({ total_count: 101, incomplete_results: false, items: pages[url.searchParams.get("page")!] });
      },
    });
    const { repos, totalCount, truncated } = await createGitHubClient(fetch, "tok").searchRepos();
    expect(calls).toHaveLength(2);
    expect(totalCount).toBe(101);
    expect(truncated).toBe(false);
    expect(repos).toHaveLength(101);
    expect(repos[0]).toEqual<RepoSummary>({
      fullName: "owner0/repo0", owner: "owner0", name: "repo0", description: "desc 0", stars: 0,
      pushedAt: "2026-09-01T00:00:00Z", htmlUrl: "https://github.com/owner0/repo0",
    });
  });
  it("drops forks, archived and private even if search returns them", async () => {
    const { fetch } = routeFetch({
      "GET api.github.com/search/repositories": () =>
        json({ total_count: 3, incomplete_results: false, items: [repoItem(1, { fork: true }), repoItem(2, { archived: true }), repoItem(3)] }),
    });
    const { repos } = await createGitHubClient(fetch, "tok").searchRepos();
    expect(repos.map((r) => r.fullName)).toEqual(["owner3/repo3"]);
  });
  it("throws on non-200 or incomplete results", async () => {
    const { fetch } = routeFetch({ "GET api.github.com/search/repositories": () => json({}, 503) });
    await expect(createGitHubClient(fetch, "tok").searchRepos()).rejects.toThrow(/503/);
    const { fetch: f2 } = routeFetch({
      "GET api.github.com/search/repositories": () => json({ total_count: 1, incomplete_results: true, items: [] }),
    });
    await expect(createGitHubClient(f2, "tok").searchRepos()).rejects.toThrow(/incomplete/);
  });
});

const repos: RepoSummary[] = Array.from({ length: 30 }, (_, i) => ({
  fullName: `o${i}/r${i}`, owner: `o${i}`, name: `r${i}`, description: null, stars: 0, pushedAt: null, htmlUrl: `https://github.com/o${i}/r${i}`,
}));

describe("fetchReleases", () => {
  it("batches 25 repos per GraphQL request and maps results by fullName", async () => {
    const bodies: string[] = [];
    const { fetch, calls } = routeFetch({
      "POST api.github.com/graphql": async (req) => {
        const { query } = (await req.json()) as { query: string };
        bodies.push(query);
        const aliases = [...query.matchAll(/(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)];
        const data: Record<string, unknown> = {};
        for (const [, alias, owner, name] of aliases) {
          data[alias] = owner === "o1"
            ? { latestRelease: null }
            : { latestRelease: { tagName: `v-${name}`, releaseAssets: { nodes: [{ id: `A${name}`, name: `${name}.zip`, size: 10, downloadUrl: `https://github.com/${owner}/${name}/releases/download/v-${name}/${name}.zip` }] } } };
        }
        return json({ data });
      },
    });
    const map = await createGitHubClient(fetch, "tok").fetchReleases(repos);
    expect(calls).toHaveLength(2);
    expect(bodies[0].match(/repository\(/g)).toHaveLength(25);
    expect(map.size).toBe(30);
    expect(map.get("o1/r1")).toEqual({ ok: true, value: null });
    expect(map.get("o2/r2")).toEqual({ ok: true, value: { tagName: "v-r2", assets: [{ id: "Ar2", name: "r2.zip", size: 10, downloadUrl: "https://github.com/o2/r2/releases/download/v-r2/r2.zip" }] } });
  });
  it("marks a repo with a GraphQL error without failing the batch", async () => {
    const { fetch } = routeFetch({
      "POST api.github.com/graphql": () => json({ data: { r0: null, r1: { latestRelease: null } }, errors: [{ path: ["r0"], message: "Could not resolve" }] }),
    });
    const map = await createGitHubClient(fetch, "tok").fetchReleases(repos.slice(0, 2));
    expect(map.get("o0/r0")).toEqual({ ok: false, error: "github-error: Could not resolve" });
    expect(map.get("o1/r1")).toEqual({ ok: true, value: null });
  });
  it("treats a draft or prerelease latestRelease as no release at all", async () => {
    const { fetch } = routeFetch({
      "POST api.github.com/graphql": async (req) => {
        const { query } = (await req.json()) as { query: string };
        expect(query).toContain("isDraft");
        expect(query).toContain("isPrerelease");
        const release = (over: Record<string, unknown>) => ({
          latestRelease: {
            tagName: "v1", isDraft: false, isPrerelease: false,
            releaseAssets: { nodes: [{ id: "A1", name: "r.zip", size: 10, downloadUrl: "https://github.com/o/r/releases/download/v1/r.zip" }] },
            ...over,
          },
        });
        return json({ data: { r0: release({ isPrerelease: true }), r1: release({ isDraft: true }), r2: release({}) } });
      },
    });
    const map = await createGitHubClient(fetch, "tok").fetchReleases(repos.slice(0, 3));
    expect(map.get("o0/r0")).toEqual({ ok: true, value: null });
    expect(map.get("o1/r1")).toEqual({ ok: true, value: null });
    expect(map.get("o2/r2")).toMatchObject({ ok: true, value: { tagName: "v1" } });
    // A prerelease therefore reaches the author as no-release, not as a broken listing.
    const appJson = { ok: true as const, value: JSON.stringify({ id: "com.o0.r0", name: "R", version: "1.0.0" }) };
    expect(validateRepo(repos[0], map.get("o0/r0")!, appJson)).toEqual({ ok: false, reason: "no-release" });
  });
  it("strips quotes and backslashes from owner and name before embedding them", async () => {
    let captured = "";
    const { fetch } = routeFetch({
      "POST api.github.com/graphql": async (req) => {
        captured = ((await req.json()) as { query: string }).query;
        return json({ data: { r0: { latestRelease: null } } });
      },
    });
    const hostile: RepoSummary = { fullName: 'o"/r\\', owner: 'o") { evil } x("', name: 'r\\', description: null, stars: 0, pushedAt: null, htmlUrl: "https://github.com/o/r" };
    await createGitHubClient(fetch, "tok").fetchReleases([hostile]);
    expect(captured).toContain('repository(owner: "o) { evil } x(", name: "r")');
    expect(captured.match(/repository\(/g)).toHaveLength(1);
  });
  it("throws when GraphQL itself fails", async () => {
    const { fetch } = routeFetch({ "POST api.github.com/graphql": () => json({}, 502) });
    await expect(createGitHubClient(fetch, "tok").fetchReleases(repos.slice(0, 1))).rejects.toThrow(/502/);
  });
});

describe("fetchAppJson", () => {
  it("reads the blob at the tag and returns null when missing", async () => {
    const { fetch } = routeFetch({
      "POST api.github.com/graphql": async (req) => {
        const { query } = (await req.json()) as { query: string };
        expect(query).toContain('expression: "v1:app.json"');
        return json({ data: { r0: { object: { text: '{"id":"a.b"}' } }, r1: { object: null } } });
      },
    });
    const map = await createGitHubClient(fetch, "tok").fetchAppJson([{ fullName: "o0/r0", tag: "v1" }, { fullName: "o1/r1", tag: "v1" }]);
    expect(map.get("o0/r0")).toEqual({ ok: true, value: '{"id":"a.b"}' });
    expect(map.get("o1/r1")).toEqual({ ok: true, value: null });
  });
  it("strips quotes and backslashes from an adversarial tag before embedding it in the GraphQL expression", async () => {
    let capturedQuery = "";
    const { fetch } = routeFetch({
      "POST api.github.com/graphql": async (req) => {
        const { query } = (await req.json()) as { query: string };
        capturedQuery = query;
        return json({ data: { r0: { object: null } } });
      },
    });
    const map = await createGitHubClient(fetch, "tok").fetchAppJson([{ fullName: "o0/r0", tag: 'v1"}) { evil } #\\' }]);
    expect(capturedQuery).toContain('expression: "v1}) { evil } #:app.json"');
    expect(capturedQuery.match(/expression:/g)).toHaveLength(1);
    expect(capturedQuery.match(/repository\(/g)).toHaveLength(1);
    expect(map.has("o0/r0")).toBe(true);
  });
});

describe("fetchFirmwareRelease", () => {
  it("returns tag, body and assets", async () => {
    const { fetch } = routeFetch({
      "GET api.github.com/repos/jeffory/picOS/releases/latest": () =>
        json({ tag_name: "v0.1.0", body: "notes", assets: [{ id: 5, name: "picocalc_os.bin", size: 1000, browser_download_url: "https://github.com/jeffory/picOS/releases/download/v0.1.0/picocalc_os.bin" }] }),
    });
    const r = await createGitHubClient(fetch, "tok").fetchFirmwareRelease("jeffory/picOS");
    expect(r).toEqual({ ok: true, value: { tagName: "v0.1.0", body: "notes", assets: [{ id: "5", name: "picocalc_os.bin", size: 1000, downloadUrl: "https://github.com/jeffory/picOS/releases/download/v0.1.0/picocalc_os.bin" }] } });
  });
  it("reports failure without throwing", async () => {
    const { fetch } = routeFetch({ "GET api.github.com/repos/jeffory/picOS/releases/latest": () => json({}, 404) });
    expect(await createGitHubClient(fetch, "tok").fetchFirmwareRelease("jeffory/picOS")).toEqual({ ok: false, error: "github 404" });
  });
  it("absorbs a transport-level failure instead of rejecting", async () => {
    const { fetch } = routeFetch({
      "GET api.github.com/repos/jeffory/picOS/releases/latest": () => { throw new TypeError("fetch failed"); },
    });
    await expect(createGitHubClient(fetch, "tok").fetchFirmwareRelease("jeffory/picOS")).resolves.toEqual({
      ok: false, error: "github-unreachable: TypeError",
    });
  });
});
