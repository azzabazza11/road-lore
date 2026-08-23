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

**Shipped 1.9.7:** Play on the pin card. `GET /api/clip?key=` loads one GCS object by `ttsKey` (trial or `MAP_TOKEN`). Pin list stays metadata-only. L16 playback in the map page. No Gemini.

## Suggestions + Maps (1.10.0)

Suggestions are **not stories**. They find **real-world, confirmed local places** (OSM via Overpass on Cloud Run). Buttons are **single-use, not toggles** — not on the story-interest chip row, not persisted as Settings filters. A tap **fires immediately** and is **prioritized** over the tale pipeline; control returns to idle after the search.

Kinds (separate space): Entertainment, Events, Dining, Sightseeing, Parks / reserves, Restroom.

**Nearest first**, more than one result. Card Maps section: **up to three** choices (label + distance), each `https://www.google.com/maps/dir/?api=1&destination=lat,lng`. Passenger hop-out, not in-app nav.

Lore / Wikipedia cards still get a **single** Maps hop when they have a place.

**Dining:** one button. First card = **mix of what was found** (fine dining → restaurant → cafe → pub → bakery → fast food). Food-type chips **only from actual hits**. User can jump to Maps or tap a type to refine. Do not invent a type with no nearby hit.

`GET /api/suggest?kind=&lat=&lng=&type=` (trial session). If Cloud Run is behind Pages (404/5xx), the phone searches Overpass directly (`overpass-api.de` / `overpass.kumi.systems` in CSP). Empty rural hits show “nothing nearby,” not a failure. Hold auto-lore ~45s after a suggestion so the card is not immediately overwritten. Do not log suggestions as heard tales.

**Shipped 1.10.1:** phone Overpass fallback so Suggestions work before Cloud Run is redeployed. Cloud Run is still 1.7.0 until `GCP_SA_KEY` is set and the deploy Action runs.
