import Anthropic from '@anthropic-ai/sdk'
import { config } from './config'
import { adminClient } from './supabase'
import type { TrackedTrade } from './tracker'

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })

/**
 * AI reviews a failed/expired trade and generates a lesson learned.
 */
export async function reviewTrade(trade: TrackedTrade): Promise<string | null> {
  // Get original analysis via analysis_id (new schema uses analyses table directly)
  const { data: analysis } = await adminClient
    .from('analyses')
    .select('*')
    .eq('id', trade.analysis_id)
    .single()

  const originalSummary = analysis
    ? `建議: ${analysis.recommendation}, 信心度: ${analysis.confidence}%, 摘要: ${analysis.summary}`
    : '無原始分析資料'

  const statusZh = trade.status === 'failed' ? '失敗（觸發停損）' : '過期（未達目標）'
  const recZh = trade.recommendation === 'BUY' ? '買入' : '賣出'

  const prompt = `你是一個資深交易檢討分析師。以下是一筆交易的結果，請分析為什麼這筆交易${trade.status === 'failed' ? '失敗' : '未能達成目標'}，並給出具體的教訓。

## 交易資訊
- 股票: ${trade.ticker} (${trade.exchange})
- 建議: ${recZh}
- 進場價: $${trade.entry_price}
- 停損: $${trade.stop_loss}
- 停利: $${trade.take_profit}
- 信心度: ${trade.confidence}%
- 建立時間: ${trade.created_at}

## 結果
- 狀態: ${statusZh}
- 當前價格: $${trade.current_price}
- 損益: ${Number(trade.pnl_percent) > 0 ? '+' : ''}${trade.pnl_percent}%
- 原因: ${trade.result_reason}

## 原始 AI 分析
${originalSummary}

## 請回答（繁體中文，JSON 格式）：
{
  "what_happened": "簡述實際發生了什麼（1-2句）",
  "lesson_learned": "從這次交易學到的教訓，未來分析同類型股票或類似型態時應注意什麼（2-3句，具體可操作的建議）",
  "lesson_type": "failure | expired | success",
  "key_takeaway": "一句話核心要點",
  "tags": ["tag1", "tag2"],
  "market_conditions": "當時市場環境描述"
}`

  try {
    const response = await client.messages.create({
      model: config.ANALYSIS_MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    // Save lesson to database with structured fields
    await adminClient.from('lessons').insert({
      tracked_trade_id: trade.id,
      user_id: trade.user_id,
      ticker: trade.ticker,
      lesson_type: parsed.lesson_type || (trade.status === 'success' ? 'success' : trade.status === 'failed' ? 'failure' : 'expired'),
      key_takeaway: parsed.key_takeaway || '',
      tags: parsed.tags || [],
      original_analysis: originalSummary,
      market_conditions: parsed.market_conditions || '',
      what_happened: parsed.what_happened || '',
      lesson_learned: parsed.lesson_learned || '',
    })

    return parsed.lesson_learned
  } catch (e) {
    console.error('Review failed:', e)
    return null
  }
}

/**
 * Get recent lessons to inject into future analysis prompts.
 * Prioritizes lessons matching the same ticker, ordered by relevance_score DESC, created_at DESC.
 * Increments times_used counter on retrieved lessons.
 * Returns the top 5 lessons as a formatted string.
 */
export async function getRecentLessons(userId: string, ticker: string): Promise<string> {
  const { data } = await adminClient
    .from('lessons')
    .select('*')
    .eq('user_id', userId)
    .order('relevance_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5)

  if (!data || data.length === 0) return ''

  // Sort: same-ticker lessons first, then by the already-applied order
  const sorted = [...data].sort((a, b) => {
    const aMatch = a.ticker === ticker ? 1 : 0
    const bMatch = b.ticker === ticker ? 1 : 0
    return bMatch - aMatch
  })

  // Increment times_used for retrieved lessons (fire-and-forget)
  for (const lesson of sorted) {
    adminClient
      .from('lessons')
      .update({ times_used: (lesson.times_used || 0) + 1 })
      .eq('id', lesson.id)
      .then(() => {})
      .catch((e: unknown) => console.error('Failed to increment times_used:', e))
  }

  const lessonsText = sorted.map((l, i) => {
    const typeZh = l.lesson_type === 'failure' ? '失敗' : l.lesson_type === 'expired' ? '過期' : '成功'
    return `${i + 1}. [${typeZh}] ${l.ticker}: ${l.lesson_learned}`
  }).join('\n')

  return `\n## 近期交易教訓（請參考避免重複錯誤）\n${lessonsText}\n`
}
