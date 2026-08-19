# Road Lore — agent notes

## Apps hub (keep the lore card current)

The installable app is this repo. The **Road Lore tile** on https://azzabazza11.github.io/apps/ lives in a second repo:

- https://github.com/azzabazza11/azzabazza11.github.io
- File: `apps/index.html` — `PROJECTS` entry `id: 'road-lore'` (`version` / `versionUrl`)

Every version jump in this repo must update that card (or make it read `version.json` live). Helper:

```bash
python3 scripts/sync-hub-road-lore.py
```

Default hub checkout: `$HOME/azzabazza11.github.io` (cloned by `.cursor/clone-hub.sh`).

`cursor[bot]` can **read** the public hub but **cannot push** until:

1. [Cursor Integrations](https://cursor.com/dashboard/integrations) → GitHub includes `azzabazza11/azzabazza11.github.io` (or all repos), read-write.
2. A **multi-repo** Cloud Agent environment selects **both** `road-lore` and `azzabazza11.github.io`: [Environments](https://cursor.com/dashboard/cloud-agents#environments).

`.cursor/environment.json` `repositoryDependencies` only widens token scope. It does not clone the hub as a first-class workspace or let the built-in PR tool target it. Select both repos on the environment for that.

## Version jumps

Keep these the same string:

- `index.html` — `APP_VERSION` and the meta description
- `version.json`
- `service-worker.js` — `CACHE` (`road-lore-v…`)
- `package.json`
- `README.md`
- `manifest.json` and `manifest.webmanifest`

Then run `python3 scripts/sync-hub-road-lore.py`, commit the hub, and open/push a hub PR.

Share QR stays in **Settings**. The share sheet **More apps** button opens the hub. Do not put a share icon back on the home top bar.
