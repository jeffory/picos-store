import type { Catalog, CatalogApp } from "../catalog";
import { escapeHtml as e, renderPage } from "./layout";
import { zipUrl, formatSize } from "./index";

export function renderAppPage(a: CatalogApp, catalog: Catalog): string {
  const fwNote = catalog.firmware && a.min_firmware !== "0.0.0" ? ` (current firmware ${e(catalog.firmware.version)})` : "";
  const body = `
<p class="meta"><a href="/">← All apps</a></p>
<h2 style="margin:0 0 4px">${e(a.name)} <span class="meta">v${e(a.version)}</span></h2>
<p>${e(a.description)}</p>
${a.long_description ? `<p>${e(a.long_description)}</p>` : ""}
<div class="links" style="margin:12px 0 20px"><a href="https://github.com/${e(a.repo)}">Source on GitHub</a><a href="${e(zipUrl(a))}">Download ${e(a.asset)}</a>${a.homepage && !a.homepage.includes(`github.com/${a.repo}`) ? `<a href="${e(a.homepage)}">Homepage</a>` : ""}</div>
<dl>
<dt>Id</dt><dd><code>${e(a.id)}</code></dd>
<dt>Author</dt><dd>${e(a.author)}</dd>
<dt>Category</dt><dd>${e(a.category)}</dd>
<dt>Type</dt><dd>${e(a.app_type)}</dd>
<dt>Size</dt><dd>${formatSize(a.size_kb)}</dd>
<dt>Requires</dt><dd>${a.requirements.length ? a.requirements.map(e).join(", ") : "nothing extra"}</dd>
<dt>Min firmware</dt><dd>${e(a.min_firmware)}${fwNote}</dd>
<dt>Release</dt><dd>${e(a.release_tag)}</dd>
<dt>SHA-256</dt><dd><code>${e(a.sha256)}</code></dd>
<dt>Stars</dt><dd>${a.stars}</dd>
<dt>Last push</dt><dd>${e(a.pushed_at)}</dd>
</dl>`;
  return renderPage({ title: `${a.name} · PicOS App Store`, description: a.description, body });
}
