# Road Lore

Phone-first **travel companion** that looks up nearby places and narrates a short local intro as you drive.

Live: **https://azzabazza11.github.io/road-lore/**

Static HTML/JS — no build step. Best on Android Chrome via GitHub Pages → Add to Home Screen.

## Local

```bash
cd road-lore
python3 -m http.server 8080
```

Open **http://localhost:8080/** — geolocation + Wikipedia need network; GPS needs a **secure context** (`https://` or `http://localhost`).

## Features

- **Start trip** — watches GPS while you move
- **Nearby lore** — Wikipedia places within ~10 km (API limit)
- **AI stories** — grounded local-history stories from the wider area (backend + Gemini + web search), great where Wikipedia is thin
- **Narration** — short spoken intro via the device voice (mute / skip / replay)
- **Spacing** — Often / Sparse / Sporadic (default 0.5 km)
- **Log** — last five stories, replay or hear more
- Screen wake lock while travelling (optional)
- Light / dark / auto (follows day and night from GPS)
- **More** — flesh out the current find (Wikipedia rest, then AI)
- Last five stories kept on-device, including Gemini audio so replay does not regenerate
- First-run welcome, then a short spoken note and a story from where you are
- **Share QR** — copy the live link, support on Ko-fi, or open More apps

Passenger / co-pilot use recommended — don’t fiddle with the phone while driving.

## Android

1. Open the Pages URL in **Chrome**
2. Allow **location**
3. Tap **Start trip**, then **Test voice** once in Settings if needed
4. **Install** / Add to Home screen

Version: **1.2.1**

## Gemini AI voice (optional)

Higher-quality narration via Gemini (`gemini-2.5-flash-preview-tts`) is generated **server-side** by the included backend — users never enter or hold an API key. Run the Node server instead of the static Python server:

```bash
cp .env.example .env      # then edit .env and paste the key (this file is gitignored)
npm start                 # or: GEMINI_API_KEY=your-key node server.js
```

Open **http://localhost:8080/** and choose **Settings → Narration voice → Gemini AI voice**. The browser calls `POST /api/tts`, and `server.js` calls Gemini using `GEMINI_API_KEY` from the environment. The key is never sent to the browser.

**Never commit the key.** Put it in `.env` (gitignored) or a host secret — not in the source.

> GitHub Pages is static-only and cannot run this proxy, so the Gemini voice only works where the backend runs. To use it in production, deploy `server.js` (or an equivalent `/api/tts` function) to a host that supports server code (e.g. a serverless function) and set `GEMINI_API_KEY` there as a secret. On plain static hosting the app falls back to the free offline **Device voice**.

## Deploy to Google Cloud Run

The backend (which serves the whole app + `/api/tts` + `/api/lore`) runs as a container, so it deploys to Cloud Run for a stable public HTTPS URL — ideal for linking from an app hub, and it removes the laptop/tunnel dependency.

```bash
# 1. Store the key in Secret Manager (once). Paste your key at the prompt:
printf '%s' 'YOUR_GEMINI_KEY' | gcloud secrets create GEMINI_API_KEY --data-file=-
#    (to rotate later: ...gcloud secrets versions add GEMINI_API_KEY --data-file=-)

# 2. Deploy from source (Cloud Build uses the included Dockerfile).
#    australia-southeast1 (Sydney) is the closest region to NZ.
gcloud run deploy road-lore \
  --source . \
  --region australia-southeast1 \
  --allow-unauthenticated \
  --max-instances 5 \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

Cloud Run prints a `https://road-lore-XXXXXXXX.run.app` URL — that serves the app and the APIs from one origin (no CORS setup needed), and is what you point the hub tile at. The key is injected at runtime from Secret Manager and is never in the image. Cloud Run sets `PORT`, which `server.js` already honours.

### Cost / abuse protection

The Gemini endpoints cost money per call, so the server guards them:

| Env var | Default | Meaning |
| --- | --- | --- |
| `RATE_MAX` | `20` | Max `/api/*` requests per IP per window |
| `RATE_WINDOW_MS` | `60000` | Rate-limit window (ms) |
| `DAILY_CAP` | `500` | Total `/api/*` calls per instance per UTC day |

Over the limit returns HTTP `429` with `Retry-After`. Counters are in-memory, so with several instances each keeps its own tally — keep `--max-instances` low (e.g. `5`) so the effective daily ceiling stays bounded; for a hard global cap use a shared store (Firestore/Redis). Also set a **GCP budget alert** so you're warned well before the $20 runs out. Tune limits per deploy, e.g. `--set-env-vars RATE_MAX=15,DAILY_CAP=300`.

## AI local-history stories (optional)

With the backend running, **Settings → Lore source** offers:

- **Auto** — Wikipedia first, then AI to fill gaps (default)
- **Wikipedia only**
- **AI stories** — always generate from the wider area

AI stories are produced by `POST /api/lore` in `server.js`, which calls Gemini (`gemini-3.6-flash` by default, override with `GEMINI_TEXT_MODEL`) with **Google Search grounding** so the narration is fact-based and comes with source links (shown in the "Along the way" log). This is ideal for rural/regional routes where Wikipedia has little geotagged coverage. The **Don't repeat stories** toggle asks the model to avoid recently-heard topics and suppresses repeat Wikipedia hits. Like the Gemini voice, this needs the backend (not plain static hosting) and bills per use on your Google account.
