import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from '../_lib/errors'
import { config } from '../_lib/config'
import { checkTrackedTrades } from '../_lib/tracker'
import { reviewTrade } from '../_lib/reviewer'
import { sendTradeResultToTelegram } from '../_lib/telegram'

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

  return res.status(200).json({
    checked: resolvedTrades.length,
    results,
  })
})
