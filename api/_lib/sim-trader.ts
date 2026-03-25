/**
 * AI Auto-Trader: Manages simulated portfolio via DB RPC functions
 * - simAutoBuy: thin wrapper around sim_auto_buy RPC (atomic buy)
 * - checkSimTrades: parallel price fetch + close_sim_trade RPC (atomic sell)
 */

import { adminClient } from './supabase.js'
import { fetchStockData } from './market-data.js'
import type { AnalysisResult } from './types.js'

const MIN_CONFIDENCE_TO_BUY = 65
const MAX_HOLDING_DAYS = 30

export async function simAutoBuy(
  userId: string,
  alertId: string,
  ticker: string,
  analysis: AnalysisResult,
): Promise<{ bought: boolean; reason: string }> {
  if (analysis.recommendation !== 'BUY') {
    return { bought: false, reason: `不符合買入條件：建議為 ${analysis.recommendation}` }
  }
  if (analysis.confidence < MIN_CONFIDENCE_TO_BUY) {
    return { bought: false, reason: `信心度不足：${analysis.confidence}% < ${MIN_CONFIDENCE_TO_BUY}%` }
  }

  const entryPrice = analysis.entry_price
  if (!entryPrice || entryPrice <= 0) {
    return { bought: false, reason: '無有效進場價格' }
  }

  const { data, error } = await adminClient.rpc('sim_auto_buy', {
    p_user_id: userId,
    p_alert_id: alertId,
    p_ticker: ticker,
    p_entry_price: entryPrice,
    p_confidence: analysis.confidence,
    p_summary: analysis.summary || '',
    p_stop_loss: analysis.stop_loss ?? null,
    p_take_profit: analysis.take_profit ?? null,
  })

  if (error) {
    console.error('[SIM] sim_auto_buy RPC error:', error.message)
    return { bought: false, reason: `資料庫錯誤：${error.message}` }
  }

  const result = data as { bought: boolean; reason: string }
  console.log(`[SIM] ${ticker}: ${result.reason}`)
  return result
}

export async function checkSimTrades(): Promise<{
  checked: number
  sold: Array<{ ticker: string; pnlPct: number; reason: string }>
  updated: number
}> {
  const { data: openTrades } = await adminClient
    .from('sim_trades')
    .select('id, portfolio_id, user_id, ticker, entry_price, stop_loss, take_profit, quantity, created_at')
    .eq('status', 'open')

  if (!openTrades || openTrades.length === 0) {
    return { checked: 0, sold: [], updated: 0 }
  }

  // Parallel price fetch for unique tickers
  const uniqueTickers = [...new Set(openTrades.map(t => t.ticker))]
  const priceResults = await Promise.all(
    uniqueTickers.map(async ticker => {
      const data = await fetchStockData(ticker)
      return { ticker, price: data?.info.price ?? null }
    })
  )
  const priceMap = new Map(priceResults.map(r => [r.ticker, r.price]))

  const sold: Array<{ ticker: string; pnlPct: number; reason: string }> = []
  const priceUpdates: Array<{ id: string; price: number; pnl: number; pnlPct: number }> = []

  for (const trade of openTrades) {
    const currentPrice = priceMap.get(trade.ticker)
    if (currentPrice == null) continue

    const entryPrice = Number(trade.entry_price)
    const sl = trade.stop_loss ? Number(trade.stop_loss) : null
    const tp = trade.take_profit ? Number(trade.take_profit) : null
    const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100
    const pnlAmount = (currentPrice - entryPrice) * Number(trade.quantity)

    let shouldSell = false
    let closeReason = ''
    let reasonText = ''

    if (tp && currentPrice >= tp) {
      shouldSell = true
      closeReason = 'TP'
      reasonText = `到達目標價 $${tp}（現價 $${currentPrice}）`
    } else if (sl && currentPrice <= sl) {
      shouldSell = true
      closeReason = 'SL'
      reasonText = `觸發止損 $${sl}（現價 $${currentPrice}）`
    } else {
      const daysHeld = (Date.now() - new Date(trade.created_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysHeld >= MAX_HOLDING_DAYS) {
        shouldSell = true
        closeReason = 'EXPIRED'
        reasonText = `持倉超過 ${MAX_HOLDING_DAYS} 天，自動平倉（現價 $${currentPrice}）`
      }
    }

    if (shouldSell) {
      const { data: result, error } = await adminClient.rpc('close_sim_trade', {
        p_trade_id: trade.id,
        p_exit_price: currentPrice,
        p_close_reason: closeReason,
      })

      if (error) {
        console.error(`[SIM] close_sim_trade error for ${trade.ticker}:`, error.message)
        continue
      }
      if (result?.error) {
        console.error(`[SIM] close_sim_trade rejected for ${trade.ticker}:`, result.error)
        continue
      }

      sold.push({
        ticker: trade.ticker,
        pnlPct: Math.round(pnlPct * 100) / 100,
        reason: reasonText,
      })
      console.log(`[SIM] Auto-sold ${trade.ticker}: ${reasonText} (PnL: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`)
    } else {
      priceUpdates.push({
        id: trade.id,
        price: currentPrice,
        pnl: Math.round(pnlAmount * 100) / 100,
        pnlPct: Math.round(pnlPct * 100) / 100,
      })
    }
  }

  // Batch update prices for non-sold trades
  for (const { id, price, pnl, pnlPct } of priceUpdates) {
    await adminClient.from('sim_trades').update({
      current_price: price,
      pnl,
      pnl_percent: pnlPct,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  }

  // Recalculate portfolio values
  const portfolioIds = [...new Set(openTrades.map(t => t.portfolio_id))]
  for (const pid of portfolioIds) {
    await adminClient.rpc('calc_portfolio_value', { p_portfolio_id: pid })
  }

  return { checked: openTrades.length, sold, updated: priceUpdates.length }
}
