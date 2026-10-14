#!/usr/bin/env bash
# XeroBurst: starts the laptop server and the app dev server (macOS and Linux).
set -e
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install
[ -f apps/server/data/nboard.db ] || npm run setup
npm run server &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 4
npm run app
