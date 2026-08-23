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

## Suggestions + Maps (asked, not started)

Suggestions are **not stories**. They are **real-world, searched, confirmed local places** (live local search — not Gemini lore, not Wikipedia tales, not the shared clip library).

**Single-use, not toggles.** Do not put these on the story-interest chip row and do not persist them as Settings filters. Each tap **fires immediately** and is **prioritized** over the current tale lookup: run that search now, show the suggestion card, do not wait for the next kilometre. The control returns to idle after the search; it does not stay “on”.

Kinds (slightly separate space from Interests — one-shot buttons):

- Entertainment
- Events
- Dining
- Sightseeing
- Parks / reserves
- Restroom

**Nearest first.** Rank by distance from the current GPS fix. Can return more than one. The card’s Maps section lists **up to three** confirmed nearby choices (label + distance), each launching Google Maps with that destination loaded (`maps/dir/?api=1&destination=` lat,lng or place query). Passenger hop-out, not in-app navigation. Do not put a share icon on the home top bar.

A lore/Wikipedia story card can still get a single Maps hop when it has a place.

**Dining.** One button. The first card is a **selection of what was found nearby**, spanning high-end, casual, fast food, bakeries, and the like. Populate **food-type choices from those found offerings** (only types that actually exist in the result set). The passenger can jump straight to Maps (up to three places) or tap a type to run a **specified local search** and refresh the Maps choices. Do not invent a type that had no nearby hit.
