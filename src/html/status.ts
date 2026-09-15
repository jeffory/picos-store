import type { Catalog, DebugInfo } from "../catalog";
import { escapeHtml as e, renderPage } from "./layout";

export function renderStatusPage(catalog: Catalog, debug: DebugInfo): string {
  const rows = debug.rejected.map((r) => `<tr><td><a href="https://github.com/${e(r.repo)}">${e(r.repo)}</a></td><td><code>${e(r.reason)}</code></td></tr>`).join("");
  const body = `
<h2>Index status</h2>
<p class="meta">Generated ${e(catalog.generated_at)} · ${catalog.apps.length} apps listed · ${debug.rejected.length} rejected</p>
<p>A repository tagged <code>picos-app</code> that does not appear in the store is listed here with the reason. The index refreshes every 30 minutes. See the <a href="/publish">publishing guide</a> for what each reason means.</p>
${debug.rejected.length ? `<table><thead><tr><th>Repository</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">No repositories were rejected.</p>`}
${debug.warnings.length ? `<h3>Warnings</h3><ul>${debug.warnings.map((w) => `<li>${e(w)}</li>`).join("")}</ul>` : ""}`;
  return renderPage({ title: "Status · PicOS App Store", description: "Index status and rejected repositories", body });
}
