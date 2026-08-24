import React, { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, Clock, Calendar, Zap, AlertCircle } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

export default function MarketExplorerView() {
  const [dailyPrices, setDailyPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedZones, setSelectedZones] = useState(['NORD', 'SUD', 'SICI'])
  const [timeRange, setTimeRange] = useState('3y') // '1y', '3y', '5y', 'all'

  const zonesList = ['NORD', 'CNOR', 'CSUD', 'SUD', 'SICI', 'SARD', 'CALA']

  const colors = {
    NORD: '#2563eb',
    CNOR: '#0284c7',
    CSUD: '#059669',
    SUD: '#d97706',
    SICI: '#dc2626',
    SARD: '#9333ea',
    CALA: '#e11d48'
  }

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const res = await fetch('/data/market_prices_daily.json')
        if (res.ok) {
          const data = await res.json()
          setDailyPrices(data)
        }
      } catch (err) {
        console.error('Errore caricamento dati giornalieri:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  function toggleZone(z) {
    if (selectedZones.includes(z)) {
      if (selectedZones.length > 1) {
        setSelectedZones(selectedZones.filter(item => item !== z))
      }
    } else {
      setSelectedZones([...selectedZones, z])
    }
  }

  // Filtra per intervallo
  const filteredData = dailyPrices.filter(p => {
    if (!p.date) return false
    const d = new Date(p.date)
    const now = new Date('2026-07-31')
    if (timeRange === '1y') {
      return d >= new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    } else if (timeRange === '3y') {
      return d >= new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
    } else if (timeRange === '5y') {
      return d >= new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())
    }
    return true
  })

  // Campiona i dati se troppo densi per performance fluida
  const sampledData = filteredData.filter((_, idx) => idx % (timeRange === 'all' ? 7 : (timeRange === '5y' ? 4 : 2)) === 0)

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              <span>Esplorazione Prezzi Mercato Zonale (MGP)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Serie storiche ufficiali GME con aggregazione giornaliera e granularità a 15 minuti dal 2025.
            </p>
          </div>

          {/* Time Filter */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1">
            {[
              { id: '1y', label: '1 Anno' },
              { id: '3y', label: '3 Anni' },
              { id: '5y', label: '5 Anni' },
              { id: 'all', label: 'Tutto' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTimeRange(t.id)}
                className={`py-1 px-3 text-xs font-semibold rounded-lg transition ${
                  timeRange === t.id
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Zone Selector Chips */}
        <div className="flex flex-wrap items-center gap-2 mt-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Zone:</span>
          {zonesList.map(z => {
            const isSelected = selectedZones.includes(z)
            return (
              <button
                key={z}
                onClick={() => toggleZone(z)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm'
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {z}
              </button>
            )
          })}
        </div>

        {/* Grafico Recharts */}
        <div className="h-96 w-full mt-6">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              Caricamento dati di mercato...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sampledData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val, name) => [`€ ${val?.toFixed(2)} /MWh`, `Zona ${name}`]}
                />
                <Legend />
                {selectedZones.map(z => (
                  <Line
                    key={z}
                    type="monotone"
                    dataKey={z}
                    name={z}
                    stroke={colors[z] || '#2563eb'}
                    dot={false}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Info Card Granularità a 15 minuti */}
      <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200 text-amber-900 flex items-start gap-4">
        <Clock className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
        <div>
          <h4 className="text-sm font-bold">Risoluzione al Quarto d'Ora (15 minuti) - Regime 2025 / 2026</h4>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            In conformità alle direttive europee del Market Coupling (CACM), dal 1° Gennaio 2025 l'Italia applica 96 periodi di contrattazione oraria al giorno.
            I calcoli di backtest e valutazione economica FTV tengono conto del profilo intra-orario per identificare i momenti di picco di offerta e prezzi negativi/nulli.
          </p>
        </div>
      </div>
    </div>
  )
}
