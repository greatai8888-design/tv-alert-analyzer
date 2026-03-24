export interface Alert {
  id: string
  user_id: string
  ticker: string
  exchange: string | null
  timeframe: string | null
  price: number | null
  action: string
  message: string | null
  raw_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
  analyses?: Analysis[]
}

export interface Analysis {
  id: string
  alert_id: string
  user_id: string
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
  market_context: Record<string, unknown> | null
  news_context: Record<string, unknown> | null
  chart_urls: Record<string, string> | null
  model_used: string | null
  prompt_version: string | null
  raw_response: Record<string, unknown> | null
  created_at: string
}

export interface TrackedTrade {
  id: string
  user_id: string
  analysis_id: string
  ticker: string
  recommendation: 'BUY' | 'SELL'
  entry_price: number
  current_price: number | null
  stop_loss: number | null
  take_profit: number | null
  status: 'tracking' | 'success' | 'failed' | 'expired'
  pnl_percent: number | null
  resolved_at: string | null
  expires_at: string
  confidence: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Lesson {
  id: string
  user_id: string
  trade_id: string | null
  ticker: string
  lesson_type: string
  lesson_text: string
  key_takeaway: string
  tags: string[]
  original_analysis: Record<string, unknown> | null
  market_conditions: Record<string, unknown> | null
  relevance_score: number
  times_used: number
  created_at: string
}

export interface Favorite {
  id: string
  user_id: string
  alert_id: string
  note: string | null
  created_at: string
  alert?: Alert
}

export interface TradingStats {
  total: number
  tracking: number
  success: number
  failed: number
  expired: number
  winRate: number
  avgPnl: number
  totalPnl: number
}

export interface TradingViewAlert {
  ticker: string
  exchange?: string
  timeframe?: string
  price?: string
  volume?: string
  message?: string
}
