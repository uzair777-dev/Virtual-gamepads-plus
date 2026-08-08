#!/bin/bash
# ==============================================================================
# Virtual Gamepads Plus — Uninstaller Script
# Repo: https://github.com/uzair777-dev/Virtual-gamepads-plus
#
# Usage:
#   vgp --uninstall
#   bash uninstall.sh
#   curl -fsSL <raw-url>/uninstall.sh | bash
# ==============================================================================

set -e

INSTALL_DIR="$HOME/.local/share/virtual-gamepads-plus"
CLI_WRAPPER="$HOME/.local/bin/vgp"
DESKTOP_FILE="$HOME/.local/share/applications/virtual-gamepads-plus.desktop"
ICON_FILE="$HOME/.local/share/icons/hicolor/256x256/apps/virtual-gamepads-plus.png"
UDEV_RULE="/etc/udev/rules.d/99-uinput.rules"
CONFIG_FILE="$HOME/.config/virtual-gamepads-gui.json"

echo "=================================================="
echo "   Virtual Gamepads Plus — Uninstaller            "
echo "=================================================="
echo ""

# Confirm
confirm="n"
if [ -t 0 ] || [ -c /dev/tty ]; then
    read -p "Are you sure you want to uninstall Virtual Gamepads Plus? [y/N] " confirm < /dev/tty || confirm="n"
fi

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Uninstall cancelled."
    exit 0
fi

echo ""

# 1. Kill any running server processes
echo "[1/5] Stopping any running instances..."
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "python3.*gui.py" 2>/dev/null || true
sleep 1

# 2. Remove application directory
echo "[2/5] Removing application files..."
if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo "  Removed $INSTALL_DIR"
else
    echo "  $INSTALL_DIR not found (skipped)"
fi

# 3. Remove CLI wrapper, desktop entry, icon
echo "[3/5] Removing CLI command & desktop launcher..."
if [ -f "$CLI_WRAPPER" ]; then
    rm -f "$CLI_WRAPPER"
    echo "  Removed $CLI_WRAPPER"
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

# 4. Ask about system-level cleanup (udev rule, firewall)
echo "[4/5] System-level cleanup..."
remove_system="n"
if [ -t 0 ] || [ -c /dev/tty ]; then
    read -p "  Remove udev rule and firewall port authorizations? (requires sudo) [y/N] " remove_system < /dev/tty || remove_system="n"
fi

if [[ "$remove_system" =~ ^[Yy]$ ]]; then
    if [ -f "$UDEV_RULE" ]; then
        sudo rm -f "$UDEV_RULE" 2>/dev/null || true
        sudo udevadm control --reload-rules 2>/dev/null || true
        sudo udevadm trigger 2>/dev/null || true
        echo "  Removed $UDEV_RULE"
    fi

    # Revoke firewall ports
    if command -v firewall-cmd &>/dev/null; then
        sudo firewall-cmd --permanent --remove-port=8080/tcp >/dev/null 2>&1 || true
        sudo firewall-cmd --permanent --remove-port=80/tcp >/dev/null 2>&1 || true
        sudo firewall-cmd --reload >/dev/null 2>&1 || true
        echo "  Revoked firewall ports 8080/tcp and 80/tcp (firewalld)"
    elif command -v ufw &>/dev/null; then
        sudo ufw delete allow 8080/tcp >/dev/null 2>&1 || true
        sudo ufw delete allow 80/tcp >/dev/null 2>&1 || true
        echo "  Revoked firewall ports 8080/tcp and 80/tcp (ufw)"
    fi
fi

# 5. Ask about config removal
echo "[5/5] Configuration cleanup..."
remove_config="n"
if [ -t 0 ] || [ -c /dev/tty ]; then
    read -p "  Remove saved GUI settings ($CONFIG_FILE)? [y/N] " remove_config < /dev/tty || remove_config="n"
fi

if [[ "$remove_config" =~ ^[Yy]$ ]]; then
    rm -f "$CONFIG_FILE" 2>/dev/null || true
    echo "  Removed $CONFIG_FILE"
fi

echo ""
echo "=================================================="
echo "   ✓ Virtual Gamepads Plus Uninstalled            "
echo "=================================================="
echo ""
echo "Note: System packages (node, npm, python3, etc.)"
echo "were NOT removed. Remove them manually if desired."
echo "=================================================="
