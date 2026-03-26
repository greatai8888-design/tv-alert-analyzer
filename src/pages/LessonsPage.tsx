import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLessons } from '../hooks/useLessons'
import type { Lesson } from '../types'

const TAG_FILTERS = ['全部', 'RSI', 'MACD', '突破', '財報', '均線'] as const

type SortField = 'date' | 'relevance' | 'ticker'

const SORT_LABELS: Record<SortField, string> = {
  date: '日期',
  relevance: '相關性',
  ticker: '代碼',
}

const SORT_CYCLE: SortField[] = ['relevance', 'date', 'ticker']

// ─── helpers ──────────────────────────────────────────────────────────────────

function lessonStatusBadge(lessonType: string) {
  if (lessonType === 'failed_trade')
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-tertiary-light text-tertiary-dark border border-tertiary/20">失敗</span>
  if (lessonType === 'missed_signal')
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary-light text-secondary-dark border border-secondary/20">錯過</span>
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral/10 text-on-surface-variant border border-border">過期</span>
}

function lessonTypeBorderColor(lessonType: string): string {
  if (lessonType === 'failed_trade') return 'border-l-tertiary'
  if (lessonType === 'missed_signal') return 'border-l-secondary'
  return 'border-l-warning'
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, borderColor }: { label: string; value: string | number; borderColor: string }) {
  return (
    <div className={`bg-white border border-border border-l-4 ${borderColor} rounded-xl px-5 py-4`}>
      <p className="text-sm text-on-surface-variant mb-1">{label}</p>
      <p className="serif-heading text-[36px] leading-none text-on-surface">{value}</p>
    </div>
  )
}

function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <div className={`bg-white rounded-xl border border-border border-l-4 ${lessonTypeBorderColor(lesson.lesson_type)} editorial-shadow hover:scale-[1.01] transition-transform p-5 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="serif-heading text-[20px] leading-tight text-on-surface">
          {lesson.ticker}
        </span>
        {lessonStatusBadge(lesson.lesson_type)}
      </div>

      {/* Lesson text */}
      <p className="text-[13px] leading-relaxed text-on-surface line-clamp-3">
        {lesson.lesson_text}
      </p>

      {/* Key Takeaway */}
      {lesson.key_takeaway && (
        <div className="bg-warning-light border-l-[3px] border-warning rounded-r-lg px-3 py-2.5">
          <div className="flex items-center gap-1 mb-1">
            <span className="material-symbols-outlined text-warning-dark" style={{ fontSize: 14 }}>lightbulb</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-warning-dark">
              核心教訓
            </span>
          </div>
          <p className="text-[12px] text-warning-dark leading-relaxed">
            {lesson.key_takeaway}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border pt-3 mt-auto flex flex-col gap-2">
        {/* Tags + Relevance */}
        <div className="flex items-center justify-between gap-2">
          {lesson.tags && lesson.tags.length > 0 && lesson.tags.some(t => t.trim()) ? (
            <div className="flex flex-wrap gap-1.5">
              {lesson.tags.filter(t => t.trim()).map(tag => (
                <span
                  key={tag}
                  className="bg-surface text-on-surface-variant text-[10px] px-2 py-0.5 rounded-[10px] border border-border"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : <div />}

          {/* Inline relevance */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-16 h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${lesson.relevance_score}%`,
                  background: 'linear-gradient(90deg, #C26E3A, #D4A843)',
                }}
              />
            </div>
            <span className="mono-data text-[12px] font-semibold text-secondary">{lesson.relevance_score}%</span>
          </div>
        </div>

        {/* Date + times used */}
        <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
          <span className="mono-data">
            {new Date(lesson.created_at).toLocaleDateString('zh-TW')}
          </span>
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>repeat</span>
            <span className="mono-data">引用 {lesson.times_used} 次</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function LessonsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string>('全部')
  const [sortBy, setSortBy] = useState<SortField>('relevance')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  const { data: lessons = [], isLoading } = useLessons(activeTag === '全部' ? undefined : activeTag)

  // Stats
  const stats = useMemo(() => {
    const total = lessons.length
    const failed = lessons.filter(l => l.lesson_type === 'failed_trade').length
    const missed = lessons.filter(l => l.lesson_type === 'missed_signal').length
    const avgRelevance = total > 0
      ? Math.round(lessons.reduce((s, l) => s + l.relevance_score, 0) / total)
      : 0

    const tagCount = new Map<string, number>()
    for (const l of lessons) {
      for (const t of l.tags.filter(t => t.trim())) {
        tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
      }
    }
    const topTags = [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag, count]) => ({ tag, count }))

    return { total, failed, missed, avgRelevance, topTags }
  }, [lessons])

  // Filter + sort
  const filtered = useMemo(() => {
    let result = lessons
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(l =>
        l.ticker.toLowerCase().includes(q) ||
        l.lesson_text.toLowerCase().includes(q) ||
        l.key_takeaway.toLowerCase().includes(q) ||
        l.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    const sorted = [...result].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'date') cmp = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      else if (sortBy === 'relevance') cmp = b.relevance_score - a.relevance_score
      else if (sortBy === 'ticker') cmp = a.ticker.localeCompare(b.ticker)
      return sortOrder === 'asc' ? -cmp : cmp
    })
    return sorted
  }, [lessons, searchQuery, sortBy, sortOrder])

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="serif-heading text-[36px] md:text-[44px] leading-tight text-on-surface">交易教訓</h1>
        <p className="mt-2 text-[14px] text-on-surface-variant">從追蹤紀錄中學習，避免重複犯錯</p>
      </div>

      {/* Stats Bar */}
      {!isLoading && lessons.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="總教訓數" value={stats.total} borderColor="border-l-on-surface" />
          <StatCard label="失敗交易" value={stats.failed} borderColor="border-l-tertiary" />
          <StatCard label="錯過訊號" value={stats.missed} borderColor="border-l-secondary" />
          <StatCard label="平均相關性" value={`${stats.avgRelevance}%`} borderColor="border-l-info" />
        </div>
      )}

      {/* Top Tags */}
      {!isLoading && stats.topTags.length > 0 && (
        <div className="flex items-center gap-2 mb-6 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>local_offer</span>
          <span>常見主題：</span>
          {stats.topTags.map(({ tag, count }) => (
            <span key={tag} className="bg-secondary-light text-secondary-dark px-2.5 py-0.5 rounded-full border border-secondary/20 font-medium">
              {tag} ({count})
            </span>
          ))}
        </div>
      )}

      {/* Sticky Filter Bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-3 mb-6 pt-1">
        {/* Row 1: Tag pills + sort */}
        <div className="flex flex-wrap gap-2 items-center mb-3">
          {TAG_FILTERS.map(tag => {
            const isActive = activeTag === tag
            return (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={[
                  'flex-none px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-primary text-white'
                    : 'bg-surface text-on-surface-variant border border-border hover:border-primary hover:text-on-surface',
                ].join(' ')}
              >
                {tag}
              </button>
            )
          })}

          <div className="flex-1" />

          {/* Sort field cycle */}
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border border-border text-on-surface-variant hover:bg-surface transition-colors"
            onClick={() => {
              const idx = SORT_CYCLE.indexOf(sortBy)
              setSortBy(SORT_CYCLE[(idx + 1) % SORT_CYCLE.length])
            }}
          >
            {SORT_LABELS[sortBy]}
            <span
              className="material-symbols-outlined text-base transition-transform"
              style={{ transform: sortOrder === 'asc' ? 'rotate(180deg)' : 'none' }}
            >
              arrow_downward
            </span>
          </button>

          {/* Sort order toggle */}
          <button
            className="p-1.5 rounded-lg border border-border text-on-surface-variant hover:bg-surface transition-colors"
            onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
            title={sortOrder === 'desc' ? '降序' : '升序'}
          >
            <span
              className="material-symbols-outlined text-base transition-transform"
              style={{ transform: sortOrder === 'asc' ? 'rotate(180deg)' : 'none' }}
            >
              swap_vert
            </span>
          </button>
        </div>

        {/* Row 2: Search + count */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center flex-1 max-w-xs">
            <span className="material-symbols-outlined absolute left-2.5 text-on-surface-variant text-base pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋教訓..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-white text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors placeholder:text-on-surface-variant/50"
            />
          </div>

          {!isLoading && (
            <span className="mono-data text-[12px] text-on-surface-variant">
              {filtered.length} 條教訓
            </span>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-on-surface-variant text-sm gap-2">
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 20 }}>refresh</span>
          載入中...
        </div>
      )}

      {/* Lessons Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map(lesson => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-surface flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 40 }}>psychology</span>
          </div>
          <h2 className="serif-heading text-[24px] text-on-surface">尚無交易教訓</h2>
          <p className="text-[14px] text-on-surface-variant max-w-sm leading-relaxed">
            當你完成更多交易追蹤後，系統會自動分析並生成個人化的交易教訓，幫助你持續進步。
          </p>
          <Link
            to="/tracking"
            className="mt-2 px-5 py-2.5 rounded-lg bg-primary text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            前往交易追蹤
          </Link>
        </div>
      )}
    </div>
  )
}
