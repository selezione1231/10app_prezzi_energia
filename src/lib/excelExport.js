import * as XLSX from 'xlsx'

/**
 * Esporta il report di backtest in formato Excel (.xlsx) a 4 fogli
 */
export function exportToExcel(backtestData) {
  const { kpis, quarterlyStats, yearlyStats, hourlyResults } = backtestData;
  const wb = XLSX.utils.book_new();

  // 1. Foglio: Executive Summary
  const summaryRows = [
    ['REPORT VALUTAZIONE ECONOMICA IMPIANTO FOTOVOLTAICO'],
    [`Generato il ${new Date().toLocaleDateString('it-IT')} | Mercato Elettrico MGP Italia`],
    [],
    ['PARAMETRI IMPIANTO', '', 'INDICATORI ECONOMICI & PRESTAZIONALI', ''],
    ['Nome Impianto', kpis.plantName, 'Produzione Totale (MWh)', kpis.totalMwh],
    ['Potenza Nominale (kWp)', kpis.powerKw, 'Ricavi Totali (€)', kpis.totalRevenueEur],
    ['Zona di Mercato', kpis.zone, 'Prezzo Catturato Medio (€/MWh)', kpis.avgCapturedPriceEurMwh],
    ['Data Inizio', kpis.startDate, 'Prezzo Medio Zonale MGP (€/MWh)', kpis.avgZonalPriceEurMwh],
    ['Data Fine', kpis.endDate, 'Capture Rate (%)', `${kpis.avgCaptureRatePct.toFixed(1)}%`],
    ['Ore Analizzate', kpis.totalHours, 'Ricavo Specifico (€/kWp)', kpis.specificRevenueEurKwp],
    ['', '', 'Ore Equivalenti Annue (h/anno)', kpis.equivalentHoursPerYear],
    ['', '', 'Ore con Prezzo <= 0 €', kpis.zeroPriceHours]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // 2. Foglio: Breakdown Trimestrale
  const qRows = [
    ['Anno', 'Trimestre', 'Periodo', 'Produzione (MWh)', 'Ricavi (€)', 'Prezzo Catturato (€/MWh)', 'Prezzo Zonale (€/MWh)', 'Capture Rate (%)', 'Ore Prezzo <= 0 €']
  ];
  quarterlyStats.forEach(q => {
    qRows.push([
      q.year,
      q.quarter,
      q.period,
      Math.round(q.prodMwh * 100) / 100,
      Math.round(q.revenueEur * 100) / 100,
      Math.round(q.capturedPriceEurMwh * 100) / 100,
      Math.round(q.avgZonalPriceEurMwh * 100) / 100,
      `${q.captureRatePct.toFixed(1)}%`,
      q.zeroHours
    ]);
  });
  const wsQuarterly = XLSX.utils.aoa_to_sheet(qRows);
  XLSX.utils.book_append_sheet(wb, wsQuarterly, 'Breakdown Trimestrale');

  // 3. Foglio: Breakdown Annuale
  const yRows = [
    ['Anno', 'Produzione (MWh)', 'Ricavi (€)', 'Prezzo Catturato (€/MWh)', 'Prezzo Zonale (€/MWh)', 'Capture Rate (%)', 'Ore Prezzo <= 0 €']
  ];
  yearlyStats.forEach(y => {
    yRows.push([
      y.year,
      Math.round(y.prodMwh * 100) / 100,
      Math.round(y.revenueEur * 100) / 100,
      Math.round(y.capturedPriceEurMwh * 100) / 100,
      Math.round(y.avgZonalPriceEurMwh * 100) / 100,
      `${y.captureRatePct.toFixed(1)}%`,
      y.zeroHours
    ]);
  });
  const wsYearly = XLSX.utils.aoa_to_sheet(yRows);
  XLSX.utils.book_append_sheet(wb, wsYearly, 'Breakdown Annuale');

  // 4. Foglio: Dati Orari Dettagliati
  const hRows = [
    ['Timestamp', 'Anno', 'Mese', 'Giorno', 'Ora', 'Produzione (kWh)', 'Produzione (MWh)', 'Prezzo Zonale (€/MWh)', 'Prezzo Effettivo (€/MWh)', 'Ricavo (€)']
  ];
  hourlyResults.forEach(h => {
    hRows.push([
      h.timestamp,
      h.year,
      h.month,
      h.day,
      h.hour,
      Math.round(h.prodKwh * 100) / 100,
      Math.round(h.prodMwh * 10000) / 10000,
      h.zonalPrice,
      h.effectivePrice,
      Math.round(h.revenueEur * 100) / 100
    ]);
  });
  const wsHourly = XLSX.utils.aoa_to_sheet(hRows);
  XLSX.utils.book_append_sheet(wb, wsHourly, 'Dati Orari Dettaglio');

  // Download
  const filename = `Report_FTV_${kpis.zone}_${kpis.plantName.replace(/\s+/g, '_')}_${kpis.startDate}_${kpis.endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}
