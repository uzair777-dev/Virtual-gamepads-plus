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

# Find First Wlan interface
WLAN_INTERFACE=$(ip addr | grep -oP '^\d+: \K\w+(?=: <BROADCAST,MULTICAST,UP,LOWER_UP>)')
# Get IP
IP_ADDRESSES=$(ip addr show dev "$WLAN_INTERFACE" | grep -Po 'inet \K[\d.]+' | tr '\n' ' ')
IP_ADDRESS=$(cut -d" " -f1 <<< $IP_ADDRESSES)

clear

# Auto-check and fix npm dependencies for future-proofing
echo "Checking npm dependencies..."
cd "$SCRIPT_DIR"
# npm ls returns an error code if dependencies are missing or mismatched
if ! npm ls >/dev/null 2>&1; then
	echo "Missing or broken dependencies detected. Installing/fixing automatically..."
	# Remove node_modules and package-lock to avoid frozen broken states
	rm -rf package-lock.json node_modules
	npm install
fi

# IP exist or not
if [ -z "$IP_ADDRESS" ]; then
	echo "IP address is not detected!"
	read -p "Please enter the IP address or just press Enter to exit: " IP_ADDRESS
	if [ -z "$IP_ADDRESS" ]; then
		exit
	fi
fi

# Generate SSL certificate if is not exist for https connection
if [ ! -f "$SCRIPT_DIR/ssl/key.pem" ] || [ ! -f "$SCRIPT_DIR/ssl/cert.pem" ]; then
	echo "Generating SSL certificates..."
	openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 123456 -nodes \
		-subj "/C=US/ST=State/L=Locality/O=Organization/CN=localhost"
	echo "SSL generated successfully."
fi

# Show server qr-code
if command -v qrencode &>/dev/null; then
	qrencode -t ansiutf8 "https://$IP_ADDRESS:80"
elif command -v qr &>/dev/null; then
	qr "https://$IP_ADDRESS:80"
else
	echo "Both \"QREncode\" and \"QR\" packages is not installed, QRCode can not be showen"
	echo "Open [https://$IP_ADDRESS:80] in your browser to connect to the server."
fi
echo "-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-"
echo "IP Address: ${IP_ADDRESSES}"
echo "-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-"

cleanup() {
	trap - EXIT INT TERM
	echo "Closing port 80..."
	if command -v firewall-cmd &>/dev/null; then
		sudo firewall-cmd --remove-port=80/tcp > /dev/null
	elif command -v ufw &>/dev/null; then
		sudo ufw delete allow 80/tcp > /dev/null
	fi
}

if command -v firewall-cmd &>/dev/null; then
	echo "Temporarily opening port 80 in firewalld..."
	sudo firewall-cmd --add-port=80/tcp > /dev/null
	trap cleanup EXIT INT TERM HUP
elif command -v ufw &>/dev/null; then
	echo "Temporarily opening port 80 in ufw..."
	sudo ufw allow 80/tcp > /dev/null
	trap cleanup EXIT INT TERM HUP
fi

DEBUG_ENV=""
for arg in "$@"; do
	if [ "$arg" == "--debug" ]; then
		DEBUG_ENV="LOGLEVEL=debug"
	fi
done

# Run virtual gamepad server
sudo bash -c "$DEBUG_ENV $(which node) $SCRIPT_DIR/main.js"
