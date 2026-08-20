# Passenger Tales — agent notes

## Apps hub (keep the tile current)

The installable app is this repo (**Passenger Tales**). The hub tile on https://azzabazza11.github.io/apps/ lives in a second repo:

- https://github.com/azzabazza11/azzabazza11.github.io
- File: `apps/index.html` — `PROJECTS` entry `id: 'road-lore'` (legacy id; title should read **Passenger Tales**)

Every version jump must update that card (or make it read `version.json` live). Helper:

```bash
python3 scripts/sync-hub-road-lore.py
```

Default hub checkout: `$HOME/azzabazza11.github.io` (cloned by `.cursor/clone-hub.sh`).

`cursor[bot]` can **read** the public hub but **cannot push** until:

1. [Cursor Integrations](https://cursor.com/dashboard/integrations) → GitHub includes `azzabazza11/azzabazza11.github.io` (or all repos), read-write.
2. A **multi-repo** Cloud Agent environment selects **both** `road-lore` and `azzabazza11.github.io`: [Environments](https://cursor.com/dashboard/cloud-agents#environments).

## Version jumps

Keep these the same string:

- `index.html` — `APP_VERSION` and the meta description
- `version.json`
- `service-worker.js` — `CACHE` (`passenger-tales-v…`)
- `package.json`
- `README.md`
- `manifest.json` and `manifest.webmanifest`

Then run `python3 scripts/sync-hub-road-lore.py`, commit the hub, and open/push a hub PR.

Install URL remains **https://azzabazza11.github.io/road-lore/** (repo path). Cloud Run service name stays `road-lore`. API header `x-road-lore-trial` is unchanged for backend compatibility.

Share QR stays in **Settings**. Do not put a share icon back on the home top bar.

## TTS clip cache (Phase 1)

`POST /api/tts` looks up `sha256(normalised text + voice)` in GCS when `GCS_BUCKET` is set. Hits skip Gemini. Misses generate, upload `tts/<hash>.json`, and return the same `{ audio, mimeType }` payload as before.

## Shared nearby library (Phase 2)

When `/api/tts` receives `lat`, `lng`, and optional `title`, the clip is registered under `nearby/<geohash>/`. `GET /api/nearby` returns clips within radius (story location only — no user tracks). The phone tries shared clips before `/api/lore` when AI is allowed.

## Admin clip map (Phase 3)

`admin-map.html` + `GET /api/clips` (metadata pins on OSM). Trial session or `MAP_TOKEN`. Do not add report/hide/expiry (Phase 4) until asked.
