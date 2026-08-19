#!/usr/bin/env python3
"""Point the apps-hub Road Lore card at this repo's version.json.

Updates azzabazza11.github.io/apps/index.html:
  - PROJECTS entry id 'road-lore' version + versionUrl
  - fetches version.json at runtime so the badge follows Pages deploys
  - bumps HUB_VER / service-worker cache when the file changes

Does not push. After editing, commit in the hub checkout and open a PR.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "version.json").read_text())["version"]
VERSION_URL = "https://azzabazza11.github.io/road-lore/version.json"

REFRESH_FN = """
    async function refreshLiveVersions() {
      const jobs = PROJECTS.filter(p => p.versionUrl).map(async p => {
        try {
          const res = await fetch(p.versionUrl, { cache: 'no-store' });
          if (!res.ok) return;
          const data = await res.json();
          if (data && data.version) p.version = String(data.version);
        } catch {}
      });
      if (!jobs.length) return;
      await Promise.all(jobs);
      renderCards();
    }
    refreshLiveVersions();
"""


def hub_candidates() -> list[pathlib.Path]:
    paths: list[pathlib.Path] = []
    if len(sys.argv) > 1:
        paths.append(pathlib.Path(sys.argv[1]).expanduser())
    env = os.environ.get("HUB_DIR")
    if env:
        paths.append(pathlib.Path(env).expanduser())
    paths.extend(
        [
            pathlib.Path.home() / "azzabazza11.github.io",
            pathlib.Path("/home/ubuntu/azzabazza11.github.io"),
            ROOT.parent / "azzabazza11.github.io",
        ]
    )
    seen: set[pathlib.Path] = set()
    out: list[pathlib.Path] = []
    for p in paths:
        try:
            p = p.resolve()
        except OSError:
            continue
        if p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def find_hub() -> pathlib.Path:
    for p in hub_candidates():
        if (p / "apps" / "index.html").is_file():
            return p
    raise SystemExit(
        "Hub checkout not found. Clone https://github.com/azzabazza11/azzabazza11.github.io "
        "to $HOME/azzabazza11.github.io or pass the path as argv[1]."
    )


def parse_ver(s: str) -> tuple[int, ...]:
    nums = [int(p) for p in re.findall(r"\d+", s or "")]
    return tuple(nums) if nums else (0,)


def next_hub_ver(*candidates: str) -> str:
    best = max(parse_ver(c) for c in candidates if c)
    parts = list(best)
    parts[-1] += 1
    return ".".join(str(p) for p in parts)


def current_sw_ver(sw: str) -> str | None:
    m = re.search(r"const CACHE = 'apps-hub-v([^']+)'", sw)
    return m.group(1) if m else None


def bump_hub_ver(html: str, sw: str | None) -> tuple[str, str | None]:
    m = re.search(r"const HUB_VER = '([^']+)'", html)
    if not m:
        return html, None
    nxt = next_hub_ver(m.group(1), current_sw_ver(sw or ""), VERSION)
    html = html.replace(f"const HUB_VER = '{m.group(1)}'", f"const HUB_VER = '{nxt}'", 1)
    return html, nxt


def bump_sw(sw: str, hub_ver: str) -> str:
    return re.sub(
        r"const CACHE = 'apps-hub-v[^']+'",
        f"const CACHE = 'apps-hub-v{hub_ver}'",
        sw,
        count=1,
    )


def patch_index(html: str) -> str:
    block = re.search(
        r"\{\s*id: 'road-lore',.*?\n      \}",
        html,
        flags=re.S,
    )
    if not block:
        raise SystemExit("Could not find PROJECTS entry id: 'road-lore' in apps/index.html")
    body = block.group(0)
    if re.search(r"\bversion:\s*'", body):
        body = re.sub(r"(\bversion:\s*')[^']+'", rf"\g<1>{VERSION}'", body, count=1)
    else:
        body = re.sub(
            r"(appUrl:\s*'[^']*',)",
            rf"\1\n        version: '{VERSION}',",
            body,
            count=1,
        )
    if "versionUrl:" not in body:
        body = re.sub(
            rf"(version:\s*'{re.escape(VERSION)}',)",
            rf"\1\n        versionUrl: '{VERSION_URL}',",
            body,
            count=1,
        )
    html = html[: block.start()] + body + html[block.end() :]

    if "function refreshLiveVersions" not in html:
        needle = "    renderCards();\n  </script>"
        if needle not in html:
            raise SystemExit("Could not find trailing renderCards(); before </script>")
        html = html.replace(needle, REFRESH_FN + needle, 1)
    return html


def main() -> None:
    hub = find_hub()
    index_path = hub / "apps" / "index.html"
    sw_path = hub / "apps" / "service-worker.js"
    original = index_path.read_text()
    updated = patch_index(original)
    if updated == original:
        print(f"Hub already in sync at {hub} (Road Lore v{VERSION})")
        return
    updated, hub_ver = bump_hub_ver(updated, sw_path.read_text() if sw_path.is_file() else None)
    if hub_ver and sw_path.is_file():
        sw_path.write_text(bump_sw(sw_path.read_text(), hub_ver))
        print(f"Bumped hub cache to v{hub_ver}")
    index_path.write_text(updated)
    print(f"Updated Road Lore card to v{VERSION} in {index_path}")
    print("Commit and push in that checkout after the Cursor GitHub App can write the hub.")


if __name__ == "__main__":
    main()
