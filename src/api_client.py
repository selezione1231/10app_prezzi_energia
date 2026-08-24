import requests
import pandas as pd
import numpy as np
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta
from typing import Dict, Optional, Any

# Codici EIC ufficiali ENTSO-E per le zone di mercato italiane
ENTSOE_EIC_ZONES = {
    "NORD": "10Y1001A1001A739",
    "CNOR": "10Y1001A1001A70F",
    "CSUD": "10Y1001A1001A71D",
    "SUD": "10Y1001A1001A78Z",
    "SICI": "10Y1001A1001A755",
    "SARD": "10Y1001A1001A747",
    "CALA": "10Y1001A1001A771"
}

# Coordinate geografiche per previsioni meteo ed energia solare/eolica (Open-Meteo API)
ZONE_COORDINATES = {
    "NORD": {"lat": 45.4642, "lon": 9.1900, "city": "Milano"},
    "CNOR": {"lat": 43.7696, "lon": 11.2558, "city": "Firenze"},
    "CSUD": {"lat": 41.9028, "lon": 12.4964, "city": "Roma"},
    "SUD":  {"lat": 41.1171, "lon": 16.8719, "city": "Bari"},
    "SICI": {"lat": 37.5079, "lon": 15.0830, "city": "Catania"},
    "SARD": {"lat": 39.2238, "lon": 9.1217,  "city": "Cagliari"}
}

class EntsoeApiClient:
    """Client per ENTSO-E Transparency Platform (Prezzi Day-Ahead a 15 e 60 min, carico, rinnovabili)"""
    BASE_URL = "https://web-api.tp.entsoe.eu/api"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def test_connection(self) -> Dict[str, Any]:
        if not self.api_key:
            return {"status": "error", "message": "API Key ENTSO-E non inserita. Registrati gratuitamente su transparency.entsoe.eu."}
        
        try:
            # Query di test per la zona NORD
            today = datetime.utcnow().strftime("%Y%m%d")
            params = {
                "securityToken": self.api_key,
                "documentType": "A44",  # Price Document
                "in_Domain": ENTSOE_EIC_ZONES["NORD"],
                "out_Domain": ENTSOE_EIC_ZONES["NORD"],
                "periodStart": f"{today}0000",
                "periodEnd": f"{today}2300"
            }
            res = requests.get(self.BASE_URL, params=params, timeout=10)
            if res.status_code == 200:
                return {"status": "success", "message": "Connessione ENTSO-E stabilita con successo!", "xml_sample": res.text[:300]}
            else:
                return {"status": "error", "message": f"Errore risposta ENTSO-E: Codice {res.status_code} - {res.text[:200]}"}
        except Exception as e:
            return {"status": "error", "message": f"Errore di connessione: {str(e)}"}

class OpenMeteoEnergyClient:
    """Client Open-Meteo per dati meteo orari e a 15 minuti (Solare, Vento, Temperatura) per l'Italia"""
    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    @staticmethod
    def get_weather_forecast(zone: str = "NORD", past_days: int = 2, forecast_days: int = 3) -> pd.DataFrame:
        if zone not in ZONE_COORDINATES:
            raise ValueError(f"Zona sconosciuta: {zone}")

        coords = ZONE_COORDINATES[zone]
        params = {
            "latitude": coords["lat"],
            "longitude": coords["lon"],
            "hourly": ["temperature_2m", "direct_normal_irradiance", "wind_speed_100m", "cloud_cover"],
            "past_days": past_days,
            "forecast_days": forecast_days,
            "timezone": "Europe/Rome"
        }

        res = requests.get(OpenMeteoEnergyClient.BASE_URL, params=params, timeout=10)
        res.raise_for_status()
        data = res.json()

        df = pd.DataFrame(data["hourly"])
        df["time"] = pd.to_datetime(df["time"])
        df = df.set_index("time")
        df["zona"] = zone
        df["citta_riferimento"] = coords["city"]
        return df

class GmeApiClient:
    """Client per il portale e le API del GME"""
    BASE_URL = "https://api.mercatoelettrico.org"

    def __init__(self, username: Optional[str] = None, password: Optional[str] = None):
        self.username = username
        self.password = password

    def get_auth_token(self) -> Dict[str, Any]:
        if not self.username or not self.password:
            return {"status": "info", "message": "Credenziali GME non fornite. Richiedile tramite PEC a gme@pec.mercatoelettrico.org."}
        try:
            url = f"{self.BASE_URL}/api/v1/Auth"
            res = requests.post(url, json={"username": self.username, "password": self.password}, timeout=10)
            if res.status_code == 200:
                token = res.json().get("token")
                return {"status": "success", "token": token}
            else:
                return {"status": "error", "message": f"Errore autenticazione GME: {res.text}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
