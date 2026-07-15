#!/usr/bin/env bash
# Capricorn v2 — Install Script
# One command: bash scripts/install.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "============================================"
echo "  Capricorn v2 — Install"
echo "============================================"
echo ""

# Check prerequisites
echo "[1/3] Checking prerequisites..."

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

# Install npm dependencies
echo ""
echo "[2/3] Installing dependencies..."
npm install
echo -e "${GREEN}  Dependencies installed.${NC}"

# Build distribution
echo ""
echo "[3/3] Building Capricorn v2..."
bun run build
echo -e "${GREEN}  Build complete.${NC}"

echo ""
echo "============================================"
echo -e "${GREEN}  Installation complete!${NC}"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Initialize config and vault: capricorn init --vault ~/Documents/second-brain-memory"
echo "  2. Run storage tests:          bun test"
echo "  3. Start MCP server:           capricorn serve"
echo ""
