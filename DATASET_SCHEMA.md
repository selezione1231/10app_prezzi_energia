# Specifiche e Guida all'Uso del Dataset Prezzi Zonali Italia (2015 - 2026)

Questo dataset contiene la serie storica completa e ufficiale dei prezzi dell'energia elettrica orari in Italia (**MGP - Mercato del Giorno Prima**), rilevati dal **GME (Gestore dei Mercati Energetici)** dal **1° Gennaio 2015 al 31 Luglio 2026** (oltre 101.500 ore per zona).

---

## 1. File Disponibili nella cartella `data/export/`

| File | Formato | Dimensione | Uso Consigliato |
| :--- | :---: | :---: | :--- |
| **`mercato_elettrico_zonale.sqlite`** | **SQLite DB** | ~82 MB | **Ideale per qualsiasi App backend / API** (Node.js, Python, Go, C#) con query SQL indicizzate istantanee. |
| **`prezzi_zonali_italia_wide.parquet`** | **Parquet** | ~3.6 MB | **Ideale per Data Science / Machine Learning** in Python (Pandas, Polars, DuckDB). Caricamento in millisecondi. |
| **`prezzi_zonali_italia_wide.csv`** | **CSV** | ~8.5 MB | **Formato tabulare largo**, compatibile con Excel, PowerBI, Tableau, Google Sheets. |
| **`prezzi_zonali_italia_long.parquet`** | **Parquet** | ~3.1 MB | **Formato relazionale (Tidy)**: `timestamp`, `data`, `ora`, `zona`, `prezzo_eur_mwh`. |
| **`prezzi_zonali_italia_long.csv`** | **CSV** | ~34 MB | Formato relazionale standard per import massivo su database esterni (PostgreSQL, Supabase, MySQL). |

---

## 2. Schema dei Dati

### Struttura Tabella WIDE (`prezzi_zonali_italia_wide`)
| Colonna | Tipo | Descrizione | Esempio |
| :--- | :--- | :--- | :--- |
| `timestamp` | `VARCHAR / DATETIME` | Timestamp inizio intervallo orario (YYYY-MM-DD HH:MM:SS) | `2024-03-15 14:00:00` |
| `data` | `DATE` | Data del giorno di mercato (YYYY-MM-DD) | `2024-03-15` |
| `ora` | `INTEGER` | Ora del giorno (1 - 24) | `15` |
| `PUN` | `FLOAT` | Prezzo Unico Nazionale (€/MWh) | `102.45` |
| `NORD` | `FLOAT` | Prezzo Zonale Nord (€/MWh) | `101.20` |
| `CNOR` | `FLOAT` | Prezzo Zonale Centro Nord (€/MWh) | `101.20` |
| `CSUD` | `FLOAT` | Prezzo Zonale Centro Sud (€/MWh) | `98.50` |
| `SUD` | `FLOAT` | Prezzo Zonale Sud (€/MWh) | `95.10` |
| `SICI` | `FLOAT` | Prezzo Zonale Sicilia (€/MWh) | `112.30` |
| `SARD` | `FLOAT` | Prezzo Zonale Sardegna (€/MWh) | `88.00` |
| `CALA` | `FLOAT` | Prezzo Zonale Calabria (€/MWh - attivo dal 2021) | `95.10` |

### Struttura Tabella LONG (`prezzi_orari` in SQLite / LONG CSV)
| Colonna | Tipo | Descrizione |
| :--- | :--- | :--- |
| `timestamp` | `TEXT` | Data e ora formato ISO (`YYYY-MM-DD HH:MM:SS`) |
| `data` | `TEXT` | Data del giorno (`YYYY-MM-DD`) |
| `ora` | `INTEGER` | Ora del giorno (`1-24`) |
| `zona` | `TEXT` | Codice zona (`NORD`, `SUD`, `SICI`, ecc.) |
| `prezzo_eur_mwh` | `REAL` | Prezzo di vendita/acquisto in €/MWh |

---

## 3. Esempi di Caricamento per la tua futura App

### In Python (Backend FastAPI / Flask / Data Pipeline)
```python
import pandas as pd
import sqlite3

# Opzione A: Caricamento istantaneo da Parquet
df = pd.read_parquet("data/export/prezzi_zonali_italia_wide.parquet")

# Opzione B: Query SQL dal database SQLite
conn = sqlite3.connect("data/export/mercato_elettrico_zonale.sqlite")
query = "SELECT * FROM prezzi_orari WHERE zona = 'SICI' AND data >= '2024-01-01'"
df_sici = pd.read_sql_query(query, conn)
```

### In Node.js / TypeScript (Backend Next.js / Express / NestJS)
```typescript
import Database from 'better-sqlite3';

const db = new Database('data/export/mercato_elettrico_zonale.sqlite');

// Recupera i prezzi delle ultime 24 ore per la zona NORD
const stmt = db.prepare(`
  SELECT timestamp, ora, prezzo_eur_mwh 
  FROM prezzi_orari 
  WHERE zona = ? AND data = ? 
  ORDER BY ora ASC
`);
const prezziOggi = stmt.all('NORD', '2026-07-31');
console.log(prezziOggi);
```

### In SQL Diretto (PostgreSQL / Supabase / SQLite)
```sql
-- Calcolo del prezzo medio orario per zona nel 2024
SELECT 
    zona, 
    ora, 
    ROUND(AVG(prezzo_eur_mwh), 2) AS prezzo_medio_orario
FROM prezzi_orari
WHERE data BETWEEN '2024-01-01' AND '2024-12-31'
GROUP BY zona, ora
ORDER BY zona, ora;
```
