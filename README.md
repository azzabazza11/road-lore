# Road Lore

Phone-first **travel companion** that looks up nearby places and narrates a short local intro as you drive.

**Live app (install this):** **https://azzabazza11.github.io/road-lore/**

![Scan to open Road Lore](share-qr.png)

That is **GitHub Pages**. Merging to `main` updates it in a minute — this is the URL the QR opens.

**Cloud Run** (`https://road-lore-528520900686.australia-southeast1.run.app/`) is the Gemini voice server. It is **not** updated on merge until GitHub secret `GCP_SA_KEY` is set (the Action then deploys). Until that happens, Cloud Run can sit on an old build (it was v1.1.0 when the QR first pointed there). Do not send people to Cloud Run for the current UI.

## Local

```bash
cd road-lore
cp .env.example .env      # paste GEMINI_API_KEY for voice / AI stories
npm start                 # or: python3 -m http.server 8080 for Wikipedia + device voice only
```

Open **http://localhost:8080/** — GPS needs a **secure context** (`https://` or `http://localhost`).

## Features

- **Start trip** — watches GPS while you move
- **Nearby lore** — Wikipedia places within ~10 km (API limit)
- **AI stories** — grounded local-history stories from the wider area (backend + Gemini + web search)
- **Narration** — Gemini voice by default on new installs (device voice after the complimentary week, or if you choose it)
- **Spacing** — Often / Sparse / Sporadic (default 0.5 km)
- **Log** — last five stories, replay or hear more
- Screen wake lock while travelling (optional)
- Light / dark / auto (follows day and night from GPS)
- Installed app asks before updating when a newer version is on the server
- **Share QR** — copy the live Pages link, support on Ko-fi, or open More apps
- Install from Chrome on Android, or Safari Add to Home Screen on iPhone

Passenger / co-pilot use recommended — don’t fiddle with the phone while driving.

## Android

1. Open the **Pages** URL in **Chrome** (not Samsung Internet)
2. Allow **location**
3. Tap **Start trip**, then **Test voice** once in Settings if needed
4. Chrome menu → **Install app** / **Add to Home screen**

If you previously installed from Cloud Run (the `.run.app` URL), that copy can stay on v1.1.0. Remove that icon and install again from GitHub Pages.

Samsung Internet may still warn that the WebAPK targets an older Android API. That warning is the browser’s installer, not Road Lore. Use Chrome.

## iPhone / iPad

1. Open the **Pages** URL in **Safari**
2. Allow **location** when asked
3. Share → **Add to Home Screen** → Add
4. Open **Road Lore** from the home screen

Version: **1.3.3**

Installed copies stay on the version they have until you tap **Update**. Settings and the story log are unchanged.

## Complimentary week, then free voice

Web apps cannot read a phone’s MAC address. Road Lore keeps a private random device id on the phone and a signed 7-day trial token from `POST /api/session`. Generated voice and AI stories work during that week. After it ends, the **on-device voice** and Wikipedia nearby lore continue.

## Gemini AI voice

Narration via Gemini (`gemini-2.5-flash-preview-tts`) is generated **on Cloud Run**. Users never hold an API key. The GitHub Pages install uses the **device voice** until Cloud Run is deployed from `main` and the phone opens that origin (or we wire Pages to call Cloud Run).

**Never commit the key.** It lives in Google Secret Manager as `GEMINI_API_KEY` (and in a local `.env` for laptop testing).

## How GitHub and Google fit together

1. You merge a PR into `main` on GitHub.
2. **GitHub Pages** updates — that is what the QR and hub should open.
3. A GitHub Action **also** deploys Cloud Run, but only after `GCP_SA_KEY` is set. That is what Gemini voice needs.

Until the Action has credentials, a merge does **not** update Cloud Run. Add this **once**:

```bash
# Project that already hosts the service (the number in the .run.app URL).
gcloud config set project YOUR_PROJECT_ID

gcloud iam service-accounts create github-deploy --display-name="GitHub deploy Road Lore"

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

### Cost / abuse protection

| Env var | Default | Meaning |
| --- | --- | --- |
| `RATE_MAX` | `20` | Max `/api/*` requests per IP per window |
| `RATE_WINDOW_MS` | `60000` | Rate-limit window (ms) |
| `DAILY_CAP` | `500` | Total `/api/*` calls per instance per UTC day |

Over the limit returns HTTP `429`. Keep `--max-instances` low (e.g. `5`). Set a **GCP budget alert**.

## AI local-history stories

**Settings → Lore source:** Auto / Wikipedia only / AI stories. AI uses `POST /api/lore` with Google Search grounding. Same Cloud Run origin as the app.
