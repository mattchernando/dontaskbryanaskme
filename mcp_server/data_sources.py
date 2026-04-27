"""HTTP wrappers for Open-Meteo, NWS, and RainViewer with TTL caching.

All three APIs are free, public, and require no authentication. Caching is
in-process (single-server, single-process model) — fine for a personal Pi
deployment. Cache TTLs match the source's natural update cadence so we
don't hammer the upstream APIs when Claude asks rapid follow-up questions.
"""

from __future__ import annotations
import time
from typing import Any, Optional
import httpx

# Maryland Heights, MO (ZIP 63043) — same target point as the dashboard.
# Override these via environment variables if you want to repurpose the server
# for a different location (see README).
LAT = 38.7253
LON = -90.4485
ZIP_CODE = "63043"

METEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    f"?latitude={LAT}&longitude={LON}"
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature"
    ",wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure"
    ",precipitation,weather_code,cloud_cover,visibility,dew_point_2m"
    "&hourly=cape,lifted_index,convective_inhibition"
    ",wind_speed_10m,wind_direction_10m"
    ",wind_speed_80m,wind_direction_80m"
    ",wind_speed_180m,wind_direction_180m"
    ",precipitation_probability,weather_code,temperature_2m"
    "&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch"
    "&timezone=America%2FChicago&forecast_days=1"
)

NWS_URL = f"https://api.weather.gov/alerts/active?point={LAT},{LON}"
RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json"

# NWS asks all clients to identify themselves; we send a contact in the UA per their docs.
USER_AGENT = "DontAskBryan-MCP/1.0 (mathew.hernando@gmail.com)"


class TTLCache:
    """Tiny in-memory cache with per-key expiration. Process-local, no eviction limit."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        self._store[key] = (value, time.time() + ttl_seconds)

    def invalidate(self, key: str | None = None) -> None:
        if key is None:
            self._store.clear()
        else:
            self._store.pop(key, None)


_cache = TTLCache()
_client = httpx.AsyncClient(
    timeout=15.0,
    headers={"User-Agent": USER_AGENT, "Accept": "application/geo+json, application/json"},
)


async def _fetch_json(url: str, cache_key: str, ttl_seconds: float) -> Any:
    """Fetch JSON with TTL cache. Raises httpx.HTTPError on failure."""
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    resp = await _client.get(url)
    resp.raise_for_status()
    data = resp.json()
    _cache.set(cache_key, data, ttl_seconds)
    return data


async def get_meteo() -> dict:
    """Open-Meteo current conditions + 24-hour hourly forecast. 5-min cache."""
    return await _fetch_json(METEO_URL, "meteo", ttl_seconds=300)


async def get_nws_alerts() -> list[dict]:
    """Active NWS alerts for our point. 60-second cache (alerts move fast)."""
    data = await _fetch_json(NWS_URL, "nws", ttl_seconds=60)
    return data.get("features", []) or []


async def get_radar_metadata() -> dict:
    """RainViewer past + nowcast frame paths. 5-min cache."""
    return await _fetch_json(RAINVIEWER_URL, "radar", ttl_seconds=300)


async def force_refresh_all() -> None:
    """Drop all cache entries — next call to each source will re-fetch."""
    _cache.invalidate()


async def aclose() -> None:
    """Clean shutdown of the shared httpx client."""
    await _client.aclose()
