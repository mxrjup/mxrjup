#!/usr/bin/env bash
# Nightly backup of what the /computer visitors wrote: their files, the desktop index
# and the chat. VISITORS_DIR is itself a clone of the private mxrjup/mxrjup-visitors
# repository, so a backup is a commit there, pushed. Restoring is a clone.
#
#   reads   server/.env      (gitignored; VISITORS_DIR, relative to the code root)
#   writes  VISITORS_DIR/.gitignore, and commits in VISITORS_DIR
#
# Nothing is committed unless every data/*.json in the commit parses, and nothing at
# all when the visitors changed nothing since the last run. Every failure exits
# non-zero with the reason on stdout, which cron redirects to the log.
#
# Crontab entry (nightly, 03:30 - adjust the paths):
#   30 3 * * * /path/to/mxrjup/scripts/backup-visitors.sh >> /path/to/backup-visitors.log 2>&1
#
# If cron runs with a bare PATH and cannot find node or git, give their absolute paths:
#   30 3 * * * NODE_BIN=/usr/bin/node GIT_BIN=/usr/bin/git /path/to/mxrjup/scripts/...
#
# BACKUP_ATTEMPTS (default 3) and BACKUP_RETRY_DELAY (seconds, default 10) tune how
# long an unparseable JSON file is waited on before giving up.
set -euo pipefail

CODE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$CODE_ROOT/server/.env"
NODE_BIN="${NODE_BIN:-node}"
GIT_BIN="${GIT_BIN:-git}"
ATTEMPTS="${BACKUP_ATTEMPTS:-3}"
RETRY_DELAY="${BACKUP_RETRY_DELAY:-10}"

# The server's own data files. The backup refuses to run without them, so a wrong or
# half-restored VISITORS_DIR is never committed as "every visitor file was deleted".
REQUIRED_FILES=(data/computer_files.json data/chat_data.json)

log() {
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') $*"
}

fail() {
    log "BACKUP FAILED: $*"
    exit 1
}

# Pull the one key out rather than sourcing the file, which would run whatever else
# it contains and choke on any value with a space in it.
env_value() {
    [ -f "$ENV_FILE" ] || return 0
    sed -n "s/^$1=//p" "$ENV_FILE" | head -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

# Same precedence as the server (dotenv does not override the environment): the
# environment, then server/.env, then the side-by-side development layout.
VISITORS_DIR="${VISITORS_DIR:-$(env_value VISITORS_DIR)}"
VISITORS_DIR="${VISITORS_DIR:-../mxrjup-visitors}"
case "$VISITORS_DIR" in
    /*) ;;
    *) VISITORS_DIR="$CODE_ROOT/$VISITORS_DIR" ;;
esac

command -v "$NODE_BIN" > /dev/null || fail "node not found ($NODE_BIN); set NODE_BIN"
command -v "$GIT_BIN" > /dev/null || fail "git not found ($GIT_BIN); set GIT_BIN"
[ -d "$VISITORS_DIR" ] || fail "VISITORS_DIR $VISITORS_DIR does not exist"
VISITORS_DIR="$(cd "$VISITORS_DIR" && pwd -P)"

git_v() {
    "$GIT_BIN" -C "$VISITORS_DIR" "$@"
}

# Committing from inside another repository - the code checkout, if VISITORS_DIR were
# a plain directory under it - would back the visitors up in the wrong place.
TOPLEVEL="$(git_v rev-parse --show-toplevel 2> /dev/null)" \
    || fail "$VISITORS_DIR is not a git clone; clone mxrjup/mxrjup-visitors there"
[ "$(cd "$TOPLEVEL" && pwd -P)" = "$VISITORS_DIR" ] \
    || fail "$VISITORS_DIR is not the root of its own clone (repository at $TOPLEVEL)"
BRANCH="$(git_v symbolic-ref --quiet --short HEAD)" \
    || fail "$VISITORS_DIR is on a detached HEAD; check out the main branch"
git_v remote get-url origin > /dev/null 2>&1 || fail "$VISITORS_DIR has no 'origin' remote"

for file in "${REQUIRED_FILES[@]}"; do
    [ -f "$VISITORS_DIR/$file" ] || fail "$VISITORS_DIR/$file is missing"
done

# One run at a time: a slow push must not overlap the next night, or a manual run.
LOCK="$(git_v rev-parse --absolute-git-dir)/backup-visitors.lock"
mkdir "$LOCK" 2> /dev/null \
    || fail "another backup holds $LOCK; remove it if no backup is running"
trap 'rmdir "$LOCK"' EXIT
trap 'fail "interrupted"' INT TERM HUP

# The server writes each data file to a temporary sibling before renaming it over the
# real one (server/visitorStore.js). One caught mid-write must never be committed,
# so the rule lives in the repository itself, where every clone gets it.
IGNORE_RULE='data/.*.tmp'
if ! grep -qxF "$IGNORE_RULE" "$VISITORS_DIR/.gitignore" 2> /dev/null; then
    log "adding '$IGNORE_RULE' to .gitignore"
    {
        echo '# Temporary files of the atomic writes in server/visitorStore.js'
        echo "$IGNORE_RULE"
    } >> "$VISITORS_DIR/.gitignore"
fi

# Parse what is staged, not what is on disk: that is exactly what the commit would
# hold. Prints the files that do not parse.
broken_json() {
    local file
    git_v ls-files -z -- 'data/*.json' | while IFS= read -r -d '' file; do
        git_v cat-file blob ":$file" \
            | "$NODE_BIN" -e 'JSON.parse(require("fs").readFileSync(0, "utf8"))' 2> /dev/null \
            || echo "$file"
    done
}

log "backing up $VISITORS_DIR ($BRANCH)"
attempt=1
while :; do
    git_v add -A
    broken="$(broken_json)"
    [ -z "$broken" ] && break
    if [ "$attempt" -ge "$ATTEMPTS" ]; then
        # Leave the index as the last commit has it, so nothing half-done lingers.
        git_v reset -q
        fail "invalid JSON after $ATTEMPTS attempts, nothing committed:" $broken
    fi
    log "invalid JSON (attempt $attempt/$ATTEMPTS), retrying in ${RETRY_DELAY}s:" $broken
    sleep "$RETRY_DELAY"
    attempt=$((attempt + 1))
done

if git_v diff --cached --quiet; then
    log "no changes since the last backup"
else
    # A bot identity, set through the environment because it outranks any git config
    # or GIT_* variable the host's account may carry.
    GIT_AUTHOR_NAME='mxrjup backup' GIT_AUTHOR_EMAIL='backup@mxrjup.invalid' \
        GIT_COMMITTER_NAME='mxrjup backup' GIT_COMMITTER_EMAIL='backup@mxrjup.invalid' \
        git_v commit -q --no-verify -m "Backup $(date -u '+%Y-%m-%d %H:%M UTC')" \
        || fail "git commit failed"
    stat="$(git_v diff --shortstat HEAD~1 HEAD 2> /dev/null || echo 'first backup')"
    log "committed $(git_v rev-parse --short HEAD): ${stat# }"
fi

# Pushed on every run, not only after a commit, so a night whose push failed is sent
# the next night. A rejected push means someone else pushed here: sort it out by hand,
# the backup never merges or forces.
git_v push -q origin "HEAD:refs/heads/$BRANCH" || fail "git push to origin/$BRANCH failed"
log "pushed to origin/$BRANCH"
