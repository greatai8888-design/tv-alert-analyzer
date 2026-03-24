import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { TradingStats } from '../types'

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: trades, error } = await supabase
        .from('tracked_trades')
        .select('*')
        .limit(1000)

      if (error) throw error

      const all = trades || []
      const tracking = all.filter(t => t.status === 'tracking')
      const success = all.filter(t => t.status === 'success')
      const failed = all.filter(t => t.status === 'failed')
      const expired = all.filter(t => t.status === 'expired')
      const resolved = [...success, ...failed, ...expired]

      const winRate = resolved.length > 0 ? (success.length / resolved.length) * 100 : 0
      const totalPnl = resolved.reduce((sum, t) => sum + (t.pnl_percent || 0), 0)
      const avgPnl = resolved.length > 0 ? totalPnl / resolved.length : 0

      return {
        total: all.length,
        tracking: tracking.length,
        success: success.length,
        failed: failed.length,
        expired: expired.length,
        winRate: Math.round(winRate * 100) / 100,
        avgPnl: Math.round(avgPnl * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
      } as TradingStats
    },
  })
}
