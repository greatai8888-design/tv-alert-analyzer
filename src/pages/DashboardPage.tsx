import { Link } from 'react-router-dom'
import { useAlerts } from '../hooks/useAlerts'
import { useStats } from '../hooks/useStats'
import { useTrackedTrades } from '../hooks/useTracking'
import {
  formatPrice,
  formatPercent,
  recommendationBgColor,
  pnlColor,
  statusColor,
} from '../lib/utils'
import type { Alert, TrackedTrade } from '../types'

// ─── helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function alertLeftBorderColor(rec: string): string {
  switch (rec) {
    case 'BUY': return 'border-l-[#6B7A2E]'
    case 'SELL': return 'border-l-[#A33220]'
    case 'HOLD': return 'border-l-[#D4A843]'
    default: return 'border-l-[#D4A843]'
  }
}

function getLatestRec(alert: Alert): string {
  const recommendation = alert.analyses?.[0]?.recommendation
  if (recommendation) return recommendation
  return alert.action ?? 'HOLD'
}

function getLatestAnalysis(alert: Alert) {
  if (!alert.analyses || alert.analyses.length === 0) return null
  return alert.analyses[alert.analyses.length - 1]
}

// ─── sub-components ──────────────────────────────────────────────────────────

function AlertChip({ alert }: { alert: Alert }) {
  const rec = getLatestRec(alert)
  return (
    <Link
      to={`/alerts/${alert.id}`}
      className={`flex-shrink-0 flex items-center gap-2 bg-white border border-border border-l-4 ${alertLeftBorderColor(rec)} rounded-lg px-3 py-2 hover:shadow-sm transition-shadow`}
    >
      <span className="font-semibold text-on-surface text-sm">{alert.ticker}</span>
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${recommendationBgColor(rec)}`}>
        {rec}
      </span>
      <span className="mono-data text-[11px] text-on-surface-variant">{formatPrice(alert.price)}</span>
      <span className="text-[11px] text-on-surface-variant">{timeAgo(alert.created_at)}</span>
    </Link>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  borderColor: string
}

function StatCard({ label, value, borderColor }: StatCardProps) {
  return (
    <div className={`bg-white border border-border border-l-4 ${borderColor} rounded-xl px-5 py-4`}>
      <p className="text-sm text-on-surface-variant mb-1">{label}</p>
      <p className={`serif-heading text-[36px] leading-none text-on-surface`}>{value}</p>
    </div>
  )
}

function SignalCard({ alert }: { alert: Alert }) {
  const analysis = getLatestAnalysis(alert)
  const rec = analysis?.recommendation ?? getLatestRec(alert)
  const confidence = analysis?.confidence ?? 0

  return (
    <div className="bg-white border border-border rounded-xl p-4 relative">
      {/* Badge top-right */}
      <span className={`absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-full ${recommendationBgColor(rec)}`}>
        {rec}
      </span>

      {/* Ticker + name */}
      <div className="mb-3 pr-16">
        <p className="serif-heading text-[22px] leading-tight text-on-surface">{alert.ticker}</p>
        {alert.exchange && (
          <p className="text-xs text-on-surface-variant mt-0.5">{alert.exchange}</p>
        )}
      </div>

      {/* Confidence bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-on-surface-variant uppercase tracking-wider">信心度</span>
          <span className="mono-data text-[11px] text-on-surface-variant">{confidence}%</span>
        </div>
        <div className="h-1 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(confidence, 100)}%` }}
          />
        </div>
      </div>

      {/* Price tags */}
      <div className="flex flex-wrap gap-1.5">
        {analysis?.entry_price != null && (
          <span className="mono-data text-[10px] bg-surface rounded px-2 py-1 text-on-surface-variant">
            進 {formatPrice(analysis.entry_price)}
          </span>
        )}
        {analysis?.stop_loss != null && (
          <span className="mono-data text-[10px] bg-surface rounded px-2 py-1 text-on-surface-variant">
            SL {formatPrice(analysis.stop_loss)}
          </span>
        )}
        {analysis?.take_profit != null && (
          <span className="mono-data text-[10px] bg-surface rounded px-2 py-1 text-on-surface-variant">
            TP {formatPrice(analysis.take_profit)}
          </span>
        )}
      </div>
    </div>
  )
}

function TradeRow({ trade, index }: { trade: TrackedTrade; index: number }) {
  const isEven = index % 2 === 0
  const pnl = trade.pnl_percent
  const isProfit = pnl != null && pnl >= 0
  const dotColor = trade.status === 'tracking'
    ? (isProfit ? 'bg-primary' : 'bg-tertiary')
    : trade.status === 'success' ? 'bg-primary' : 'bg-tertiary'

  return (
    <tr className={isEven ? 'bg-white' : 'bg-background'}>
      <td className="px-4 py-3 text-sm font-semibold text-on-surface">{trade.ticker}</td>
      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant">{formatPrice(trade.entry_price)}</td>
      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant">{formatPrice(trade.current_price)}</td>
      <td className={`px-4 py-3 mono-data text-xs text-right font-medium ${pnlColor(pnl)}`}>
        {formatPercent(pnl)}
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${statusColor(trade.status)}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          {trade.status}
        </span>
      </td>
    </tr>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: allAlerts = [], isLoading: alertsLoading } = useAlerts({ limit: 20 })
  const { data: stats } = useStats()
  const { data: activeTrades = [] } = useTrackedTrades('tracking')

  // Top signals: BUY or SELL with highest confidence, limit 3
  const topSignals = allAlerts
    .filter(a => {
      const analysis = getLatestAnalysis(a)
      const rec = analysis?.recommendation ?? a.action
      return rec === 'BUY' || rec === 'SELL'
    })
    .sort((a, b) => {
      const ca = getLatestAnalysis(a)?.confidence ?? 0
      const cb = getLatestAnalysis(b)?.confidence ?? 0
      return cb - ca
    })
    .slice(0, 3)

  // Recent alerts for chips: latest 12
  const recentAlerts = allAlerts.slice(0, 12)

  return (
    <div className="space-y-8 pb-8">

      {/* ── 1. Recent Alerts Chips ───────────────────────────────────────── */}
      <section>
        <h2 className="serif-heading text-xl text-on-surface mb-3">最新訊號</h2>
        {alertsLoading ? (
          <div className="h-12 flex items-center text-sm text-on-surface-variant">載入中…</div>
        ) : recentAlerts.length === 0 ? (
          <div className="text-sm text-on-surface-variant">尚無訊號</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {recentAlerts.map(alert => (
              <AlertChip key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </section>

      {/* ── 2. Stats Bar ─────────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="總交易數"
            value={stats?.total ?? '—'}
            borderColor="border-l-on-surface"
          />
          <StatCard
            label="勝率"
            value={stats ? `${stats.winRate}%` : '—'}
            borderColor="border-l-primary"
          />
          <StatCard
            label="平均 PnL"
            value={stats ? formatPercent(stats.avgPnl) : '—'}
            borderColor="border-l-primary"
          />
          <StatCard
            label="追蹤中"
            value={stats?.tracking ?? '—'}
            borderColor="border-l-info"
          />
        </div>
      </section>

      {/* ── 3. Top Signals ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="serif-heading text-xl text-on-surface">Top Signals</h2>
          <Link to="/alerts" className="text-sm text-secondary hover:underline font-medium">
            View All
          </Link>
        </div>
        {topSignals.length === 0 && !alertsLoading ? (
          <p className="text-sm text-on-surface-variant">尚無高信心度訊號</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topSignals.map(alert => (
              <Link key={alert.id} to={`/alerts/${alert.id}`} className="block hover:opacity-90 transition-opacity">
                <SignalCard alert={alert} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── 4. Active Trades Table ───────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="serif-heading text-xl text-on-surface">Active Trades</h2>
          <button className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Filter trades">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>filter_list</span>
          </button>
        </div>

        {activeTrades.length === 0 ? (
          <div className="bg-white border border-border rounded-xl px-6 py-8 text-center text-sm text-on-surface-variant">
            目前沒有追蹤中的交易
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-on-surface-variant">Ticker</th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-on-surface-variant">進場</th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-on-surface-variant">現價</th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-on-surface-variant text-right">P&L</th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-on-surface-variant text-center">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeTrades.map((trade: TrackedTrade, i: number) => (
                  <TradeRow key={trade.id} trade={trade} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}
