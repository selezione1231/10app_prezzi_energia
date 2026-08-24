/**
 * Motore di Backtest Economico FTV su prezzi zonali MGP
 */
export function runSolarBacktest(options) {
  const {
    pvgisRecords,
    marketPrices, // array da market_prices_recent.json
    powerKw = 1000,
    zone = 'SUD',
    startDate = '2021-01-01',
    endDate = '2026-07-31',
    priceFloor = 0,
    plantName = 'Impianto Fotovoltaico'
  } = options;

  // Crea una mappa oraria del profilo PVGIS: key = "M-D-H" -> kwh_per_kwp
  const pvMap = new Map();
  pvgisRecords.forEach(r => {
    const key = `${r.month}-${r.day}-${r.hour}`;
    pvMap.set(key, r.kwh_per_kwp);
  });

  const sStr = startDate.replace(/-/g, '') + '00';
  const eStr = endDate.replace(/-/g, '') + '23';

  // Filtra i prezzi storici nell'intervallo temporale richiesto
  const filteredPrices = marketPrices.filter(p => p.t >= sStr && p.t <= eStr);

  if (filteredPrices.length === 0) {
    throw new Error(`Nessun dato di prezzo zonale trovato tra ${startDate} e ${endDate}.`);
  }

  let totalMwh = 0;
  let totalRevenueEur = 0;
  let sumZonalPrice = 0;
  let countHours = 0;
  let zeroPriceHours = 0;
  let productionHours = 0;

  const quarterlyMap = new Map();
  const yearlyMap = new Map();
  const monthlyMap = new Map();
  const hourlyResults = [];

  filteredPrices.forEach(p => {
    const key = `${p.m}-${p.d}-${p.h}`;
    const kwhPerKwp = pvMap.get(key) || 0;

    const prodKwh = kwhPerKwp * powerKw;
    const prodMwh = prodKwh / 1000.0;
    const rawPrice = p[zone] !== undefined && p[zone] !== null ? p[zone] : (p['NORD'] || 100.0);
    const effectivePrice = Math.max(rawPrice, priceFloor);
    const revenueEur = prodMwh * effectivePrice;

    totalMwh += prodMwh;
    totalRevenueEur += revenueEur;
    sumZonalPrice += rawPrice;
    countHours++;

    if (prodMwh > 0) {
      productionHours++;
      if (rawPrice <= 0) {
        zeroPriceHours++;
      }
    }

    // Salva record orario
    hourlyResults.push({
      timestamp: `${p.t.substring(0, 4)}-${p.t.substring(4, 6)}-${p.t.substring(6, 8)} ${p.t.substring(8, 10)}:00`,
      year: p.y,
      quarter: `Q${p.q}`,
      month: p.m,
      day: p.d,
      hour: p.h,
      prodKwh,
      prodMwh,
      zonalPrice: rawPrice,
      effectivePrice,
      revenueEur
    });

    // Aggregazione Trimestrale
    const qKey = `${p.y}-Q${p.q}`;
    if (!quarterlyMap.has(qKey)) {
      quarterlyMap.set(qKey, {
        year: p.y,
        quarter: `Q${p.q}`,
        period: qKey,
        prodMwh: 0,
        revenueEur: 0,
        sumPrice: 0,
        count: 0,
        zeroHours: 0
      });
    }
    const qItem = quarterlyMap.get(qKey);
    qItem.prodMwh += prodMwh;
    qItem.revenueEur += revenueEur;
    qItem.sumPrice += rawPrice;
    qItem.count++;
    if (prodMwh > 0 && rawPrice <= 0) qItem.zeroHours++;

    // Aggregazione Annuale
    const yKey = `${p.y}`;
    if (!yearlyMap.has(yKey)) {
      yearlyMap.set(yKey, {
        year: p.y,
        prodMwh: 0,
        revenueEur: 0,
        sumPrice: 0,
        count: 0,
        zeroHours: 0
      });
    }
    const yItem = yearlyMap.get(yKey);
    yItem.prodMwh += prodMwh;
    yItem.revenueEur += revenueEur;
    yItem.sumPrice += rawPrice;
    yItem.count++;
    if (prodMwh > 0 && rawPrice <= 0) yItem.zeroHours++;
  });

  // Calcolo statistiche trimestrali
  const quarterlyStats = Array.from(quarterlyMap.values()).map(q => {
    const capPrice = q.prodMwh > 0 ? q.revenueEur / q.prodMwh : 0;
    const avgZonal = q.count > 0 ? q.sumPrice / q.count : 0;
    const capRate = avgZonal > 0 ? (capPrice / avgZonal) * 100 : 0;
    return {
      ...q,
      capturedPriceEurMwh: capPrice,
      avgZonalPriceEurMwh: avgZonal,
      captureRatePct: capRate
    };
  }).sort((a, b) => a.period.localeCompare(b.period));

  // Calcolo statistiche annuali
  const yearlyStats = Array.from(yearlyMap.values()).map(y => {
    const capPrice = y.prodMwh > 0 ? y.revenueEur / y.prodMwh : 0;
    const avgZonal = y.count > 0 ? y.sumPrice / y.count : 0;
    const capRate = avgZonal > 0 ? (capPrice / avgZonal) * 100 : 0;
    return {
      ...y,
      capturedPriceEurMwh: capPrice,
      avgZonalPriceEurMwh: avgZonal,
      captureRatePct: capRate
    };
  }).sort((a, b) => a.year - b.year);

  const avgCapturedPrice = totalMwh > 0 ? totalRevenueEur / totalMwh : 0;
  const avgZonalPrice = countHours > 0 ? sumZonalPrice / countHours : 0;
  const avgCaptureRate = avgZonalPrice > 0 ? (avgCapturedPrice / avgZonalPrice) * 100 : 0;
  const specificRevenueKwp = powerKw > 0 ? totalRevenueEur / powerKw : 0;
  const equivalentHoursPerYear = countHours > 0 ? (totalMwh * 1000 / powerKw) / (countHours / 8760) : 0;

  return {
    kpis: {
      plantName,
      powerKw,
      zone,
      startDate,
      endDate,
      totalHours: countHours,
      totalMwh,
      totalRevenueEur,
      avgCapturedPriceEurMwh: avgCapturedPrice,
      avgZonalPriceEurMwh: avgZonalPrice,
      avgCaptureRatePct: avgCaptureRate,
      specificRevenueEurKwp: specificRevenueKwp,
      equivalentHoursPerYear,
      zeroPriceHours
    },
    quarterlyStats,
    yearlyStats,
    hourlyResults
  };
}
