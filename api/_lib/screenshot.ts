/**
 * Capture chart screenshots for multiple timeframes.
 * Uses Finviz (daily) + TradingView mini charts as fallback.
 */

import type { ChartScreenshots } from './types'

export async function captureChartScreenshot(ticker: string, exchange: string): Promise<string> {
  // Primary: Finviz daily chart with technical indicators
  return `https://finviz.com/chart.ashx?t=${ticker}&ty=c&ta=1&p=d&s=l`
}

export async function captureMultiTimeframeCharts(ticker: string, exchange: string): Promise<ChartScreenshots> {
  return {
    daily: `https://finviz.com/chart.ashx?t=${ticker}&ty=c&ta=1&p=d&s=l`,
    weekly: `https://finviz.com/chart.ashx?t=${ticker}&ty=c&ta=1&p=w&s=l`,
    intraday: `https://finviz.com/chart.ashx?t=${ticker}&ty=c&ta=1&p=i&s=l`,
  }
}
