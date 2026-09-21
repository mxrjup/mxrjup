#!/usr/bin/env bash
# Build command of the Infomaniak Node.js site: the Manager runs it before every start
# of the app (Advanced settings > Node.js > Build command: bash scripts/host-build.sh,
# execution folder: the code checkout). It is how code is deployed, since the host
# cannot be driven over SSH from GitHub: push a v* tag, then restart the site.
#
#   1. refuses to go on if the checkout has local changes - nothing is overwritten;
#   2. fetches the tags and checks out the newest v* one (version order, so v1.10.0
#      comes after v1.9.0) - no --force, no reset;
#   3. npm ci (the root postinstall runs it in server/ and computer-app/), npm run build;
#   4. checks the install and build left the tree clean, or the next start would stop
#      at step 1.
#
# Any failure exits non-zero, and the site does not start: the reason is in the
# Manager's execution console. To roll back, tag the old commit with a newer version.
set -euo pipefail

# Everything lives in one function called on the last line: bash has then read the
# whole script before the checkout below replaces this file with another version.
main() {
    cd "$(dirname "$0")/.."

    log() {
        echo "[host-build] $(date -u '+%Y-%m-%d %H:%M:%S UTC') $*"
    }
    fail() {
        log "BUILD FAILED: $*"
        exit 1
    }

    local changes
    changes="$(git status --porcelain)"
    if [ -n "$changes" ]; then
        echo "$changes"
        fail "the code checkout in $PWD has local changes; commit or discard them"
    fi

    log "fetching tags"
    # --prune-tags drops a tag deleted on GitHub, so a withdrawn release is never
    # picked; --force follows a tag that was moved.
    git fetch --quiet --force --prune --prune-tags --tags origin \
        || fail "git fetch failed"

    local tag
    tag="$(git tag --list 'v*' --sort=-v:refname | head -n 1)"
    [ -n "$tag" ] || fail "no v* tag in the repository; push one to deploy"

    log "checking out $tag ($(git rev-parse --short "$tag^{commit}"))"
    git -c advice.detachedHead=false checkout --quiet --detach "$tag" \
        || fail "cannot check out $tag"

    log "npm ci"
    npm ci --no-audit --no-fund || fail "npm ci failed"
    log "npm run build"
    npm run build || fail "npm run build failed"

    changes="$(git status --porcelain)"
    if [ -n "$changes" ]; then
        echo "$changes"
        fail "the install or build left files git sees; ignore or commit them, tag again"
    fi

    log "ready: $tag"
}

main "$@"; exit
