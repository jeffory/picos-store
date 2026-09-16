import type { Catalog, DebugInfo } from "../catalog";
import { escapeHtml as e, formatDate, renderPage } from "./layout";

export function renderStatusPage(catalog: Catalog, debug: DebugInfo): string {
  const rows = debug.rejected.map((r) => `<tr><td><a href="https://github.com/${e(r.repo)}">${e(r.repo)}</a></td><td><code>${e(r.reason)}</code></td></tr>`).join("");
  const healthy = debug.warnings.length === 0;
  const [refreshDay, refreshTime] = formatDate(catalog.generated_at).split(", ") as [string, string | undefined];
  const body = `
<div class="page-head"><h2>Index status</h2><p class="status${healthy ? "" : " warn"}">${healthy ? "Index healthy" : "Index running with warnings"}</p></div>
<div class="stats">
<div class="stat"><b>${catalog.apps.length}</b><span>apps listed</span></div>
<div class="stat"><b>${debug.rejected.length}</b><span>repositories rejected</span></div>
<div class="stat"><b>${catalog.firmware ? e(catalog.firmware.version) : "—"}</b><span>latest firmware</span></div>
<div class="stat"><b>${e(refreshTime ?? refreshDay)}</b><span>last refresh, ${e(refreshDay)} · every 30 min</span></div>
</div>
<h3>Rejected repositories</h3>
<p class="prose">A repository tagged <code>picos-app</code> that does not appear in the store is listed here with the reason. See the <a href="/publish">publishing guide</a> for what each reason means.</p>
${debug.rejected.length ? `<div class="panel scroll"><table><thead><tr><th>Repository</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty ok"><strong>✓ Nothing rejected</strong>No repositories were rejected. Every repository tagged <code>picos-app</code> is listed.</div>`}
${debug.warnings.length ? `<h3>Warnings</h3><div class="panel"><ul style="margin:0">${debug.warnings.map((w) => `<li>${e(w)}</li>`).join("")}</ul></div>` : ""}`;
  return renderPage({ title: "Status · PicOS App Store", description: "Index status and rejected repositories", body, path: "/status" });
}
