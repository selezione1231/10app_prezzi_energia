import pandas as pd
import numpy as np
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"
DATA_PATH = PROCESSED_DIR / "gme_prezzi_zonali_2015_2026.parquet"

def analyze_dataset():
    if not DATA_PATH.exists():
        print(f"File non trovato: {DATA_PATH}")
        return

    df = pd.read_parquet(DATA_PATH)
    print("=" * 70)
    print("ANALISI ESPLORATIVA DATI STORICI PREZZI ZONALI ITALIA (2015-2026)")
    print("=" * 70)
    print(f"Righe totali: {len(df):,}")
    print(f"Data inizio:  {df.index.min()}")
    print(f"Data fine:    {df.index.max()}")
    print(f"Colonne totali: {len(df.columns)}")

    main_zones = ["PUN", "NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD", "CALA"]
    present_zones = [z for z in main_zones if z in df.columns]

    print("\n--- STATISTICHE DESCRITTIVE (€/MWh) ---")
    desc = df[present_zones].describe().T[["mean", "std", "min", "50%", "max"]]
    desc.columns = ["Media", "Dev.Std", "Minimo", "Mediana (P50)", "Massimo"]
    print(desc.round(2).to_string())

    print("\n--- PREZZI MEDI ANNUALI PER ZONA (€/MWh) ---")
    df_yearly = df[present_zones].resample("YE").mean()
    df_yearly.index = df_yearly.index.year
    print(df_yearly.round(2).to_string())

    print("\n--- FREQUENZA PREZZI <= 0 €/MWh (Totale ore per zona) ---")
    zero_or_neg = (df[present_zones] <= 0).sum()
    print(zero_or_neg.to_string())

    print("\n--- SPREAD MEDIO RISPETTO AL NORD (€/MWh) ---")
    spreads = pd.DataFrame()
    for z in [z for z in present_zones if z != "NORD" and z != "PUN"]:
        spreads[f"{z} - NORD"] = df[z] - df["NORD"]
    print(spreads.describe().T[["mean", "std", "min", "max"]].round(2).to_string())

    print("\n--- MATRICE DI CORRELAZIONE TRA ZONE ---")
    corr = df[present_zones].corr()
    print(corr.round(3).to_string())
    print("=" * 70)

if __name__ == "__main__":
    analyze_dataset()
