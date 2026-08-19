# Hub card patch for Passenger Tales

These two files are ready-to-go replacements for the live hub repo.

## What changes
- `apps/index.html` — card title: **Passenger Tales**, version: **1.4.0**, live version.json feed added
- `apps/service-worker.js` — cache bumped to `apps-hub-v1.4.1`

## How to apply (from your laptop)

```bash
cd ~/azzabazza11.github.io          # your local clone of the hub repo
git pull origin main                # make sure you're current
git checkout -b passenger-tales-v1.4.0

# Copy files from here
cp /path/to/road-lore/hub-patch/apps-index.html apps/index.html
cp /path/to/road-lore/hub-patch/apps-service-worker.js apps/service-worker.js

git add apps/index.html apps/service-worker.js
git commit -m "Passenger Tales v1.4.0 hub card."
git push origin passenger-tales-v1.4.0
# then open a PR on GitHub
```

## Automatic going forward

Once you add `HUB_TOKEN` secret to road-lore repo (a PAT with repo scope on azzabazza11.github.io),
the GitHub Action `.github/workflows/sync-hub-card.yml` will open hub PRs automatically on every
version.json change merged to main.
