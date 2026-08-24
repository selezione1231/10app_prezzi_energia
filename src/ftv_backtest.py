import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, Any, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"
DATA_PATH = PROCESSED_DIR / "gme_prezzi_zonali_2015_2026.parquet"

def run_ftv_backtest(
    pvgis_profile: pd.DataFrame,
    power_kw: float = 1000.0,
    zone: str = "NORD",
    start_date: str = "2020-01-01",
    end_date: str = "2026-07-31",
    price_floor_eur: float = 0.0,
    plant_name: str = "Impianto Fotovoltaico"
) -> Dict[str, Any]:
    """
    Esegue il backtest economico orario dell'impianto FTV confrontando
    la produzione solare oraria con i prezzi zonali storici del GME.
    """
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset prezzi non trovato: {DATA_PATH}")

    df_prices = pd.read_parquet(DATA_PATH)
    if zone not in df_prices.columns:
        raise ValueError(f"Zona {zone} non disponibile. Zone presenti: {df_prices.columns.tolist()}")

    # Filtra il periodo storico richiesto
    mask_time = (df_prices.index >= pd.to_datetime(start_date)) & (df_prices.index <= pd.to_datetime(end_date) + pd.Timedelta(days=1))
    df_eval = df_prices.loc[mask_time, [zone]].copy()
    df_eval.columns = ["prezzo_zonale_eur_mwh"]

    if df_eval.empty:
        raise ValueError(f"Nessun dato di prezzo trovato per l'intervallo {start_date} - {end_date}")

    # Creazione colonne per il matching con il profilo solare
    df_eval["mese"] = df_eval.index.month
    df_eval["giorno"] = df_eval.index.day
    df_eval["ora"] = df_eval.index.hour + 1
    df_eval["anno"] = df_eval.index.year
    df_eval["quarter"] = "Q" + df_eval.index.quarter.astype(str)

    # Se il profilo PVGIS contiene già anni specifici, fai merge temporale esatto, altrimenti mappa per mese-giorno-ora
    pvgis_df = pvgis_profile.copy()
    
    # Merge orario
    # Mappiamo il profilo normalizzato (kWh per kWp) sulle ore storiche del prezzo
    df_merged = df_eval.reset_index().merge(
        pvgis_df[["mese", "giorno", "ora", "hourly_kwh_per_kwp"]].drop_duplicates(subset=["mese", "giorno", "ora"]),
        on=["mese", "giorno", "ora"],
        how="left"
    ).set_index("timestamp").sort_index()

    # Riempi eventuali buchi (es. 29 febbraio su anni bisestili) con interpolazione o giorno adiacente
    df_merged["hourly_kwh_per_kwp"] = df_merged["hourly_kwh_per_kwp"].ffill().bfill().fillna(0)

    # Calcolo produzione impianto
    # Produzione (kWh) = kWh/kWp * Potenza Impianto (kWp)
    df_merged["produzione_kwh"] = df_merged["hourly_kwh_per_kwp"] * power_kw
    df_merged["produzione_mwh"] = df_merged["produzione_kwh"] / 1000.0

    # Applicazione eventuale prezzo floor (es. PMG o RID minimo)
    df_merged["prezzo_effettivo_eur_mwh"] = np.maximum(df_merged["prezzo_zonale_eur_mwh"], price_floor_eur)

    # Ricavo Orario (€) = Produzione (MWh) * Prezzo Effettivo (€/MWh)
    df_merged["ricavo_eur"] = df_merged["produzione_mwh"] * df_merged["prezzo_effettivo_eur_mwh"]

    # Identificazione ore critiche
    df_merged["is_zero_or_neg_price"] = (df_merged["prezzo_zonale_eur_mwh"] <= 0) & (df_merged["produzione_mwh"] > 0)

    # 1. AGGREGAZIONE TRIMESTRALE (Quarterly)
    df_merged["anno_trimestre"] = df_merged["anno"].astype(str) + "-" + df_merged["quarter"]
    
    quarterly_stats = df_merged.groupby(["anno", "quarter", "anno_trimestre"]).apply(
        lambda g: pd.Series({
            "produzione_mwh": g["produzione_mwh"].sum(),
            "ricavo_eur": g["ricavo_eur"].sum(),
            "prezzo_catturato_eur_mwh": (g["ricavo_eur"].sum() / g["produzione_mwh"].sum()) if g["produzione_mwh"].sum() > 0 else 0.0,
            "prezzo_medio_zonale_eur_mwh": g["prezzo_zonale_eur_mwh"].mean(),
            "capture_rate_pct": ((g["ricavo_eur"].sum() / g["produzione_mwh"].sum()) / g["prezzo_zonale_eur_mwh"].mean() * 100) if (g["produzione_mwh"].sum() > 0 and g["prezzo_zonale_eur_mwh"].mean() > 0) else 0.0,
            "ore_zero_prezzo": g["is_zero_or_neg_price"].sum(),
            "ore_produzione": (g["produzione_mwh"] > 0).sum()
        }),
        include_groups=False
    ).reset_index()

    # 2. AGGREGAZIONE ANNUALE
    yearly_stats = df_merged.groupby("anno").apply(
        lambda g: pd.Series({
            "produzione_mwh": g["produzione_mwh"].sum(),
            "ricavo_eur": g["ricavo_eur"].sum(),
            "prezzo_catturato_eur_mwh": (g["ricavo_eur"].sum() / g["produzione_mwh"].sum()) if g["produzione_mwh"].sum() > 0 else 0.0,
            "prezzo_medio_zonale_eur_mwh": g["prezzo_zonale_eur_mwh"].mean(),
            "capture_rate_pct": ((g["ricavo_eur"].sum() / g["produzione_mwh"].sum()) / g["prezzo_zonale_eur_mwh"].mean() * 100) if (g["produzione_mwh"].sum() > 0 and g["prezzo_zonale_eur_mwh"].mean() > 0) else 0.0,
            "ore_zero_prezzo": g["is_zero_or_neg_price"].sum(),
            "ore_produzione": (g["produzione_mwh"] > 0).sum()
        }),
        include_groups=False
    ).reset_index()

    # 3. AGGREGAZIONE MENSILE
    df_merged["anno_mese"] = df_merged.index.strftime("%Y-%m")
    monthly_stats = df_merged.groupby(["anno", "mese", "anno_mese"]).apply(
        lambda g: pd.Series({
            "produzione_mwh": g["produzione_mwh"].sum(),
            "ricavo_eur": g["ricavo_eur"].sum(),
            "prezzo_catturato_eur_mwh": (g["ricavo_eur"].sum() / g["produzione_mwh"].sum()) if g["produzione_mwh"].sum() > 0 else 0.0,
            "prezzo_medio_zonale_eur_mwh": g["prezzo_zonale_eur_mwh"].mean(),
            "capture_rate_pct": ((g["ricavo_eur"].sum() / g["produzione_mwh"].sum()) / g["prezzo_zonale_eur_mwh"].mean() * 100) if (g["produzione_mwh"].sum() > 0 and g["prezzo_zonale_eur_mwh"].mean() > 0) else 0.0,
            "ore_zero_prezzo": g["is_zero_or_neg_price"].sum()
        }),
        include_groups=False
    ).reset_index()

    # 4. KPI GENERALI
    tot_mwh = df_merged["produzione_mwh"].sum()
    tot_ricavo = df_merged["ricavo_eur"].sum()
    prezzo_catturato_medio = (tot_ricavo / tot_mwh) if tot_mwh > 0 else 0.0
    prezzo_zonale_medio = df_merged["prezzo_zonale_eur_mwh"].mean()
    capture_rate_medio = (prezzo_catturato_medio / prezzo_zonale_medio * 100) if prezzo_zonale_medio > 0 else 0.0
    ore_zero_totali = df_merged["is_zero_or_neg_price"].sum()
    ricavo_specifico_kwp = tot_ricavo / power_kw if power_kw > 0 else 0.0
    ore_equivalenti_annue = (tot_mwh * 1000 / power_kw) / (len(df_merged) / 8760) if (power_kw > 0 and len(df_merged) > 0) else 0.0

    kpis = {
        "plant_name": plant_name,
        "power_kw": power_kw,
        "zone": zone,
        "start_date": str(df_merged.index.min().date()),
        "end_date": str(df_merged.index.max().date()),
        "tot_hours": len(df_merged),
        "tot_mwh": round(float(tot_mwh), 2),
        "tot_ricavo_eur": round(float(tot_ricavo), 2),
        "prezzo_catturato_eur_mwh": round(float(prezzo_catturato_medio), 2),
        "prezzo_zonale_medio_eur_mwh": round(float(prezzo_zonale_medio), 2),
        "capture_rate_pct": round(float(capture_rate_medio), 2),
        "ricavo_specifico_eur_kwp": round(float(ricavo_specifico_kwp), 2),
        "ore_equivalenti_annue": round(float(ore_equivalenti_annue), 1),
        "ore_zero_prezzo_totali": int(ore_zero_totali)
    }

    return {
        "kpis": kpis,
        "hourly_df": df_merged,
        "quarterly_df": quarterly_stats,
        "yearly_df": yearly_stats,
        "monthly_df": monthly_stats
    }
