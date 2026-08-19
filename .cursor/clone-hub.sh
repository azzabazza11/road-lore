#!/usr/bin/env bash
# Clone the apps hub so agents can update the Road Lore card on version jumps.
# Token write access still needs the Cursor GitHub App to include this repo,
# and a multi-repo Cloud Agent environment to open hub PRs as first-class work.
set -u
DEST="${HUB_DIR:-$HOME/azzabazza11.github.io}"
URL="https://github.com/azzabazza11/azzabazza11.github.io.git"

if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch --depth 1 origin main &&
    git -C "$DEST" checkout -B main origin/main ||
    echo "warning: could not update hub checkout at $DEST" >&2
  exit 0
fi

if git clone --depth 1 "$URL" "$DEST"; then
  echo "cloned apps hub to $DEST"
else
  echo "warning: could not clone $URL (add azzabazza11.github.io to the Cursor GitHub App)" >&2
fi
