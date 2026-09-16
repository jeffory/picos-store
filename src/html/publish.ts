import { renderPage } from "./layout";

export function renderPublishPage(): string {
  const body = `
<div class="prose">
<div class="page-head"><h2>Publish an app</h2><p class="meta">Four steps, no sign-up</p></div>
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
<p>The <a href="/status">status page</a> shows one of these codes next to any repository that is not listed.</p>
<details class="reasons-wrap" id="reasons"><summary>All rejection reasons</summary>
<dl class="reasons">
<dt><code>no-release</code></dt><dd>No published (non-draft, non-prerelease) GitHub Release.</dd>
<dt><code>github-error: &lt;message&gt;</code></dt><dd>GitHub returned an error for this repository during indexing; retried on the next refresh.</dd>
<dt><code>no-app-json</code></dt><dd><code>app.json</code> is missing at the release tag.</dd>
<dt><code>app-json-invalid</code></dt><dd><code>app.json</code> is not a JSON object.</dd>
<dt><code>missing-field:&lt;name&gt;</code></dt><dd>A required field is absent or not a string.</dd>
<dt><code>bad-id</code></dt><dd>Id must be reverse-DNS: lower-case letters and digits in 2–5 dot-separated segments of at most 32 characters each, e.g. <code>com.example.snake</code>.</dd>
<dt><code>bad-dirname</code></dt><dd><code>dirname</code> must be 1–32 characters of letters, digits, <code>_</code> or <code>-</code>; no slashes or dots.</dd>
<dt><code>no-zip-asset</code> / <code>multiple-zip-assets</code></dt><dd>The release needs exactly one ZIP, or name it in <code>asset</code>.</dd>
<dt><code>asset-not-found:&lt;name&gt;</code></dt><dd>The <code>asset</code> named in <code>app.json</code> is not on the release.</dd>
<dt><code>asset-not-zip:&lt;name&gt;</code></dt><dd>The asset named in <code>app.json</code> exists but is not a <code>.zip</code>.</dd>
<dt><code>asset-too-large</code></dt><dd>ZIP over 16 MB.</dd>
<dt><code>zip-invalid</code></dt><dd>The ZIP could not be parsed (corrupt archive, or ZIP64 which is not supported).</dd>
<dt><code>zip-layout</code></dt><dd>ZIP root lacks <code>app.json</code> or <code>main.lua</code>/<code>main.elf</code>.</dd>
<dt><code>zip-app-json-invalid</code></dt><dd>The <code>app.json</code> inside the ZIP is unreadable or has a bad id.</dd>
<dt><code>id-mismatch:&lt;id&gt;</code></dt><dd>The ZIP's id differs from the repository's.</dd>
<dt><code>id-claimed-by:&lt;repo&gt;</code></dt><dd>Another repository already publishes this id.</dd>
<dt><code>dirname-claimed-by:&lt;repo&gt;</code></dt><dd>Another repository already publishes this <code>dirname</code>. The store installs into <code>/apps/&lt;dirname&gt;</code> and clears it first, so a dirname belongs to one repository. Set a different <code>dirname</code> in <code>app.json</code>.</dd>
<dt><code>dirname-reserved</code></dt><dd>The <code>dirname</code> is one PicOS itself ships: <code>store</code>, <code>updater</code>, <code>filemanager</code>, <code>editor</code>, <code>terminal_example</code>, <code>calculator</code>, <code>system</code>, <code>data</code>. Pick another.</dd>
<dt><code>pending-digest</code></dt><dd>New release queued for hashing; it will appear on a later refresh.</dd>
<dt><code>asset-unreachable:&lt;status|error&gt;</code></dt><dd>The ZIP could not be downloaded — an HTTP status, or the name of the network error; retried next refresh.</dd>
<dt><code>digest-error:&lt;name&gt;</code></dt><dd>The index hit an unexpected error while reading the ZIP; it will retry on the next refresh.</dd>
<dt><code>blocked</code></dt><dd>Delisted by the maintainer.</dd>
</dl>
</details>
<h3>Updating</h3>
<p>Bump <code>version</code> in <code>app.json</code>, tag a new Release with a new ZIP. Devices see the update on their next catalog fetch. Removing the topic delists the app on the next refresh.</p>
</div>`;
  return renderPage({ title: "Publish · PicOS App Store", description: "How to list an app in the PicOS App Store", body, path: "/publish", script: "if(matchMedia('(min-width:641px)').matches)document.getElementById('reasons').open=true;" });
}
