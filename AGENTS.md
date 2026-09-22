# Road Lore

Phone-first travel companion PWA. Static HTML/JS, **no build step, no dependencies, no package manager**. All app logic lives inline in `index.html` (HTML + CSS + a single `<script>`). Supporting files: `service-worker.js`, `manifest.webmanifest`, `icon.svg`.

## Cursor Cloud specific instructions

### Running the app
Serve the repo root as static files and open the app in a browser:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`. There is no build/compile step — edit `index.html` and refresh.

### Non-obvious caveats
- **Geolocation is required for the core flow.** The app calls `navigator.geolocation`; in a headless/VM Chrome there is no real GPS, so nothing happens after "Start trip" unless you inject a fake location. Set one via Chrome DevTools → three-dot menu → More tools → **Sensors** → Location (e.g. Latitude `51.5007`, Longitude `-0.1246` for central London, which has many nearby Wikipedia entries). Then click **Start trip** and **Allow** the location prompt.
- **Network is required.** Nearby lore comes from the live Wikipedia API (`https://en.wikipedia.org/w/api.php`, `list=geosearch` + `prop=extracts`). The lookup is client-side with `origin=*` (CORS). Confirm outbound network before expecting results.
- **Speech synthesis / "Voice error" is expected in the VM.** The default narration uses the device `speechSynthesis`; a headless VM Chrome usually has no voices/audio, so the voice status may show "Voice error". This is an environment limitation, not an app bug — the visual lookup + log flow still works.
- **Gemini AI voice is optional and user-key-driven — no env var/secret needed.** Settings → Narration voice → "Gemini AI voice" lets a user paste their own [Google AI Studio](https://aistudio.google.com/apikey) key (stored in `localStorage` only, never committed). It calls `https://generativelanguage.googleapis.com` with model `gemini-2.5-flash-preview-tts`. The environment needs nothing extra for this; the device-voice path is the default and works without a key.
- **Secure context needed for GPS on real deployments.** GPS only works over `https://` or `http://localhost` (localhost counts as secure).
- A **service worker** (`service-worker.js`) caches assets; when iterating on `index.html` locally, do a hard reload (or use DevTools "Update on reload") if changes don't appear.

### Lint / test / build
There is no lint config, no automated test suite, and no build tooling in this repo. Validation is manual via the browser flow described above.
