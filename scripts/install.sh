#!/bin/bash
# One-line installer for a fresh hub (macOS or Linux).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/fthrvi/yantra/main/scripts/install.sh | bash
#   or:  bash scripts/install.sh
#
# Idempotent — re-running upgrades.

set -e

REPO_URL="${REPO_URL:-https://github.com/fthrvi/yantra.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/fleet}"

echo "==> Yantra installer"
echo "    target: $INSTALL_DIR"

# Prereqs
if ! command -v node >/dev/null; then
  echo "ERROR: node not installed. Install Node 20+ first (e.g. brew install node, or apt install nodejs)." >&2
  exit 1
fi
if ! command -v git >/dev/null; then
  echo "ERROR: git not installed." >&2
  exit 1
fi
if ! command -v tailscale >/dev/null; then
  echo "WARNING: tailscale CLI not on PATH. Yantra relies on Tailscale for machine discovery."
fi

# Clone (or pull)
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "==> Updating existing checkout"
  cd "$INSTALL_DIR" && git pull --ff-only
else
  echo "==> Cloning $REPO_URL"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install dependencies
echo "==> npm install"
npm install --silent

# Env file
if [ ! -f .env ]; then
  echo "==> Creating .env from template"
  cp .env.example .env
fi

# DB schema
echo "==> Initialising SQLite schema"
mkdir -p data
npx prisma db push --skip-generate >/dev/null

# Ensure SSH key for hub→worker direction exists (will be added to workers later via /setup)
if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
  echo "==> Generating SSH key for the hub"
  ssh-keygen -t ed25519 -N "" -f "$HOME/.ssh/id_ed25519" -C "yantra-hub"
fi

echo ""
echo "✓ Install complete."
echo ""
echo "Next:"
echo "  cd $INSTALL_DIR"
echo "  npm run dev        # http://\$(tailscale ip -4):3001"
echo ""
echo "To run on boot under launchd (macOS), see scripts/launchd-template.plist."
