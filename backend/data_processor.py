import pandas as pd
import re
import os

# ==========================================
# LOAD FILES
# ==========================================
t1 = pd.read_csv("/home/ishitha/Desktop/meta_csv/combined_metadata_cr205.csv")
t2 = pd.read_csv("/home/ishitha/Desktop/meta/ctd_data.csv")

# ==========================================
# EXTRACT KEY FROM T1
# "1153_metadata.csv"   → "1153"
# "1163micr_metadata.csv" → "1163micr"
# "1154PP_metadata.csv" → "1154PP"
# ==========================================
def extract_t1_key(sourcefile):
    # remove _metadata.csv suffix
    name = str(sourcefile).replace("_metadata.csv", "").strip()
    return name

t1["key"] = t1["SourceFile"].apply(extract_t1_key)

print("T1 keys sample:")
print(t1[["SourceFile", "key"]].head(10).to_string())

# ==========================================
# EXTRACT KEY FROM T2
# "1153.cnv"     → "1153"
# "1163micr.cnv" → "1163micr"
# "1154pp.cnv"   → "1154pp"
# ==========================================
def extract_t2_key(sourcefile):
    # remove .cnv extension
    name = str(sourcefile).rsplit(".", 1)[0].strip()
    return name

t2["key"] = t2["SourceFile"].apply(extract_t2_key)

print("\nT2 keys sample:")
print(t2[["SourceFile", "key"]].head(10).to_string())

# ==========================================
# CASE-INSENSITIVE MATCH
# T1 has "1154PP", T2 has "1154pp"
# ==========================================
t1["key_lower"] = t1["key"].str.lower()
t2["key_lower"] = t2["key"].str.lower()

common_keys = set(t1["key_lower"].dropna()) & set(t2["key_lower"].dropna())
print(f"\nCommon keys found: {len(common_keys)}")
print(sorted(common_keys))

# ==========================================
# EXTRACT MATCHING ROWS FROM T2
# ==========================================
T2_VARS = [
    "key_lower",
    "SourceFile",
    "Depth (m)",
    "Temp-90 (deg C)",
    "Sal00 (psu)",
    "Conductivity (S/m)",
    "DO (ml/l)",
    "Sigma-t",
    "Latitude(decimal)",
    "Longitude(decimal)",
    "Datetime",
    "Temp_QC",
    "Sal_QC",
    "ALL_TESTS_QC"
]

available_t2_vars = [c for c in T2_VARS if c in t2.columns]
matched_t2 = t2[t2["key_lower"].isin(common_keys)][available_t2_vars].copy()

print(f"\nMatched T2 rows: {len(matched_t2)}")

# ==========================================
# JOIN T1 METADATA ONTO MATCHED T2 ROWS
# ==========================================
T1_META_COLS = [
    "key_lower",
    "Ship",
    "Cruise",
    "Latitude_decimal",
    "Longitude_decimal",
    "Datetime",
    "Station Number",
    "Station Depth",
]

available_t1_cols = [c for c in T1_META_COLS if c in t1.columns]

merged = matched_t2.merge(
    t1[available_t1_cols].drop_duplicates(subset=["key_lower"]),
    on="key_lower",
    how="left",
    suffixes=("_ctd", "_meta")
)

print(f"Merged rows: {len(merged)}")
print(merged.head())

# ==========================================
# SAVE OUTPUT
# ==========================================
merged.drop(columns=["key_lower"], inplace=True)
merged.to_csv("matched_profiles.csv", index=False)
print("\nSaved to matched_profiles.csv")