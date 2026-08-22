# Passenger Tales — agent notes

## Apps hub (camp mother)

The installable app is this repo (**Passenger Tales**). The hub tile on https://azzabazza11.github.io/apps/ is owned by **camp mother** in:

- https://github.com/azzabazza11/azzabazza11.github.io

This app repo publishes **`hub.json`** at the root. Do **not** edit the hub catalog / `apps/index.html` / fallbacks from here.

On every user-visible version ship: bump `APP_VERSION` and `hub.json.version` together (same string), prepend `changelog[]`, and push. `.github/workflows/notify-hub.yml` dispatches `hub-sync` when `hub.json` lands on `main` (needs `HUB_SYNC_TOKEN` or `HUB_TOKEN`; otherwise camp mother polls hourly).

See `.cursor/rules/hub-camp-mother.mdc` (always applied).

## Version jumps

Keep these the same string as `hub.json.version`:

- `index.html` — `APP_VERSION` and the meta description
- `version.json`
- `service-worker.js` — `CACHE` (`passenger-tales-v…`)
- `package.json`
- `README.md`
- `manifest.json` and `manifest.webmanifest`
- `admin-map.html` — `APP_VERSION`

Install URL remains **https://azzabazza11.github.io/road-lore/** (repo path). Cloud Run service name stays `road-lore`. API header `x-road-lore-trial` is unchanged for backend compatibility. Gemini voice and AI stories are open (no week-long trial).

Share QR stays in **Settings**. Do not put a share icon back on the home top bar.

## TTS clip cache (Phase 1)

`POST /api/tts` looks up `sha256(normalised text + voice)` in GCS when `GCS_BUCKET` is set. Hits skip Gemini. Misses generate, upload `tts/<hash>.json`, and return the same `{ audio, mimeType }` payload as before.

## Shared nearby library (Phase 2)

When `/api/tts` receives `lat`, `lng`, and optional `title`, the clip is registered under `nearby/<geohash>/`. `GET /api/nearby` returns clips within radius (story location only — no user tracks). The phone tries shared clips before `/api/lore` when AI is allowed.

## Admin clip map (Phase 3)

`admin-map.html` + `GET /api/clips` (metadata pins on OSM). Trial session or `MAP_TOKEN`. Do not add report/hide/expiry (Phase 4) until asked.
