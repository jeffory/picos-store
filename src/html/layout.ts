export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const CSS = `
:root{color-scheme:light dark;--bg:#f6f6f4;--fg:#1a1a1a;--muted:#666;--card:#fff;--line:#ddd;--accent:#0b6b4f;--pill:#e8efe9}
@media(prefers-color-scheme:dark){:root{--bg:#121212;--fg:#ececec;--muted:#9a9a9a;--card:#1c1c1c;--line:#333;--accent:#6fd3a8;--pill:#1f2b25}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}.wrap{max-width:960px;margin:0 auto;padding:24px 16px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between;margin-bottom:16px}
header h1{margin:0;font-size:22px}header nav a{margin-left:14px}.meta{color:var(--muted);font-size:13px}
.tools{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 20px}.tools input,.tools select{padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);font:inherit}
.tools input{flex:1;min-width:180px}.cats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.cats button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:4px 12px;font:inherit;cursor:pointer}
.cats button[aria-pressed=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px}
.card h2{margin:0;font-size:17px}.card p{margin:0}.pill{display:inline-block;background:var(--pill);border-radius:999px;padding:1px 8px;font-size:12px;margin-right:6px}
.row{display:flex;flex-wrap:wrap;gap:10px;font-size:13px;color:var(--muted)}.links a{margin-right:12px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px}dt{color:var(--muted)}dd{margin:0;word-break:break-all}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin-top:24px}.empty{color:var(--muted);padding:32px 0;text-align:center}
`;

export function renderPage(opts: { title: string; description: string; body: string; script?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="${escapeHtml(opts.description)}">
<title>${escapeHtml(opts.title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header>
<h1><a href="/" style="color:inherit;text-decoration:none">PicOS App Store</a></h1>
<nav><a href="/">Apps</a><a href="/publish">Publish</a><a href="/status">Status</a><a href="/catalog.json">JSON</a></nav>
</header>
${opts.body}
</div>
${opts.script ? `<script>${opts.script}</script>` : ""}
</body>
</html>`;
}
