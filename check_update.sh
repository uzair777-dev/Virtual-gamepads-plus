#!/bin/bash
# ==============================================================================
# Virtual Gamepads Plus — Git Update Checker
# Repo: https://github.com/uzair777-dev/Virtual-gamepads-plus
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="$HOME/.cache/virtual-gamepads-plus"
COOLDOWN_FILE="$CACHE_DIR/last_update_check"
COOLDOWN_SECONDS=14400  # 4 hours

FORCE_CHECK=0
QUIET_MODE=0
JSON_MODE=0

for arg in "$@"; do
    case "$arg" in
        --force|-f)
            FORCE_CHECK=1
            ;;
        --quiet|-q)
            QUIET_MODE=1
            ;;
        --json)
            JSON_MODE=1
            ;;
    esac
done

output_msg() {
    if [ $QUIET_MODE -eq 0 ] && [ $JSON_MODE -eq 0 ]; then
        echo -e "$1"
    fi
}

output_json() {
    if [ $JSON_MODE -eq 1 ]; then
        echo "$1"
    fi
}

version_gt() {
    # Returns 0 (true) if $1 is strictly greater than $2, else 1
    if [ "$1" == "$2" ]; then
        return 1
    fi
    test "$(printf '%s\n' "$1" "$2" | sort -V | head -n 1)" != "$1"
}

# 1. Ensure we are in a Git repository
if [ ! -d "$SCRIPT_DIR/.git" ]; then
    output_msg "Notice: Not running from a git repository. Skipping update check."
    output_json '{"status": "not_a_git_repo"}'
    exit 1
fi

cd "$SCRIPT_DIR"

# 2. Verify git is available
if ! command -v git &>/dev/null; then
    output_json '{"status": "git_missing"}'
    exit 2
fi

# 3. Verify 'origin' remote exists
if ! git remote | grep -qw "origin"; then
    output_msg "Notice: Git remote 'origin' not configured. Skipping update check."
    output_json '{"status": "no_origin_remote"}'
    exit 1
fi

# 4. Check cooldown if not forced
NOW=$(date +%s)
if [ $FORCE_CHECK -eq 0 ] && [ -f "$COOLDOWN_FILE" ]; then
    LAST_CHECK=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
    ELAPSED=$((NOW - LAST_CHECK))
    if [ "$ELAPSED" -ge 0 ] && [ "$ELAPSED" -lt "$COOLDOWN_SECONDS" ]; then
        output_json '{"status": "cooldown_active", "remaining_seconds": '$((COOLDOWN_SECONDS - ELAPSED))'}'
        exit 3
    fi
fi

# 5. Read local VERSION file
LOCAL_VERSION="unknown"
if [ -f "$SCRIPT_DIR/VERSION" ]; then
    LOCAL_VERSION=$(tr -d '[:space:]' < "$SCRIPT_DIR/VERSION")
elif [ -f "$SCRIPT_DIR/package.json" ]; then
    LOCAL_VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "1.5.0")
fi

# 6. Fetch origin/main with a strict 4-second timeout to prevent stalling
FETCH_OK=0
if command -v timeout &>/dev/null; then
    if timeout 4s git fetch origin main --quiet 2>/dev/null; then
        FETCH_OK=1
    fi
else
    if git fetch origin main --quiet 2>/dev/null; then
        FETCH_OK=1
    fi
fi

# Update timestamp regardless of network success to avoid hammering on failure
mkdir -p "$CACHE_DIR" 2>/dev/null || true
echo "$NOW" > "$COOLDOWN_FILE" 2>/dev/null || true

if [ $FETCH_OK -eq 0 ]; then
    output_msg "Notice: Could not reach remote repository. Working offline."
    output_json '{"status": "network_error"}'
    exit 2
fi

# 7. Read remote VERSION file from origin/main
REMOTE_VERSION=$(git show origin/main:VERSION 2>/dev/null | tr -d '[:space:]' || echo "")

if [ -z "$REMOTE_VERSION" ]; then
    output_msg "Notice: Could not find VERSION file in remote repository (origin/main)."
    output_json '{"status": "error_reading_remote_version"}'
    exit 1
fi

# 8. Perform SemVer comparison: only trigger if remote_version > local_version
if version_gt "$REMOTE_VERSION" "$LOCAL_VERSION"; then
    output_msg "Update Available: v$LOCAL_VERSION -> v$REMOTE_VERSION"
    output_json '{"status": "update_available", "current_version": "'"$LOCAL_VERSION"'", "latest_version": "'"$REMOTE_VERSION"'"}'
    exit 0
else
    # Local version is equal to or newer than remote (e.g. local dev build)
    output_msg "Application is up to date (v$LOCAL_VERSION, remote is v$REMOTE_VERSION)."
    output_json '{"status": "up_to_date", "current_version": "'"$LOCAL_VERSION"'", "latest_version": "'"$REMOTE_VERSION"'"}'
    exit 1
fi
