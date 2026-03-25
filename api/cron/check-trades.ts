import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from '../_lib/errors.js'
import { config } from '../_lib/config.js'
import { checkTrackedTrades } from '../_lib/tracker.js'
import { reviewTrade } from '../_lib/reviewer.js'
import { sendTradeResultToTelegram } from '../_lib/telegram.js'
import { checkSimTrades } from '../_lib/sim-trader.js'
import { updateAlertOutcomes } from '../_lib/outcome-tracker.js'

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  // Validate cron secret
  const authHeader = req.headers.authorization
  if (config.CRON_SECRET && authHeader !== `Bearer ${config.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  }

  const resolvedTrades = await checkTrackedTrades()
  const results = []

  for (const trade of resolvedTrades) {
    try {
      // Review failed/expired trades for lessons
      let lesson: string | null = null
      if (trade.status === 'failed' || trade.status === 'expired') {
        lesson = await reviewTrade(trade)
        if (lesson) {
          console.log(`Lesson for ${trade.ticker}: ${lesson}`)
        }
      }

      // Send notification
      await sendTradeResultToTelegram(trade, lesson)
      results.push({ ticker: trade.ticker, status: trade.status, pnl: trade.pnl_percent })
    } catch (err: any) {
      console.error(`Error processing trade ${trade.ticker}: ${err.message}`)
      results.push({ ticker: trade.ticker, error: err.message })
    }
  }

  // Also check sim trades (auto-sell at TP/SL, update prices)
  let simResults = { checked: 0, sold: [] as any[], updated: 0 }
  try {
    simResults = await checkSimTrades()
    if (simResults.sold.length > 0) {
      console.log(`[SIM] Auto-sold ${simResults.sold.length} trades:`, simResults.sold)
    }
  } catch (err: any) {
    console.error('[SIM] checkSimTrades error:', err.message)
  }

  // Update alert outcomes (1d/3d/7d price tracking)
  let outcomeResults = { updated: 0, classified: 0 }
  try {
    outcomeResults = await updateAlertOutcomes()
    if (outcomeResults.updated > 0) {
      console.log(`[OUTCOMES] Updated: ${outcomeResults.updated}, Classified: ${outcomeResults.classified}`)
    }
  } catch (err: any) {
    console.error('[OUTCOMES] Error:', err.message)
  }

  return res.status(200).json({
    checked: resolvedTrades.length,
    results,
    sim: simResults,
    outcomes: outcomeResults,
  })
})
