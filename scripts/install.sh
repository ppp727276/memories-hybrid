#!/usr/bin/env bash
# Memories Hybrid — Install Script
# One command: bash scripts/install.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "============================================"
echo "  Memories Hybrid — Install"
echo "============================================"
echo ""

# Check prerequisites
echo "[1/5] Checking prerequisites..."

if ! command -v node &>/dev/null; then
    echo -e "${RED}Node.js not found. Install Node.js v22+ first.${NC}"
    exit 1
fi
echo "  Node.js: $(node --version)"

if ! command -v bun &>/dev/null; then
    echo -e "${RED}Bun not found. Install Bun >=1.1.0 first.${NC}"
    echo "  winget install --id Oven-sh.Bun"
    exit 1
fi
echo "  Bun: $(bun --version)"

if ! command -v hermes &>/dev/null; then
    echo -e "${RED}Hermes CLI not found. Install Hermes Agent first.${NC}"
    exit 1
fi
echo "  Hermes: $(hermes --version 2>/dev/null || echo 'installed')"

# Install npm dependencies
echo ""
echo "[2/5] Installing dependencies..."
npm install
(cd forge && npm install)
(cd mind && bun install)
echo -e "${GREEN}  Dependencies installed.${NC}"

# Install OSB plugin
echo ""
echo "[3/5] Installing OSB plugin..."
hermes plugins install ./mind/ --enable
echo -e "${GREEN}  OSB plugin installed.${NC}"

# Install o2b CLI
echo ""
echo "[4/5] Installing o2b CLI..."
o2b install-cli 2>/dev/null || {
    echo "  o2b CLI not found via plugin, trying direct path..."
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    PLUGIN_DIR="$SCRIPT_DIR/../mind"
    if [ -f "$PLUGIN_DIR/scripts/o2b" ]; then
        echo "  Add to PATH: $PLUGIN_DIR/scripts"
        echo "  Or run: bun $PLUGIN_DIR/scripts/o2b"
    fi
}
echo -e "${GREEN}  o2b CLI ready.${NC}"

# Copy config
echo ""
echo "[5/5] Setting up configuration..."
if [ ! -f bridge-config.json ]; then
    cp bridge-config.example.json bridge-config.json
    echo -e "${GREEN}  bridge-config.json created from template.${NC}"
    echo -e "${RED}  IMPORTANT: Edit bridge-config.json and set your API key!${NC}"
else
    echo "  bridge-config.json already exists, skipping."
fi

echo ""
echo "============================================"
echo -e "${GREEN}  Installation complete!${NC}"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Edit bridge-config.json — set your LLM API key"
echo "  2. Initialize vault: o2b init --vault ~/Documents/second-brain-memory"
echo "  3. Test bridge: npx tsx bridge/src/bridge.ts --config bridge-config.json --dry-run"
echo "  4. Run bridge: npx tsx bridge/src/bridge.ts --config bridge-config.json"
echo ""