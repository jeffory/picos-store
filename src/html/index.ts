import { CATEGORIES, type Catalog, type CatalogApp } from "../catalog";
import { escapeHtml as e, renderPage, timeTag } from "./layout";

export function zipUrl(a: CatalogApp): string {
  return `https://github.com/${a.repo}/releases/download/${a.release_tag}/${a.asset}`;
}

export function formatSize(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

function card(a: CatalogApp): string {
  const search = [a.name, a.description, a.author, a.id].join(" ").toLowerCase();
  return `<article class="card" data-category="${e(a.category)}" data-stars="${a.stars}" data-pushed="${e(a.pushed_at)}" data-name="${e(a.name.toLowerCase())}" data-search="${e(search)}">
<h2><a href="/apps/${e(a.id)}">${e(a.name)}</a></h2>
<p>${e(a.description.replace(/\.\s*$/, ""))}</p>
<div class="row"><span class="pill">${e(a.category)}</span><span>v${e(a.version)}</span><span>${e(a.author)}</span><span>${formatSize(a.size_kb)}</span><span>★ ${a.stars}</span></div>
<div class="links"><a class="btn small" href="${e(zipUrl(a))}">Download ZIP</a><a href="/apps/${e(a.id)}">Details</a><a href="https://github.com/${e(a.repo)}">Source</a></div>
</article>`;
}

const SCRIPT = `
const q=document.getElementById('q'),sort=document.getElementById('sort'),grid=document.getElementById('grid'),empty=document.getElementById('empty');
const cards=[...grid.querySelectorAll('.card')];let cat='all';
function apply(){const t=q.value.trim().toLowerCase();let n=0;
for(const c of cards){const ok=(cat==='all'||c.dataset.category===cat)&&(!t||c.dataset.search.includes(t));c.hidden=!ok;if(ok)n++;}
const key=sort.value;const vis=cards.filter(c=>!c.hidden).sort((a,b)=>key==='name'?a.dataset.name.localeCompare(b.dataset.name):key==='pushed'?b.dataset.pushed.localeCompare(a.dataset.pushed):(+b.dataset.stars)-(+a.dataset.stars));
for(const c of vis)grid.appendChild(c);empty.hidden=n>0;const count=document.getElementById('count');if(count)count.textContent=(n===cards.length?n+' app'+(n===1?'':'s'):n+' of '+cards.length+' apps');}
q.addEventListener('input',apply);sort.addEventListener('change',apply);
const reset=document.getElementById('reset');if(reset)reset.addEventListener('click',()=>{q.value='';cat='all';for(const o of document.querySelectorAll('.cats button'))o.setAttribute('aria-pressed',o.dataset.cat==='all');apply();});
for(const b of document.querySelectorAll('.cats button'))b.addEventListener('click',()=>{cat=b.dataset.cat;for(const o of document.querySelectorAll('.cats button'))o.setAttribute('aria-pressed',o===b);apply();});
apply();`;

export function renderIndexPage(catalog: Catalog): string {
  const fw = catalog.firmware ? ` · Firmware ${e(catalog.firmware.version)}` : "";
  const cats = ["all", ...CATEGORIES].map((c) => `<button data-cat="${c}" aria-pressed="${c === "all"}">${c}</button>`).join("");
  const n = catalog.apps.length;
  const body = `
<div class="page-head"><h2>Apps for the PicoCalc</h2><p class="meta"><span id="count">${n} ${n === 1 ? "app" : "apps"}</span>${fw} · Indexed ${timeTag(catalog.generated_at)}</p></div>
<div class="tools"><input id="q" type="search" placeholder="Search apps, authors, ids" aria-label="Search">
<select id="sort" aria-label="Sort"><option value="stars">Most stars</option><option value="pushed">Recently updated</option><option value="name">Name</option></select></div>
<div class="cats">${cats}</div>
<div class="grid" id="grid">${catalog.apps.map(card).join("\n")}</div>
<div class="empty" id="empty"${catalog.apps.length ? " hidden" : ""}>${catalog.apps.length ? `<strong>No apps match</strong>Nothing here yet. Try another category, or clear the search.<br><button type="button" id="reset">Show all apps</button>` : `<strong>No apps listed yet</strong>Be the first: tag a repository with <code>picos-app</code>.`}</div>
<div class="panel notice"><strong>Get your app listed.</strong> Tag a public GitHub repo with <code>picos-app</code>, add an <code>app.json</code> and a Release with one ZIP. <a href="/publish">Read the publishing guide</a>.</div>`;
  return renderPage({ title: "PicOS App Store", description: "Apps for the ClockworkPi PicoCalc running PicOS", body, script: SCRIPT, path: "/" });
}
