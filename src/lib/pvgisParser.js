/**
 * Parser per file di output PVGIS (CSV, TXT o JSON)
 */
export function parsePVGISFile(textData, filename = 'pvgis.csv') {
  const lines = textData.split(/\r?\n/);
  
  const metadata = {
    latitude: null,
    longitude: null,
    nominalPowerKw: 1.0,
    systemLossPct: 14.0,
    slopeDeg: null,
    azimuthDeg: null,
    filename: filename
  };

  // Cerca metadati nelle prime 35 righe
  for (let i = 0; i < Math.min(35, lines.length); i++) {
    const line = lines[i].trim();
    if (line.includes('Latitude')) {
      const match = line.match(/[-+]?\d*\.?\d+/);
      if (match) metadata.latitude = parseFloat(match[0]);
    } else if (line.includes('Longitude')) {
      const match = line.match(/[-+]?\d*\.?\d+/);
      if (match) metadata.longitude = parseFloat(match[0]);
    } else if (line.includes('Nominal power') || line.includes('Installed peak PV power')) {
      const match = line.match(/[-+]?\d*\.?\d+/);
      if (match) metadata.nominalPowerKw = parseFloat(match[0]);
    } else if (line.includes('Slope')) {
      const match = line.match(/[-+]?\d*\.?\d+/);
      if (match) metadata.slopeDeg = parseFloat(match[0]);
    } else if (line.includes('Azimuth')) {
      const match = line.match(/[-+]?\d*\.?\d+/);
      if (match) metadata.azimuthDeg = parseFloat(match[0]);
    }
  }

  // Trova la riga di intestazione delle colonne orarie
  let headerIdx = -1;
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    const l = lines[i].toLowerCase().trim();
    if (l.startsWith('time') || l.startsWith('date') || l.includes('time,p') || l.includes('time\tp') || l.includes('p (w)') || l.includes('g(i)')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    // Fallback: cerca riga con data o virgole
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      if (/\d{8}:\d{4}/.test(lines[i]) || /\d{4}-\d{2}-\d{2}/.test(lines[i])) {
        headerIdx = Math.max(0, i - 1);
        break;
      }
    }
  }

  if (headerIdx === -1) {
    throw new Error('Formato PVGIS non riconosciuto: impossibile identificare le colonne orarie.');
  }

  const headerLine = lines[headerIdx];
  const delimiter = headerLine.includes('\t') ? '\t' : (headerLine.includes(';') ? ';' : ',');
  const rawHeaders = headerLine.split(delimiter).map(c => c.replace(/["']/g, '').trim());

  let timeColIdx = -1;
  let pColIdx = -1;
  let giColIdx = -1;

  rawHeaders.forEach((h, idx) => {
    const hLow = h.toLowerCase();
    if (['time', 'date', 'timestamp', 'datetime'].includes(hLow) && timeColIdx === -1) {
      timeColIdx = idx;
    }
    if ((hLow === 'p' || hLow === 'p_w' || hLow === 'p(w)' || hLow === 'pv_power' || hLow === 'power') && pColIdx === -1) {
      pColIdx = idx;
    }
    if ((hLow.includes('g(i)') || hLow.includes('gi') || hLow.includes('irradiance') || hLow.includes('poa')) && giColIdx === -1) {
      giColIdx = idx;
    }
  });

  if (timeColIdx === -1) timeColIdx = 0;
  if (pColIdx === -1 && giColIdx === -1) pColIdx = 1;

  const records = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(delimiter).map(c => c.replace(/["']/g, '').trim());
    if (parts.length <= timeColIdx) continue;

    const timeStr = parts[timeColIdx];
    let month = 1, day = 1, hour = 1;

    // Parsing timestamp PVGIS: YYYYMMDD:HHMM o YYYY-MM-DD HH:MM
    if (timeStr.includes(':') && timeStr.split(':')[0].length === 8) {
      const dPart = timeStr.split(':')[0];
      const tPart = timeStr.split(':')[1];
      month = parseInt(dPart.substring(4, 6), 10);
      day = parseInt(dPart.substring(6, 8), 10);
      hour = parseInt(tPart.substring(0, 2), 10) + 1; // 1-24
    } else {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        month = d.getMonth() + 1;
        day = d.getDate();
        hour = d.getHours() + 1;
      }
    }

    let pVal = 0;
    if (pColIdx !== -1 && parts[pColIdx]) {
      pVal = parseFloat(parts[pColIdx]) || 0;
    } else if (giColIdx !== -1 && parts[giColIdx]) {
      const gi = parseFloat(parts[giColIdx]) || 0;
      pVal = (gi / 1000.0) * 0.86; // Stima kW per kWp
    }

    // Se P è in Watt (es. > 50), converti in kWh/kWp
    let kwhPerKwp = pVal > 50 ? pVal / 1000.0 : pVal;
    kwhPerKwp = Math.max(0, kwhPerKwp);

    records.push({
      month,
      day,
      hour,
      kwh_per_kwp: kwhPerKwp
    });
  }

  return {
    metadata,
    records
  };
}

/**
 * Genera un profilo solare tipo (8760 ore) per test rapidi
 */
export function generateSyntheticPVProfile(latitude = 41.0) {
  const records = [];
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  let dayOfYear = 1;
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth[m - 1]; d++) {
      const declination = 23.45 * Math.sin((360 / 365 * (dayOfYear - 81)) * (Math.PI / 180));
      const seasonalFactor = 0.6 + 0.4 * Math.sin((360 / 365 * (dayOfYear - 81)) * (Math.PI / 180));

      for (let h = 1; h <= 24; h++) {
        const solarNoon = 12.5;
        const hourAngle = (h - solarNoon) * 15;
        const latRad = latitude * (Math.PI / 180);
        const decRad = declination * (Math.PI / 180);
        const haRad = hourAngle * (Math.PI / 180);

        let sinElev = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
        sinElev = Math.max(0, Math.min(1, sinElev));

        const baseProd = Math.pow(sinElev, 1.1) * 0.85;
        const kwhPerKwp = Math.max(0, baseProd * seasonalFactor);

        records.push({
          month: m,
          day: d,
          hour: h,
          kwh_per_kwp: kwhPerKwp
        });
      }
      dayOfYear++;
    }
  }

  return {
    metadata: {
      latitude,
      nominalPowerKw: 1.0,
      filename: 'Profilo_Solare_Tipico_Italia.csv'
    },
    records
  };
}
