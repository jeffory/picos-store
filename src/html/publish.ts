import { renderPage } from "./layout";

export function renderPublishPage(): string {
  const body = `
<h2>Publish an app</h2>
<p>The store is an automatic index of public GitHub repositories. There is no registration and no review queue; listing means a repository tagged itself, not that PicOS vetted it.</p>
<ol>
<li>Push your app to a <strong>public</strong> GitHub repository (not a fork) with <code>app.json</code> at the root.</li>
<li>Add the repository topic <code>picos-app</code> (Settings → Topics on GitHub).</li>
<li>Create a GitHub Release with exactly one <code>.zip</code> asset containing your app files at the archive root.</li>
<li>Wait up to 30 minutes, then check <a href="/status">status</a> if it is not listed.</li>
</ol>
<h3>app.json</h3>
<pre>{
  "id": "com.example.snake",
  "name": "Snake",
  "version": "1.2.0",
  "description": "One line shown in the store list",
  "long_description": "Optional longer text for the detail page",
  "author": "Your name",
  "category": "games",
  "min_firmware": "0.1.0",
  "requirements": ["audio"],
  "dirname": "snake",
  "homepage": "https://example.com",
  "asset": "snake.zip"
}</pre>
<p><code>id</code>, <code>name</code> and <code>version</code> are required. The index reads <code>app.json</code> at the release tag, so tag after bumping the version. <code>category</code> is one of <code>games, tools, system, demos, emulators, network</code>. <code>asset</code> is only needed when the release has more than one ZIP. <code>dirname</code> defaults to the last segment of the id.</p>
<h3>The ZIP</h3>
<p>Files must sit at the archive root: <code>app.json</code> plus <code>main.lua</code> (Lua app) or <code>main.elf</code> (native app), and any assets. Do not wrap them in a folder. The ZIP must be at most 16 MB, and the <code>id</code> in the ZIP's <code>app.json</code> must equal the one in the repository. The index computes the SHA-256 itself; you do not publish a checksum.</p>
<h3>Rejection reasons</h3>
<div class="scroll"><table><tbody>
<tr><td><code>no-release</code></td><td>No published (non-draft, non-prerelease) GitHub Release.</td></tr>
<tr><td><code>github-error: &lt;message&gt;</code></td><td>GitHub returned an error for this repository during indexing; retried on the next refresh.</td></tr>
<tr><td><code>no-app-json</code></td><td><code>app.json</code> is missing at the release tag.</td></tr>
<tr><td><code>app-json-invalid</code></td><td><code>app.json</code> is not a JSON object.</td></tr>
<tr><td><code>missing-field:&lt;name&gt;</code></td><td>A required field is absent or not a string.</td></tr>
<tr><td><code>bad-id</code></td><td>Id must be reverse-DNS: lower-case, digits, at least one dot, e.g. <code>com.example.snake</code>.</td></tr>
<tr><td><code>bad-dirname</code></td><td><code>dirname</code> must be 1–32 characters of letters, digits, <code>_</code> or <code>-</code>; no slashes or dots.</td></tr>
<tr><td><code>no-zip-asset</code> / <code>multiple-zip-assets</code></td><td>The release needs exactly one ZIP, or name it in <code>asset</code>.</td></tr>
<tr><td><code>asset-not-found:&lt;name&gt;</code></td><td>The <code>asset</code> named in <code>app.json</code> is not on the release.</td></tr>
<tr><td><code>asset-not-zip:&lt;name&gt;</code></td><td>The asset named in <code>app.json</code> exists but is not a <code>.zip</code>.</td></tr>
<tr><td><code>asset-too-large</code></td><td>ZIP over 16 MB.</td></tr>
<tr><td><code>zip-invalid</code></td><td>The ZIP could not be parsed (corrupt archive, or ZIP64 which is not supported).</td></tr>
<tr><td><code>zip-layout</code></td><td>ZIP root lacks <code>app.json</code> or <code>main.lua</code>/<code>main.elf</code>.</td></tr>
<tr><td><code>zip-app-json-invalid</code></td><td>The <code>app.json</code> inside the ZIP is unreadable or has a bad id.</td></tr>
<tr><td><code>id-mismatch:&lt;id&gt;</code></td><td>The ZIP's id differs from the repository's.</td></tr>
<tr><td><code>id-claimed-by:&lt;repo&gt;</code></td><td>Another repository already publishes this id.</td></tr>
<tr><td><code>pending-digest</code></td><td>New release queued for hashing; it will appear on a later refresh.</td></tr>
<tr><td><code>asset-unreachable:&lt;status&gt;</code></td><td>The ZIP could not be downloaded; retried next refresh.</td></tr>
<tr><td><code>digest-error:&lt;name&gt;</code></td><td>The index hit an unexpected error while reading the ZIP; it will retry on the next refresh.</td></tr>
<tr><td><code>blocked</code></td><td>Delisted by the maintainer.</td></tr>
</tbody></table></div>
<h3>Updating</h3>
<p>Bump <code>version</code> in <code>app.json</code>, tag a new Release with a new ZIP. Devices see the update on their next catalog fetch. Removing the topic delists the app on the next refresh.</p>`;
  return renderPage({ title: "Publish · PicOS App Store", description: "How to list an app in the PicOS App Store", body });
}
