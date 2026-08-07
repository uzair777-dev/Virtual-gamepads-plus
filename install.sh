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
        echo "[DEBUG] Debug mode enabled."
        set -x
    fi
done

REPO_URL="https://github.com/uzair777-dev/Virtual-gamepads-plus.git"
TARGET_DIR="Virtual-gamepads-plus"

echo "=================================================="
echo "   Virtual Gamepads Plus — Automated Installer    "
echo "=================================================="
if [ $DEBUG_MODE -eq 1 ]; then
    echo "[DEBUG] OS Details: $(uname -a)"
fi
echo ""

if [ "$(uname -s)" != "Linux" ]; then
    echo "Error: This installer supports Linux systems only."
    exit 1
fi

IS_ATOMIC=0
IS_NIX=0
IS_VOID=0
IS_VOID_MUSL=0

# Detect Void Linux
if grep -qE "ID=void|ID_LIKE=void" /etc/os-release 2>/dev/null || command -v xbps-install &>/dev/null; then
    IS_VOID=1
    if ldd --version 2>&1 | grep -qi "musl" || ls /lib/ld-musl-*.so.1 &>/dev/null; then
        IS_VOID_MUSL=1
    fi
# Detect Nix
elif [ -f "/etc/NIXOS" ] || command -v nix &>/dev/null; then
    IS_NIX=1
# Detect Atomic / Immutable Linux
elif [ -d "/sysroot/ostree" ] || [ -f "/run/ostree-booted" ] || grep -qE "bazzite|silverblue|kinoite|steamos" /etc/os-release 2>/dev/null; then
    IS_ATOMIC=1
fi

detect_and_install_deps() {
    echo "[1/4] Checking environment & package managers..."
    if [ $DEBUG_MODE -eq 1 ]; then
        echo "[DEBUG] Environment flags: IS_VOID=$IS_VOID, IS_VOID_MUSL=$IS_VOID_MUSL, IS_NIX=$IS_NIX, IS_ATOMIC=$IS_ATOMIC"
    fi
    
    # 1. Void Linux (musl)
    if [ $IS_VOID_MUSL -eq 1 ]; then
        echo ""
        echo "Void Linux (musl C library) detected."
        echo "Please install the required dependencies manually using xbps-install:"
        echo "  sudo xbps-install -Sy git nodejs npm openssl make gcc python3 python3-gobject"
        echo ""
        local void_ans="y"
        if [ -t 0 ] || [ -c /dev/tty ]; then
            read -p "Have you installed these dependencies or wish to continue? [Y/n] " void_ans < /dev/tty || void_ans="y"
        fi
        if [[ ! "$void_ans" =~ ^[Yy]$ ]]; then
            echo "Exiting installer."
            exit 0
        fi
        return
    fi

    # 2. Nix / NixOS
    if [ $IS_NIX -eq 1 ]; then
        echo ""
        echo "Nix / NixOS detected."
        echo "We do not modify system-level packages on Nix."
        echo "Options:"
        echo "  1) Use Homebrew (brew)"
        echo "  2) Continue (assume dependencies node, npm, git, openssl, make, gcc, python3 are installed)"
        echo "  3) Exit installer"
        echo ""
        local nix_choice=2
        if [ -t 0 ] || [ -c /dev/tty ]; then
            read -p "Select option [1-3] (default 2): " nix_choice < /dev/tty || nix_choice=2
        fi
        nix_choice=${nix_choice:-2}

        if [ "$nix_choice" -eq 1 ]; then
            if command -v brew &>/dev/null; then
                brew install git node npm openssl make gcc python3
            else
                echo "Installing Homebrew..."
                NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                if [ -f "/home/linuxbrew/.linuxbrew/bin/brew" ]; then
                    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
                fi
                brew install git node npm openssl make gcc python3
            fi
        elif [ "$nix_choice" -eq 3 ]; then
            echo "Exiting installer."
            exit 0
        else
            echo "Continuing with existing environment..."
        fi
        return
    fi

    # 3. Distro PM Selection
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
        echo ""
        echo "Multiple package managers detected:"
        for i in "${!AVAILABLE_PMS[@]}"; do
            echo "  $((i+1))) ${AVAILABLE_PMS[$i]}"
        done
        echo ""
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

    echo "Using package manager: ${CHOSEN_PM:-homebrew/manual}"
    echo ""

    case "$CHOSEN_PM" in
        xbps-install)
            sudo xbps-install -Sy git nodejs npm openssl make gcc python3 python3-gobject
            ;;
        yay)
            yay -S --needed git nodejs npm iproute2 openssl make gcc python-gobject libappindicator-gtk3
            ;;
        paru)
            paru -S --needed git nodejs npm iproute2 openssl make gcc python-gobject libappindicator-gtk3
            ;;
        pikaur)
            pikaur -S --needed git nodejs npm iproute2 openssl make gcc python-gobject libappindicator-gtk3
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
                echo "Atomic OS or custom distro detected without Homebrew."
                local brew_ans="y"
                if [ -t 0 ] || [ -c /dev/tty ]; then
                    read -p "Would you like to install Homebrew now? [Y/n] " brew_ans < /dev/tty || brew_ans="y"
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

# Repository setup
echo "[2/4] Setting up project directory..."
if [ -d ".git" ] && git remote get-url origin 2>/dev/null | grep -q "Virtual-gamepads"; then
    git pull origin main || true
else
    if [ ! -d "$TARGET_DIR" ]; then
        git clone "$REPO_URL" "$TARGET_DIR"
        cd "$TARGET_DIR"
    else
        cd "$TARGET_DIR"
        git pull origin main || true
    fi
fi

# NPM & Permissions
echo "[3/4] Installing Node packages..."
npm install

echo "[4/4] Configuring uinput device permissions..."
if [ -f "./setup-permissions.sh" ]; then
    chmod +x ./setup-permissions.sh
fi
sudo usermod -aG input "$USER" 2>/dev/null || true
RULE='KERNEL=="uinput", MODE="0660", GROUP="input", OPTIONS+="static_node=uinput"'
echo "$RULE" | sudo tee /etc/udev/rules.d/99-uinput.rules > /dev/null 2>&1 || true
sudo udevadm control --reload-rules 2>/dev/null || true
sudo udevadm trigger 2>/dev/null || true

echo ""
echo "=================================================="
echo "   ✓ Virtual Gamepads Plus Installed Successfully! "
echo "=================================================="
echo "To launch:"
echo "  python3 gui.py      (GUI Manager)"
echo "  ./run.sh            (CLI Server)"
echo "=================================================="
