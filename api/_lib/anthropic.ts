import Anthropic from '@anthropic-ai/sdk'
import { config } from './config.js'
import { withRetry } from './retry.js'
import type { AnalysisResult, StockFullData, NewsItem, MarketContext } from './types.js'

export const PROMPT_VERSION = 'v2.0'

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })

// ---------------------------------------------------------------------------
// Image fetching helper
// ---------------------------------------------------------------------------

async function fetchImageAsBase64(url: string): Promise<Anthropic.ImageBlockParam | null> {
  return withRetry(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const base64 = buffer.toString('base64')
    const contentType = res.headers.get('content-type') || 'image/png'
    return {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: contentType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
        data: base64,
      },
    }
  }, 3, `fetchImage(${url.slice(0, 60)})`)
}

// ---------------------------------------------------------------------------
// Pass 1 — Technical Analysis
// ---------------------------------------------------------------------------

function buildPass1Prompt(
  ticker: string,
  exchange: string,
  price: string,
  timeframe: string,
  marketData: StockFullData | null,
): string {
  let prompt = `You are a technical analyst. Analyze these charts and indicators. Output ONLY technical observations.

## Stock: ${ticker} (${exchange})
## Alert Price: $${price}
## Alert Timeframe: ${timeframe}

`

  if (marketData) {
    const { info, indicators, recentCandles } = marketData
    prompt += `## Real-Time Market Data
- Current Price: $${info.price} (${info.changePercent > 0 ? '+' : ''}${info.changePercent}%)
- Day Range: $${info.low} - $${info.high}
- Previous Close: $${info.previousClose}
- Volume: ${info.volume.toLocaleString()} (${indicators.volumeRatio}x avg)
- 52-Week Range: $${info.week52Low} - $${info.week52High}
- Market Cap: ${info.marketCap}
${info.pe ? `- P/E: ${info.pe} | EPS: $${info.eps}` : ''}

## Technical Indicators (Calculated)
- SMA 20: $${indicators.sma20} (Price ${indicators.priceVsSma20})
- SMA 50: $${indicators.sma50} (Price ${indicators.priceVsSma50})
- SMA 200: $${indicators.sma200} (Price ${indicators.priceVsSma200})
- ${indicators.goldenCross ? 'GOLDEN CROSS active (SMA50 > SMA200 - Bullish)' : indicators.deathCross ? 'DEATH CROSS active (SMA50 < SMA200 - Bearish)' : 'No MA cross signal'}
- RSI(14): ${indicators.rsi14} ${indicators.rsi14 > 70 ? '(OVERBOUGHT)' : indicators.rsi14 < 30 ? '(OVERSOLD)' : '(Neutral)'}
- MACD Line: ${indicators.macdLine} | Signal: ${indicators.macdSignal} | Histogram: ${indicators.macdHistogram} ${indicators.macdHistogram > 0 ? '(Bullish)' : '(Bearish)'}
- ATR(14): $${indicators.atr14} (volatility measure)
- Bollinger Bands: Upper $${indicators.bollingerUpper} | Lower $${indicators.bollingerLower}

## Recent Price Action (Last 10 Days)
${recentCandles.map(c => `${c.date}: O:$${c.open} H:$${c.high} L:$${c.low} C:$${c.close} V:${c.volume.toLocaleString()}`).join('\n')}

`
  }

  prompt += `## Instructions
Analyze the provided chart images (daily, weekly, and/or intraday) combined with the indicator data above. Report your technical observations in Traditional Chinese (繁體中文).

Cover these areas:
1. **圖表型態 (Pattern):** Identify chart patterns (e.g., ascending triangle, head-and-shoulders, cup-and-handle, etc.)
2. **趨勢方向 (Trend Direction):** 上升趨勢 / 下降趨勢 / 盤整
3. **趨勢強度 (Trend Strength):** 強 / 中等 / 弱
4. **支撐位 (Support Levels):** Key price levels and reasoning
5. **壓力位 (Resistance Levels):** Key price levels and reasoning
6. **RSI 解讀 (RSI Reading):** RSI value and interpretation
7. **成交量分析 (Volume Analysis):** Volume trend and what it signals

Be precise and data-driven. Use the calculated indicator values provided.`

  return prompt
}

// ---------------------------------------------------------------------------
// Pass 2 — Decision Synthesis
// ---------------------------------------------------------------------------

function buildPass2Prompt(
  ticker: string,
  price: string,
  pass1Analysis: string,
  news: NewsItem[],
  marketContext: MarketContext | null,
  lessons: string | null,
): string {
  let prompt = `You are a trading advisor. Given the technical analysis, news, market conditions, and past lessons, provide a recommendation.

## Stock: ${ticker} | Alert Price: $${price}

## Technical Analysis (Pass 1 Results)
${pass1Analysis}

`

  if (marketContext) {
    prompt += `## Market Context
- S&P 500 Trend: ${marketContext.sp500Trend}
- VIX Level: ${marketContext.vixLevel} ${marketContext.vixLevel > 25 ? '(HIGH FEAR - elevated risk)' : marketContext.vixLevel < 15 ? '(LOW FEAR - complacent market)' : '(moderate)'}
- Sector Performance: ${marketContext.sectorPerformance}

`
  }

  if (news.length > 0) {
    prompt += `## Recent News Headlines
${news.map((n, i) => `${i + 1}. "${n.title}" - ${n.publisher} (${n.publishedAt})`).join('\n')}

`
  }

  if (lessons) {
    prompt += `${lessons}\n\n`
  }

  prompt += `## Instructions
Synthesize all the above to produce a trading recommendation.

IMPORTANT: High confidence does NOT automatically mean BUY. Consider risk, market conditions, and whether this is a good entry point. A strong technical setup in a fearful market (high VIX) or with negative news may still warrant HOLD or SELL.

Respond ONLY in valid JSON. Use Traditional Chinese (繁體中文) for the summary field. Keep recommendation in English (BUY/SELL/HOLD):

{
  "recommendation": "BUY" or "SELL" or "HOLD",
  "confidence": <integer 0-100>,
  "summary": "<3-5 sentences in 繁體中文 covering technical + news + market conditions + reasoning>",
  "entry_price": <number or null>,
  "stop_loss": <number or null>,
  "take_profit": <number or null>,
  "support_price": <number or null>,
  "resistance_price": <number or null>,
  "rsi": <number or null>,
  "sma_20": <number or null>,
  "sma_50": <number or null>,
  "sma_200": <number or null>,
  "macd_signal": "bullish" or "bearish" or "neutral" or null,
  "volume_trend": "increasing" or "decreasing" or "stable" or null
}

Numbers must be precise. confidence reflects how many signals align (0-100).`

  return prompt
}

// ---------------------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------------------

function parseAnalysisResult(text: string): AnalysisResult {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        recommendation: (['BUY', 'SELL', 'HOLD'].includes(parsed.recommendation)
          ? parsed.recommendation
          : 'HOLD') as 'BUY' | 'SELL' | 'HOLD',
        confidence: Number(parsed.confidence) || 0,
        summary: parsed.summary || '分析結果無法取得',
        entry_price: parsed.entry_price != null ? Number(parsed.entry_price) : null,
        stop_loss: parsed.stop_loss != null ? Number(parsed.stop_loss) : null,
        take_profit: parsed.take_profit != null ? Number(parsed.take_profit) : null,
        support_price: parsed.support_price != null ? Number(parsed.support_price) : null,
        resistance_price: parsed.resistance_price != null ? Number(parsed.resistance_price) : null,
        rsi: parsed.rsi != null ? Number(parsed.rsi) : null,
        sma_20: parsed.sma_20 != null ? Number(parsed.sma_20) : null,
        sma_50: parsed.sma_50 != null ? Number(parsed.sma_50) : null,
        sma_200: parsed.sma_200 != null ? Number(parsed.sma_200) : null,
        macd_signal: parsed.macd_signal || null,
        volume_trend: parsed.volume_trend || null,
      }
    }
  } catch (e) {
    console.error('JSON parse failed:', e)
  }

  // Fallback on parse failure
  return {
    recommendation: 'HOLD',
    confidence: 0,
    summary: '分析解析失敗，請手動檢視。',
    entry_price: null,
    stop_loss: null,
    take_profit: null,
    support_price: null,
    resistance_price: null,
    rsi: null,
    sma_20: null,
    sma_50: null,
    sma_200: null,
    macd_signal: null,
    volume_trend: null,
  }
}

// ---------------------------------------------------------------------------
// Main export: two-pass analyzeChart
// ---------------------------------------------------------------------------

export async function analyzeChart(
  chartUrls: { daily: string; weekly: string; intraday: string },
  ticker: string,
  exchange: string,
  price: string,
  timeframe: string,
  marketData: StockFullData | null,
  news: NewsItem[],
  marketContext: MarketContext | null,
  lessons: string | null,
): Promise<AnalysisResult> {
  // --- Fetch chart images (skip individual failures, don't abort) ---
  const imageBlocks: Anthropic.ImageBlockParam[] = []
  for (const [label, url] of [
    ['daily', chartUrls.daily],
    ['weekly', chartUrls.weekly],
    ['intraday', chartUrls.intraday],
  ] as [string, string][]) {
    try {
      const block = await fetchImageAsBase64(url)
      if (block) imageBlocks.push(block)
    } catch (err: any) {
      console.warn(`Skipping ${label} chart image after retries: ${err.message}`)
    }
  }

  // --- Pass 1: Technical Analysis ---
  const pass1Prompt = buildPass1Prompt(ticker, exchange, price, timeframe, marketData)
  const pass1Content: Anthropic.ContentBlockParam[] = [
    ...imageBlocks,
    { type: 'text', text: pass1Prompt },
  ]

  let pass1Result = ''
  try {
    const pass1Response = await withRetry(
      () =>
        client.messages.create({
          model: config.ANALYSIS_MODEL,
          max_tokens: 2048,
          messages: [{ role: 'user', content: pass1Content }],
        }),
      3,
      'Claude Pass 1',
    )
    pass1Result =
      pass1Response.content[0].type === 'text' ? pass1Response.content[0].text : ''
  } catch (err) {
    console.error('Claude Pass 1 failed:', err)
    // Return fallback if Pass 1 fails entirely
    return parseAnalysisResult('')
  }

  // --- Pass 2: Decision Synthesis ---
  const pass2Prompt = buildPass2Prompt(ticker, price, pass1Result, news, marketContext, lessons)

  try {
    const pass2Response = await withRetry(
      () =>
        client.messages.create({
          model: config.ANALYSIS_MODEL,
          max_tokens: 1500,
          messages: [{ role: 'user', content: pass2Prompt }],
        }),
      3,
      'Claude Pass 2',
    )
    const pass2Text =
      pass2Response.content[0].type === 'text' ? pass2Response.content[0].text : ''
    return parseAnalysisResult(pass2Text)
  } catch (err) {
    console.error('Claude Pass 2 failed:', err)
    return parseAnalysisResult('')
  }
}
