import { config } from './config'
import type { AnalysisResult, TradingViewAlert } from './types'

function getTelegramApi(): string {
  return `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`
}

export async function sendAnalysisToTelegram(
  alert: TradingViewAlert,
  analysis: AnalysisResult,
  chartUrl: string,
  realTimePrice?: string,
  chatId?: string
): Promise<void> {
  const TELEGRAM_API = getTelegramApi()
  const targetChatId = chatId || config.TELEGRAM_CHAT_ID

  const recEmoji = analysis.recommendation === 'BUY' ? '🟢' : analysis.recommendation === 'SELL' ? '🔴' : '🟡'
  const recText = analysis.recommendation === 'BUY' ? '買入' : analysis.recommendation === 'SELL' ? '賣出' : '觀望'
  const price = realTimePrice || alert.price

  const message = `🔔 *警報: ${alert.ticker}* (${alert.exchange})
💰 即時價格: $${price}
📊 時間框架: ${alert.timeframe}
${alert.message ? `📝 ${alert.message}` : ''}

📈 *技術分析:*
• RSI: ${analysis.rsi ?? 'N/A'}
• SMA20: ${analysis.sma_20 ?? 'N/A'}
• SMA50: ${analysis.sma_50 ?? 'N/A'}
• SMA200: ${analysis.sma_200 ?? 'N/A'}
• MACD: ${analysis.macd_signal ?? 'N/A'}
• 支撐位: ${analysis.support_price ?? 'N/A'}
• 壓力位: ${analysis.resistance_price ?? 'N/A'}

${recEmoji} *建議: ${recText} (${analysis.recommendation})*
• 進場價: ${analysis.entry_price ?? 'N/A'}
• 停損: ${analysis.stop_loss ?? 'N/A'}
• 停利: ${analysis.take_profit ?? 'N/A'}
• 信心度: ${analysis.confidence}%

💡 *分析摘要:*
${analysis.summary}`

  // Send text message
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    })
  } catch (e) {
    console.error('Failed to send Telegram message:', e)
  }

  // Send chart image
  if (chartUrl) {
    try {
      await fetch(`${TELEGRAM_API}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          photo: chartUrl,
          caption: `${alert.ticker} (${alert.exchange}) - ${alert.timeframe}`,
        }),
      })
    } catch (e) {
      console.error('Failed to send Telegram photo:', e)
    }
  }
}

/**
 * Send trade result notification (success/failed/expired)
 */
export async function sendTradeResultToTelegram(
  trade: any,
  lesson: string | null,
  chatId?: string
): Promise<void> {
  const TELEGRAM_API = getTelegramApi()
  const targetChatId = chatId || config.TELEGRAM_CHAT_ID

  const statusEmoji = trade.status === 'success' ? '✅' : trade.status === 'failed' ? '❌' : '⏰'
  const statusZh = trade.status === 'success' ? '成功' : trade.status === 'failed' ? '失敗' : '過期'
  const recZh = trade.recommendation === 'BUY' ? '買入' : '賣出'
  const pnl = Number(trade.pnl_percent)
  const pnlStr = `${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}%`
  const pnlEmoji = pnl > 0 ? '📈' : '📉'

  let message = `${statusEmoji} *追蹤結果: ${trade.ticker}* (${statusZh})

💼 建議: ${recZh}
💰 進場: $${trade.entry_price}
📍 當前: $${trade.current_price}
${pnlEmoji} 損益: ${pnlStr}
🎯 停利: $${trade.take_profit} | 停損: $${trade.stop_loss}

📝 ${trade.result_reason}`

  if (lesson) {
    message += `\n\n🧠 *AI 檢討:*\n${lesson}`
  }

  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    })
  } catch (e) {
    console.error('Failed to send Telegram trade result:', e)
  }
}

export async function getUpdates(): Promise<any> {
  try {
    const res = await fetch(`${getTelegramApi()}/getUpdates`)
    return res.json()
  } catch (e) {
    console.error('Failed to get Telegram updates:', e)
    return null
  }
}
