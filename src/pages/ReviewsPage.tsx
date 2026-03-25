import { useState } from 'react'
import { useStrategyReviews } from '../hooks/useStrategyReviews'
import type { StrategyReview } from '../hooks/useStrategyReviews'

function priorityBadge(priority: string) {
  switch (priority) {
    case 'high': return 'bg-tertiary-light text-tertiary-dark border border-tertiary/20'
    case 'medium': return 'bg-warning-light text-warning-dark border border-warning/20'
    case 'low': return 'bg-surface text-on-surface-variant border border-border'
    default: return 'bg-surface text-on-surface-variant border border-border'
  }
}

function priorityLabel(priority: string) {
  switch (priority) {
    case 'high': return '高'
    case 'medium': return '中'
    case 'low': return '低'
    default: return priority
  }
}

function StatCard({ label, value, borderColor }: { label: string; value: string | number; borderColor: string }) {
  return (
    <div className={`bg-white border border-border border-l-4 ${borderColor} rounded-xl px-5 py-4`}>
      <p className="text-sm text-on-surface-variant mb-1">{label}</p>
      <p className="serif-heading text-[36px] leading-none text-on-surface">{value}</p>
    </div>
  )
}

function ReviewCard({ review }: { review: StrategyReview }) {
  const [expanded, setExpanded] = useState(false)
  const start = new Date(review.review_period_start).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
  const end = new Date(review.review_period_end).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

  return (
    <div className="bg-white rounded-xl border border-border editorial-shadow">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-5 flex items-start justify-between gap-4"
      >
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="serif-heading text-lg text-on-surface">{start} — {end}</h3>
            <span className="mono-data text-[11px] text-on-surface-variant">{review.total_alerts} alerts</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-primary-light text-primary-dark border border-primary/20 font-medium">
              命中 {review.hits}
            </span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-tertiary-light text-tertiary-dark border border-tertiary/20 font-medium">
              誤判 {review.misses}
            </span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-secondary-light text-secondary-dark border border-secondary/20 font-medium">
              漏掉 {review.missed_opportunities}
            </span>
          </div>
          {/* AI analysis preview */}
          {review.ai_analysis && !expanded && (
            <p className="mt-3 text-[13px] text-on-surface-variant line-clamp-2">{review.ai_analysis}</p>
          )}
        </div>
        <span className="material-symbols-outlined text-on-surface-variant transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
          expand_more
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-border pt-4 space-y-5">
          {/* AI Analysis */}
          {review.ai_analysis && (
            <div>
              <h4 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>auto_awesome</span>
                AI 分析
              </h4>
              <p className="text-[13px] text-on-surface leading-relaxed whitespace-pre-line">{review.ai_analysis}</p>
            </div>
          )}

          {/* Recommendations */}
          {review.recommendations && review.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-warning" style={{ fontSize: 18 }}>lightbulb</span>
                改進建議
              </h4>
              <div className="space-y-2">
                {review.recommendations.map((rec, i) => (
                  <div key={i} className="bg-surface rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${priorityBadge(rec.priority)}`}>
                        {priorityLabel(rec.priority)}
                      </span>
                      <div>
                        <p className="text-[13px] text-on-surface font-medium">{rec.suggestion}</p>
                        <p className="text-[12px] text-on-surface-variant mt-1">{rec.reasoning}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missed Opportunities */}
          {review.top_missed && review.top_missed.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: 18 }}>trending_up</span>
                漏掉的機會
              </h4>
              <div className="bg-white rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead>
                    <tr className="bg-surface border-b border-border">
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">股票</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">7天漲幅</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">AI 原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.top_missed.map((m, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-semibold text-on-surface">{m.ticker}</td>
                        <td className="px-3 py-2 mono-data text-primary-dark text-right font-semibold">+{m.change_pct_7d}%</td>
                        <td className="px-3 py-2 text-xs text-on-surface-variant">{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top Misses */}
          {review.top_misses && review.top_misses.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 18 }}>trending_down</span>
                誤判的交易
              </h4>
              <div className="flex flex-wrap gap-2">
                {review.top_misses.map((m, i) => (
                  <div key={i} className="bg-tertiary-light rounded-lg px-3 py-2 border border-tertiary/20">
                    <span className="font-semibold text-sm text-on-surface">{m.ticker}</span>
                    <span className="mono-data text-xs text-tertiary ml-2">{m.change_pct_7d}%</span>
                    <span className="text-xs text-on-surface-variant ml-2">信心度 {m.ai_confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReviewsPage() {
  const { data: reviews = [], isLoading } = useStrategyReviews()
  const latest = reviews[0]

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="serif-heading text-[36px] md:text-[44px] leading-tight text-on-surface">策略檢討</h1>
        <p className="mt-2 text-[14px] text-on-surface-variant">AI 每週自動分析交易表現，找出盲點與改進方向</p>
      </div>

      {/* Latest Stats */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="總 Alert 數" value={latest.total_alerts} borderColor="border-l-on-surface" />
          <StatCard label="命中率" value={`${latest.hit_rate}%`} borderColor="border-l-primary" />
          <StatCard label="漏掉率" value={`${latest.missed_opportunity_rate}%`} borderColor="border-l-secondary" />
          <StatCard label="正確忽略" value={latest.correct_skips} borderColor="border-l-info" />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-on-surface-variant text-sm gap-2">
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 20 }}>refresh</span>
          載入中...
        </div>
      )}

      {/* Reviews List */}
      {!isLoading && reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map(review => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && reviews.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-surface flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 40 }}>assessment</span>
          </div>
          <h2 className="serif-heading text-[24px] text-on-surface">尚無策略檢討報告</h2>
          <p className="text-[14px] text-on-surface-variant max-w-sm leading-relaxed">
            每週日系統會自動分析所有 alert 的後續表現，並生成 AI 檢討報告。請等待第一份報告生成。
          </p>
        </div>
      )}
    </div>
  )
}
