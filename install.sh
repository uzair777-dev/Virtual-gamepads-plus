#!/bin/bash
# ==============================================================================
# Virtual Gamepads Plus — Automated Installer Script
# Repo: https://github.com/uzair777-dev/Virtual-gamepads-plus
# ==============================================================================

set -e

DEBUG_MODE=0
for arg in "$@"; do
    if [ "$arg" == "--debug" ] || [ "$arg" == "-d" ]; then
        DEBUG_MODE=1
        set -x
    fi
done

REPO_URL="https://github.com/uzair777-dev/Virtual-gamepads-plus.git"
INSTALL_TARGET_DIR="$HOME/.local/share/virtual-gamepads-plus"
NEEDS_RELOGIN=0

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

echo -e "${BOLD}Virtual Gamepads Plus Installer${RESET}"
echo ""

# Ensure running on Linux
if [ "$(uname -s)" != "Linux" ]; then
    echo "Error: This installer supports Linux systems only."
    exit 1
fi

# Check for existing installation and prompt for update/reinstall
if [ -d "$INSTALL_TARGET_DIR" ] && [ -f "$INSTALL_TARGET_DIR/server.js" ]; then
    echo "Existing installation found at $INSTALL_TARGET_DIR"
    update_ans="u"
    if [ -t 0 ] || [ -c /dev/tty ]; then
        read -p "Update, Reinstall, or Cancel? [U/r/c] " update_ans < /dev/tty || update_ans="u"
    fi
    update_ans=${update_ans:-u}

    if [[ "$update_ans" =~ ^[Cc]$ ]]; then
        echo "Cancelled."
        exit 0
    elif [[ "$update_ans" =~ ^[Rr]$ ]]; then
        echo "Removing existing files for reinstall..."
        rm -rf "$INSTALL_TARGET_DIR"
    else
        echo "Updating existing installation..."
    fi
fi

# Operating system / distribution environment flags
IS_ATOMIC=0
IS_NIX=0
IS_VOID=0
IS_VOID_MUSL=0

# Detect Void Linux (glibc or musl)
if grep -qE "ID=void|ID_LIKE=void" /etc/os-release 2>/dev/null || command -v xbps-install &>/dev/null; then
    IS_VOID=1
    if ldd --version 2>&1 | grep -qi "musl" || ls /lib/ld-musl-*.so.1 &>/dev/null; then
        IS_VOID_MUSL=1
    fi
# Detect NixOS / Nix package manager
elif [ -f "/etc/NIXOS" ] || command -v nix &>/dev/null; then
    IS_NIX=1
# Detect Atomic / Immutable Linux (Bazzite, Silverblue, Kinoite, SteamOS, ostree)
elif [ -d "/sysroot/ostree" ] || [ -f "/run/ostree-booted" ] || grep -qE "bazzite|silverblue|kinoite|steamos" /etc/os-release 2>/dev/null; then
    IS_ATOMIC=1
fi

# Request sudo privileges upfront with clear rationale & keepalive loop
if [ $IS_NIX -eq 0 ] && [ $IS_VOID_MUSL -eq 0 ]; then
    echo "Requesting sudo privileges for dependencies, uinput rules, and firewall authorization..."
    sudo -v
    
    # Keep sudo timestamp alive in background until install.sh finishes
    while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &
fi

detect_and_install_deps() {
    echo -e "${BLUE}==>${RESET} ${BOLD}Checking system dependencies & package manager...${RESET}"
    
    # 1. Void Linux (musl C library)
    if [ $IS_VOID_MUSL -eq 1 ]; then
        echo "Void Linux (musl) detected."
        echo "Please install required dependencies manually using xbps-install:"
        echo "  sudo xbps-install -Sy git nodejs npm openssl make gcc python3 python3-gobject"
        local void_ans="y"
        if [ -t 0 ] || [ -c /dev/tty ]; then
            read -p "Continue installation? [Y/n] " void_ans < /dev/tty || void_ans="y"
        fi
        if [[ ! "$void_ans" =~ ^[Yy]$ ]]; then
            exit 0
        fi
        return
    fi

    # 2. Nix / NixOS
    if [ $IS_NIX -eq 1 ]; then
        echo "Nix / NixOS detected."
        echo "Options:"
        echo "  1) Use Homebrew (brew)"
        echo "  2) Continue (assume dependencies node, npm, git, openssl, make, gcc, python3 are installed)"
        echo "  3) Exit installer"
        local nix_choice=2
        if [ -t 0 ] || [ -c /dev/tty ]; then
            read -p "Choice [1-3] (default 2): " nix_choice < /dev/tty || nix_choice=2
        fi
        nix_choice=${nix_choice:-2}

        if [ "$nix_choice" -eq 1 ]; then
            if command -v brew &>/dev/null; then
                brew install git node npm openssl make gcc python3
            else
                NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                if [ -f "/home/linuxbrew/.linuxbrew/bin/brew" ]; then
                    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
                fi
                brew install git node npm openssl make gcc python3
            fi
        elif [ "$nix_choice" -eq 3 ]; then
            exit 0
        fi
        return
    fi

    # 3. Distro Package Manager Selection (pacman, yay, paru, pikaur, apt-get, apt, nala, dnf, dnf5, zypper)
    local AVAILABLE_PMS=()
    if [ $IS_ATOMIC -eq 0 ]; then
        if [ $IS_VOID -eq 1 ]; then
            [ -x "$(command -v xbps-install)" ] && AVAILABLE_PMS+=("xbps-install")
        elif command -v pacman &>/dev/null; then
            [ -x "$(command -v pacman)" ] && AVAILABLE_PMS+=("pacman")
            [ -x "$(command -v yay)" ] && AVAILABLE_PMS+=("yay")
            [ -x "$(command -v paru)" ] && AVAILABLE_PMS+=("paru")
            [ -x "$(command -v pikaur)" ] && AVAILABLE_PMS+=("pikaur")
        elif command -v apt-get &>/dev/null || command -v nala &>/dev/null; then
            [ -x "$(command -v apt-get)" ] && AVAILABLE_PMS+=("apt-get")
            [ -x "$(command -v apt)" ] && AVAILABLE_PMS+=("apt")
            [ -x "$(command -v nala)" ] && AVAILABLE_PMS+=("nala")
        elif command -v dnf &>/dev/null || command -v dnf5 &>/dev/null; then
            [ -x "$(command -v dnf5)" ] && AVAILABLE_PMS+=("dnf5")
            [ -x "$(command -v dnf)" ] && AVAILABLE_PMS+=("dnf")
        elif command -v zypper &>/dev/null; then
            AVAILABLE_PMS+=("zypper")
        fi
    fi

    local CHOSEN_PM=""
    if [ ${#AVAILABLE_PMS[@]} -gt 1 ]; then
        echo "Multiple package managers found: ${AVAILABLE_PMS[*]}"
        local choice=1
        if [ -t 0 ] || [ -c /dev/tty ]; then
            read -p "Select package manager [1-${#AVAILABLE_PMS[@]}] (default 1): " choice < /dev/tty || choice=1
        fi
        choice=${choice:-1}
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#AVAILABLE_PMS[@]}" ]; then
            CHOSEN_PM="${AVAILABLE_PMS[$((choice-1))]}"
        else
            CHOSEN_PM="${AVAILABLE_PMS[0]}"
        fi
    elif [ ${#AVAILABLE_PMS[@]} -eq 1 ]; then
        CHOSEN_PM="${AVAILABLE_PMS[0]}"
    fi

    echo "Using package manager: ${CHOSEN_PM:-manual}"

    case "$CHOSEN_PM" in
        xbps-install)
            sudo xbps-install -Sy git nodejs npm openssl make gcc python3 python3-gobject
            ;;
        yay|paru|pikaur)
            "$CHOSEN_PM" -S --needed git nodejs npm iproute2 openssl make gcc python-gobject libappindicator-gtk3
            ;;
        pacman)
            sudo pacman -S --needed --noconfirm git nodejs npm iproute2 openssl make gcc python-gobject libappindicator-gtk3 2>/dev/null || \
            sudo pacman -S --needed --noconfirm git nodejs npm iproute2 openssl make gcc
            ;;
        nala)
            sudo nala update && sudo nala install -y git nodejs npm iproute2 openssl make g++ python3-gi gir1.2-appindicator3-0.1 2>/dev/null || \
            sudo nala install -y git nodejs npm iproute2 openssl make g++ python3-gi
            ;;
        apt|apt-get)
            sudo apt-get update && sudo apt-get install -y git nodejs npm iproute2 openssl make g++ python3-gi gir1.2-appindicator3-0.1 2>/dev/null || \
            sudo apt-get install -y git nodejs npm iproute2 openssl make g++ python3-gi
            ;;
        dnf5|dnf)
            sudo $CHOSEN_PM install -y git nodejs npm iproute openssl make gcc-c++ python3-gobject libappindicator-gtk3 2>/dev/null || \
            sudo $CHOSEN_PM install -y git nodejs npm iproute openssl make gcc-c++
            ;;
        zypper)
            sudo zypper install -y git nodejs npm iproute2 openssl make gcc-c++ python3-gobject 2>/dev/null || true
            ;;
        *)
            if command -v brew &>/dev/null; then
                brew install git node npm openssl make gcc python3
            else
                local brew_ans="y"
                if [ -t 0 ] || [ -c /dev/tty ]; then
                    read -p "Install Homebrew for missing dependencies? [Y/n] " brew_ans < /dev/tty || brew_ans="y"
                fi
                if [[ "$brew_ans" =~ ^[Yy]$ ]] || [ -z "$brew_ans" ]; then
                    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                    if [ -f "/home/linuxbrew/.linuxbrew/bin/brew" ]; then
                        eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
                    fi
                    brew install git node npm openssl make gcc python3
                else
                    echo "Please install dependencies manually."
                    exit 1
                fi
            fi
            ;;
    esac
}

detect_and_install_deps

# Repository & Application Directory setup into ~/.local/share/virtual-gamepads-plus
echo -e "${BLUE}==>${RESET} ${BOLD}Installing application files to $INSTALL_TARGET_DIR...${RESET}"

if [ -d ".git" ] && [ "$(pwd)" != "$INSTALL_TARGET_DIR" ]; then
    mkdir -p "$INSTALL_TARGET_DIR"
    rsync -a --exclude='node_modules' --exclude='.git' . "$INSTALL_TARGET_DIR/" 2>/dev/null || \
    cp -rf . "$INSTALL_TARGET_DIR/" 2>/dev/null || true
    cd "$INSTALL_TARGET_DIR"
elif [ -d ".git" ]; then
    git pull origin main || true
else
    if [ ! -d "$INSTALL_TARGET_DIR" ]; then
        git clone "$REPO_URL" "$INSTALL_TARGET_DIR"
    else
        (cd "$INSTALL_TARGET_DIR" && git pull origin main || true)
    fi
    cd "$INSTALL_TARGET_DIR"
fi

# NPM dependency installation & native compilation (uinput binding)
echo -e "${BLUE}==>${RESET} ${BOLD}Installing Node.js packages & compiling native modules...${RESET}"
npm install
npm rebuild

# Configure non-root uinput access & system permissions
echo -e "${BLUE}==>${RESET} ${BOLD}Configuring uinput permissions & firewall authorization...${RESET}"

# Check if user was already in input group BEFORE adding
WAS_IN_INPUT_GROUP=0
if id -nG "$USER" 2>/dev/null | grep -qw "input"; then
    WAS_IN_INPUT_GROUP=1
fi

# Add user to 'input' group and install /dev/uinput udev rule
sudo usermod -aG input "$USER" 2>/dev/null || true
RULE='KERNEL=="uinput", MODE="0660", GROUP="input", OPTIONS+="static_node=uinput"'
echo "$RULE" | sudo tee /etc/udev/rules.d/99-uinput.rules > /dev/null 2>&1 || true
sudo udevadm control --reload-rules 2>/dev/null || true
sudo udevadm trigger 2>/dev/null || true
sudo chmod 666 /dev/uinput 2>/dev/null || true

# Flag re-login notice if user was newly added to input group
if [ $WAS_IN_INPUT_GROUP -eq 0 ]; then
    NEEDS_RELOGIN=1
fi

# Ensure user ownership and permissions on SSL certificate directory
mkdir -p ssl
sudo chown -R "$USER:$USER" ssl 2>/dev/null || true
chmod 755 ssl 2>/dev/null || true
chmod 644 ssl/* 2>/dev/null || true

# Pre-authorize firewall ports permanently (8443/tcp, 8080/tcp, 80/tcp + custom port range 8000-8090/tcp)
CUSTOM_PORT=$(node -e "console.log(require('./config.json').port)" 2>/dev/null || echo "8443")
if command -v firewall-cmd &>/dev/null; then
    sudo firewall-cmd --permanent --add-port=8443/tcp >/dev/null 2>&1 || true
    sudo firewall-cmd --permanent --add-port=8080/tcp >/dev/null 2>&1 || true
    sudo firewall-cmd --permanent --add-port=80/tcp >/dev/null 2>&1 || true
    sudo firewall-cmd --permanent --add-port=8000-8090/tcp >/dev/null 2>&1 || true
    [ -n "$CUSTOM_PORT" ] && sudo firewall-cmd --permanent --add-port=$CUSTOM_PORT/tcp >/dev/null 2>&1 || true
    sudo firewall-cmd --reload >/dev/null 2>&1 || true
elif command -v ufw &>/dev/null; then
    sudo ufw allow 8443/tcp >/dev/null 2>&1 || true
    sudo ufw allow 8080/tcp >/dev/null 2>&1 || true
    sudo ufw allow 80/tcp >/dev/null 2>&1 || true
    sudo ufw allow 8000:8090/tcp >/dev/null 2>&1 || true
    [ -n "$CUSTOM_PORT" ] && sudo ufw allow $CUSTOM_PORT/tcp >/dev/null 2>&1 || true
elif command -v iptables &>/dev/null; then
    sudo iptables -A INPUT -p tcp --dport 8443 -j ACCEPT >/dev/null 2>&1 || true
    sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT >/dev/null 2>&1 || true
    sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT >/dev/null 2>&1 || true
    sudo iptables -A INPUT -p tcp --dport 8000:8090 -j ACCEPT >/dev/null 2>&1 || true
    [ -n "$CUSTOM_PORT" ] && sudo iptables -A INPUT -p tcp --dport $CUSTOM_PORT -j ACCEPT >/dev/null 2>&1 || true
fi

# Grant low-port capability (cap_net_bind_service) to Node.js binary if setcap is available
if command -v setcap &>/dev/null && command -v node &>/dev/null; then
    NODE_BIN="$(readlink -f $(which node) 2>/dev/null || which node)"
    sudo setcap 'cap_net_bind_service=+ep' "$NODE_BIN" 2>/dev/null || true
fi

# Install 'vgp' CLI executable & Desktop Application Launcher
echo -e "${BLUE}==>${RESET} ${BOLD}Setting up CLI launcher & desktop entry...${RESET}"
PROJECT_ABS_DIR="$(pwd)"

# Create CLI executable ~/.local/bin/vgp
mkdir -p "$HOME/.local/bin"
cat << 'WRAPPER_EOF' > "$HOME/.local/bin/vgp"
#!/bin/bash
INSTALL_DIR="$HOME/.local/share/virtual-gamepads-plus"

if [ "$1" == "--uninstall" ]; then
    if [ -f "$INSTALL_DIR/uninstall.sh" ]; then
        exec bash "$INSTALL_DIR/uninstall.sh"
    else
        echo "Error: Uninstall script not found at $INSTALL_DIR/uninstall.sh"
        exit 1
    fi
fi

exec "$INSTALL_DIR/run.sh" "$@"
WRAPPER_EOF
chmod +x "$HOME/.local/bin/vgp"

# Ensure ~/.local/bin is in PATH for bash/zsh shell configuration
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$rc" ] && ! grep -q '\.local/bin' "$rc"; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
    fi
done

# Install .desktop launcher entry with StartupWMClass for GNOME, KDE, Hyprland & Wayland panel icon mapping
mkdir -p "$HOME/.local/share/applications"
mkdir -p "$HOME/.local/share/icons/hicolor/256x256/apps"
ICON_PATH="$PROJECT_ABS_DIR/public/branding/wheel_logo.png"

if [ -f "$ICON_PATH" ]; then
    cp "$ICON_PATH" "$HOME/.local/share/icons/hicolor/256x256/apps/virtual-gamepads-plus.png"
fi

cat << EOF > "$HOME/.local/share/applications/virtual-gamepads-plus.desktop"
[Desktop Entry]
Name=Virtual Gamepads Plus
Comment=Virtual Racing Wheel & Gamepad Server
Exec=python3 $PROJECT_ABS_DIR/gui.py
Icon=$ICON_PATH
Terminal=false
Type=Application
Categories=Game;Utility;
Keywords=gamepad;wheel;controller;racing;virtual;
StartupWMClass=virtual-gamepads-plus
EOF

chmod +x "$HOME/.local/share/applications/virtual-gamepads-plus.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}Installation complete!${RESET}"
echo ""
echo "Launch using:"
echo "  vgp           (CLI)"
echo "  python3 gui.py (GUI)"
echo "  Or via your system application launcher."
echo ""
echo "To uninstall:"
echo "  vgp --uninstall"

if [ $NEEDS_RELOGIN -eq 1 ]; then
    echo ""
    echo -e "${YELLOW}Note: Added to 'input' group. Please log out and back in for /dev/uinput access.${RESET}"
fi
