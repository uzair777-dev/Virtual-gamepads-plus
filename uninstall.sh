#!/bin/bash
# ==============================================================================
# Virtual Gamepads Plus — Uninstaller Script
# Repo: https://github.com/uzair777-dev/Virtual-gamepads-plus
# ==============================================================================

set -e

INSTALL_DIR="$HOME/.local/share/virtual-gamepads-plus"
CLI_WRAPPER="$HOME/.local/bin/vgp"
CLI_ALIAS="$HOME/.local/bin/vpg"
DESKTOP_FILE="$HOME/.local/share/applications/virtual-gamepads-plus.desktop"
ICON_FILE="$HOME/.local/share/icons/hicolor/256x256/apps/virtual-gamepads-plus.png"
UDEV_RULE="/etc/udev/rules.d/99-uinput.rules"
CONFIG_FILE="$HOME/.config/virtual-gamepads-gui.json"

# Formatting helper (ANSI colors when running interactively in terminal)
if [ -t 1 ]; then
    BOLD="\033[1m"
    GREEN="\033[1;32m"
    YELLOW="\033[1;33m"
    BLUE="\033[1;34m"
    RESET="\033[0m"
else
    BOLD=""
    GREEN=""
    YELLOW=""
    BLUE=""
    RESET=""
fi

echo -e "${BOLD}Virtual Gamepads Plus Uninstaller${RESET}"
echo ""

# Confirm uninstallation
confirm="n"
if [ -t 0 ] || [ -c /dev/tty ]; then
    read -p "Are you sure you want to uninstall Virtual Gamepads Plus? [y/N] " confirm < /dev/tty || confirm="n"
fi

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""

# 1. Stop any running server or GUI instances
echo -e "${BLUE}==>${RESET} ${BOLD}Stopping running server instances...${RESET}"
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "python3.*gui.py" 2>/dev/null || true
sleep 1

# 2. Remove application directory
echo -e "${BLUE}==>${RESET} ${BOLD}Removing application directory...${RESET}"
if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo "  Removed $INSTALL_DIR"
fi

# 3. Remove CLI launcher executable, desktop entry, and icon
echo -e "${BLUE}==>${RESET} ${BOLD}Removing launcher & desktop integrations...${RESET}"
if [ -f "$CLI_WRAPPER" ] || [ -L "$CLI_WRAPPER" ]; then
    rm -f "$CLI_WRAPPER"
    echo "  Removed $CLI_WRAPPER"
fi

if [ -f "$CLI_ALIAS" ] || [ -L "$CLI_ALIAS" ]; then
    rm -f "$CLI_ALIAS"
    echo "  Removed $CLI_ALIAS"
fi

if [ -f "$DESKTOP_FILE" ]; then
    rm -f "$DESKTOP_FILE"
    echo "  Removed $DESKTOP_FILE"
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

if [ -f "$ICON_FILE" ]; then
    rm -f "$ICON_FILE"
    echo "  Removed $ICON_FILE"
    gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
fi

# Clean up PATH export lines from shell config files (~/.bashrc, ~/.zshrc)
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$rc" ]; then
        sed -i '\|\.local/bin|d' "$rc" 2>/dev/null || true
    fi
done

# 4. Optional system-level cleanup (udev rule and firewall authorizations)
echo -e "${BLUE}==>${RESET} ${BOLD}System cleanup...${RESET}"
remove_system="n"
if [ -t 0 ] || [ -c /dev/tty ]; then
    read -p "Remove udev rule and firewall authorizations? (sudo) [y/N] " remove_system < /dev/tty || remove_system="n"
fi

if [[ "$remove_system" =~ ^[Yy]$ ]]; then
    if [ -f "$UDEV_RULE" ]; then
        sudo rm -f "$UDEV_RULE" 2>/dev/null || true
        sudo udevadm control --reload-rules 2>/dev/null || true
        sudo udevadm trigger 2>/dev/null || true
        echo "  Removed $UDEV_RULE"
    fi

    if command -v firewall-cmd &>/dev/null; then
        sudo firewall-cmd --permanent --remove-port=8080/tcp >/dev/null 2>&1 || true
        sudo firewall-cmd --permanent --remove-port=80/tcp >/dev/null 2>&1 || true
        sudo firewall-cmd --reload >/dev/null 2>&1 || true
        echo "  Revoked firewall ports (firewalld)"
    elif command -v ufw &>/dev/null; then
        sudo ufw delete allow 8080/tcp >/dev/null 2>&1 || true
        sudo ufw delete allow 80/tcp >/dev/null 2>&1 || true
        echo "  Revoked firewall ports (ufw)"
    fi
fi

# 5. Optional GUI configuration file removal
remove_config="n"
if [ -t 0 ] || [ -c /dev/tty ]; then
    read -p "Remove saved GUI configuration ($CONFIG_FILE)? [y/N] " remove_config < /dev/tty || remove_config="n"
fi

if [[ "$remove_config" =~ ^[Yy]$ ]]; then
    rm -f "$CONFIG_FILE" 2>/dev/null || true
    echo "  Removed $CONFIG_FILE"
fi

echo ""
echo -e "${GREEN}${BOLD}Virtual Gamepads Plus uninstalled.${RESET}"
