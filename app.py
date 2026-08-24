import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from pathlib import Path
import json
import sqlite3

from src.pvgis_parser import parse_pvgis_file, generate_synthetic_pvgis_profile
from src.ftv_backtest import run_ftv_backtest
from src.report_generator import generate_excel_report, generate_pdf_report
from src.api_client import OpenMeteoEnergyClient, EntsoeApiClient, GmeApiClient, ENTSOE_EIC_ZONES

st.set_page_config(page_title="Italian Power Zonal & Solar Hub (MGP)", layout="wide", page_icon="⚡")

BASE_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"
EXPORT_DIR = BASE_DIR / "data" / "export"
MODELS_DIR = BASE_DIR / "models"

DATA_HOURLY = EXPORT_DIR / "prezzi_zonali_italia_wide.parquet"
DATA_15MIN = EXPORT_DIR / "prezzi_zonali_15min_2025_2026.parquet"
SQLITE_DB = EXPORT_DIR / "mercato_elettrico_zonale.sqlite"

@st.cache_data
def load_hourly():
    if DATA_HOURLY.exists():
        df = pd.read_parquet(DATA_HOURLY)
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        return df.set_index("timestamp")
    return None

@st.cache_data
def load_15min():
    if DATA_15MIN.exists():
        return pd.read_parquet(DATA_15MIN)
    return None

@st.cache_data
def load_backtest_data(zone: str):
    p = PROCESSED_DIR / f"backtest_results_{zone}.parquet"
    if p.exists():
        return pd.read_parquet(p)
    return None

st.title("⚡ Italian Power Market & Solar PV Valuation Hub (MGP)")
st.caption("Valutazione Economica Impianti FTV da PVGIS | Granularità 15m/60m GME | Range Esteso a 5 Anni | Previsione Prezzi Zonali")

df_hour = load_hourly()
df_15 = load_15min()

tabs = st.tabs([
    "☀️ Valutazione FTV (PVGIS)",
    "⏱️ Dati 15 Minuti (2025-2026)",
    "📊 Serie Storica Oraria (2015-2026)",
    "🔮 Previsioni & Backtest Prezzi",
    "🔌 API Tester & Connettori Live",
    "🗄️ Database SQLite"
])

# ----------------------------------------------------
# TAB 0: VALUTAZIONE IMPIANTO FOTOVOLTAICO (PVGIS)
# ----------------------------------------------------
with tabs[0]:
    st.subheader("☀️ Valutazione Economica & Backtest Impianto Fotovoltaico (Range fino a 5+ Anni)")
    st.markdown("Carica il file orario esportato da **PVGIS** (oppure usa il profilo solare standard) per calcolare i ricavi storici effettivi, il prezzo catturato e il breakdown per trimestre e anno sul mercato zonale.")

    col_in1, col_in2 = st.columns([1, 2])

    with col_in1:
        st.markdown("#### 1. Parametri Impianto")
        plant_name = st.text_input("Nome / Riferimento Impianto:", value="Parco Solare FTV 1")
        power_kw = st.number_input("Potenza Nominale Impianto (kWp):", min_value=1.0, max_value=500000.0, value=1000.0, step=50.0)
        zone_pv = st.selectbox("Zona di Mercato:", ["NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD", "CALA"], index=3)
        
        st.markdown("#### 2. Profilo di Produzione (PVGIS)")
        upload_type = st.radio("Origine dati di produzione:", ["📁 Carica file PVGIS (CSV/TXT)", "🌐 Profilo Solare Tipico Italiano"], horizontal=True)

        pvgis_profile = None
        pvgis_meta = {}

        if "Carica file" in upload_type:
            pvgis_file = st.file_uploader("Trascina qui il file orario PVGIS:", type=["csv", "txt", "json"])
            if pvgis_file is not None:
                try:
                    pvgis_profile, pvgis_meta = parse_pvgis_file(pvgis_file.getvalue(), filename=pvgis_file.name)
                    st.success(f"File '{pvgis_file.name}' caricato ({len(pvgis_profile):,} ore).")
                    if pvgis_meta.get("nominal_power_kw"):
                        st.info(f"Potenza rilevata nel file PVGIS: {pvgis_meta['nominal_power_kw']} kWp")
                except Exception as e:
                    st.error(f"Errore parsing file PVGIS: {e}")
        else:
            lat_default = 41.0 if zone_pv in ["SUD", "CSUD", "CALA"] else (37.5 if zone_pv == "SICI" else 45.0)
            pvgis_profile = generate_synthetic_pvgis_profile(latitude=lat_default, nominal_power_kw=1.0)
            st.info(f"Generato profilo orario tipo (8.760 ore) per latitudine ~{lat_default}°.")

        st.markdown("#### 3. Periodo di Valutazione (Fino a 5 Anni)")
        if df_hour is not None:
            min_p = df_hour.index.min().date()
            max_p = df_hour.index.max().date()
            
            # Selettore Rapido Preset Temporale
            preset_choice = st.selectbox(
                "Preset Periodo:",
                [
                    "🎯 Ultimi 5 Anni (5Y Rolling - Standard)",
                    "📅 Ultimi 3 Anni (3Y)",
                    "🏆 Tutto lo Storico Disponibile (2015 - 2026)",
                    "✍️ Personalizzato"
                ],
                index=0
            )

            if "5 Anni" in preset_choice:
                default_start = max_p - pd.DateOffset(years=5)
                default_val = [default_start.date(), max_p]
            elif "3 Anni" in preset_choice:
                default_start = max_p - pd.DateOffset(years=3)
                default_val = [default_start.date(), max_p]
            elif "Tutto" in preset_choice:
                default_val = [min_p, max_p]
            else:
                default_start = max_p - pd.DateOffset(years=5)
                default_val = [default_start.date(), max_p]

            date_range_pv = st.date_input(
                "Intervallo Date Backtest:",
                value=default_val,
                min_value=min_p,
                max_value=max_p,
                key="date_input_pv"
            )
        else:
            date_range_pv = []

        price_floor = st.number_input("Prezzo Minimo Garantito Floor (€/MWh - opzionale):", min_value=0.0, max_value=300.0, value=0.0, step=5.0)

        btn_run_pv = st.button("🚀 Esegui Valutazione Economica", type="primary", use_container_width=True)

    with col_in2:
        if pvgis_profile is not None and len(date_range_pv) == 2:
            s_date, e_date = date_range_pv
            try:
                bt_res = run_ftv_backtest(
                    pvgis_profile=pvgis_profile,
                    power_kw=power_kw,
                    zone=zone_pv,
                    start_date=str(s_date),
                    end_date=str(e_date),
                    price_floor_eur=price_floor,
                    plant_name=plant_name
                )
                kpis = bt_res["kpis"]

                st.markdown(f"### Risultati: **{plant_name}** ({power_kw:,.0f} kWp - Zona {zone_pv})")
                st.caption(f"Intervallo Valutazione: **{s_date}** -> **{e_date}** ({kpis['tot_hours']:,} ore analizzate)")

                # KPI CARDS
                kpi_c1, kpi_c2, kpi_c3, kpi_c4 = st.columns(4)
                kpi_c1.metric("💰 Ricavi Totali", f"€ {kpis['tot_ricavo_eur']:,.2f}")
                kpi_c2.metric("⚡ Produzione Totale", f"{kpis['tot_mwh']:,.1f} MWh")
                kpi_c3.metric("🎯 Prezzo Catturato Medio", f"€ {kpis['prezzo_catturato_eur_mwh']:.2f} /MWh")
                kpi_c4.metric("📊 Capture Rate Solare", f"{kpis['capture_rate_pct']:.1f}%")

                kpi_c5, kpi_c6, kpi_c7, kpi_c8 = st.columns(4)
                kpi_c5.metric("📈 Prezzo Medio Zonale", f"€ {kpis['prezzo_zonale_medio_eur_mwh']:.2f} /MWh")
                kpi_c6.metric("💶 Ricavo Specifico", f"€ {kpis['ricavo_specifico_eur_kwp']:,.2f} /kWp")
                kpi_c7.metric("⏱️ Ore Equivalenti Annue", f"{kpis['ore_equivalenti_annue']:,.0f} h/anno")
                kpi_c8.metric("⚠️ Ore a Prezzo <= 0 €", f"{kpis['ore_zero_prezzo_totali']} ore")

                st.divider()

                # TABS DETTAGLIO: TRIMESTRALE / ANNUALE / GRAFICI
                pv_tabs = st.tabs(["📊 Breakdown Trimestrale (Q1-Q4)", "📅 Breakdown Annuale", "📈 Andamento & Prezzi Catturati", "📥 Download Report (Excel/PDF)"])

                with pv_tabs[0]:
                    st.subheader(f"Dettaglio Trimestrale (Tutti i Trimestri Q1-Q4 nel periodo {s_date.year} - {e_date.year})")
                    q_df = bt_res["quarterly_df"]
                    
                    fig_q = px.bar(
                        q_df,
                        x="anno_trimestre",
                        y="ricavo_eur",
                        color="quarter",
                        labels={"ricavo_eur": "Ricavi (€)", "anno_trimestre": "Trimestre", "quarter": "Trimestre"},
                        title="Ricavi Economici per Trimestre (€) - Analisi Storica Fino a 5 Anni"
                    )
                    st.plotly_chart(fig_q, use_container_width=True)

                    st.dataframe(
                        q_df.rename(columns={
                            "anno": "Anno", "quarter": "Trimestre", "anno_trimestre": "Periodo",
                            "produzione_mwh": "Produzione (MWh)", "ricavo_eur": "Ricavi (€)",
                            "prezzo_catturato_eur_mwh": "Prezzo Catturato (€/MWh)",
                            "prezzo_medio_zonale_eur_mwh": "Prezzo Zonale (€/MWh)",
                            "capture_rate_pct": "Capture Rate (%)", "ore_zero_prezzo": "Ore P <= 0€"
                        }).style.format({
                            "Produzione (MWh)": "{:,.2f}",
                            "Ricavi (€)": "€ {:,.2f}",
                            "Prezzo Catturato (€/MWh)": "€ {:,.2f}",
                            "Prezzo Zonale (€/MWh)": "€ {:,.2f}",
                            "Capture Rate (%)": "{:.1f}%",
                            "Ore P <= 0€": "{:.0f}"
                        }),
                        use_container_width=True
                    )

                with pv_tabs[1]:
                    st.subheader("Dettaglio Annuale")
                    y_df = bt_res["yearly_df"]
                    
                    fig_y = px.bar(
                        y_df,
                        x="anno",
                        y="ricavo_eur",
                        labels={"ricavo_eur": "Ricavi (€)", "anno": "Anno"},
                        title="Ricavi Annuali Totali (€)",
                        text_auto=True
                    )
                    st.plotly_chart(fig_y, use_container_width=True)

                    st.dataframe(
                        y_df.rename(columns={
                            "anno": "Anno",
                            "produzione_mwh": "Produzione (MWh)", "ricavo_eur": "Ricavi (€)",
                            "prezzo_catturato_eur_mwh": "Prezzo Catturato (€/MWh)",
                            "prezzo_medio_zonale_eur_mwh": "Prezzo Zonale (€/MWh)",
                            "capture_rate_pct": "Capture Rate (%)", "ore_zero_prezzo": "Ore P <= 0€"
                        }).style.format({
                            "Produzione (MWh)": "{:,.2f}",
                            "Ricavi (€)": "€ {:,.2f}",
                            "Prezzo Catturato (€/MWh)": "€ {:,.2f}",
                            "Prezzo Zonale (€/MWh)": "€ {:,.2f}",
                            "Capture Rate (%)": "{:.1f}%",
                            "Ore P <= 0€": "{:.0f}"
                        }),
                        use_container_width=True
                    )

                with pv_tabs[2]:
                    st.subheader("Confronto Prezzo Catturato vs Prezzo Medio Zonale per Trimestre")
                    fig_cap = go.Figure()
                    fig_cap.add_trace(go.Bar(
                        x=q_df["anno_trimestre"], y=q_df["prezzo_catturato_eur_mwh"],
                        name="Prezzo Catturato FTV (€/MWh)", marker_color="#f39c12"
                    ))
                    fig_cap.add_trace(go.Bar(
                        x=q_df["anno_trimestre"], y=q_df["prezzo_medio_zonale_eur_mwh"],
                        name="Prezzo Medio Zonale MGP (€/MWh)", marker_color="#2980b9"
                    ))
                    fig_cap.update_layout(barmode="group", yaxis_title="€/MWh", hovermode="x unified")
                    st.plotly_chart(fig_cap, use_container_width=True)

                with pv_tabs[3]:
                    st.subheader("📥 Download Report per Stampa e Archiviazione (5 Anni)")
                    st.markdown("Genera e scarica i report completi della valutazione eseguita:")

                    excel_data = generate_excel_report(bt_res)
                    pdf_data = generate_pdf_report(bt_res)

                    d_col1, d_col2 = st.columns(2)
                    with d_col1:
                        st.download_button(
                            label="📊 Scarica Report Completo in Excel (.xlsx)",
                            data=excel_data,
                            file_name=f"Report_FTV_{zone_pv}_{plant_name.replace(' ', '_')}_{s_date}_{e_date}.xlsx",
                            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            type="primary",
                            use_container_width=True
                        )
                        st.caption("Include: Sintesi Executive, Dettaglio Trimestrale (20+ trimestri), Dettaglio Annuale, Dettaglio Mensile e Serie Oraria.")

                    with d_col2:
                        st.download_button(
                            label="📄 Scarica Report PDF Ufficiale (.pdf)",
                            data=pdf_data,
                            file_name=f"Report_FTV_{zone_pv}_{plant_name.replace(' ', '_')}_{s_date}_{e_date}.pdf",
                            mime="application/pdf",
                            type="primary",
                            use_container_width=True
                        )
                        st.caption("Include: Documento impaginato A4 con tabelle di sintesi e dettagli per trimestre.")

            except Exception as e:
                st.error(f"Errore durante l'esecuzione del backtest: {e}")
        else:
            st.info("Imposta i parametri a sinistra per avviare la simulazione.")

# ----------------------------------------------------
# TAB 1: DATI A 15 MINUTI (QUARTO D'ORA)
# ----------------------------------------------------
with tabs[1]:
    st.subheader("Granularità a 15 Minuti (96 Periodi al Giorno) - Regime 2025 / 2026")
    st.info("💡 Dal 2025, il mercato MGP in Italia adotta la granularità al quarto d'ora (Market Time Unit di 15 minuti) in conformità al regolamento europeo CACM.")

    if df_15 is not None:
        c1, c2, c3 = st.columns([2, 2, 2])
        with c1:
            zones_15 = [z for z in ["NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD", "CALA"] if z in df_15.columns]
            sel_zones_15 = st.multiselect("Zone di Mercato (15 min):", zones_15, default=["NORD", "SUD", "SICI"], key="sel_15")
        with c2:
            min_15 = df_15.index.min().date()
            max_15 = df_15.index.max().date()
            d_range_15 = st.date_input("Periodo (15 min):", value=[max_15 - pd.Timedelta(days=7), max_15], min_value=min_15, max_value=max_15, key="date_15")
        with c3:
            show_profile = st.checkbox("Mostra Curva Media dei 96 Quarti d'Ora", value=True)

        if len(d_range_15) == 2 and sel_zones_15:
            s_d, e_d = d_range_15
            mask_15 = (df_15.index >= pd.to_datetime(s_d)) & (df_15.index <= pd.to_datetime(e_d) + pd.Timedelta(days=1))
            df_sub_15 = df_15.loc[mask_15]

            fig_15 = px.line(
                df_sub_15,
                x=df_sub_15.index,
                y=sel_zones_15,
                labels={"value": "Prezzo (€/MWh)", "timestamp": "Data e Quarto d'Ora"},
                title=f"Prezzi Zonali a 15 Minuti dal {s_d} al {e_d}"
            )
            fig_15.update_layout(hovermode="x unified", legend_title="Zona")
            st.plotly_chart(fig_15, use_container_width=True)

            if show_profile:
                st.subheader("Profilo dei 96 Quarti d'Ora (Curva Intra-Day)")
                profile_96 = df_sub_15.groupby("Periodo")[sel_zones_15].mean()
                
                fig_p96 = px.line(
                    profile_96,
                    x=profile_96.index,
                    y=sel_zones_15,
                    labels={"value": "Prezzo Medio (€/MWh)", "Periodo": "Quarto d'Ora (1 - 96)"},
                    title="Prezzo Medio per ogni Quarto d'Ora (Evidenza Duck Curve e picchi a 15 min)"
                )
                fig_p96.update_layout(xaxis=dict(tickmode="linear", tick0=1, dtick=4), hovermode="x unified")
                st.plotly_chart(fig_p96, use_container_width=True)
    else:
        st.warning("Dataset a 15 minuti non trovato.")

# ----------------------------------------------------
# TAB 2: SERIE STORICA ORARIA (2015-2026 - 5Y ROLLING)
# ----------------------------------------------------
with tabs[2]:
    st.subheader("Serie Storica Prezzi Zonali Orari (Fino a 5+ Anni)")
    if df_hour is not None:
        col1, col2, col3 = st.columns([2, 2, 2])
        with col1:
            zones_hour = [z for z in ["NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD", "CALA", "PUN"] if z in df_hour.columns]
            sel_zones_h = st.multiselect("Zone di Mercato:", zones_hour, default=["NORD", "SUD", "SICI"], key="sel_h")
        with col2:
            min_h = df_hour.index.min().date()
            max_h = df_hour.index.max().date()
            default_5y_h = max_h - pd.DateOffset(years=5)
            d_range_h = st.date_input("Intervallo Temporale (Default 5 Anni):", value=[default_5y_h.date(), max_h], min_value=min_h, max_value=max_h, key="date_h")
        with col3:
            freq_h = st.selectbox("Aggregazione:", ["Oraria (Completa)", "Media Giornaliera", "Media Settimanale", "Media Mensile"], index=1)

        if len(d_range_h) == 2 and sel_zones_h:
            s_h, e_h = d_range_h
            mask_h = (df_hour.index >= pd.to_datetime(s_h)) & (df_hour.index <= pd.to_datetime(e_h) + pd.Timedelta(days=1))
            df_sub_h = df_hour.loc[mask_h, sel_zones_h]

            if freq_h == "Media Giornaliera":
                df_p_h = df_sub_h.resample("D").mean()
            elif freq_h == "Media Settimanale":
                df_p_h = df_sub_h.resample("W").mean()
            elif freq_h == "Media Mensile":
                df_p_h = df_sub_h.resample("ME").mean()
            else:
                df_p_h = df_sub_h

            fig_h = px.line(df_p_h, x=df_p_h.index, y=sel_zones_h, labels={"value": "Prezzo (€/MWh)", "timestamp": "Data"},
                            title=f"Andamento Prezzo ({freq_h}) su 5 Anni")
            fig_h.update_layout(hovermode="x unified", legend_title="Zona")
            st.plotly_chart(fig_h, use_container_width=True)

# ----------------------------------------------------
# TAB 3: PREVISIONI & BACKTEST PREZZI
# ----------------------------------------------------
with tabs[3]:
    st.subheader("Validazione Out-of-Sample delle Previsioni (2025 - 2026)")
    
    col_z, col_p = st.columns([2, 4])
    with col_z:
        zone_eval = st.selectbox("Seleziona Zona da Analizzare:", ["NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD"], key="zone_bt")
        df_bt = load_backtest_data(zone_eval)
        
        if df_bt is not None:
            metric_file = MODELS_DIR / f"metrics_{zone_eval}.json"
            if metric_file.exists():
                with open(metric_file) as f:
                    m = json.load(f)
                st.metric("MAE (Errore Assoluto Medio)", f"{m['mae']} €/MWh")
                st.metric("WAPE (Errore % Ponderato)", f"{m['wape_pct']} %")
                st.metric("R² (Accuratezza Spiegata)", f"{m['r2']}")
                st.metric("RMSE", f"{m['rmse']} €/MWh")
    
    with col_p:
        if df_bt is not None:
            bt_dates = st.date_input("Periodo visualizzazione backtest:",
                                     value=[df_bt.index.max().date() - pd.Timedelta(days=14), df_bt.index.max().date()],
                                     min_value=df_bt.index.min().date(), max_value=df_bt.index.max().date(),
                                     key="bt_dates_tab3")
            if len(bt_dates) == 2:
                b_start, b_end = bt_dates
                mask_bt = (df_bt.index >= pd.to_datetime(b_start)) & (df_bt.index <= pd.to_datetime(b_end) + pd.Timedelta(days=1))
                df_bt_sub = df_bt.loc[mask_bt]

                p10_col = "pred_p10" if "pred_p10" in df_bt_sub.columns else "pred_q10"
                p90_col = "pred_p90" if "pred_p90" in df_bt_sub.columns else "pred_q90"

                fig_bt = go.Figure()
                fig_bt.add_trace(go.Scatter(x=df_bt_sub.index, y=df_bt_sub[p90_col], mode="lines", line=dict(width=0), showlegend=False, name="P90"))
                fig_bt.add_trace(go.Scatter(x=df_bt_sub.index, y=df_bt_sub[p10_col], mode="lines", line=dict(width=0), fill="tonexty", fillcolor="rgba(0, 150, 255, 0.15)", name="Intervallo Confidenza (P10-P90)"))
                fig_bt.add_trace(go.Scatter(x=df_bt_sub.index, y=df_bt_sub["pred_p50"], mode="lines", line=dict(color="#0066cc", width=2.5), name="Previsione P50"))
                fig_bt.add_trace(go.Scatter(x=df_bt_sub.index, y=df_bt_sub["actual"], mode="lines", line=dict(color="#e63946", width=2), name="Prezzo Reale MGP"))

                fig_bt.update_layout(title=f"Previsione Day-Ahead {zone_eval}", yaxis_title="€/MWh", xaxis_title="Data / Ora", hovermode="x unified")
                st.plotly_chart(fig_bt, use_container_width=True)

# ----------------------------------------------------
# TAB 4: API TESTER & CONNETTORI LIVE
# ----------------------------------------------------
with tabs[4]:
    st.subheader("Test Connettori API Live (ENTSO-E, Open-Meteo, GME)")
    
    api_choice = st.radio("Seleziona API da Testare:", ["☀️ Open-Meteo Solar & Weather API (Gratuito / No Key)", "⚡ ENTSO-E Transparency API", "🏛️ GME Web API Service"], horizontal=True)

    if "Open-Meteo" in api_choice:
        st.markdown("**Test Previsioni Meteo & Irraggiamento Solare per la Previsione Prezzi**")
        col_api1, col_api2 = st.columns([2, 4])
        with col_api1:
            test_zone = st.selectbox("Zona Geografica:", ["NORD", "CNOR", "CSUD", "SUD", "SICI", "SARD"])
            f_days = st.slider("Giorni di Previsione:", 1, 7, 3)
            btn_fetch_weather = st.button("🚀 Interroga API Open-Meteo", type="primary")
        
        with col_api2:
            if btn_fetch_weather:
                with st.spinner("Richiesta API in corso..."):
                    try:
                        df_weather = OpenMeteoEnergyClient.get_weather_forecast(test_zone, past_days=1, forecast_days=f_days)
                        st.success(f"Dati meteo ed energia ricevuti con successo per {test_zone} ({len(df_weather)} ore)!")
                        
                        fig_sol = px.line(df_weather, x=df_weather.index, y="direct_normal_irradiance",
                                          labels={"direct_normal_irradiance": "W/m²", "time": "Data e Ora"},
                                          title=f"Irraggiamento Solare Diretto ({test_zone}) - Driver per la Duck Curve")
                        st.plotly_chart(fig_sol, use_container_width=True)

                        fig_temp = px.line(df_weather, x=df_weather.index, y="temperature_2m",
                                           labels={"temperature_2m": "°C", "time": "Data e Ora"},
                                           title=f"Temperatura Prevista ({test_zone}) - Driver per la Domanda Elettrica")
                        st.plotly_chart(fig_temp, use_container_width=True)
                    except Exception as e:
                        st.error(f"Errore nella chiamata API: {e}")

    elif "ENTSO-E" in api_choice:
        st.markdown("**Connettore Ufficiale ENTSO-E Transparency Platform (Prezzi Day-Ahead a 15 e 60 min)**")
        st.info("Per ottenere il token gratuito, registrati su [transparency.entsoe.eu](https://transparency.entsoe.eu/) e vai in *My Profile > Web API Security Token*.")
        entsoe_key = st.text_input("Inserisci il tuo Security Token ENTSO-E:", type="password", placeholder="es. 12345678-abcd-1234-abcd-1234567890ab")
        if st.button("Testa Connessione ENTSO-E"):
            if not entsoe_key:
                st.warning("Inserisci prima il token.")
            else:
                client = EntsoeApiClient(api_key=entsoe_key)
                res = client.test_connection()
                if res["status"] == "success":
                    st.success(res["message"])
                    st.code(res.get("xml_sample", ""))
                else:
                    st.error(res["message"])

    elif "GME" in api_choice:
        st.markdown("**Connettore API GME (api.mercatoelettrico.org)**")
        st.markdown("""
        Il servizio API ufficiale del GME richiede credenziali rilasciate a seguito di richiesta formale inviata via PEC.
        - **Endpoint di Autenticazione**: `https://api.mercatoelettrico.org/api/v1/Auth`
        - **Endpoint Dati Mercato**: `https://api.mercatoelettrico.org/api/v1/RequestData`
        """)
        gme_user = st.text_input("Username GME API:")
        gme_pass = st.text_input("Password GME API:", type="password")
        if st.button("Testa Autenticazione GME"):
            client_gme = GmeApiClient(username=gme_user, password=gme_pass)
            res = client_gme.get_auth_token()
            if res["status"] == "success":
                st.success("Autenticato con successo! Token JWT ottenuto.")
            elif res["status"] == "info":
                st.info(res["message"])
            else:
                st.error(res["message"])

# ----------------------------------------------------
# TAB 5: DATABASE SQLITE & SCHEMA
# ----------------------------------------------------
with tabs[5]:
    st.subheader("Database SQLite Locale & Query SQL Interattive")
    st.markdown(f"Database pronto per la tua app: **`{SQLITE_DB}`**")

    if SQLITE_DB.exists():
        conn = sqlite3.connect(SQLITE_DB)
        
        st.markdown("##### Esegui una Query SQL di Test:")
        default_query = "SELECT * FROM prezzi_15min WHERE zona = 'SICI' ORDER BY timestamp DESC LIMIT 20;"
        query_input = st.text_area("Query SQL:", value=default_query, height=80)
        
        if st.button("Esegui Query SQL"):
            try:
                res_df = pd.read_sql_query(query_input, conn)
                st.dataframe(res_df, use_container_width=True)
                st.caption(f"Trovate {len(res_df)} righe.")
            except Exception as e:
                st.error(f"Errore SQL: {e}")
        conn.close()
    else:
        st.warning("Database SQLite non trovato.")
