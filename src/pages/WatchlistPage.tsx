import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

type Recommendation = 'BUY' | 'SELL' | 'HOLD' | string

interface TickerSummary {
  ticker: string
  lastAlertAt: string
  alertCount: number
  lastRecommendation: Recommendation | null
  isActive: boolean
}

function RecBadge({ rec }: { rec: Recommendation | null }) {
  if (!rec) return null
  const styles: Record<string, string> = {
    BUY: 'bg-[#6B7A2E]/10 text-[#6B7A2E] border border-[#6B7A2E]/30',
    SELL: 'bg-red-50 text-red-600 border border-red-200',
    HOLD: 'bg-amber-50 text-amber-600 border border-amber-200',
  }
  const cls = styles[rec] ?? 'bg-gray-100 text-gray-600 border border-gray-200'
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${cls}`}>
      {rec}
    </span>
  )
}

interface ToggleProps {
  active: boolean
  onChange: () => void
  disabled?: boolean
}

function Toggle({ active, onChange, disabled }: ToggleProps) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      aria-label={active ? 'Disable watchlist' : 'Enable watchlist'}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
        active ? 'bg-[#6B7A2E]' : 'bg-gray-300',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          active ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}

export default function WatchlistPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  // Fetch all alerts for this user (with analyses)
  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['watchlist-alerts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('alerts')
        .select('ticker, created_at, analyses(recommendation)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })

  // Fetch watchlist rows (for toggle state)
  const { data: watchlistRows } = useQuery({
    queryKey: ['watchlist-rows', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('watchlist')
        .select('ticker, notify_on_signal')
        .eq('user_id', user.id)
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })

  // Build a map: ticker → notify_on_signal
  const watchlistMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    if (watchlistRows) {
      for (const row of watchlistRows) {
        map[row.ticker] = row.notify_on_signal ?? true
      }
    }
    return map
  }, [watchlistRows])

  // Group alerts by ticker
  const tickerSummaries = useMemo((): TickerSummary[] => {
    if (!alertsData) return []
    const map: Record<string, { dates: string[]; recs: string[] }> = {}
    for (const alert of alertsData) {
      if (!map[alert.ticker]) map[alert.ticker] = { dates: [], recs: [] }
      map[alert.ticker].dates.push(alert.created_at)
      const analyses = (alert as any).analyses
      if (analyses && analyses.length > 0 && analyses[0].recommendation) {
        map[alert.ticker].recs.push(analyses[0].recommendation)
      }
    }
    return Object.entries(map).map(([ticker, { dates, recs }]) => ({
      ticker,
      lastAlertAt: dates[0], // already sorted desc
      alertCount: dates.length,
      lastRecommendation: recs[0] ?? null,
      isActive: watchlistMap[ticker] ?? true,
    }))
  }, [alertsData, watchlistMap])

  // Filtered by search
  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    if (!q) return tickerSummaries
    return tickerSummaries.filter((t) => t.ticker.includes(q))
  }, [tickerSummaries, search])

  // Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ ticker, newValue }: { ticker: string; newValue: boolean }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('watchlist').upsert(
        { user_id: user.id, ticker, notify_on_signal: newValue },
        { onConflict: 'user_id,ticker' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist-rows', user?.id] })
    },
  })

  return (
    <div className="p-4 pb-24 lg:pb-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="serif-heading text-2xl mb-1" style={{ color: '#2C2C2C' }}>
          Watchlist
        </h1>
        <p className="text-sm" style={{ color: '#6B7A2E' }}>
          {tickerSummaries.length} ticker{tickerSummaries.length !== 1 ? 's' : ''} tracked
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <span
          className="material-symbols-outlined text-[18px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: '#9CA3AF' }}
        >
          search
        </span>
        <input
          type="text"
          placeholder="Search ticker..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border outline-none transition-colors"
          style={{
            backgroundColor: '#FFFFFF',
            borderColor: '#D9D2C7',
            color: '#2C2C2C',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#6B7A2E')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#D9D2C7')}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-16" style={{ color: '#9CA3AF' }}>
          <span className="material-symbols-outlined text-[40px] block mb-2">hourglass_empty</span>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#9CA3AF' }}>
          <span className="material-symbols-outlined text-[40px] block mb-2">manage_search</span>
          {search ? 'No matching tickers' : 'No alerts yet'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.ticker}
              className="bg-white rounded-xl border border-border editorial-shadow p-4 flex items-center gap-4"
              style={{ borderColor: '#D9D2C7' }}
            >
              {/* Ticker name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="mono-data text-lg font-bold tracking-wide"
                    style={{ color: '#2C2C2C' }}
                  >
                    {item.ticker}
                  </span>
                  <RecBadge rec={item.lastRecommendation} />
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: '#9CA3AF' }}>
                  <span>{timeAgo(item.lastAlertAt)}</span>
                  <span>·</span>
                  <span>{item.alertCount} alert{item.alertCount !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Toggle */}
              <Toggle
                active={item.isActive}
                disabled={toggleMutation.isPending}
                onChange={() =>
                  toggleMutation.mutate({ ticker: item.ticker, newValue: !item.isActive })
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
