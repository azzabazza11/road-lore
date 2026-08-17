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

In **Settings → Narration voice → Gemini AI voice**, paste a [Google AI Studio](https://aistudio.google.com/apikey) API key. The key is stored only on your phone. Uses `gemini-2.5-flash-preview-tts` for natural narration (small per-use cost on your Google account).
