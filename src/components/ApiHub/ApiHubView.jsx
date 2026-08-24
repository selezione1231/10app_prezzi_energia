import React, { useState } from 'react'
import { fetchLiveSolarForecast, testGMEAuthentication, fetchEntsoePrices, ZONE_COORDINATES } from '../../lib/gmeClient'
import { Zap, Sun, Shield, Globe, Key, Play, AlertCircle, CheckCircle2, CloudSun, ArrowRight } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

export default function ApiHubView() {
  const [activeApi, setActiveApi] = useState('openmeteo') // 'openmeteo' | 'gme' | 'entsoe'

  // Open-Meteo State
  const [selectedZone, setSelectedZone] = useState('SUD')
  const [forecastDays, setForecastDays] = useState(3)
  const [solarData, setSolarData] = useState(null)
  const [loadingSolar, setLoadingSolar] = useState(false)

  // GME State
  const [gmeUser, setGmeUser] = useState('')
  const [gmePass, setGmePass] = useState('')
  const [gmeResult, setGmeResult] = useState(null)
  const [loadingGme, setLoadingGme] = useState(false)

  // ENTSO-E State
  const [entsoeToken, setEntsoeToken] = useState('')
  const [entsoeZone, setEntsoeZone] = useState('NORD')
  const [entsoeResult, setEntsoeResult] = useState(null)
  const [loadingEntsoe, setLoadingEntsoe] = useState(false)

  // Esegui chiamata Open-Meteo
  async function handleFetchSolar() {
    try {
      setLoadingSolar(true)
      const res = await fetchLiveSolarForecast(selectedZone, forecastDays)
      setSolarData(res)
    } catch (err) {
      alert('Errore API Solar: ' + err.message)
    } finally {
      setLoadingSolar(false)
    }
  }

  // Testa credenziali GME
  async function handleTestGME(e) {
    e.preventDefault()
    setLoadingGme(true)
    try {
      const res = await testGMEAuthentication(gmeUser, gmePass)
      setGmeResult(res)
    } catch (err) {
      setGmeResult({ status: 'error', message: err.message })
    } finally {
      setLoadingGme(false)
    }
  }

  // Testa ENTSO-E
  async function handleTestEntsoe(e) {
    e.preventDefault()
    setLoadingEntsoe(true)
    try {
      const res = await fetchEntsoePrices(entsoeToken, entsoeZone)
      setEntsoeResult(res)
    } catch (err) {
      setEntsoeResult({ status: 'error', message: err.message })
    } finally {
      setLoadingEntsoe(false)
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-6 h-6 text-blue-600" />
              <span>Connettori API Live (GME, Open-Meteo & ENTSO-E)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Collegamento in tempo reale ai flussi di mercato e alle previsioni meteo-solari per le zone italiane.
            </p>
          </div>

          {/* API Switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setActiveApi('openmeteo')}
              className={`py-1.5 px-3 text-xs font-semibold rounded-lg transition ${
                activeApi === 'openmeteo' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ☀️ Open-Meteo Solar (Free)
            </button>
            <button
              onClick={() => setActiveApi('gme')}
              className={`py-1.5 px-3 text-xs font-semibold rounded-lg transition ${
                activeApi === 'gme' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏛️ GME Web Service
            </button>
            <button
              onClick={() => setActiveApi('entsoe')}
              className={`py-1.5 px-3 text-xs font-semibold rounded-lg transition ${
                activeApi === 'entsoe' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⚡ ENTSO-E Platform
            </button>
          </div>
        </div>

        {/* CONTENUTO TAB 1: OPEN-METEO */}
        {activeApi === 'openmeteo' && (
          <div className="mt-6 space-y-6">
            <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-100 text-xs text-blue-800 flex items-start gap-3">
              <CloudSun className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <b>API Live Gratuita (Senza Chiave):</b> Interroga i modelli satellitari e le previsioni meteo orarie ad alta risoluzione per calcolare l'irraggiamento diretto e inclinato ($W/m^2$) atteso sui pannelli solari nei prossimi giorni.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="w-48">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Zona Geografica</label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                >
                  {Object.entries(ZONE_COORDINATES).map(([k, v]) => (
                    <option key={k} value={k}>{k} - {v.name}</option>
                  ))}
                </select>
              </div>

              <div className="w-36">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Giorni Previsione</label>
                <select
                  value={forecastDays}
                  onChange={(e) => setForecastDays(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                >
                  <option value={2}>2 Giorni (48h)</option>
                  <option value={3}>3 Giorni (72h)</option>
                  <option value={7}>7 Giorni (168h)</option>
                </select>
              </div>

              <div className="pt-5">
                <button
                  onClick={handleFetchSolar}
                  disabled={loadingSolar}
                  className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center gap-2 transition disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>{loadingSolar ? 'Interrogazione API...' : 'Scarica Previsione Irraggiamento'}</span>
                </button>
              </div>
            </div>

            {solarData && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-900">
                  Profilo Irraggiamento Solare Previsto: {solarData.zone} ({solarData.coords.name} - Lat: {solarData.coords.lat}°)
                </h4>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={solarData.forecast} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} tickFormatter={(t) => t.substring(5, 16)} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(val, name) => [`${val} W/m²`, name === 'directIrradiance' ? 'Irraggiamento Diretto' : 'Irraggiamento Inclinato FTV']} />
                      <Legend />
                      <Line type="monotone" dataKey="directIrradiance" name="Irraggiamento Diretto (W/m²)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="globalTiltedIrradiance" name="Irraggiamento su Pannelli FTV (W/m²)" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONTENUTO TAB 2: GME */}
        {activeApi === 'gme' && (
          <div className="mt-6 space-y-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed">
              <b>Servizio Web API del Gestore Mercati Energetici (GME):</b><br />
              Permette l'accesso automatico Machine-to-Machine agli esiti dei mercati MGP, MI e MSD mediante autenticazione JWT su <code>api.mercatoelettrico.org</code>.
            </div>

            <form onSubmit={handleTestGME} className="max-w-md space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Username GME API
                </label>
                <input
                  type="text"
                  value={gmeUser}
                  onChange={(e) => setGmeUser(e.target.value)}
                  placeholder="Username fornito da GME"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Password GME API
                </label>
                <input
                  type="password"
                  value={gmePass}
                  onChange={(e) => setGmePass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>

              <button
                type="submit"
                disabled={loadingGme}
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center gap-2 transition disabled:opacity-50"
              >
                <Shield className="w-4 h-4" />
                <span>{loadingGme ? 'Verifica in corso...' : 'Testa Connessione GME'}</span>
              </button>
            </form>

            {gmeResult && (
              <div className={`p-4 rounded-xl text-xs ${
                gmeResult.status === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}>
                {gmeResult.message}
              </div>
            )}
          </div>
        )}

        {/* CONTENUTO TAB 3: ENTSO-E */}
        {activeApi === 'entsoe' && (
          <div className="mt-6 space-y-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed">
              <b>ENTSO-E Transparency Platform Web API:</b><br />
              Piattaforma ufficiale europea che replica in tempo reale tutti i prezzi e volumi del mercato elettrico italiano (Day-Ahead & Intraday) per ogni zona fisica a 15 e 60 minuti.
            </div>

            <form onSubmit={handleTestEntsoe} className="max-w-lg space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Security Token ENTSO-E
                </label>
                <input
                  type="password"
                  value={entsoeToken}
                  onChange={(e) => setEntsoeToken(e.target.value)}
                  placeholder="es. 12345678-abcd-1234-abcd-1234567890ab"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Zona di Mercato
                </label>
                <select
                  value={entsoeZone}
                  onChange={(e) => setEntsoeZone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="NORD">NORD (10Y1001A1001A73I)</option>
                  <option value="CNOR">CNOR (10Y1001A1001A70O)</option>
                  <option value="CSUD">CSUD (10Y1001A1001A71M)</option>
                  <option value="SUD">SUD (10Y1001A1001A788)</option>
                  <option value="SICI">SICI (10Y1001A1001A75E)</option>
                  <option value="SARD">SARD (10Y1001A1001A74G)</option>
                  <option value="CALA">CALA (10Y1001C--00096J)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loadingEntsoe}
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center gap-2 transition disabled:opacity-50"
              >
                <Key className="w-4 h-4" />
                <span>{loadingEntsoe ? 'Download Prezzi in corso...' : 'Interroga Prezzi Day-Ahead ENTSO-E'}</span>
              </button>
            </form>

            {entsoeResult && (
              <div className="p-4 rounded-xl text-xs bg-slate-100 text-slate-800 border border-slate-200">
                <p className="font-semibold mb-2">Stato Risposta API:</p>
                <pre className="max-h-40 overflow-y-auto text-[10px] font-mono bg-white p-2 rounded border border-slate-300">
                  {entsoeResult.rawXml ? entsoeResult.rawXml.substring(0, 1000) : entsoeResult.message}
                </pre>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
