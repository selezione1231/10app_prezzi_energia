import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score
from pathlib import Path
import joblib
import json

from src.feature_engineering import create_features

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

def train_and_evaluate(target_zone: str = "NORD", test_start: str = "2025-01-01"):
    data_path = PROCESSED_DIR / "gme_prezzi_zonali_2015_2026.parquet"
    if not data_path.exists():
        raise FileNotFoundError(f"File non trovato: {data_path}")

    print(f"\n=======================================================")
    print(f"ADDESTRAMENTO MODELLO PREVISIONE ZONALE: {target_zone}")
    print(f"=======================================================")

    df_raw = pd.read_parquet(data_path)
    df_feat = create_features(df_raw, target_zone=target_zone)

    # Identifica le feature
    feature_cols = [c for c in df_feat.columns if c not in df_raw.columns and c != "target"]

    # Split Train / Test temporale
    train_mask = df_feat.index < test_start
    test_mask = df_feat.index >= test_start

    X_train, y_train = df_feat.loc[train_mask, feature_cols], df_feat.loc[train_mask, "target"]
    X_test, y_test = df_feat.loc[test_mask, feature_cols], df_feat.loc[test_mask, "target"]

    print(f"Numero features generate: {len(feature_cols)}")
    print(f"Campioni Train ({X_train.index.min()} -> {X_train.index.max()}): {len(X_train):,}")
    print(f"Campioni Test  ({X_test.index.min()} -> {X_test.index.max()}): {len(X_test):,}")

    # 1. Modello Principale (L2 Regression per la stima del prezzo medio)
    print("\n[TRAINING] Addestramento LightGBM Regressor...")
    model_main = lgb.LGBMRegressor(
        objective="regression",
        n_estimators=600,
        learning_rate=0.03,
        num_leaves=63,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        verbose=-1
    )
    model_main.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        callbacks=[lgb.early_stopping(stopping_rounds=40, verbose=False)]
    )

    # 2. Modelli Quantilici per Intervalli di Confidenza (P10 e P90)
    print("[TRAINING] Addestramento Modelli Quantilici (P10 e P90)...")
    model_q10 = lgb.LGBMRegressor(objective="quantile", alpha=0.10, n_estimators=300, learning_rate=0.05, num_leaves=31, random_state=42, n_jobs=-1, verbose=-1)
    model_q90 = lgb.LGBMRegressor(objective="quantile", alpha=0.90, n_estimators=300, learning_rate=0.05, num_leaves=31, random_state=42, n_jobs=-1, verbose=-1)
    model_q10.fit(X_train, y_train)
    model_q90.fit(X_train, y_train)

    # Previsioni out-of-sample
    preds_main = model_main.predict(X_test)
    preds_q10 = model_q10.predict(X_test)
    preds_q90 = model_q90.predict(X_test)

    # Valutazione Metriche
    mae = mean_absolute_error(y_test, preds_main)
    rmse = root_mean_squared_error(y_test, preds_main)
    r2 = r2_score(y_test, preds_main)
    wape = np.sum(np.abs(y_test - preds_main)) / np.sum(np.abs(y_test)) * 100

    print("\n--- METRICHE OUT-OF-SAMPLE (Test Set 2025-2026) ---")
    print(f"MAE  (Errore Medio Assoluto):     {mae:.2f} €/MWh")
    print(f"RMSE (Radice Errore Quadratico): {rmse:.2f} €/MWh")
    print(f"WAPE (Errore % Ponderato):       {wape:.2f} %")
    print(f"R²   (Coefficiente det.):        {r2:.4f}")

    # Feature Importance
    importance_df = pd.DataFrame({
        "Feature": feature_cols,
        "Importance": model_main.feature_importances_
    }).sort_values(by="Importance", ascending=False)
    print("\n--- TOP 10 FEATURE PIÙ IMPORTANTI ---")
    print(importance_df.head(10).to_string(index=False))

    # Salva risultati e previsioni
    results_df = pd.DataFrame({
        "actual": y_test,
        "pred_p50": preds_main,
        "pred_p10": preds_q10,
        "pred_p90": preds_q90,
        "error": preds_main - y_test
    }, index=X_test.index)

    results_path = PROCESSED_DIR / f"backtest_results_{target_zone}.parquet"
    results_df.to_parquet(results_path)

    # Salva modelli
    joblib.dump(model_main, MODELS_DIR / f"lgbm_{target_zone}_main.joblib")
    joblib.dump(model_q10, MODELS_DIR / f"lgbm_{target_zone}_q10.joblib")
    joblib.dump(model_q90, MODELS_DIR / f"lgbm_{target_zone}_q90.joblib")

    metrics = {
        "target_zone": target_zone,
        "mae": round(float(mae), 2),
        "rmse": round(float(rmse), 2),
        "wape_pct": round(float(wape), 2),
        "r2": round(float(r2), 4),
        "test_hours": int(len(X_test))
    }
    with open(MODELS_DIR / f"metrics_{target_zone}.json", "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"\n[SALVATO] Modelli e metriche salvati in {MODELS_DIR}")
    return metrics, results_df

if __name__ == "__main__":
    for zone in ["NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD"]:
        train_and_evaluate(target_zone=zone, test_start="2025-01-01")
