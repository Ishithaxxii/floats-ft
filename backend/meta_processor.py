import pandas as pd

def standardize_ship_name(ship):

    if pd.isna(ship):
        return "UNKNOWN"

    ship = str(ship).upper().strip()

    ship = " ".join(ship.split())

    # FORV SAGAR SAMPADA
    if (
        "SAGAR SAMPADA" in ship
        or "SAPMADA" in ship
    ):
        return "FORV SAGAR SAMPADA"

    # ORV SAGAR KANYA
    if "SAGAR KANYA" in ship:
        return "ORV SAGAR KANYA"

    return ship


# ==========================================
# MAIN PROCESSOR
# ==========================================

def process_metadata(df):

    # --------------------------------------
    # COLUMN NORMALIZATION
    # --------------------------------------

    COLUMN_MAP = {

        "Latitude_decimal": "Latitude",

        "Longitude_decimal": "Longitude",

        "Ship": "Ship",

        "Cruise": "Cruise",

        "Datetime": "Datetime",

        "Station Number": "Station",

        "Station Depth": "Depth",

        "FileName": "FileName"
    }

    df = df.rename(columns=COLUMN_MAP)

    # --------------------------------------
    # REQUIRED COLUMNS
    # --------------------------------------

    required_columns = [
        "Latitude",
        "Longitude"
    ]

    for col in required_columns:

        if col not in df.columns:
            raise Exception(f"Missing required column: {col}")

    # --------------------------------------
    # CLEAN COORDINATES
    # --------------------------------------

    df["Latitude"] = pd.to_numeric(
        df["Latitude"],
        errors="coerce"
    )

    df["Longitude"] = pd.to_numeric(
        df["Longitude"],
        errors="coerce"
    )

    # remove bad rows
    df = df.dropna(
        subset=["Latitude", "Longitude"]
    )

    # --------------------------------------
    # STANDARDIZE SHIP NAMES
    # --------------------------------------

    if "Ship" in df.columns:

        df["Ship"] = df["Ship"].apply(
            standardize_ship_name
        )

    # --------------------------------------
    # FILL MISSING VALUES
    # --------------------------------------

    fill_cols = [
        "Cruise",
        "Station",
        "Datetime",
        "Depth",
        "FileName"
    ]

    for col in fill_cols:

        if col not in df.columns:
            df[col] = "N/A"

        df[col] = df[col].fillna("N/A")

    return df