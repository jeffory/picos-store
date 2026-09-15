export function luaJsonGet(json: string, key: string): string | null {
  const s = json.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
  if (s) return s[1];
  const n = json.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
  return n ? n[1] : null;
}

export function luaJsonGetBool(json: string, key: string): boolean | null {
  if (new RegExp(`"${key}"\\s*:\\s*true`).test(json)) return true;
  if (new RegExp(`"${key}"\\s*:\\s*false`).test(json)) return false;
  return null;
}

export function luaStringArray(json: string, key: string): string[] {
  const start = json.search(new RegExp(`"${key}"\\s*:\\s*\\[`));
  if (start < 0) return [];
  const arr = json.slice(start).match(/\[(.*?)\]/s);
  if (!arr) return [];
  return [...arr[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

export interface LuaApp {
  id: string | null; dirname: string | null; name: string | null; description: string | null;
  long_description: string | null; version: string; author: string | null; category: string;
  app_type: string; min_firmware: string; size_kb: number; repo: string | null;
  release_tag: string | null; asset: string | null; sha256: string | null; homepage: string | null;
  removable: boolean; requirements: string[]; stars: number;
}

export interface LuaCatalog {
  catalog_version: number;
  firmware: { version: string | null; repo: string | null; release_tag: string | null; changelog: string | null; size_kb: number } | null;
  apps: LuaApp[];
}

export function luaParseCatalog(json: string): LuaCatalog {
  const cat: LuaCatalog = { catalog_version: Number(luaJsonGet(json, "catalog_version") ?? 1), firmware: null, apps: [] };
  const fwStart = json.search(/"firmware"\s*:\s*\{/);
  if (fwStart >= 0) {
    const fwEnd = json.indexOf("}", fwStart);
    if (fwEnd >= 0) {
      const b = json.slice(fwStart, fwEnd + 1);
      cat.firmware = {
        version: luaJsonGet(b, "version"), repo: luaJsonGet(b, "repo"), release_tag: luaJsonGet(b, "release_tag"),
        changelog: luaJsonGet(b, "changelog"), size_kb: Number(luaJsonGet(b, "size_kb") ?? 0),
      };
    }
  }
  const appsStart = json.search(/"apps"\s*:\s*\[/);
  if (appsStart < 0) return cat;
  let pos = json.indexOf("[", appsStart) + 1;
  for (;;) {
    const objStart = json.indexOf("{", pos);
    if (objStart < 0) break;
    let depth = 0, objEnd = objStart;
    for (let i = objStart; i < json.length; i++) {
      const c = json[i];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { objEnd = i; break; } }
    }
    const block = json.slice(objStart, objEnd + 1);
    const removable = luaJsonGetBool(block, "removable");
    const app: LuaApp = {
      id: luaJsonGet(block, "id"), dirname: luaJsonGet(block, "dirname"), name: luaJsonGet(block, "name"),
      description: luaJsonGet(block, "description"), long_description: luaJsonGet(block, "long_description"),
      version: luaJsonGet(block, "version") ?? "0.0.0", author: luaJsonGet(block, "author"),
      category: luaJsonGet(block, "category") ?? "demos", app_type: luaJsonGet(block, "app_type") ?? "lua",
      min_firmware: luaJsonGet(block, "min_firmware") ?? "0.0.0", size_kb: Number(luaJsonGet(block, "size_kb") ?? 0),
      repo: luaJsonGet(block, "repo"), release_tag: luaJsonGet(block, "release_tag"), asset: luaJsonGet(block, "asset"),
      sha256: luaJsonGet(block, "sha256"), homepage: luaJsonGet(block, "homepage"),
      removable: removable ?? true, requirements: luaStringArray(block, "requirements"),
      stars: Number(luaJsonGet(block, "stars") ?? 0),
    };
    if (app.id) cat.apps.push(app);
    pos = objEnd + 1;
  }
  return cat;
}
