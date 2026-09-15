# PicOS-Store

Cloudflare Worker that indexes public GitHub repositories tagged `picos-app`
into the catalog consumed by the PicOS App Store, and serves a web listing
at https://picos.jeffory.dev.

- `GET /catalog.json` — catalog for the device
- `GET /catalog-debug.json` — catalog plus rejected repos with reasons
- `GET /health` — generation time and counts
- `GET /` `/apps/<id>` `/status` `/publish` — web pages
- `POST /refresh` — bearer `REFRESH_TOKEN`, runs a refresh now

## Develop

    npm install
    npm test
    npm run typecheck

Setup, secrets and deployment: see the Operations section below.

## Operations

### One-time setup

    npx wrangler login
    npx wrangler r2 bucket create picos-store
    npx wrangler kv namespace create PICOS_STORE_KV   # paste id into wrangler.toml
    npx wrangler secret put GITHUB_TOKEN               # fine-grained PAT, public read
    npx wrangler secret put REFRESH_TOKEN              # any long random string
    npx wrangler deploy

Then set the two GitHub Actions secrets: `gh secret set CLOUDFLARE_API_TOKEN`
and `gh secret set CLOUDFLARE_ACCOUNT_ID` (API token template "Edit
Cloudflare Workers" plus R2 and Workers KV write scopes).

CI deploys on every push to `main` using the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets.

### Before the first public refresh

Claims are first-come, first-served, so seed the first-party ids and dirnames
before anyone else can index one. From a PicOS checkout:

    ./scripts/seed-claims.sh ~/Projects/PicOS --dry-run   # review
    ./scripts/seed-claims.sh ~/Projects/PicOS

It reads every `apps/*/app.json` and writes `claim:<id>` and
`claim:dir:<dirname>` as `jeffory/picOS`. The dirnames PicOS ships in the
firmware image (`store`, `updater`, `filemanager`, `editor`,
`terminal_example`, `calculator`, `system`, `data`) are refused outright for
any repository other than `jeffory/picOS`, but ids and the remaining app
dirnames are not reserved until they are claimed.

### Refresh now

    curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" https://picos.jeffory.dev/refresh

### Delist a repository

    npx wrangler kv key put --binding PICOS_STORE_KV "block:owner/name" 1

Remove the key to relist. Takes effect on the next refresh.

### Resolve an id or dirname dispute

Ids and dirnames are both claimed by the first repository indexed with them.
An id claim lives at `claim:<id>`; a dirname claim lives at
`claim:dir:<dirname>`, because the store deletes `/apps/<dirname>` on the
device before extracting and two repositories sharing one dirname would
overwrite each other:

    npx wrangler kv key get --binding PICOS_STORE_KV "claim:com.example.app"
    npx wrangler kv key put --binding PICOS_STORE_KV "claim:com.example.app" "newowner/repo"
    npx wrangler kv key get --binding PICOS_STORE_KV "claim:dir:example"
    npx wrangler kv key put --binding PICOS_STORE_KV "claim:dir:example" "newowner/repo"

Deleting a claim key releases it to whoever is indexed next. A repository
rejected for a claim it should own appears on `/status` as
`id-claimed-by:<repo>` or `dirname-claimed-by:<repo>`.

### Force a re-hash of a release

Digest keys are `sha:<owner/name>@<tag>:<asset id>` and expire after 90 days.
The asset id is not in `catalog-debug.json`; list the keys for a repository
instead, which is the only way to see the id the cron actually used (the
scheduled run reads assets over GraphQL, whose node ids look like
`RA_kwDO...`, not the numeric REST ids):

    npx wrangler kv key list --binding PICOS_STORE_KV --prefix "sha:owner/name@"
    npx wrangler kv key delete --binding PICOS_STORE_KV "sha:owner/name@v1.0.0:<asset id>"

The REST ids, if you want to cross-check a release, come from the API:

    gh api repos/owner/name/releases/latest --jq '.assets[].id'

### Limits

Free plan: 50 subrequests per invocation. A refresh costs roughly 2 KV reads
per validated app (the id claim and the dirname claim) plus 1 search page per
100 repos, 2 GraphQL calls per 25 repos, 1 firmware call, and 1 download per
newly released ZIP (capped at 10 per run). The free plan's 50-subrequest cap
is therefore reached around 20 apps — plan on Workers Paid beyond that.
Hashing several 16 MB assets in one run also exceeds the free 10 ms CPU
budget; runs converge because each digest is cached individually, so the work
already done is not repeated.

### Notes

- `@cloudflare/workers-types` 5.x ships a single bundled `index.d.ts`;
  `tsconfig.json` uses the bare specifier, so upgrading the package changes
  the ambient types without a compatibility-date pin.
