import { config } from './config.js'
import { adminClient } from './supabase.js'
import { fetchStockData } from './market-data.js'
import type { AnalysisResult } from './types.js'

export interface TrackedTrade {
  id: string
  analysis_id: string
  user_id: string
  ticker: string
  recommendation: 'BUY' | 'SELL'
  entry_price: number
  stop_loss: number
  take_profit: number
  confidence: number
  status: 'tracking' | 'success' | 'failed' | 'expired'
  current_price: number
  notes: string
  pnl_percent: number
  created_at: string
  resolved_at: string | null
  expires_at: string
}

/**
 * Auto-track a trade if it meets criteria (BUY/SELL with confidence >= MIN_CONFIDENCE)
 */
export async function autoTrackTrade(
  userId: string,
  analysisId: string,
  ticker: string,
  analysis: AnalysisResult
): Promise<TrackedTrade | null> {
  // Only track BUY/SELL with sufficient confidence
  if (analysis.recommendation === 'HOLD') return null
  if (analysis.confidence < config.MIN_CONFIDENCE) return null

  // Parse prices — entry_price, stop_loss, take_profit are numeric in new schema
  // but may be strings when coming from AI response text; handle both cases
  const entry = typeof analysis.entry_price === 'number'
    ? analysis.entry_price
    : parsePrice(String(analysis.entry_price))
  const sl = typeof analysis.stop_loss === 'number'
    ? analysis.stop_loss
    : parsePrice(String(analysis.stop_loss))
  const tp = typeof analysis.take_profit === 'number'
    ? analysis.take_profit
    : parsePrice(String(analysis.take_profit))

  if (!entry || !sl || !tp) return null

  const expiresAt = new Date(
    Date.now() + config.MAX_TRACKING_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data, error } = await adminClient
    .from('tracked_trades')
    .insert({
      analysis_id: analysisId,
      user_id: userId,
      ticker,
      recommendation: analysis.recommendation,
      entry_price: entry,
      stop_loss: sl,
      take_profit: tp,
      confidence: analysis.confidence,
      current_price: entry,
      status: 'tracking',
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create tracked trade:', error)
    return null
  }

  return data
}

/**
 * Check all active tracked trades against current prices.
 * Returns trades that have been resolved (success/failed/expired).
 */
export async function checkTrackedTrades(): Promise<TrackedTrade[]> {
  const { data: trades } = await adminClient
    .from('tracked_trades')
    .select('*')
    .eq('status', 'tracking')

  if (!trades || trades.length === 0) return []

  const resolved: TrackedTrade[] = []

  for (const trade of trades) {
    const result = await checkSingleTrade(trade)
    if (result) resolved.push(result)
  }

  return resolved
}

async function checkSingleTrade(trade: TrackedTrade): Promise<TrackedTrade | null> {
  // Fetch current price
  const stockData = await fetchStockData(trade.ticker)
  if (!stockData) return null

  const currentPrice = stockData.info.price
  const entry = Number(trade.entry_price)
  const sl = Number(trade.stop_loss)
  const tp = Number(trade.take_profit)
  const isBuy = trade.recommendation === 'BUY'

  // Calculate PnL
  const pnl = isBuy
    ? ((currentPrice - entry) / entry) * 100
    : ((entry - currentPrice) / entry) * 100

  let status: string = 'tracking'
  let reason = ''

  // Check take profit
  if (isBuy && currentPrice >= tp) {
    status = 'success'
    reason = `到達停利目標 $${tp}，當前價格 $${currentPrice}`
  } else if (!isBuy && currentPrice <= tp) {
    status = 'success'
    reason = `到達停利目標 $${tp}，當前價格 $${currentPrice}`
  }
  // Check stop loss
  else if (isBuy && currentPrice <= sl) {
    status = 'failed'
    reason = `觸發停損 $${sl}，當前價格 $${currentPrice}`
  } else if (!isBuy && currentPrice >= sl) {
    status = 'failed'
    reason = `觸發停損 $${sl}，當前價格 $${currentPrice}`
  }
  // Check expiry
  else {
    const created = new Date(trade.created_at)
    const now = new Date()
    const daysDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff >= config.MAX_TRACKING_DAYS) {
      status = 'expired'
      reason = `追蹤超過 ${config.MAX_TRACKING_DAYS} 天，當前價格 $${currentPrice}，損益 ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}%`
    }
  }

  // Update current price always
  const updates: any = {
    current_price: currentPrice,
    pnl_percent: Math.round(pnl * 100) / 100,
  }

  if (status !== 'tracking') {
    updates.status = status
    updates.notes = reason
    updates.resolved_at = new Date().toISOString()
  }

  const { data } = await adminClient
    .from('tracked_trades')
    .update(updates)
    .eq('id', trade.id)
    .select()
    .single()

  // Return only if resolved
  if (status !== 'tracking') return data
  return null
}

function parsePrice(priceStr: string): number | null {
  if (!priceStr || priceStr === 'N/A' || priceStr === 'null') return null
  const match = priceStr.replace(/[,$]/g, '').match(/[\d.]+/)
  if (!match) return null
  const num = parseFloat(match[0])
  return isNaN(num) ? null : num
}
