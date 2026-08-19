#!/bin/bash
# ==============================================================================
# Virtual Gamepads Plus — Standalone Updater Script
# Repo: https://github.com/uzair777-dev/Virtual-gamepads-plus
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

OLD_VERSION="unknown"
if [ -f "VERSION" ]; then
    OLD_VERSION=$(tr -d '[:space:]' < VERSION)
fi

echo -e "${BLUE}==>${RESET} ${BOLD}Current Version:${RESET} v$OLD_VERSION"

# 2. Stop running server instances to prevent file and port locks
echo -e "${BLUE}==>${RESET} ${BOLD}Stopping any active server processes...${RESET}"
pkill -f "$SCRIPT_DIR/server.js" 2>/dev/null || true
pkill -f "$SCRIPT_DIR/main.js" 2>/dev/null || true
if command -v fuser &>/dev/null; then
    fuser -k -9 8443/tcp 8080/tcp 8000/tcp 3000/tcp 8081/tcp 2>/dev/null || true
fi

# 3. Check for uncommitted local modifications and auto-stash
DID_STASH=0
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo -e "${YELLOW}Notice: Local uncommitted changes detected. Auto-stashing...${RESET}"
    git stash save "Autostash before update $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || true
    DID_STASH=1
fi

# 4. Fetch and pull latest changes from origin/main
echo -e "${BLUE}==>${RESET} ${BOLD}Pulling latest updates from origin/main...${RESET}"
if ! git fetch origin main; then
    echo -e "${RED}Error: Failed to fetch updates from remote repository.${RESET}"
    if [ $DID_STASH -eq 1 ]; then
        git stash pop 2>/dev/null || true
    fi
    exit 1
fi

if ! git pull origin main; then
    echo -e "${YELLOW}Warning: Direct pull had conflicts or issues. Attempting clean fast-forward...${RESET}"
    git merge --ff-only origin/main || git reset --hard origin/main
fi

# 5. Restore stashed local modifications if any
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
            git reset --hard origin/main 2>/dev/null || true
            echo -e "${YELLOW}Notice: Local edits conflicted with upstream updates.${RESET}"
            echo -e "Your modified files were backed up to: ${BOLD}$BACKUP_DIR${RESET}"
            echo -e "Workspace has been safely reset to clean upstream."
        else
            git reset --hard origin/main 2>/dev/null || true
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

# 12. Prompt user to restart application
if [ $NO_RESTART -eq 1 ]; then
    echo "Restart skipped. Run 'vgp' or 'vgp --gui' when you are ready."
    exit 0
fi

if [ -n "$RELAUNCH_TARGET" ]; then
    if [ "$RELAUNCH_TARGET" == "gui" ]; then
        echo -e "${BLUE}Restarting Virtual Gamepads Plus GUI...${RESET}"
        sleep 1
        nohup "$SCRIPT_DIR/launch_gui.sh" >/dev/null 2>&1 &
        exit 0
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
        else
            echo "Starting CLI server..."
            exec "$SCRIPT_DIR/run.sh"
        fi
    else
        echo "You can start the app later by running 'vgp' or 'vgp --gui'."
    fi
else
    echo "Please restart the application by running 'vgp' or 'vgp --gui'."
fi
