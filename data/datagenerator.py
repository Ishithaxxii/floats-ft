"""
CTD .cnv File Generator
Generates synthetic Sea-Bird SBE 9 CTD data files in the .cnv format.

Usage:
    python generate_ctd_cnv.py                  # generates 3 default stations
    python generate_ctd_cnv.py --help           # show all options

Dependencies: numpy (pip install numpy)
"""

import numpy as np
import argparse
import os
from datetime import datetime, timedelta
import random


# ---------------------------------------------------------------------------
# Physical profile generators
# ---------------------------------------------------------------------------

def generate_profiles(max_depth, n_scans, station_type="open_ocean"):
    """
    Generate realistic vertical profiles of temperature, salinity,
    conductivity, fluorescence, and oxygen as a function of depth.

    Parameters
    ----------
    max_depth   : float  – maximum cast depth in metres
    n_scans     : int    – number of data points
    station_type: str    – 'shallow', 'mid', or 'open_ocean'

    Returns
    -------
    dict of 1-D numpy arrays, one per variable
    """
    depth = np.linspace(0, max_depth, n_scans)
    # small jitter so consecutive scans differ slightly
    depth += np.random.uniform(-0.05, 0.05, n_scans)
    depth = np.clip(depth, -0.06, max_depth + 0.1)

    # ---- Temperature -------------------------------------------------------
    T_surf = np.random.uniform(27.5, 29.5)   # surface temperature (°C)
    T_deep = np.random.uniform(3.5, 8.0)     # deep temperature (°C)
    thermo_center = np.random.uniform(50, 150)
    thermo_width  = np.random.uniform(40, 80)
    temperature = T_deep + (T_surf - T_deep) / (1 + np.exp((depth - thermo_center) / thermo_width))
    temperature += np.random.normal(0, 0.02, n_scans)   # sensor noise

    # ---- Salinity ----------------------------------------------------------
    S_surf = np.random.uniform(33.5, 35.5)
    S_deep = np.random.uniform(34.5, 35.2)
    # halocline slightly below thermocline
    halo_center = thermo_center + np.random.uniform(10, 40)
    salinity = S_surf + (S_deep - S_surf) / (1 + np.exp(-(depth - halo_center) / 60))
    salinity += np.random.normal(0, 0.01, n_scans)

    # If shallow coastal: fresher surface layer
    if station_type == "shallow":
        salinity[:n_scans // 5] -= np.random.uniform(0.5, 2.0)
        salinity = np.clip(salinity, 2.0, 38.0)

    # ---- Conductivity  (approx. from T & S) --------------------------------
    # Simplified: C ≈ 0.08 * S * (1 + 0.02*(T - 15))
    conductivity = 0.08 * salinity * (1 + 0.02 * (temperature - 15))
    conductivity += np.random.normal(0, 0.001, n_scans)

    # ---- Pressure (≈ depth + small offset) ---------------------------------
    pressure = depth * 1.0073 + np.random.uniform(0.05, 0.20)

    # ---- Sound velocity (Chen-Millero approximation) -----------------------
    sv = (1449.2
          + 4.6 * temperature
          - 0.055 * temperature**2
          + 1.39 * (salinity - 35)
          + 0.017 * depth)
    sv += np.random.normal(0, 0.05, n_scans)

    # ---- Fluorescence ------------------------------------------------------
    # Subsurface chlorophyll maximum (SCM) typical of Bay of Bengal
    scm_depth  = np.random.uniform(30, 80)
    scm_width  = np.random.uniform(15, 30)
    scm_peak   = np.random.uniform(0.8, 1.5)
    fluorescence = scm_peak * np.exp(-((depth - scm_depth) / scm_width)**2)
    fluorescence += np.random.normal(0, 0.008, n_scans)
    # surface mixed layer gets a small background value
    fluorescence = np.clip(fluorescence, -0.02, 2.0)

    # ---- Dissolved Oxygen --------------------------------------------------
    oxy_surf = np.random.uniform(4.8, 5.5)
    if station_type == "open_ocean" and max_depth > 600:
        # oxygen minimum zone (OMZ) between ~300-800 m
        omz_min   = np.random.uniform(0.04, 0.15)
        omz_start = np.random.uniform(250, 400)
        omz_end   = np.random.uniform(600, 900)
        oxygen = np.where(
            depth < omz_start,
            oxy_surf * np.exp(-depth / 400),
            np.where(
                depth < omz_end,
                omz_min + np.random.uniform(0, 0.05, n_scans),
                omz_min + (oxy_surf * 0.6 - omz_min) * (depth - omz_end) / (max_depth - omz_end + 1)
            )
        )
    else:
        oxygen = oxy_surf * np.exp(-depth / np.random.uniform(500, 900))
    oxygen += np.random.normal(0, 0.01, n_scans)
    oxygen = np.clip(oxygen, 0.04, 6.9)

    # ---- Oxygen saturation -------------------------------------------------
    # Garcia & Gordon (1992) simplified
    ox_sat = (475.0 / (33.5 + temperature)) * np.exp(-0.0285 * salinity / temperature)
    ox_sat = np.clip(ox_sat, 4.4, 7.2)
    ox_sat += np.random.normal(0, 0.005, n_scans)

    return dict(
        depth=depth,
        pressure=pressure,
        conductivity=conductivity,
        temperature=temperature,
        salinity=salinity,
        sound_velocity=sv,
        fluorescence=fluorescence,
        oxygen=oxygen,
        ox_sat=ox_sat,
    )


# ---------------------------------------------------------------------------
# Metadata helpers
# ---------------------------------------------------------------------------

def fmt_lat(lat_dd):
    """Decimal degrees → CNV  011"59.34N  format"""
    hem = "N" if lat_dd >= 0 else "S"
    lat_dd = abs(lat_dd)
    deg = int(lat_dd)
    minutes = (lat_dd - deg) * 60
    return f'{deg:03d}"{minutes:05.2f}{hem}'


def fmt_lon(lon_dd):
    """Decimal degrees → CNV  089'30.88E  format"""
    hem = "E" if lon_dd >= 0 else "W"
    lon_dd = abs(lon_dd)
    deg = int(lon_dd)
    minutes = (lon_dd - deg) * 60
    return f"{deg:03d}'{minutes:05.2f}{hem}"


def compute_spans(profiles):
    """Return (min, max) for each variable."""
    keys = ["depth", "pressure", "conductivity", "temperature",
            "salinity", "sound_velocity", "fluorescence", "oxygen", "ox_sat"]
    return {k: (profiles[k].min(), profiles[k].max()) for k in keys}


# ---------------------------------------------------------------------------
# File writer
# ---------------------------------------------------------------------------

def write_cnv(filepath, station_cfg, profiles):
    """Write a complete .cnv file for one CTD cast."""
    cfg   = station_cfg
    p     = profiles
    spans = compute_spans(p)
    n     = len(p["depth"])

    start_dt = cfg["start_time"]
    conv_dt  = start_dt + timedelta(days=2)   # processing always 2 days later

    lines = []

    # ---- Header / metadata -------------------------------------------------
    base = os.path.basename(filepath).replace(".cnv", "")
    lines += [
        f"* Sea-Bird SBE 9 Data File:",
        f"* FileName = {cfg['data_path']}\\{base}.hdr",
        f"* Software Version Seasave V 7.18c",
        f"* Temperature SN = {cfg['temp_sn']}",
        f"* Conductivity SN = {cfg['cond_sn']}",
        f"* Number of Bytes Per Scan = 21",
        f"* Number of Voltage Words = 3",
        f"* Number of Scans Averaged by the Deck Unit = 1",
        f"** Time:{cfg['cast_time']:05.2f} ",
        f"** LAT: {fmt_lat(cfg['lat'])} ",
        f"** LON:{fmt_lon(cfg['lon'])} ",
        f"** Water Depth: {cfg['water_depth']}M ",
    ]

    # ---- # lines -----------------------------------------------------------
    lines += [
        f"# nquan = 10",
        f"# nvalues = {n}",
        f"# units = specified",
        f"# name 0 = depSM: Depth [salt water, m]",
        f"# name 1 = prDM: Pressure, Digiquartz [db]",
        f"# name 2 = c0S/m: Conductivity [S/m]",
        f"# name 3 = t090C: Temperature [ITS-90, deg C]",
        f"# name 4 = sal00: Salinity [PSU]",
        f"# name 5 = svCM: Sound Velocity [Chen-Millero, m/s]",
        f"# name 6 = flECO-AFL: Fluorescence, Wetlab ECO-AFL/FL [mg/m^3]",
        f"# name 7 = sbeox0ML/L: Oxygen, SBE 43 [ml/l]",
        f"# name 8 = oxsatML/L: Oxygen Saturation [ml/l]",
        f"# name 9 = flag:  0.000e+00",
        f"# span 0 = {spans['depth'][0]:12.3f},{spans['depth'][1]:12.3f}",
        f"# span 1 = {spans['pressure'][0]:12.3f},{spans['pressure'][1]:12.3f}",
        f"# span 2 = {spans['conductivity'][0]:12.6f},{spans['conductivity'][1]:12.6f}",
        f"# span 3 = {spans['temperature'][0]:12.4f},{spans['temperature'][1]:12.4f}",
        f"# span 4 = {spans['salinity'][0]:12.4f},{spans['salinity'][1]:12.4f}",
        f"# span 5 = {spans['sound_velocity'][0]:12.2f},{spans['sound_velocity'][1]:12.2f}",
        f"# span 6 = {spans['fluorescence'][0]:12.4f},{spans['fluorescence'][1]:12.4f}",
        f"# span 7 = {spans['oxygen'][0]:12.5f},{spans['oxygen'][1]:12.5f}",
        f"# span 8 = {spans['ox_sat'][0]:12.5f},{spans['ox_sat'][1]:12.5f}",
        f"# span 9 = 0.0000e+00, 0.0000e+00",
        f"# interval = seconds: 0.0416667",
        f"# start_time = {start_dt.strftime('%b %d %Y %H:%M:%S')}",
        f"# bad_flag = -9.990e-29",
        f"# sensor 0 = Frequency  0  temperature, {cfg['temp_sn']}, 03-Mar-09 ",
        f"# sensor 1 = Frequency  1  conductivity, {cfg['cond_sn']}, 01-Apr-09 , cpcor = -9.5700e-08",
        f"# sensor 2 = Frequency  2  pressure, 0934, 07-Apr-09 ",
        f"# sensor 3 = Extrnl Volt  0  Oxygen, SBE, primary, 1606, 08-Apr-09p",
        f"# sensor 4 = Extrnl Volt  2  WET Labs, ECO_AFL",
        f"# sensor 5 = Extrnl Volt  3  userpoly 0, FLNTURTD-1095, 10-Apr-09",
        f"# sensor 6 = Extrnl Volt  5  surface irradiance (SPAR), degrees = 0.0",
        f"# datcnv_date = {conv_dt.strftime('%b %d %Y %H:%M:%S')}, 7.18c",
        f"# datcnv_in = {cfg['data_path']}\\{base}.hex {cfg['data_path']}\\{base}.CON",
        f"# datcnv_skipover = 0",
        f"# datcnv_ox_hysteresis_correction = yes",
        f"# datcnv_ox_tau_correction = yes",
        f"# file_type = ascii",
        f"*END*",
    ]

    # ---- Data rows ---------------------------------------------------------
    for i in range(n):
        row = (
            f"{p['depth'][i]:12.3f}"
            f"{p['pressure'][i]:12.3f}"
            f"{p['conductivity'][i]:12.6f}"
            f"{p['temperature'][i]:12.4f}"
            f"{p['salinity'][i]:12.4f}"
            f"{p['sound_velocity'][i]:12.2f}"
            f"{p['fluorescence'][i]:12.4f}"
            f"{p['oxygen'][i]:12.5f}"
            f"{p['ox_sat'][i]:12.5f}"
            f"  0.000e+00"
        )
        lines.append(row)

    with open(filepath, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"  Written: {filepath}  ({n} scans, max depth {p['depth'].max():.1f} m)")


# ---------------------------------------------------------------------------
# Station presets
# ---------------------------------------------------------------------------

STATION_PRESETS = {
    "shallow": dict(
        water_depth=200,
        max_depth=200,
        n_scans=400,
        station_type="shallow",
    ),
    "mid": dict(
        water_depth=1000,
        max_depth=500,
        n_scans=1000,
        station_type="mid",
    ),
    "open_ocean": dict(
        water_depth=3105,
        max_depth=1000,
        n_scans=2000,
        station_type="open_ocean",
    ),
}


def make_station_cfg(station_id, preset_name, lat, lon, cast_time, start_time,
                     data_path, temp_sn, cond_sn):
    preset = STATION_PRESETS[preset_name]
    return dict(
        station_id=station_id,
        preset=preset_name,
        water_depth=preset["water_depth"],
        max_depth=preset["max_depth"],
        n_scans=preset["n_scans"],
        station_type=preset["station_type"],
        lat=lat,
        lon=lon,
        cast_time=cast_time,
        start_time=start_time,
        data_path=data_path,
        temp_sn=temp_sn,
        cond_sn=cond_sn,
    )


# ---------------------------------------------------------------------------
# CLI / main
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(
        description="Generate synthetic Sea-Bird SBE 9 CTD .cnv files."
    )
    p.add_argument("--n_stations", type=int, default=3,
                   help="Number of stations to generate (default: 3)")
    p.add_argument("--outdir", type=str, default=".",
                   help="Output directory (default: current directory)")
    p.add_argument("--prefix", type=str, default="CTD",
                   help="File name prefix, e.g. CTD → CTD_01.cnv (default: CTD)")
    p.add_argument("--preset", type=str, default=None,
                   choices=["shallow", "mid", "open_ocean"],
                   help="Force all stations to one depth preset. "
                        "Default: cycles through all three.")
    p.add_argument("--max_depth", type=float, default=None,
                   help="Override max cast depth in metres.")
    p.add_argument("--n_scans", type=int, default=None,
                   help="Override number of scan lines per file.")
    p.add_argument("--lat", type=float, default=None,
                   help="Station latitude (decimal degrees, N positive). "
                        "Default: random in Bay of Bengal.")
    p.add_argument("--lon", type=float, default=None,
                   help="Station longitude (decimal degrees, E positive). "
                        "Default: random in Bay of Bengal.")
    p.add_argument("--seed", type=int, default=None,
                   help="Random seed for reproducibility.")
    p.add_argument("--data_path", type=str,
                   default=r"E:\SK 277 SBE CTD\CTD_Return",
                   help="Data path written into the header.")
    p.add_argument("--temp_sn", type=str, default="5094",
                   help="Temperature sensor serial number.")
    p.add_argument("--cond_sn", type=str, default="3478",
                   help="Conductivity sensor serial number.")
    return p.parse_args()


def main():
    args = parse_args()

    if args.seed is not None:
        np.random.seed(args.seed)
        random.seed(args.seed)

    os.makedirs(args.outdir, exist_ok=True)

    preset_cycle = ["shallow", "mid", "open_ocean"]
    base_time = datetime(2010, 11, 13, 23, 3, 53)

    print(f"\nGenerating {args.n_stations} CTD .cnv file(s) in '{args.outdir}/' …\n")

    for i in range(1, args.n_stations + 1):
        preset_name = args.preset or preset_cycle[(i - 1) % len(preset_cycle)]
        preset      = STATION_PRESETS[preset_name].copy()

        # Allow CLI overrides
        if args.max_depth:
            preset["max_depth"] = args.max_depth
        if args.n_scans:
            preset["n_scans"] = args.n_scans

        # Station position: use CLI value or random in Bay of Bengal
        lat = args.lat if args.lat is not None else np.random.uniform(8.0, 20.0)
        lon = args.lon if args.lon is not None else np.random.uniform(82.0, 95.0)

        cast_time  = (base_time + timedelta(hours=(i - 1) * 3.5)).hour + \
                     (base_time + timedelta(hours=(i - 1) * 3.5)).minute / 60
        start_time = base_time + timedelta(hours=(i - 1) * 3.5)

        cfg = make_station_cfg(
            station_id=i,
            preset_name=preset_name,
            lat=lat,
            lon=lon,
            cast_time=cast_time,
            start_time=start_time,
            data_path=args.data_path,
            temp_sn=args.temp_sn,
            cond_sn=args.cond_sn,
        )
        cfg.update(preset)   # merge depth/scan settings

        profiles = generate_profiles(
            max_depth=cfg["max_depth"],
            n_scans=cfg["n_scans"],
            station_type=cfg["station_type"],
        )

        filename = f"{args.prefix}_{i:02d}.cnv"
        filepath = os.path.join(args.outdir, filename)
        write_cnv(filepath, cfg, profiles)

    print(f"\nDone. {args.n_stations} file(s) written to '{os.path.abspath(args.outdir)}'.\n")


if __name__ == "__main__":
    main()