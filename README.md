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
- **Narration** — short spoken intro via the device voice (mute / skip / replay)
- **Spacing** — won’t chatter every corner; min distance between stories
- **Log** — what you’ve heard this trip, with Wikipedia links
- Screen wake lock while travelling (optional)

Passenger / co-pilot use recommended — don’t fiddle with the phone while driving.

## Android

1. Open the Pages URL in **Chrome**
2. Allow **location**
3. Tap **Start trip**, then **Test voice** once in Settings if needed
4. **Install** / Add to Home screen

Version: **1.0.2**

## Gemini AI voice (optional)

There are two ways to use the higher-quality Gemini voice (`gemini-2.5-flash-preview-tts`). Pick **one**:

### A. Backend proxy — key stays on the server (recommended for a shared key)

The key is held server-side and never shipped to the browser. Run the included Node server instead of the static Python server:

```bash
cp .env.example .env      # then edit .env and paste your key (this file is gitignored)
npm start                 # or: GEMINI_API_KEY=your-key node server.js
```

Open **http://localhost:8080/** and choose **Settings → Narration voice → Gemini AI voice** (leave the API key field blank). The browser calls `POST /api/tts`, and `server.js` calls Gemini using `GEMINI_API_KEY` from the environment.

> GitHub Pages is static-only and cannot run this proxy. To use the backend in production, deploy `server.js` (or an equivalent `/api/tts` function) to a host that supports server code (e.g. a serverless function) and set `GEMINI_API_KEY` there as a secret.

**Never commit your key.** Put it in `.env` (gitignored) or a host secret — not in the source.

### B. Bring-your-own key — for plain static hosting (e.g. GitHub Pages)

With no backend running, paste your own [Google AI Studio](https://aistudio.google.com/apikey) key in **Settings → Narration voice → Gemini AI voice**. It is stored only on your device (`localStorage`) and sent directly from your browser to Google. Small per-use cost on your Google account.
