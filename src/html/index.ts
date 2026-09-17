import { CATEGORIES, type Catalog, type CatalogApp } from "../catalog";
import { escapeHtml as e, renderPage, timeTag } from "./layout";

export function zipUrl(a: CatalogApp): string {
  return `https://github.com/${a.repo}/releases/download/${a.release_tag}/${a.asset}`;
}

export function formatSize(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

/** The app's own icon, or a monogram tile so the grid still reads as a store before anyone ships art. */
export function iconMarkup(a: CatalogApp, extraClass = ""): string {
  const cls = `icon${extraClass ? " " + extraClass : ""}`;
  if (a.icon) return `<img class="${cls}" src="${e(a.icon)}" alt="" loading="lazy">`;
  const letter = (a.name.trim()[0] ?? "?").toUpperCase();
  return `<span class="${cls}" aria-hidden="true">${e(letter)}</span>`;
}

function card(a: CatalogApp): string {
  const search = [a.name, a.description, a.author, a.id, ...a.keywords].join(" ").toLowerCase();
  return `<article class="card" data-category="${e(a.category)}" data-stars="${a.stars}" data-pushed="${e(a.pushed_at)}" data-name="${e(a.name.toLowerCase())}" data-search="${e(search)}">
<div class="cardhead">${iconMarkup(a)}<div>
<h2><a href="/apps/${e(a.id)}">${e(a.name)}</a></h2>
<div class="row"><span class="pill">${e(a.category)}</span><span>v${e(a.version)}</span><span>by ${e(a.author)}</span></div>
</div></div>
<p>${e(a.description.replace(/\.\s*$/, ""))}</p>
<div class="row"><span>${formatSize(a.size_kb)}</span><span>★ ${a.stars}</span></div>
<div class="links"><a class="btn small" href="${e(zipUrl(a))}">Download ZIP</a><a href="/apps/${e(a.id)}">Details</a></div>
</article>`;
}

const SCRIPT = `
const q=document.getElementById('q'),sort=document.getElementById('sort'),grid=document.getElementById('grid'),empty=document.getElementById('empty');
const cards=[...grid.querySelectorAll('.card')];let cat='all';
function apply(){const t=q.value.trim().toLowerCase();let n=0;
for(const c of cards){const ok=(cat==='all'||c.dataset.category===cat)&&(!t||c.dataset.search.includes(t));c.hidden=!ok;if(ok)n++;}
const msg=document.getElementById('emptymsg');if(msg)msg.textContent=t?'Nothing matches that search.':'No apps in this category yet.';
const key=sort.value;const vis=cards.filter(c=>!c.hidden).sort((a,b)=>key==='name'?a.dataset.name.localeCompare(b.dataset.name):key==='pushed'?b.dataset.pushed.localeCompare(a.dataset.pushed):(+b.dataset.stars)-(+a.dataset.stars));
for(const c of vis)grid.appendChild(c);empty.hidden=n>0;const count=document.getElementById('count');if(count)count.textContent=(n===cards.length?n+' app'+(n===1?'':'s'):n+' of '+cards.length+' apps');}
q.addEventListener('input',apply);sort.addEventListener('change',apply);
const reset=document.getElementById('reset');if(reset)reset.addEventListener('click',()=>{q.value='';cat='all';for(const o of document.querySelectorAll('.cats button'))o.setAttribute('aria-pressed',o.dataset.cat==='all');apply();});
for(const b of document.querySelectorAll('.cats button'))b.addEventListener('click',()=>{cat=b.dataset.cat;for(const o of document.querySelectorAll('.cats button'))o.setAttribute('aria-pressed',o===b);apply();});
apply();`;

export function renderIndexPage(catalog: Catalog): string {
  const fw = catalog.firmware ? ` · Firmware ${e(catalog.firmware.version)}` : "";
  const counts = new Map<string, number>();
  for (const a of catalog.apps) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  // A category nobody has published is disabled rather than a dead end.
  const cats = ["all", ...CATEGORIES].map((c) => {
    const n = c === "all" ? catalog.apps.length : counts.get(c) ?? 0;
    return `<button data-cat="${c}" aria-pressed="${c === "all"}"${n === 0 ? " disabled" : ""}>${c}<span class="n">${n}</span></button>`;
  }).join("");
  const n = catalog.apps.length;
  const body = `
<div class="page-head"><h2>Apps for the PicoCalc</h2><p class="meta"><span id="count">${n} ${n === 1 ? "app" : "apps"}</span>${fw} · Indexed ${timeTag(catalog.generated_at)}</p></div>
<div class="tools"><input id="q" type="search" placeholder="Search apps, authors, ids" aria-label="Search">
<select id="sort" aria-label="Sort"><option value="pushed">Recently updated</option><option value="stars">Most stars</option><option value="name">Name</option></select></div>
<div class="cats">${cats}</div>
<div class="grid" id="grid">${catalog.apps.map(card).join("\n")}</div>
<div class="empty" id="empty"${catalog.apps.length ? " hidden" : ""}>${catalog.apps.length ? `<strong>No apps match</strong><span id="emptymsg">No apps in this category yet.</span><br><button type="button" id="reset">Show all apps</button>` : `<strong>No apps listed yet</strong>Be the first: tag a repository with <code>picos-app</code>.`}</div>
<div class="panel notice"><strong>Get your app listed.</strong> Tag a public GitHub repo with <code>picos-app</code>, add an <code>app.json</code> and a Release with one ZIP. <a href="/publish">Read the publishing guide</a>.</div>`;
  return renderPage({ title: "PicOS App Store", description: "Apps for the ClockworkPi PicoCalc running PicOS", body, script: SCRIPT, path: "/" });
}
