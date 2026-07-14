#!/bin/bash

# Get location of current file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Checking GUI dependencies..."

# Function to check if a python module exists
check_python_module() {
    python3 -c "import $1" &>/dev/null
}

MISSING_DEPS=""

# Check Python 3
if ! command -v python3 &>/dev/null; then
    MISSING_DEPS="$MISSING_DEPS python3"
fi

# Check PyGObject (GTK bindings)
if ! check_python_module "gi"; then
    MISSING_DEPS="$MISSING_DEPS python3-gi"
fi

# Check AppIndicator3 (Tray icon)
if ! python3 -c "import gi; gi.require_version('AppIndicator3', '0.1')" &>/dev/null; then
    MISSING_DEPS="$MISSING_DEPS gir1.2-appindicator3-0.1 (or libappindicator-gtk3)"
fi

if [ -n "$MISSING_DEPS" ]; then
    echo "Installing missing GUI dependencies: $MISSING_DEPS"
    if command -v apt-get &>/dev/null; then
        sudo apt-get update
        sudo apt-get install -y python3 python3-gi gir1.2-appindicator3-0.1
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y python3 python3-gobject libappindicator-gtk3
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --needed --noconfirm python python-gobject libappindicator-gtk3
    else
        echo "Could not detect package manager to install GUI dependencies."
        echo "Please manually install Python 3, PyGObject, and AppIndicator3."
        echo "Press Enter to try continuing anyway, or Ctrl+C to abort."
        read -r
    fi
fi

# Make scripts executable
chmod +x "$SCRIPT_DIR/gui.py" "$SCRIPT_DIR/run.sh" "$SCRIPT_DIR/testGamepads.sh"

echo "Starting Virtual Gamepads GUI..."
cd "$SCRIPT_DIR"
python3 gui.py
