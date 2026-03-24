import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFavorites, useRemoveFavorite } from '../hooks/useFavorites'
import { recommendationBgColor } from '../lib/utils'
import type { Favorite } from '../types'

function FavoriteCard({ fav, onRemove }: { fav: Favorite; onRemove: (alertId: string) => void }) {
  const [note, setNote] = useState(fav.note ?? '')
  const alert = fav.alert
  const analysis = alert?.analyses?.[0]

  const confidence = analysis?.confidence ?? null
  const recommendation = analysis?.recommendation ?? 'HOLD'

  const favoriteDate = new Date(fav.created_at).toLocaleDateString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\//g, '/')

  return (
    <div className="bg-white rounded-[10px] border border-border shadow-sm flex flex-col md:flex-row gap-4 p-4">
      {/* Left column */}
      <div className="min-w-[100px] flex flex-col gap-2">
        <Link
          to={`/alerts/${fav.alert_id}`}
          className="serif-heading text-[20px] text-on-surface hover:text-primary transition-colors"
        >
          {alert?.ticker ?? '—'}
        </Link>
        <span className={`self-start text-[11px] font-medium px-2.5 py-0.5 rounded-full ${recommendationBgColor(recommendation)}`}>
          {recommendation}
        </span>
        {confidence != null && (
          <div className="flex flex-col gap-1 mt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-on-surface-variant">信心</span>
              <span className="mono-data text-[12px] font-bold text-on-surface">{confidence}%</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Middle column */}
      <div className="flex-grow flex flex-col gap-2">
        <span className="text-[12px] text-on-surface-variant">收藏於 {favoriteDate}</span>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="新增備註..."
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-on-surface resize-none outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/50"
        />
      </div>

      {/* Right column */}
      <div className="min-w-[110px] flex flex-col gap-2">
        <Link
          to={`/alerts/${fav.alert_id}`}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-info-light text-info-dark text-[12px] font-medium hover:opacity-80 transition-opacity"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
          查看分析
        </Link>
        <Link
          to={`/tracking`}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary-light text-primary-dark text-[12px] font-medium hover:opacity-80 transition-opacity"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
          開始追蹤
        </Link>
        <button
          onClick={() => onRemove(fav.alert_id)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-transparent text-tertiary text-[12px] font-medium hover:bg-tertiary-light transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
          取消收藏
        </button>
      </div>
    </div>
  )
}

export default function FavoritesPage() {
  const { data: favorites = [], isLoading } = useFavorites()
  const removeFavorite = useRemoveFavorite()

  const handleRemove = (alertId: string) => {
    removeFavorite.mutate(alertId)
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <h1 className="serif-heading text-[32px] md:text-[38px] text-on-surface">收藏清單</h1>
        {favorites.length > 0 && (
          <span className="bg-secondary text-white text-[12px] font-medium px-2.5 py-0.5 rounded-full">
            {favorites.length}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-on-surface-variant text-sm">載入中...</div>
        </div>
      )}

      {/* Favorites List */}
      {!isLoading && favorites.length > 0 && (
        <div className="flex flex-col gap-6">
          {favorites.map(fav => (
            <FavoriteCard key={fav.id} fav={fav} onRemove={handleRemove} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && favorites.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <span className="material-symbols-outlined text-border" style={{ fontSize: 64 }}>
            star
          </span>
          <h2 className="serif-heading text-[22px] text-on-surface">尚無收藏</h2>
          <p className="text-sm text-on-surface-variant max-w-xs">
            在 Alerts 頁面中，點擊星號圖示即可將訊號加入收藏清單。
          </p>
          <Link
            to="/alerts"
            className="mt-2 px-5 py-2.5 rounded-lg bg-primary text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            前往 Alerts
          </Link>
        </div>
      )}
    </div>
  )
}
