#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Ce script doit être lancé sur macOS." >&2
  exit 1
fi

command -v node >/dev/null || { echo "Node.js 20+ est requis pour préparer le checkout de développement." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm est requis." >&2; exit 1; }

echo "[1/4] Installation des dépendances"
npm ci

echo "[2/4] Compilation du terminal natif"
npx electron-rebuild -f -w node-pty

echo "[3/4] Installation du plugin Forge pour Roblox Studio"
PLUGIN_DIR="$HOME/Documents/Roblox/Plugins"
mkdir -p "$PLUGIN_DIR"
cp "$ROOT/ForgePlugin.rbxmx" "$PLUGIN_DIR/ForgePlugin.rbxmx"

echo "[4/4] Vérification"
npm test
echo "Forge est prêt. Lance l’application avec : npm start"
