import zipfile
import io
import pandas as pd
import numpy as np
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "data" / "raw"
EXPORT_DIR = BASE_DIR / "data" / "export"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

def parse_15min_files():
    print("=== ELABORAZIONE DATASET UFFICIALE A 15 MINUTI (2025 - 2026) ===")
    dfs = []

    for year in [2025, 2026]:
        zip_p = RAW_DIR / f"Anno{year}.zip"
        if not zip_p.exists():
            print(f"[WARN] File zip non trovato: {zip_p}")
            continue

        print(f"[PARSING] Estrazione file 15 minuti per anno {year}...")
        with zipfile.ZipFile(zip_p, "r") as z:
            file_15 = [n for n in z.namelist() if "_15" in n][0]
            df = pd.read_excel(io.BytesIO(z.read(file_15)), sheet_name="Prezzi-Prices")

        # Pulisci intestazioni colonne
        cleaned_cols = []
        for c in df.columns:
            c_str = str(c).strip().replace("\n", " ").replace("\r", "")
            if "Data" in c_str or "Date" in c_str:
                cleaned_cols.append("Data")
            elif "Ora" in c_str or "Hour" in c_str:
                cleaned_cols.append("Ora")
            elif "Periodo" in c_str or "Period" in c_str:
                cleaned_cols.append("Periodo")
            elif "PUN" in c_str:
                cleaned_cols.append("PUN")
            else:
                cleaned_cols.append(c_str.upper())
        df.columns = cleaned_cols

        df = df.dropna(subset=["Data", "Periodo"]).copy()
        df["Data"] = df["Data"].astype(str).str.split(".").str[0].str.split(" ").str[0]
        df["Data"] = df["Data"].str.replace("-", "").str.replace("/", "")
        df["Data"] = df["Data"].apply(lambda x: f"{int(float(x)):08d}" if str(x).isdigit() else str(x))
        df["Periodo"] = pd.to_numeric(df["Periodo"], errors="coerce").fillna(1).astype(int)
        df["Ora"] = pd.to_numeric(df["Ora"], errors="coerce").fillna(1).astype(int)

        # Calcola timestamp a 15 minuti:
        # Periodo 1 -> 00:00:00, Periodo 2 -> 00:15:00, ..., Periodo 96 -> 23:45:00
        def make_timestamp_15(row):
            try:
                d_str = str(row["Data"])
                p = int(row["Periodo"])
                minutes = (p - 1) * 15
                return pd.to_datetime(d_str, format="%Y%m%d") + pd.Timedelta(minutes=minutes)
            except Exception:
                return pd.NaT

        df["timestamp"] = df.apply(make_timestamp_15, axis=1)
        df = df.dropna(subset=["timestamp"]).set_index("timestamp").sort_index()

        # Converti colonne prezzo
        price_cols = [c for c in df.columns if c not in ["Data", "Ora", "Periodo"]]
        for col in price_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        print(f"[OK] Anno {year}: {len(df):,} record a 15 minuti estratti.")
        dfs.append(df)

    if not dfs:
        raise RuntimeError("Nessun dato a 15 minuti estratto.")

    df_full_15 = pd.concat(dfs, axis=0)
    df_full_15 = df_full_15[~df_full_15.index.duplicated(keep="last")].sort_index()

    main_zones = ["PUN", "NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD", "CALA"]
    present_zones = [z for z in main_zones if z in df_full_15.columns]
    other_cols = [c for c in df_full_15.columns if c not in present_zones and c not in ["Data", "Ora", "Periodo"]]

    ordered_cols = ["Data", "Ora", "Periodo"] + present_zones + other_cols
    df_full_15 = df_full_15[[c for c in ordered_cols if c in df_full_15.columns]]

    # Salva in Parquet e CSV
    parquet_15 = EXPORT_DIR / "prezzi_zonali_15min_2025_2026.parquet"
    csv_15 = EXPORT_DIR / "prezzi_zonali_15min_2025_2026.csv"

    print(f"[EXPORT] Salvataggio 15-min Parquet: {parquet_15} ...")
    df_full_15.to_parquet(parquet_15)

    print(f"[EXPORT] Salvataggio 15-min CSV: {csv_15} ...")
    df_full_15.to_csv(csv_15)

    # Inserisci nel Database SQLite
    sqlite_path = EXPORT_DIR / "mercato_elettrico_zonale.sqlite"
    print(f"[SQLITE] Aggiornamento database SQLite con tabella 'prezzi_15min' ...")
    conn = sqlite3.connect(sqlite_path)
    
    # Formato Long per SQLite
    df_wide_reset = df_full_15.reset_index()
    df_wide_reset["timestamp"] = df_wide_reset["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")
    df_wide_reset["data"] = df_wide_reset["Data"]
    df_wide_reset["ora"] = df_wide_reset["Ora"]
    df_wide_reset["periodo_15min"] = df_wide_reset["Periodo"]

    df_long_15 = pd.melt(
        df_wide_reset,
        id_vars=["timestamp", "data", "ora", "periodo_15min"],
        value_vars=present_zones,
        var_name="zona",
        value_name="prezzo_eur_mwh"
    ).dropna(subset=["prezzo_eur_mwh"])

    df_long_15.to_sql("prezzi_15min", conn, if_exists="replace", index=False)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_prezzi_15_zona_data ON prezzi_15min(zona, data);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_prezzi_15_timestamp ON prezzi_15min(timestamp);")
    conn.commit()
    conn.close()

    print("\n" + "="*70)
    print("DATASET A 15 MINUTI CREATO CON SUCCESSO!")
    print(f"Intervallo: {df_full_15.index.min()} -> {df_full_15.index.max()}")
    print(f"Record totali a 15 minuti: {len(df_full_15):,} righe")
    print(f"File Parquet: {parquet_15.name} ({parquet_15.stat().st_size / 1e6:.2f} MB)")
    print(f"File CSV:     {csv_15.name} ({csv_15.stat().st_size / 1e6:.2f} MB)")
    print("="*70)

    return df_full_15

if __name__ == "__main__":
    parse_15min_files()
