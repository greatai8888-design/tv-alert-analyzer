import { useState } from 'react'
import {
  useSimPortfolio,
  useSimTrades,
  useCreatePortfolio,
  useManualClose,
  useUpdateTpSl,
  useTradeLog,
} from '../hooks/useSimTrading'
import { formatPrice, formatPercent } from '../lib/utils'
import type { SimTrade, SimTradeLog } from '../hooks/useSimTrading'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function logActionBadge(action: string): string {
  switch (action) {
    case 'BUY': return 'bg-primary-light text-primary-dark border border-primary/20'
    case 'SELL_TP': return 'bg-primary-light text-primary-dark border border-primary/20'
    case 'SELL_SL': return 'bg-tertiary-light text-tertiary-dark border border-tertiary/20'
    case 'SELL_MANUAL': return 'bg-warning-light text-warning-dark border border-warning/20'
    case 'SELL_EXPIRED': return 'bg-neutral/10 text-on-surface-variant border border-border'
    default: return 'bg-surface text-on-surface-variant border border-border'
  }
}

function logActionLabel(action: string): string {
  switch (action) {
    case 'BUY': return '買入'
    case 'SELL_TP': return '止盈'
    case 'SELL_SL': return '止損'
    case 'SELL_MANUAL': return '手動平倉'
    case 'SELL_EXPIRED': return '到期平倉'
    default: return action
  }
}

// ─── Portfolio Setup ─────────────────────────────────────────────────────────

function SetupView() {
  const [capital, setCapital] = useState(30000)
  const createPortfolio = useCreatePortfolio()

  return (
    <div className="max-w-md mx-auto flex flex-col items-center justify-center py-20 gap-6 text-center">
      <span className="material-symbols-outlined text-primary" style={{ fontSize: 72 }}>smart_toy</span>
      <h2 className="serif-heading text-[28px] text-on-surface">建立 AI 自動交易帳戶</h2>
      <p className="text-sm text-on-surface-variant max-w-xs">
        AI 將完全自主操盤：自動從 TradingView 警報中選股買入，到達止盈/止損時自動賣出。你只需要觀察 AI 的操作和績效。
      </p>

      <div className="bg-surface rounded-xl p-4 w-full max-w-xs border border-border">
        <div className="text-xs text-on-surface-variant mb-3 text-left font-semibold">AI 交易規則</div>
        <div className="space-y-2 text-left">
          {[
            '買入信號信心度 ≥ 65% 自動買入',
            '每筆交易最多投入 15% 資金',
            '最多同時持有 10 支股票',
            '到達目標價自動止盈',
            '觸發止損價自動止損',
            '持倉超過 30 天自動平倉',
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-primary text-sm mt-0.5">check_circle</span>
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-xs">
        <label className="block text-xs text-on-surface-variant mb-1 text-left">起始本金（美元）</label>
        <input
          type="number"
          value={capital}
          onChange={e => setCapital(Number(e.target.value))}
          className="w-full px-4 py-3 rounded-xl border border-border bg-white text-lg mono-data text-on-surface outline-none focus:border-primary text-center"
        />
      </div>
      <button
        onClick={() => createPortfolio.mutate(capital)}
        disabled={createPortfolio.isPending || capital < 1000}
        className="px-8 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {createPortfolio.isPending ? '建立中...' : '啟動 AI 自動交易'}
      </button>
      {capital < 1000 && <p className="text-xs text-tertiary">最低本金 $1,000</p>}
    </div>
  )
}

// ─── Holding Card ────────────────────────────────────────────────────────────

function HoldingCard({ trade, portfolioId }: { trade: SimTrade; portfolioId: string }) {
  const currentPrice = trade.current_price ?? trade.entry_price
  const unrealizedPnl = (currentPrice - trade.entry_price) * trade.quantity
  const unrealizedPnlPct = ((currentPrice - trade.entry_price) / trade.entry_price) * 100
  const isProfit = unrealizedPnl >= 0
  const marketValue = currentPrice * trade.quantity
  const daysHeld = Math.floor((Date.now() - new Date(trade.created_at).getTime()) / (1000 * 60 * 60 * 24))

  const manualClose = useManualClose(portfolioId)
  const updateTpSl = useUpdateTpSl(portfolioId)
  const [showConfirm, setShowConfirm] = useState(false)
  const [editingTpSl, setEditingTpSl] = useState(false)
  const [editSl, setEditSl] = useState(trade.stop_loss ?? 0)
  const [editTp, setEditTp] = useState(trade.take_profit ?? 0)

  return (
    <div className="bg-white rounded-xl border border-border p-4 editorial-shadow">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="serif-heading text-lg text-on-surface">{trade.ticker}</span>
          <span className="mono-data text-xs text-on-surface-variant ml-2">{trade.quantity} 股</span>
        </div>
        <span className={`serif-heading text-xl ${isProfit ? 'text-primary-dark' : 'text-tertiary'}`}>
          {isProfit ? '▲' : '▼'} {formatPercent(unrealizedPnlPct)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
        <div>
          <div className="text-on-surface-variant">成本</div>
          <div className="mono-data font-semibold text-on-surface">{formatPrice(trade.entry_price)}</div>
        </div>
        <div>
          <div className="text-on-surface-variant">現價</div>
          <div className="mono-data font-semibold text-on-surface">{formatPrice(currentPrice)}</div>
        </div>
        <div>
          <div className="text-on-surface-variant">市值</div>
          <div className="mono-data font-semibold text-on-surface">{formatPrice(marketValue)}</div>
        </div>
      </div>

      <div className={`flex items-center justify-between text-xs`}>
        <span className={`mono-data font-semibold ${isProfit ? 'text-primary-dark' : 'text-tertiary'}`}>
          {isProfit ? '+' : ''}{formatPrice(unrealizedPnl)}
        </span>
        <span className="text-on-surface-variant">持有 {daysHeld} 天</span>
      </div>

      {/* TP/SL section */}
      {(trade.stop_loss || trade.take_profit) && (
        <div className="mt-3 pt-2 border-t border-border">
          {!editingTpSl ? (
            <>
              <div className="flex justify-between text-[10px] text-on-surface-variant mb-1">
                <span>止損 {trade.stop_loss ? formatPrice(trade.stop_loss) : '—'}</span>
                <button
                  onClick={() => { setEditSl(trade.stop_loss ?? 0); setEditTp(trade.take_profit ?? 0); setEditingTpSl(true) }}
                  className="text-secondary hover:underline"
                >
                  修改
                </button>
                <span>目標 {trade.take_profit ? formatPrice(trade.take_profit) : '—'}</span>
              </div>
              {trade.stop_loss && trade.take_profit && (
                <div className="h-2 rounded-full bg-surface overflow-hidden relative">
                  <div
                    className={`h-full rounded-full ${isProfit ? 'bg-primary' : 'bg-tertiary'} transition-all`}
                    style={{
                      width: `${Math.min(100, Math.max(0, ((currentPrice - trade.stop_loss) / (trade.take_profit - trade.stop_loss)) * 100))}%`
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-on-surface-variant">止損</label>
                  <input type="number" step="0.01" value={editSl || ''} onChange={e => setEditSl(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border border-border text-xs mono-data outline-none focus:border-primary" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-on-surface-variant">目標</label>
                  <input type="number" step="0.01" value={editTp || ''} onChange={e => setEditTp(Number(e.target.value))}
                    className="w-full px-2 py-1 rounded border border-border text-xs mono-data outline-none focus:border-primary" />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { updateTpSl.mutate({ tradeId: trade.id, stopLoss: editSl || null, takeProfit: editTp || null }); setEditingTpSl(false) }}
                  className="flex-1 py-1.5 rounded bg-primary text-white text-xs font-medium hover:opacity-90"
                >
                  儲存
                </button>
                <button onClick={() => setEditingTpSl(false)}
                  className="flex-1 py-1.5 rounded border border-border text-on-surface-variant text-xs hover:bg-surface"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {trade.ai_reasoning && (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="text-[10px] text-on-surface-variant flex items-center gap-1 mb-1">
            <span className="material-symbols-outlined text-xs">auto_awesome</span> AI 買入理由
          </div>
          <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-2">{trade.ai_reasoning}</p>
        </div>
      )}

      {/* Manual close */}
      <div className="mt-3 pt-2 border-t border-border">
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full py-2 rounded-lg border border-tertiary/30 text-tertiary text-xs font-medium hover:bg-tertiary-light transition-colors"
          >
            手動平倉
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => {
                manualClose.mutate(trade.id)
                setShowConfirm(false)
              }}
              disabled={manualClose.isPending}
              className="flex-1 py-2 rounded-lg bg-tertiary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {manualClose.isPending ? '平倉中...' : '確認平倉'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 py-2 rounded-lg border border-border text-on-surface-variant text-xs font-medium hover:bg-surface"
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Closed Trade Row ────────────────────────────────────────────────────────

function ClosedTradeRow({ trade }: { trade: SimTrade }) {
  const isWin = trade.pnl > 0
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 text-sm font-semibold text-on-surface">{trade.ticker}</td>
      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant">{formatPrice(trade.entry_price)}</td>
      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant">{formatPrice(trade.exit_price)}</td>
      <td className={`px-4 py-3 mono-data text-xs font-semibold text-right ${isWin ? 'text-primary-dark' : 'text-tertiary'}`}>
        {formatPercent(trade.pnl_percent)}
      </td>
      <td className={`px-4 py-3 mono-data text-xs font-semibold text-right ${isWin ? 'text-primary-dark' : 'text-tertiary'}`}>
        {isWin ? '+' : ''}{formatPrice(trade.pnl)}
      </td>
      <td className="px-4 py-3">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${trade.status === 'closed' ? 'bg-primary-light text-primary-dark' : 'bg-tertiary-light text-tertiary-dark'}`}>
          {trade.status === 'closed' ? '止盈' : '止損'}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-on-surface-variant">
        {trade.closed_at ? new Date(trade.closed_at).toLocaleDateString('zh-TW') : '—'}
      </td>
    </tr>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SimTradingPage() {
  const { data: portfolio, isLoading: portfolioLoading } = useSimPortfolio()
  const { data: openTrades = [] } = useSimTrades(portfolio?.id, 'open')
  const { data: closedTrades = [] } = useSimTrades(portfolio?.id)
  const closedOnly = closedTrades.filter(t => t.status === 'closed' || t.status === 'stopped')
  const { data: tradeLog = [] } = useTradeLog(portfolio?.id)

  const [tab, setTab] = useState<'holdings' | 'history' | 'rules' | 'log'>('holdings')

  if (portfolioLoading) {
    return <div className="flex items-center justify-center py-20 text-on-surface-variant text-sm">載入中...</div>
  }

  if (!portfolio) return <SetupView />

  const holdingsValue = openTrades.reduce((sum, t) => sum + (t.current_price ?? t.entry_price) * t.quantity, 0)
  const totalValue = portfolio.cash_balance + holdingsValue
  const totalPnl = totalValue - portfolio.initial_capital
  const totalPnlPct = (totalPnl / portfolio.initial_capital) * 100
  const winRate = (portfolio.winning_trades + portfolio.losing_trades) > 0
    ? (portfolio.winning_trades / (portfolio.winning_trades + portfolio.losing_trades)) * 100
    : 0

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="serif-heading text-[32px] md:text-[38px] text-on-surface">AI 模擬交易</h1>
          <p className="mt-1 text-[13px] text-on-surface-variant">
            全自動模式：AI 自主選股、買入、賣出
          </p>
        </div>
        <div className="flex items-center gap-2 bg-primary-light rounded-full px-3 py-1.5 border border-primary/20">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold text-primary-dark">自動運行中</span>
        </div>
      </div>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white border border-border rounded-xl p-4 editorial-shadow">
          <p className="text-xs text-on-surface-variant mb-1">總資產</p>
          <p className="serif-heading text-xl text-on-surface">{formatPrice(totalValue)}</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 editorial-shadow">
          <p className="text-xs text-on-surface-variant mb-1">總損益</p>
          <p className={`serif-heading text-xl ${totalPnl >= 0 ? 'text-primary-dark' : 'text-tertiary'}`}>
            {totalPnl >= 0 ? '+' : ''}{formatPrice(totalPnl)}
          </p>
          <p className={`mono-data text-[11px] ${totalPnl >= 0 ? 'text-primary' : 'text-tertiary'}`}>
            {formatPercent(totalPnlPct)}
          </p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 editorial-shadow">
          <p className="text-xs text-on-surface-variant mb-1">可用現金</p>
          <p className="serif-heading text-xl text-on-surface">{formatPrice(portfolio.cash_balance)}</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 editorial-shadow">
          <p className="text-xs text-on-surface-variant mb-1">持倉數</p>
          <p className="serif-heading text-xl text-on-surface">{openTrades.length}</p>
          <p className="text-[11px] text-on-surface-variant">/ 10 上限</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 editorial-shadow">
          <p className="text-xs text-on-surface-variant mb-1">勝率</p>
          <p className="serif-heading text-xl text-on-surface">{Math.round(winRate)}%</p>
          <p className="text-[11px] text-on-surface-variant">{portfolio.winning_trades}勝 {portfolio.losing_trades}負</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex gap-1 mb-6">
        {([
          { key: 'holdings' as const, label: '目前持倉', count: openTrades.length },
          { key: 'history' as const, label: '交易紀錄', count: closedOnly.length },
          { key: 'rules' as const, label: '交易規則', count: 0 },
          { key: 'log' as const, label: '交易日誌', count: tradeLog.length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'px-4 py-2.5 text-[13px] transition-colors relative',
              tab === t.key
                ? 'border-b-2 border-primary text-primary font-semibold -mb-px'
                : 'text-on-surface-variant hover:text-on-surface',
            ].join(' ')}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                tab === t.key ? 'bg-primary text-white' : 'bg-surface text-on-surface-variant'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Holdings Tab */}
      {tab === 'holdings' && (
        <>
          {openTrades.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <span className="material-symbols-outlined text-border" style={{ fontSize: 56 }}>smart_toy</span>
              <h3 className="serif-heading text-xl text-on-surface">AI 等待中</h3>
              <p className="text-sm text-on-surface-variant max-w-sm">
                AI 正在監控所有 TradingView 警報。當出現信心度 ≥ 65% 的買入訊號時，AI 會自動執行買入。
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-primary">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                等待下一個交易訊號...
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {openTrades.map(trade => (
                <HoldingCard key={trade.id} trade={trade} portfolioId={portfolio.id} />
              ))}
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <>
          {closedOnly.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <span className="material-symbols-outlined text-border" style={{ fontSize: 56 }}>history</span>
              <h3 className="serif-heading text-xl text-on-surface">尚無交易紀錄</h3>
              <p className="text-sm text-on-surface-variant">AI 完成買入賣出後，紀錄會自動出現在這裡</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border editorial-shadow overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="bg-surface border-b border-border">
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">股票</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">買入價</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">賣出價</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">報酬率</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">損益</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">類型</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">日期</th>
                  </tr>
                </thead>
                <tbody>
                  {closedOnly.map(trade => (
                    <ClosedTradeRow key={trade.id} trade={trade} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-border p-5 editorial-shadow">
            <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">shopping_cart</span>
              買入規則
            </h3>
            <div className="space-y-2">
              {[
                { rule: 'AI 建議為 BUY 且信心度 ≥ 65%', detail: '只有達到門檻的訊號才會觸發自動買入' },
                { rule: '每筆交易最多投入可用資金的 15%', detail: '信心度 ≥ 80% 分配 15%，70-79% 分配 12%，65-69% 分配 8%' },
                { rule: '同一股票不重複買入', detail: '已持有的股票不會再次買入' },
                { rule: '最多同時持有 10 支股票', detail: '達到上限後不再買入，直到有持倉被賣出' },
              ].map((item, i) => (
                <div key={i} className="flex gap-3 items-start py-2 border-b border-border last:border-0">
                  <span className="text-primary font-bold text-sm mt-0.5">{i + 1}</span>
                  <div>
                    <p className="text-sm text-on-surface font-medium">{item.rule}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-border p-5 editorial-shadow">
            <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary text-lg">sell</span>
              賣出規則
            </h3>
            <div className="space-y-2">
              {[
                { rule: '到達 AI 設定的目標價自動止盈', detail: '價格 ≥ 目標價時自動賣出，鎖定獲利' },
                { rule: '觸發 AI 設定的止損價自動止損', detail: '價格 ≤ 止損價時自動賣出，控制風險' },
                { rule: '持倉超過 30 天自動平倉', detail: '避免資金長期被鎖定在低動能股票' },
              ].map((item, i) => (
                <div key={i} className="flex gap-3 items-start py-2 border-b border-border last:border-0">
                  <span className="text-tertiary font-bold text-sm mt-0.5">{i + 1}</span>
                  <div>
                    <p className="text-sm text-on-surface font-medium">{item.rule}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-warning-light rounded-xl border border-warning/20 p-5">
            <h3 className="text-sm font-bold text-warning-dark mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">info</span>
              注意事項
            </h3>
            <p className="text-xs text-warning-dark/80 leading-relaxed">
              這是模擬交易，使用虛擬資金，不涉及真實金錢。目的是觀察 AI 的選股和操盤能力。價格每 30 秒自動更新一次，止盈/止損由 Vercel Cron 定期檢查執行。
            </p>
          </div>
        </div>
      )}

      {/* Log Tab */}
      {tab === 'log' && (
        <>
          {tradeLog.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <span className="material-symbols-outlined text-border" style={{ fontSize: 56 }}>receipt_long</span>
              <h3 className="serif-heading text-xl text-on-surface">尚無交易日誌</h3>
              <p className="text-sm text-on-surface-variant">AI 執行買賣操作後，所有紀錄會自動出現在這裡</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border editorial-shadow overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-surface border-b border-border">
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">時間</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">操作</th>
                    <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">股票</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">價格</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">數量</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">損益</th>
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">現金變化</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeLog.map((log: SimTradeLog) => (
                    <tr key={log.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant">
                        {new Date(log.created_at).toLocaleString('zh-TW')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${logActionBadge(log.action)}`}>
                          {logActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-on-surface">{log.ticker}</td>
                      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant text-right">{formatPrice(log.price)}</td>
                      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant text-right">{log.quantity ?? '—'}</td>
                      <td className={`px-4 py-3 mono-data text-xs font-semibold text-right ${
                        log.pnl != null ? (log.pnl > 0 ? 'text-primary-dark' : 'text-tertiary') : 'text-on-surface-variant'
                      }`}>
                        {log.pnl != null ? (log.pnl > 0 ? '+' : '') + formatPrice(log.pnl) : '—'}
                      </td>
                      <td className="px-4 py-3 mono-data text-xs text-on-surface-variant text-right">
                        {formatPrice(log.cash_before)} → {formatPrice(log.cash_after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
