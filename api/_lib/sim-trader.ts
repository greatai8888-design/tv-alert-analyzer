/**
 * AI Auto-Trader: Automatically manages simulated portfolio
 * - Auto-buys when BUY signal with confidence >= 70%
 * - Auto-sells when price hits TP/SL
 * - Updates current prices on all open positions
 */

import { adminClient } from './supabase.js'
import { fetchStockData } from './market-data.js'
import type { AnalysisResult } from './types.js'

const MIN_CONFIDENCE_TO_BUY = 65
const MAX_POSITION_PERCENT = 0.15  // Max 15% of portfolio per trade
const MAX_OPEN_POSITIONS = 10

interface SimPortfolio {
  id: string
  user_id: string
  initial_capital: number
  cash_balance: number
  total_value: number
  total_pnl: number
  total_trades: number
  winning_trades: number
  losing_trades: number
}

/**
 * Called from webhook after analysis is done.
 * If it's a strong BUY signal, automatically buy into the sim portfolio.
 */
export async function simAutoBuy(
  userId: string,
  alertId: string,
  ticker: string,
  analysis: AnalysisResult,
): Promise<{ bought: boolean; reason: string }> {
  // Only auto-buy on BUY with high confidence
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

  // Get user's active portfolio
  const { data: portfolio } = await adminClient
    .from('sim_portfolio')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!portfolio) {
    return { bought: false, reason: '尚未建立模擬帳戶' }
  }

  // Check if already holding this ticker
  const { data: existingTrade } = await adminClient
    .from('sim_trades')
    .select('id')
    .eq('portfolio_id', portfolio.id)
    .eq('ticker', ticker)
    .eq('status', 'open')
    .maybeSingle()

  if (existingTrade) {
    return { bought: false, reason: `已持有 ${ticker}，不重複買入` }
  }

  // Check max positions
  const { count: openCount } = await adminClient
    .from('sim_trades')
    .select('id', { count: 'exact', head: true })
    .eq('portfolio_id', portfolio.id)
    .eq('status', 'open')

  if ((openCount ?? 0) >= MAX_OPEN_POSITIONS) {
    return { bought: false, reason: `已達持倉上限 ${MAX_OPEN_POSITIONS} 支` }
  }

  // Calculate position size based on confidence
  const allocPct = analysis.confidence >= 80 ? MAX_POSITION_PERCENT : analysis.confidence >= 70 ? 0.12 : 0.08
  const maxSpend = portfolio.cash_balance * allocPct

  if (maxSpend < entryPrice) {
    return { bought: false, reason: `可用資金不足：需 $${entryPrice}，可分配 $${maxSpend.toFixed(2)}` }
  }

  const quantity = Math.floor((maxSpend / entryPrice) * 100) / 100
  const cost = Math.round(quantity * entryPrice * 100) / 100

  // Insert trade
  const { error: tradeError } = await adminClient
    .from('sim_trades')
    .insert({
      user_id: userId,
      portfolio_id: portfolio.id,
      alert_id: alertId,
      ticker,
      action: 'BUY',
      quantity,
      entry_price: entryPrice,
      current_price: entryPrice,
      confidence: analysis.confidence,
      ai_reasoning: analysis.summary,
      stop_loss: analysis.stop_loss,
      take_profit: analysis.take_profit,
      status: 'open',
    })

  if (tradeError) {
    console.error('Sim trade insert error:', tradeError)
    return { bought: false, reason: `資料庫錯誤：${tradeError.message}` }
  }

  // Update portfolio
  await adminClient
    .from('sim_portfolio')
    .update({
      cash_balance: Math.round((portfolio.cash_balance - cost) * 100) / 100,
      total_trades: portfolio.total_trades + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', portfolio.id)

  console.log(`[SIM] Auto-bought ${quantity} shares of ${ticker} @ $${entryPrice} (cost: $${cost}, confidence: ${analysis.confidence}%)`)
  return { bought: true, reason: `自動買入 ${ticker} ${quantity}股 @ $${entryPrice}（花費 $${cost}）` }
}

/**
 * Called from cron job.
 * Checks all open sim trades, updates prices, auto-sells if TP/SL hit.
 */
export async function checkSimTrades(): Promise<{
  checked: number
  sold: Array<{ ticker: string; pnl: number; reason: string }>
  updated: number
}> {
  const { data: openTrades } = await adminClient
    .from('sim_trades')
    .select('*, sim_portfolio!inner(id, cash_balance, total_pnl, initial_capital, winning_trades, losing_trades)')
    .eq('status', 'open')

  if (!openTrades || openTrades.length === 0) {
    return { checked: 0, sold: [], updated: 0 }
  }

  const sold: Array<{ ticker: string; pnl: number; reason: string }> = []
  let updated = 0

  for (const trade of openTrades) {
    try {
      const stockData = await fetchStockData(trade.ticker)
      if (!stockData) continue

      const currentPrice = stockData.info.price
      const entryPrice = Number(trade.entry_price)
      const sl = trade.stop_loss ? Number(trade.stop_loss) : null
      const tp = trade.take_profit ? Number(trade.take_profit) : null
      const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100
      const pnlAmount = (currentPrice - entryPrice) * Number(trade.quantity)

      let shouldSell = false
      let sellReason = ''

      // Check take profit
      if (tp && currentPrice >= tp) {
        shouldSell = true
        sellReason = `到達目標價 $${tp}（現價 $${currentPrice}）`
      }
      // Check stop loss
      else if (sl && currentPrice <= sl) {
        shouldSell = true
        sellReason = `觸發止損 $${sl}（現價 $${currentPrice}）`
      }
      // Check 30-day expiry
      else {
        const daysHeld = (Date.now() - new Date(trade.created_at).getTime()) / (1000 * 60 * 60 * 24)
        if (daysHeld >= 30) {
          shouldSell = true
          sellReason = `持倉超過 30 天，自動平倉（現價 $${currentPrice}）`
        }
      }

      if (shouldSell) {
        const isWin = pnlAmount > 0
        const portfolio = trade.sim_portfolio as any

        // Close the trade
        await adminClient
          .from('sim_trades')
          .update({
            current_price: currentPrice,
            exit_price: currentPrice,
            pnl: Math.round(pnlAmount * 100) / 100,
            pnl_percent: Math.round(pnlPct * 100) / 100,
            status: isWin ? 'closed' : 'stopped',
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', trade.id)

        // Update portfolio: return cash + update stats
        const cashBack = currentPrice * Number(trade.quantity)
        const newTotalPnl = (portfolio.total_pnl || 0) + pnlAmount

        await adminClient
          .from('sim_portfolio')
          .update({
            cash_balance: Math.round((portfolio.cash_balance + cashBack) * 100) / 100,
            total_pnl: Math.round(newTotalPnl * 100) / 100,
            total_pnl_percent: Math.round((newTotalPnl / portfolio.initial_capital) * 10000) / 100,
            winning_trades: portfolio.winning_trades + (isWin ? 1 : 0),
            losing_trades: portfolio.losing_trades + (isWin ? 0 : 1),
            updated_at: new Date().toISOString(),
          })
          .eq('id', portfolio.id)

        sold.push({
          ticker: trade.ticker,
          pnl: Math.round(pnlPct * 100) / 100,
          reason: sellReason,
        })

        console.log(`[SIM] Auto-sold ${trade.ticker}: ${sellReason} (PnL: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`)
      } else {
        // Just update current price
        await adminClient
          .from('sim_trades')
          .update({
            current_price: currentPrice,
            pnl: Math.round(pnlAmount * 100) / 100,
            pnl_percent: Math.round(pnlPct * 100) / 100,
            updated_at: new Date().toISOString(),
          })
          .eq('id', trade.id)
        updated++
      }
    } catch (err: any) {
      console.error(`[SIM] Error checking ${trade.ticker}:`, err.message)
    }
  }

  // Update total_value on all affected portfolios
  const portfolioIds = [...new Set(openTrades.map(t => t.portfolio_id))]
  for (const pid of portfolioIds) {
    await updatePortfolioValue(pid)
  }

  return { checked: openTrades.length, sold, updated }
}

async function updatePortfolioValue(portfolioId: string) {
  const { data: portfolio } = await adminClient
    .from('sim_portfolio')
    .select('cash_balance')
    .eq('id', portfolioId)
    .single()

  const { data: openTrades } = await adminClient
    .from('sim_trades')
    .select('current_price, quantity')
    .eq('portfolio_id', portfolioId)
    .eq('status', 'open')

  if (!portfolio) return

  const holdingsValue = (openTrades || []).reduce(
    (sum, t) => sum + (Number(t.current_price) || 0) * (Number(t.quantity) || 0), 0
  )

  await adminClient
    .from('sim_portfolio')
    .update({
      total_value: Math.round((portfolio.cash_balance + holdingsValue) * 100) / 100,
      updated_at: new Date().toISOString(),
    })
    .eq('id', portfolioId)
}
