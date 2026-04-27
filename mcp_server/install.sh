#!/usr/bin/env bash
# Don't Ask Bryan — MCP server installer.
# Run from the mcp_server/ directory. Idempotent: safe to re-run for upgrades.
#
# What this does:
#   1. Validates Python 3 is available
#   2. Creates / reuses a virtualenv at mcp_server/.venv
#   3. Installs Python deps (mcp, httpx)
#   4. Smoke-tests the imports
#   5. Generates a systemd unit file rendered for the current user
#   6. Installs the service, enables it, restarts it (sudo required)
#   7. Prints the Claude Desktop config snippet you'll paste on your Mac

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_USER="${SUDO_USER:-$(whoami)}"
SERVICE_NAME="dontaskbryan-mcp"
PORT="${DONTASKBRYAN_MCP_PORT:-8765}"

cd "$SCRIPT_DIR"

echo "================================================="
echo "  Don't Ask Bryan — MCP server installer"
echo "================================================="
echo "  Repo:    $REPO_DIR"
echo "  User:    $INSTALL_USER"
echo "  Port:    $PORT"
echo "  Service: $SERVICE_NAME"
echo

# 1. Python check
echo "[1/6] Checking Python..."
PY=$(command -v python3) || { echo "ERROR: python3 not found. Install with: sudo apt install python3 python3-venv"; exit 1; }
PY_VER=$("$PY" -c "import sys;print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "      Found $PY (Python $PY_VER)"

# 2. Virtualenv
echo "[2/6] Setting up virtualenv at $SCRIPT_DIR/.venv..."
if [ ! -d ".venv" ]; then
  "$PY" -m venv .venv
  echo "      Created"
else
  echo "      Already exists, reusing"
fi

# 3. Dependencies
echo "[3/6] Installing Python dependencies..."
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
echo "      mcp + httpx installed"

# 4. Smoke test
echo "[4/6] Smoke-testing imports..."
cd "$REPO_DIR"
"$SCRIPT_DIR/.venv/bin/python" -c "from mcp_server import server, weather, data_sources" \
  && echo "      Imports OK" \
  || { echo "ERROR: import failed (check above)"; exit 1; }
cd "$SCRIPT_DIR"

# 5. Render systemd unit (templated so paths/user are correct for THIS Pi)
echo "[5/6] Generating systemd unit for user '$INSTALL_USER'..."
SYSTEMD_FILE="/tmp/${SERVICE_NAME}.service"
cat > "$SYSTEMD_FILE" <<EOF
[Unit]
Description=Don't Ask Bryan — MCP weather server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$INSTALL_USER
WorkingDirectory=$REPO_DIR
Environment="DONTASKBRYAN_MCP_HOST=0.0.0.0"
Environment="DONTASKBRYAN_MCP_PORT=$PORT"
ExecStart=$SCRIPT_DIR/.venv/bin/python -m mcp_server.server
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
echo "      Wrote $SYSTEMD_FILE"

# 6. Install + enable + (re)start
echo "[6/6] Installing systemd service (sudo required)..."
sudo cp "$SYSTEMD_FILE" "/etc/systemd/system/${SERVICE_NAME}.service"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1
sudo systemctl restart "${SERVICE_NAME}"
sleep 2

if systemctl is-active --quiet "${SERVICE_NAME}"; then
  echo "      Service ACTIVE ✓"
else
  echo "      Service NOT ACTIVE — recent log:"
  journalctl -u "${SERVICE_NAME}" -n 20 --no-pager
  exit 1
fi

# 7. Print summary + Claude Desktop config snippet
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "<pi-ip>")
HOSTNAME_FQDN=$(hostname).local
echo
echo "================================================="
echo "  ✅  Install complete"
echo "================================================="
echo
echo "  Service is listening on port $PORT."
echo "  Reachable from your Mac at:"
echo "      http://${HOSTNAME_FQDN}:${PORT}/sse"
echo "      http://${LAN_IP}:${PORT}/sse"
echo
echo "  Claude Desktop config (add this on your Mac):"
echo "  ~/Library/Application Support/Claude/claude_desktop_config.json"
echo
echo "  {"
echo "    \"mcpServers\": {"
echo "      \"dontaskbryan-weather\": {"
echo "        \"url\": \"http://${HOSTNAME_FQDN}:${PORT}/sse\""
echo "      }"
echo "    }"
echo "  }"
echo
echo "  Then restart Claude Desktop and ask:"
echo "      'Use the dontaskbryan-weather server to give me a storm briefing.'"
echo
echo "  Useful commands:"
echo "      Tail logs:  journalctl -u ${SERVICE_NAME} -f"
echo "      Restart:    sudo systemctl restart ${SERVICE_NAME}"
echo "      Stop:       sudo systemctl stop ${SERVICE_NAME}"
echo "      Status:     systemctl status ${SERVICE_NAME}"
echo
