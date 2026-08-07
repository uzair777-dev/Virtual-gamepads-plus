#!/bin/bash

# Get location of current file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check required system dependencies
MISSING_DEPS=""
for cmd in node npm ip openssl make g++; do
	if ! command -v $cmd &>/dev/null; then
		MISSING_DEPS="$MISSING_DEPS $cmd"
	fi
done

# Check for AppIndicator3 GIR (needed for GUI tray icon)
if ! python3 -c "import gi; gi.require_version('AppIndicator3', '0.1')" 2>/dev/null; then
    if command -v apt-get &>/dev/null; then
        sudo apt-get install -y gir1.2-appindicator3-0.1 2>/dev/null
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y libappindicator-gtk3 2>/dev/null
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --needed --noconfirm libappindicator-gtk3 2>/dev/null
    fi
fi

if [ -n "$MISSING_DEPS" ]; then
	echo "Error: The following required system dependencies are missing:$MISSING_DEPS"
	echo ""
	echo "You can install them using your package manager:"
	if command -v dnf &>/dev/null; then
		echo "  sudo dnf install -y nodejs iproute openssl make gcc-c++"
	elif command -v apt-get &>/dev/null; then
		echo "  sudo apt update && sudo apt install -y nodejs npm iproute2 openssl make g++"
	elif command -v pacman &>/dev/null; then
		echo "  sudo pacman -S --needed nodejs npm iproute2 openssl make gcc"
	else
		echo "  Please install nodejs, npm, iproute, openssl, make, and gcc-c++/g++"
	fi
	exit 1
fi

GUI_MODE=""
if [ "$1" == "--gui" ]; then
    GUI_MODE="1"
fi

# Get IP via default route — works on WiFi, Ethernet, VPN, etc.
IP_ADDRESS=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K[\d.]+')

# Fallback: scan all UP interfaces
if [ -z "$IP_ADDRESS" ]; then
    IP_ADDRESS=$(ip -4 addr show scope global up | grep -oP 'inet \K[\d.]+' | head -1)
fi

if [ -z "$GUI_MODE" ]; then
    clear
fi

# Auto-check and fix npm dependencies for future-proofing
if [ -z "$GUI_MODE" ]; then
    echo "Checking npm dependencies..."
fi
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ] || ! npm ls >/dev/null 2>&1; then
    if [ -z "$GUI_MODE" ]; then
	    echo "Missing or broken dependencies detected. Installing/fixing automatically..."
    fi
	npm install
fi

# IP exist or not
if [ -z "$IP_ADDRESS" ]; then
    if [ -n "$GUI_MODE" ]; then
        echo "GUI_ERROR=no_ip"
        exit 1
    fi
	echo "IP address is not detected!"
	read -p "Please enter the IP address or just press Enter to exit: " IP_ADDRESS
	if [ -z "$IP_ADDRESS" ]; then
		exit
	fi
fi

mkdir -p "$SCRIPT_DIR/ssl"

# Ensure presets directory exists and has correct permissions
mkdir -p "$SCRIPT_DIR/presets/wheel"
chmod -R 755 "$SCRIPT_DIR/presets"

PORT=$(node -e "console.log(require('./config.json').port)" 2>/dev/null || echo "80")

if [ -n "$GUI_MODE" ]; then
    echo "GUI_IP=$IP_ADDRESS"
    echo "GUI_PORT=$PORT"
    echo "GUI_STATUS=starting"
else
    echo "-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-"
    echo "Open https://$IP_ADDRESS:$PORT in your phone's browser"
    echo "(or http://$IP_ADDRESS — auto-redirects to HTTPS)"
    echo "-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-"
fi

# Ensure port is completely free before starting
if command -v fuser &>/dev/null; then
    sudo fuser -k -s ${PORT}/tcp &>/dev/null || true
fi

cleanup() {
	trap - EXIT INT TERM HUP
    if [ -z "$GUI_MODE" ]; then
	    echo "Closing ports..."
    fi
	if command -v firewall-cmd &>/dev/null; then
		sudo firewall-cmd --remove-port=$PORT/tcp > /dev/null 2>&1
		sudo firewall-cmd --remove-port=80/tcp > /dev/null 2>&1
		sudo firewall-cmd --remove-port=8080/tcp > /dev/null 2>&1
	elif command -v ufw &>/dev/null; then
		sudo ufw delete allow $PORT/tcp > /dev/null 2>&1
		sudo ufw delete allow 80/tcp > /dev/null 2>&1
		sudo ufw delete allow 8080/tcp > /dev/null 2>&1
	elif command -v iptables &>/dev/null; then
		sudo iptables -D INPUT -p tcp --dport $PORT -j ACCEPT > /dev/null 2>&1 || true
		sudo iptables -D INPUT -p tcp --dport 80 -j ACCEPT > /dev/null 2>&1 || true
		sudo iptables -D INPUT -p tcp --dport 8080 -j ACCEPT > /dev/null 2>&1 || true
	fi
    
    # Ensure all server processes are killed
    if command -v fuser &>/dev/null; then
        sudo fuser -k -s ${PORT}/tcp &>/dev/null || true
        sudo fuser -k -s 80/tcp &>/dev/null || true
        sudo fuser -k -s 8080/tcp &>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM HUP

if command -v firewall-cmd &>/dev/null; then
    if [ -z "$GUI_MODE" ]; then
	    echo "Temporarily opening ports in firewalld..."
    fi
	sudo firewall-cmd --add-port=$PORT/tcp > /dev/null
	sudo firewall-cmd --add-port=80/tcp > /dev/null 2>&1 || true
	sudo firewall-cmd --add-port=8080/tcp > /dev/null 2>&1 || true
elif command -v ufw &>/dev/null; then
    if [ -z "$GUI_MODE" ]; then
	    echo "Temporarily opening ports in ufw..."
    fi
	sudo ufw allow $PORT/tcp > /dev/null
	sudo ufw allow 80/tcp > /dev/null 2>&1 || true
	sudo ufw allow 8080/tcp > /dev/null 2>&1 || true
elif command -v iptables &>/dev/null; then
    if [ -z "$GUI_MODE" ]; then
	    echo "Temporarily opening ports in iptables..."
    fi
	sudo iptables -A INPUT -p tcp --dport $PORT -j ACCEPT > /dev/null 2>&1 || true
	sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT > /dev/null 2>&1 || true
	sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT > /dev/null 2>&1 || true
elif grep -qE "ID=void|ID_LIKE=void" /etc/os-release 2>/dev/null || command -v xbps-install &>/dev/null; then
    if [ -z "$GUI_MODE" ]; then
	    echo "Void Linux detected. Void Linux does not ship with a default active firewall."
	    echo "If using iptables, allow ports with:"
	    echo "  sudo iptables -A INPUT -p tcp --dport $PORT -j ACCEPT"
	    echo "Then install runit-iptables to save and restore rules across reboots."
    fi
fi

HOT_RELOAD_ENV=""
DEBUG_ENV=""
for arg in "$@"; do
	if [ "$arg" == "--debug" ]; then
		DEBUG_ENV="LOGLEVEL=debug"
	elif [ "$arg" == "--hot-reload" ]; then
		HOT_RELOAD_ENV="HOT_RELOAD=1"
	fi
done

if [ -n "$GUI_MODE" ]; then
    echo "GUI_STATUS=running"
fi

# Run virtual gamepad server (Smart Fallback Sudo Mode)
if [ -w "/dev/uinput" ] && [ "${PORT:-8080}" -ge 1024 ]; then
    if [ -z "$GUI_MODE" ]; then
        echo "Running server in non-sudo mode (user has /dev/uinput permissions)..."
    fi
    env $HOT_RELOAD_ENV $DEBUG_ENV $(which node) "$SCRIPT_DIR/main.js"
else
    if [ -z "$GUI_MODE" ]; then
        echo "Running server with sudo (/dev/uinput permission required or low port < 1024)..."
    fi
    sudo bash -c "$HOT_RELOAD_ENV $DEBUG_ENV $(which node) $SCRIPT_DIR/main.js"
fi
