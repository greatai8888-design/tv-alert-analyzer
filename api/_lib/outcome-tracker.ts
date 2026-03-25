/**
 * Outcome Tracker: tracks alert price performance and generates weekly AI reviews.
 */

import Anthropic from '@anthropic-ai/sdk'
import { adminClient } from './supabase.js'
import { fetchStockData } from './market-data.js'
import { config } from './config.js'

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })

// ─── Daily: update alert outcomes ───────────────────────────

export async function updateAlertOutcomes(): Promise<{ updated: number; classified: number }> {
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000

  // Find outcomes needing 1d, 3d, or 7d price updates
  const { data: pending } = await adminClient
    .from('alert_outcomes')
    .select('id, ticker, alert_price, alert_date, ai_recommendation, price_after_1d, price_after_3d, price_after_7d, change_pct_7d')
    .or('price_after_1d.is.null,price_after_3d.is.null,price_after_7d.is.null')

  if (!pending || pending.length === 0) return { updated: 0, classified: 0 }

  // Collect unique tickers
  const tickers = [...new Set(pending.map(p => p.ticker))]

  // Fetch prices in batches of 5
  const priceMap = new Map<string, number>()
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5)
    const results = await Promise.all(
      batch.map(async t => {
        const data = await fetchStockData(t)
        return { ticker: t, price: data?.info.price ?? null }
      })
    )
    for (const r of results) {
      if (r.price != null) priceMap.set(r.ticker, r.price)
    }
  }

  let updated = 0
  let classified = 0

  for (const outcome of pending) {
    const currentPrice = priceMap.get(outcome.ticker)
    if (currentPrice == null) continue

    const alertDate = new Date(outcome.alert_date).getTime()
    const alertPrice = Number(outcome.alert_price)
    const daysSince = (now - alertDate) / DAY
    const updates: Record<string, unknown> = {}

    const changePct = (p: number) => Math.round(((p - alertPrice) / alertPrice) * 10000) / 100

    // Fill 1d price (window: 1-2 days after alert)
    if (outcome.price_after_1d == null && daysSince >= 1 && daysSince < 2) {
      updates.price_after_1d = currentPrice
      updates.change_pct_1d = changePct(currentPrice)
    }

    // Fill 3d price (window: 3-4 days after alert)
    if (outcome.price_after_3d == null && daysSince >= 3 && daysSince < 4) {
      updates.price_after_3d = currentPrice
      updates.change_pct_3d = changePct(currentPrice)
    }

    // Fill 7d price (7+ days, no upper bound — terminal point)
    if (outcome.price_after_7d == null && daysSince >= 7) {
      updates.price_after_7d = currentPrice
      updates.change_pct_7d = changePct(currentPrice)
    }

    if (Object.keys(updates).length === 0) continue

    // Classify if 7d data is now available
    if (updates.price_after_7d != null || outcome.price_after_7d != null) {
      const changePct7d = (updates.change_pct_7d as number) ?? Number(outcome.change_pct_7d ?? 0)
      updates.outcome_category = classifyOutcome(outcome.ai_recommendation, changePct7d)
      classified++
    }

    await adminClient
      .from('alert_outcomes')
      .update(updates)
      .eq('id', outcome.id)

    updated++
  }

  return { updated, classified }
}

function classifyOutcome(rec: string | null, changePct7d: number): string {
  if (rec === 'BUY') {
    if (changePct7d >= 2) return 'hit'
    if (changePct7d >= 0) return 'marginal'
    return 'miss'
  }
  if (rec === 'SELL') return 'correct_skip'
  // HOLD or NULL
  if (changePct7d >= 5) return 'missed_opportunity'
  return 'correct_skip'
}

// ─── Weekly: generate strategy review ───────────────────────

export async function generateWeeklyReview(userId: string): Promise<boolean> {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const periodStart = weekAgo.toISOString().split('T')[0]
  const periodEnd = now.toISOString().split('T')[0]

  // Get classified outcomes from the past 7 days
  const { data: outcomes } = await adminClient
    .from('alert_outcomes')
    .select('*')
    .eq('user_id', userId)
    .not('outcome_category', 'is', null)
    .gte('updated_at', weekAgo.toISOString())
    .lte('updated_at', now.toISOString())

  if (!outcomes || outcomes.length === 0) {
    console.log(`[REVIEW] No classified outcomes for user ${userId}, skipping`)
    return false
  }

  // Count categories
  const hits = outcomes.filter(o => o.outcome_category === 'hit').length
  const misses = outcomes.filter(o => o.outcome_category === 'miss').length
  const marginals = outcomes.filter(o => o.outcome_category === 'marginal').length
  const missedOpps = outcomes.filter(o => o.outcome_category === 'missed_opportunity').length
  const correctSkips = outcomes.filter(o => o.outcome_category === 'correct_skip').length
  const total = outcomes.length
  const totalBuy = hits + misses + marginals
  const hitRate = totalBuy > 0 ? Math.round((hits / totalBuy) * 10000) / 100 : 0
  const missedRate = (total - totalBuy) > 0 ? Math.round((missedOpps / (total - totalBuy)) * 10000) / 100 : 0

  // Build details for missed opportunities
  const missedDetails = outcomes
    .filter(o => o.outcome_category === 'missed_opportunity')
    .sort((a, b) => Number(b.change_pct_7d) - Number(a.change_pct_7d))
    .slice(0, 10)
    .map(o => `- ${o.ticker}: alert 價格 $${o.alert_price} → 7天後漲 ${o.change_pct_7d}%\n  AI 判斷: ${o.ai_recommendation || '無'} (信心度 ${o.ai_confidence ?? '—'}%)\n  原因: ${o.ai_reasoning || '無分析記錄'}`)
    .join('\n')

  // Build details for misses
  const missDetails = outcomes
    .filter(o => o.outcome_category === 'miss')
    .sort((a, b) => Number(a.change_pct_7d) - Number(b.change_pct_7d))
    .slice(0, 10)
    .map(o => `- ${o.ticker}: alert 價格 $${o.alert_price} → 7天後跌 ${o.change_pct_7d}%\n  AI 信心度: ${o.ai_confidence ?? '—'}%`)
    .join('\n')

  const prompt = `你是一個資深交易策略檢討分析師。以下是本週（${periodStart} 至 ${periodEnd}）的 AI 交易表現數據。

## 統計摘要
- 總 alert 數: ${total}
- 命中 (BUY 且漲 ≥2%): ${hits} (${hitRate}%)
- 邊緣 (BUY 且漲 0-2%): ${marginals}
- 誤判 (BUY 且跌): ${misses}
- 漏掉 (未選但漲 ≥5%): ${missedOpps} (${missedRate}%)
- 正確忽略: ${correctSkips}

## 漏掉的機會（詳細）
${missedDetails || '無'}

## 誤判的交易（詳細）
${missDetails || '無'}

## 請分析（繁體中文，JSON 格式）：
{
  "ai_analysis": "2-3段完整分析：AI 本週的表現概述、系統性盲點分析、最大的改進空間",
  "recommendations": [
    {
      "suggestion": "具體可操作的建議",
      "reasoning": "為什麼這個改變會有幫助",
      "priority": "high | medium | low"
    }
  ]
}`

  try {
    const response = await anthropic.messages.create({
      model: config.ANALYSIS_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const text = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[REVIEW] Failed to parse AI response')
      return false
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Build top arrays for storage
    const topMissed = outcomes
      .filter(o => o.outcome_category === 'missed_opportunity')
      .sort((a, b) => Number(b.change_pct_7d) - Number(a.change_pct_7d))
      .slice(0, 5)
      .map(o => ({ ticker: o.ticker, change_pct_7d: o.change_pct_7d, reason: o.ai_reasoning || '無分析' }))

    const topMisses = outcomes
      .filter(o => o.outcome_category === 'miss')
      .sort((a, b) => Number(a.change_pct_7d) - Number(b.change_pct_7d))
      .slice(0, 5)
      .map(o => ({ ticker: o.ticker, change_pct_7d: o.change_pct_7d, ai_confidence: o.ai_confidence }))

    await adminClient.from('strategy_reviews').upsert({
      user_id: userId,
      review_period_start: periodStart,
      review_period_end: periodEnd,
      total_alerts: total,
      hits,
      misses,
      missed_opportunities: missedOpps,
      correct_skips: correctSkips,
      hit_rate: hitRate,
      missed_opportunity_rate: missedRate,
      top_missed: topMissed,
      top_misses: topMisses,
      ai_analysis: parsed.ai_analysis || '',
      recommendations: parsed.recommendations || [],
    }, { onConflict: 'user_id,review_period_start,review_period_end' })

    console.log(`[REVIEW] Generated review for ${periodStart}-${periodEnd}: ${hits} hits, ${misses} misses, ${missedOpps} missed opps`)
    return true
  } catch (e: any) {
    console.error('[REVIEW] AI review error:', e.message)
    return false
  }
}
