/**
 * Fetch recent news for a stock ticker
 * Uses Google News RSS (no API key needed)
 */

import { withRetry } from './retry.js'
import type { NewsItem } from './types.js'

export async function fetchStockNews(ticker: string): Promise<NewsItem[]> {
  try {
    return await withRetry(async () => {
      const googleNewsUrl = `https://news.google.com/rss/search?q=${ticker}+stock&hl=en-US&gl=US&ceid=US:en`

      const res = await fetch(googleNewsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      const xml = await res.text()

      // Parse RSS XML
      const items: NewsItem[] = []
      const itemRegex = /<item>([\s\S]*?)<\/item>/g
      let match
      let count = 0

      while ((match = itemRegex.exec(xml)) !== null && count < 5) {
        const itemXml = match[1]
        const title = extractTag(itemXml, 'title')
        const link = extractTag(itemXml, 'link')
        const pubDate = extractTag(itemXml, 'pubDate')
        const source = extractTag(itemXml, 'source')

        if (title) {
          items.push({
            title: decodeHtml(title),
            publisher: source || 'Google News',
            link: link || '',
            publishedAt: pubDate || '',
          })
          count++
        }
      }

      return items
    }, 2, 'Google News')
  } catch {
    return []
  }
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)
  const match = xml.match(regex)
  return match ? (match[1] || match[2] || '').trim() : ''
}

function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
