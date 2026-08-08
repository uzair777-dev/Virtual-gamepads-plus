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

# Parse command-line flags
CUSTOM_PORT=""
GUI_MODE=""
NODE_PASSTHROUGH_ARGS=()

PREV_ARG=""
for arg in "$@"; do
    if [ "$PREV_ARG" == "--port" ] || [ "$PREV_ARG" == "-p" ]; then
        CUSTOM_PORT="${arg//\"/}"
        PREV_ARG=""
        continue
    fi
    case $arg in
        --port=*)
            val="${arg#*=}"
            CUSTOM_PORT="${val//\"/}"
            ;;
        -p=*)
            val="${arg#*=}"
            CUSTOM_PORT="${val//\"/}"
            ;;
        --port|-p)
            PREV_ARG="$arg"
            ;;
        --gui)
            GUI_MODE="1"
            ;;
        *)
            NODE_PASSTHROUGH_ARGS+=("$arg")
            ;;
    esac
done

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
if [ -n "$CUSTOM_PORT" ]; then
    if ! [[ "$CUSTOM_PORT" =~ ^[0-9]+$ ]] || [ "$CUSTOM_PORT" -lt 1 ] || [ "$CUSTOM_PORT" -gt 65535 ]; then
        if [ -z "$GUI_MODE" ]; then
            echo -e "\033[1;31mError:\033[0m Invalid port '$CUSTOM_PORT'. TCP ports must be between 1 and 65535."
        fi
        if [ "$CUSTOM_PORT" == "80085" ]; then
            if [ -z "$GUI_MODE" ]; then
                echo -e "\033[1;33mNotice:\033[0m 80085 exceeds max TCP port (65535). Automatically correcting to port 8085..."
            fi
            CUSTOM_PORT="8085"
        else
            CUSTOM_PORT=""
        fi
    fi
fi

if [ -n "$CUSTOM_PORT" ]; then
    PORT="$CUSTOM_PORT"
    export PORT="$CUSTOM_PORT"
else
    PORT=$(node -e "console.log(require('./config.json').port)" 2>/dev/null || echo "8443")
fi

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

# First attempt user-level process cleanup on target ports
if command -v fuser &>/dev/null; then
    fuser -k -s 8443/tcp 8080/tcp 8000/tcp 3000/tcp 8081/tcp ${PORT}/tcp &>/dev/null || true
    sleep 0.2
fi

# Interactive port cleanup prompt for CLI mode (only if port is STILL occupied by root/other user)
if [ -z "$GUI_MODE" ] && [ -t 0 ] && command -v ss &>/dev/null; then
    if ss -tulpn | grep -qE ":${PORT} |:8443 |:8080 "; then
        echo -e "\033[1;33m==> Notice:\033[0m Target server port ($PORT) is currently in use by elevated process."
        read -p "Would you like to terminate stuck processes using sudo to free up ports? [Y/n] " prompt_ans
        if [[ "$prompt_ans" =~ ^[Yy]$ || -z "$prompt_ans" ]]; then
            sudo fuser -k -9 ${PORT}/tcp 8443/tcp 8080/tcp 8000/tcp 3000/tcp 8081/tcp 2>/dev/null || true
            echo -e "\033[1;32m==>\033[0m Network ports released successfully."
            sleep 0.4
        fi
    fi
fi

# Function to safely handle non-blocking sudo firewall commands
CAN_SUDO_NONINTERACTIVE=0
if sudo -n true 2>/dev/null; then
    CAN_SUDO_NONINTERACTIVE=1
fi

cleanup() {
	trap - EXIT INT TERM HUP
    
    # Kill remaining processes on custom port and standard server ports
    if command -v fuser &>/dev/null; then
        fuser -k -9 ${PORT}/tcp 8443/tcp 8080/tcp 8008/tcp 8000/tcp 3000/tcp 8081/tcp &>/dev/null || true
    fi
    pkill -f "$SCRIPT_DIR/server.js" &>/dev/null || true
    pkill -f "$SCRIPT_DIR/main.js" &>/dev/null || true
}

trap cleanup EXIT INT TERM HUP

# Dynamically authorize firewall ports ONLY if non-interactive sudo is available
if [ $CAN_SUDO_NONINTERACTIVE -eq 1 ]; then
    if command -v firewall-cmd &>/dev/null && firewall-cmd --state &>/dev/null; then
        if ! firewall-cmd --query-port=$PORT/tcp &>/dev/null; then
            sudo firewall-cmd --add-port=$PORT/tcp > /dev/null 2>&1 || true
        fi
    elif command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "active"; then
        sudo ufw allow $PORT/tcp > /dev/null 2>&1 || true
    elif command -v iptables &>/dev/null; then
        sudo iptables -A INPUT -p tcp --dport $PORT -j ACCEPT > /dev/null 2>&1 || true
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

PORT_ARG=""
if [ -n "$CUSTOM_PORT" ]; then
    PORT_ARG="--port $CUSTOM_PORT"
fi

# Run virtual gamepad server (Smart Fallback Sudo Mode)
if [ -w "/dev/uinput" ] && [ "${PORT:-8080}" -ge 1024 ]; then
    if [ -z "$GUI_MODE" ]; then
        echo "Running server in non-sudo mode (user has /dev/uinput permissions)..."
    fi
    env PORT="$PORT" $HOT_RELOAD_ENV $DEBUG_ENV $(which node) "$SCRIPT_DIR/main.js" $PORT_ARG
else
    # Need elevated privileges — use sudo only if non-interactive sudo is available,
    # otherwise the GUI already launched via pkexec (gui.py handles that path)
    if [ $CAN_SUDO_NONINTERACTIVE -eq 1 ]; then
        if [ -z "$GUI_MODE" ]; then
            echo "Running server with sudo (/dev/uinput permission required or low port < 1024)..."
        fi
        sudo bash -c "PORT=$PORT $HOT_RELOAD_ENV $DEBUG_ENV $(which node) $SCRIPT_DIR/main.js $PORT_ARG"
    else
        # GUI mode: gui.py already handled elevation via pkexec before launching run.sh
        # CLI mode: inform the user they need to fix permissions
        if [ -z "$GUI_MODE" ]; then
            echo "Error: Cannot access /dev/uinput and sudo requires a password."
            echo "Run './install.sh' once to set up passwordless access, then try again."
            exit 1
        fi
        # In GUI mode: pkexec already elevated us, just run directly
        env PORT="$PORT" $HOT_RELOAD_ENV $DEBUG_ENV $(which node) "$SCRIPT_DIR/main.js" $PORT_ARG
    fi
fi
