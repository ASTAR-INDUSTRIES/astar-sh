#!/bin/bash
set -e

REPO="https://github.com/AstarConsulting/starry-page-design.git"
INSTALL_DIR="$HOME/.astar/cli"

if ! command -v bun &>/dev/null; then
  echo "Installing bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

if [ -d "$INSTALL_DIR" ]; then
  echo "Updating astar CLI..."
  cd "$INSTALL_DIR" && git pull
else
  echo "Installing astar CLI..."
  git clone "$REPO" "$INSTALL_DIR" --depth 1
fi

cd "$INSTALL_DIR/cli"
bun install

BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/astar" << 'WRAPPER'
#!/usr/bin/env bash
exec "$HOME/.bun/bin/bun" "$HOME/.astar/cli/cli/src/index.ts" "$@"
WRAPPER
chmod +x "$BIN_DIR/astar"

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  SHELL_RC="$HOME/.zshrc"
  [ -f "$HOME/.bashrc" ] && [ ! -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.bashrc"
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
  echo "Added $BIN_DIR to PATH in $SHELL_RC — restart your shell or run: source $SHELL_RC"
fi

echo ""
echo "Done! Run 'astar login' to get started."
