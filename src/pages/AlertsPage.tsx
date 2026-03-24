import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlerts } from '../hooks/useAlerts'
import { formatPrice } from '../lib/utils'
import type { Alert } from '../types'

type FilterType = 'ALL' | 'BUY' | 'SELL' | 'HOLD'
type SortOrder = 'desc' | 'asc'
type ViewMode = 'grouped' | 'grid'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m 前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h 前`
  return `${Math.floor(hrs / 24)}d 前`
}

function getFirstAnalysis(alert: Alert) {
  return alert.analyses && alert.analyses.length > 0 ? alert.analyses[0] : null
}

export default function AlertsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL')
  const [searchTicker, setSearchTicker] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('grouped')
  const [dateRange, setDateRange] = useState('')
  const navigate = useNavigate()

  const { data: alerts = [], isLoading } = useAlerts({
    ticker: searchTicker || undefined,
    limit: 100,
  })

  const filtered = useMemo(() => {
    let result = alerts

    if (activeFilter !== 'ALL') {
      result = result.filter(a => {
        const analysis = getFirstAnalysis(a)
        return analysis?.recommendation === activeFilter
      })
    }

    if (sortOrder === 'asc') {
      result = [...result].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }

    return result
  }, [alerts, activeFilter, sortOrder])

  // Group by ticker
  const grouped = useMemo(() => {
    const map = new Map<string, Alert[]>()
    for (const alert of filtered) {
      const key = alert.ticker
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(alert)
    }
    return Array.from(map.entries())
  }, [filtered])

  const filterPills: { label: string; value: FilterType }[] = [
    { label: 'ALL', value: 'ALL' },
    { label: 'BUY', value: 'BUY' },
    { label: 'SELL', value: 'SELL' },
    { label: 'HOLD', value: 'HOLD' },
  ]

  function filterPillClass(value: FilterType) {
    const isActive = activeFilter === value
    if (!isActive)
      return 'px-4 py-1.5 rounded-full text-sm font-medium border border-border text-on-surface-variant hover:bg-surface transition-colors cursor-pointer'
    if (value === 'BUY')
      return 'px-4 py-1.5 rounded-full text-sm font-medium bg-primary-light text-primary-dark border border-primary/20 cursor-pointer'
    if (value === 'SELL')
      return 'px-4 py-1.5 rounded-full text-sm font-medium bg-tertiary-light text-tertiary-dark border border-tertiary/20 cursor-pointer'
    if (value === 'HOLD')
      return 'px-4 py-1.5 rounded-full text-sm font-medium bg-warning-light text-warning-dark border border-warning/20 cursor-pointer'
    return 'px-4 py-1.5 rounded-full text-sm font-medium bg-surface text-on-surface border border-border cursor-pointer'
  }

  function alertRowBorder(rec?: string) {
    switch (rec) {
      case 'BUY': return 'border-l-4 border-l-[#6B7A2E]'
      case 'SELL': return 'border-l-4 border-l-[#A33220]'
      case 'HOLD': return 'border-l-4 border-l-[#D4A843]'
      default: return 'border-l-4 border-l-border'
    }
  }

  function alertBadgeSolid(rec?: string) {
    switch (rec) {
      case 'BUY': return 'bg-[#6B7A2E] text-white'
      case 'SELL': return 'bg-[#A33220] text-white'
      case 'HOLD': return 'bg-[#D4A843] text-[#2C2A24]'
      default: return 'bg-surface text-on-surface-variant border border-border'
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Sticky Filter Bar */}
      <div
        className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-3 mb-4 pt-1"
      >
        <div className="flex flex-wrap gap-2 items-center mb-3">
          {/* Recommendation filter pills */}
          {filterPills.map(pill => (
            <button
              key={pill.value}
              className={filterPillClass(pill.value)}
              onClick={() => setActiveFilter(pill.value)}
            >
              {pill.label}
            </button>
          ))}

          <div className="flex-1" />

          {/* Sort button */}
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border border-border text-on-surface-variant hover:bg-surface transition-colors"
            onClick={() => setSortOrder(o => (o === 'desc' ? 'asc' : 'desc'))}
          >
            最新
            <span
              className="material-symbols-outlined text-base transition-transform"
              style={{ transform: sortOrder === 'asc' ? 'rotate(180deg)' : 'none' }}
            >
              arrow_downward
            </span>
          </button>

          {/* View toggle */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              className={`p-1.5 transition-colors ${viewMode === 'grouped' ? 'bg-surface text-on-surface' : 'text-on-surface-variant hover:bg-surface'}`}
              onClick={() => setViewMode('grouped')}
              title="分組視圖"
            >
              <span className="material-symbols-outlined text-base">view_list</span>
            </button>
            <button
              className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-surface text-on-surface' : 'text-on-surface-variant hover:bg-surface'}`}
              onClick={() => setViewMode('grid')}
              title="網格視圖"
            >
              <span className="material-symbols-outlined text-base">grid_view</span>
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Date range input */}
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2 text-on-surface-variant text-base pointer-events-none">
              calendar_month
            </span>
            <input
              type="date"
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-white text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 mono-data"
            />
          </div>

          {/* Ticker search */}
          <div className="relative flex items-center flex-1 max-w-xs">
            <span className="material-symbols-outlined absolute left-2 text-on-surface-variant text-base pointer-events-none">
              search
            </span>
            <input
              type="text"
              placeholder="搜尋代碼..."
              value={searchTicker}
              onChange={e => setSearchTicker(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-white text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 w-full mono-data placeholder:font-sans"
            />
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
          載入中...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && grouped.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant gap-3">
          <span className="material-symbols-outlined text-5xl">inbox</span>
          <p className="text-sm">沒有符合條件的警報</p>
        </div>
      )}

      {/* Ticker-Grouped Alert List */}
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'flex flex-col gap-4'}>
        {grouped.map(([ticker, tickerAlerts]) => (
          <div key={ticker} className="rounded-xl overflow-hidden editorial-shadow border border-border">
            {/* Group header */}
            <div className="bg-surface px-4 py-3 flex items-center gap-3 border-b border-border">
              <h2 className="serif-heading text-lg text-on-surface">{ticker}</h2>
              {tickerAlerts[0]?.exchange && (
                <span className="mono-data text-xs text-on-surface-variant uppercase tracking-widest">
                  {tickerAlerts[0].exchange}
                </span>
              )}
              <div className="flex-1" />
              <span className="text-xs font-semibold bg-primary-light text-primary-dark rounded-full px-2.5 py-0.5 border border-primary/20">
                {tickerAlerts.length}
              </span>
            </div>

            {/* Alert rows */}
            <div className="divide-y divide-border">
              {tickerAlerts.map(alert => {
                const analysis = getFirstAnalysis(alert)
                const rec = analysis?.recommendation
                const confidence = analysis?.confidence ?? 0

                return (
                  <div
                    key={alert.id}
                    className={`flex items-center gap-4 px-4 bg-white hover:bg-background transition-colors cursor-pointer ${alertRowBorder(rec)}`}
                    style={{ minHeight: 72 }}
                    onClick={() => navigate(`/alerts/${alert.id}`)}
                  >
                    {/* Left: ticker + price */}
                    <div className="flex flex-col min-w-[64px]">
                      <span className="serif-heading text-xl text-on-surface leading-tight">{alert.ticker}</span>
                      <span className="mono-data text-xs text-on-surface-variant">
                        {formatPrice(alert.price)}
                      </span>
                    </div>

                    {/* Center: badge + confidence bar */}
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {rec ? (
                        <span className={`self-start text-xs font-semibold rounded-full px-2.5 py-0.5 ${alertBadgeSolid(rec)}`}>
                          {rec}
                        </span>
                      ) : (
                        <span className="self-start text-xs font-semibold rounded-full px-2.5 py-0.5 bg-surface text-on-surface-variant border border-border">
                          分析中
                        </span>
                      )}
                      {rec && (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 max-w-[80px] h-1 bg-border rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${rec === 'BUY' ? 'bg-primary' : rec === 'SELL' ? 'bg-tertiary' : 'bg-warning'}`}
                              style={{ width: `${confidence}%` }}
                            />
                          </div>
                          <span className="mono-data text-xs text-on-surface-variant">{confidence}%</span>
                        </div>
                      )}
                    </div>

                    {/* Right: time + chevron */}
                    <div className="flex items-center gap-1 text-on-surface-variant shrink-0">
                      <span className="mono-data text-xs">{timeAgo(alert.created_at)}</span>
                      <span className="material-symbols-outlined text-base">chevron_right</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom padding for mobile nav */}
      <div className="h-6" />
    </div>
  )
}
