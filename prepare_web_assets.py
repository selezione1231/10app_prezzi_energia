import pandas as pd
import numpy as np
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DATA_DIR = BASE_DIR / "public" / "data"
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

HOURLY_FILE = BASE_DIR / "data" / "processed" / "gme_prezzi_zonali_2015_2026.parquet"
FILE_15 = BASE_DIR / "data" / "export" / "prezzi_zonali_15min_2025_2026.parquet"

def export_web_data():
    print("=== PREPARAZIONE ASSET DATI PER APP WEB VERCEL ===")
    
    # 1. Carica prezzi orari
    df_h = pd.read_parquet(HOURLY_FILE)
    
    # Crea sommario giornaliero e orario per il calcolo FTV nel browser
    # Salva un formato compresso e leggero per gli ultimi 5-6 anni (2020-2026)
    df_recent = df_h.loc[df_h.index >= "2020-01-01"].copy()
    
    zones = ["NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD", "CALA"]
    
    # Riduci a colonne essenziali
    cols = [z for z in zones if z in df_recent.columns]
    
    # Crea matrice oraria compatta: timestamp in formato compatto YYYYMMDDHH
    compact_records = []
    for ts, row in df_recent[cols].iterrows():
        rec = {
            "t": ts.strftime("%Y%m%d%H"),
            "m": ts.month,
            "d": ts.day,
            "h": ts.hour + 1,
            "y": ts.year,
            "q": (ts.month - 1) // 3 + 1
        }
        for z in cols:
            val = row[z]
            rec[z] = round(float(val), 2) if pd.notnull(val) else None
        compact_records.append(rec)

    # Salva file JSON per l'engine del browser
    out_json = PUBLIC_DATA_DIR / "market_prices_recent.json"
    with open(out_json, "w") as f:
        json.dump(compact_records, f)
    print(f"[OK] Salvato {out_json.name} ({out_json.stat().st_size / 1e6:.2f} MB - {len(compact_records):,} ore)")

    # 2. Medie giornaliere per il Market Explorer
    df_daily = df_h[cols].resample("D").mean().round(2)
    daily_list = []
    for d, row in df_daily.iterrows():
        d_dict = {"date": d.strftime("%Y-%m-%d")}
        for z in cols:
            d_dict[z] = float(row[z]) if pd.notnull(row[z]) else None
        daily_list.append(d_dict)

    out_daily = PUBLIC_DATA_DIR / "market_prices_daily.json"
    with open(out_daily, "w") as f:
        json.dump(daily_list, f)
    print(f"[OK] Salvato {out_daily.name} ({out_daily.stat().st_size / 1e6:.2f} MB)")

    # 3. Profilo solare tipo (per demo o calcoli immediati)
    from src.pvgis_parser import generate_synthetic_pvgis_profile
    for zone in ["NORD", "CSUD", "SUD", "SICI"]:
        lat = 45.0 if zone == "NORD" else (41.9 if zone == "CSUD" else (41.0 if zone == "SUD" else 37.5))
        prof = generate_synthetic_pvgis_profile(latitude=lat, nominal_power_kw=1.0)
        prof_json = PUBLIC_DATA_DIR / f"default_solar_profile_{zone}.json"
        prof_records = prof.to_dict(orient="records")
        with open(prof_json, "w") as f:
            json.dump(prof_records, f)

    print("=== ASSET WEB COMPLETATI CON SUCCESSO ===")

if __name__ == "__main__":
    export_web_data()
