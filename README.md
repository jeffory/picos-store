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

### Refresh now

    curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" https://picos.jeffory.dev/refresh

### Delist a repository

    npx wrangler kv key put --binding PICOS_STORE_KV "block:owner/name" 1

Remove the key to relist. Takes effect on the next refresh.

### Resolve an id dispute

Ids are claimed by the first repository indexed with them:

    npx wrangler kv key get --binding PICOS_STORE_KV "claim:com.example.app"
    npx wrangler kv key put --binding PICOS_STORE_KV "claim:com.example.app" "newowner/repo"

### Force a re-hash of a release

    npx wrangler kv key delete --binding PICOS_STORE_KV "sha:owner/name@v1.0.0:<asset id>"

Asset ids are visible in `catalog-debug.json` reasons or via the GitHub API.

### Limits

Free plan: 50 subrequests per invocation. A refresh uses 1 search page per
100 repos, 2 GraphQL calls per 25 repos, 1 firmware call, and 1 download
per newly released ZIP (capped at 10 per run). Around 100 apps fits.

### Notes

- `@cloudflare/workers-types` 5.x ships a single bundled `index.d.ts`;
  `tsconfig.json` uses the bare specifier, so upgrading the package changes
  the ambient types without a compatibility-date pin.
