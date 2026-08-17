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

Higher-quality narration via Gemini (`gemini-2.5-flash-preview-tts`) is generated **server-side** by the included backend — users never enter or hold an API key. Run the Node server instead of the static Python server:

```bash
cp .env.example .env      # then edit .env and paste the key (this file is gitignored)
npm start                 # or: GEMINI_API_KEY=your-key node server.js
```

Open **http://localhost:8080/** and choose **Settings → Narration voice → Gemini AI voice**. The browser calls `POST /api/tts`, and `server.js` calls Gemini using `GEMINI_API_KEY` from the environment. The key is never sent to the browser.

**Never commit the key.** Put it in `.env` (gitignored) or a host secret — not in the source.

> GitHub Pages is static-only and cannot run this proxy, so the Gemini voice only works where the backend runs. To use it in production, deploy `server.js` (or an equivalent `/api/tts` function) to a host that supports server code (e.g. a serverless function) and set `GEMINI_API_KEY` there as a secret. On plain static hosting the app falls back to the free offline **Device voice**.
