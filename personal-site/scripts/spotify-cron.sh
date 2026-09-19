#!/bin/sh
# Weekly refresh of the Spotify half of the music timeline, run from cron on the
# host. Everything it touches is unversioned, so the deploy's
# `git reset --hard origin/main` neither overwrites its output nor its credentials:
#
#   reads   server/.env                       (gitignored)
#   writes  server/data/timeline_spotify.json  (gitignored)
#
# The running server picks the new file up on the next request - no rebuild, no
# restart. Albums added by hand in the CMS live in server/data/timeline.json and
# are merged on top of these by the server.
#
# Crontab entry (weekly, Monday 05:17 - adjust the path to the checkout):
#   17 5 * * 1 /path/to/personal-site/scripts/spotify-cron.sh >> /path/to/spotify-timeline.log 2>&1
#
# If cron runs with a bare PATH and cannot find node, give it the absolute path:
#   17 5 * * 1 NODE_BIN=/usr/bin/node /path/to/personal-site/scripts/spotify-cron.sh >> ...
set -e

cd "$(dirname "$0")/.."
ENV_FILE="./server/.env"
NODE_BIN="${NODE_BIN:-node}"

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE - cannot read the Spotify credentials."; exit 1; }

# Pull out the three keys rather than sourcing the file, which would run whatever
# else it contains and choke on any value with a space in it.
env_value() {
    sed -n "s/^$1=//p" "$ENV_FILE" | head -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

SPOTIFY_CLIENT_ID="$(env_value SPOTIFY_CLIENT_ID)"
SPOTIFY_CLIENT_SECRET="$(env_value SPOTIFY_CLIENT_SECRET)"
SPOTIFY_REFRESH_TOKEN="$(env_value SPOTIFY_REFRESH_TOKEN)"
export SPOTIFY_CLIENT_ID SPOTIFY_CLIENT_SECRET SPOTIFY_REFRESH_TOKEN

if [ -z "$SPOTIFY_REFRESH_TOKEN" ]; then
    echo "SPOTIFY_REFRESH_TOKEN is missing from $ENV_FILE."
    echo "Mint one on a machine with a browser:"
    echo "  node scripts/spotify-timeline.mjs --print-refresh-token"
    exit 1
fi

echo "--- $(date -u '+%Y-%m-%d %H:%M:%S UTC') refreshing the Spotify timeline"
exec "$NODE_BIN" scripts/spotify-timeline.mjs "$@"
