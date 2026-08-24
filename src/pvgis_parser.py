import io
import re
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Tuple, Dict, Any, Optional

def parse_pvgis_file(file_content: bytes, filename: str = "pvgis.csv") -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Legge e analizza file orari esportati da PVGIS (CSV, TXT o JSON).
    Rileva automaticamente metadati dell'impianto e colonne di produzione/irraggiamento.
    """
    text_data = file_content.decode("utf-8", errors="ignore")
    lines = text_data.splitlines()

    metadata = {
        "latitude": None,
        "longitude": None,
        "nominal_power_kw": 1.0,
        "system_loss_pct": 14.0,
        "slope_deg": None,
        "azimuth_deg": None,
        "filename": filename
    }

    # Cerca metadati nelle righe di intestazione
    for line in lines[:30]:
        line_clean = line.strip()
        if "Latitude" in line_clean:
            match = re.search(r"[-+]?\d*\.\d+|\d+", line_clean)
            if match: metadata["latitude"] = float(match.group())
        elif "Longitude" in line_clean:
            match = re.search(r"[-+]?\d*\.\d+|\d+", line_clean)
            if match: metadata["longitude"] = float(match.group())
        elif "Nominal power" in line_clean or "Installed peak PV power" in line_clean:
            match = re.search(r"[-+]?\d*\.\d+|\d+", line_clean)
            if match: metadata["nominal_power_kw"] = float(match.group())
        elif "Slope" in line_clean:
            match = re.search(r"[-+]?\d*\.\d+|\d+", line_clean)
            if match: metadata["slope_deg"] = float(match.group())
        elif "Azimuth" in line_clean:
            match = re.search(r"[-+]?\d*\.\d+|\d+", line_clean)
            if match: metadata["azimuth_deg"] = float(match.group())

    # Trova l'inizio dei dati tabulari (la riga con l'header 'time' o 'Date' o 'P')
    header_idx = None
    for i, line in enumerate(lines[:50]):
        line_lower = line.lower().strip()
        if line_lower.startswith("time") or line_lower.startswith("date") or "time,p" in line_lower or "time\tp" in line_lower:
            header_idx = i
            break
        elif "p (w)" in line_lower or "g(i)" in line_lower:
            header_idx = i
            break

    if header_idx is None:
        # Tentativo fallback: cerca riga contenente virgole e timestamp
        for i, line in enumerate(lines[:50]):
            if re.search(r"\d{4}\d{2}\d{2}:\d{4}", line) or re.search(r"\d{4}-\d{2}-\d{2}", line):
                header_idx = max(0, i - 1)
                break

    if header_idx is None:
        raise ValueError("Formato file PVGIS non riconosciuto: impossibile identificare le colonne orarie.")

    # Leggi il CSV saltando l'intestazione
    csv_stream = io.StringIO("\n".join(lines[header_idx:]))
    df = pd.read_csv(csv_stream, sep=None, engine="python")

    # Standardizza nomi colonne
    cols_clean = [str(c).strip().replace("\"", "").replace("'", "") for c in df.columns]
    df.columns = cols_clean

    # Trova colonna del tempo
    time_col = None
    for c in df.columns:
        if c.lower() in ["time", "date", "timestamp", "datetime"]:
            time_col = c
            break

    if not time_col:
        time_col = df.columns[0]

    # Parsing del timestamp
    def parse_pvgis_timestamp(val):
        val_str = str(val).strip()
        # Formato standard PVGIS: YYYYMMDD:HHMM (es. 20200101:0010 o 20200101:1200)
        if ":" in val_str and len(val_str.split(":")[0]) == 8:
            parts = val_str.split(":")
            d_part = parts[0]
            t_part = parts[1]
            try:
                hour = int(t_part[:2])
                minute = int(t_part[2:4]) if len(t_part) >= 4 else 0
                return pd.to_datetime(d_part, format="%Y%m%d") + pd.Timedelta(hours=hour, minutes=minute)
            except Exception:
                pass
        # Formato ISO: YYYY-MM-DD HH:MM
        try:
            return pd.to_datetime(val_str)
        except Exception:
            return pd.NaT

    df["timestamp"] = df[time_col].apply(parse_pvgis_timestamp)
    df = df.dropna(subset=["timestamp"])

    # Trova colonna potenza di uscita (P in Watt o kW) o irraggiamento G(i)
    p_col = None
    for c in df.columns:
        if c.lower() in ["p", "p_w", "p(w)", "pv_power", "power", "pv"]:
            p_col = c
            break

    if not p_col:
        for c in df.columns:
            if "p" in c.lower() and ("w" in c.lower() or "power" in c.lower()):
                p_col = c
                break

    if not p_col:
        # Se non c'è P ma c'è G(i) (irraggiamento globale in W/m²), stima P = G(i) / 1000 * 0.86
        for c in df.columns:
            if "g(i)" in c.lower() or "gi" in c.lower() or "poa" in c.lower() or "irradiance" in c.lower():
                p_col = c
                # Converti irraggiamento in stima potenza (W/kWp)
                df["P"] = pd.to_numeric(df[c], errors="coerce").fillna(0) * 0.86
                p_col = "P"
                break

    if not p_col:
        # Se nessuna colonna trovata, usa la seconda colonna numerica
        numeric_cols = [c for c in df.columns if c not in [time_col, "timestamp"]]
        if numeric_cols:
            p_col = numeric_cols[0]
        else:
            raise KeyError("Nessuna colonna di potenza (P) o irraggiamento trovata nel file PVGIS.")

    # Converte P in float e in kWh per ora (se P è in Watt, dividi per 1000)
    df["P_raw"] = pd.to_numeric(df[p_col], errors="coerce").fillna(0)
    
    # Se il valore massimo di P è > 50, è espresso in Watt (es. 850 W per 1kWp)
    if df["P_raw"].max() > 50:
        df["hourly_kwh_per_kwp"] = df["P_raw"] / 1000.0
    else:
        # Già in kW o kWh
        df["hourly_kwh_per_kwp"] = df["P_raw"]

    df = df.set_index("timestamp").sort_index()

    # Crea colonne mese, giorno, ora per il matching con le serie storiche dei prezzi
    df["mese"] = df.index.month
    df["giorno"] = df.index.day
    df["ora"] = df.index.hour + 1

    clean_profile = df[["mese", "giorno", "ora", "hourly_kwh_per_kwp"]].copy()
    return clean_profile, metadata

def generate_synthetic_pvgis_profile(latitude: float = 40.0, nominal_power_kw: float = 1.0) -> pd.DataFrame:
    """
    Genera un profilo orario annuale sintetico (8760 ore) basato su coordinate solari tipiche italiane.
    Utilizzato se l'utente non ha un file PVGIS a disposizione e vuole testare subito.
    """
    dates = pd.date_range("2024-01-01 00:00:00", "2024-12-31 23:00:00", freq="h")
    df = pd.DataFrame(index=dates)
    df["mese"] = df.index.month
    df["giorno"] = df.index.day
    df["ora"] = df.index.hour + 1
    df["day_of_year"] = df.index.dayofyear

    # Modello solare ideale stagionale e orario
    # Ore di luce: min ~9 ore a dicembre, max ~15 ore a giugno
    declination = 23.45 * np.sin(np.radians(360 / 365 * (df["day_of_year"] - 81)))
    solar_noon = 12.5  # ora solare di picco

    # Altezza solare approssimata
    hour_angle = (df["ora"] - solar_noon) * 15
    sin_elev = (np.sin(np.radians(latitude)) * np.sin(np.radians(declination)) +
                np.cos(np.radians(latitude)) * np.cos(np.radians(declination)) * np.cos(np.radians(hour_angle)))
    sin_elev = np.clip(sin_elev, 0, 1)

    # Produzione oraria (kWh/kWp)
    base_prod = sin_elev ** 1.1 * 0.85
    # Aggiungi stagionalità dell'irraggiamento
    seasonal_factor = 0.6 + 0.4 * np.sin(np.radians(360 / 365 * (df["day_of_year"] - 81)))
    df["hourly_kwh_per_kwp"] = np.maximum(0, base_prod * seasonal_factor)

    return df[["mese", "giorno", "ora", "hourly_kwh_per_kwp"]]
