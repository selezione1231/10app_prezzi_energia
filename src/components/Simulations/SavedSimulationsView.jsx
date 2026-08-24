import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { exportToExcel } from '../../lib/excelExport'
import { exportToPDF } from '../../lib/pdfExport'
import { Bookmark, FileSpreadsheet, FileText, Trash2, Calendar, Zap, Euro, RefreshCw } from 'lucide-react'

export default function SavedSimulationsView({ user }) {
  const [simulations, setSimulations] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchSimulations() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('10app_simulations')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSimulations(data || [])
    } catch (err) {
      console.error('Errore caricamento simulazioni:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSimulations()
  }, [])

  async function handleDelete(id) {
    if (!confirm('Sei sicuro di voler eliminare questa simulazione?')) return

    try {
      const { error } = await supabase
        .from('10app_simulations')
        .delete()
        .eq('id', id)

      if (error) throw error
      setSimulations(simulations.filter(s => s.id !== id))
    } catch (err) {
      alert('Errore eliminazione: ' + err.message)
    }
  }

  function handleDownloadExcel(sim) {
    const mockBacktestData = {
      kpis: {
        plantName: sim.plant_name,
        powerKw: sim.power_kw,
        zone: sim.zone,
        startDate: sim.start_date,
        endDate: sim.end_date,
        totalHours: 43800,
        totalMwh: sim.tot_mwh || 0,
        totalRevenueEur: sim.tot_revenue_eur || 0,
        avgCapturedPriceEurMwh: sim.captured_price_eur_mwh || 0,
        avgZonalPriceEurMwh: sim.zonal_price_avg_eur_mwh || 0,
        avgCaptureRatePct: sim.capture_rate_pct || 0,
        specificRevenueEurKwp: sim.power_kw > 0 ? (sim.tot_revenue_eur / sim.power_kw) : 0,
        equivalentHoursPerYear: 1200,
        zeroPriceHours: sim.zero_price_hours || 0
      },
      quarterlyStats: sim.quarterly_data || [],
      yearlyStats: sim.yearly_data || [],
      hourlyResults: []
    }
    exportToExcel(mockBacktestData)
  }

  function handleDownloadPDF(sim) {
    const mockBacktestData = {
      kpis: {
        plantName: sim.plant_name,
        powerKw: sim.power_kw,
        zone: sim.zone,
        startDate: sim.start_date,
        endDate: sim.end_date,
        totalHours: 43800,
        totalMwh: sim.tot_mwh || 0,
        totalRevenueEur: sim.tot_revenue_eur || 0,
        avgCapturedPriceEurMwh: sim.captured_price_eur_mwh || 0,
        avgZonalPriceEurMwh: sim.zonal_price_avg_eur_mwh || 0,
        avgCaptureRatePct: sim.capture_rate_pct || 0,
        specificRevenueEurKwp: sim.power_kw > 0 ? (sim.tot_revenue_eur / sim.power_kw) : 0,
        equivalentHoursPerYear: 1200,
        zeroPriceHours: sim.zero_price_hours || 0
      },
      quarterlyStats: sim.quarterly_data || [],
      yearlyStats: sim.yearly_data || []
    }
    exportToPDF(mockBacktestData)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Bookmark className="w-6 h-6 text-blue-600" />
              <span>Simulazioni Salvate su Supabase</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Registro delle valutazioni economiche salvate nel database aziendale (tabella <code className="text-blue-600 font-semibold">10app_simulations</code>).
            </p>
          </div>

          <button
            onClick={fetchSimulations}
            className="p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition border border-slate-200"
            title="Ricarica elenco"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Caricamento simulazioni in corso...
          </div>
        ) : simulations.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Bookmark className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-medium text-slate-600">Nessuna simulazione salvata.</p>
            <p className="text-xs text-slate-400">Esegui una valutazione FTV e clicca sul pulsante Salva per archiviarla qui.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 mt-4">
            {simulations.map((sim) => (
              <div key={sim.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 rounded-xl p-3 transition">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-base">{sim.plant_name}</h4>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                      {sim.zone}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Potenza: <b>{sim.power_kw} kWp</b></span>
                    <span>Periodo: <b>{sim.start_date} → {sim.end_date}</b></span>
                    <span>Salvato il: <b>{new Date(sim.created_at).toLocaleDateString('it-IT')}</b></span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-700 pt-1">
                    <span className="text-emerald-700">Ricavi: <b>€ {sim.tot_revenue_eur?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</b></span>
                    <span className="text-blue-700">Prezzo Catturato: <b>€ {sim.captured_price_eur_mwh?.toFixed(2)} /MWh</b></span>
                    <span className="text-indigo-700">Capture Rate: <b>{sim.capture_rate_pct?.toFixed(1)}%</b></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadExcel(sim)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 transition"
                    title="Scarica Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Excel</span>
                  </button>

                  <button
                    onClick={() => handleDownloadPDF(sim)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg border border-rose-200 transition"
                    title="Scarica PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>

                  <button
                    onClick={() => handleDelete(sim.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Elimina"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
