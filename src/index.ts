import type { Env } from "./types";
import { refresh as realRefresh, CATALOG_KEY, DEBUG_KEY, CATALOG_CACHE_CONTROL } from "./refresh";
import type { Catalog, CatalogApp, DebugInfo, Rejection } from "./catalog";
import { renderIndexPage } from "./html/index";
import { renderAppPage } from "./html/app";
import { renderStatusPage } from "./html/status";
import { renderPublishPage } from "./html/publish";

interface Deps { refresh?: typeof realRefresh; }

const JSON_TYPE = "application/json; charset=utf-8";
const HTML_TYPE = "text/html; charset=utf-8";

export function notFound(): Response {
  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": JSON_TYPE, "Cache-Control": "no-store" } });
}

function unavailable(): Response {
  return new Response("Catalog not generated yet. Try again in a few minutes.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "300" } });
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": HTML_TYPE, "Cache-Control": status === 200 ? CATALOG_CACHE_CONTROL : "no-store" } });
}

async function readSnapshot(env: Env, key: string): Promise<{ text: string; etag: string } | null> {
  const obj = await env.PICOS_STORE_BUCKET.get(key);
  if (!obj) return null;
  return { text: await obj.text(), etag: obj.httpEtag };
}

/** Parses the snapshot the Worker wrote. Shape is trusted because emitCatalog produced it. */
function parseSnapshot(text: string): { catalog: Catalog; debug: DebugInfo } {
  const raw = JSON.parse(text) as { meta: { generated_at: string }; firmware?: Catalog["firmware"]; apps: CatalogApp[]; rejected?: Rejection[]; warnings?: string[] };
  return {
    catalog: { generated_at: raw.meta.generated_at, firmware: raw.firmware ?? null, apps: raw.apps },
    debug: { rejected: raw.rejected ?? [], warnings: raw.warnings ?? [] },
  };
}

async function serveJson(request: Request, env: Env, key: string): Promise<Response> {
  const snap = await readSnapshot(env, key);
  if (!snap) return unavailable();
  const headers = { "Content-Type": JSON_TYPE, "Cache-Control": CATALOG_CACHE_CONTROL, ETag: snap.etag };
  if (request.headers.get("If-None-Match") === snap.etag) return new Response(null, { status: 304, headers });
  return new Response(snap.text, { status: 200, headers });
}

export async function handleRequest(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "POST" && path === "/refresh") {
    const token = env.REFRESH_TOKEN?.trim();
    const auth = request.headers.get("Authorization") ?? "";
    if (!token || auth !== `Bearer ${token}`) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
    const result = await (deps.refresh ?? realRefresh)(env);
    return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500, headers: { "Content-Type": JSON_TYPE, "Cache-Control": "no-store" } });
  }
  if (request.method !== "GET" && request.method !== "HEAD") return notFound();

  if (path === "/catalog.json") return serveJson(request, env, CATALOG_KEY);
  if (path === "/catalog-debug.json") return serveJson(request, env, DEBUG_KEY);
  if (path === "/publish") return html(renderPublishPage());

  if (path === "/health" || path === "/" || path === "/status" || path.startsWith("/apps/")) {
    let id: string | null = null;
    if (path.startsWith("/apps/")) {
      try {
        id = decodeURIComponent(path.slice("/apps/".length));
      } catch {
        return notFound();
      }
      if (!id) return notFound();
    }
    const snap = await readSnapshot(env, DEBUG_KEY);
    if (!snap) return unavailable();
    const { catalog, debug } = parseSnapshot(snap.text);
    if (path === "/health") {
      return new Response(JSON.stringify({ ok: true, generatedAt: catalog.generated_at, apps: catalog.apps.length, rejected: debug.rejected.length }), { headers: { "Content-Type": JSON_TYPE, "Cache-Control": "no-store" } });
    }
    if (path === "/") return html(renderIndexPage(catalog));
    if (path === "/status") return html(renderStatusPage(catalog, debug));
    const app = catalog.apps.find((a) => a.id === id);
    return app ? html(renderAppPage(app, catalog)) : notFound();
  }
  return notFound();
}

export default {
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env);
  },
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext, deps: Deps = {}): void {
    ctx.waitUntil((deps.refresh ?? realRefresh)(env));
  },
};
