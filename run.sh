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
chmod -R 755 "$SCRIPT_DIR/presets" 2>/dev/null || true

PORT=$(node -e "console.log(require('./config.json').port)" 2>/dev/null || echo "8443")

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

# Interactive port cleanup prompt for CLI mode
if [ -z "$GUI_MODE" ] && [ -t 0 ] && command -v ss &>/dev/null; then
    if ss -tulpn | grep -qE ":8443 |:8080 "; then
        echo -e "\033[1;33m==> Notice:\033[0m Target server port (8443/8080) is currently in use."
        read -p "Would you like to terminate stuck processes using sudo to free up ports? [Y/n] " prompt_ans
        if [[ "$prompt_ans" =~ ^[Yy]$ || -z "$prompt_ans" ]]; then
            sudo fuser -k -9 8443/tcp 8080/tcp 8000/tcp 3000/tcp 8081/tcp 2>/dev/null || true
            echo -e "\033[1;32m==>\033[0m Network ports released successfully."
            sleep 0.4
        fi
    fi
fi

# Ensure user's own processes on server ports are stopped before starting
if command -v fuser &>/dev/null; then
    fuser -k -s 8443/tcp &>/dev/null || true
    fuser -k -s 8080/tcp &>/dev/null || true
    fuser -k -s 8000/tcp &>/dev/null || true
    fuser -k -s 3000/tcp &>/dev/null || true
    fuser -k -s 8081/tcp &>/dev/null || true
    fuser -k -s ${PORT}/tcp &>/dev/null || true
fi

# Function to safely handle non-blocking sudo firewall commands
CAN_SUDO_NONINTERACTIVE=0
if sudo -n true 2>/dev/null; then
    CAN_SUDO_NONINTERACTIVE=1
fi

cleanup() {
	trap - EXIT INT TERM HUP
    
    # Only touch firewall ports on cleanup if we modified them and have non-interactive sudo
    if [ $CAN_SUDO_NONINTERACTIVE -eq 1 ]; then
        if command -v firewall-cmd &>/dev/null; then
            sudo firewall-cmd --remove-port=8443/tcp > /dev/null 2>&1 || true
            sudo firewall-cmd --remove-port=8080/tcp > /dev/null 2>&1 || true
            sudo firewall-cmd --remove-port=80/tcp > /dev/null 2>&1 || true
            sudo firewall-cmd --remove-port=$PORT/tcp > /dev/null 2>&1 || true
        elif command -v ufw &>/dev/null; then
            sudo ufw delete allow 8443/tcp > /dev/null 2>&1 || true
            sudo ufw delete allow 8080/tcp > /dev/null 2>&1 || true
            sudo ufw delete allow 80/tcp > /dev/null 2>&1 || true
            sudo ufw delete allow $PORT/tcp > /dev/null 2>&1 || true
        elif command -v iptables &>/dev/null; then
            sudo iptables -D INPUT -p tcp --dport 8443 -j ACCEPT > /dev/null 2>&1 || true
            sudo iptables -D INPUT -p tcp --dport 8080 -j ACCEPT > /dev/null 2>&1 || true
            sudo iptables -D INPUT -p tcp --dport 80 -j ACCEPT > /dev/null 2>&1 || true
            sudo iptables -D INPUT -p tcp --dport $PORT -j ACCEPT > /dev/null 2>&1 || true
        fi
    fi
    
    # Kill remaining user processes on ports
    if command -v fuser &>/dev/null; then
        fuser -k -s 8443/tcp &>/dev/null || true
        fuser -k -s 8080/tcp &>/dev/null || true
        fuser -k -s ${PORT}/tcp &>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM HUP

# Dynamically authorize firewall ports ONLY if we have non-interactive sudo access
if [ $CAN_SUDO_NONINTERACTIVE -eq 1 ]; then
    if command -v firewall-cmd &>/dev/null; then
        sudo firewall-cmd --add-port=8443/tcp > /dev/null 2>&1 || true
        sudo firewall-cmd --add-port=8080/tcp > /dev/null 2>&1 || true
        sudo firewall-cmd --add-port=80/tcp > /dev/null 2>&1 || true
        sudo firewall-cmd --add-port=$PORT/tcp > /dev/null 2>&1 || true
    elif command -v ufw &>/dev/null; then
        sudo ufw allow 8443/tcp > /dev/null 2>&1 || true
        sudo ufw allow 8080/tcp > /dev/null 2>&1 || true
        sudo ufw allow 80/tcp > /dev/null 2>&1 || true
        sudo ufw allow $PORT/tcp > /dev/null 2>&1 || true
    elif command -v iptables &>/dev/null; then
        sudo iptables -A INPUT -p tcp --dport 8443 -j ACCEPT > /dev/null 2>&1 || true
        sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT > /dev/null 2>&1 || true
        sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT > /dev/null 2>&1 || true
        sudo iptables -A INPUT -p tcp --dport $PORT -j ACCEPT > /dev/null 2>&1 || true
    elif grep -qE "ID=void|ID_LIKE=void" /etc/os-release 2>/dev/null || command -v xbps-install &>/dev/null; then
        if [ -z "$GUI_MODE" ]; then
            echo "Void Linux detected. Void Linux does not ship with a default active firewall."
            echo "If using iptables, allow ports with:"
            echo "  sudo iptables -A INPUT -p tcp --dport $PORT -j ACCEPT"
            echo "Then install runit-iptables to save and restore rules across reboots."
        fi
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
    # Need elevated privileges — use sudo only if non-interactive sudo is available,
    # otherwise the GUI already launched via pkexec (gui.py handles that path)
    if [ $CAN_SUDO_NONINTERACTIVE -eq 1 ]; then
        if [ -z "$GUI_MODE" ]; then
            echo "Running server with sudo (/dev/uinput permission required or low port < 1024)..."
        fi
        sudo bash -c "$HOT_RELOAD_ENV $DEBUG_ENV $(which node) $SCRIPT_DIR/main.js"
    else
        # GUI mode: gui.py already handled elevation via pkexec before launching run.sh
        # CLI mode: inform the user they need to fix permissions
        if [ -z "$GUI_MODE" ]; then
            echo "Error: Cannot access /dev/uinput and sudo requires a password."
            echo "Run './install.sh' once to set up passwordless access, then try again."
            exit 1
        fi
        # In GUI mode: pkexec already elevated us, just run directly
        env $HOT_RELOAD_ENV $DEBUG_ENV $(which node) "$SCRIPT_DIR/main.js"
    fi
fi
