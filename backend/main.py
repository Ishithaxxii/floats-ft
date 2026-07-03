from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import os
import re
import sqlite3
import pandas as pd

from meta_processor import infer_ship_from_metadata

from datetime import date
from typing import Optional

# ==========================================
# FASTAPI SETUP
# ==========================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# DIRECTORIES
# ==========================================

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATA_DIR    = os.path.join(PROJECT_ROOT, "data")
CACHE_DIR   = os.path.join(BASE_DIR, "cache")

CACHE_DB = os.environ.get(
    "SEASNAP_CACHE_DB",
    os.path.join(CACHE_DIR, "cache_profiles.sqlite"),
)

# ==========================================
# INSTRUMENT CONFIG
# ==========================================
# column_map  : raw CSV column -> canonical name
# output_columns : canonical columns stored in SQLite and returned by /profile

INSTRUMENT_CONFIG: dict[str, dict] = {
    "ctd": {
        "data_folder": os.environ.get(
            "SEASNAP_CTD_DATA_FOLDER",
            "/home/ishitha/CTD",
        ),
        "meta_folder": os.environ.get(
            "SEASNAP_CTD_META_FOLDER",
            "/home/ishitha/CTD/metadata",
        ),
        "table": "profiles_ctd",
        "column_map": {
            "Depth (m)":           "depSM",
            "depSM":               "depSM",
            "Temp-90 (deg C)":     "TEMP_QC_VAR",
            "t090C":               "TEMP_QC_VAR",
            "TEMP_QC_VAR":         "TEMP_QC_VAR",
            "Sal00 (psu)":         "SAL_QC_VAR",
            "Sal00":               "SAL_QC_VAR",
            "SAL_QC_VAR":          "SAL_QC_VAR",
            "Conductivity (S/m)":  "c0S/m",
            "c0S/m":               "c0S/m",
            "Sigma-t":             "sigma-t00",
            "sigma-t00":           "sigma-t00",
            "DO (ml/l)":           "sbeox0ML/L",
            "sbeox0ML/L":          "sbeox0ML/L",
            "SourceFile":          "SourceFile",
            "folderpath_filename": "SourceFile",
            "Temp_QC":             "Temp_QC",
            "Sal_QC":              "Sal_QC",
            "Pres_QC":             "Pres_QC",
            "ALL_TESTS_QC":        "ALL_TESTS_QC",
        },
        "output_columns": [
            "depSM", "TEMP_QC_VAR", "Temp_QC",
            "SAL_QC_VAR", "Sal_QC", "c0S/m",
            "sigma-t00", "sbeox0ML/L", "Pres_QC", "ALL_TESTS_QC",
        ],
    },

    "xbt": {
        "data_folder": os.environ.get(
            "SEASNAP_XBT_DATA_FOLDER",
            "/home/ishitha/XBT",
        ),
        "meta_folder": os.environ.get(
            "SEASNAP_XBT_META_FOLDER",
            "/home/ishitha/XBT/metadata",
        ),
        "table": "profiles_xbt",
        "column_map": {
            "Depth (m)":           "depSM",
            "Temperature (deg C)": "TEMP_QC_VAR",
            "TEMP_QC_VAR":         "TEMP_QC_VAR",
            "Temp_QC":             "Temp_QC",
            "Pres_QC":             "Pres_QC",
            "SourceFile":          "SourceFile",
            "ALL_TESTS_QC":        "ALL_TESTS_QC",
        },
        "output_columns": [
            "depSM", "TEMP_QC_VAR", "Temp_QC", "Pres_QC", "ALL_TESTS_QC",
        ],
    },

    "xctd": {
        "data_folder": os.environ.get(
            "SEASNAP_XCTD_DATA_FOLDER",
            "/home/ishitha/XCTD",
        ),
        "meta_folder": os.environ.get(
            "SEASNAP_XCTD_META_FOLDER",
            "/home/ishitha/XCTD/metadata",
        ),
        "table": "profiles_xctd",
        "column_map": {
            "Depth (m)":           "depSM",
            "Temperature (deg C)": "TEMP_QC_VAR",
            "TEMP_QC_VAR":         "TEMP_QC_VAR",
            "Salinity (psu)":      "SAL_QC_VAR",
            "SAL_QC_VAR":          "SAL_QC_VAR",
            "Temp_QC":             "Temp_QC",
            "Sal_QC":              "Sal_QC",
            "Pres_QC":             "Pres_QC",
            "SourceFile":          "SourceFile",
            "ALL_TESTS_QC":        "ALL_TESTS_QC",
        },
        "output_columns": [
            "depSM", "TEMP_QC_VAR", "Temp_QC",
            "SAL_QC_VAR", "Sal_QC", "Pres_QC", "ALL_TESTS_QC",
        ],
    },
}

# Full union of columns — /profile always returns this shape;
# columns not produced by a given instrument are filled with None.
ALL_OUTPUT_COLUMNS = [
    "depSM", "TEMP_QC_VAR", "Temp_QC",
    "SAL_QC_VAR", "Sal_QC", "c0S/m",
    "sigma-t00", "sbeox0ML/L", "Pres_QC", "ALL_TESTS_QC",
]

QC_COLUMNS = {"Temp_QC", "Sal_QC", "Pres_QC", "ALL_TESTS_QC"}

# In-memory station cache: instrument_type -> list[dict]
_station_cache: dict[str, list[dict]] = {}


# ==========================================
# FOLDER HELPERS
# ==========================================

def _csv_files(folder: str) -> list[str]:
    """Sorted list of .csv paths in folder."""
    return sorted(
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if f.endswith(".csv")
    )


def _resolve_folder(instrument_type: str) -> str:
    """Return a valid data folder for the instrument, or raise."""
    cfg = INSTRUMENT_CONFIG[instrument_type]
    candidates = [
        cfg["data_folder"],
        os.path.join(DATA_DIR, instrument_type),
        os.path.join(PROJECT_ROOT, instrument_type),
    ]
    for path in candidates:
        if path and os.path.isdir(path) and _csv_files(path):
            return path
    raise FileNotFoundError(
        f"{instrument_type.upper()} data folder not found or has no CSVs. "
        f"Set SEASNAP_{instrument_type.upper()}_DATA_FOLDER."
    )


def _folder_mtime(folder: str) -> float:
    """Latest mtime across all CSVs in folder."""
    files = _csv_files(folder)
    return max((os.path.getmtime(f) for f in files), default=0.0)


# ==========================================
# SQLITE CACHE HELPERS
# ==========================================

def _meta_key(instrument_type: str, key: str) -> str:
    return f"{instrument_type}:{key}"


def _cache_is_current(instrument_type: str, folder: str) -> bool:
    if not os.path.isfile(CACHE_DB):
        return False
    latest = _folder_mtime(folder)
    try:
        with sqlite3.connect(CACHE_DB) as conn:
            rows = dict(conn.execute("SELECT key, value FROM metadata").fetchall())
    except sqlite3.OperationalError:
        return False
    return (
        rows.get(_meta_key(instrument_type, "source_path")) == folder
        and float(rows.get(_meta_key(instrument_type, "source_mtime"), 0)) == latest
    )


def _build_cache(instrument_type: str, folder: str) -> None:
    cfg = INSTRUMENT_CONFIG[instrument_type]

    table        = cfg["table"]
    column_map   = cfg["column_map"]
    out_cols     = cfg["output_columns"]
    usecols_set  = set(column_map.keys())

    csv_files    = _csv_files(folder)
    latest_mtime = _folder_mtime(folder)

    os.makedirs(CACHE_DIR, exist_ok=True)

    print(
        f"[{instrument_type}] Building cache from "
        f"{len(csv_files)} file(s) in: {folder}"
    )

    col_defs = ", ".join(
        f'"{c}" {"INTEGER" if c in QC_COLUMNS else "REAL"}'
        for c in out_cols
    )

    with sqlite3.connect(CACHE_DB) as conn:

        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA temp_store=MEMORY")
        conn.execute("PRAGMA cache_size=-100000")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )

        conn.execute(f"DROP TABLE IF EXISTS {table}")

        conn.execute(
            f"""
            CREATE TABLE {table} (
                stem TEXT NOT NULL,
                {col_defs}
            )
            """
        )

        total_rows = 0

        for csv_path in csv_files:

            fname = os.path.basename(csv_path)

            print(f"[{instrument_type}] Reading {fname}")

            file_rows = 0

            for chunk in pd.read_csv(
                csv_path,
                usecols=lambda c: c.strip() in usecols_set,
                chunksize=200_000,      # increased from 100k
                low_memory=False,
            ):

                chunk.columns = chunk.columns.str.strip()

                chunk = chunk.rename(columns=column_map)

                chunk = chunk.loc[
                    :,
                    ~chunk.columns.duplicated(keep="last")
                ]

                if "SourceFile" not in chunk.columns:
                    raise ValueError(
                        f"No SourceFile column in {csv_path}"
                    )

                chunk["stem"] = (
                    chunk["SourceFile"]
                    .astype(str)
                    .str.rsplit(".", n=1)
                    .str[0]
                    .str.strip()
                    .str.lower()
                )

                chunk = chunk.reindex(
                    columns=["stem"] + out_cols
                )

                for col in out_cols:
                    chunk[col] = pd.to_numeric(
                        chunk[col],
                        errors="coerce"
                    )

                chunk = chunk.dropna(
                    subset=["stem", "depSM"]
                )

                rows = len(chunk)

                chunk.to_sql(
                    table,
                    conn,
                    if_exists="append",
                    index=False,
                    method="multi",
                    chunksize=5000,
                )

                file_rows += rows
                total_rows += rows

            print(
                f"  {fname}: "
                f"{file_rows:,} rows "
                f"(total {total_rows:,})"
            )

        print(
            f"[{instrument_type}] Creating stem index..."
        )

        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table}_stem_dep "
            f"ON {table}(stem, depSM)"
        )

        count = conn.execute(
            f"SELECT COUNT(*) FROM {table}"
        ).fetchone()[0]

        print(
            f"[{instrument_type}] "
            f"Table rows verified: {count:,}"
        )

        conn.execute(
            """
            INSERT OR REPLACE INTO metadata
            VALUES (?, ?)
            """,
            (
                _meta_key(
                    instrument_type,
                    "source_path"
                ),
                folder,
            ),
        )

        conn.execute(
            """
            INSERT OR REPLACE INTO metadata
            VALUES (?, ?)
            """,
            (
                _meta_key(
                    instrument_type,
                    "source_mtime"
                ),
                str(latest_mtime),
            ),
        )

    print(
        f"[{instrument_type}] "
        f"Cache ready: {total_rows:,} rows."
    )


def ensure_cache(instrument_type: str) -> str:

    folder = _resolve_folder(instrument_type)

    current = _cache_is_current(
        instrument_type,
        folder
    )

    print(
        f"[{instrument_type}] "
        f"Cache current = {current}"
    )

    if not current:
        _build_cache(
            instrument_type,
            folder
        )
    else:
        print(
            f"[{instrument_type}] "
            f"Cache is current."
        )

    return folder

# ==========================================
# METADATA LOADING
# ==========================================

_META_RENAME = {
    "Latitude(decimal)":   "Latitude_decimal",
    "Latitude (decimal)":  "Latitude_decimal",
    "Longitude(decimal)":  "Longitude_decimal",
    "Longitude (decimal)": "Longitude_decimal",
    "Depth":               "Station Depth",
    "Station":             "Station Number",
}

_COALESCE_COLS = ["Latitude_decimal", "Longitude_decimal", "Station Depth", "Station Number"]


def _resolve_meta_folder(instrument_type: str) -> str:
    cfg = INSTRUMENT_CONFIG[instrument_type]
    candidates = [
        cfg["meta_folder"],
        os.path.join(PROJECT_ROOT, "meta", instrument_type),
        os.path.join(BASE_DIR,     "meta", instrument_type),
    ]
    for path in candidates:
        if path and os.path.isdir(path):
            return path
    return cfg["meta_folder"]  # let caller handle missing


def _load_meta_df(instrument_type: str) -> tuple[pd.DataFrame, str, str | None]:
    """Load, clean and return the metadata DataFrame for one instrument."""
    meta_folder = _resolve_meta_folder(instrument_type)

    if not os.path.isdir(meta_folder):
        return pd.DataFrame(), meta_folder, "Meta folder not found"

    csv_files = [
        os.path.join(meta_folder, f)
        for f in os.listdir(meta_folder)
        if f.endswith(".csv")
    ]
    if not csv_files:
        return pd.DataFrame(), meta_folder, "No CSV files found"

    frames = []
    for path in csv_files:
        try:
            frames.append(pd.read_csv(path))
        except Exception as e:
            print(f"[{instrument_type}] Failed to read {path}: {e}")

    if not frames:
        return pd.DataFrame(), meta_folder, "No valid CSV files"

    df = pd.concat(frames, ignore_index=True).rename(columns=_META_RENAME)

    # Coalesce duplicate columns (e.g. two "Latitude_decimal" after rename)
    for col in _COALESCE_COLS:
        dupes = df.loc[:, df.columns == col]
        if dupes.shape[1] > 1:
            merged = dupes.bfill(axis=1).iloc[:, 0]
            df = df.loc[:, ~df.columns.duplicated()]
            df[col] = merged

    if "Latitude_decimal" not in df.columns or "Longitude_decimal" not in df.columns:
        return pd.DataFrame(), meta_folder, "Lat/Lon columns missing"

    df["Latitude_decimal"]  = pd.to_numeric(df["Latitude_decimal"],  errors="coerce")
    df["Longitude_decimal"] = pd.to_numeric(df["Longitude_decimal"], errors="coerce")
    df = df.dropna(subset=["Latitude_decimal", "Longitude_decimal"])
    df = df[
        df["Latitude_decimal"].between(-90, 90) &
        df["Longitude_decimal"].between(-180, 180)
    ]

    print(f"[{instrument_type}] Valid stations: {len(df)}")
    return df, meta_folder, None


def _df_to_stations(df: pd.DataFrame, instrument_type: str) -> list[dict]:
    stations = []
    for row in df.itertuples(index=False):
        try:
            raw_file  = getattr(row, "SourceFile", "")
            file_name = (
                str(raw_file)
                if pd.notna(raw_file) and str(raw_file).strip()
                else "N/A"
            )
            source_raw   = str(getattr(row, "SourceFolder", "N/A"))
            source_clean = source_raw.replace(".csv", "").replace("combined_metadata_", "")

            stations.append({
                "type":        instrument_type,
                "latitude":    float(row.Latitude_decimal),
                "longitude":   float(row.Longitude_decimal),
                "ship":        infer_ship_from_metadata(row._asdict()),
                "cruise":      str(getattr(row, "Cruise",          "N/A")),
                "station":     str(getattr(row, "Station Number",  "N/A")),
                "datetime":    str(getattr(row, "Datetime",        "N/A")),
                "depth":       str(getattr(row, "Station Depth",   "N/A")),
                "source":      source_clean,
                "file_name":   file_name,
                "folder_path": file_name,
            })
        except Exception as e:
            print(f"[{instrument_type}] Skipping row: {e}")
    return stations

class SpatialBox(BaseModel):
    latMin: float
    latMax: float
    lonMin: float
    lonMax: float
    dateFrom: Optional[str] = None   # "YYYY-MM-DD"
    dateTo:   Optional[str] = None   # "YYYY-MM-DD"
    
def _parse_date(raw: str | None):
    """Parse YYYY-MM-DD, DD-MM-YYYY, MM/DD/YYYY to a date object. Returns None on failure."""
    if not raw or raw == "N/A":
        return None
    import re
    # YYYY-MM-DD
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', raw)
    if m:
        try: return date(int(m[1]), int(m[2]), int(m[3]))
        except: return None
    # DD-MM-YYYY
    m = re.match(r'^(\d{2})-(\d{2})-(\d{4})', raw)
    if m:
        try: return date(int(m[3]), int(m[2]), int(m[1]))
        except: return None
    # MM/DD/YYYY
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})', raw)
    if m:
        try: return date(int(m[3]), int(m[1]), int(m[2]))
        except: return None
    return None


def _stations_in_box(box: SpatialBox) -> list[dict]:
    date_from = _parse_date(box.dateFrom)
    date_to   = _parse_date(box.dateTo)

    stations = []
    for instrument_type in ["ctd", "xbt", "xctd"]:
        for station in _station_cache.get(instrument_type, []):
            lat = float(station["latitude"])
            lon = float(station["longitude"])

            # Spatial check
            if not (box.latMin <= lat <= box.latMax and
                    box.lonMin <= lon <= box.lonMax):
                continue

            # Temporal check — skip station if its datetime is outside range
            if date_from or date_to:
                station_date = _parse_date(station.get("datetime", ""))
                if station_date:
                    if date_from and station_date < date_from:
                        continue
                    if date_to and station_date > date_to:
                        continue

            stations.append(station)

    return stations



# ==========================================
# API ENDPOINTS
# ==========================================

def _validate_type(instrument_type: str) -> None:
    if instrument_type not in INSTRUMENT_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown instrument type: '{instrument_type}'")

@app.post("/load-meta")
def load_meta(type: str = Query("ctd")):
    instrument_type = type.lower()
    _validate_type(instrument_type)

    df, meta_folder, error = _load_meta_df(instrument_type)
    if error:
        _station_cache[instrument_type] = []
        raise HTTPException(status_code=500, detail=error)

    stations = _df_to_stations(df, instrument_type)
    _station_cache[instrument_type] = stations

    return {
        "type":        instrument_type,
        "count":       len(stations),
        "message":     "Metadata loaded successfully",
        "meta_folder": meta_folder,
    }


@app.get("/stations")
def get_stations(type: str = Query("ctd")):
    instrument_type = type.lower()
    _validate_type(instrument_type)

    # Auto-load if not yet in cache
    if instrument_type not in _station_cache:
        load_meta(type=instrument_type)

    return {"stations": _station_cache.get(instrument_type, [])}

@app.get("/profile/{station_file:path}")
def get_profile(station_file: str, type: str = Query(None)):
    station_file = station_file.strip()
    stem = re.sub(r"_metadata\.csv$", "", station_file, flags=re.IGNORECASE)
    stem = stem.rsplit(".", 1)[0].strip().lower()

    # If type is explicitly given, search ONLY that table — no fallthrough.
    # Fallthrough across instrument types is what caused stem collisions
    # (e.g. 1107 present in both xbt and xctd tables).
    if type and type.lower() in INSTRUMENT_CONFIG:
        search_types = [type.lower()]
    else:
        # No type given: search all, but in a fixed priority order
        search_types = ["ctd", "xbt", "xctd"]

    for instrument_type in search_types:
        cfg      = INSTRUMENT_CONFIG[instrument_type]
        table    = cfg["table"]
        out_cols = cfg["output_columns"]

        folder = _resolve_folder(instrument_type)

        if not _cache_is_current(
            instrument_type,
            folder
        ):
            _build_cache(
                instrument_type,
                folder
            )

        col_list = ", ".join(f'"{c}"' for c in out_cols)
        query    = f'SELECT {col_list} FROM {table} WHERE stem = ? ORDER BY depSM'

        try:
            with sqlite3.connect(CACHE_DB) as conn:
                conn.execute("PRAGMA cache_size=-64000")   # 64MB page cache
                conn.execute("PRAGMA temp_store=MEMORY")
                conn.row_factory = sqlite3.Row
                rows = conn.execute(query, (stem,)).fetchall()
        except sqlite3.OperationalError:
            rows = []

        if rows:
            print(f"FOUND PROFILE: stem={stem} table={table} type={instrument_type}")
            out_col_set = set(out_cols)
            return [
                {
                    **{col: (row[col] if col in out_col_set else None) for col in ALL_OUTPUT_COLUMNS},
                    "instrument_type": instrument_type,
                }
                for row in rows
            ]

    # Only reach here if type was explicit and stem wasn't found in that table
    raise HTTPException(
        status_code=404,
        detail=f"No profile found for '{stem}' in instrument type '{type or 'any'}'"
    )

@app.post("/spatial-profile")
def get_spatial_profile(box: SpatialBox):

    selected_stations = _stations_in_box(box)

    if not selected_stations:
        return {
            "mode": "spatial",
            "station_count": 0,
            "row_count": 0,
            "data": [],
        }

    merged_rows = []
    counts = {"ctd": 0, "xbt": 0, "xctd": 0}

    with sqlite3.connect(CACHE_DB) as conn:
        conn.execute("PRAGMA cache_size=-64000")
        conn.execute("PRAGMA temp_store=MEMORY")
        conn.row_factory = sqlite3.Row

        for instrument_type in ["ctd", "xbt", "xctd"]:
            type_stations = [s for s in selected_stations if s["type"] == instrument_type]
            if not type_stations:
                continue

            cfg      = INSTRUMENT_CONFIG[instrument_type]
            table    = cfg["table"]
            out_cols = cfg["output_columns"]
            out_col_set = set(out_cols)

            stems = [
                s["file_name"].strip().rsplit(".", 1)[0].lower()
                for s in type_stations
            ]

            placeholders = ",".join("?" * len(stems))
            col_list     = ", ".join(f'"{c}"' for c in out_cols)
            query = (
                f'SELECT stem, {col_list} FROM {table} '
                f'WHERE stem IN ({placeholders}) '
                f'ORDER BY stem, depSM'
            )

            rows = conn.execute(query, stems).fetchall()
            counts[instrument_type] = len(set(r["stem"] for r in rows))

            for row in rows:
                merged_rows.append({
                    **{col: (row[col] if col in out_col_set else None)
                       for col in ALL_OUTPUT_COLUMNS},
                    "instrument_type": instrument_type,
                    "station_file":    row["stem"],
                })

    return {
        "mode": "spatial",
        "station_count": len(selected_stations),
        "ctd_count": counts["ctd"],
        "xbt_count": counts["xbt"],
        "xctd_count": counts["xctd"],
        "row_count": len(merged_rows),
        "data": merged_rows,
    }

# @app.on_event("startup")
# async def startup():
#     import threading
#     import asyncio

#     def _warm():
#         # Checkpoint WAL first so reads are fast
#         if os.path.isfile(CACHE_DB):
#             with sqlite3.connect(CACHE_DB) as conn:
#                 conn.execute("PRAGMA wal_checkpoint(PASSIVE)")

#         for t in ["ctd", "xbt", "xctd"]:
#             try:
#                 ensure_cache(t)
#                 load_meta(type=t)
#                 print(f"[startup] {t} warmed up")
#             except Exception as e:
#                 print(f"[startup] {t} failed: {e}")

#     threading.Thread(target=_warm, daemon=True).start()
