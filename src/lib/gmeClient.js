/**
 * Client per API GME, Open-Meteo Solar e ENTSO-E
 */

export const GME_API_BASE = 'https://api.mercatoelettrico.org/api/v1'

export const ZONE_COORDINATES = {
  NORD: { lat: 45.4642, lon: 9.1900, name: 'Milano / Nord' },
  CNOR: { lat: 43.7696, lon: 11.2558, name: 'Firenze / Centro Nord' },
  CSUD: { lat: 41.9028, lon: 12.4964, name: 'Roma / Centro Sud' },
  SUD: { lat: 41.1171, lon: 16.8719, name: 'Bari / Sud' },
  SICI: { lat: 37.5079, lon: 15.0873, name: 'Catania / Sicilia' },
  SARD: { lat: 39.2238, lon: 9.1217, name: 'Cagliari / Sardegna' },
  CALA: { lat: 38.9098, lon: 16.5877, name: 'Catanzaro / Calabria' }
}

/**
 * 1. Open-Meteo Solar Forecast API (Live & Free)
 */
export async function fetchLiveSolarForecast(zone = 'SUD', forecastDays = 3) {
  const coords = ZONE_COORDINATES[zone] || ZONE_COORDINATES.SUD
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,direct_normal_irradiance,global_tilted_irradiance,cloudcover,shortwave_radiation&forecast_days=${forecastDays}&timezone=auto`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Errore chiamata Open-Meteo (${response.status})`)
  }

  const data = await response.json()
  const hourly = data.hourly || {}
  const times = hourly.time || []
  
  const results = times.map((t, idx) => ({
    time: t,
    temperature: hourly.temperature_2m?.[idx],
    directIrradiance: hourly.direct_normal_irradiance?.[idx] || 0,
    globalTiltedIrradiance: hourly.global_tilted_irradiance?.[idx] || 0,
    cloudcover: hourly.cloudcover?.[idx] || 0,
    shortwave: hourly.shortwave_radiation?.[idx] || 0
  }))

  return {
    zone,
    coords,
    elevation: data.elevation,
    forecast: results
  }
}

/**
 * 2. GME API Web Service Client
 */
export async function testGMEAuthentication(username, password) {
  if (!username || !password) {
    throw new Error('Inserisci sia Username che Password rilasciati dal GME.')
  }

  try {
    const response = await fetch(`${GME_API_BASE}/Auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        Username: username,
        Password: password
      })
    })

    if (response.ok) {
      const data = await response.json()
      return {
        status: 'success',
        token: data.Token || data.token,
        message: 'Autenticazione GME riuscita con successo!'
      }
    } else {
      return {
        status: 'info',
        message: `Risposta GME (${response.status}): I servizi API ufficiali GME richiedono IP accreditato o convenzione formale via PEC.`
      }
    }
  } catch (err) {
    return {
      status: 'info',
      message: `Nota di connessione GME: ${err.message}. I dati sono sincronizzati tramite il nostro dataset verificato 2015-2026.`
    }
  }
}

/**
 * 3. ENTSO-E Transparency Platform Client (Prezzi Day-Ahead)
 */
export async function fetchEntsoePrices(securityToken, zone = 'SUD', date = '2026-08-24') {
  if (!securityToken) {
    throw new Error('Token ENTSO-E mancante. Registrati gratuitamente su transparency.entsoe.eu.')
  }

  const eicMap = {
    NORD: '10Y1001A1001A73I',
    CNOR: '10Y1001A1001A70O',
    CSUD: '10Y1001A1001A71M',
    SUD: '10Y1001A1001A788',
    SICI: '10Y1001A1001A75E',
    SARD: '10Y1001A1001A74G',
    CALA: '10Y1001C--00096J'
  }

  const inDomain = eicMap[zone] || eicMap.NORD
  const sDate = date.replace(/-/g, '') + '0000'
  const eDate = date.replace(/-/g, '') + '2300'

  const url = `https://web-api.tp.entsoe.eu/api?documentType=A44&in_Domain=${inDomain}&out_Domain=${inDomain}&periodStart=${sDate}&periodEnd=${eDate}&securityToken=${securityToken}`

  try {
    const response = await fetch(url)
    const text = await response.text()
    return {
      status: response.ok ? 'success' : 'error',
      rawXml: text
    }
  } catch (err) {
    throw new Error(`Errore chiamata ENTSO-E: ${err.message}`)
  }
}
