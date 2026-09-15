export class FakeKV {
  store = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.store.get(key) ?? null; }
  /** `options` (expirationTtl and friends) is accepted and ignored, as the real binding allows. */
  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> { this.store.set(key, value); }
  async delete(key: string): Promise<void> { this.store.delete(key); }
  async list(opts: { prefix?: string; cursor?: string } = {}): Promise<{ keys: Array<{ name: string }>; list_complete: true; cursor?: string }> {
    const keys = [...this.store.keys()].filter((k) => !opts.prefix || k.startsWith(opts.prefix)).map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

export class FakeR2 {
  store = new Map<string, { body: string; contentType?: string; cacheControl?: string }>();
  async put(key: string, value: string, opts?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<void> {
    this.store.set(key, { body: value, ...opts?.httpMetadata });
  }
  async head(key: string): Promise<{ key: string } | null> {
    return this.store.has(key) ? { key } : null;
  }
  async get(key: string): Promise<{ body: ReadableStream; httpEtag: string; text(): Promise<string>; httpMetadata: { contentType?: string } } | null> {
    const v = this.store.get(key);
    if (!v) return null;
    return {
      body: new Response(v.body).body!,
      httpEtag: `"${v.body.length}"`,
      text: async () => v.body,
      httpMetadata: { contentType: v.contentType },
    };
  }
}

export type Route = (req: Request, url: URL) => Response | Promise<Response>;

/** Routes fetch calls by "METHOD host/path" (query string ignored) and records every call. */
export function routeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const key = `${req.method} ${url.host}${url.pathname}`;
    calls.push(key);
    const route = routes[key];
    if (!route) return new Response(`no route for ${key}`, { status: 599 });
    return route(req, url);
  }) as typeof fetch;
  return { fetch: fn, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
