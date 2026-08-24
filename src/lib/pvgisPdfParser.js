import * as pdfjsLib from 'pdfjs-dist'

// Imposta worker per PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

/**
 * Estrae il testo completo da un file PDF in ArrayBuffer
 */
export async function extractTextFromPDF(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdfDoc = await loadingTask.promise
  let fullText = ''

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map(item => item.str).join(' ')
    fullText += pageText + '\n'
  }

  return fullText
}

/**
 * Parser per estrarre metadati e produzione mensile/annuale da un PDF di PVGIS
 */
export async function parsePVGISPdf(arrayBuffer, filename = 'pvgis.pdf') {
  const rawText = await extractTextFromPDF(arrayBuffer)
  
  const metadata = {
    filename,
    latitude: 41.0,
    longitude: 14.0,
    nominalPowerKw: 1.0,
    slopeDeg: 30,
    azimuthDeg: 0,
    yearlyKwh: 0,
    monthlyKwh: new Array(12).fill(0),
    isFromPdf: true
  }

  // 1. Estrazione Latitudine & Longitudine
  const latMatch = rawText.match(/Latitude[:\s]+([-+]?\d*\.?\d+)/i) || rawText.match(/Lat[:\s]+([-+]?\d*\.?\d+)/i)
  if (latMatch) metadata.latitude = parseFloat(latMatch[1])

  const lonMatch = rawText.match(/Longitude[:\s]+([-+]?\d*\.?\d+)/i) || rawText.match(/Lon[:\s]+([-+]?\d*\.?\d+)/i)
  if (lonMatch) metadata.longitude = parseFloat(lonMatch[1])

  // 2. Potenza nominale
  const kwMatch = rawText.match(/Nominal power(?: of the PV system)?[:\s]+([-+]?\d*\.?\d+)\s*(?:kWp|kW|Wp|W)?/i) ||
                  rawText.match(/Potenza nominale[:\s]+([-+]?\d*\.?\d+)/i) ||
                  rawText.match(/Installed peak PV power[:\s]+([-+]?\d*\.?\d+)/i)
  if (kwMatch) {
    let kw = parseFloat(kwMatch[1])
    if (kw > 5000) kw = kw / 1000.0 // Se in Watt
    metadata.nominalPowerKw = kw
  }

  // 3. Slope & Azimuth
  const slopeMatch = rawText.match(/Slope[:\s]+([-+]?\d*\.?\d+)/i) || rawText.match(/Inclinazione[:\s]+([-+]?\d*\.?\d+)/i)
  if (slopeMatch) metadata.slopeDeg = parseFloat(slopeMatch[1])

  const azMatch = rawText.match(/Azimuth[:\s]+([-+]?\d*\.?\d+)/i) || rawText.match(/Orientamento[:\s]+([-+]?\d*\.?\d+)/i)
  if (azMatch) metadata.azimuthDeg = parseFloat(azMatch[1])

  // 4. Produzione Annuale Totale (kWh)
  const yearlyMatch = rawText.match(/Yearly PV energy production[:\s]+([-+]?[\d,\.]+)\s*k?Wh/i) ||
                      rawText.match(/Produzione annuale[:\s]+([-+]?[\d,\.]+)\s*k?Wh/i) ||
                      rawText.match(/Yearly in-plane irradiation[:\s]+([-+]?[\d,\.]+)/i)
  if (yearlyMatch) {
    const cleanNum = yearlyMatch[1].replace(/,/g, '')
    metadata.yearlyKwh = parseFloat(cleanNum) || 0
  }

  // 5. Estrazione Mesi (Jan .. Dec o Gennaio .. Dicembre)
  const monthsEn = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const monthsIt = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

  // Cerca numeri che seguono i nomi dei mesi
  const textLower = rawText.toLowerCase()
  let foundMonthsCount = 0

  for (let m = 0; m < 12; m++) {
    const mNameEn = monthsEn[m]
    const mNameIt = monthsIt[m]
    
    // Cerca occorrenza del mese
    let regex = new RegExp(`(?:${mNameEn}|${mNameIt})[\\s:]+([\\d\\.,]+)`, 'i')
    let match = rawText.match(regex)
    if (match) {
      let val = parseFloat(match[1].replace(/,/g, ''))
      if (!isNaN(val) && val > 0) {
        metadata.monthlyKwh[m] = val
        foundMonthsCount++
      }
    }
  }

  // Ricostruisci il profilo orario a 8.760 ore proporzionalmente calibrato sui dati PDF
  const records = generateHourlyFromMonthly(metadata)

  return {
    metadata,
    records,
    rawTextPreview: rawText.substring(0, 500)
  }
}

/**
 * Calibra le 8.760 ore solari dell'anno per matchare la produzione mensile/annuale estratta dal PDF
 */
function generateHourlyFromMonthly(metadata) {
  const { latitude, monthlyKwh, yearlyKwh, nominalPowerKw } = metadata
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const records = []

  let dayOfYear = 1
  for (let m = 1; m <= 12; m++) {
    const targetMonthlyKwh = monthlyKwh[m - 1] > 0
      ? monthlyKwh[m - 1]
      : (yearlyKwh > 0 ? (yearlyKwh / 12) * (0.6 + 0.8 * Math.sin((m - 3) * (Math.PI / 6))) : 100 * nominalPowerKw)

    const monthHours = []
    let monthSumBase = 0

    for (let d = 1; d <= daysInMonth[m - 1]; d++) {
      const declination = 23.45 * Math.sin((360 / 365 * (dayOfYear - 81)) * (Math.PI / 180))
      
      for (let h = 1; h <= 24; h++) {
        const solarNoon = 12.5
        const hourAngle = (h - solarNoon) * 15
        const latRad = latitude * (Math.PI / 180)
        const decRad = declination * (Math.PI / 180)
        const haRad = hourAngle * (Math.PI / 180)

        let sinElev = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)
        sinElev = Math.max(0, Math.min(1, sinElev))

        const baseVal = Math.pow(sinElev, 1.15)
        monthSumBase += baseVal
        monthHours.push({ month: m, day: d, hour: h, baseVal })
      }
      dayOfYear++
    }

    // Scala le ore del mese per ottenere esattamente targetMonthlyKwh (in kWh per 1 kWp)
    const scaleFactor = monthSumBase > 0 ? (targetMonthlyKwh / (nominalPowerKw || 1.0)) / monthSumBase : 0

    monthHours.forEach(hr => {
      records.push({
        month: hr.month,
        day: hr.day,
        hour: hr.hour,
        kwh_per_kwp: Math.max(0, hr.baseVal * scaleFactor)
      })
    })
  }

  return records
}
