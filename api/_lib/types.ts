export interface TradingViewAlert {
  ticker: string
  exchange?: string
  timeframe?: string
  price?: string
  volume?: string
  message?: string
}

export interface AnalysisResult {
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  summary: string
  entry_price: number | null
  stop_loss: number | null
  take_profit: number | null
  support_price: number | null
  resistance_price: number | null
  rsi: number | null
  sma_20: number | null
  sma_50: number | null
  sma_200: number | null
  macd_signal: string | null
  volume_trend: string | null
}

export interface MarketData {
  price: number
  open: number
  high: number
  low: number
  previousClose: number
  volume: number
  avgVolume: number
  marketCap: number
  pe: number
  eps: number
  week52High: number
  week52Low: number
  changePercent: number
}

export interface TechnicalIndicators {
  sma20: number
  sma50: number
  sma200: number
  rsi14: number
  macdLine: number
  macdSignal: number
  macdHistogram: number
  atr14: number
  bollingerUpper: number
  bollingerLower: number
  volumeRatio: number
  priceVsSma20: string
  priceVsSma50: string
  priceVsSma200: string
  goldenCross: boolean
  deathCross: boolean
}

export interface StockFullData {
  info: MarketData
  indicators: TechnicalIndicators
  recentCandles: { date: string; open: number; high: number; low: number; close: number; volume: number }[]
}

export interface NewsItem {
  title: string
  publisher: string
  link: string
  publishedAt: string
}

export interface MarketContext {
  sp500Trend: string
  vixLevel: number
  sectorPerformance: string
}

export interface ChartScreenshots {
  daily: string
  weekly: string
  intraday: string
}
