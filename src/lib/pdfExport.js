import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

/**
 * Esporta il report di backtest in formato PDF stampabile A4
 */
export function exportToPDF(backtestData) {
  const { kpis, quarterlyStats, yearlyStats } = backtestData;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Colori Brand
  const primaryColor = [31, 78, 120]; // Navy Blue #1F4E78
  const grayColor = [100, 116, 139];

  // Intestazione
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...primaryColor);
  doc.text('REPORT VALUTAZIONE ECONOMICA IMPIANTO FOTOVOLTAICO', 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')} | Mercato del Giorno Prima (GME MGP) | 10app_prezzi_energia`, 14, 24);

  // Linea divisoria
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.5);
  doc.line(14, 27, 196, 27);

  // Tabella Sintesi Parametri e KPI
  const summaryBody = [
    [
      { content: 'Parametro Impianto', styles: { fontStyle: 'bold', fillColor: [217, 225, 242] } },
      { content: 'Valore', styles: { fontStyle: 'bold', fillColor: [217, 225, 242] } },
      { content: 'Indicatore Economico', styles: { fontStyle: 'bold', fillColor: [217, 225, 242] } },
      { content: 'Risultato', styles: { fontStyle: 'bold', fillColor: [217, 225, 242] } }
    ],
    ['Impianto', kpis.plantName, 'Produzione Totale', `${kpis.totalMwh.toLocaleString('it-IT', { maximumFractionDigits: 1 })} MWh`],
    ['Potenza Nominale', `${kpis.powerKw.toLocaleString('it-IT')} kWp`, 'Ricavi Totali Generati', `€ ${kpis.totalRevenueEur.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ['Zona di Mercato', kpis.zone, 'Prezzo Catturato Medio', `€ ${kpis.avgCapturedPriceEurMwh.toFixed(2)} /MWh`],
    ['Periodo Analizzato', `${kpis.startDate} -> ${kpis.endDate}`, 'Prezzo Medio Zonale MGP', `€ ${kpis.avgZonalPriceEurMwh.toFixed(2)} /MWh`],
    ['Ore Totali Analisi', `${kpis.totalHours.toLocaleString('it-IT')} ore`, 'Capture Rate Solare', `${kpis.avgCaptureRatePct.toFixed(1)}%`],
    ['Ore Prezzo <= 0 €', `${kpis.zeroPriceHours} ore`, 'Ricavo Specifico', `€ ${kpis.specificRevenueEurKwp.toFixed(2)} /kWp`]
  ];

  doc.autoTable({
    startY: 32,
    body: summaryBody,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 46 },
      2: { cellWidth: 48 },
      3: { cellWidth: 46 }
    }
  });

  // Tabella 1: Sintesi Annuale
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.text('1. Sintesi Annuale di Produzione e Ricavi', 14, doc.lastAutoTable.finalY + 9);

  const yearlyRows = yearlyStats.map(y => [
    y.year.toString(),
    y.prodMwh.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    `€ ${y.revenueEur.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `€ ${y.capturedPriceEurMwh.toFixed(2)}`,
    `€ ${y.avgZonalPriceEurMwh.toFixed(2)}`,
    `${y.captureRatePct.toFixed(1)}%`,
    y.zeroHours.toString()
  ]);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 12,
    head: [['Anno', 'Produzione (MWh)', 'Ricavi (€)', 'Prezzo Catturato', 'Prezzo Zonale', 'Capture Rate', 'Ore P <= 0€']],
    body: yearlyRows,
    theme: 'striped',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, halign: 'center' },
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' }
  });

  // Tabella 2: Dettaglio Trimestrale
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.text('2. Breakdown Trimestrale (Q1, Q2, Q3, Q4 su 5 Anni)', 14, doc.lastAutoTable.finalY + 9);

  const quarterlyRows = quarterlyStats.map(q => [
    q.period,
    q.quarter,
    q.prodMwh.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    `€ ${q.revenueEur.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `€ ${q.capturedPriceEurMwh.toFixed(2)}`,
    `€ ${q.avgZonalPriceEurMwh.toFixed(2)}`,
    `${q.captureRatePct.toFixed(1)}%`,
    q.zeroHours.toString()
  ]);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 12,
    head: [['Periodo', 'Trimestre', 'Produzione (MWh)', 'Ricavi (€)', 'Prezzo Catturato', 'Prezzo Zonale', 'Capture Rate', 'Ore P<=0€']],
    body: quarterlyRows,
    theme: 'striped',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 1.8, halign: 'center' },
    margin: { bottom: 15 }
  });

  // Note a piè di pagina
  const finalY = doc.lastAutoTable.finalY || 260;
  if (finalY < 275) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...grayColor);
    doc.text('Note: Il Prezzo Catturato è la media ponderata oraria della produzione solare. Il Capture Rate misura lo sconto/premio rispetto al prezzo medio zonale.', 14, finalY + 7);
  }

  // Download
  const filename = `Report_FTV_${kpis.zone}_${kpis.plantName.replace(/\s+/g, '_')}_${kpis.startDate}_${kpis.endDate}.pdf`;
  doc.save(filename);
}
