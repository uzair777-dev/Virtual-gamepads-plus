#!/bin/bash
# ==============================================================================
# Virtual Gamepads Plus — Standalone Updater Script
# Repo: https://github.com/uzair777-dev/Virtual-gamepads-plus
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$VGP_REPO_DIR" ] && [ -d "$VGP_REPO_DIR/.git" ]; then
    SCRIPT_DIR="$VGP_REPO_DIR"
fi
cd "$SCRIPT_DIR"

# Cleanup handler for temporary updater scripts
cleanup() {
    if [[ "${BASH_SOURCE[0]}" == /tmp/vgp_updater_* ]] && [ -f "${BASH_SOURCE[0]}" ]; then
        rm -f "${BASH_SOURCE[0]}" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# Clean up any leftover temporary updater scripts from past runs
if [ -z "$VGP_UPDATER_RELOADED" ]; then
    rm -f /tmp/vgp_updater_*.sh 2>/dev/null || true
fi

# Formatting helpers
if [ -t 1 ]; then
    BOLD="\033[1m"
    GREEN="\033[1;32m"
    YELLOW="\033[1;33m"
    BLUE="\033[1;34m"
    RED="\033[1;31m"
    CYAN="\033[1;36m"
    RESET="\033[0m"
else
    BOLD=""
    GREEN=""
    YELLOW=""
    BLUE=""
    RED=""
    CYAN=""
    RESET=""
fi

RELAUNCH_TARGET=""
NO_RESTART=0
FORCE_DROP_CHANGES=0
FORCE_KEEP_CHANGES=0

for arg in "$@"; do
    case "$arg" in
        --relaunch-gui)
            RELAUNCH_TARGET="gui"
            ;;
        --relaunch-cli)
            RELAUNCH_TARGET="cli"
            ;;
        --no-restart)
            NO_RESTART=1
            ;;
        --drop-changes|--drop-local-changes)
            FORCE_DROP_CHANGES=1
            ;;
        --keep-changes|--stash-changes)
            FORCE_KEEP_CHANGES=1
            ;;
    esac
done

echo -e "${BOLD}${CYAN}Virtual Gamepads Plus — Updater${RESET}"
echo -e "=================================================="
echo ""

# 1. Ensure running in Git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}Error: Not running from a Git repository.${RESET}"
    echo "Please update manually or re-install using install.sh."
    exit 1
fi

# 2. Fetch latest changes from origin/main early
echo -e "${BLUE}==>${RESET} ${BOLD}Fetching latest updates from origin/main...${RESET}"
if ! git fetch origin main --quiet; then
    echo -e "${RED}Error: Failed to fetch updates from remote repository (origin/main).${RESET}"
    exit 1
fi

TARGET_COMMIT=$(git log -n 1 --format="%H" FETCH_HEAD -- VERSION 2>/dev/null || git log -n 1 --format="%H" origin/main -- VERSION 2>/dev/null || echo "")
if [ -z "$TARGET_COMMIT" ]; then
    echo -e "${RED}Error: Could not find any commit modifying VERSION on origin/main.${RESET}"
    exit 1
fi

TARGET_VERSION=$(git show "$TARGET_COMMIT:VERSION" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
COMMITS_AHEAD=$(git rev-list --count "$TARGET_COMMIT..FETCH_HEAD" 2>/dev/null || git rev-list --count "$TARGET_COMMIT..origin/main" 2>/dev/null || echo "0")

# 3. Self-Update Hook: If update.sh has changes in target release commit, run the latest updater first
if [ -z "$VGP_UPDATER_RELOADED" ]; then
    REMOTE_UPDATER_CONTENT=$(git show "$TARGET_COMMIT:update.sh" 2>/dev/null || echo "")
    if [ -n "$REMOTE_UPDATER_CONTENT" ]; then
        CURRENT_UPDATER_CONTENT=$(cat "${BASH_SOURCE[0]}" 2>/dev/null || echo "")
        if [ "$REMOTE_UPDATER_CONTENT" != "$CURRENT_UPDATER_CONTENT" ]; then
            echo -e "${CYAN}==>${RESET} ${BOLD}Updater script has updates on origin/main. Updating updater first...${RESET}"
            TMP_UPDATER="/tmp/vgp_updater_$$.sh"
            echo "$REMOTE_UPDATER_CONTENT" > "$TMP_UPDATER"
            chmod +x "$TMP_UPDATER"
            export VGP_UPDATER_RELOADED=1
            export VGP_REPO_DIR="$SCRIPT_DIR"
            exec bash "$TMP_UPDATER" "$@"
        fi
    fi
fi

OLD_VERSION="unknown"
if [ -f "VERSION" ]; then
    OLD_VERSION=$(tr -d '[:space:]' < VERSION)
fi

echo -e "${BLUE}==>${RESET} ${BOLD}Current Version:${RESET} v$OLD_VERSION"
echo -e "${BLUE}==>${RESET} ${BOLD}Target Release:${RESET}  v$TARGET_VERSION (commit ${CYAN}${TARGET_COMMIT:0:8}${RESET})"
if [ "$COMMITS_AHEAD" -gt 0 ]; then
    echo -e "${YELLOW}Notice: Found $COMMITS_AHEAD newer in-progress commit(s) on origin/main without a VERSION bump.${RESET}"
    echo -e "${CYAN}Updating strictly to verified release commit ${BOLD}${TARGET_COMMIT:0:8}${RESET} (v$TARGET_VERSION)..."
fi

# 4. Stop running server instances to prevent file and port locks
echo -e "${BLUE}==>${RESET} ${BOLD}Stopping any active server processes...${RESET}"
pkill -f "$SCRIPT_DIR/server.js" 2>/dev/null || true
pkill -f "$SCRIPT_DIR/main.js" 2>/dev/null || true
if command -v fuser &>/dev/null; then
    fuser -k -9 8443/tcp 8080/tcp 8000/tcp 3000/tcp 8081/tcp 2>/dev/null || true
fi

# 5. Check for uncommitted local modifications and stashes
HAS_UNCOMMITTED=0
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    HAS_UNCOMMITTED=1
fi

STASH_COUNT=$(git stash list 2>/dev/null | wc -l || echo "0")
STASH_COUNT=${STASH_COUNT//[[:space:]]/}
[ -z "$STASH_COUNT" ] && STASH_COUNT=0

DID_STASH=0

if [ $HAS_UNCOMMITTED -eq 1 ] || [ "$STASH_COUNT" -gt 0 ]; then
    ACTION_CHOICE=2
    if [ $FORCE_DROP_CHANGES -eq 1 ]; then
        ACTION_CHOICE=1
    elif [ $FORCE_KEEP_CHANGES -eq 1 ]; then
        ACTION_CHOICE=2
    elif [ -t 0 ] || [ -c /dev/tty ]; then
        echo ""
        echo -e "\033[1;33m╔════════════════════════════════════════════════════════════════════════════╗\033[0m"
        echo -e "\033[1;33m║\033[0m  \033[1;37mLocal modifications or stashes detected in the repository:\033[0m                \033[1;33m║\033[0m"
        if [ $HAS_UNCOMMITTED -eq 1 ]; then
            echo -e "\033[1;33m║\033[0m  - Uncommitted modified/untracked files are present                        \033[1;33m║\033[0m"
        fi
        if [ "$STASH_COUNT" -gt 0 ]; then
            echo -e "\033[1;33m║\033[0m  - $STASH_COUNT saved stash(es) found in git stash list                             \033[1;33m║\033[0m"
        fi
        echo -e "\033[1;33m╠════════════════════════════════════════════════════════════════════════════╣\033[0m"
        echo -e "\033[1;33m║\033[0m  Choose how to proceed:                                                     \033[1;33m║\033[0m"
        echo -e "\033[1;33m║\033[0m    \033[1m1)\033[0m Drop & Discard all local changes (Clean update to release)              \033[1;33m║\033[0m"
        echo -e "\033[1;33m║\033[0m    \033[1m2)\033[0m Stash & Preserve (Restore after update with conflict backup)            \033[1;33m║\033[0m"
        echo -e "\033[1;33m║\033[0m    \033[1m3)\033[0m Cancel update                                                           \033[1;33m║\033[0m"
        echo -e "\033[1;33m╚════════════════════════════════════════════════════════════════════════════╝\033[0m"
        read -p "Select option [1-3] (default 2): " prompt_choice < /dev/tty || prompt_choice=2
        prompt_choice=${prompt_choice:-2}
        case "$prompt_choice" in
            1)
                ACTION_CHOICE=1
                ;;
            2)
                ACTION_CHOICE=2
                ;;
            3)
                ACTION_CHOICE=3
                ;;
            *)
                ACTION_CHOICE=2
                ;;
        esac
    fi

    if [ "$ACTION_CHOICE" -eq 3 ]; then
        echo -e "${YELLOW}Update cancelled by user.${RESET}"
        exit 0
    elif [ "$ACTION_CHOICE" -eq 1 ]; then
        echo -e "${YELLOW}Dropping and discarding all local changes and stashes for a clean install...${RESET}"
        git reset --hard HEAD 2>/dev/null || true
        git clean -fd 2>/dev/null || true
        git stash clear 2>/dev/null || true
        DID_STASH=0
    elif [ "$ACTION_CHOICE" -eq 2 ]; then
        if [ $HAS_UNCOMMITTED -eq 1 ]; then
            echo -e "${YELLOW}Notice: Stashing local uncommitted changes...${RESET}"
            git stash save "Autostash before update $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || true
            DID_STASH=1
        fi
    fi
fi

# 6. Update local repository to TARGET_COMMIT
echo -e "${BLUE}==>${RESET} ${BOLD}Updating repository to release commit ${TARGET_COMMIT:0:8}...${RESET}"
if ! git merge --ff-only "$TARGET_COMMIT" 2>/dev/null; then
    echo -e "${YELLOW}Notice: Fast-forward merge not applicable. Resetting cleanly to release commit ${TARGET_COMMIT:0:8}...${RESET}"
    git reset --hard "$TARGET_COMMIT"
fi

# 7. Restore stashed local modifications if any
if [ $DID_STASH -eq 1 ]; then
    echo -e "${BLUE}==>${RESET} ${BOLD}Restoring local modifications...${RESET}"
    if ! git stash pop 2>/dev/null; then
        # Check for unmerged files / merge conflicts
        CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null || echo "")
        if [ -n "$CONFLICT_FILES" ]; then
            BACKUP_DIR="$HOME/.config/virtual-gamepads-plus/backup/$(date +%Y%m%d_%H%M%S)"
            mkdir -p "$BACKUP_DIR" 2>/dev/null || true
            for cfile in $CONFLICT_FILES; do
                if [ -f "$cfile" ]; then
                    cp -a "$cfile" "$BACKUP_DIR/" 2>/dev/null || true
                fi
            done
            git reset --hard "$TARGET_COMMIT" 2>/dev/null || true
            git stash drop 2>/dev/null || true
            echo -e "${YELLOW}Notice: Local edits conflicted with remote origin updates.${RESET}"
            echo -e "Your modified files were backed up to: ${BOLD}$BACKUP_DIR${RESET}"
            echo -e "Workspace has been safely reset to clean release commit ${TARGET_COMMIT:0:8}."
        else
            git reset --hard "$TARGET_COMMIT" 2>/dev/null || true
        fi
    fi
fi

# 6. Install / update Node.js dependencies & compile native bindings
echo -e "${BLUE}==>${RESET} ${BOLD}Updating Node.js dependencies & compiling native modules...${RESET}"
npm install
npm rebuild

# 7. Make all executable scripts executable
chmod +x "$SCRIPT_DIR/run.sh" \
         "$SCRIPT_DIR/launch_gui.sh" \
         "$SCRIPT_DIR/gui.py" \
         "$SCRIPT_DIR/update.sh" \
         "$SCRIPT_DIR/check_update.sh" \
         "$SCRIPT_DIR/install.sh" \
         "$SCRIPT_DIR/uninstall.sh" \
         "$SCRIPT_DIR/testGamepads.sh" 2>/dev/null || true

# 8. Refresh desktop entries and icon cache if desktop files exist
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache &>/dev/null; then
    gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
fi

# 9. Clear cooldown cache so next update check is fresh
rm -f "$HOME/.cache/virtual-gamepads-plus/last_update_check" 2>/dev/null || true

# 10. Read new version
NEW_VERSION="unknown"
if [ -f "VERSION" ]; then
    NEW_VERSION=$(tr -d '[:space:]' < VERSION)
fi

echo ""
echo -e "${GREEN}${BOLD}Update complete!${RESET} Successfully updated to ${BOLD}v$NEW_VERSION${RESET}."
echo ""

# 11. Send native desktop notification
ICON_PATH="$SCRIPT_DIR/public/branding/wheel_logo.png"
if command -v notify-send &>/dev/null; then
    if [ -f "$ICON_PATH" ]; then
        notify-send -i "$ICON_PATH" "Virtual Gamepads Plus" "Updated to v$NEW_VERSION successfully!" 2>/dev/null || true
    else
        notify-send "Virtual Gamepads Plus" "Updated to v$NEW_VERSION successfully!" 2>/dev/null || true
    fi
fi

# 12. Exit helper with countdown
exit_with_countdown() {
    local seconds=${1:-5}
    if [ -t 0 ] || [ -c /dev/tty ]; then
        echo ""
        for ((i=seconds; i>=1; i--)); do
            echo -ne "\r${CYAN}Updater will exit in ${BOLD}${i}${RESET}${CYAN}s (or press any key to exit)...${RESET} "
            if read -t 1 -n 1 < /dev/tty 2>/dev/null; then
                break
            fi
        done
        echo -e "\r\033[K"
    else
        sleep "$seconds"
    fi
    exit 0
}

# 13. Prompt user to restart application
if [ $NO_RESTART -eq 1 ]; then
    echo "Restart skipped. Run 'vgp' or 'vgp --gui' when you are ready."
    exit_with_countdown 5
fi

if [ -n "$RELAUNCH_TARGET" ]; then
    if [ "$RELAUNCH_TARGET" == "gui" ]; then
        echo -e "${BLUE}Restarting Virtual Gamepads Plus GUI...${RESET}"
        nohup "$SCRIPT_DIR/launch_gui.sh" >/dev/null 2>&1 &
        exit_with_countdown 5
    elif [ "$RELAUNCH_TARGET" == "cli" ]; then
        echo -e "${BLUE}Restarting Virtual Gamepads Plus CLI server...${RESET}"
        sleep 1
        exec "$SCRIPT_DIR/run.sh"
    fi
fi

# Interactive terminal prompt if tty is available
if [ -t 0 ] || [ -c /dev/tty ]; then
    restart_ans="y"
    read -p "Would you like to restart Virtual Gamepads Plus now? [Y/n] " restart_ans < /dev/tty || restart_ans="y"
    restart_ans=${restart_ans:-y}
    if [[ "$restart_ans" =~ ^[Yy]$ ]]; then
        # Check if GUI dependencies are available to decide default relaunch
        if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
            echo "Starting GUI..."
            nohup "$SCRIPT_DIR/launch_gui.sh" >/dev/null 2>&1 &
            exit_with_countdown 5
        else
            echo "Starting CLI server..."
            exec "$SCRIPT_DIR/run.sh"
        fi
    else
        echo "You can start the app later by running 'vgp' or 'vgp --gui'."
        exit_with_countdown 5
    fi
else
    echo "Please restart the application by running 'vgp' or 'vgp --gui'."
    exit_with_countdown 5
fi
