import os
import pandas as pd
import re
import rasterio
from glob import glob
from collections import Counter, defaultdict

def make_unique(columns):
    counts = Counter()
    unique_cols = []
    for col in columns:
        counts[col] += 1
        if counts[col] > 1:
            unique_cols.append(f"{col}_{counts[col]}")
        else:
            unique_cols.append(col)
    return unique_cols
def extract_base_name(col):
    col_lower = col.lower()
    if col_lower.startswith("flag"):
        return "flag"

    return col.split(':')[0].strip()
def merge_duplicate_columns(data_df):
    from collections import defaultdict
    grouped = defaultdict(list)
    for col in data_df.columns:
        base = extract_base_name(col)
        grouped[base].append(col)
    for base, cols in grouped.items():
        if len(cols) > 1:
            data_df[base] = data_df[cols].mean(axis=1)
            data_df.drop(columns=cols, inplace=True)
        elif base not in data_df.columns:
            data_df[base] = data_df[cols[0]]
    return data_df
def clean_lat_long_pair(lat_raw, lon_raw):
    def extract_digits_and_dir(value):
        value = value.replace(',', '.').replace('v', '.')
        cleaned = re.sub(r'(?<=\d)[ .]+(?=\d)', '', value)
        cleaned = re.sub(r'[ .]', '', cleaned)
        match = re.match(r'^(\d+)([NSEWnsew]?)$', cleaned)
        if not match:
            raise ValueError(f"Invalid coordinate format: {value}")
        digits, direction = match.groups()
        direction = direction.upper() if direction else None
        return digits, direction
    lat_digits, lat_dir = extract_digits_and_dir(lat_raw)
    lon_digits, lon_dir = extract_digits_and_dir(lon_raw)
    if lat_dir not in ['N', 'S']:
        lat_dir = 'N'
    if lon_dir not in ['E', 'W']:
        lon_dir = 'E'
    if lat_dir in ['E', 'W'] and lon_dir in ['E', 'W']:
        print(" Latitude has direction like longitude — correcting to N")
        lat_dir = 'N'
    elif lat_dir in ['N', 'S'] and lon_dir in ['N', 'S']:
        print(" Longitude has direction like latitude — correcting to E")
        lon_dir = 'E'
    return lat_digits + lat_dir, lon_digits + lon_dir
def parse_latitude(lat_str):
        length = len(lat_str)
        meta = lat_str[-1].upper()
        digits = lat_str[:-1]
        deg = min = sec = 0
        if length == 2 + 1:
            if lat_str[0] == '0':
                deg = int(digits[:2])
            else:
                deg = int(digits[:2])
        elif length == 4 + 1:
            if lat_str[0] == '0':
                deg = int(digits[:2])
                min = int(digits[2:4])
                sec = 0
            else:
                deg = int(digits[:2])
                min = int(digits[2:4])
        elif length == 5 + 1:
            if digits[0] in ['0', '1', '2']:
                deg = int(digits[:2])
                min = int(digits[2:4])
                sec = int(digits[4:5])
            else:
                deg = int(digits[0])
                min = int(digits[1:3])
                sec = int(digits[3:5])
        elif length == 6 + 1:
            if digits[0] in ['0', '1', '2']:
                deg = int(digits[:2])
                min = int(digits[2:4])
                sec = int(digits[4:6])
            else:
                deg = int(digits[:1])
                min = int(digits[1:3])
                sec = int(digits[3:6])
        elif length == 7 + 1:
            if digits[0] in ['0', '1', '2']:
                deg = int(digits[:2])
                min = int(digits[2:4])
                sec = int(digits[4:7])
            else:
                deg = int(digits[:2])
                min = int(digits[2:4])
                sec = int(digits[4:7])
        else:
            raise ValueError("unsupported")
        if sec > 59:
            if sec <=599:
                sec = sec/10
            else:
                sec = sec/100
        decimal = deg + (min/60) + (sec/3600)
        if meta in ['S', 'W']:
            decimal *=-1
        return round(decimal, 4)
def parse_longitude(lon_str):
        length = len(lon_str)
        meta = lon_str[-1].upper()
        digits = lon_str[:-1]
        deg = min = sec = 0
        if length == 2 + 1:
            if lon_str[0] == '0':
                deg = int(digits[:2])
            else:
                deg = int(digits[:2])   
        elif length == 4 + 1:
            if lon_str[0] == '0':
                deg = int(digits[:3])
                min = int(digits[3:4])
            else:
                deg = int(digits[:2])
                min = int(digits[2:4])
        elif length == 5 + 1:
            if lon_str[0] == '0':
                deg = int(digits[:3])
                min = int(digits[3:5])
            else:
                deg = int(digits[:2])
                min = int(digits[2:4])
                sec = int(digits[4:5])
        elif length == 6 + 1:
            if lon_str[0] == '0':
                deg = int(digits[:3])
                min = int(digits[3:5])
                sec = int(digits[5:6])
            else:
                deg = int(digits[:2])
                min = int(digits[2:4])
                sec = int(digits[4:6])
        elif length == 7 + 1:
            if lon_str[0] == '0':
                deg = int(digits[:3])
                min = int(digits[3:5])
                sec = int(digits[5:7])
            else:
                deg = int(digits[:2])
                min = int(digits[2:4])
                sec = int(digits[4:7])
        elif length == 8 + 1:
            if lon_str[0] == '0':
                deg = int(digits[:3])
                min = int(digits[3:5])
                sec = int(digits[5:8])
            else:
                deg = int(digits[:2])
                min = int(digits[2:4])
                sec = int(digits[4:8])
        else:
            raise ValueError("unsupported")
        if sec > 59:
            if sec <=599:
                sec = sec/10
            else:
                sec = sec/100
        decimal = deg + (min/60) + (sec/3600)
        if meta in ['S', 'W']:
            decimal *=-1
        return round(decimal, 4)
def parse_cnv(file_path, relative_path):
    print(f"Parsing {file_path}")
    with open(file_path, 'r') as f:
        lines = f.readlines()
    metadata = {}
    parameters = []
    data_started = False
    data_lines = []
    lat_raw = None
    lon_raw = None
    for line in lines:
        line = line.strip()
        if line.startswith("*END*"):
            data_started = True
            continue
        if not data_started:
            if line.startswith("** Ship:") or line.startswith("** Vessel:"):
                parts = line.split(":", 1)
                metadata["Ship"] = parts[1].strip() if len(parts) > 1 and parts[1].strip() else "NAN"
            elif line.startswith("** Cruise:"):
                parts = line.split(":", 1)
                metadata["Cruise ID"] = parts[1].strip() if len(parts) > 1 and parts[1].strip() else "NAN"
            elif line.startswith("** Station:"):
                parts = line.split(":", 1)
                metadata["Station"] = parts[1].strip() if len(parts) > 1 and parts[1].strip() else "NA"
            elif line.startswith("** Latitude:") or line.startswith("** LAT:") or line.startswith("* NMEA Latitude"):
                lat_raw = line.split("=", 1)[1].strip() if "=" in line else line.split(":", 1)[1].strip()
            elif line.startswith("** Longitude:") or line.startswith("** LON:") or line.startswith("* NMEA Longitude"):
                lon_raw = line.split("=", 1)[1].strip() if "=" in line else line.split(":", 1)[1].strip()
            elif line.startswith("# start_time"):
                parts = line.split("=", 1)
                if len(parts) > 1:
                    metadata["Start Time"] = parts[1].strip()
            elif line.startswith("# name"):
                parts = line.split("=", 1)
                if len(parts) > 1:
                    parameters.append(parts[1].strip())
        elif line and not line.startswith("#"):
            data_lines.append(line)
    if lat_raw and lon_raw:
        try:
            lat_clean, lon_clean = clean_lat_long_pair(lat_raw, lon_raw)
            metadata["Latitude"] = parse_latitude(lat_clean)
            metadata["Longitude"] = parse_longitude(lon_clean)
            metadata["LAT"] = parse_latitude(lat_clean)
            metadata["LON"] = parse_longitude(lon_clean)
            metadata["NMEA Latitude"] = parse_latitude(lat_clean)
            metadata["NMEA Longitude"] = parse_longitude(lon_clean)
        except Exception as e:
            metadata["Latitude"] = "NA"
            metadata["Longitude"] = "NA"
            metadata["LAT"] = "NA"
            metadata["LON"] = "NA"
            metadata["NMEA Latitude"] = "NA"
            metadata["NMEA Longitude"] = "NA"
            print(f"Unsupported lat/lon in: {file_path}: {e}")
    if not parameters:
        raise ValueError(f"No parameters found in {file_path}")
    column_names = make_unique([param.split(':')[0].strip() for param in parameters])
    data = []
    for line in data_lines:
        try:
            values = list(map(float, line.split()) )
            data.append(values)
        except ValueError:
            continue  
    data_df = pd.DataFrame(data, columns=column_names)
    data_df = merge_duplicate_columns(data_df)
    column_groups = {
    "c0S/m": ["C0S/m", "c0mS/cm", "c0S/m"],  # ✅ keep it as c0S/m
    "Sal00": ["sal00"]
    }
    
    for unified_col, variants in column_groups.items():
        present = [col for col in data_df.columns if col in variants]
        if present:
            data_df[unified_col] = data_df[present].bfill(axis=1).iloc[:, 0]
            to_drop = [col for col in present if col != unified_col]
            data_df.drop(columns=to_drop, inplace=True)
    raw_names = [
    'prDM', 't090C', 'Sal00', 'sbeox0ML/L', 'depSM', 'svCM',
    'specc', 'xmiss', 'bat', 'scan', 'flECO-AFL', 'sbeox0PS',
    'par', 'density00', 'sigma-é00', 'flag', 'oxsatML/L',
    'c0S/m',          # ✅ added — was missing entirely
    'c0mS/cm',        # ✅ keep as fallback
    'potemp090C', 'potemp068C', 'sigma-t00'
    ]
    keep_columns = [col for col in data_df.columns if col in raw_names]
    clean_str = lambda s: str(s).replace(" ", "").replace(":","-") if s is not None else "NA"
    trace_id_parts = [
        clean_str(metadata.get("Cruise ID")),
        clean_str(metadata.get("Station")),
        clean_str(metadata.get("Latitude")),
        clean_str(metadata.get("Longitude")),
        clean_str(metadata.get("Start Time")),
        clean_str(relative_path),
    ]
    trace_id = "_".join(trace_id_parts)
    metadata["TraceID"] = trace_id
    data_df["TraceID"] = trace_id
    keep_columns.append("TraceID")
    data_df = data_df[keep_columns]
    keys = ["Ship", "Cruise ID", "Station", "Latitude", "Longitude", "Start Time"]
    meta_values = [metadata.get(k, None) for k in keys]
    meta_df = pd.DataFrame([meta_values], columns=keys)
    meta_df["Parameters"] = ", ".join(column_names)
    meta_df["TraceID"] = trace_id
    meta_df["folderpath_filename"] = relative_path
    data_df["folderpath_filename"] = relative_path
    meta_cols = meta_df.columns.tolist()
    data_cols = data_df.columns.tolist()
    meta_cols.insert(meta_cols.index("TraceID") + 1, meta_cols.pop(meta_cols.index("folderpath_filename")))
    data_cols.insert(data_cols.index("TraceID") + 1, data_cols.pop(data_cols.index("folderpath_filename")))
    meta_df = meta_df[meta_cols]
    data_df = data_df[data_cols]
    return meta_df, data_df
def preprocess_cnv_folder(folder_path, output_meta_csv='processed/stations.csv', output_data_csv='processed/ctd_data.csv'):
    all_metadata = []
    all_data = []
    all_files = []
    for dirpath, dirnames, filenames in os.walk(folder_path):
        cnv_files = [os.path.join(dirpath, f) for f in filenames if f.lower().endswith(".cnv")]
        all_files.extend(cnv_files)
    print(f"Found {len(all_files)} CNV files...")
    for file_path in all_files:
        print(f"Processing: {os.path.basename(file_path)}")
        try:
            relative_path = os.path.relpath(file_path, folder_path).replace("\\", "/")
            meta_df, df = parse_cnv(file_path, relative_path)
            all_metadata.append(meta_df.to_dict(orient='records')[0])
            all_data.append(df)
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
    if all_data:
        data_table = pd.concat(all_data, ignore_index=True)
        data_table.to_csv(output_data_csv, index=False, na_rep='NaN')
    if all_metadata:
        meta_table = pd.DataFrame(all_metadata)
        meta_table.to_csv(output_meta_csv, index=False, na_rep='NaN')
    print(f"\n Metadata saved to: {output_meta_csv}")
    print(f" Data table saved to: {output_data_csv}")

# ========== Run Main ==========
if __name__ == "__main__":
    folder = "/home/ishitha/Desktop/seasnap-final/backend/uploads" 
    output_meta_csv='processed/stations.csv'
    output_data_csv='processed/ctd_data.csv'
    
    preprocess_cnv_folder(folder, output_meta_csv, output_data_csv)

    print("\n Running QC on extracted data...")

    meta = pd.read_csv('processed/stations.csv')
    data = pd.read_csv('processed/ctd_data.csv')
    raster = rasterio.open("/home/ishitha/Desktop/seasnap-1.1/ETOPO1_Bed_g_geotiff.tif")
    bathymetry = raster.read(1)

    def is_at_sea(lat, lon):
        try:
            row, col = raster.index(lon, lat)
            return bathymetry[row, col] < 0
        except:
            return False
    # # === Profile Envelope QC Range for TEMP (GTSPP)
    TEMP_PROFILE_ENVELOPE = [
        {"min_depth": 0, "max_depth": 1100, "min_value": -2.0, "max_value": 40.0},
        {"min_depth": 1100, "max_depth": 3000, "min_value": -1.5, "max_value": 18.0},
    ]

    def get_profile_envelope(depth, envelope_table):
        for layer in envelope_table:
            if layer["min_depth"] <= depth < layer["max_depth"]:
                return layer["min_value"], layer["max_value"]
        return None, None
    def profile_envelope_qc(df, depth_col='depSM', param_col='t090C', envelope_table=TEMP_PROFILE_ENVELOPE):
        flags = []
        for _, row in df.iterrows():
            depth = row.get(depth_col)
            value = row.get(param_col)

            if pd.isna(depth) or pd.isna(value):
                flags.append(9) 
                continue

            min_val, max_val = get_profile_envelope(depth, envelope_table)
            if min_val is None:
                flags.append(9)  
            elif min_val <= value <= max_val:
                flags.append(1) 
            else:
                flags.append(4)  
        return pd.Series(flags, name=f'{param_col}_PROFILE_QC')

    # === QC 1: Valid datetime
    # meta['datetime'] = pd.to_datetime(meta['Date'] + " " + meta['Time'], errors='coerce')
    # meta['DATE_QC'] = pd.to_datetime(meta['Start Time'], errors='coerce').dt.year.gt(1997).map({True: 1, False: 4})

    # === QC 2: Valid position
    valid_lat = meta['Latitude'].between(-40, 30)
    valid_lon = meta['Longitude'].between(20, 160)
    meta['POS_QC'] = ((valid_lat & valid_lon)).map({True: 1, False: 4})

    # === QC 3: Location at Sea
    print(" Checking location at sea...")
    # meta['SEA_QC'] = meta.apply(lambda row: 1 if is_at_sea(row['Latitude'], row['Longitude']) else 4, axis=1)  # skipped: no ETOPO1 file
    meta['SEA_QC'] = 1  # assume all at sea

    # === Combine all three station-level QC tests
    meta_valid = meta[(meta['DATE_QC'] == 1) & (meta['POS_QC'] == 1) & (meta['SEA_QC'] == 1)]

    # === Filter data to only valid profiles
    valid_trace_ids = meta_valid['TraceID'].tolist()
    #data = data[data['TraceID'].isin(valid_trace_ids)]

    # === Gradient and Spike QC Functions
    def gradient_test(series, threshold):
        result = (series - (series.shift(-1) + series.shift(1)) / 2).abs() <= threshold
        return result.map({True: 1, False: 4})

    def spike_test(series, threshold):
        part1 = (series - (series.shift(-1) + series.shift(1)) / 2).abs()
        part2 = ((series.shift(-1) - series.shift(1)) / 2).abs()
        result = (part1 - part2) <= threshold
        return result.map({True: 1, False: 4})

    # === QC 4–6: Variable-level QC for TEMP and PSAL
    if 't090C' in data.columns:
        data['TEMP_QC'] = data['t090C'].between(-2, 40).map({True: 1, False: 4})
        data['TEMP_GRAD_QC'] = gradient_test(data['t090C'], 10.0)
        data['TEMP_SPIKE_QC'] = spike_test(data['t090C'], 2.0)

    if 'Sal00' in data.columns:
        data['PSAL_QC'] = data['Sal00'].between(0, 41).map({True: 1, False: 4})
        data['PSAL_GRAD_QC'] = gradient_test(data['Sal00'], 5.0)
        data['PSAL_SPIKE_QC'] = spike_test(data['Sal00'], 0.3)
    # === QC 7: Profile Envelope Test
    if 'depSM' in data.columns and 't090C' in data.columns:
        data['TEMP_PROFILE_QC'] = profile_envelope_qc(data, depth_col='depSM', param_col='t090C')


    meta.to_csv("meta1.csv", index=False,na_rep='NaN')
    data.to_csv("data1.csv", index=False,na_rep='NaN')

    print(" QC complete. Saved stations.csv and ctd_data.csv ")




    
    # try:
    #     meta_table = pd.read_csv(output_meta_csv)
    #     excel_path = r"C:\Users\aishwarya\Downloads\Lat_Long.xlsx"
    #     excel_df = pd.read_excel(excel_path)
    #     if 'TraceID' not in meta_table.columns:
    #         raise ValueError("TraceID column missing in meta_table")
    #     original_traceids = meta_table['TraceID'].copy()

    #     def extract_clean_station(value):
    #         filename = os.path.basename(value)          
    #         name = os.path.splitext(filename)[0]        
    #         name = name.replace("_", "")                
    #         return name.strip().upper()
         
    #     meta_table["clean_station"] = meta_table["folderpath_filename"].apply(extract_clean_station)\
    #         .str.replace(".cnv", "", case=False)\
    #         .str.strip().str.upper().str.replace(" ", "")
    #     excel_df["clean_station"] = excel_df["Stations"]\
    #         .str.replace(".hex", "", case=False)\
    #         .str.replace("_", "")\
    #         .str.strip().str.upper().str.replace(" ", "")
    #     merged = meta_table.merge(excel_df[["clean_station", "Lat", "Long"]],
    #                              on="clean_station", how="left", suffixes=('', '_excel'))
    #     merged["Latitude"] = merged["Latitude"].fillna(merged["Lat"])
    #     merged["Longitude"] = merged["Longitude"].fillna(merged["Long"])
    #     merged["Latitude"] = pd.to_numeric(merged["Latitude"], errors="coerce")
    #     merged["Longitude"] = pd.to_numeric(merged["Longitude"], errors="coerce")
    #     merged["Latitude"] = merged["Latitude"].map(lambda x: f"{x:.4f}" if pd.notna(x) else "NaN")
    #     merged["Longitude"] = merged["Longitude"].map(lambda x: f"{x:.4f}" if pd.notna(x) else "NaN")
    #     def clean_str(s):
    #         return str(s).replace(" ", "").replace(":", "-") if pd.notna(s) else "NA"

    #     merged["TraceID"] = merged.apply(lambda row: "_".join([
    #         clean_str(row.get("Cruise ID")),
    #         clean_str(row.get("Station")),
    #         clean_str(row.get("Latitude")),
    #         clean_str(row.get("Longitude")),
    #         clean_str(row.get("Start Time"))
    #     ]), axis=1)

    #     traceid_mapping = pd.DataFrame({
    #         'old_TraceID': original_traceids,
    #         'new_TraceID': merged['TraceID']
    #     }).drop_duplicates()

    #     merged.drop(columns=["clean_station", "Lat", "Long"], inplace=True)
    #     merged.to_csv(output_meta_csv, index=False, na_rep='NaN')
    #     print(f" Updated meta with Excel mapping + new TraceID → saved to: {output_meta_csv}")
    #     data_table = pd.read_csv(output_data_csv)
        
    #     if 'TraceID' not in data_table.columns:
    #         raise ValueError("TraceID column missing in data_table")

    #     data_table = data_table.merge(traceid_mapping, 
    #                                 left_on='TraceID', 
    #                                 right_on='old_TraceID', 
    #                                 how='left')
    #     data_table['TraceID'] = data_table['new_TraceID'].fillna(data_table['TraceID'])
    #     data_table.drop(columns=['old_TraceID', 'new_TraceID'], inplace=True)
        
    #     data_table.to_csv(output_data_csv, index=False, na_rep='NaN')
    #     print(f" Updated TraceIDs in datatable → saved to: {output_data_csv}")

    # except Exception as e:
    #     print(f" Failed to map Excel coordinates or update TraceID: {str(e)}")
    #     if 'meta_table' in locals():
    #         print("Meta table columns:", meta_table.columns.tolist())
    #     if 'merged' in locals():
    #         print("Merged table columns:", merged.columns.tolist())
#--------QC----------
