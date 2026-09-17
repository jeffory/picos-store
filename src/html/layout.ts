export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO timestamp → "16 Sep 2026, 22:31 UTC"; anything unparseable is returned as-is. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

export function timeTag(iso: string): string {
  return `<time datetime="${escapeHtml(iso)}">${escapeHtml(formatDate(iso))}</time>`;
}

export function safeUrl(value: string, fallback: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return value;
  } catch {
    // fall through to fallback
  }
  return fallback;
}

const CSS = `
:root{color-scheme:light dark;--bg:#f6f6f4;--fg:#1a1a1a;--muted:#5a5a5a;--card:#fff;--line:#ddd;--accent:#0b6b4f;--accent-fg:#fff;--pill:#e8efe9;--ok:#1a9c5b;--warn:#c98a00;--code:#8a3b12}
@media(prefers-color-scheme:dark){:root{--bg:#121212;--fg:#ececec;--muted:#9a9a9a;--card:#1c1c1c;--line:#333;--accent:#6fd3a8;--accent-fg:#0d1f17;--pill:#1f2b25;--ok:#5fd39a;--warn:#e0b34a;--code:#f0a36b}}
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}time{white-space:nowrap}.wrap{max-width:960px;width:100%;margin:0 auto;padding:20px 16px 24px;flex:1;display:flex;flex-direction:column}.wrap>footer{margin-top:auto}.wrap>footer{padding-top:16px}
header{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid var(--line);margin-bottom:24px}
header h1{margin:0;font-size:20px}header nav{display:flex;flex-wrap:wrap;gap:6px 16px}header nav a{text-decoration:none;font-weight:500}header nav a:hover{text-decoration:underline}
.page-head{margin:0 0 20px}.page-head h2{margin:0 0 4px;font-size:26px;line-height:1.2}.page-head p{margin:0}
.meta{color:var(--muted);font-size:13px}
.tools{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.tools input,.tools select{padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit;min-height:40px}
.tools input{flex:1 1 240px;min-width:0}.tools select{flex:0 0 auto}
.cats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
.cats button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:5px 14px;font:inherit;cursor:pointer;text-transform:capitalize}
.cats button[aria-pressed=true]{background:var(--accent);color:var(--accent-fg);border-color:var(--accent);font-weight:600}
.cats button .n{opacity:.65;margin-left:6px;font-size:12px}.cats button[disabled]{opacity:.4;cursor:default}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:8px}
.cardhead{display:flex;gap:12px;align-items:flex-start}.cardhead>div{min-width:0;flex:1}
.icon{flex:0 0 auto;width:48px;height:48px;border-radius:10px;border:1px solid var(--line);background:var(--pill);object-fit:cover;display:flex;align-items:center;justify-content:center;font:600 22px/1 system-ui,sans-serif;color:var(--accent)}
.icon.lg{width:64px;height:64px;border-radius:12px;font-size:28px}
.shots{display:flex;flex-wrap:wrap;gap:10px;margin:4px 0 0}.shots img{max-width:100%;border:1px solid var(--line);border-radius:8px;background:var(--card)}
.card h2{margin:0;font-size:18px}.card h2 a{text-decoration:none;color:inherit}.card h2 a:hover{text-decoration:underline}.card p{margin:0;flex:1}
.pill{display:inline-block;background:var(--pill);color:var(--fg);border-radius:999px;padding:1px 9px;font-size:12px;text-transform:capitalize}
.row{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:13px;color:var(--muted)}
.links{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}.card .links{margin-top:4px}
.btn{display:inline-block;padding:9px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-fg);text-decoration:none;font-weight:600}
.btn.secondary{background:transparent;color:var(--accent)}.btn.small{padding:4px 10px;font-size:13px;font-weight:600}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 24px}
.detail{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}.detail>div:first-child{display:flex;flex-direction:column;gap:16px}.detail>div:first-child>p{margin:0}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}.panel h3{margin:0 0 10px;font-size:15px}
.notice{background:var(--pill);border:0;border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:14px 16px}
dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 16px;margin:0}dt{color:var(--muted)}dd{margin:0;min-width:0;overflow-wrap:anywhere}
.hashbox{margin-top:8px;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px 10px;display:flex;gap:8px;align-items:flex-start}.hash{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5;letter-spacing:.02em;word-break:break-all;color:var(--fg)}
.copy{flex:0 0 auto;font:inherit;font-size:12px;padding:2px 8px;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}code{color:var(--code)}
pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto}pre code{color:inherit}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}td:first-child{white-space:nowrap}
.scroll{overflow-x:auto;max-width:100%}
details.reasons-wrap>summary{cursor:pointer;font-weight:600;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);display:inline-block}
.reasons .head{font-weight:600;color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--line);padding:6px 0}details.reasons-wrap[open]>summary{margin-bottom:4px}
.reasons{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:0 20px;margin:0}.reasons dt{padding:8px 0;border-bottom:1px solid var(--line);white-space:nowrap;color:inherit}.reasons dd{padding:8px 0;border-bottom:1px solid var(--line)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:12px;margin:0 0 24px}.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}.stat b{display:block;font-size:24px;line-height:1.2;white-space:nowrap}.stat span{color:var(--muted);font-size:13px}
.status{display:inline-flex;align-items:center;gap:8px;font-weight:600}.status::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--ok)}.status.warn::before{background:var(--warn)}
.notice{margin-top:28px}
ol,ul{padding-left:22px}h3{margin:32px 0 10px;font-size:20px;letter-spacing:-.01em}
@media(max-width:640px){header{flex-direction:column;align-items:stretch;gap:10px;border-bottom:0;padding-bottom:0}header nav{display:grid;grid-template-columns:repeat(3,1fr);gap:0;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}header nav a{text-align:center;padding:8px 4px;border-bottom:0;border-right:1px solid var(--line);font-size:14px}header nav a:last-child{border-right:0}header nav a[aria-current=page]{background:var(--pill);border-bottom:0}.page-head h2{font-size:22px}.tools{flex-direction:column}.tools input,.tools select{flex:0 0 auto;width:100%}.detail{grid-template-columns:1fr}.actions .btn{flex:1 1 100%;text-align:center}.links a:not(.btn){min-height:44px;display:inline-flex;align-items:center;padding:0 2px}.card .links .btn{min-height:44px;align-items:center}.copy{min-height:44px;padding:0 14px}.empty button{min-height:44px}pre{font-size:12px}.reasons{grid-template-columns:1fr;gap:0}.reasons dt{border-bottom:0;padding:10px 0 2px}.reasons dd{padding:0 0 10px}dl{grid-template-columns:1fr;gap:2px 0}dt{margin-top:8px}}
header nav a[aria-current=page]{color:var(--fg);font-weight:700;border-bottom:2px solid var(--accent);padding-bottom:1px}
div.prose{max-width:76ch}
footer{margin-top:40px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:space-between;color:var(--muted);font-size:13px}footer a{margin-right:14px}
.empty{color:var(--muted);padding:28px 16px;text-align:center;background:var(--card);border:1px dashed var(--line);border-radius:10px}.empty strong{display:block;color:var(--fg);font-size:16px;margin-bottom:4px}
.empty.ok{border-style:solid}.empty.ok strong{color:var(--ok)}
.empty button{margin-top:10px;font:inherit;padding:7px 14px;border-radius:8px;border:1px solid var(--accent);background:transparent;color:var(--accent);cursor:pointer}

`;

const NAV: Array<[string, string]> = [["/", "Apps"], ["/publish", "Publish"], ["/status", "Status"]];

export function renderPage(opts: { title: string; description: string; body: string; script?: string; path?: string }): string {
  const nav = NAV.map(([href, label]) => `<a href="${href}"${href === opts.path ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230b6b4f'/><text x='16' y='23' font-family='system-ui,sans-serif' font-size='19' font-weight='700' fill='%23ffffff' text-anchor='middle'>P</text></svg>">
<meta name="description" content="${escapeHtml(opts.description)}">
<title>${escapeHtml(opts.title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header>
<h1><a href="/" style="color:inherit;text-decoration:none">PicOS App Store</a></h1>
<nav aria-label="Site">${nav}</nav>
</header>
${opts.body}
<footer><span>PicOS App Store · an automatic index of GitHub repositories tagged <code>picos-app</code></span><span><a href="/publish">Publishing guide</a><a href="/catalog.json">Catalog JSON</a><a href="https://github.com/jeffory/PicOS">PicOS on GitHub</a></span></footer>
</div>
${opts.script ? `<script>${opts.script}</script>` : ""}
</body>
</html>`;
}
