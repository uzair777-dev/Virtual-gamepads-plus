#!/bin/bash
# One-time setup to allow running without sudo/pkexec.
# Adds current user to 'input' group and creates a udev rule for /dev/uinput.

set -e

echo "=== Virtual Gamepads — Permission Setup ==="
echo ""
echo "This script will:"
echo "  1. Add your user ($USER) to the 'input' group"
echo "  2. Create a udev rule so /dev/uinput is accessible without root"
echo ""
read -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Add user to input group
sudo usermod -aG input "$USER"
echo "✓ Added $USER to 'input' group"

# Create udev rule
RULE='KERNEL=="uinput", MODE="0660", GROUP="input", OPTIONS+="static_node=uinput"'
echo "$RULE" | sudo tee /etc/udev/rules.d/99-uinput.rules > /dev/null
echo "✓ Created /etc/udev/rules.d/99-uinput.rules"

# Reload udev
sudo udevadm control --reload-rules && sudo udevadm trigger
echo "✓ Reloaded udev rules"

echo ""
echo "=== DONE ==="
echo "Log out and back in for group changes to take effect."
echo "After that, you can run the server without sudo:"
echo "  node main.js"
echo "  python3 gui.py   (without pkexec)"
