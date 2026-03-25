import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from './_lib/errors.js'
import { adminClient } from './_lib/supabase.js'
import { config } from './_lib/config.js'
import { captureMultiTimeframeCharts } from './_lib/screenshot.js'
import { analyzeChart, PROMPT_VERSION } from './_lib/anthropic.js'
import { sendAnalysisToTelegram } from './_lib/telegram.js'
import { fetchStockData } from './_lib/market-data.js'
import { fetchStockNews } from './_lib/news.js'
import { fetchMarketContext } from './_lib/market-context.js'
import { autoTrackTrade } from './_lib/tracker.js'
import { simAutoBuy } from './_lib/sim-trader.js'
import { getRecentLessons } from './_lib/reviewer.js'
import type { TradingViewAlert } from './_lib/types.js'

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  // Validate webhook secret
  if (config.WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== config.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  }

  const alert: TradingViewAlert = req.body
  if (!alert.ticker) {
    return res.status(400).json({ error: 'Missing ticker', code: 'MISSING_TICKER' })
  }

  const ticker = alert.ticker.toUpperCase()
  const exchange = (alert.exchange || 'NASDAQ').toUpperCase()
  const timeframe = alert.timeframe || 'D'

  // Get default user (first user in the system for webhook-inserted records)
  const { data: defaultUser } = await adminClient
    .from('profiles')
    .select('id')
    .limit(1)
    .single()

  if (!defaultUser) {
    return res.status(500).json({ error: 'No user found', code: 'NO_USER' })
  }

  const userId = defaultUser.id

  // Fetch all data in parallel
  const [charts, marketData, news, marketContext, lessons] = await Promise.all([
    captureMultiTimeframeCharts(ticker, exchange),
    fetchStockData(ticker),
    fetchStockNews(ticker),
    fetchMarketContext(),
    getRecentLessons(userId, ticker),
  ])

  const price = marketData?.info.price?.toString() || alert.price || '0'

  // AI Analysis
  const analysis = await analyzeChart(
    charts, ticker, exchange, price, timeframe,
    marketData, news, marketContext, lessons
  )

  // Save alert to database
  const { data: alertRecord } = await adminClient
    .from('alerts')
    .insert({
      user_id: userId,
      ticker, exchange, timeframe,
      price: parseFloat(price) || 0,
      action: alert.message?.toLowerCase().includes('sell') ? 'sell' : 'buy',
      message: alert.message || '',
      raw_payload: alert as any,
    })
    .select()
    .single()

  if (alertRecord) {
    // Save analysis
    const { data: analysisRecord } = await adminClient
      .from('analyses')
      .insert({
        alert_id: alertRecord.id,
        user_id: userId,
        ...analysis,
        market_context: marketContext,
        news_context: news,
        chart_urls: charts,
        model_used: config.ANALYSIS_MODEL,
        prompt_version: PROMPT_VERSION,
        raw_response: { analysis, marketData: marketData?.indicators, newsCount: news.length },
      })
      .select()
      .single()

    // Auto-track trade
    if (analysisRecord) {
      const tracked = await autoTrackTrade(userId, analysisRecord.id, ticker, analysis)
      if (tracked) {
        console.log(`Auto-tracked: ${ticker} ${analysis.recommendation} @ $${tracked.entry_price}`)
      }

      // AI Sim Auto-Buy (awaited to prevent silent failures)
      try {
        const simResult = await simAutoBuy(userId, alertRecord.id, ticker, analysis)
        console.log(`[SIM] ${ticker}: ${simResult.reason}`)
      } catch (e: any) {
        console.error(`[SIM] ${ticker} error:`, e.message)
      }
    }
  }

  // Send Telegram notification (only BUY/SELL with confidence >= MIN_CONFIDENCE)
  // Fire-and-forget so it doesn't block the webhook response
  if (analysis.recommendation !== 'HOLD' && analysis.confidence >= config.MIN_CONFIDENCE) {
    sendAnalysisToTelegram(alert, analysis, charts.daily, price).catch(err => console.error('Telegram error:', err.message))
  }

  // Create initial alert outcome for tracking
  if (alertRecord) {
    adminClient.from('alert_outcomes').upsert({
      alert_id: alertRecord.id,
      user_id: userId,
      ticker,
      alert_price: parseFloat(price) || 0,
      alert_date: alertRecord.created_at,
      ai_recommendation: analysis.recommendation,
      ai_confidence: analysis.confidence,
      ai_reasoning: analysis.summary || null,
    }, { onConflict: 'alert_id', ignoreDuplicates: true }).catch(e =>
      console.error('[OUTCOMES] Initial insert error:', e.message)
    )
  }

  return res.status(200).json({
    success: true,
    ticker,
    recommendation: analysis.recommendation,
    confidence: analysis.confidence,
  })
})
