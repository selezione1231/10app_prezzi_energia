import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { parsePVGISFile, generateSyntheticPVProfile } from '../../lib/pvgisParser'
import { runSolarBacktest } from '../../lib/solarBacktest'
import { exportToExcel } from '../../lib/excelExport'
import { exportToPDF } from '../../lib/pdfExport'
import {
  Sun, Upload, Play, FileSpreadsheet, FileText, Save, CheckCircle2,
  TrendingUp, Zap, Euro, Clock, AlertTriangle, ArrowUpRight, BarChart2
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

export default function SolarValuationView({ user }) {
  // Input State
  const [plantName, setPlantName] = useState('Parco Solare FTV 1')
  const [powerKw, setPowerKw] = useState(1000)
  const [zone, setZone] = useState('SUD')
  const [uploadMode, setUploadMode] = useState('synthetic') // 'upload' | 'synthetic'
  const [pvgisData, setPvgisData] = useState(null)
  const [fileName, setFileName] = useState('')
  const [presetPeriod, setPresetPeriod] = useState('5y')
  const [startDate, setStartDate] = useState('2021-08-01')
  const [endDate, setEndDate] = useState('2026-07-31')
  const [priceFloor, setPriceFloor] = useState(0)

  // Market data & execution state
  const [marketPrices, setMarketPrices] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [computing, setComputing] = useState(false)
  const [backtestResult, setBacktestResult] = useState(null)
  const [saveStatus, setSaveStatus] = useState('')

  // Carica i dati dei prezzi recenti (2020-2026) da public/data/market_prices_recent.json
  useEffect(() => {
    async function loadPrices() {
      try {
        setLoadingData(true)
        const res = await fetch('/data/market_prices_recent.json')
        if (!res.ok) throw new Error('Impossibile caricare il dataset dei prezzi.')
        const data = await res.json()
        setMarketPrices(data)
      } catch (err) {
        console.error('Errore caricamento prezzi:', err)
      } finally {
        setLoadingData(false)
      }
    }
    loadPrices()
  }, [])

  // Gestione preset temporale
  function handlePresetChange(val) {
    setPresetPeriod(val)
    const maxDateStr = '2026-07-31'
    if (val === '5y') {
      setStartDate('2021-08-01')
      setEndDate(maxDateStr)
    } else if (val === '3y') {
      setStartDate('2023-08-01')
      setEndDate(maxDateStr)
    } else if (val === 'all') {
      setStartDate('2020-01-01')
      setEndDate(maxDateStr)
    }
  }

  // Upload file PVGIS
  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result
        const parsed = parsePVGISFile(text, file.name)
        setPvgisData(parsed)
        if (parsed.metadata.nominalPowerKw && parsed.metadata.nominalPowerKw !== 1) {
          setPowerKw(parsed.metadata.nominalPowerKw)
        }
      } catch (err) {
        alert('Errore nel file PVGIS: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  // Esegui simulazione
  function handleRunBacktest() {
    if (marketPrices.length === 0) {
      alert('I dati di mercato si stanno ancora caricando...')
      return
    }

    setComputing(true)
    setSaveStatus('')

    try {
      let activePvgis = pvgisData
      if (!activePvgis || uploadMode === 'synthetic') {
        const lat = zone === 'SICI' ? 37.5 : (zone === 'SUD' || zone === 'CALA' || zone === 'CSUD' ? 41.0 : 45.0)
        activePvgis = generateSyntheticPVProfile(lat)
      }

      const res = runSolarBacktest({
        pvgisRecords: activePvgis.records,
        marketPrices,
        powerKw: parseFloat(powerKw) || 1000,
        zone,
        startDate,
        endDate,
        priceFloor: parseFloat(priceFloor) || 0,
        plantName
      })

      setBacktestResult(res)
    } catch (err) {
      console.error(err)
      alert('Errore nel calcolo del backtest: ' + err.message)
    } finally {
      setComputing(false)
    }
  }

  // Esegui automaticamente una prima simulazione una volta caricati i dati
  useEffect(() => {
    if (marketPrices.length > 0 && !backtestResult) {
      handleRunBacktest()
    }
  }, [marketPrices])

  // Salva simulazione su Supabase (10app_simulations)
  async function handleSaveSimulation() {
    if (!backtestResult) return
    setSaveStatus('saving')

    try {
      const { kpis, quarterlyStats, yearlyStats } = backtestResult
      const payload = {
        user_id: user?.id || null,
        plant_name: kpis.plantName,
        power_kw: kpis.powerKw,
        zone: kpis.zone,
        start_date: kpis.startDate,
        end_date: kpis.endDate,
        price_floor_eur: priceFloor,
        tot_mwh: kpis.totalMwh,
        tot_revenue_eur: kpis.totalRevenueEur,
        captured_price_eur_mwh: kpis.avgCapturedPriceEurMwh,
        zonal_price_avg_eur_mwh: kpis.avgZonalPriceEurMwh,
        capture_rate_pct: kpis.avgCaptureRatePct,
        zero_price_hours: kpis.zeroPriceHours,
        quarterly_data: quarterlyStats,
        yearly_data: yearlyStats
      }

      const { error } = await supabase.from('10app_simulations').insert(payload)
      if (error) throw error
      setSaveStatus('success')
      setTimeout(() => setSaveStatus(''), 4000)
    } catch (err) {
      console.error('Errore salvataggio simulazione:', err)
      alert('Errore nel salvataggio su Supabase: ' + err.message)
      setSaveStatus('error')
    }
  }

  const kpis = backtestResult?.kpis
  const quarterly = backtestResult?.quarterlyStats || []
  const yearly = backtestResult?.yearlyStats || []

  return (
    <div className="space-y-8">
      
      {/* Intro Header */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl p-6 sm:p-8 text-white shadow-lg">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 text-xs font-semibold uppercase tracking-wider mb-3">
            <Sun className="w-4 h-4 text-amber-400" />
            Valutazione Economica Impianti FTV
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Backtest Ricavi & Prezzo Catturato Solare (Range fino a 5 Anni)
          </h2>
          <p className="text-blue-100 text-sm mt-2 leading-relaxed">
            Incrocia la curva di produzione solare PVGIS con i prezzi orari reali del mercato zonale MGP.
            Calcola la scomposizione per <b>trimestre (Q1..Q4)</b> e per <b>anno</b>, il <i>Capture Rate</i> e genera i report per la stampa in <b>Excel</b> e <b>PDF</b>.
          </p>
        </div>
      </div>

      {/* Grid: Form a sinistra, Risultati a destra */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* COLONNA SINISTRA: PARAMETRI (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Zap className="w-5 h-5 text-blue-600" />
              <span>1. Parametri Impianto</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Nome Impianto
              </label>
              <input
                type="text"
                value={plantName}
                onChange={(e) => setPlantName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Potenza (kWp)
                </label>
                <input
                  type="number"
                  min="1"
                  step="50"
                  value={powerKw}
                  onChange={(e) => setPowerKw(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Zona MGP
                </label>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                >
                  <option value="NORD">NORD (Nord Italia)</option>
                  <option value="CNOR">CNOR (Centro Nord)</option>
                  <option value="CSUD">CSUD (Centro Sud)</option>
                  <option value="SUD">SUD (Sud Italia)</option>
                  <option value="SICI">SICI (Sicilia)</option>
                  <option value="SARD">SARD (Sardegna)</option>
                  <option value="CALA">CALA (Calabria)</option>
                </select>
              </div>
            </div>

            {/* Profilo PVGIS */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                2. Profilo Solare (PVGIS)
              </label>
              
              <div className="flex rounded-xl bg-slate-100 p-1 mb-3">
                <button
                  type="button"
                  onClick={() => setUploadMode('synthetic')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    uploadMode === 'synthetic'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ☀️ Profilo Standard
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('upload')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    uploadMode === 'upload'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📁 Carica PVGIS
                </button>
              </div>

              {uploadMode === 'upload' ? (
                <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-4 text-center transition bg-slate-50">
                  <input
                    type="file"
                    id="pvgis-file-input"
                    accept=".csv,.txt,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <label htmlFor="pvgis-file-input" className="cursor-pointer block">
                    <Upload className="w-7 h-7 text-blue-600 mx-auto mb-1.5" />
                    <span className="text-xs font-medium text-blue-600 hover:underline">
                      {fileName || 'Trascina qui il file PVGIS (.csv/.txt)'}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">File orario PVGIS-SARAH2 o PVGIS-ERA5</p>
                  </label>
                </div>
              ) : (
                <p className="text-xs text-slate-500 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                  Viene utilizzato un profilo solare tipo (8.760 ore) calibrato sulla radiazione specifica della zona <b>{zone}</b>.
                </p>
              )}
            </div>

            {/* Periodo di Backtest */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                3. Periodo Storico di Valutazione
              </label>

              <div className="grid grid-cols-3 gap-1.5 mb-3">
                <button
                  type="button"
                  onClick={() => handlePresetChange('5y')}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg border transition ${
                    presetPeriod === '5y'
                      ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  🎯 5 Anni
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetChange('3y')}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg border transition ${
                    presetPeriod === '3y'
                      ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  📅 3 Anni
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetChange('all')}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg border transition ${
                    presetPeriod === 'all'
                      ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  🏆 Completo
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-slate-500">Da</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value)
                      setPresetPeriod('custom')
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">A</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value)
                      setPresetPeriod('custom')
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Price floor */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Prezzo Minimo Floor (€/MWh - Opzionale)
              </label>
              <input
                type="number"
                min="0"
                step="5"
                value={priceFloor}
                onChange={(e) => setPriceFloor(e.target.value)}
                placeholder="es. 0 o 40 per PMG"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleRunBacktest}
              disabled={computing || loadingData}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{computing ? 'Elaborazione in corso...' : 'Esegui Valutazione Economica'}</span>
            </button>
          </div>
        </div>

        {/* COLONNA DESTRA: RISULTATI, GRAFICI E DOWNLOAD (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {kpis ? (
            <>
              {/* Header Risultato & Action Bar */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{kpis.plantName}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Potenza: <b>{kpis.powerKw.toLocaleString('it-IT')} kWp</b> • Zona: <b>{kpis.zone}</b> • Periodo: <b>{kpis.startDate} → {kpis.endDate}</b> ({kpis.totalHours.toLocaleString('it-IT')} ore)
                  </p>
                </div>

                {/* Pulsanti Download e Salva */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => exportToExcel(backtestResult)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition"
                    title="Scarica Report Excel con formule e fogli multipli"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Excel (.xlsx)</span>
                  </button>

                  <button
                    onClick={() => exportToPDF(backtestResult)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-sm transition"
                    title="Scarica Report PDF stampabile A4"
                  >
                    <FileText className="w-4 h-4" />
                    <span>PDF (.pdf)</span>
                  </button>

                  <button
                    onClick={handleSaveSimulation}
                    className="p-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-xl border border-slate-200 transition"
                    title="Salva simulazione su Supabase"
                  >
                    {saveStatus === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* KPI CARDS GRID */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Ricavi Totali</span>
                    <Euro className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    € {kpis.totalRevenueEur.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Specifico: <b>€ {kpis.specificRevenueEurKwp.toFixed(2)} /kWp</b>
                  </p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Produzione Totale</span>
                    <Zap className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {kpis.totalMwh.toLocaleString('it-IT', { maximumFractionDigits: 1 })} <span className="text-sm font-normal text-slate-500">MWh</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Equivalenti: <b>{Math.round(kpis.equivalentHoursPerYear)} h/anno</b>
                  </p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Prezzo Catturato</span>
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    € {kpis.avgCapturedPriceEurMwh.toFixed(2)} <span className="text-xs font-normal text-slate-500">/MWh</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Zonale MGP: € {kpis.avgZonalPriceEurMwh.toFixed(2)} /MWh
                  </p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Capture Rate</span>
                    <BarChart2 className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {kpis.avgCaptureRatePct.toFixed(1)}%
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ore Prezzo 0€: <b>{kpis.zeroPriceHours} ore</b>
                  </p>
                </div>
              </div>

              {/* GRAFICO & TABELLA TRIMESTRALE (Q1-Q4) */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-blue-600" />
                    <span>Breakdown Trimestrale (Q1..Q4 fino a 5 Anni)</span>
                  </h4>
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    {quarterly.length} Trimestri Analizzati
                  </span>
                </div>

                {/* Grafico Recharts */}
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={quarterly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(val, name) => [
                          name === 'ricavoEur' ? `€ ${val.toLocaleString('it-IT', { maximumFractionDigits: 0 })}` : `${val.toFixed(2)} €/MWh`,
                          name === 'ricavoEur' ? 'Ricavi Totali' : 'Prezzo Catturato'
                        ]}
                      />
                      <Legend />
                      <Bar dataKey="revenueEur" name="Ricavi (€)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Tabella Dati Trimestrali */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Periodo</th>
                        <th className="py-2.5 px-3 text-right">Produzione (MWh)</th>
                        <th className="py-2.5 px-3 text-right">Ricavi (€)</th>
                        <th className="py-2.5 px-3 text-right">Prezzo Catturato</th>
                        <th className="py-2.5 px-3 text-right">Prezzo Zonale</th>
                        <th className="py-2.5 px-3 text-right">Capture Rate</th>
                        <th className="py-2.5 px-3 text-right">Ore P ≤ 0€</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quarterly.map((q) => (
                        <tr key={q.period} className="hover:bg-slate-50/80 transition">
                          <td className="py-2 px-3 font-semibold text-slate-900">{q.period}</td>
                          <td className="py-2 px-3 text-right">{q.prodMwh.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-medium text-emerald-700">€ {q.revenueEur.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-semibold text-blue-600">€ {q.capturedPriceEurMwh.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right">€ {q.avgZonalPriceEurMwh.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right">{q.captureRatePct.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right font-medium text-amber-600">{q.zeroHours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SINTESI ANNUALE */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
                <h4 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Sintesi Annuale di Produzione e Ricavi
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Anno</th>
                        <th className="py-2.5 px-3 text-right">Produzione (MWh)</th>
                        <th className="py-2.5 px-3 text-right">Ricavi Totali (€)</th>
                        <th className="py-2.5 px-3 text-right">Prezzo Catturato (€/MWh)</th>
                        <th className="py-2.5 px-3 text-right">Prezzo Medio Zonale</th>
                        <th className="py-2.5 px-3 text-right">Capture Rate (%)</th>
                        <th className="py-2.5 px-3 text-right">Ore P ≤ 0€</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {yearly.map((y) => (
                        <tr key={y.year} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-3 font-bold text-slate-900 text-sm">{y.year}</td>
                          <td className="py-2.5 px-3 text-right font-medium">{y.prodMwh.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700">€ {y.revenueEur.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-blue-600">€ {y.capturedPriceEurMwh.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right">€ {y.avgZonalPriceEurMwh.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-semibold">{y.captureRatePct.toFixed(1)}%</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-amber-600">{y.zeroHours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400">
              <Sun className="w-12 h-12 mx-auto text-amber-400 mb-3 animate-pulse" />
              <h4 className="text-base font-semibold text-slate-700">Pronto per la simulazione</h4>
              <p className="text-xs text-slate-500 mt-1">Imposta i parametri a sinistra e clicca su "Esegui Valutazione Economica".</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
