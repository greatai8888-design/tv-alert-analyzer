import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAlert } from '../hooks/useAlerts'
import { useAddFavorite } from '../hooks/useFavorites'
import { formatPrice, formatDate, recommendationBgColor } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Analysis } from '../types'

type ChartTab = 'Daily' | 'Weekly' | 'Intraday'

function getAnalysis(analyses?: Analysis[]): Analysis | null {
  return analyses && analyses.length > 0 ? analyses[0] : null
}

function recLabel(rec: string): string {
  switch (rec) { case 'BUY': return '買入'; case 'SELL': return '賣出'; case 'HOLD': return '觀望'; default: return rec }
}

function confidenceColor(c: number): string {
  if (c >= 70) return 'text-primary-dark'
  if (c >= 40) return 'text-warning-dark'
  return 'text-tertiary'
}

function confidenceBgColor(c: number): string {
  if (c >= 70) return 'bg-primary'
  if (c >= 40) return 'bg-warning'
  return 'bg-tertiary'
}

function rsiColor(rsi: number | null): string {
  if (rsi == null) return 'text-on-surface'
  if (rsi >= 70) return 'text-tertiary font-semibold'
  if (rsi <= 30) return 'text-primary font-semibold'
  return 'text-on-surface'
}

function rsiLabel(rsi: number | null): string {
  if (rsi == null) return ''
  if (rsi >= 70) return '（超買）'
  if (rsi <= 30) return '（超賣）'
  return ''
}

function MacdBadge({ signal }: { signal: string | null }) {
  if (!signal) return <span className="mono-data text-sm text-on-surface-variant">—</span>
  const lower = signal.toLowerCase()
  const cls = lower.includes('bull') || lower.includes('buy')
    ? 'bg-primary-light text-primary-dark border-primary/20'
    : lower.includes('bear') || lower.includes('sell')
    ? 'bg-tertiary-light text-tertiary-dark border-tertiary/20'
    : 'bg-surface text-on-surface-variant border-border'
  const label = lower.includes('bull') || lower.includes('buy') ? '看漲'
    : lower.includes('bear') || lower.includes('sell') ? '看跌' : signal
  return (
    <span className={`mono-data text-xs font-semibold rounded-full px-2 py-0.5 border ${cls}`}>
      {label}
    </span>
  )
}

function volumeLabel(vol: string | null): string {
  if (!vol) return '—'
  const lower = vol.toLowerCase()
  if (lower.includes('increas') || lower.includes('high') || lower.includes('above')) return '放量'
  if (lower.includes('decreas') || lower.includes('low') || lower.includes('below')) return '縮量'
  return vol
}

function IndicatorRow({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-4">
      <span className="text-sm text-on-surface-variant">{label}</span>
      {mono && typeof value === 'string' ? (
        <span className="mono-data text-sm text-on-surface">{value}</span>
      ) : (
        <>{value}</>
      )}
    </div>
  )
}

export default function AlertDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: alert, isLoading, error } = useAlert(id ?? '')
  const addFavorite = useAddFavorite()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<ChartTab>('Daily')
  const [favorited, setFavorited] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [tracked, setTracked] = useState(false)

  const analysis = getAnalysis(alert?.analyses)

  async function handleStartTracking() {
    if (!alert || !user || tracked || tracking) return
    setTracking(true)
    try {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)
      const { error: insertError } = await supabase.from('tracked_trades').insert({
        user_id: user.id,
        analysis_id: analysis?.id ?? null,
        ticker: alert.ticker,
        recommendation: analysis?.recommendation ?? alert.action ?? 'HOLD',
        entry_price: analysis?.entry_price ?? alert.price,
        stop_loss: analysis?.stop_loss ?? null,
        take_profit: analysis?.take_profit ?? null,
        confidence: analysis?.confidence ?? 0,
        status: 'tracking',
        expires_at: expiresAt.toISOString(),
      })
      if (insertError) throw insertError
      setTracked(true)
    } catch (err: unknown) {
      window.alert('追蹤失敗: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setTracking(false)
    }
  }

  async function handleFavorite() {
    if (!alert || favorited) return
    try {
      await addFavorite.mutateAsync({ alertId: alert.id })
      setFavorited(true)
    } catch {
      // ignore
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
        載入中...
      </div>
    )
  }

  if (error || !alert) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined text-5xl">error_outline</span>
        <p className="text-sm">找不到此警報</p>
        <Link to="/alerts" className="text-sm text-secondary hover:underline">← 返回列表</Link>
      </div>
    )
  }

  const rec = analysis?.recommendation
  const confidence = analysis?.confidence ?? 0

  // Extract news from news_context if available
  const newsItems: Array<{ title: string; source?: string; publishedAt?: string; url?: string }> = (() => {
    if (!analysis?.news_context) return []
    const ctx = analysis.news_context
    if (Array.isArray(ctx)) return ctx as typeof newsItems
    if (ctx.articles && Array.isArray(ctx.articles)) return ctx.articles as typeof newsItems
    return []
  })()

  return (
    <div className="max-w-2xl mx-auto">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-3 mb-4 pt-1">
        <div className="flex items-start gap-3">
          {/* Back link */}
          <Link
            to="/alerts"
            className="text-sm font-medium mt-0.5 shrink-0 hover:underline"
            style={{ color: 'var(--color-secondary)' }}
          >
            ← 返回
          </Link>

          {/* Ticker + exchange */}
          <div className="flex-1">
            <h1 className="serif-heading text-2xl text-on-surface leading-tight">{alert.ticker}</h1>
            {alert.exchange && (
              <span className="mono-data text-xs uppercase tracking-widest text-on-surface-variant">
                {alert.exchange}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleFavorite}
              disabled={favorited || addFavorite.isPending}
              className="flex items-center justify-center w-9 h-9 rounded-full transition-colors disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-warning)' }}
              title="加入收藏"
            >
              <span
                className="material-symbols-outlined text-white text-base"
                style={{ fontVariationSettings: favorited ? "'FILL' 1" : "'FILL' 0" }}
              >
                star
              </span>
            </button>
            <button
              onClick={handleStartTracking}
              disabled={tracked || tracking}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors hover:bg-info-light disabled:opacity-60"
              style={{ borderColor: 'var(--color-info)', color: 'var(--color-info)' }}
            >
              <span className="material-symbols-outlined text-base">track_changes</span>
              {tracked ? '已追蹤' : tracking ? '處理中...' : '開始追蹤'}
            </button>
          </div>
        </div>
      </div>

      {/* Price & Sentiment Hero */}
      <div className="bg-white rounded-xl border border-border p-5 mb-4 editorial-shadow">
        <div className="flex items-end gap-4 flex-wrap">
          <span className="mono-data text-4xl font-semibold text-on-surface">
            {formatPrice(alert.price)}
          </span>
          {rec && (
            <span className={`text-sm font-semibold rounded-full px-3 py-1 ${recommendationBgColor(rec)}`}>
              {recLabel(rec)}
            </span>
          )}
          {analysis && (
            <span className="text-sm text-on-surface-variant">
              信心度 <span className={`mono-data font-semibold ${confidenceColor(confidence)}`}>{confidence}%</span>
            </span>
          )}
        </div>
        {/* Confidence bar */}
        {analysis && (
          <div className="mt-3 h-2 rounded-full bg-surface overflow-hidden">
            <div
              className={`h-full rounded-full ${confidenceBgColor(confidence)} transition-all`}
              style={{ width: `${confidence}%` }}
            />
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-3 text-on-surface-variant text-xs">
          <span className="material-symbols-outlined text-sm">schedule</span>
          市場數據延遲 15 分鐘
          {alert.created_at && (
            <span className="ml-2 mono-data">{formatDate(alert.created_at)}</span>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="bg-surface rounded-xl border border-border p-4 mb-4">
        {/* Tab buttons */}
        <div className="flex gap-1 mb-4">
          {(['Daily', 'Weekly', 'Intraday'] as ChartTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-white'
                  : 'text-on-surface-variant hover:bg-border'
              }`}
            >
              {tab === 'Daily' ? '日線' : tab === 'Weekly' ? '週線' : '分時'}
            </button>
          ))}
        </div>

        {/* Chart placeholder / image */}
        <div className="h-64 rounded-lg border border-border overflow-hidden bg-white flex items-center justify-center">
          {analysis?.chart_urls?.[activeTab.toLowerCase()] ? (
            <img
              src={analysis.chart_urls[activeTab.toLowerCase()]}
              alt={`${activeTab} chart`}
              className="w-full h-full object-contain"
            />
          ) : (
            <svg
              className="w-full h-full"
              viewBox="0 0 400 200"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
            >
              <rect width="400" height="200" fill="#F2EDE4" />
              {[40, 80, 120, 160].map(y => (
                <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#D9D2C7" strokeWidth="0.5" />
              ))}
              {[80, 160, 240, 320].map(x => (
                <line key={x} x1={x} y1="0" x2={x} y2="200" stroke="#D9D2C7" strokeWidth="0.5" />
              ))}
              <polyline
                points="0,160 50,140 100,120 150,130 200,90 250,100 300,70 350,80 400,60"
                fill="none"
                stroke="#6B7A2E"
                strokeWidth="2"
              />
              <polyline
                points="0,160 50,140 100,120 150,130 200,90 250,100 300,70 350,80 400,60 400,200 0,200"
                fill="#6B7A2E"
                fillOpacity="0.1"
              />
              <text x="200" y="110" textAnchor="middle" fill="#8A8078" fontSize="12" fontFamily="IBM Plex Mono, monospace">
                {activeTab === 'Daily' ? '日線圖表' : activeTab === 'Weekly' ? '週線圖表' : '分時圖表'}
              </text>
            </svg>
          )}
        </div>
      </div>

      {/* AI Summary Card */}
      {analysis?.summary && (
        <div className="bg-white rounded-xl border border-border border-l-4 mb-4 editorial-shadow overflow-hidden"
          style={{ borderLeftColor: 'var(--color-secondary)', borderLeftWidth: 3 }}
        >
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-lg">auto_awesome</span>
            <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">AI 分析摘要</span>
          </div>
          <div className="px-4 py-4 text-sm text-on-surface leading-relaxed">
            {analysis.summary}
          </div>
        </div>
      )}

      {/* Price Suggestions 3-column grid */}
      {analysis && (analysis.entry_price || analysis.stop_loss || analysis.take_profit) && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Entry */}
          <div className="bg-surface rounded-xl p-3 border border-border text-center">
            <div className="text-xs text-on-surface-variant mb-1" style={{ fontSize: 10 }}>進場價格</div>
            <div className="mono-data text-lg font-semibold text-primary">
              {formatPrice(analysis.entry_price)}
            </div>
          </div>
          {/* Stop Loss */}
          <div className="bg-tertiary-light rounded-xl p-3 border border-tertiary/20 text-center">
            <div className="text-xs text-tertiary-dark mb-1" style={{ fontSize: 10 }}>止損價格</div>
            <div className="mono-data text-lg font-semibold text-tertiary">
              {formatPrice(analysis.stop_loss)}
            </div>
          </div>
          {/* Take Profit */}
          <div className="bg-primary-light rounded-xl p-3 border border-primary/20 text-center">
            <div className="text-xs text-primary-dark mb-1" style={{ fontSize: 10 }}>目標價格</div>
            <div className="mono-data text-lg font-semibold text-primary">
              {formatPrice(analysis.take_profit)}
            </div>
          </div>
        </div>
      )}

      {/* Technical Indicators Card */}
      {analysis && (
        <div className="bg-white rounded-xl border border-border mb-4 overflow-hidden editorial-shadow">
          <div className="bg-background px-4 py-3 flex items-center gap-2 border-b border-border">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">analytics</span>
            <span className="text-sm font-bold text-on-surface">技術指標</span>
          </div>
          <div className="divide-y divide-border">
            <IndicatorRow
              label="RSI"
              value={
                analysis.rsi != null ? (
                  <span className={`mono-data text-sm ${rsiColor(analysis.rsi)}`}>
                    {analysis.rsi.toFixed(1)} {rsiLabel(analysis.rsi)}
                  </span>
                ) : '—'
              }
              mono={false}
            />
            <IndicatorRow
              label="SMA 20"
              value={formatPrice(analysis.sma_20)}
            />
            <IndicatorRow
              label="SMA 50"
              value={formatPrice(analysis.sma_50)}
            />
            <IndicatorRow
              label="SMA 200"
              value={formatPrice(analysis.sma_200)}
            />
            <IndicatorRow
              label="MACD"
              value={<MacdBadge signal={analysis.macd_signal} />}
              mono={false}
            />
            <IndicatorRow
              label="支撐位"
              value={formatPrice(analysis.support_price)}
            />
            <IndicatorRow
              label="阻力位"
              value={formatPrice(analysis.resistance_price)}
            />
            {analysis.volume_trend && (
              <IndicatorRow
                label="成交量趨勢"
                value={volumeLabel(analysis.volume_trend)}
              />
            )}
          </div>
        </div>
      )}

      {/* Related News */}
      {newsItems.length > 0 && (
        <div className="mb-4">
          <h2 className="serif-heading text-xl text-on-surface mb-3">相關新聞</h2>
          <div className="flex flex-col gap-3">
            {newsItems.map((item, i) => (
              <div key={i} className="bg-white rounded-xl border border-border p-4 editorial-shadow">
                <div className="flex items-center gap-2 mb-2">
                  {item.source && (
                    <span className="bg-surface rounded px-2 py-0.5 text-xs font-bold text-on-surface-variant uppercase tracking-wide">
                      {item.source}
                    </span>
                  )}
                  {item.publishedAt && (
                    <span className="mono-data text-xs text-on-surface-variant">
                      {formatDate(item.publishedAt)}
                    </span>
                  )}
                </div>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="serif-heading text-base text-on-surface leading-snug hover:text-secondary transition-colors">
                    {item.title}
                    <span className="material-symbols-outlined text-sm ml-1 align-middle text-on-surface-variant">open_in_new</span>
                  </a>
                ) : (
                  <h3 className="serif-heading text-base text-on-surface leading-snug">{item.title}</h3>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom padding for mobile nav */}
      <div className="h-6" />
    </div>
  )
}
