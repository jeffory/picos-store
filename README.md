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

Setup, secrets and deployment: see the Operations section (filled in by Task 11).
