# 10app_prezzi_energia — Previsioni Prezzi Mercato Zonale & Valutazione Economica FTV

Applicazione Web React + Vite + Tailwind CSS integrata con **Supabase (Progetto Hub_FTV Tools)** e configurata per il deploy su **Vercel**.

---

## ⚡ Caratteristiche Principali

1. **Valutazione Economica Impianti Fotovoltaici (PVGIS)**:
   - Caricamento file orario PVGIS (CSV, TXT, JSON) o generazione profilo standard.
   - Calcolo automatico della produzione oraria su base potenza installata (kWp / MWp).
   - Incrocio ora per ora con i prezzi storici ufficiali del mercato zonale MGP (NORD, CNOR, CSUD, SUD, SICI, SARD, CALA).
   - Analisi estesa su **5 Anni** (e fino a 11+ anni dal 2015 al 2026).
   - Calcolo **Prezzo Catturato (€/MWh)** e **Capture Rate (%)** per evidenziare la *Duck Curve*.
   - Breakdown completo per **Trimestre (Q1..Q4)** e per **Anno**.
   - Generazione ed esportazione istantanea nel browser di:
     - 📊 **Report Excel (.xlsx)** con formule e 4 fogli di dettaglio.
     - 📄 **Report PDF (.pdf)** impaginato A4 pronto per la stampa.

2. **Esploratore Mercato Zonale & Quarto d'Ora (15 min)**:
   - Serie storiche prezzi orari e a 15 minuti (dal 2025).
   - Monitoraggio spread zonali e ore con prezzi nulli/negativi.

3. **Archivio Simulazioni su Supabase**:
   - Salvataggio e ricaricamento delle valutazioni nel database centrale `Hub_FTV Tools` (tabelle con prefisso `10app_`).

---

## 🚀 Avvio Locale

1. Installa le dipendenze:
   ```bash
   npm install
   ```

2. Avvia il server di sviluppo:
   ```bash
   npm run dev
   ```

3. Compila per la produzione (Vercel):
   ```bash
   npm run build
   ```

---

## 🗄️ Database Supabase (Hub)

- **Progetto**: `Hub_FTV Tools` (ref: `srtcuqatzaduvdteyjhb`)
- **Tabelle `10app_`**:
  - `10app_profiles`
  - `10app_simulations`
  - `10app_market_prices_daily`
  - `10app_plant_presets`
- **RLS**: Row Level Security abilitata.
