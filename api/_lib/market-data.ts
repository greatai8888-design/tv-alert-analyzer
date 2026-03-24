/**
 * Fetch real-time stock data and calculate technical indicators
 * using Yahoo Finance API (no API key needed)
 */

import { withRetry } from './retry'
import { cached } from './cache'
import { config } from './config'
import type { StockFullData } from './types'

export async function fetchStockData(ticker: string): Promise<StockFullData | null> {
  return cached(`market-${ticker}`, config.CACHE_TTL_MARKET, async () => {
    try {
      // Fetch 6 months of daily data from Yahoo Finance
      const end = Math.floor(Date.now() / 1000)
      const start = end - 180 * 24 * 60 * 60 // 6 months
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${start}&period2=${end}&interval=1d`

      const res = await withRetry(() => fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }), 3, 'Yahoo Finance')
      const data: any = await res.json()

      const result = data.chart?.result?.[0]
      if (!result) return null

      const meta = result.meta
      const quotes = result.indicators.quote[0]
      const timestamps = result.timestamp

      if (!timestamps || timestamps.length < 20) return null

      const closes: number[] = quotes.close.filter((c: number | null) => c !== null)
      const highs: number[] = quotes.high.filter((h: number | null) => h !== null)
      const lows: number[] = quotes.low.filter((l: number | null) => l !== null)
      const volumes: number[] = quotes.volume.filter((v: number | null) => v !== null)

      const currentPrice = meta.regularMarketPrice || closes[closes.length - 1]
      const previousClose = meta.previousClose || closes[closes.length - 2]

      // Calculate indicators
      const sma20 = sma(closes, 20)
      const sma50 = sma(closes, 50)
      const sma200 = sma(closes, 200)
      const rsi14 = rsi(closes, 14)
      const { macdLine, signal: macdSignal, histogram: macdHistogram } = macd(closes)
      const atr14 = atr(highs, lows, closes, 14)
      const { upper: bollingerUpper, lower: bollingerLower } = bollingerBands(closes, 20, 2)
      const avgVol = sma(volumes, 20)
      const currentVol = volumes[volumes.length - 1]

      // Recent candles (last 10)
      const recentCandles = []
      const len = timestamps.length
      for (let i = Math.max(0, len - 10); i < len; i++) {
        if (quotes.close[i] !== null) {
          recentCandles.push({
            date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
            open: round(quotes.open[i]),
            high: round(quotes.high[i]),
            low: round(quotes.low[i]),
            close: round(quotes.close[i]),
            volume: quotes.volume[i],
          })
        }
      }

      return {
        info: {
          price: round(currentPrice),
          open: round(quotes.open[len - 1] || currentPrice),
          high: round(quotes.high[len - 1] || currentPrice),
          low: round(quotes.low[len - 1] || currentPrice),
          previousClose: round(previousClose),
          volume: currentVol,
          avgVolume: Math.round(avgVol),
          marketCap: meta.marketCap || 0,
          pe: round(meta.pe || 0),
          eps: round(meta.eps || 0),
          week52High: round(Math.max(...highs)),
          week52Low: round(Math.min(...lows)),
          changePercent: round(((currentPrice - previousClose) / previousClose) * 100),
        },
        indicators: {
          sma20: round(sma20),
          sma50: round(sma50),
          sma200: round(sma200),
          rsi14: round(rsi14),
          macdLine: round(macdLine),
          macdSignal: round(macdSignal),
          macdHistogram: round(macdHistogram),
          atr14: round(atr14),
          bollingerUpper: round(bollingerUpper),
          bollingerLower: round(bollingerLower),
          volumeRatio: round(avgVol > 0 ? currentVol / avgVol : 1),
          priceVsSma20: currentPrice > sma20 ? 'Above' : 'Below',
          priceVsSma50: currentPrice > sma50 ? 'Above' : 'Below',
          priceVsSma200: currentPrice > sma200 ? 'Above' : 'Below',
          goldenCross: sma50 > sma200,
          deathCross: sma50 < sma200,
        },
        recentCandles,
      }
    } catch (e) {
      console.error('Failed to fetch stock data:', e)
      return null
    }
  })
}

// --- Technical Indicator Calculations ---

function sma(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0
  const slice = data.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const emaArr: number[] = [data[0]]
  for (let i = 1; i < data.length; i++) {
    emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k))
  }
  return emaArr
}

function rsi(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains += diff
    else losses -= diff
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

function macd(closes: number[]): { macdLine: number; signal: number; histogram: number } {
  if (closes.length < 26) return { macdLine: 0, signal: 0, histogram: 0 }
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const macdLine = ema12.map((v, i) => v - ema26[i])
  const signalLine = ema(macdLine.slice(-9), 9)
  const ml = macdLine[macdLine.length - 1]
  const sl = signalLine[signalLine.length - 1]
  return { macdLine: ml, signal: sl, histogram: ml - sl }
}

function atr(highs: number[], lows: number[], closes: number[], period: number): number {
  if (highs.length < period + 1) return 0
  const trs: number[] = []
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    )
    trs.push(tr)
  }
  return sma(trs, period)
}

function bollingerBands(closes: number[], period: number, mult: number): { upper: number; lower: number } {
  const mean = sma(closes, period)
  const slice = closes.slice(-period)
  const variance = slice.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / period
  const stdDev = Math.sqrt(variance)
  return { upper: mean + mult * stdDev, lower: mean - mult * stdDev }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
