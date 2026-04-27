"""Meteorological analysis — Python port of analyze() / analyzeForecast() / citiesInPath()
from the dashboard JavaScript. Same formulas, same threat tiers, same outputs.

Reference equations:
- STP (Significant Tornado Parameter): NSSL composite of CAPE, LI, deep-layer shear, SRH, CIN
- SRH (Storm-Relative Helicity): low-level shear² × sin(turning_angle), cyclonic-weighted
- Bunkers Right-Mover: mean wind ± 8 knots perpendicular to the mean shear vector
- EF-scale potential: stepped thresholds on CAPE × deep-layer shear

The threat tier ladder (LOW / ELEVATED / MODERATE / HIGH / EXTREME) and tornado
probability percentages match the dashboard exactly.
"""

from __future__ import annotations
import math
from datetime import datetime, timezone
from typing import Any, Optional

# Home point — same as the dashboard.
LAT = 38.7253
LON = -90.4485

# 71 cities within 200 miles of ZIP 63043 — same list as the JS dashboard.
# Only used for the storm-path projection. `noRadar` cities are excluded from
# the radar overlay in the dashboard but kept in path projections.
CITIES: list[dict[str, Any]] = [
    {"name": "Maryland Heights", "state": "MO", "lat": 38.7253, "lon": -90.4485, "pop": 27000, "home": True},
    {"name": "St. Louis", "state": "MO", "lat": 38.627, "lon": -90.197, "pop": 302000},
    {"name": "St. Charles", "state": "MO", "lat": 38.788, "lon": -90.496, "pop": 70000},
    {"name": "O'Fallon", "state": "MO", "lat": 38.811, "lon": -90.700, "pop": 91000},
    {"name": "Florissant", "state": "MO", "lat": 38.789, "lon": -90.322, "pop": 52000},
    {"name": "Chesterfield", "state": "MO", "lat": 38.663, "lon": -90.577, "pop": 47600},
    {"name": "Ballwin", "state": "MO", "lat": 38.595, "lon": -90.547, "pop": 30000},
    {"name": "Hazelwood", "state": "MO", "lat": 38.771, "lon": -90.371, "pop": 25000},
    {"name": "Bridgeton", "state": "MO", "lat": 38.751, "lon": -90.428, "pop": 11500},
    {"name": "Creve Coeur", "state": "MO", "lat": 38.669, "lon": -90.443, "pop": 18000},
    {"name": "Webster Groves", "state": "MO", "lat": 38.593, "lon": -90.356, "pop": 23000},
    {"name": "Clayton", "state": "MO", "lat": 38.644, "lon": -90.324, "pop": 15000},
    {"name": "Kirkwood", "state": "MO", "lat": 38.583, "lon": -90.406, "pop": 27000},
    {"name": "Fenton", "state": "MO", "lat": 38.513, "lon": -90.436, "pop": 21000},
    {"name": "Arnold", "state": "MO", "lat": 38.433, "lon": -90.373, "pop": 20000},
    {"name": "Festus", "state": "MO", "lat": 38.218, "lon": -90.398, "pop": 12000},
    {"name": "Lambert Intl Airport", "state": "MO", "lat": 38.748, "lon": -90.370, "pop": 0},
    {"name": "Columbia", "state": "MO", "lat": 38.951, "lon": -92.334, "pop": 123000},
    {"name": "Jefferson City", "state": "MO", "lat": 38.576, "lon": -92.174, "pop": 43000},
    {"name": "Rolla", "state": "MO", "lat": 37.951, "lon": -91.771, "pop": 20000},
    {"name": "Farmington", "state": "MO", "lat": 37.780, "lon": -90.421, "pop": 17000},
    {"name": "Cape Girardeau", "state": "MO", "lat": 37.306, "lon": -89.518, "pop": 40000},
    {"name": "Sikeston", "state": "MO", "lat": 36.876, "lon": -89.588, "pop": 16000},
    {"name": "Poplar Bluff", "state": "MO", "lat": 36.757, "lon": -90.393, "pop": 17000},
    {"name": "Sullivan", "state": "MO", "lat": 38.208, "lon": -91.157, "pop": 7500},
    {"name": "Hannibal", "state": "MO", "lat": 39.708, "lon": -91.357, "pop": 17000},
    {"name": "Sedalia", "state": "MO", "lat": 38.705, "lon": -93.228, "pop": 21000},
    {"name": "East St. Louis", "state": "IL", "lat": 38.624, "lon": -90.153, "pop": 27000},
    {"name": "Belleville", "state": "IL", "lat": 38.520, "lon": -89.984, "pop": 41000},
    {"name": "Edwardsville", "state": "IL", "lat": 38.811, "lon": -89.953, "pop": 25000},
    {"name": "Alton", "state": "IL", "lat": 38.891, "lon": -90.184, "pop": 27000},
    {"name": "Collinsville", "state": "IL", "lat": 38.670, "lon": -89.985, "pop": 26000},
    {"name": "O'Fallon IL", "state": "IL", "lat": 38.589, "lon": -89.912, "pop": 29000},
    {"name": "Granite City", "state": "IL", "lat": 38.702, "lon": -90.149, "pop": 29000},
    {"name": "Centralia", "state": "IL", "lat": 38.524, "lon": -89.133, "pop": 13000},
    {"name": "Mount Vernon", "state": "IL", "lat": 38.317, "lon": -88.903, "pop": 15000},
    {"name": "Carbondale", "state": "IL", "lat": 37.727, "lon": -89.216, "pop": 22000},
    {"name": "Marion", "state": "IL", "lat": 37.730, "lon": -88.933, "pop": 17000},
    {"name": "Harrisburg", "state": "IL", "lat": 37.738, "lon": -88.540, "pop": 9000},
    {"name": "Cairo", "state": "IL", "lat": 37.005, "lon": -89.177, "pop": 2000},
    {"name": "Effingham", "state": "IL", "lat": 39.120, "lon": -88.543, "pop": 12500},
    {"name": "Mattoon", "state": "IL", "lat": 39.481, "lon": -88.372, "pop": 18000},
    {"name": "Decatur", "state": "IL", "lat": 39.840, "lon": -88.956, "pop": 71000},
    {"name": "Springfield IL", "state": "IL", "lat": 39.801, "lon": -89.644, "pop": 116000},
    {"name": "Jacksonville", "state": "IL", "lat": 39.735, "lon": -90.229, "pop": 18000},
    {"name": "Quincy", "state": "IL", "lat": 39.936, "lon": -91.410, "pop": 40000},
    {"name": "Champaign", "state": "IL", "lat": 40.117, "lon": -88.244, "pop": 88000},
    {"name": "Danville", "state": "IL", "lat": 40.124, "lon": -87.630, "pop": 30000},
    {"name": "Bloomington", "state": "IL", "lat": 40.484, "lon": -88.994, "pop": 77000},
    {"name": "Peoria", "state": "IL", "lat": 40.694, "lon": -89.589, "pop": 113000},
    {"name": "Galesburg", "state": "IL", "lat": 40.948, "lon": -90.371, "pop": 30000},
    {"name": "Paducah", "state": "KY", "lat": 37.083, "lon": -88.600, "pop": 27000},
    {"name": "Murray", "state": "KY", "lat": 36.610, "lon": -88.315, "pop": 18000},
    {"name": "Mayfield", "state": "KY", "lat": 36.741, "lon": -88.637, "pop": 9000},
    {"name": "Owensboro", "state": "KY", "lat": 37.774, "lon": -87.113, "pop": 60000},
    {"name": "Bowling Green", "state": "KY", "lat": 36.990, "lon": -86.444, "pop": 72000},
    {"name": "Clarksville", "state": "TN", "lat": 36.532, "lon": -87.359, "pop": 166000},
    {"name": "Nashville", "state": "TN", "lat": 36.162, "lon": -86.781, "pop": 689000},
    {"name": "Evansville", "state": "IN", "lat": 37.975, "lon": -87.571, "pop": 117000},
    {"name": "Jonesboro", "state": "AR", "lat": 35.842, "lon": -90.704, "pop": 78000},
    {"name": "Blytheville", "state": "AR", "lat": 35.927, "lon": -89.919, "pop": 15000},
    {"name": "Paragould", "state": "AR", "lat": 36.058, "lon": -90.497, "pop": 27000},
    {"name": "Osceola", "state": "AR", "lat": 35.705, "lon": -89.969, "pop": 7500},
    {"name": "Keokuk", "state": "IA", "lat": 40.398, "lon": -91.385, "pop": 10000},
    {"name": "Burlington", "state": "IA", "lat": 40.808, "lon": -91.112, "pop": 25000},
]


# ── Vector math helpers ──────────────────────────────────────────────────────

def to_rad(deg: float) -> float:
    return math.radians(deg)


def wind_vec(speed: float, direction: float) -> tuple[float, float]:
    """Convert (speed, direction) → (u, v) components.
    Meteorological convention: direction is the bearing the wind comes FROM."""
    rad = to_rad(direction)
    return (-speed * math.sin(rad), -speed * math.cos(rad))


def vec_mag(u: float, v: float) -> float:
    return math.sqrt(u * u + v * v)


def vec_dir(u: float, v: float) -> float:
    """Compute bearing (degrees, 0-360) from (u, v)."""
    d = math.degrees(math.atan2(-u, -v))
    return d + 360 if d < 0 else d


_COMPASS_POINTS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]


def compass(d: Optional[float]) -> str:
    if d is None:
        return "--"
    return _COMPASS_POINTS[round(d / 22.5) % 16]


# ── Hour-index helpers ───────────────────────────────────────────────────────

def find_current_hour_idx(times: list[str]) -> int:
    """Return the index of the most recent forecast hour ≤ now.
    Open-Meteo returns ISO 8601 strings in the requested timezone (America/Chicago),
    without a tz suffix — so we compare against naive local time."""
    if not times:
        return 0
    now_local = datetime.now()  # naive local time
    idx = 0
    for i, t in enumerate(times):
        try:
            ts = datetime.fromisoformat(t)
            # Strip any tz info for comparison consistency with Open-Meteo's naive output.
            if ts.tzinfo is not None:
                ts = ts.astimezone().replace(tzinfo=None)
        except ValueError:
            continue
        if ts <= now_local:
            idx = i
        else:
            break
    return idx


def _safe_get(arr: Optional[list], i: int, default: float = 0.0) -> float:
    if not arr or i >= len(arr):
        return default
    val = arr[i]
    return val if val is not None else default


# ── Core analysis ────────────────────────────────────────────────────────────

def analyze(cur: dict, hrly: dict, idx: int, alerts: list) -> Optional[dict]:
    """Run the full tornado-threat analysis for a single forecast hour.
    Returns None if data is missing.

    Mirrors the JS analyze() function in the dashboard, line-for-line.
    """
    if not cur or not hrly or not hrly.get("time"):
        return None

    i = idx
    cape = max(0.0, float(_safe_get(hrly.get("cape"), i, 0)))
    li = float(_safe_get(hrly.get("lifted_index"), i, 0))
    cin = float(_safe_get(hrly.get("convective_inhibition"), i, 0))
    ws10 = float(_safe_get(hrly.get("wind_speed_10m"), i, cur.get("wind_speed_10m") or 0))
    wd10 = float(_safe_get(hrly.get("wind_direction_10m"), i, cur.get("wind_direction_10m") or 0))
    ws80 = float(_safe_get(hrly.get("wind_speed_80m"), i, 0))
    wd80 = float(_safe_get(hrly.get("wind_direction_80m"), i, 0))
    ws180 = float(_safe_get(hrly.get("wind_speed_180m"), i, 0))
    wd180 = float(_safe_get(hrly.get("wind_direction_180m"), i, 0))

    sfc_u, sfc_v = wind_vec(ws10, wd10)
    llj_u, llj_v = wind_vec(ws80, wd80)
    mid_u, mid_v = wind_vec(ws180, wd180)

    ll_shear = vec_mag(llj_u - sfc_u, llj_v - sfc_v)
    dl_shear = vec_mag(mid_u - sfc_u, mid_v - sfc_v)

    # Directional turning between surface and 80m — used as SRH proxy.
    dd = abs(wd80 - wd10)
    turn = 360 - dd if dd > 180 else dd
    cyclonic = (wd80 - wd10 + 360) % 360 < 180
    srh = ll_shear * ll_shear * math.sin(to_rad(min(turn, 90))) * 2.8 * (1 if cyclonic else 0.5)

    # STP composite
    stp = (
        min(cape / 1500.0, 2.0) *
        max(-li / 5.0, 0.0) *
        min(dl_shear / 35.0, 1.5) *
        (1 + max((srh - 25) / 100.0, 0) * 0.5) *
        (0.5 if cin < -100 else 0.7 if cin < -50 else 1.0)
    )

    has_tw = any("tornado warning" in (f.get("properties", {}).get("event") or "").lower() for f in alerts)
    has_twa = any("tornado watch" in (f.get("properties", {}).get("event") or "").lower() for f in alerts)
    has_sw = any("severe thunderstorm" in (f.get("properties", {}).get("event") or "").lower() for f in alerts)

    # An active warning escalates the score regardless of model values.
    su = max(stp, 4) if has_tw else max(stp, 2) if has_twa else stp

    # EF-scale potential ladder
    if cape > 4000 and dl_shear > 60:
        ef = "EF4-5"
    elif cape > 3000 and dl_shear > 50:
        ef = "EF3+"
    elif cape > 2000 and dl_shear > 40:
        ef = "EF2-3"
    elif cape > 1200 and dl_shear > 30:
        ef = "EF1-2"
    else:
        ef = "EF0-1"

    # Threat tier
    if su >= 3.5:
        level, color, action = "EXTREME", "#ff2200", "SEEK SHELTER NOW"
        prob = min(90, 55 + su * 5)
    elif su >= 1.5:
        level, color, action = "HIGH", "#ff7700", "PREPARE TO SHELTER"
        prob = min(55, 25 + su * 8)
    elif su >= 0.8:
        level, color, action = "MODERATE", "#ffcc00", "REMAIN ALERT"
        prob = min(25, 8 + su * 10)
    elif su >= 0.3:
        level, color, action = "ELEVATED", "#ffff33", "MONITOR CONDITIONS"
        prob = round(su * 15)
    else:
        level, color, action = "LOW", "#00dd66", "NO IMMEDIATE THREAT"
        prob = round(max(0, su * 5))

    # Bunkers Right-Mover storm motion
    mn_u = (sfc_u + mid_u) / 2
    mn_v = (sfc_v + mid_v) / 2
    mm = vec_mag(mn_u, mn_v) or 1.0
    rm_u = mn_u + (mn_v / mm) * 8
    rm_v = mn_v - (mn_u / mm) * 8
    st_spd = max(5, round(vec_mag(rm_u, rm_v)))
    st_dir = round((vec_dir(rm_u, rm_v) + 180) % 360)

    # Plain-English narrative
    if has_tw:
        note = "TORNADO WARNING ACTIVE. Take cover in lowest floor of sturdy building NOW."
    elif has_twa:
        note = (f"TORNADO WATCH. Conditions favorable. CAPE {round(cape)} J/kg, "
                f"shear {round(dl_shear)} mph. Be ready.")
    elif level == "EXTREME":
        note = (f"Dangerous setup. CAPE {round(cape)} J/kg, {round(dl_shear)} mph shear, "
                f"SRH ~{round(srh)}. {ef} potential. Motion {compass(st_dir)} @ {st_spd} mph.")
    elif level == "HIGH":
        note = (f"High risk. CAPE {round(cape)} J/kg, LI {li:.1f}, {round(dl_shear)} mph shear. "
                f"LL shear {round(ll_shear)} mph supports supercell. "
                f"Motion {compass(st_dir)} @ {st_spd} mph.")
    elif level == "MODERATE":
        note = (f"Moderate risk. CAPE {round(cape)} J/kg, {round(dl_shear)} mph shear. "
                f"Marginal tornado ingredients. Monitor NWS.")
    elif level == "ELEVATED":
        note = (f"Elevated but sub-severe. CAPE {round(cape)} J/kg, shear {round(dl_shear)} mph. "
                f"CIN {round(cin)} limiting storms. Stay weather-aware.")
    else:
        note = (f"Benign conditions. CAPE {round(cape)} J/kg, {round(dl_shear)} mph shear. "
                f"No organized convection expected.")

    return {
        "cape_jkg": round(cape, 1),
        "lifted_index": round(li, 2),
        "convective_inhibition_jkg": round(cin, 1),
        "stp_score": round(su, 3),
        "low_level_shear_mph": round(ll_shear, 1),
        "deep_layer_shear_mph": round(dl_shear, 1),
        "srh": round(srh, 1),
        "ef_potential": ef,
        "level": level,
        "color_hex": color,
        "recommended_action": action,
        "tornado_probability_pct": round(prob),
        "narrative": note,
        "storm_speed_mph": st_spd,
        "storm_direction_deg": st_dir,
        "storm_direction_compass": compass(st_dir),
        "has_tornado_warning": has_tw,
        "has_tornado_watch": has_twa,
        "has_severe_thunderstorm_warning": has_sw,
        "cyclonic_turning": cyclonic,
        "wind_profile": {
            "surface_10m":  {"speed_mph": round(ws10, 1),  "dir_deg": round(wd10),  "dir_compass": compass(wd10)},
            "low_level_jet_80m":  {"speed_mph": round(ws80, 1),  "dir_deg": round(wd80),  "dir_compass": compass(wd80)},
            "mid_level_180m": {"speed_mph": round(ws180, 1), "dir_deg": round(wd180), "dir_compass": compass(wd180)},
        },
    }


# ── Threat tiers + forecast-aware analysis ───────────────────────────────────

THREAT_TIER = {"LOW": 0, "ELEVATED": 1, "MODERATE": 2, "HIGH": 3, "EXTREME": 4}


def tier_of(level: str) -> int:
    return THREAT_TIER.get(level, 0)


def analyze_forecast(cur: dict, hrly: dict, alerts: list) -> Optional[dict]:
    """Run analyze() on every hour in the forecast and return current + peak.

    Mirrors the JS analyzeForecast(). Used for the PEAK TODAY section in the
    dashboard banner — so a 'LOW now / HIGH at 4pm' day surfaces the upcoming risk.
    """
    if not hrly or not hrly.get("time"):
        return None

    times = hrly["time"]
    h_idx = find_current_hour_idx(times)
    current = analyze(cur, hrly, h_idx, alerts)
    if not current:
        return None

    peak_idx = h_idx
    peak_score = current["stp_score"]
    for i in range(h_idx + 1, len(times)):
        fa = analyze(cur, hrly, i, alerts)
        if fa and fa["stp_score"] > peak_score:
            peak_score = fa["stp_score"]
            peak_idx = i

    out = {
        "current_hour_idx": h_idx,
        "current_hour_time": times[h_idx],
        "current": current,
        "peak": None,
        "peak_hour_idx": None,
        "peak_hour_time": None,
        "peak_meaningfully_higher": False,
    }

    if peak_idx != h_idx:
        peak = analyze(cur, hrly, peak_idx, alerts)
        out["peak"] = peak
        out["peak_hour_idx"] = peak_idx
        out["peak_hour_time"] = times[peak_idx]
        out["peak_meaningfully_higher"] = peak is not None and tier_of(peak["level"]) > tier_of(current["level"])

    return out


# ── Storm-path projection ────────────────────────────────────────────────────

def cities_in_path(analysis: dict) -> list[dict]:
    """Cities projected to be in the path of a developing supercell.
    Same algorithm as the dashboard's citiesInPath() — Bunkers RM motion vector,
    expanding cone from home point, classified into DIRECT / HIGH / POSSIBLE."""
    if not analysis or analysis.get("storm_speed_mph", 0) < 1:
        return []

    sr = to_rad(analysis["storm_direction_deg"])
    dx = math.sin(sr)
    dy = math.cos(sr)

    results = []
    for c in CITIES:
        if c.get("home"):
            continue
        d_lat = (c["lat"] - LAT) * 69
        d_lon = (c["lon"] - LON) * 53.5
        dist = math.sqrt(d_lat ** 2 + d_lon ** 2)
        if dist > 200:
            continue
        along = d_lat * dy + d_lon * dx
        if along < 0:
            continue
        cross = abs(d_lat * dx - d_lon * dy)
        # Cone half-width grows with distance, mimicking forecast uncertainty
        hw = 6 + (along / 200) * 22
        if cross > hw:
            continue
        pct = 1 - (cross / hw)
        risk = "DIRECT" if pct > 0.7 else "HIGH" if pct > 0.35 else "POSSIBLE"
        hours = along / analysis["storm_speed_mph"]
        results.append({
            "name": c["name"],
            "state": c["state"],
            "population": c["pop"],
            "distance_mi": round(dist),
            "along_track_mi": round(along),
            "cross_track_mi": round(cross),
            "hours_to_impact": round(hours, 2),
            "minutes_to_impact": round(hours * 60),
            "risk": risk,
        })

    results.sort(key=lambda x: x["along_track_mi"])
    return results


# ── NWS alert classification ─────────────────────────────────────────────────

def alert_color(p: dict) -> str:
    """NWS-severity-driven color for an alert (with tornado overrides)."""
    event = (p.get("event") or "").lower()
    if "tornado emergency" in event:
        return "#ff0000"
    if "tornado warning" in event:
        return "#ff2200"
    if "tornado watch" in event:
        return "#ff7700"
    sev = (p.get("severity") or "").lower()
    return {
        "extreme": "#ff2200",
        "severe": "#ff7700",
        "moderate": "#ffcc00",
        "minor": "#4488cc",
    }.get(sev, "#5a7a9a")


_SEV_RANK = {"extreme": 0, "severe": 1, "moderate": 2, "minor": 3}


def severity_rank(s: Optional[str]) -> int:
    return _SEV_RANK.get((s or "").lower(), 4)


def sort_alerts(alerts: list[dict]) -> list[dict]:
    """Sort alerts by severity, with tornado events floating to the top within tier."""
    def key(al: dict):
        p = al.get("properties", {}) or {}
        sev = severity_rank(p.get("severity"))
        is_tornado = "tornado" in (p.get("event") or "").lower()
        return (sev, 0 if is_tornado else 1)
    return sorted(alerts, key=key)
