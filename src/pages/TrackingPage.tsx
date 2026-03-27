import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTrackedTrades } from '../hooks/useTracking'
import { formatPrice, formatPercent, formatDate, recommendationBgColor, statusColor, pnlColor } from '../lib/utils'
import type { TrackedTrade } from '../types'

const FILTER_TABS = [
  { label: '全部', value: '' },
  { label: '追蹤中', value: 'tracking' },
  { label: '成功', value: 'success' },
  { label: '失敗', value: 'failed' },
  { label: '過期', value: 'expired' },
] as const

function statusLabel(status: string): string {
  switch (status) {
    case 'tracking': return '追蹤中'
    case 'success': return '成功'
    case 'failed': return '失敗'
    case 'expired': return '過期'
    default: return status
  }
}

function recLabel(rec: string): string {
  switch (rec) {
    case 'BUY': return '買入'
    case 'SELL': return '賣出'
    default: return rec
  }
}

function TradeCard({ trade }: { trade: TrackedTrade }) {
  const isPositive = (trade.pnl_percent ?? 0) >= 0

  return (
    <Link to={`/alerts`} className="block">
      <div className="bg-white border border-border rounded-[10px] editorial-shadow hover:scale-[1.01] transition-transform p-4 flex flex-col gap-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <span className="serif-heading text-[22px] leading-tight text-on-surface">{trade.ticker}</span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${recommendationBgColor(trade.recommendation)}`}>
              {recLabel(trade.recommendation)}
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusColor(trade.status)}`}>
              {statusLabel(trade.status)}
            </span>
          </div>
        </div>

        {/* Price row */}
        <div className="mono-data text-[13px] text-on-surface-variant">
          進場 {formatPrice(trade.entry_price)}
          <span className="mx-1.5 text-border">→</span>
          現價 {trade.current_price != null ? formatPrice(trade.current_price) : <span className="italic">—</span>}
        </div>

        {/* PnL */}
        <div className={`serif-heading text-[28px] leading-none ${pnlColor(trade.pnl_percent)}`}>
          {trade.pnl_percent != null ? (
            <>
              <span className="mr-1 text-[20px]">{isPositive ? '▲' : '▼'}</span>
              {formatPercent(trade.pnl_percent)}
            </>
          ) : (
            <span className="text-[20px] text-on-surface-variant">—</span>
          )}
        </div>

        {/* Bottom section */}
        <div className="border-t border-border pt-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[12px] text-on-surface-variant">
            <span>信心指數 {trade.confidence}%</span>
            <span>開始日期 {new Date(trade.created_at).toLocaleDateString('zh-TW')}</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-surface overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${trade.confidence >= 70 ? 'bg-primary' : trade.confidence >= 40 ? 'bg-warning' : 'bg-tertiary'}`}
              style={{ width: `${trade.confidence}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}

function SettledTradesTable({ trades }: { trades: TrackedTrade[] }) {
  const settled = trades.filter(t => t.status === 'success' || t.status === 'failed' || t.status === 'expired')
  if (settled.length === 0) return null

  return (
    <div className="mt-8">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[11px] uppercase tracking-widest font-semibold text-on-surface-variant">
          已結算紀錄
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="bg-white rounded-xl editorial-shadow overflow-hidden border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface">
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">股票</th>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">方向</th>
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">損益</th>
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">日期</th>
            </tr>
          </thead>
          <tbody>
            {settled.map((trade, i) => (
              <tr
                key={trade.id}
                className={i % 2 === 0 ? 'bg-surface/30' : 'bg-white'}
              >
                <td className="px-4 py-3 serif-heading text-[15px] text-on-surface">{trade.ticker}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${recommendationBgColor(trade.recommendation)}`}>
                    {recLabel(trade.recommendation)}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right mono-data text-[13px] font-medium ${pnlColor(trade.pnl_percent)}`}>
                  {formatPercent(trade.pnl_percent)}
                </td>
                <td className="px-4 py-3 text-right text-[12px] text-secondary">
                  {trade.resolved_at ? formatDate(trade.resolved_at) : formatDate(trade.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function TrackingPage() {
  const [activeTab, setActiveTab] = useState('')
  const { data: trades = [], isLoading } = useTrackedTrades(activeTab || undefined)

  const activeTrades = trades.filter(t => t.status === 'tracking')

  // Summary stats computed from all trades (not filtered tab)
  const allTrades = trades
  const totalCount = allTrades.length
  const tradesWithPnl = allTrades.filter(t => t.pnl_percent != null)
  const avgPnl = tradesWithPnl.length > 0
    ? tradesWithPnl.reduce((sum, t) => sum + (t.pnl_percent ?? 0), 0) / tradesWithPnl.length
    : null
  const successCount = allTrades.filter(t => t.status === 'success').length
  const settledCount = allTrades.filter(t => ['success', 'failed', 'expired'].includes(t.status)).length
  const successRate = settledCount > 0 ? (successCount / settledCount) * 100 : null

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="serif-heading text-[36px] md:text-[44px] leading-tight text-on-surface">
          交易追蹤
        </h1>
        <p className="mt-2 text-[14px] text-on-surface-variant">
          即時追蹤持倉表現與歷史績效
        </p>
      </div>

      {/* Summary Bar */}
      {!isLoading && totalCount > 0 && (
        <div
          className="flex flex-wrap gap-3 mb-6 p-4 rounded-xl border border-border"
          style={{ backgroundColor: '#F2EDE4' }}
        >
          {/* Total count */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">monitoring</span>
            <span className="text-[13px] text-on-surface-variant">追蹤中</span>
            <span className="mono-data text-[15px] font-bold text-on-surface">{activeTrades.length}</span>
            <span className="text-[12px] text-on-surface-variant">/ {totalCount} 筆</span>
          </div>

          <div className="w-px h-5 bg-border self-center" />

          {/* Average PnL */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">trending_up</span>
            <span className="text-[13px] text-on-surface-variant">平均損益</span>
            {avgPnl != null ? (
              <span className={`mono-data text-[15px] font-bold ${avgPnl >= 0 ? 'text-primary-dark' : 'text-tertiary-dark'}`}>
                {avgPnl >= 0 ? '+' : ''}{avgPnl.toFixed(1)}%
              </span>
            ) : (
              <span className="mono-data text-[15px] text-on-surface-variant">—</span>
            )}
          </div>

          <div className="w-px h-5 bg-border self-center" />

          {/* Success rate */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">emoji_events</span>
            <span className="text-[13px] text-on-surface-variant">成功率</span>
            {successRate != null ? (
              <span className={`mono-data text-[15px] font-bold ${successRate >= 50 ? 'text-primary-dark' : 'text-tertiary-dark'}`}>
                {successRate.toFixed(0)}%
              </span>
            ) : (
              <span className="mono-data text-[15px] text-on-surface-variant">—</span>
            )}
            {settledCount > 0 && (
              <span className="text-[12px] text-on-surface-variant">({successCount}/{settledCount})</span>
            )}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="border-b border-border flex gap-1 mb-6">
        {FILTER_TABS.map(tab => {
          const isActive = activeTab === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={[
                'px-4 py-2.5 text-[13px] transition-colors relative',
                isActive
                  ? 'border-b-2 border-info text-info font-semibold -mb-px'
                  : 'text-on-surface-variant hover:text-on-surface',
              ].join(' ')}
            >
              {tab.label}
              {tab.value === 'tracking' && activeTrades.length > 0 && (
                <span className="ml-1.5 bg-info text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                  {activeTrades.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-on-surface-variant text-sm">載入中...</div>
        </div>
      )}

      {/* Trade Cards Grid */}
      {!isLoading && trades.length > 0 && (
        <>
          {/* Active/Tracking cards */}
          {(() => {
            const displayTrades = activeTab
              ? trades
              : trades.filter(t => t.status === 'tracking')
            return displayTrades.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayTrades.map(trade => (
                  <TradeCard key={trade.id} trade={trade} />
                ))}
              </div>
            ) : null
          })()}

          {/* Settled trades table */}
          {(activeTab === '' || ['success', 'failed', 'expired'].includes(activeTab)) && (
            <SettledTradesTable trades={trades} />
          )}
        </>
      )}

      {/* Empty state */}
      {!isLoading && trades.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <span className="material-symbols-outlined text-border" style={{ fontSize: 64 }}>
            trending_up
          </span>
          <h2 className="serif-heading text-[22px] text-on-surface">尚無追蹤紀錄</h2>
          <p className="text-sm text-on-surface-variant max-w-xs">
            前往警報頁面，開始追蹤你感興趣的交易訊號。
          </p>
          <Link to="/alerts" className="mt-2 px-5 py-2.5 rounded-lg bg-primary text-white text-[13px] font-medium hover:opacity-90 transition-opacity">
            前往警報
          </Link>
        </div>
      )}
    </div>
  )
}
