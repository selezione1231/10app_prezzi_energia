import pandas as pd
import numpy as np
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"
EXPORT_DIR = BASE_DIR / "data" / "export"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

INPUT_PARQUET = PROCESSED_DIR / "gme_prezzi_zonali_2015_2026.parquet"

def export_all():
    if not INPUT_PARQUET.exists():
        raise FileNotFoundError(f"File non trovato: {INPUT_PARQUET}")

    print("=== ESPORTAZIONE DATASET PRODUCTION-READY PER FUTURE APP ===")
    df = pd.read_parquet(INPUT_PARQUET)

    # 1. Dataset WIDE (Formato Tabulare Largo)
    # Colonne: timestamp, data, ora, PUN, NORD, CNOR, CSUD, SUD, SICI, SARD, CALA, ROSN
    main_zones = ["PUN", "NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD", "CALA"]
    present_zones = [z for z in main_zones if z in df.columns]
    
    df_wide = df[present_zones].copy()
    df_wide.insert(0, "timestamp", df.index.strftime("%Y-%m-%d %H:%M:%S"))
    df_wide.insert(1, "data", df.index.strftime("%Y-%m-%d"))
    df_wide.insert(2, "ora", df.index.hour + 1)
    
    wide_csv = EXPORT_DIR / "prezzi_zonali_italia_wide.csv"
    wide_parquet = EXPORT_DIR / "prezzi_zonali_italia_wide.parquet"
    
    print(f"[EXPORT] Salvataggio WIDE CSV: {wide_csv} ...")
    df_wide.to_csv(wide_csv, index=False)
    print(f"[EXPORT] Salvataggio WIDE Parquet: {wide_parquet} ...")
    df_wide.to_parquet(wide_parquet, index=False)

    # 2. Dataset LONG / TIDY (Formato Relazionale Standard per Database e API)
    # Colonne: timestamp, data, ora, zona, prezzo_eur_mwh
    print("[PROCESSING] Conversione in formato relazionale (LONG/TIDY)...")
    df_long = pd.melt(
        df_wide,
        id_vars=["timestamp", "data", "ora"],
        value_vars=present_zones,
        var_name="zona",
        value_name="prezzo_eur_mwh"
    ).dropna(subset=["prezzo_eur_mwh"])

    df_long = df_long.sort_values(by=["timestamp", "zona"]).reset_index(drop=True)

    long_csv = EXPORT_DIR / "prezzi_zonali_italia_long.csv"
    long_parquet = EXPORT_DIR / "prezzi_zonali_italia_long.parquet"

    print(f"[EXPORT] Salvataggio LONG CSV: {long_csv} ...")
    df_long.to_csv(long_csv, index=False)
    print(f"[EXPORT] Salvataggio LONG Parquet: {long_parquet} ...")
    df_long.to_parquet(long_parquet, index=False)

    # 3. Database SQLite Indicizzato (.sqlite / .db)
    sqlite_path = EXPORT_DIR / "mercato_elettrico_zonale.sqlite"
    print(f"[SQLITE] Creazione database SQLite indicizzato: {sqlite_path} ...")
    
    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()

    # Crea tabella
    cur.execute("""
    CREATE TABLE IF NOT EXISTS prezzi_orari (
        timestamp TEXT NOT NULL,
        data TEXT NOT NULL,
        ora INTEGER NOT NULL,
        zona TEXT NOT NULL,
        prezzo_eur_mwh REAL NOT NULL,
        PRIMARY KEY (timestamp, zona)
    )
    """)

    # Inserisci dati
    df_long.to_sql("prezzi_orari", conn, if_exists="replace", index=False)

    # Indici per performance istantanea su query temporali o per zona
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prezzi_data ON prezzi_orari(data);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prezzi_zona ON prezzi_orari(zona);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prezzi_zona_data ON prezzi_orari(zona, data);")

    # Crea tabella aggregata giornaliera per query rapide della dashboard
    cur.execute("""
    CREATE TABLE IF NOT EXISTS medie_giornaliere AS
    SELECT 
        data,
        zona,
        COUNT(*) as ore_conteggiate,
        ROUND(AVG(prezzo_eur_mwh), 2) as prezzo_medio,
        ROUND(MIN(prezzo_eur_mwh), 2) as prezzo_min,
        ROUND(MAX(prezzo_eur_mwh), 2) as prezzo_max
    FROM prezzi_orari
    GROUP BY data, zona
    """)

    conn.commit()
    conn.close()

    print("\n" + "="*70)
    print("ESPORTAZIONE COMPLETATA CON SUCCESSO!")
    print(f"Directory di destinazione: {EXPORT_DIR}")
    print(f"1. Tabella Wide (Parquet): {wide_parquet.name} ({wide_parquet.stat().st_size / 1e6:.2f} MB)")
    print(f"2. Tabella Wide (CSV):     {wide_csv.name} ({wide_csv.stat().st_size / 1e6:.2f} MB)")
    print(f"3. Tabella Long (Parquet): {long_parquet.name} ({long_parquet.stat().st_size / 1e6:.2f} MB)")
    print(f"4. Tabella Long (CSV):     {long_csv.name} ({long_csv.stat().st_size / 1e6:.2f} MB) [{len(df_long):,} record]")
    print(f"5. Database SQLite:        {sqlite_path.name} ({sqlite_path.stat().st_size / 1e6:.2f} MB)")
    print("="*70)

if __name__ == "__main__":
    export_all()
