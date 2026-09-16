import type { Catalog, CatalogApp } from "../catalog";
import { escapeHtml as e, renderPage, safeUrl, timeTag } from "./layout";
import { zipUrl, formatSize } from "./index";

const SCRIPT = `
const b=document.getElementById('copy');if(b&&navigator.clipboard){b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.hash);b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1500);}catch(e){}});}`;

export function renderAppPage(a: CatalogApp, catalog: Catalog): string {
  const fwNote = catalog.firmware && a.min_firmware !== "0.0.0" ? ` <span class="meta">(current ${e(catalog.firmware.version)})</span>` : "";
  const repoUrl = `https://github.com/${a.repo}`;
  const homepageUrl = safeUrl(a.homepage, repoUrl);
  const showHomepage = homepageUrl !== repoUrl && !homepageUrl.includes(`github.com/${a.repo}`);
  const body = `
<p class="meta"><a href="/">← All apps</a></p>
<div class="page-head"><h2>${e(a.name)} <span class="meta">v${e(a.version)}</span></h2>
<p class="row"><span class="pill">${e(a.category)}</span><span class="pill">${e(a.app_type)}</span><span>by ${e(a.author)}</span><span>★ ${a.stars}</span></p></div>
<div class="detail">
<div>
<p>${e(a.description.replace(/\.\s*$/, ""))}${a.long_description ? `</p><p>${e(a.long_description)}` : ""}</p>
<div class="actions" style="margin:0"><a class="btn" href="${e(zipUrl(a))}">Download ZIP · ${formatSize(a.size_kb)}</a><a class="btn secondary" href="${e(repoUrl)}">Source on GitHub</a>${showHomepage ? `<a class="btn secondary" href="${e(homepageUrl)}">Homepage</a>` : ""}</div>
<div class="panel"><h3>Install</h3><p style="margin:0">Open the <strong>Store</strong> app on your PicoCalc and pick <strong>${e(a.name)}</strong>. To install by hand, unzip the download into <code>/apps/${e(a.dirname)}</code> on the SD card.</p></div>
<div class="panel"><h3>Compatibility</h3>
<dl>
<dt>App type</dt><dd>${e(a.app_type)}</dd>
<dt>Requires</dt><dd>${a.requirements.length ? a.requirements.map(e).join(", ") : "nothing extra"}</dd>
<dt>Min firmware</dt><dd>${e(a.min_firmware)}${fwNote}</dd>
</dl></div>
</div>
<div class="panel"><h3>Details</h3>
<dl>
<dt>Id</dt><dd><code>${e(a.id)}</code></dd>
<dt>Version</dt><dd>${e(a.version)} · release ${e(a.release_tag)}</dd>
<dt>Size</dt><dd>${formatSize(a.size_kb)}</dd>
<dt>Last push</dt><dd>${timeTag(a.pushed_at)}</dd>
</dl>
<h3 style="margin-top:14px">SHA-256</h3>
<div class="hashbox"><code class="hash">${e(a.sha256)}</code><button id="copy" class="copy" type="button" data-hash="${e(a.sha256)}" hidden>Copy</button></div>
</div>
</div>`;
  return renderPage({ title: `${a.name} · PicOS App Store`, description: a.description, body, script: SCRIPT, path: "/" });
}
