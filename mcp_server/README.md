# Don't Ask Bryan — MCP Server

A Model Context Protocol server that exposes the dashboard's tornado-threat
analysis as callable tools. Run it on a Raspberry Pi (or any Linux box on
your LAN), connect Claude Desktop to it, and ask Claude things like:

- *"What's the tornado threat in Maryland Heights today?"*
- *"Is there severe weather expected later?"*
- *"Which cities are in the storm path right now?"*
- *"Give me a morning weather briefing."*

Same data sources as the public dashboard (Open-Meteo, NOAA NWS, RainViewer
NEXRAD). Same meteorology (CAPE, deep-layer shear, SRH, STP, Bunkers RM,
EF-scale potential). No tokens, no API keys, no paid services.

---

## Tools exposed

| Tool | Purpose |
|---|---|
| `get_current_conditions` | Temperature, dew point, wind, pressure, etc. |
| `get_tornado_threat` | Threat tier NOW + PEAK forecast hour today, with full meteorological breakdown |
| `get_active_alerts` | NWS alerts sorted by severity (tornado, severe thunderstorm, flash flood, winter, heat, etc.) |
| `get_storm_path` | Cities in the projected supercell path with arrival times |
| `get_radar_status` | RainViewer LIVE + nowcast frame metadata + tile URLs |
| `get_storm_briefing` | One-shot comprehensive briefing (use this for "what's the weather situation") |
| `force_refresh` | Drop all caches (rarely needed) |

---

## Install on a Raspberry Pi

Tested on Raspberry Pi OS (Bookworm) with Python 3.11+.

### 1. Clone the repo on the Pi

```bash
cd ~
git clone git@github.com:mattchernando/dontaskbryanaskme.git
cd dontaskbryanaskme/mcp_server
```

### 2. Create a virtualenv and install dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Smoke-test it

```bash
# from the repo root, NOT from inside mcp_server/
cd ~/dontaskbryanaskme
mcp_server/.venv/bin/python -m mcp_server.server
```

You should see:

```
[dontaskbryan-mcp] Starting on http://0.0.0.0:8765 (SSE transport)
[dontaskbryan-mcp] Connect Claude Desktop with URL: http://<pi-host>:8765/sse
```

Hit `Ctrl+C` to stop.

### 4. Install as a systemd service (auto-start on boot)

The included `dontaskbryan-mcp.service` assumes:
- repo cloned to `/home/pi/dontaskbryanaskme`
- venv at `mcp_server/.venv`
- service runs as user `pi`

If your paths differ, edit the unit file before installing.

```bash
# from inside mcp_server/
sudo cp dontaskbryan-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dontaskbryan-mcp
sudo systemctl start dontaskbryan-mcp

# check it
sudo systemctl status dontaskbryan-mcp
journalctl -u dontaskbryan-mcp -f
```

### 5. Open the port on the Pi's firewall

```bash
sudo ufw allow 8765/tcp        # if you use ufw
# or for nftables / iptables, allow tcp/8765 from your LAN subnet
```

You can confirm it's reachable from your Mac:

```bash
curl http://<pi-host>:8765/sse  # should hang open with no errors
```

---

## Connect Claude Desktop

Edit your Claude Desktop config (on the Mac, not the Pi):

- **macOS path:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this entry under `mcpServers` (replace `<pi-host>` with your Pi's
hostname or LAN IP — e.g. `raspberrypi.local` or `192.168.1.42`):

```json
{
  "mcpServers": {
    "dontaskbryan-weather": {
      "url": "http://<pi-host>:8765/sse"
    }
  }
}
```

Restart Claude Desktop. Open a new chat and ask:

> Use the dontaskbryan-weather server to give me a storm briefing.

Claude should call `get_storm_briefing` and respond with a natural-language
summary. From then on, you can ask any weather question and Claude will pick
the right tool automatically.

---

## Configuration

Override defaults with environment variables (set them in the systemd unit
file or on the command line):

| Variable | Default | Purpose |
|---|---|---|
| `DONTASKBRYAN_MCP_HOST` | `0.0.0.0` | Bind address |
| `DONTASKBRYAN_MCP_PORT` | `8765` | TCP port |

Want to point the server at a different ZIP / location? Edit `LAT` / `LON` /
`ZIP_CODE` constants in `data_sources.py` and `LAT` / `LON` / the `CITIES`
list in `weather.py`. (A future version may make these env-configurable.)

---

## Architecture

```
                        ┌──────────────────────────┐
                        │   Claude Desktop (Mac)   │
                        └────────────┬─────────────┘
                                     │  SSE over LAN
                                     │  http://pi:8765/sse
                                     ▼
                        ┌──────────────────────────┐
                        │  FastMCP server (Pi)     │
                        │  ┌────────────────────┐  │
                        │  │  weather.py        │  │  ← analyze, analyzeForecast,
                        │  │  (analysis logic)  │  │     citiesInPath, alert sort
                        │  └────────────────────┘  │
                        │  ┌────────────────────┐  │
                        │  │  data_sources.py   │  │  ← TTL-cached HTTP wrappers
                        │  └────────────────────┘  │
                        └─────┬───────┬────────┬───┘
                              │       │        │
                       ┌──────▼┐  ┌───▼────┐ ┌─▼──────────┐
                       │Open-  │  │ NOAA   │ │RainViewer  │
                       │Meteo  │  │ NWS    │ │            │
                       └───────┘  └────────┘ └────────────┘
                          5min      1min        5min
                          cache     cache       cache
```

Cache TTLs are deliberately conservative — even if 10 family members ask
Claude back-to-back questions, only one fetch per 1-5 minutes hits each
upstream API.

---

## Troubleshooting

**`mcp_server.server: No module named 'mcp'`**
You ran the smoke test before activating the venv, or pip installed against
the system Python. Re-activate: `source mcp_server/.venv/bin/activate`.

**Claude Desktop says "server failed to start"**
- Confirm the URL has the `/sse` suffix
- Confirm port 8765 is reachable from the Mac (`curl http://<pi-host>:8765/sse`)
- Check the journal: `journalctl -u dontaskbryan-mcp -n 100`

**"No forecast data available from Open-Meteo right now"**
Open-Meteo is occasionally rate-limited or briefly down. The cache will
backfill on the next successful fetch. If it persists, hit `force_refresh`
and check `journalctl` for HTTP errors.

**Tornado threat says LOW but you know severe weather is coming**
The `current` tier reflects this hour only. Look at the `peak` field of
`get_tornado_threat` — that's the worst forecast hour today. The dashboard's
"PEAK TODAY" badge is built from the same data.
