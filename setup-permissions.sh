#!/bin/bash
# setup-permissions.sh — Deprecated Wrapper
# Permissions setup is now integrated directly into install.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Notice: setup-permissions.sh has been superseded by install.sh."
echo "Redirecting to install.sh..."
echo ""
exec bash "$SCRIPT_DIR/install.sh" "$@"
