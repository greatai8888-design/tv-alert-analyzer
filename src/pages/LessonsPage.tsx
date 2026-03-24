import { useState, useMemo } from 'react'
import { useLessons } from '../hooks/useLessons'
import type { Lesson } from '../types'

const TAG_FILTERS = ['全部', 'RSI', 'MACD', '突破', '財報', '均線'] as const

function lessonStatusBadge(lessonType: string) {
  const lower = lessonType.toLowerCase()
  if (lower.includes('success') || lower === 'win') {
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary-light text-primary-dark border border-primary/20">成功</span>
  }
  if (lower.includes('fail') || lower === 'loss') {
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-tertiary-light text-tertiary-dark border border-tertiary/20">失敗</span>
  }
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral/10 text-on-surface-variant border border-border">過期</span>
}

function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <div className="bg-white rounded-[10px] border border-border shadow hover:border-secondary transition-colors p-4 flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <span className="mono-data text-[12px] font-bold bg-surface px-2.5 py-1 rounded text-on-surface">
          {lesson.ticker}
        </span>
        {lessonStatusBadge(lesson.lesson_type)}
      </div>

      {/* Lesson text */}
      <p className="text-[14px] leading-relaxed text-on-surface">
        {lesson.lesson_text}
      </p>

      {/* Key Takeaway */}
      {lesson.key_takeaway && (
        <div className="bg-warning-light border-l-[3px] border-warning rounded-r-lg px-3 py-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-warning-dark mb-1">
            核心教訓
          </div>
          <p className="text-[12px] text-warning-dark leading-relaxed">
            {lesson.key_takeaway}
          </p>
        </div>
      )}

      {/* Tags - only show if there are tags */}
      {lesson.tags && lesson.tags.length > 0 && lesson.tags.some(t => t.trim()) && (
        <div className="flex flex-wrap gap-2">
          {lesson.tags.filter(t => t.trim()).map(tag => (
            <span
              key={tag}
              className="bg-surface text-on-surface-variant text-[11px] px-2.5 py-0.5 rounded-[10px] border border-border"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Relevance score */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-on-surface-variant">相關性</span>
          <span className="font-bold text-secondary">{lesson.relevance_score}%</span>
        </div>
        <div className="relative h-1.5 rounded-full bg-surface overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${lesson.relevance_score}%`,
              background: 'linear-gradient(90deg, #C26E3A, #D4A843)',
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="pt-1 border-t border-border">
        <span className="mono-data text-[11px] text-on-surface-variant">
          {new Date(lesson.created_at).toLocaleDateString('zh-TW')}
        </span>
      </div>
    </div>
  )
}

export default function LessonsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string>('全部')

  const { data: lessons = [], isLoading } = useLessons(activeTag === '全部' ? undefined : activeTag)

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return lessons
    const q = searchQuery.toLowerCase()
    return lessons.filter(l =>
      l.ticker.toLowerCase().includes(q) ||
      l.lesson_text.toLowerCase().includes(q) ||
      l.key_takeaway.toLowerCase().includes(q) ||
      l.tags.some(t => t.toLowerCase().includes(q))
    )
  }, [lessons, searchQuery])

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="serif-heading text-[32px] md:text-[38px] text-on-surface">交易教訓</h1>
        <p className="mt-1 text-[13px] text-on-surface-variant">從追蹤紀錄中學習，避免重複犯錯</p>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-grow max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: 18 }}>
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜尋教訓..."
            className="w-full pl-9 pr-3 py-2 bg-surface rounded-xl border border-border text-[13px] text-on-surface outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/50"
          />
        </div>

        {/* Tag pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
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
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-on-surface-variant text-sm">載入中...</div>
        </div>
      )}

      {/* Lessons Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map(lesson => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <span className="material-symbols-outlined text-border" style={{ fontSize: 64 }}>
            school
          </span>
          <h2 className="serif-heading text-[22px] text-on-surface">尚無教訓</h2>
          <p className="text-sm text-on-surface-variant max-w-xs">
            完成更多追蹤交易後，系統將自動為你生成個人化的交易教訓。
          </p>
        </div>
      )}
    </div>
  )
}
