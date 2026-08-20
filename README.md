# Passenger Tales

Phone-first **passenger companion** that looks up nearby places and narrates a short local intro as you drive.

**Live app (install this):** **https://azzabazza11.github.io/road-lore/**

![Scan to open Passenger Tales](share-qr.png)

The install URL still uses the `road-lore` path from the original repo name. The app title on your home screen is **Passenger Tales**.

That is **GitHub Pages**. Merging to `main` updates it in a minute — this is the URL the QR opens.

**Cloud Run** (`https://road-lore-528520900686.australia-southeast1.run.app/`) is the Gemini voice server. Redeploy after merges until GitHub secret `GCP_SA_KEY` is set (then the Action deploys on merge).

## Local

```bash
cd road-lore
cp .env.example .env      # paste GEMINI_API_KEY for voice / AI stories
npm start                 # or: python3 -m http.server 8080 for Wikipedia + device voice only
npm test                  # TTS cache unit tests
```

Open **http://localhost:8080/** — GPS needs a **secure context** (`https://` or `http://localhost`).

## Features

- **Start trip** — watches GPS while you move
- **Nearby stories** — Wikipedia places within ~10 km (API limit)
- **AI stories** — grounded local-history stories from the wider area (backend + Gemini + web search)
- **Narration** — Gemini voice by default on new installs (device voice after the complimentary week, or if you choose it)
- **Spoken-clip cache** — Cloud Run reuses a clip when the same story text and voice are requested again (GCS; off until `GCS_BUCKET` is set)
- **Shared nearby stories** — travellers can replay AI-narrated clips left near a place (skips Gemini lore + TTS when a match exists)
- **Spacing** — Often / Sparse / Sporadic (default 0.5 km)
- **Log** — last five stories, replay or hear more
- Screen wake lock while travelling (optional)
- Light / dark / auto (follows day and night from GPS)
- Installed app asks before updating when a newer version is on the server
- **Share QR** — copy the live Pages link, support on Ko-fi, or open More apps
- Install from Chrome on Android, or Safari Add to Home Screen on iPhone (**Install on phone** in the app)

Passenger / co-pilot use recommended — don’t fiddle with the phone while driving.

## Android

1. Open the **Pages** URL in **Chrome** (not Samsung Internet)
2. Allow **location**
3. Tap **Start trip**, then **Test voice** once in Settings if needed
4. Chrome menu → **Install app** / **Add to Home screen**

If you previously installed an old **Road Lore** icon, remove it and install again from GitHub Pages.

Samsung Internet may still warn that the WebAPK targets an older Android API. That warning is the browser’s installer, not Passenger Tales. Use Chrome.

## iPhone / iPad

1. Open the **Pages** URL in **Safari**
2. Allow **location** when asked
3. Share → **Add to Home Screen** → Add
4. Open **Passenger Tales** from the home screen

Version: **1.6.0**

The apps hub tile on https://azzabazza11.github.io/apps/ (repo [`azzabazza11.github.io`](https://github.com/azzabazza11/azzabazza11.github.io)) still uses id `road-lore` until updated. Run `python3 scripts/sync-hub-road-lore.py` on version jumps.

Installed copies stay on the version they have until you tap **Update**. Settings and the story log are unchanged.

## Complimentary week, then free voice

Web apps cannot read a phone’s MAC address. Passenger Tales keeps a private random device id on the phone and a signed 7-day trial token from `POST /api/session`. Generated voice and AI stories work during that week. After it ends, the **on-device voice** and Wikipedia nearby lore continue.

## Gemini AI voice

Narration via Gemini (`gemini-2.5-flash-preview-tts`) is generated **on Cloud Run**. The GitHub Pages app calls that server for `/api/tts` and `/api/lore` (the key never ships to the phone). If Cloud Run is unreachable, Test voice falls back to the device voice.

**Spoken-clip cache (Phase 1).** After a successful Gemini TTS call, Cloud Run stores the PCM in GCS under `tts/<sha256(text+voice)>.json`. The next request with the same normalised text and voice is served from the bucket — no second Gemini bill.

**Shared nearby library (Phase 2).** When TTS is generated (or served from cache) with GPS coordinates, the clip is also indexed under `nearby/<geohash>/`. `GET /api/nearby?lat=&lng=&radius=&voice=` returns matching clips within ~10 km so another traveller can hear them without calling `/api/lore` or Gemini TTS. Only **story location** is stored — not user tracks.

Story order on the phone:

- **Auto:** Wikipedia → shared nearby → grounded AI lore
- **AI stories:** shared nearby → grounded AI lore

The bucket is private. The browser still receives `{ audio, mimeType }` as today; a `cache` field (`hit` / `miss` / `off` / `error`) and header `X-TTS-Cache` are extra. Phone IndexedDB (last five clips) is unchanged.

If `GCS_BUCKET` is unset, behaviour is the old always-call-Gemini path and `/api/nearby` returns `{ clips: [], index: "off" }`.

### One-time: create the clip bucket

```bash
gcloud config set project gen-lang-client-0257656817

gcloud storage buckets create gs://passenger-tales-clips \
  --location=australia-southeast1 \
  --uniform-bucket-level-access

# Runtime identity for service road-lore (empty means the default compute SA).
SA=$(gcloud run services describe road-lore \
  --region=australia-southeast1 \
  --format='value(spec.template.spec.serviceAccountName)')
if [ -z "$SA" ]; then
  SA="$(gcloud projects describe gen-lang-client-0257656817 --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
fi

gcloud storage buckets add-iam-policy-binding gs://passenger-tales-clips \
  --member="serviceAccount:${SA}" \
  --role="roles/storage.objectAdmin"

gcloud run services update road-lore \
  --region=australia-southeast1 \
  --update-env-vars=GCS_BUCKET=passenger-tales-clips
```

Keep the bucket **not public**. Do not add `GCS_BUCKET` via `--set-env-vars` on a full deploy (that replaces the whole env map); use `--update-env-vars` as above.

**Never commit the key.** It lives in Google Secret Manager as `GEMINI_API_KEY` (and in a local `.env` for laptop testing).

## How GitHub and Google fit together

1. You merge a PR into `main` on GitHub.
2. **GitHub Pages** updates — that is what the QR and hub should open.
3. A GitHub Action **also** deploys Cloud Run, but only after `GCP_SA_KEY` is set. That is what Gemini voice needs.

Until the Action has credentials, a merge does **not** update Cloud Run. Add this **once**:

```bash
# Project that already hosts the service (the number in the .run.app URL).
gcloud config set project YOUR_PROJECT_ID

gcloud iam service-accounts create github-deploy --display-name="GitHub deploy Passenger Tales"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud iam service-accounts keys create github-deploy.json \
  --iam-account=github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

- Name: `GCP_SA_KEY`
- Value: the full contents of `github-deploy.json`

Then delete `github-deploy.json` from your laptop. Re-run **Actions → Deploy Cloud Run → Run workflow**, or merge any following PR.

Existing Cloud Run secrets (`GEMINI_API_KEY`) stay as they are; the Action does not replace them.

You can still deploy by hand if you want:

```bash
gcloud run deploy road-lore \
  --source . \
  --region australia-southeast1 \
  --allow-unauthenticated \
  --max-instances 5 \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

After the image is live, set the cache bucket once (safe to repeat):

```bash
gcloud run services update road-lore \
  --region australia-southeast1 \
  --update-env-vars GCS_BUCKET=passenger-tales-clips
```

### Cost / abuse protection

| Env var | Default | Meaning |
| --- | --- | --- |
| `RATE_MAX` | `20` | Max `/api/*` requests per IP per window |
| `RATE_WINDOW_MS` | `60000` | Rate-limit window (ms) |
| `DAILY_CAP` | `500` | Total `/api/*` calls per instance per UTC day |
| `GCS_BUCKET` | *(unset)* | Private bucket for TTS clip reuse; skip Gemini on text+voice hits |
| `NEARBY_DEFAULT_RADIUS_M` | `10000` | Default search radius for `GET /api/nearby` |
| `NEARBY_MAX_RADIUS_M` | `15000` | Hard cap on nearby radius (metres) |

Over the limit returns HTTP `429`. Keep `--max-instances` low (e.g. `5`). Set a **GCP budget alert**.

## AI local-history stories

**Settings → Lore source:** Auto / Wikipedia only / AI stories. AI uses `POST /api/lore` with Google Search grounding. Same Cloud Run origin as the app.
