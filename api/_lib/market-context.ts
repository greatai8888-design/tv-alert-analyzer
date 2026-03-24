import { withRetry } from './retry.js'
import { cached } from './cache.js'
import { config } from './config.js'
import type { MarketContext } from './types.js'

export async function fetchMarketContext(): Promise<MarketContext | null> {
  return cached('market-context', config.CACHE_TTL_MARKET, async () => {
    try {
      const [sp500, vix] = await Promise.all([
        withRetry(() => fetchYahooQuote('^GSPC'), 2, 'S&P500'),
        withRetry(() => fetchYahooQuote('^VIX'), 2, 'VIX'),
      ])

      const sp500Trend = sp500.changePercent > 0.5 ? 'bullish'
        : sp500.changePercent < -0.5 ? 'bearish' : 'sideways'

      return {
        sp500Trend,
        vixLevel: vix.price,
        sectorPerformance: sp500.changePercent > 0 ? 'positive' : 'negative',
      }
    } catch {
      return null
    }
  })
}

async function fetchYahooQuote(symbol: string): Promise<{ price: number; changePercent: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  const data = await res.json()
  const meta = data.chart.result[0].meta
  return {
    price: meta.regularMarketPrice,
    changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
  }
}
