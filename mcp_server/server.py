"""Don't Ask Bryan — MCP server.

Exposes the weather-dashboard analysis as MCP tools so an MCP-aware client
(Claude Desktop, the Anthropic SDK, etc.) can query Maryland Heights, MO weather
in natural language. Same data sources, same meteorology as the public dashboard.

Transport: SSE (host on the Pi, connect from your Mac over LAN).
Run with:    python -m mcp_server.server
or:          uvicorn mcp_server.server:app  (if you wire FastMCP to ASGI)
"""

from __future__ import annotations
import os
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP

from . import data_sources as ds
from . import weather as wx


# ── Server setup ─────────────────────────────────────────────────────────────

PORT = int(os.environ.get("DONTASKBRYAN_MCP_PORT", "8765"))
HOST = os.environ.get("DONTASKBRYAN_MCP_HOST", "0.0.0.0")

mcp = FastMCP(
    name="dontaskbryan-weather",
    instructions=(
        "Tornado-focused weather intelligence for Maryland Heights, MO (ZIP 63043) "
        "and the surrounding 200-mile sector — covering eastern MO, southern IL, "
        "western KY, NW TN, NE AR, SW IN, and SE IA. "
        "Data sources: Open-Meteo (ECMWF + GFS), NOAA NWS active alerts, RainViewer NEXRAD radar. "
        "Use get_storm_briefing for an overall situation report. Use the more focused "
        "tools (get_tornado_threat, get_active_alerts, get_storm_path, etc.) when you "
        "only need part of the picture. All numeric values are in US units (°F, mph, inches)."
    ),
)
mcp.settings.host = HOST
mcp.settings.port = PORT


# ── Tool implementations ─────────────────────────────────────────────────────

@mcp.tool()
async def get_current_conditions() -> dict:
    """Current weather observations for Maryland Heights, MO (ZIP 63043).

    Returns temperature, dew point, humidity, wind speed/direction/gusts, surface
    pressure, recent precipitation, cloud cover, and visibility. Uses Open-Meteo
    blended observations (5-min cache).
    """
    meteo = await ds.get_meteo()
    cur = meteo.get("current", {}) or {}
    return {
        "location": {"zip": ds.ZIP_CODE, "city": "Maryland Heights, MO", "lat": ds.LAT, "lon": ds.LON},
        "observed_at": cur.get("time"),
        "temperature_f": cur.get("temperature_2m"),
        "feels_like_f": cur.get("apparent_temperature"),
        "dew_point_f": cur.get("dew_point_2m"),
        "relative_humidity_pct": cur.get("relative_humidity_2m"),
        "wind": {
            "speed_mph": cur.get("wind_speed_10m"),
            "gust_mph": cur.get("wind_gusts_10m"),
            "direction_deg": cur.get("wind_direction_10m"),
            "direction_compass": wx.compass(cur.get("wind_direction_10m")),
        },
        "surface_pressure_hpa": cur.get("surface_pressure"),
        "surface_pressure_inhg": (
            round(cur["surface_pressure"] / 33.8639, 2)
            if cur.get("surface_pressure") is not None else None
        ),
        "precipitation_in_last_hour": cur.get("precipitation"),
        "weather_code": cur.get("weather_code"),
        "cloud_cover_pct": cur.get("cloud_cover"),
        "visibility_meters": cur.get("visibility"),
    }


@mcp.tool()
async def get_tornado_threat() -> dict:
    """Get the tornado-threat analysis for RIGHT NOW plus the PEAK forecast hour today.

    Returns:
    - current: threat tier (LOW/ELEVATED/MODERATE/HIGH/EXTREME), CAPE, deep-layer
      shear, low-level shear, SRH, lifted index, CIN, EF-scale potential, projected
      storm motion (Bunkers Right-Mover), tornado probability, plain-English narrative.
    - peak: same fields for the worst-STP forecast hour, when meaningfully higher
      than current; null otherwise.
    - peak_meaningfully_higher: true when the peak hour is at a higher threat tier
      than the current hour (i.e. when the "PEAK TODAY" badge is shown on the dashboard).

    Use this when answering "is severe weather expected" or "what's the tornado risk".
    """
    meteo = await ds.get_meteo()
    alerts = await ds.get_nws_alerts()
    fc = wx.analyze_forecast(meteo.get("current", {}), meteo.get("hourly", {}), alerts)
    if fc is None:
        return {"error": "No forecast data available from Open-Meteo right now."}
    return fc


@mcp.tool()
async def get_active_alerts() -> dict:
    """Active NWS alerts for ZIP 63043, sorted by severity (most-severe first;
    tornado events float to the top within tier).

    Includes tornado warnings/watches, severe thunderstorm warnings, flash flood
    warnings, winter storm warnings, heat advisories — every alert NWS is
    actively issuing for the point. 60-second cache.
    """
    raw = await ds.get_nws_alerts()
    sorted_alerts = wx.sort_alerts(raw)

    by_severity: dict[str, int] = {}
    summarized = []
    for al in sorted_alerts:
        p = al.get("properties", {}) or {}
        sev = (p.get("severity") or "Unknown")
        by_severity[sev] = by_severity.get(sev, 0) + 1
        summarized.append({
            "event": p.get("event"),
            "severity": p.get("severity"),
            "urgency": p.get("urgency"),
            "certainty": p.get("certainty"),
            "headline": p.get("headline"),
            "description": p.get("description"),
            "instruction": p.get("instruction"),
            "area": p.get("areaDesc"),
            "sent": p.get("sent"),
            "effective": p.get("effective"),
            "expires": p.get("expires"),
            "color_hex": wx.alert_color(p),
        })

    return {
        "total_active": len(summarized),
        "counts_by_severity": by_severity,
        "alerts": summarized,
    }


@mcp.tool()
async def get_radar_status() -> dict:
    """Current radar frame metadata from RainViewer (free public NEXRAD composite).

    Returns the most recent observed frame ("LIVE") plus any nowcast frames
    (RainViewer's short-range forecast — usually 3 frames at 10-min intervals,
    out to +30 min, when there's active precipitation; empty otherwise).
    Each frame includes its tile-server URL pattern so the caller can fetch
    actual radar imagery if needed.
    """
    rv = await ds.get_radar_metadata()
    host = rv.get("host", "https://tilecache.rainviewer.com")
    past = rv.get("radar", {}).get("past") or []
    nowcast = rv.get("radar", {}).get("nowcast") or []

    frames = []
    if past:
        live = past[-1]
        frames.append({
            "label": "LIVE",
            "time_unix": live["time"],
            "offset_minutes_from_now": 0,
            "tile_url_template": f"{host}{live['path']}/256/{{z}}/{{x}}/{{y}}/6/0_0.png",
        })
    base_time = past[-1]["time"] if past else None
    for nc in nowcast:
        offset_min = round((nc["time"] - base_time) / 60) if base_time else None
        frames.append({
            "label": f"+{offset_min} MIN" if offset_min else "FORECAST",
            "time_unix": nc["time"],
            "offset_minutes_from_now": offset_min,
            "tile_url_template": f"{host}{nc['path']}/256/{{z}}/{{x}}/{{y}}/6/0_0.png",
        })

    return {
        "source": "RainViewer NEXRAD composite (color scheme 6 = NEXRAD Level III)",
        "tile_zoom_supported": "5–7 (server returns placeholder above z=7)",
        "live_available": bool(past),
        "nowcast_frame_count": len(nowcast),
        "max_forecast_offset_minutes": round((nowcast[-1]["time"] - base_time) / 60) if (nowcast and base_time) else 0,
        "frames": frames,
    }


@mcp.tool()
async def get_storm_path() -> dict:
    """Cities projected to be in the path of a developing supercell, given the
    current Bunkers Right-Mover storm motion.

    Returns a list of cities (within 200 mi of Maryland Heights) that fall
    inside the projected motion cone, classified as DIRECT / HIGH / POSSIBLE
    based on offset from the centerline. Each city includes population,
    distance, cross-track offset, and estimated arrival time in minutes.

    Returns an empty list when storm motion is too weak to project (no severe
    weather expected). Use this for "what cities are in the path?" questions.
    """
    meteo = await ds.get_meteo()
    alerts = await ds.get_nws_alerts()
    fc = wx.analyze_forecast(meteo.get("current", {}), meteo.get("hourly", {}), alerts)
    if not fc:
        return {"motion": None, "cities": []}
    current = fc["current"]
    cities = wx.cities_in_path(current)
    return {
        "motion": {
            "direction_deg": current["storm_direction_deg"],
            "direction_compass": current["storm_direction_compass"],
            "speed_mph": current["storm_speed_mph"],
            "method": "Bunkers Right-Mover",
        },
        "threat_level": current["level"],
        "cities_in_path_count": len(cities),
        "direct_hits": [c for c in cities if c["risk"] == "DIRECT"],
        "high_risk": [c for c in cities if c["risk"] == "HIGH"],
        "possible": [c for c in cities if c["risk"] == "POSSIBLE"],
    }


@mcp.tool()
async def get_storm_briefing() -> dict:
    """One-shot comprehensive storm briefing — bundles current conditions, the
    full tornado-threat analysis (now + peak today), active NWS alerts (sorted
    by severity), the projected supercell path with impacted cities, and radar
    status into a single payload.

    Use this for general questions like "what's the weather situation?",
    "give me a storm briefing", or "should I be worried today?".
    """
    meteo = await ds.get_meteo()
    alerts_raw = await ds.get_nws_alerts()
    rv = await ds.get_radar_metadata()

    cur = meteo.get("current", {}) or {}
    fc = wx.analyze_forecast(cur, meteo.get("hourly", {}), alerts_raw)

    sorted_alerts = wx.sort_alerts(alerts_raw)
    summarized_alerts = [{
        "event": (al.get("properties", {}) or {}).get("event"),
        "severity": (al.get("properties", {}) or {}).get("severity"),
        "urgency": (al.get("properties", {}) or {}).get("urgency"),
        "headline": (al.get("properties", {}) or {}).get("headline"),
        "expires": (al.get("properties", {}) or {}).get("expires"),
    } for al in sorted_alerts]

    cities = wx.cities_in_path(fc["current"]) if fc else []
    has_radar = bool((rv.get("radar", {}) or {}).get("past"))
    has_nowcast = bool((rv.get("radar", {}) or {}).get("nowcast"))

    return {
        "location": {"zip": ds.ZIP_CODE, "city": "Maryland Heights, MO", "lat": ds.LAT, "lon": ds.LON},
        "current_conditions": {
            "temperature_f": cur.get("temperature_2m"),
            "feels_like_f": cur.get("apparent_temperature"),
            "dew_point_f": cur.get("dew_point_2m"),
            "wind_mph": cur.get("wind_speed_10m"),
            "wind_gust_mph": cur.get("wind_gusts_10m"),
            "wind_compass": wx.compass(cur.get("wind_direction_10m")),
            "pressure_hpa": cur.get("surface_pressure"),
            "cloud_cover_pct": cur.get("cloud_cover"),
            "precipitation_in_last_hour": cur.get("precipitation"),
        },
        "threat_now":  fc["current"] if fc else None,
        "threat_peak_today": fc["peak"] if (fc and fc["peak"]) else None,
        "peak_hour_time": fc["peak_hour_time"] if fc else None,
        "peak_meaningfully_higher": fc["peak_meaningfully_higher"] if fc else False,
        "active_alerts_count": len(summarized_alerts),
        "active_alerts": summarized_alerts,
        "storm_path_cities": cities,
        "radar_live": has_radar,
        "radar_has_nowcast": has_nowcast,
    }


@mcp.tool()
async def force_refresh() -> dict:
    """Drop all cached data — the next tool call will hit Open-Meteo, NWS, and
    RainViewer fresh. Use only when you suspect cached data is stale (the cache
    TTLs are conservative, so this should rarely be needed)."""
    await ds.force_refresh_all()
    return {"status": "ok", "message": "All caches cleared. Next tool calls will fetch fresh data."}


# ── ASGI middleware: rewrite Host header to localhost ────────────────────────
# MCP v1.6+ added DNS-rebinding protection that returns HTTP 421 "Invalid Host
# header" when the request's Host header isn't on a hardcoded localhost
# allowlist. That breaks LAN deployments where Claude Desktop reaches the Pi
# at e.g. juniper.local:8765. We wrap the app and rewrite Host -> localhost
# *before* the protection check sees it. This is safe in our LAN-only,
# trusted-network deployment scenario; do NOT do this on a public-internet box.

class RewriteHostMiddleware:
    """Rewrites the HTTP Host header to 'localhost' for every request.

    Required because MCP's SSE transport blocks any non-localhost Host as a
    DNS-rebinding precaution, but our intended audience is a single Claude
    Desktop on the same LAN as the Pi.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            new_headers = []
            host_replaced = False
            for name, value in scope.get("headers", []):
                if name == b"host":
                    new_headers.append((b"host", b"localhost"))
                    host_replaced = True
                else:
                    new_headers.append((name, value))
            if not host_replaced:
                new_headers.append((b"host", b"localhost"))
            scope = {**scope, "headers": new_headers}
        await self.app(scope, receive, send)


# ── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    """Run the server with SSE transport over LAN.

    Bypasses FastMCP's mcp.run("sse") because:
    1. MCP's bundled SSE app has DNS-rebinding protection that rejects LAN Host
       headers (returns 421 "Invalid Host header"). We wrap it with a Host-
       rewriting middleware to bypass that.
    2. uvicorn's default httptools parser also has strict Host-header behavior
       in some versions — we use the h11 parser which is more permissive.
    """
    import asyncio
    import uvicorn

    # Build the SSE app and wrap it with the Host-rewriting middleware
    starlette_app = mcp.sse_app()
    app = RewriteHostMiddleware(starlette_app)

    print(f"[dontaskbryan-mcp] Starting on http://{HOST}:{PORT} (SSE transport)")
    print(f"[dontaskbryan-mcp] Connect Claude Desktop with URL: http://<pi-host>:{PORT}/sse")

    config = uvicorn.Config(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
        http="h11",
        forwarded_allow_ips="*",
        proxy_headers=True,
    )
    server = uvicorn.Server(config)
    asyncio.run(server.serve())


if __name__ == "__main__":
    main()
