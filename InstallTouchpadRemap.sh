#!/usr/bin/env bash
set -euo pipefail

# Helper to install udev hwdb rule to remap ABS_RX/ABS_RY -> REL_X/REL_Y
# Run once with root.

RULE_FILE="/etc/udev/hwdb.d/99-virtual-wheel-touchpad.hwdb"
BINARY_FILE="/etc/udev/hwdb.d/99-virtual-wheel-touchpad.hwdb.bin"

sudo mkdir -p /etc/udev/hwdb.d

echo "Installing udev hwdb rule to remap ABS_RX/ABS_RY from virtual wheel to relative mouse axes..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copy rule
sudo cp "$SCRIPT_DIR/99-virtual-wheel-touchpad.hwdb" "$RULE_FILE"

# Update hwdb and reload udev
sudo systemd-hwdb update
sudo udevadm control --reload
sudo udevadm trigger

echo "✅ udev hwdb rule applied. Your virtual wheel device will now emit REL_X/REL_Y mouse movements originating from ABS_RX/ABS_RY joystick axes."
echo "Any existing /dev/input/event* device matching NAME='Virtual Racing Wheel' will be retagged immediately after the next plug/unplug or reboot."
