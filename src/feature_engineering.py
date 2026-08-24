import pandas as pd
import numpy as np

def create_features(df: pd.DataFrame, target_zone: str = "NORD") -> pd.DataFrame:
    """
    Costruisce feature temporali, di lag, rolling statistics e cross-zonali
    rispettando rigorosamente il market timeline del Day-Ahead Market (MGP):
    le offerte per il giorno D vengono sottomesse prima delle 12:00 del giorno D-1.
    Quindi i lag minimi utilizzabili per il giorno D partono da t-24.
    """
    df = df.copy()

    # Se target_zone ha valori nulli storici (es. CALA pre-2021), filtra solo i dati validi
    if df[target_zone].isnull().any():
        first_valid_idx = df[target_zone].first_valid_index()
        df = df.loc[first_valid_idx:].copy()

    # 1. Feature Temporali e di Calendario
    df["ora"] = df.index.hour
    df["giorno_settimana"] = df.index.dayofweek
    df["mese"] = df.index.month
    df["giorno_anno"] = df.index.dayofyear
    df["is_weekend"] = (df["giorno_settimana"] >= 5).astype(int)

    # Codifica ciclica (seno/coseno)
    df["ora_sin"] = np.sin(2 * np.pi * df["ora"] / 24.0)
    df["ora_cos"] = np.cos(2 * np.pi * df["ora"] / 24.0)
    df["dow_sin"] = np.sin(2 * np.pi * df["giorno_settimana"] / 7.0)
    df["dow_cos"] = np.cos(2 * np.pi * df["giorno_settimana"] / 7.0)
    df["mese_sin"] = np.sin(2 * np.pi * df["mese"] / 12.0)
    df["mese_cos"] = np.cos(2 * np.pi * df["mese"] / 12.0)

    # 2. Lag Features del Target (in ore)
    lags = [24, 48, 72, 96, 120, 144, 168, 336]
    for lag in lags:
        df[f"lag_{target_zone}_{lag}h"] = df[target_zone].shift(lag)

    # 3. Rolling Statistics sul target (calcolate a partire dal lag 24h per evitare data leakage)
    base_series = df[target_zone].shift(24)
    df[f"rolling_mean_24h_{target_zone}"] = base_series.rolling(window=24).mean()
    df[f"rolling_std_24h_{target_zone}"] = base_series.rolling(window=24).std()
    df[f"rolling_min_24h_{target_zone}"] = base_series.rolling(window=24).min()
    df[f"rolling_max_24h_{target_zone}"] = base_series.rolling(window=24).max()
    df[f"rolling_mean_168h_{target_zone}"] = base_series.rolling(window=168).mean()
    df[f"rolling_std_168h_{target_zone}"] = base_series.rolling(window=168).std()

    # 4. Differenziali di prezzo / Momentum
    df[f"diff_{target_zone}_24h_48h"] = df[f"lag_{target_zone}_24h"] - df[f"lag_{target_zone}_48h"]
    df[f"diff_{target_zone}_24h_168h"] = df[f"lag_{target_zone}_24h"] - df[f"lag_{target_zone}_168h"]

    # 5. Cross-Zonal Features (zone storiche con 0 buchi: NORD, CNOR, CSUD, SUD, SICI, SARD)
    core_zones = ["NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD"]
    other_zones = [z for z in core_zones if z in df.columns and z != target_zone]
    for oz in other_zones:
        df[f"lag_{oz}_24h"] = df[oz].shift(24)
        df[f"lag_{oz}_168h"] = df[oz].shift(168)
        df[f"spread_lag24h_{target_zone}_{oz}"] = df[f"lag_{target_zone}_24h"] - df[f"lag_{oz}_24h"]

    # Target column
    df["target"] = df[target_zone]

    # Identifica le feature generate
    exclude_cols = [c for c in df.columns if c not in ["ora", "giorno_settimana", "mese", "giorno_anno", "is_weekend",
                                                        "ora_sin", "ora_cos", "dow_sin", "dow_cos", "mese_sin", "mese_cos", "target"]
                    and not c.startswith("lag_") and not c.startswith("rolling_") and not c.startswith("diff_") and not c.startswith("spread_")]
    
    feature_cols = [c for c in df.columns if c not in exclude_cols and c != "target"]

    # Drop righe con NaN solo nelle feature necessarie e nel target
    df = df.dropna(subset=feature_cols + ["target"])

    return df
