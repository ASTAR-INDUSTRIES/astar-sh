#!/bin/bash
set -e

REPO="https://github.com/ASTAR-INDUSTRIES/astar-sh.git"
INSTALL_DIR="$HOME/.astar/cli"
BIN_DIR="$HOME/.local/bin"

echo ""
echo "  ╔═══════════════════════════════╗"
echo "  ║     astar CLI installer       ║"
echo "  ╚═══════════════════════════════╝"
echo ""

if ! command -v bun &>/dev/null; then
  if [ -f "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  else
    echo "  Installing bun..."
    curl -fsSL https://bun.sh/install | bash 2>/dev/null
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  Updating..."
  cd "$INSTALL_DIR" && git pull --quiet
else
  echo "  Downloading..."
  rm -rf "$INSTALL_DIR"
  git clone "$REPO" "$INSTALL_DIR" --depth 1 --quiet
fi

echo "  Installing dependencies..."
cd "$INSTALL_DIR/cli"
bun install --silent 2>/dev/null

mkdir -p "$BIN_DIR"

BUN_PATH="$(which bun 2>/dev/null || echo "$HOME/.bun/bin/bun")"

cat > "$BIN_DIR/astar" << WRAPPER
#!/bin/bash
exec "$BUN_PATH" "$INSTALL_DIR/cli/src/index.ts" "\$@"
WRAPPER
chmod +x "$BIN_DIR/astar"

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  for RC in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    if [ -f "$RC" ]; then
      echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$RC"
      echo "  Added to PATH in $(basename $RC)"
      break
    fi
  done
fi

VERSION=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD)

# Track install
curl -s -X POST "https://owerciqeeelwrqseajqq.supabase.co/functions/v1/skills-api/ping" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"install\",\"version\":\"$VERSION\",\"os\":\"$(uname -s)\"}" 2>/dev/null &

echo ""
echo "  ✓ astar CLI installed ($VERSION)"
echo ""
echo "  Get started:"
echo "    astar login          Sign in with Microsoft"
echo "    astar skill list     Browse available skills"
echo "    astar skill install  Install a skill"
echo ""
echo "  Update anytime with: astar update"
echo ""
