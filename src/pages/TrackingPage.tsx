import { useState } from 'react'
import { useTrackedTrades } from '../hooks/useTracking'
import { formatPrice, formatPercent, formatDate, recommendationBgColor, statusColor, pnlColor } from '../lib/utils'
import type { TrackedTrade } from '../types'

const FILTER_TABS = [
  { label: 'All', value: '' },
  { label: 'Tracking', value: 'tracking' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
  { label: 'Expired', value: 'expired' },
] as const

function TradeCard({ trade }: { trade: TrackedTrade }) {
  const isPositive = (trade.pnl_percent ?? 0) >= 0

  return (
    <div className="bg-white border border-border rounded-[10px] editorial-shadow hover:scale-[1.01] transition-transform p-4 flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <span className="serif-heading text-[22px] leading-tight text-on-surface">{trade.ticker}</span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${recommendationBgColor(trade.recommendation)}`}>
            {trade.recommendation}
          </span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusColor(trade.status)}`}>
            {trade.status === 'tracking' ? 'Active' : trade.status === 'expired' ? 'Expired' : trade.status.charAt(0).toUpperCase() + trade.status.slice(1)}
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
            className="absolute inset-y-0 left-0 rounded-full bg-info"
            style={{ width: `${trade.confidence}%` }}
          />
        </div>
      </div>
    </div>
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
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">Ticker</th>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">Signal</th>
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">Result (P&amp;L)</th>
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">Date</th>
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
                    {trade.recommendation}
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
        <div className="px-4 py-3 border-t border-border flex justify-end">
          <button className="text-[13px] text-info hover:underline font-medium">
            View full history
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TrackingPage() {
  const [activeTab, setActiveTab] = useState('')
  const { data: trades = [], isLoading } = useTrackedTrades(activeTab || undefined)

  const activeTrades = trades.filter(t => t.status === 'tracking')

  return (
    <div className="max-w-5xl mx-auto">
      {/* Editorial Header */}
      <div className="mb-8">
        <h1 className="serif-heading text-[36px] md:text-[44px] leading-tight text-on-surface">
          The Portfolio{' '}
          <em className="text-primary not-italic" style={{ fontStyle: 'italic' }}>Live Ledger</em>
        </h1>
        <p className="mt-2 text-[14px] text-on-surface-variant" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
          Real-time tracking of active positions and historical performance.
        </p>
      </div>

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

          {/* Settled trades table — only show when "All" or settled filter */}
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
            前往 Alerts 頁面，開始追蹤你感興趣的交易訊號。
          </p>
        </div>
      )}
    </div>
  )
}
