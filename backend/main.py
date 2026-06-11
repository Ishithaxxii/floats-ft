from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import os
import re
import sqlite3
import pandas as pd

from meta_processor import infer_ship_from_metadata


# ==========================================
# FASTAPI SETUP
# ==========================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# BASE DIRECTORY
# ==========================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

# ==========================================
# PATHS
# ==========================================

# Folder containing multiple CTD CSV files
CTD_DATA_FOLDER = os.environ.get(
    "SEASNAP_CTD_DATA_FOLDER",
    "/home/incois/PAJO/pplWorks/Ishita/Final QC/CTD"
)

CACHE_DIR = os.path.join(BASE_DIR, "cache")

CTD_CACHE_DB = os.environ.get(
    "SEASNAP_CTD_CACHE_DB",
    os.path.join(CACHE_DIR, "ctd_profiles.sqlite")
)

META_FOLDER = os.environ.get(
    "SEASNAP_META_FOLDER",
    "/home/incois/PAJO/pplWorks/Ishita/Final QC/CTD/Metadata/Filtered Metadata"
)

print(BASE_DIR)
print(PROJECT_ROOT)
print(DATA_DIR)
print(CTD_DATA_FOLDER)

CURRENT_META_DF = None
uploaded_stations = []

# ==========================================
# COLUMN MAPPINGS
# ==========================================

CTD_PROFILE_COLUMNS = {
    # Depth
    "Depth (m)":            "depSM",
    "depSM":                "depSM",

    # Temperature -> TEMP_QC_VAR
    "Temp-90 (deg C)":      "TEMP_QC_VAR",
    "t090C":                "TEMP_QC_VAR",
    "TEMP_QC_VAR":          "TEMP_QC_VAR",

    # Salinity -> SAL_QC_VAR
    "Sal00 (psu)":          "SAL_QC_VAR",
    "Sal00":                "SAL_QC_VAR",
    "SAL_QC_VAR":           "SAL_QC_VAR",

    # Conductivity
    "Conductivity (S/m)":   "c0S/m",
    "c0S/m":                "c0S/m",

    # Density
    "Sigma-t":              "sigma-t00",
    "sigma-t00":            "sigma-t00",

    # Dissolved oxygen
    "DO (ml/l)":            "sbeox0ML/L",
    "sbeox0ML/L":           "sbeox0ML/L",

    # Source tracking
    "SourceFile":           "SourceFile",
    "folderpath_filename":  "SourceFile",

    # QC flags
    "Temp_QC":              "Temp_QC",
    "Sal_QC":               "Sal_QC",
    "Pres_QC":              "Pres_QC",
    "ALL_TESTS_QC":         "ALL_TESTS_QC",
}

CTD_OUTPUT_COLUMNS = [
    "depSM",
    "TEMP_QC_VAR",
    "Temp_QC",
    "SAL_QC_VAR",
    "Sal_QC",
    "c0S/m",
    "sigma-t00",
    "sbeox0ML/L",
    "Pres_QC",
    "ALL_TESTS_QC",
]


# ==========================================
# CTD FOLDER RESOLUTION
# ==========================================

def resolve_ctd_data_folder():
    """Return the CTD data folder path, checking fallbacks."""
    candidates = [
        os.environ.get("SEASNAP_CTD_DATA_FOLDER"),
        CTD_DATA_FOLDER,
        os.path.join(DATA_DIR, "ctd"),
        os.path.join(PROJECT_ROOT, "ctd"),
    ]
    for candidate in candidates:
        if candidate and os.path.isdir(candidate):
            csv_files = [f for f in os.listdir(candidate) if f.endswith(".csv")]
            if csv_files:
                return candidate
    raise FileNotFoundError(
        "CTD data folder not found or contains no CSV files. "
        "Set SEASNAP_CTD_DATA_FOLDER to the folder path."
    )


def get_ctd_csv_files(folder):
    """Return sorted list of all CSV file paths in the folder."""
    return sorted(
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if f.endswith(".csv")
    )


def get_folder_fingerprint(folder):
    """
    Fingerprint the folder by the latest mtime across all CSVs.
    Used to detect when any file in the folder has changed.
    """
    files = get_ctd_csv_files(folder)
    if not files:
        return folder, 0.0
    latest_mtime = max(os.path.getmtime(f) for f in files)
    return folder, latest_mtime


# ==========================================
# CACHE HELPERS
# ==========================================

def cache_is_current(folder):
    if not os.path.isfile(CTD_CACHE_DB):
        return False

    _, latest_mtime = get_folder_fingerprint(folder)

    with sqlite3.connect(CTD_CACHE_DB) as conn:
        try:
            rows = dict(conn.execute("SELECT key, value FROM metadata").fetchall())
        except sqlite3.OperationalError:
            return False

    return (
        rows.get("source_path") == folder
        and float(rows.get("source_mtime", 0)) == latest_mtime
    )


def ensure_ctd_cache():
    folder = resolve_ctd_data_folder()

    if cache_is_current(folder):
        print(f"Using CTD cache: {CTD_CACHE_DB}")
        return folder

    csv_files = get_ctd_csv_files(folder)
    _, latest_mtime = get_folder_fingerprint(folder)

    os.makedirs(CACHE_DIR, exist_ok=True)
    print(f"Building CTD cache from {len(csv_files)} file(s) in: {folder}")

    usecols = list(CTD_PROFILE_COLUMNS.keys())

    with sqlite3.connect(CTD_CACHE_DB) as conn:
        conn.execute("DROP TABLE IF EXISTS profiles")
        conn.execute("DROP TABLE IF EXISTS metadata")
        conn.execute("""
            CREATE TABLE profiles (
                stem         TEXT NOT NULL,
                depSM        REAL,
                TEMP_QC_VAR  REAL,
                Temp_QC      INTEGER,
                SAL_QC_VAR   REAL,
                Sal_QC       INTEGER,
                "c0S/m"      REAL,
                "sigma-t00"  REAL,
                "sbeox0ML/L" REAL,
                Pres_QC      INTEGER,
                ALL_TESTS_QC INTEGER
            )
        """)
        conn.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

        total_rows = 0

        for csv_path in csv_files:
            print(f"  Processing: {os.path.basename(csv_path)}")
            file_rows = 0

            for chunk in pd.read_csv(
                csv_path,
                usecols=lambda col: col.strip() in usecols,
                chunksize=100_000,
                low_memory=False,
            ):
                chunk.columns = chunk.columns.str.strip()
                chunk = chunk.rename(columns=CTD_PROFILE_COLUMNS)

                # Drop duplicate column names from rename collisions
                # (e.g. both "Temp-90 (deg C)" and "TEMP_QC_VAR" present)
                # keep="last" preserves the actual QC-corrected column
                chunk = chunk.loc[:, ~chunk.columns.duplicated(keep="last")]

                if "SourceFile" not in chunk.columns:
                    raise ValueError(
                        f"No SourceFile column found in {csv_path}. "
                        "Expected 'SourceFile' or 'folderpath_filename'."
                    )

                chunk["stem"] = (
                    chunk["SourceFile"]
                    .astype(str)
                    .str.rsplit(".", n=1)
                    .str[0]
                    .str.strip()
                    .str.lower()
                )

                # reindex fills missing output columns with NaN as proper Series
                chunk = chunk.reindex(columns=["stem"] + CTD_OUTPUT_COLUMNS)

                for col in CTD_OUTPUT_COLUMNS:
                    chunk[col] = pd.to_numeric(chunk[col], errors="coerce")

                chunk = chunk.dropna(subset=["stem", "depSM"])
                chunk.to_sql("profiles", conn, if_exists="append", index=False)

                file_rows += len(chunk)
                total_rows += len(chunk)
                print(f"    {total_rows:,} total rows cached...", end="\r")

            print(f"  {os.path.basename(csv_path)}: {file_rows:,} rows")

        conn.execute("CREATE INDEX idx_profiles_stem ON profiles(stem)")
        conn.execute(
            "INSERT INTO metadata (key, value) VALUES (?, ?)",
            ("source_path", folder),
        )
        conn.execute(
            "INSERT INTO metadata (key, value) VALUES (?, ?)",
            ("source_mtime", str(latest_mtime)),
        )

    print(f"\nCTD cache ready: {total_rows:,} usable rows from {len(csv_files)} file(s)")
    return folder


# ==========================================
# API ENDPOINTS
# ==========================================

@app.get("/stations")
def get_stations():
    global uploaded_stations
    if not uploaded_stations:
        load_meta()
    return {"stations": uploaded_stations}


@app.post("/load-meta")
def load_meta():
    global uploaded_stations
    uploaded_stations = []

    meta_folder = next(
        (
            folder
            for folder in [
                META_FOLDER,
                os.path.join(PROJECT_ROOT, "meta"),
                os.path.join(BASE_DIR, "meta"),
            ]
            if os.path.isdir(folder)
        ),
        META_FOLDER,
    )

    csv_files = [
        os.path.join(meta_folder, f)
        for f in os.listdir(meta_folder)
        if f.endswith(".csv")
    ]

    if not csv_files:
        return {"error": "No CSV files found"}

    all_dfs = []
    for file in csv_files:
        try:
            df = pd.read_csv(file)
            all_dfs.append(df)
        except Exception as e:
            print("Failed:", file, e)

    if not all_dfs:
        return {"error": "No valid CSV files"}

    df = pd.concat(all_dfs, ignore_index=True)

    df = df.rename(columns={
        "Latitude(decimal)":  "Latitude_decimal",
        "Longitude(decimal)": "Longitude_decimal",
        "Depth":              "Station Depth",
        "Station":            "Station Number",
    })

    # Coalesce duplicate columns (keep first non-null value)
    coalesced_columns = {}
    for col in ["Latitude_decimal", "Longitude_decimal", "Station Depth", "Station Number"]:
        duplicate_cols = df.loc[:, df.columns == col]
        if duplicate_cols.shape[1] > 1:
            coalesced_columns[col] = duplicate_cols.bfill(axis=1).iloc[:, 0]

    if coalesced_columns:
        df = df.loc[:, ~df.columns.duplicated()]
        for col, values in coalesced_columns.items():
            df[col] = values

    # Clean and validate coordinates
    df["Latitude_decimal"] = pd.to_numeric(df["Latitude_decimal"], errors="coerce")
    df["Longitude_decimal"] = pd.to_numeric(df["Longitude_decimal"], errors="coerce")
    df = df.dropna(subset=["Latitude_decimal", "Longitude_decimal"])
    df = df[
        df["Latitude_decimal"].between(-90, 90) &
        df["Longitude_decimal"].between(-180, 180)
    ]

    print(f"Valid stations after cleaning: {len(df)}")

    for _, row in df.iterrows():
        try:
            source_raw = str(row.get("SourceFolder", "N/A"))
            source_clean = source_raw.replace(".csv", "").replace("combined_metadata_", "")

            raw_file = row.get("SourceFile", "")
            file_name = (
                str(raw_file)
                if pd.notna(raw_file) and str(raw_file).strip() != ""
                else "N/A"
            )

            uploaded_stations.append({
                "latitude":    float(row["Latitude_decimal"]),
                "longitude":   float(row["Longitude_decimal"]),
                "ship":        infer_ship_from_metadata(row),
                "cruise":      str(row.get("Cruise", "N/A")),
                "station":     str(row.get("Station Number", "N/A")),
                "datetime":    str(row.get("Datetime", "N/A")),
                "depth":       str(row.get("Station Depth", "N/A")),
                "source":      source_clean,
                "file_name":   file_name,
                "folder_path": file_name,
            })
        except Exception as e:
            print("Skipping row:", e)

    return {
        "count":       len(uploaded_stations),
        "message":     "Metadata loaded successfully",
        "meta_folder": meta_folder,
    }


@app.get("/profile/{station_file:path}")
def get_profile_data(station_file: str):
    ensure_ctd_cache()

    station_file = station_file.strip()
    stem = re.sub(r"_metadata\.csv$", "", station_file, flags=re.IGNORECASE)
    stem = stem.rsplit(".", 1)[0].strip().lower()

    query = """
        SELECT
            depSM,
            TEMP_QC_VAR,
            Temp_QC,
            SAL_QC_VAR,
            Sal_QC,
            "c0S/m",
            "sigma-t00",
            "sbeox0ML/L",
            Pres_QC,
            ALL_TESTS_QC
        FROM profiles
        WHERE stem = ?
        ORDER BY depSM
    """

    with sqlite3.connect(CTD_CACHE_DB) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(query, (stem,)).fetchall()

    if not rows:
        return {"error": f"No profile found for stem: {stem}"}

    return [
        {key: row[key] for key in CTD_OUTPUT_COLUMNS}
        for row in rows
    ]