import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withErrorHandler } from './_lib/errors'
import { adminClient } from './_lib/supabase'
import { config } from './_lib/config'
import { captureMultiTimeframeCharts } from './_lib/screenshot'
import { analyzeChart, PROMPT_VERSION } from './_lib/anthropic'
import { sendAnalysisToTelegram } from './_lib/telegram'
import { fetchStockData } from './_lib/market-data'
import { fetchStockNews } from './_lib/news'
import { fetchMarketContext } from './_lib/market-context'
import { autoTrackTrade } from './_lib/tracker'
import { getRecentLessons } from './_lib/reviewer'
import type { TradingViewAlert } from './_lib/types'

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
      const tracked = await autoTrackTrade(userId, analysisRecord.id, ticker, exchange, analysis)
      if (tracked) {
        console.log(`Auto-tracked: ${ticker} ${analysis.recommendation} @ $${tracked.entry_price}`)
      }
    }
  }

  // Send Telegram notification (only BUY/SELL with confidence >= MIN_CONFIDENCE)
  if (analysis.recommendation !== 'HOLD' && analysis.confidence >= config.MIN_CONFIDENCE) {
    await sendAnalysisToTelegram(alert, analysis, charts.daily, price)
  }

  return res.status(200).json({
    success: true,
    ticker,
    recommendation: analysis.recommendation,
    confidence: analysis.confidence,
  })
})
